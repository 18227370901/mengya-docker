# -*- coding: utf-8 -*-
"""
SearXNG 私有化搜索引擎客户端
为系统各模块提供统一、安全、低延迟、自动容灾的元搜索能力。
集成快速熔断 (Fast-Fail) 机制，服务离线时毫秒级安全降级。
"""
import html
import logging
import os
import re
import urllib.parse
from typing import Any, Dict, List, Optional
import requests

logger = logging.getLogger(__name__)

DEFAULT_HEALTH_DOMAINS = [
    "nhc.gov.cn",
    "cndiet.cn",
    "chinanutri.cn",
    "dxy.com",
    "haodf.com",
    "familydoctor.com.cn",
    "cdc.gov.cn",
]


def _clean_text(text: str) -> str:
    """清洗 HTML 实体及标签"""
    if not text:
        return ""
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


def _get_setting(key: str, default: Any = None) -> Any:
    """安全读取 Django Settings 或环境变量"""
    try:
        from django.conf import settings
        if hasattr(settings, key):
            val = getattr(settings, key)
            if val is not None and val != "":
                return val
    except Exception:
        pass
    return os.getenv(key, default)


class SearXNGClient:
    """SearXNG 私有化元搜索引擎客户端"""

    _last_probe_status: Optional[bool] = None
    _last_probe_time: float = 0.0

    @classmethod
    def get_base_url(cls) -> str:
        url = _get_setting("SEARXNG_BASE_URL", "http://127.0.0.1:8888")
        if not url:
            url = "http://127.0.0.1:8888"
        return str(url).strip().rstrip("/")

    @classmethod
    def get_timeout(cls) -> float:
        val = _get_setting("SEARXNG_TIMEOUT", "4.0")
        try:
            return float(val)
        except (ValueError, TypeError):
            return 4.0

    @classmethod
    def get_health_domains(cls) -> List[str]:
        raw = _get_setting("SEARXNG_HEALTH_DOMAINS", "")
        if raw and isinstance(raw, str):
            domains = [domain.strip().lower() for domain in raw.split(",") if domain.strip()]
            if domains:
                return domains
        return DEFAULT_HEALTH_DOMAINS

    @classmethod
    def is_available(cls) -> bool:
        """快速探测 SearXNG 是否可达（超时 0.5s，快速熔断）"""
        base_url = cls.get_base_url()
        if not base_url:
            return False
        try:
            resp = requests.get(f"{base_url}/healthz", timeout=0.5)
            if resp.status_code < 400:
                return True
        except Exception:
            pass
        try:
            resp = requests.get(base_url, timeout=0.5)
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
        """执行 SearXNG 搜索并返回规范化列表"""
        base_url = cls.get_base_url()
        if not base_url:
            return []

        clean_query = query.strip()
        health_domains = cls.get_health_domains()
        if health_only:
            site_clauses = " OR ".join([f"site:{domain}" for domain in health_domains[:4]])
            clean_query = f"{clean_query} ({site_clauses})"

        params = {
            "q": clean_query,
            "format": "json",
            "language": language or "zh-CN",
            "categories": categories or "general",
            "safesearch": "1",
        }
        # v1.55.1 修复：未显式指定引擎时回退管理员配置的 SEARXNG_ENGINES，
        # 使「指定检索源引擎」配置真正在 AI 助手/健康/食谱检索链路中生效
        if not engines:
            engines = cls.get_engines()
        if engines:
            params["engines"] = engines

        timeout = cls.get_timeout()
        search_endpoint = f"{base_url}/search"

        results = []
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

                    # 过滤违规及垃圾词
                    if any(bad in title for bad in ["博彩", "棋牌", "菠菜", "兼职", "刷单", "高利贷"]):
                        continue

                    results.append({
                        "title": title,
                        "body": content[:220],
                        "href": href,
                        "engine": f"SearXNG ({engine})" if engine else "SearXNG",
                        "source_domain": domain,
                        "publishedDate": item.get("publishedDate"),
                    })
                    if len(results) >= max_results:
                        break
        except requests.exceptions.ConnectionError:
            # 连接拒绝，说明服务未开启，快速熔断退出，杜绝重试阻塞
            logger.info("SearXNG 服务未连接 (%s)，安全降级", base_url)
        except requests.exceptions.Timeout:
            logger.warning("SearXNG 请求超时 (%.1fs)，安全降级", timeout)
        except Exception as err:
            logger.warning("SearXNG 请求异常: %s，安全降级", err)

        return results

    @classmethod
    def search_health(cls, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """优先权威医学健康渠道搜索；离线时毫秒级安全降级"""
        # 先快速探测一次基础连通性，若未连通则直接返回空列表，毫秒级降级
        if not cls.is_available():
            return []

        res = cls.search(query, max_results=max_results, health_only=True)
        if len(res) < max_results:
            general_res = cls.search(query, max_results=max_results * 2, health_only=False)
            seen_hrefs = {item["href"] for item in res}
            for item in general_res:
                if item["href"] not in seen_hrefs:
                    res.append(item)
                    seen_hrefs.add(item["href"])
                if len(res) >= max_results:
                    break
        return res[:max_results]

    @classmethod
    def get_format(cls) -> str:
        val = _get_setting("SEARXNG_FORMAT", "json")
        return str(val or "json").strip()

    @classmethod
    def get_engines(cls) -> str:
        val = _get_setting("SEARXNG_ENGINES", "")
        return str(val or "").strip()

    @classmethod
    def get_config_dict(cls) -> dict:
        base_url = cls.get_base_url()
        return {
            "base_url": base_url,
            "timeout": cls.get_timeout(),
            "format": cls.get_format(),
            "engines": cls.get_engines(),
            "health_domains": ",".join(cls.get_health_domains()),
            "health_domain_list": cls.get_health_domains(),
            "is_available": cls.is_available(),
            # AI 助手公网引擎兜底开关（管理员可控，默认关闭）；兼容 settings 布尔与 env 字符串两种来源
            "ai_fallback_enabled": _get_setting("AI_SEARCH_FALLBACK_ENABLED", False) in (True, "True", "true", "1", 1),
        }

    @classmethod
    def test_connection(
        cls,
        base_url: str = None,
        timeout: float = None,
        engines: str = None,
        health_domains: str = None,
    ) -> dict:
        """v1.55.1 增强诊断：两跳测试（通用检索验证引擎可用性 + 权威健康白名单通道），
        区分「实例不可达」「实例可达但上游引擎被封禁/限流」「检索正常」三类状态，
        并透出 SearXNG 返回的 unresponsive 引擎清单供管理员排查。"""
        import time
        target_url = (base_url or cls.get_base_url()).rstrip("/")
        req_timeout = float(timeout) if timeout is not None else cls.get_timeout()
        req_engines = engines if engines is not None else cls.get_engines()

        def _do_search(query: str) -> dict:
            """单次检索探针：返回 {ok, status_code, count, titles, unresponsive, error}"""
            params = {
                "q": query,
                "format": "json",
                "language": "zh-CN",
                "categories": "general",
                "safesearch": "1",
            }
            if req_engines:
                params["engines"] = req_engines
            try:
                resp = requests.get(f"{target_url}/search", params=params, timeout=req_timeout)
                if resp.status_code != 200:
                    return {"ok": False, "status_code": resp.status_code, "count": 0, "titles": [], "unresponsive": [], "error": f"HTTP {resp.status_code}"}
                data = resp.json()
                items = data.get("results", [])
                unresponsive = [entry[0] for entry in (data.get("unresponsive_engines", []) or []) if isinstance(entry, (list, tuple)) and entry]
                return {
                    "ok": True,
                    "status_code": 200,
                    "count": len(items),
                    "titles": [it.get("title", "")[:30] for it in items[:3]],
                    "unresponsive": unresponsive,
                    "error": "",
                }
            except requests.exceptions.ConnectionError:
                return {"ok": False, "status_code": 0, "count": 0, "titles": [], "unresponsive": [], "error": "connection"}
            except requests.exceptions.Timeout:
                return {"ok": False, "status_code": 0, "count": 0, "titles": [], "unresponsive": [], "error": "timeout"}
            except Exception as err:
                return {"ok": False, "status_code": 0, "count": 0, "titles": [], "unresponsive": [], "error": str(err)[:120]}

        start_time = time.time()

        # 第一跳：通用中文检索探针（验证上游引擎真实可用性，不带白名单限制）
        general = _do_search("新生儿黄疸 护理")
        latency_ms = int((time.time() - start_time) * 1000)

        # 连接层失败：实例不可达 / 超时
        if not general["ok"] and general["error"] in ("connection", "timeout"):
            if general["error"] == "connection":
                return {
                    "status": "failed",
                    "latency_ms": latency_ms,
                    "message": f"无法连接到 SearXNG 服务 ({target_url})，请检查网络连接与服务端口。",
                }
            return {
                "status": "failed",
                "latency_ms": int(req_timeout * 1000),
                "message": f"请求 SearXNG 超时 (>{req_timeout}s)，请检查服务负载与网络延迟。",
            }
        if not general["ok"]:
            return {
                "status": "failed",
                "latency_ms": latency_ms,
                "status_code": general['status_code'],
                "message": f"SearXNG 服务返回异常 HTTP 状态码: {general['status_code']}（常见原因：实例未开启 JSON 输出格式，需在实例 settings.yml 的 search.formats 中添加 json）。",
            }

        # 第二跳：权威健康白名单通道探针
        domains = [d.strip() for d in str(health_domains or ",".join(cls.get_health_domains())).split(",") if d.strip()]
        site_clauses = " OR ".join([f"site:{d}" for d in domains[:4]])
        health = _do_search(f"孕期营养食谱 ({site_clauses})")

        unresponsive_all = sorted(set(general["unresponsive"] + health["unresponsive"]))
        base = {
            "latency_ms": latency_ms,
            "status_code": 200,
            "sample_count": general['count'],
            "health_count": health['count'] if health["ok"] else 0,
            "sample_titles": general["titles"],
            "unresponsive_engines": unresponsive_all,
        }

        # 实例可达，但通用检索 0 条：上游引擎被封禁/限流/无结果
        if general['count'] == 0:
            hint_engines = f"，失效引擎：{('、'.join(unresponsive_all))}" if unresponsive_all else ""
            return {
                **base,
                "status": "warning",
                "message": (
                    f"实例已连通（{latency_ms}ms），但通用检索返回 0 条结果{hint_engines}。"
                    "通常为 SearXNG 出口 IP 被上游搜索引擎 CAPTCHA/限流封禁，"
                    "请到 SearXNG 实例检查引擎状态、更换出口 IP/配置代理，"
                    "或在下方「指定检索源引擎」填写实例上可用的引擎。"
                ),
            }

        # 通用检索正常
        health_note = f"，权威健康通道 {health['count']} 条" if health["ok"] else ""
        hint_engines = f"；另有引擎暂不可用：{('、'.join(unresponsive_all))}" if unresponsive_all else ""
        return {
            **base,
            "status": "success",
            "message": f"连通测试成功！响应耗时 {latency_ms}ms，通用检索 {general['count']} 条{health_note}{hint_engines}。",
        }

    @classmethod
    def sync_to_env(
        cls,
        base_url: str,
        timeout: float,
        engines: str = "",
        health_domains: str = "",
        env_file_path: str = None,
        ai_fallback_enabled: bool = None,
    ) -> bool:
        from pathlib import Path
        target_file = Path(env_file_path) if env_file_path else Path(".env")
        clean_url = str(base_url).strip().rstrip("/")
        clean_timeout = str(round(float(timeout), 1))
        clean_engines = str(engines or "").strip()
        clean_domains = str(health_domains or "").strip()
        updates = {
            "SEARXNG_BASE_URL": clean_url,
            "SEARXNG_TIMEOUT": clean_timeout,
            "SEARXNG_FORMAT": "json",
            "SEARXNG_ENGINES": clean_engines,
            "SEARXNG_HEALTH_DOMAINS": clean_domains,
        }
        if ai_fallback_enabled is not None:
            updates["AI_SEARCH_FALLBACK_ENABLED"] = "True" if ai_fallback_enabled else "False"
        try:
            lines = []
            if target_file.exists():
                with open(target_file, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
            existing_keys = set()
            new_lines = []
            for line in lines:
                matched = None
                for k in updates:
                    if line.strip().startswith(f"{k}="):
                        matched = k
                        break
                if matched:
                    new_lines.append(f"{matched}={updates[matched]}\n")
                    existing_keys.add(matched)
                else:
                    new_lines.append(line)
            missing = [k for k in updates if k not in existing_keys]
            if missing:
                if new_lines and not new_lines[-1].endswith("\n"):
                    new_lines.append("\n")
                new_lines.append("\n# ===== SearXNG 私有化搜索引擎配置 (管理员在线更新) =====\n")
                for k in missing:
                    new_lines.append(f"{k}={updates[k]}\n")
            with open(target_file, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
        except Exception as e:
            logger.error("写入 .env 配置文件失败: %s", e)
            return False

        for k, v in updates.items():
            os.environ[k] = v
        try:
            from django.conf import settings
            setattr(settings, "SEARXNG_BASE_URL", clean_url)
            setattr(settings, "SEARXNG_TIMEOUT", float(clean_timeout))
            setattr(settings, "SEARXNG_FORMAT", "json")
            setattr(settings, "SEARXNG_ENGINES", clean_engines)
            setattr(settings, "SEARXNG_HEALTH_DOMAINS", clean_domains)
            if ai_fallback_enabled is not None:
                setattr(settings, "AI_SEARCH_FALLBACK_ENABLED", bool(ai_fallback_enabled))
        except Exception:
            pass
        cls._last_probe_status = None
        cls._last_probe_time = 0.0
        return True

    @classmethod
    def search_diet(cls, query: str, max_results: int = 5):
        return cls.search_health(query, max_results=max_results)
