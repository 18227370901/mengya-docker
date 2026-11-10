# -*- coding: utf-8 -*-
"""
daily_saying_service.py — 每日一言服务（支持多端点自适应故障转移、协议兼容解析与进程级缓存）
"""
import json
import logging
import threading
import time
import requests

logger = logging.getLogger(__name__)

# 进程级缓存：全站共享 1 小时 (3600 秒)
_SAYING_CACHE = {
    "payload": None,
    "expires_at": 0,
}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL = 3600


def parse_saying_payload(raw_text: str = "", json_obj=None) -> dict:
    """通用一言/名句响应自适应解析引擎：
    - 兼容 Hitokoto (hitokoto, from, from_who)
    - 兼容 UApis / 通用聚合 API (text, content, saying)
    - 兼容 今日诗词 / 韩小韩 (data.content / content, origin/author)
    - 兼容 英文 Quotable / 句子 API (quote, author)
    - 兼容 纯文本 text/plain
    返回 {'text': str, 'source': str}
    """
    if json_obj is None and raw_text:
        try:
            json_obj = json.loads(raw_text)
        except Exception:
            pass

    text = ""
    source = ""

    if isinstance(json_obj, dict):
        inner = json_obj.get("data") or json_obj.get("result") or json_obj
        if not isinstance(inner, dict):
            if isinstance(inner, str):
                text = inner.strip()
            inner = json_obj

        # 候选文本字段
        candidates = ["hitokoto", "text", "content", "saying", "sentence", "quote", "msg", "word"]
        for k in candidates:
            val = inner.get(k)
            if isinstance(val, str) and val.strip():
                text = val.strip()
                break

        # 候选来源字段
        src_candidates = ["from", "origin", "source", "from_who", "author", "creator"]
        for sk in src_candidates:
            sval = inner.get(sk)
            if isinstance(sval, str) and sval.strip():
                source = sval.strip()
                break

        # 若命中多项出处（如 Hitokoto 出处与作者），智能拼接
        if inner.get("from_who") and inner.get("from") and inner.get("from_who") != inner.get("from"):
            source = f"{inner['from_who']} · 《{inner['from']}》"
        elif inner.get("from"):
            source = f"《{inner['from']}》"
        elif inner.get("author"):
            source = str(inner["author"])

    elif isinstance(json_obj, list) and json_obj:
        item = json_obj[0]
        if isinstance(item, dict):
            return parse_saying_payload("", json_obj=item)
        elif isinstance(item, str) and item.strip():
            text = item.strip()
    elif isinstance(json_obj, str) and json_obj.strip():
        text = json_obj.strip()
    elif raw_text and isinstance(raw_text, str) and raw_text.strip():
        text = raw_text.strip()

    return {"text": text, "source": source}


def _http_get(url, timeout=5, headers=None, auth_type="none", auth_key="", auth_value=""):
    """安全双通道请求（兼顾直连与宿主机系统代理）"""
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
    }
    if headers:
        req_headers.update(headers)

    params = {}
    if auth_value:
        if auth_type == "bearer":
            req_headers["Authorization"] = f"Bearer {auth_value}"
        elif auth_type == "header" and auth_key:
            req_headers[auth_key] = auth_value
        elif auth_type == "query" and auth_key:
            params[auth_key] = auth_value

    try:
        with requests.Session() as s:
            s.trust_env = False
            return s.get(url, params=params, timeout=timeout, headers=req_headers)
    except Exception:
        pass

    with requests.Session() as s:
        s.trust_env = True
        return s.get(url, params=params, timeout=timeout, headers=req_headers)


def get_daily_saying(force: bool = False) -> dict | None:
    """每日一言获取（支持故障转移与进程级缓存）：
    - 优先读取 external_api_config 中 saying 组的启用端点列表；
    - 成功返回 {'text': str, 'source': str, 'provider': str}；
    - force=True 强制跳过缓存刷新名言。
    """
    now = time.time()
    with _CACHE_LOCK:
        if not force and _SAYING_CACHE["payload"] and _SAYING_CACHE["expires_at"] > now:
            return _SAYING_CACHE["payload"]

    from apps.core.services import service_config

    endpoints = [ep for ep in service_config.get_endpoints("saying") if ep.get("enabled")]
    timeout = service_config.get_timeout("saying") or 5
    retries = service_config.get_retries("saying") or 1

    if not endpoints:
        return None

    # 多轮重试 + 端点按顺序故障转移
    for _ in range(max(1, retries + 1)):
        for ep in endpoints:
            url = str(ep.get("url") or "").strip()
            if not url:
                continue

            auth_type = str(ep.get("auth_type", "none") or "none").strip()
            auth_key = str(ep.get("auth_key", "") or "").strip()
            auth_value = str(ep.get("auth_value", "") or "").strip()
            provider_name = str(ep.get("name") or "").strip() or url

            try:
                resp = _http_get(
                    url,
                    timeout=timeout,
                    auth_type=auth_type,
                    auth_key=auth_key,
                    auth_value=auth_value,
                )
                if resp.status_code == 200:
                    raw_text = resp.text
                    json_obj = None
                    try:
                        json_obj = resp.json()
                    except Exception:
                        pass

                    parsed = parse_saying_payload(raw_text, json_obj=json_obj)
                    if parsed.get("text"):
                        result = {
                            "text": parsed["text"],
                            "source": parsed.get("source") or "",
                            "provider": provider_name,
                        }
                        with _CACHE_LOCK:
                            _SAYING_CACHE["payload"] = result
                            _SAYING_CACHE["expires_at"] = time.time() + _CACHE_TTL
                        return result
            except Exception as e:
                logger.warning("拉取每日一言端点 [%s] 失败: %s", url, e)

    # 全部端点失败时，若有旧缓存则回退旧缓存，否则返回内置温暖兜底一言
    with _CACHE_LOCK:
        if _SAYING_CACHE["payload"]:
            return _SAYING_CACHE["payload"]

    fallback = {
        "text": "生命是一场奇妙的旅程，每一天都有新的奇迹在悄然绽放。",
        "source": "萌芽温暖伴行",
        "provider": "内置默认语录",
    }
    with _CACHE_LOCK:
        _SAYING_CACHE["payload"] = fallback
        _SAYING_CACHE["expires_at"] = time.time() + _CACHE_TTL
    return fallback


def clear_saying_cache():
    """清理一言缓存（配置更新或重置默认时调用）"""
    with _CACHE_LOCK:
        _SAYING_CACHE["payload"] = None
        _SAYING_CACHE["expires_at"] = 0
