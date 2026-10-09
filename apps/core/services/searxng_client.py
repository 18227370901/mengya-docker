# -*- coding: utf-8 -*-
"""SearXNG 私有化搜索引擎客户端

为系统健康中心、食谱推荐、商品智能评测及知识问答提供统一、安全、低延迟的元搜索能力。
特性：
1. 原生 JSON 响应解析 (format=json)
2. 权威医学健康信源定向过滤 (site: 白名单机制)
3. 自动超时控制 (默认 4.0s) 与 1 次快速重试
4. 垃圾过滤与 HTML 标签安全清洗
5. 网络断连/服务未启动等异常全静默平滑降级 (返回空列表，不抛异常)
"""

import html
import os
import re
import urllib.parse
from typing import Any, Dict, List, Optional
import requests
from django.conf import settings

# 权威医学与健康站点白名单
DEFAULT_HEALTH_DOMAINS = [
    "nhc.gov.cn",
    "chinanutri.cn",
    "cndiet.cn",
    "dxy.com",
    "haodf.com",
    "familydoctor.com.cn",
    "cdc.gov.cn",
]

# 垃圾或不相关站点黑名单过滤词
GARBAGE_KEYWORDS = ["博彩", "棋牌", "菠菜", "兼职", "刷单", "代孕", "私家侦探"]


def _clean_text(text: str) -> str:
    """清洗 HTML 实体及标签"""
    if not text:
        return ""
    # 去除 HTML 标签
    cleaned = re.sub(r"<[^>]+>", "", text)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _extract_domain(url: str) -> str:
    """从 URL 中提取主域名"""
    try:
        parsed = urllib.parse.urlparse(url)
        netloc = parsed.netloc.lower()
        if ":" in netloc:
            netloc = netloc.split(":")[0]
        return netloc
    except Exception:
        return ""


class SearXNGClient:
    """SearXNG 客户端单例与工具方法"""

    @classmethod
    def get_base_url(cls) -> str:
        url = getattr(settings, "SEARXNG_BASE_URL", None) or os.getenv("SEARXNG_BASE_URL", "")
        if not url:
            url = "http://127.0.0.1:8888"
        return url.strip().rstrip("/")

    @classmethod
    def get_timeout(cls) -> float:
        val = getattr(settings, "SEARXNG_TIMEOUT", None) or os.getenv("SEARXNG_TIMEOUT", "4.0")
        try:
            return float(val)
        except (ValueError, TypeError):
            return 4.0

    @classmethod
    def get_health_domains(cls) -> List[str]:
        raw = getattr(settings, "SEARXNG_HEALTH_DOMAINS", None) or os.getenv("SEARXNG_HEALTH_DOMAINS", "")
        if raw and isinstance(raw, str):
            domains = [d.strip().lower() for d in raw.split(",") if d.strip()]
            if domains:
                return domains
        return DEFAULT_HEALTH_DOMAINS

    @classmethod
    def is_available(cls) -> bool:
        """快速探测 SearXNG 是否可达"""
        base_url = cls.get_base_url()
        if not base_url:
            return False
        try:
            resp = requests.get(f"{base_url}/healthz", timeout=1.0)
            if resp.status_code < 400:
                return True
        except Exception:
            pass
        try:
            resp = requests.get(base_url, timeout=1.0)
            return resp.status_code < 400
        except Exception:
            return False

    @classmethod
    def search(
        cls,
        query: str,
        max_results: int = 5,
        categories: str = "general",
        language: str = "zh-CN",
        engines: str = "",
        health_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """执行 SearXNG 搜索并返回规范化列表 (带超时容灾降级)"""
        base_url = cls.get_base_url()
        if not base_url:
            return []

        clean_query = query.strip()
        if not clean_query:
            return []

        health_domains = cls.get_health_domains()
        if health_only and health_domains:
            # 拼接权威站点限制
            top_domains = health_domains[:4]
            site_clauses = " OR ".join([f"site:{d}" for d in top_domains])
            clean_query = f"{clean_query} ({site_clauses})"

        params = {
            "q": clean_query,
            "format": "json",
            "language": language or "zh-CN",
            "categories": categories or "general",
            "safesearch": "1",
        }
        if engines:
            params["engines"] = engines

        timeout = cls.get_timeout()
        search_endpoint = f"{base_url}/search"

        results = []
        for attempt in range(2):
            try:
                resp = requests.get(search_endpoint, params=params, timeout=timeout)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_items = data.get("results", [])
                    for item in raw_items:
                        title = _clean_text(item.get("title", ""))
                        content = _clean_text(item.get("content", ""))
                        href = item.get("url", "").strip()
                        engine = item.get("engine", "searxng")
                        domain = _extract_domain(href)

                        if not title or len(title) < 2 or not href:
                            continue

                        # 垃圾内容过滤
                        if any(bad_word in title or bad_word in content for bad_word in GARBAGE_KEYWORDS):
                            continue

                        results.append({
                            "title": title,
                            "body": content,
                            "href": href,
                            "engine": f"SearXNG ({engine})" if engine else "SearXNG",
                            "source_domain": domain,
                            "publishedDate": item.get("publishedDate"),
                        })
                        if len(results) >= max_results:
                            break
                    if results:
                        return results
            except Exception:
                # 首次超时或网络异常，若为初次则快速重试一次
                if attempt == 0:
                    continue
                break
        return results

    @classmethod
    def search_health(cls, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """优先权威医学与健康渠道的专属搜索方法，权威结果不足时自动降级补充"""
        results = cls.search(query, max_results=max_results, health_only=True)
        if len(results) < max_results:
            fallback_results = cls.search(query, max_results=max_results * 2, health_only=False)
            seen_hrefs = {item["href"] for item in results}
            for candidate in fallback_results:
                if candidate["href"] not in seen_hrefs:
                    results.append(candidate)
                    seen_hrefs.add(candidate["href"])
                if len(results) >= max_results:
                    break
        return results[:max_results]
