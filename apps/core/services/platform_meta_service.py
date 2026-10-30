# -*- coding: utf-8 -*-
"""
三方平台接入元数据安全解析服务 (Platform Metadata Fetcher)
- 严格防御 SSRF：协议限制 (http/https)、DNS 解析全 IP 校验 (禁止内网/回环/云厂商元数据/组播/保留地址)
- 循环受控重定向 (最大 2 跳，每一跳均做 SSRF 校验)
- 流式防 OOM (上限 512KB) 与 Content-Type 限制 (仅处理 HTML)
- 标准库 HTMLParser 提取 title、og:title、description、favicon/og:image
- 相对 URL 自动补全为绝对 URL
- 优雅降级机制
"""

import ipaddress
import socket
import urllib.parse
from html.parser import HTMLParser
import requests
import re


# 默认限制
MAX_REDIRECTS = 2
MAX_BODY_BYTES = 512 * 1024  # 512 KB
CONNECT_TIMEOUT = 5.0
READ_TIMEOUT = 7.0
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Sec-Ch-Ua": '"Chromium";v="126", "Not/A)Brand";v="8", "Google Chrome";v="126"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

# 扩展保留/云厂商特定私网
EXTRA_BLOCKED_NETWORKS = [
    ipaddress.ip_network("100.64.0.0/10"),     # 运营商 CGNAT / 共享地址
    ipaddress.ip_network("100.100.0.0/16"),    # 阿里云内网 DNS/元数据常见网段
]


def is_ip_safe(ip_str: str) -> tuple[bool, str]:
    """校验单 IP 地址是否安全（非内网/回环/保留/元数据地址）"""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False, f"无效的 IP 地址: {ip_str}"

    if ip.is_loopback:
        return False, "禁止访问回环地址 (127.0.0.0/8 或 ::1)"
    if ip.is_private:
        return False, f"禁止访问局域网私有地址 ({ip_str})"
    if ip.is_link_local:
        return False, "禁止访问链路本地或云元数据地址 (169.254.0.0/16)"
    if ip.is_multicast:
        return False, "禁止访问组播地址"
    if ip.is_reserved:
        return False, "禁止访问 IETF 保留地址"
    if ip.is_unspecified:
        return False, "禁止访问未指定地址 (0.0.0.0 或 ::)"

    for net in EXTRA_BLOCKED_NETWORKS:
        if ip in net:
            return False, f"禁止访问受保护内部网段 ({net})"

    return True, ""


def validate_safe_url(url: str) -> tuple[bool, str, str]:
    """
    对目标 URL 进行严格的协议与 DNS SSRF 安全验证
    返回: (is_safe, error_message, hostname)
    """
    if not url or not isinstance(url, str):
        return False, "URL 不能为空", ""

    parsed = urllib.parse.urlsplit(url.strip())
    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"仅支持 HTTP 或 HTTPS 协议，禁止协议: {parsed.scheme}", ""

    hostname = parsed.hostname
    if not hostname:
        return False, "无法从 URL 中解析出有效的主机名", ""

    # 1. 如果主机名直接是 IP 字面量（如 127.0.0.1、::1），先直接做 IP 黑名单校验
    try:
        ipaddress.ip_address(hostname)
        # 是合法 IP 字面量，进行安全性判定
        is_safe, reason = is_ip_safe(hostname)
        if not is_safe:
            return False, reason, hostname
    except ValueError:
        # 非 IP 字面量（为标准域名，如 cn.bing.com），跳过，进入后续 DNS 完整解析校验
        pass

    # 2. DNS 域名解析
    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    try:
        addr_info = socket.getaddrinfo(hostname, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as e:
        return False, f"域名解析失败: {str(e)}", hostname

    if not addr_info:
        return False, "未解析到任何有效 IP 地址", hostname

    for item in addr_info:
        sockaddr = item[4]
        ip_str = sockaddr[0]
        is_safe, reason = is_ip_safe(ip_str)
        if not is_safe:
            return False, f"域名解析包含高危或内网 IP ({ip_str}): {reason}", hostname

    return True, "", hostname


class MetaHTMLParser(HTMLParser):
    """提取网页元数据解析器"""

    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url
        self.in_title = False
        self.title = ""
        self.og_title = ""
        self.description = ""
        self.og_description = ""
        self.favicon = ""
        self.apple_touch_icon = ""
        self.og_image = ""

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        attr_dict = {k.lower(): v for k, v in attrs if v is not None}

        if tag_lower == "title":
            self.in_title = True
        elif tag_lower == "meta":
            prop = attr_dict.get("property", "").lower()
            name = attr_dict.get("name", "").lower()
            content = attr_dict.get("content", "").strip()

            if not content:
                return

            if prop == "og:title" or name == "twitter:title":
                if not self.og_title:
                    self.og_title = content
            elif name == "description" or prop == "description":
                if not self.description:
                    self.description = content
            elif prop == "og:description" or name == "twitter:description":
                if not self.og_description:
                    self.og_description = content
            elif prop == "og:image" or name == "twitter:image":
                if not self.og_image:
                    self.og_image = urllib.parse.urljoin(self.base_url, content)

        elif tag_lower == "link":
            rel = attr_dict.get("rel", "").lower()
            href = attr_dict.get("href", "").strip()
            if not href:
                return

            abs_href = urllib.parse.urljoin(self.base_url, href)
            if "icon" in rel:
                if "apple-touch-icon" in rel:
                    if not self.apple_touch_icon:
                        self.apple_touch_icon = abs_href
                else:
                    if not self.favicon:
                        self.favicon = abs_href

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data




def detect_html_encoding(content_bytes: bytes, response_encoding: str = None) -> str:
    sample = bytes(content_bytes[:4096])
    charset_match = re.search(rb'<meta[^>]+charset=[\x22\x27]?([a-zA-Z0-9_\-]+)', sample, re.IGNORECASE)
    if charset_match:
        declared = charset_match.group(1).decode("ascii", errors="ignore").lower().strip()
        if declared in ("gb2312", "gbk", "gb18030"):
            return "gb18030"
        if declared in ("utf-8", "utf8"):
            return "utf-8"
        if declared in ("big5", "shift_jis", "euc-jp", "iso-8859-1", "windows-1252"):
            return declared
    http_equiv_match = re.search(rb'content=[\x22\x27][^\x22\x27]*charset=([a-zA-Z0-9_\-]+)', sample, re.IGNORECASE)
    if http_equiv_match:
        declared = http_equiv_match.group(1).decode("ascii", errors="ignore").lower().strip()
        if declared in ("gb2312", "gbk", "gb18030"):
            return "gb18030"
        if declared in ("utf-8", "utf8"):
            return "utf-8"
        if declared:
            return declared
    if response_encoding and response_encoding.lower() not in ("iso-8859-1", "ascii"):
        return response_encoding
    try:
        content_bytes.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        pass
    try:
        content_bytes.decode("gb18030")
        return "gb18030"
    except UnicodeDecodeError:
        pass
    return "utf-8"


def infer_name_from_domain(url: str) -> str:
    """从 URL 主机名智能派生平台名称"""
    try:
        parsed = urllib.parse.urlsplit(url)
        host = (parsed.hostname or "").lower()
        parts = host.split(".")
        if len(parts) >= 2:
            main_part = parts[-2]
            if main_part in ("com", "org", "net", "gov", "edu", "co", "cn", "com-cn") and len(parts) >= 3:
                main_part = parts[-3]
            return main_part.capitalize()
        return host.capitalize() or "三方平台"
    except Exception:
        return "三方平台"


def fetch_platform_metadata(url: str) -> dict:
    """
    一键获取三方平台元数据核心方法
    返回格式:
    {
        "success": bool,
        "name": str,
        "description": str,
        "logo_url": str,
        "url": str,
        "message": str
    }
    """
    target_url = url.strip() if url else ""
    if not target_url.startswith("http://") and not target_url.startswith("https://"):
        target_url = "https://" + target_url

    session = requests.Session()
    current_url = target_url
    response = None

    try:
        # 手动控制重定向跳转，每一跳强制做 SSRF 校验
        for step in range(MAX_REDIRECTS + 1):
            is_safe, error_msg, _ = validate_safe_url(current_url)
            if not is_safe:
                return {
                    "success": False,
                    "name": "",
                    "description": "",
                    "logo_url": "",
                    "url": current_url,
                    "message": f"安全策略拦截: {error_msg}",
                }

            inferred_fallback_name = infer_name_from_domain(current_url)
            fallback_ico = urllib.parse.urljoin(current_url, "/favicon.ico")

            try:
                response = session.get(
                    current_url,
                    headers=BROWSER_HEADERS,
                    timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                    stream=True,
                    allow_redirects=False,
                    verify=True,
                )
            except requests.exceptions.SSLError:
                return {
                    "success": True,
                    "name": inferred_fallback_name,
                    "description": "",
                    "logo_url": fallback_ico,
                    "url": current_url,
                    "message": "目标网站 SSL/TLS 证书校验未通过，已由域名生成基础配置，请核对保存",
                }
            except requests.exceptions.Timeout:
                return {
                    "success": True,
                    "name": inferred_fallback_name,
                    "description": "",
                    "logo_url": fallback_ico,
                    "url": current_url,
                    "message": "目标网站响应较慢或受限，已自动由域名提取基础配置，请核对保存",
                }
            except requests.exceptions.RequestException as e:
                return {
                    "success": True,
                    "name": inferred_fallback_name,
                    "description": "",
                    "logo_url": fallback_ico,
                    "url": current_url,
                    "message": f"连接受限，已由域名生成基础配置: {inferred_fallback_name}",
                }

            # 处理 301, 302, 303, 307, 308 重定向
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("Location")
                if not location:
                    break
                next_url = urllib.parse.urljoin(current_url, location)
                current_url = next_url
                continue

            break

        inferred_fallback_name = infer_name_from_domain(current_url)
        fallback_ico = urllib.parse.urljoin(current_url, "/favicon.ico")

        if response is None:
            return {
                "success": True,
                "name": inferred_fallback_name,
                "description": "",
                "logo_url": fallback_ico,
                "url": target_url,
                "message": "已自动由域名推导生成基础配置",
            }

        if response.status_code >= 400:
            return {
                "success": True,
                "name": inferred_fallback_name,
                "description": "",
                "logo_url": fallback_ico,
                "url": current_url,
                "message": f"目标网站启用了安全防爬网闸(HTTP {response.status_code})，已自动由域名提取基础配置，请核对保存",
            }

        # 检查 Content-Type
        content_type = response.headers.get("Content-Type", "").lower()
        if content_type and "text" not in content_type and "html" not in content_type and "xml" not in content_type:
            return {
                "success": False,
                "name": "",
                "description": "",
                "logo_url": "",
                "url": current_url,
                "message": f"目标地址返回非网页内容 ({content_type})，请确认输入的 URL 正确",
            }

        # 流式读取内容，防止大文件 OOM
        content_bytes = bytearray()
        for chunk in response.iter_content(chunk_size=4096):
            if chunk:
                content_bytes.extend(chunk)
                if len(content_bytes) >= MAX_BODY_BYTES:
                    break

        # 编码检测与解码
        encoding = detect_html_encoding(content_bytes, response.encoding)
        try:
            html_text = content_bytes.decode(encoding, errors="replace")
        except Exception:
            html_text = content_bytes.decode("utf-8", errors="replace")

        # HTML 解析
        parser = MetaHTMLParser(base_url=current_url)
        try:
            parser.feed(html_text)
        except Exception:
            pass

        final_name = (parser.og_title or parser.title or "").strip()
        final_desc = (parser.og_description or parser.description or "").strip()
        final_logo = parser.apple_touch_icon or parser.favicon or parser.og_image or ""

        # 挑战页/反爬标题自愈替换（如 Cloudflare 盾返回的 Just a moment...）
        challenge_titles = {"just a moment...", "attention required! | cloudflare", "security check", "cloudflare", "403 forbidden", "access denied"}
        if not final_name or final_name.lower() in challenge_titles:
            final_name = infer_name_from_domain(current_url)

        # 若仍未找到 favicon，使用根路径 fallback
        if not final_logo:
            fallback_ico = urllib.parse.urljoin(current_url, "/favicon.ico")
            final_logo = fallback_ico

        return {
            "success": True,
            "name": final_name,
            "description": final_desc,
            "logo_url": final_logo,
            "url": current_url,
            "message": "获取成功",
        }

    except Exception as e:
        return {
            "success": False,
            "name": "",
            "description": "",
            "logo_url": "",
            "url": target_url,
            "message": f"解析异常: {str(e)}",
        }
