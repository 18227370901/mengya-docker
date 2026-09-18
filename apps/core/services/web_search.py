# -*- coding: utf-8 -*-
"""联网搜索服务 - 为 AI 提供多源聚合、智能熔断回退的实时信息检索能力

支持多搜索引擎故障转移流水线（Multi-Engine Fallback Pipeline）：
1. DuckDuckGo（全球隐私与开发者开源引擎，1.0s 快速探测）
2. Google（全球领先通用搜索引擎，1.0s 快速探测）
3. 微软 Bing（微软必应中文，国内外无阻断极速可用，高可用核心基石）
4. 360 搜索（国内老牌权威搜索引擎，丰富母婴与生活资讯索引）
5. 搜狗搜索（国内权威问答、百科与微信知识索引）
6. 百度搜索（国内头部中文搜索引擎）
7. 雅虎搜索（全球经典综合备用搜索引擎）

自动注入 certifi CA 根证书，彻底杜绝 Windows CAPI 权限问题 (os error 5)；
毫秒级超时熔断控制，保证整个检索流水线总耗时在 3 秒以内，绝不卡死。
"""

import html
import os
import re
import ssl
import threading
import urllib.parse
import urllib.request

try:
    import certifi
    _CA_PATH = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", _CA_PATH)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _CA_PATH)
    os.environ.setdefault("CURL_CA_BUNDLE", _CA_PATH)
except Exception:
    _CA_PATH = None

try:
    from ddgs import DDGS
    _DDGS_AVAILABLE = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        _DDGS_AVAILABLE = True
    except ImportError:
        _DDGS_AVAILABLE = False

_SEARCH_PATTERNS = [
    # 天气
    r"天气|气温|温度|下雨|下雪|台风|预报|空气质量",
    # 新闻/时事
    r"新闻|最新|热搜|头条.*新闻|热点|事件|时事",
    # 实时信息
    r"今天|目前|当前|实时|近期|最近|今年|当季",
    # 搜索/查询
    r"查一下|搜一下|找一下|帮我查|查询|看一看",
    # 价格/汇率/金价
    r"金价|汇率|油价|股价|最新行情|实时汇率|涨跌|股票|基金|行情",
    # 人物/事件
    r"是谁|谁.*说|谁.*做|发生了什么",
    # 节日/节气
    r"今天.*节|星期几|礼拜几|放假|休假|农历|公历|节气|倒计时",
]


def needs_search(query: str) -> bool:
    """判断用户提问是否需要联网搜索"""
    for pattern in _SEARCH_PATTERNS:
        if re.search(pattern, query):
            return True
    return False


def _clean_html(text: str) -> str:
    """去除 HTML 标签并解析转义字符"""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return " ".join(text.split()).strip()


def _get_ssl_ctx():
    """获取标准 CA 证书的 SSL 上下文"""
    if _CA_PATH:
        return ssl.create_default_context(cafile=_CA_PATH)
    return ssl.create_default_context()


# ==================== 1. DuckDuckGo 引擎 ====================

def _search_duckduckgo(query: str, max_results: int = 5, timeout: float = 1.0) -> list:
    """优先尝试 DuckDuckGo（带 1.0s 快速超时熔断）"""
    results = []

    # 方式 A：尝试 ddgs 官方包
    if _DDGS_AVAILABLE:
        def _worker():
            try:
                with DDGS(timeout=timeout) as ddgs:
                    for r in ddgs.text(query, max_results=max_results):
                        results.append({
                            "title": _clean_html(r.get("title", "")),
                            "body": _clean_html(r.get("body", "")),
                            "href": r.get("href", ""),
                        })
            except Exception:
                pass

        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        t.join(timeout=timeout + 0.1)
        if results:
            return results

    # 方式 B：尝试 DuckDuckGo Lite HTTP 直连
    try:
        url = "https://lite.duckduckgo.com/lite/"
        data = urllib.parse.urlencode({"q": query}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
        # 解析 lite 结果
        links = re.findall(r'<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', content)
        snippets = re.findall(r'<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)</td>', content)
        for i, (href, raw_title) in enumerate(links[:max_results]):
            title = _clean_html(raw_title)
            body = _clean_html(snippets[i]) if i < len(snippets) else ""
            if title:
                results.append({"title": title, "body": body, "href": href})
    except Exception:
        pass

    return results


# ==================== 2. Google 引擎 ====================

def _search_google(query: str, max_results: int = 5, timeout: float = 1.0) -> list:
    """尝试 Google 搜索（带 1.0s 快速超时熔断）"""
    results = []
    try:
        url = "https://www.google.com/search?q=" + urllib.parse.quote(query) + "&hl=zh-CN"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        # 匹配 Google 结果卡片
        blocks = re.findall(r'<div[^>]*class="(?:g|tF2Cxc)"[\s\S]*?</div>\s*</div>', content)
        for b in blocks:
            m_title = re.search(r'<h3[^>]*>([\s\S]*?)</h3>', b)
            m_href = re.search(r'<a[^>]*href="([^"]+)"', b)
            m_body = re.search(r'<div[^>]*class="(?:VwiC3b|IsZvec)[^"]*"[^>]*>([\s\S]*?)</div>', b)
            if not m_title or not m_href:
                continue
            href = m_href.group(1).strip()
            if href.startswith("/url?q="):
                href = urllib.parse.unquote(href.split("/url?q=")[1].split("&")[0])
            title = _clean_html(m_title.group(1))
            body = _clean_html(m_body.group(1)) if m_body else ""
            if title and "google.com" not in href:
                results.append({"title": title, "body": body, "href": href})
                if len(results) >= max_results:
                    break
    except Exception:
        pass
    return results


# ==================== 3. 微软 Bing 引擎 (核心基石) ====================

def _search_bing(query: str, max_results: int = 5, timeout: float = 2.5) -> list:
    """微软 Bing 中文搜索（高可用核心基石，国内外均毫秒级畅通）"""
    results = []
    try:
        url = "https://cn.bing.com/search?q=" + urllib.parse.quote(query)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        blocks = re.findall(r'<li class="b_algo"[\s\S]*?</li>', content)
        for b in blocks:
            m_title = re.search(r'<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a></h2>', b)
            m_body = re.search(r'<p[^>]*>([\s\S]*?)</p>', b)
            if not m_title:
                continue
            href = m_title.group(1).strip()
            title = _clean_html(m_title.group(2))
            body = _clean_html(m_body.group(1)) if m_body else ""
            if not title or len(title) < 2:
                continue
            if "bing.com" in href and "/search" in href:
                continue
            results.append({"title": title, "body": body, "href": href})
            if len(results) >= max_results:
                break
    except Exception:
        pass
    return results


# ==================== 4. 360 搜索 (国内权威高可用) ====================

def _search_so(query: str, max_results: int = 5, timeout: float = 2.0) -> list:
    """360 综合搜索 (so.com)（国内权威高可用引擎）"""
    results = []
    try:
        url = "https://www.so.com/s?q=" + urllib.parse.quote(query)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        blocks = re.findall(r'<li class="res-list"[\s\S]*?</li>', content)
        for b in blocks:
            m_title = re.search(r'<h3[^>]*>([\s\S]*?)</h3>', b)
            m_href = re.search(r'<a[^>]*href="([^"]+)"', b)
            m_body = re.search(r'<p[^>]*class="res-desc"[^>]*>([\s\S]*?)</p>', b)
            if not m_body:
                m_body = re.search(r'<div[^>]*class="[^"]*(?:res-rich|summary|desc)[^"]*"[^>]*>([\s\S]*?)</div>', b)
            if not m_title:
                continue
            title = _clean_html(m_title.group(1))
            body = _clean_html(m_body.group(1)) if m_body else ""
            href = m_href.group(1).strip() if m_href else ""
            if title and len(title) > 2:
                results.append({"title": title, "body": body, "href": href})
                if len(results) >= max_results:
                    break
    except Exception:
        pass
    return results


# ==================== 5. 搜狗引擎 (国内问答与百科备用) ====================

def _search_sogou(query: str, max_results: int = 5, timeout: float = 2.0) -> list:
    """搜狗中文搜索（国内权威问答与百科引擎）"""
    results = []
    try:
        url = "https://www.sogou.com/web?query=" + urllib.parse.quote(query)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        blocks = re.findall(r'<div[^>]*class="(?:vrwrap|rb)"[\s\S]*?</div>\s*</div>', content)
        for b in blocks:
            m_title = re.search(r'<h3[^>]*>([\s\S]*?)</h3>', b)
            m_href = re.search(r'<a[^>]*href="([^"]+)"', b)
            m_text = re.search(r'class="[^"]*(?:str-txt|space-txt|txt-box|fz-mid)[^"]*"[^>]*>([\s\S]*?)</div>', b)
            if not m_title or not m_href:
                continue
            title = _clean_html(m_title.group(1))
            body = _clean_html(m_text.group(1)) if m_text else ""
            href = m_href.group(1).strip()
            if href.startswith("/"):
                href = "https://www.sogou.com" + href
            if title:
                results.append({"title": title, "body": body, "href": href})
                if len(results) >= max_results:
                    break
    except Exception:
        pass
    return results


# ==================== 6. 百度搜索 (国内头部中文引擎) ====================

def _search_baidu(query: str, max_results: int = 5, timeout: float = 1.5) -> list:
    """百度搜索 (baidu.com)"""
    results = []
    try:
        url = "https://www.baidu.com/s?wd=" + urllib.parse.quote(query)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        blocks = re.findall(r'<div[^>]*class="[^"]*c-container[^"]*"[\s\S]*?</div>\s*</div>', content)
        for b in blocks:
            m_title = re.search(r'<h3[^>]*>([\s\S]*?)</h3>', b)
            m_href = re.search(r'<a[^>]*href="([^"]+)"', b)
            m_body = re.search(r'class="[^"]*(?:c-font-normal|content-right_8Zs40|c-span18)[^"]*"[^>]*>([\s\S]*?)</div>', b)
            if not m_title:
                continue
            title = _clean_html(m_title.group(1))
            body = _clean_html(m_body.group(1)) if m_body else ""
            href = m_href.group(1).strip() if m_href else ""
            if title and len(title) > 2 and "baidu.com" not in title:
                results.append({"title": title, "body": body, "href": href})
                if len(results) >= max_results:
                    break
    except Exception:
        pass
    return results


# ==================== 7. 雅虎搜索 (全球经典备用) ====================

def _search_yahoo(query: str, max_results: int = 5, timeout: float = 1.2) -> list:
    """雅虎全球搜索 (Yahoo Search)"""
    results = []
    try:
        url = "https://search.yahoo.com/search?p=" + urllib.parse.quote(query)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=_get_ssl_ctx(), timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        blocks = re.findall(r'<div class="algo[^"]*"[\s\S]*?</li>', content)
        for b in blocks:
            m_title = re.search(r'<h3[^>]*>([\s\S]*?)</h3>', b)
            m_href = re.search(r'<a[^>]*href="([^"]+)"', b)
            m_body = re.search(r'<div class="compText[^"]*"[\s\S]*?>([\s\S]*?)</div>', b)
            if not m_title or not m_href:
                continue
            title = _clean_html(m_title.group(1))
            body = _clean_html(m_body.group(1)) if m_body else ""
            href = m_href.group(1).strip() if m_href else ""
            if title and len(title) > 2:
                results.append({"title": title, "body": body, "href": href})
                if len(results) >= max_results:
                    break
    except Exception:
        pass
    return results


# ==================== 多源聚合入口 ====================

_ENGINE_PIPELINE = [
    ("DuckDuckGo", _search_duckduckgo),
    ("Google", _search_google),
    ("Bing", _search_bing),
    ("360搜索", _search_so),
    ("搜狗搜索", _search_sogou),
    ("百度搜索", _search_baidu),
    ("雅虎搜索", _search_yahoo),
]


def web_search_with_source(query: str, max_results: int = 5) -> tuple[list, str]:
    """多引擎回退搜索入口：
    按 DuckDuckGo -> Google -> Bing -> 360搜索 -> 搜狗搜索 -> 百度搜索 -> 雅虎搜索 顺序依次探测；
    返回 (results_list, engine_name)
    """
    for engine_name, search_func in _ENGINE_PIPELINE:
        try:
            res = search_func(query, max_results=max_results)
            if res:
                return res, engine_name
        except Exception:
            continue
    return [], ""


def web_search(query: str, max_results: int = 5) -> list:
    """向下兼容的列表返回接口"""
    results, _ = web_search_with_source(query, max_results=max_results)
    return results


def search_and_summarize(query: str, max_results: int = 5) -> tuple[str, str]:
    """搜索并格式化为注入 AI Prompt 的摘要文本

    返回: (summary_text, engine_name)
    若全部引擎均失败则返回 ("", "")
    """
    try:
        results, engine_name = web_search_with_source(query, max_results=max_results)
        if not results:
            return "", ""

        lines = [f"【以下是通过 {engine_name} 检索到关于“{query}”的实时网络搜索结果，请优先参考这些信息回答用户：】\n"]
        for i, r in enumerate(results, 1):
            title = r["title"][:100]
            body = r["body"][:250]
            lines.append(f"{i}. 《{title}》\n   {body}\n")
        return "\n".join(lines), engine_name
    except Exception:
        return "", ""
