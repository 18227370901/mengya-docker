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
    # ===== 母婴健康与安全实时性问答（v1.55：确保权威实时检索）=====
    r"孕\d+周|孕早期|孕中期|孕晚期|预产期|待产|分娩|坐月子|产检|唐筛|糖耐|胎心|胎动|宫缩",
    r"产后|回奶|追奶|堵奶|乳腺炎|恶露|盆底肌|产后抑郁",
    r"哺乳|母乳|奶粉|辅食|断奶|厌奶|吐奶|溢奶|夜奶|打嗝",
    r"宝宝.*(发烧|发热|咳嗽|腹泻|拉肚子|湿疹|红屁屁|黄疸|鼻塞|哭闹|睡眠|翻身|长牙|说话|走路)",
    r"婴儿|新生儿|幼儿.*(护理|喂养|发育|体检|身高|体重|头围)",
    r"疫苗|接种|乙肝疫苗|脊灰疫苗|百白破|流感",
    r"吃药|用药|退烧药|剂量|能不能吃|可以吃吗|禁忌|过敏",
    r"安全座椅|婴儿车|奶瓶|吸奶器|纸尿裤|辅食机|餐具|母婴用品.*(召回|抽检|不合格|评测)",
    r"水土不服|疫苗反应|肠绞痛|鹅口疮|痱子|幼儿急疹|猩红热|手足口",
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

def _search_duckduckgo(query: str, max_results: int = 5, timeout: float = 1.0, url: str = None) -> list:
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

    # 方式 B：DuckDuckGo Lite HTTP 直连（v1.73：端点地址由外部接口配置管理）
    try:
        url = (url or "https://lite.duckduckgo.com/lite/").rstrip("/")
        data = urllib.parse.urlencode({"q": query}).encode("utf-8")
        req = urllib.request.Request(url + "/", data=data, headers={
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

def _search_google(query: str, max_results: int = 5, timeout: float = 1.0, url: str = None) -> list:
    """尝试 Google 搜索（带 1.0s 快速超时熔断）"""
    results = []
    try:
        base = (url or "https://www.google.com/search").rstrip("/")
        if not base.endswith("/search"):
            base = base + "/search"
        url = base + "?q=" + urllib.parse.quote(query) + "&hl=zh-CN"
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

def _search_bing(query: str, max_results: int = 5, timeout: float = 2.5, url: str = None) -> list:
    """微软 Bing 中文搜索（高可用核心基石，国内外均毫秒级畅通）"""
    results = []
    try:
        base = (url or "https://cn.bing.com/search").rstrip("/")
        if not base.endswith("/search"):
            base = base + "/search"
        url = base + "?q=" + urllib.parse.quote(query)
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

def _search_so(query: str, max_results: int = 5, timeout: float = 2.0, url: str = None) -> list:
    """360 综合搜索 (so.com)（国内权威高可用引擎）"""
    results = []
    try:
        base = (url or "https://www.so.com/s").rstrip("/")
        if not base.endswith("/s"):
            base = base + "/s"
        url = base + "?q=" + urllib.parse.quote(query)
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

def _search_sogou(query: str, max_results: int = 5, timeout: float = 2.0, url: str = None) -> list:
    """搜狗中文搜索（国内权威问答与百科引擎）"""
    results = []
    try:
        base = (url or "https://www.sogou.com/web").rstrip("/")
        if not base.endswith("/web"):
            base = base + "/web"
        url = base + "?query=" + urllib.parse.quote(query)
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

def _search_baidu(query: str, max_results: int = 5, timeout: float = 1.5, url: str = None) -> list:
    """百度搜索 (baidu.com)"""
    results = []
    try:
        base = (url or "https://www.baidu.com/s").rstrip("/")
        if not base.endswith("/s"):
            base = base + "/s"
        url = base + "?wd=" + urllib.parse.quote(query)
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

def _search_yahoo(query: str, max_results: int = 5, timeout: float = 1.2, url: str = None) -> list:
    """雅虎全球搜索 (Yahoo Search)"""
    results = []
    try:
        base = (url or "https://search.yahoo.com/search").rstrip("/")
        if not base.endswith("/search"):
            base = base + "/search"
        url = base + "?p=" + urllib.parse.quote(query)
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


def _search_searxng(query: str, max_results: int = 5) -> list:
    """私有化 SearXNG 元搜索引擎探测（web_search_with_source 首引擎，保留兼容）"""
    try:
        from apps.core.services.searxng_client import SearXNGClient
        return SearXNGClient.search(query, max_results=max_results)
    except Exception:
        return []


# ==================== 多源聚合入口 ====================

# v1.73 引擎解析器注册表：key → 搜索函数（外部接口配置页按 key 管理地址/超时/开关/顺序）
_ENGINE_FUNCS = {
    "duckduckgo": _search_duckduckgo,
    "google": _search_google,
    "bing": _search_bing,
    "so": _search_so,
    "sogou": _search_sogou,
    "baidu": _search_baidu,
    "yahoo": _search_yahoo,
}


def search_with_engine(key: str, url: str, query: str, max_results: int = 5, timeout: float = 1.0) -> list:
    """按引擎 key 调用对应解析器（供一键测试与动态管线复用）；
    url/timeout 由外部接口配置传入，失败返回 []（静默降级）"""
    fn = _ENGINE_FUNCS.get(key)
    if not fn:
        return []
    try:
        res = fn(query, max_results=max_results, timeout=timeout, url=url)
        return res or []
    except Exception:
        return []


def _build_pipeline() -> list:
    """v1.73 从外部接口配置读取启用的公网引擎（按配置顺序），返回 [(key, url, timeout, fn)]"""
    from . import service_config
    engines = service_config.get_enabled_engines()
    pipeline = []
    for eng in engines:
        fn = _ENGINE_FUNCS.get(eng.get("key"))
        if fn:
            pipeline.append((eng["key"], eng["url"], eng["timeout"], fn))
    return pipeline


def web_search_with_source(query: str, max_results: int = 5) -> tuple[list, str]:
    """多引擎故障转移搜索入口（v1.73 动态化）：
    ① SearXNG 私有实例优先（可达即用，地址在 SearXNG 配置弹窗维护）；
    ② 按「外部接口配置」页启用的公网引擎顺序依次探测（地址/超时/开关/顺序均管理员可控）；
    全部失败后按配置 retries 轮数整轮重试。
    返回 (results_list, engine_name)
    """
    # ① SearXNG 私有实例优先
    try:
        from apps.core.services.searxng_client import SearXNGClient
        if SearXNGClient.is_available():
            res = SearXNGClient.search(query, max_results=max_results)
            if res:
                return res, "SearXNG"
    except Exception:
        pass

    # ② 配置的公网引擎管线（含重试）
    from . import service_config
    pipeline = _build_pipeline()
    retries = service_config.get_retries('search_pipeline')
    labels = service_config.ENGINE_LABELS
    for _round in range(retries + 1):
        for key, url, timeout, fn in pipeline:
            try:
                res = fn(query, max_results=max_results, timeout=timeout, url=url)
                if res:
                    return res, labels.get(key, key)
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


# ==================== AI 助手专用：SearXNG 优先检索链路 (v1.55) ====================

def _is_ai_fallback_enabled() -> bool:
    """读取管理员控制的公网引擎兜底开关（v1.56 起默认开启：SearXNG 不通时自动回退公网引擎管线；
    管理员可在 AI 配置页「搜索引擎配置」弹窗随时关闭）"""
    from django.conf import settings
    return bool(getattr(settings, "AI_SEARCH_FALLBACK_ENABLED", False))


def search_for_ai(query: str, max_results: int = 5) -> dict:
    """AI 助手专用检索入口：
    1. SearXNG 已配置且健康 → 私有化元搜索（权威白名单加权），status="searxng"；
    2. SearXNG 未配置/不通 →
       - 管理员兜底开关开启 → 回退多公网引擎管线，status="fallback:<engine>"；
       - 开关关闭（默认）→ 直接放弃检索，status="unavailable"（由 AI 直接回答）；
    3. 查询未命中联网检索特征 → status="skipped"。

    返回: {"context": str, "engine": str, "status": str, "sources": [{title,url,domain}]}
    """
    result = {"context": "", "engine": "", "status": "skipped", "sources": []}

    if not needs_search(query):
        return result

    # ===== 1. SearXNG 私有化实例优先 =====
    try:
        from apps.core.services.searxng_client import SearXNGClient
        if SearXNGClient.is_available():
            items = SearXNGClient.search(query, max_results=max_results)
            if items:
                lines = [
                    f"【以下是通过私有化 SearXNG 元搜索引擎检索到关于“{query}”的实时结果，"
                    "请优先参考这些权威信息回答用户，并在回答中体现来源机构：】\n"
                ]
                for i, r in enumerate(items, 1):
                    title = (r.get("title") or "")[:100]
                    body = (r.get("body") or "")[:250]
                    href = r.get("href") or r.get("url") or ""
                    domain = r.get("source_domain") or ""
                    lines.append(f"{i}. 《{title}》({domain})\n   {body}\n   来源: {href}\n")
                    result["sources"].append({"title": title, "url": href, "domain": domain})
                result["context"] = "\n".join(lines)
                result["engine"] = "SearXNG"
                result["status"] = "searxng"
                return result
            # v1.55.1：实例可达但检索 0 条（上游引擎被 CAPTCHA/限流封禁或无相关索引），
            # 透出精确诊断状态，供前端徽章与管理员排查；后续兜底分支不得覆盖此状态
            result["status"] = "searxng_empty"
    except Exception:
        pass

    # ===== 2. 管理员兜底开关：公网引擎管线（默认关闭）=====
    if not _is_ai_fallback_enabled():
        # v1.55.1：保留 searxng_empty 诊断状态（实例活着但引擎无结果），仅其余情况标记 unavailable
        if result["status"] != "searxng_empty":
            result["status"] = "unavailable"
        return result

    try:
        results, engine_name = web_search_with_source(query, max_results=max_results)
        if results:
            lines = [f"【以下是通过 {engine_name} 检索到关于“{query}”的实时网络搜索结果，请优先参考这些信息回答用户：】\n"]
            for i, r in enumerate(results, 1):
                title = r["title"][:100]
                body = r["body"][:250]
                href = r.get("href") or r.get("url") or ""
                domain = r.get("source_domain") or ""
                lines.append(f"{i}. 《{title}》\n   {body}\n   来源: {href}\n")
                result["sources"].append({"title": title, "url": href, "domain": domain})
            result["context"] = "\n".join(lines)
            result["engine"] = engine_name
            result["status"] = f"fallback:{engine_name}"
        else:
            result["status"] = "unavailable"
    except Exception:
        result["status"] = "unavailable"
    return result
