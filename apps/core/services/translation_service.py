# -*- coding: utf-8 -*-
"""
translation_service.py — 胎教故事与母婴知识中英文双向互译管线（v2.07 新增）

支持引擎管线与故障转移：
  1. ai_model: 调用平台已配置的 AI 大模型，结合胎教睡前语境温情翻译
  2. mymemory: 公共免 Key 翻译端点（高可用、免翻墙）
  3. google_translate: Google 公共端点
  4. custom_api: 自定义第三方端点

与 external_api_config ('translation' 组) 实时联动，支持管理员在外部接口配置页调整
权重、开关、超时与端点地址。
"""
import json
import time
import urllib.parse
import urllib.request
from typing import Dict, Any, Tuple, Optional
from django.conf import settings
from apps.core.services.ai_service import _build_config_list, _call_openai

# 预设引擎标签映射
TRANSLATION_ENGINE_LABELS = {
    'ai_model': 'AI 母婴温情翻译大模型',
    'mymemory': 'MyMemory 国际免Key端点',
    'google_translate': 'Google 公共翻译端点',
    'custom_api': '自定义开放翻译接口',
}


def _get_translation_config():
    """从 service_config 读取 translation 组配置"""
    try:
        from apps.core.services.service_config import get_group
        return get_group('translation')
    except Exception:
        return None


def get_enabled_translation_engines():
    """获取所有启用的翻译引擎配置（有序）"""
    cfg = _get_translation_config()
    engines = []
    if cfg and cfg.get('engines'):
        for eng in cfg['engines']:
            if eng.get('enabled'):
                engines.append(eng)
    if not engines:
        # 默认兜底管线
        engines = [
            {'key': 'ai_model', 'url': 'internal://ai-model', 'timeout': 15.0, 'enabled': True},
            {'key': 'mymemory', 'url': 'https://api.mymemory.translated.net/get', 'timeout': 12.0, 'enabled': True},
            {'key': 'google_translate', 'url': 'https://translate.googleapis.com/translate_a/single', 'timeout': 5.0, 'enabled': True},
        ]
    return engines


def translate_with_ai(
    text: str,
    source_lang: str = "zh",
    target_lang: str = "en",
    user=None,
    timeout: float = 18.0
) -> str:
    """使用 AI 大模型翻译单段或结构化文本"""
    if not text or not text.strip():
        return ""

    src_label = "中文" if source_lang.startswith("zh") else "英文"
    tgt_label = "英文" if target_lang.startswith("en") else "中文"

    system_prompt = (
        "你是一位资深的儿童文学作家与双语胎教故事翻译专家。"
        f"请将用户输入的胎教内容从{src_label}精准、优美、温情地翻译为{tgt_label}。"
        "要求：语气温柔亲切、语言生动自然、符合睡前胎教与亲子阅读场景。"
        "严格注意：仅输出翻译后的纯文本正文，严禁输出任何解释、前后寒暄、引号包装或 Markdown 代码块标签。"
    )

    configs = _build_config_list(user)
    if not configs:
        raise RuntimeError("未配置有效的 AI 大模型 API Key")

    last_err = None
    for cfg in configs:
        try:
            resp = _call_openai(
                prompt=text,
                api_key=cfg["api_key"],
                base_url=cfg.get("base_url") or None,
                model=cfg.get("model") or None,
                timeout=timeout,
                system=system_prompt,
            )
            clean_res = (resp or "").strip()
            # 剥除可能被大模型多包裹的代码块标签
            if clean_res.startswith("```"):
                lines = clean_res.splitlines()
                if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
                    clean_res = "\n".join(lines[1:-1]).strip()
            if clean_res:
                return clean_res
        except Exception as e:
            last_err = e
            continue

    raise RuntimeError(f"AI 翻译生成失败: {str(last_err or '所有 AI 配置均未返回有效内容')}")


def translate_with_mymemory(
    text: str,
    source_lang: str = "zh",
    target_lang: str = "en",
    url: str = None,
    timeout: float = 12.0
) -> str:
    """通过 MyMemory 公共接口翻译"""
    if not text or not text.strip():
        return ""

    endpoint = (url or "https://api.mymemory.translated.net/get").strip()
    s_code = "zh-CN" if source_lang.startswith("zh") else "en"
    t_code = "en" if target_lang.startswith("en") else "zh-CN"

    # MyMemory 单次建议 <= 500 字符，若长文按段落分批
    paragraphs = text.split("\n\n")
    translated_paras = []

    for para in paragraphs:
        clean_para = para.strip()
        if not clean_para:
            translated_paras.append("")
            continue

        q = urllib.parse.quote(clean_para[:1000])
        req_url = f"{endpoint}?q={q}&langpair={s_code}|{t_code}"
        req = urllib.request.Request(
            req_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MengyaPlatform/2.07",
                "Accept": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            res_txt = data.get("responseData", {}).get("translatedText")
            if not res_txt:
                raise RuntimeError(data.get("responseDetails") or "MyMemory 返回结果为空")
            # MyMemory 对特殊 HTML 实体做一次简单反转义
            import html
            res_txt = html.unescape(res_txt)
            translated_paras.append(res_txt)

    return "\n\n".join(translated_paras)


def translate_with_google(
    text: str,
    source_lang: str = "zh",
    target_lang: str = "en",
    url: str = None,
    timeout: float = 5.0
) -> str:
    """通过 Google 免 Key 端点翻译"""
    if not text or not text.strip():
        return ""

    endpoint = (url or "https://translate.googleapis.com/translate_a/single").strip()
    s_code = "zh-CN" if source_lang.startswith("zh") else "en"
    t_code = "en" if target_lang.startswith("en") else "zh-CN"

    q = urllib.parse.quote(text)
    req_url = f"{endpoint}?client=gtx&sl={s_code}&tl={t_code}&dt=t&q={q}"
    req = urllib.request.Request(
        req_url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Mengya/2.07"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        # 结构为 [[[trans, orig, ...], ...]]
        pieces = []
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            for item in data[0]:
                if isinstance(item, list) and len(item) > 0 and item[0]:
                    pieces.append(item[0])
        if pieces:
            return "".join(pieces)
        raise RuntimeError("Google 端点未解析出有效翻译")


def translate_by_engine(
    engine_key: str,
    text: str,
    source_lang: str = "zh",
    target_lang: str = "en",
    url: str = None,
    timeout: float = 10.0,
    user=None,
) -> str:
    """按指定引擎执行单次翻译"""
    if engine_key == "ai_model":
        return translate_with_ai(text, source_lang, target_lang, user=user, timeout=timeout)
    elif engine_key == "mymemory":
        return translate_with_mymemory(text, source_lang, target_lang, url=url, timeout=timeout)
    elif engine_key == "google_translate":
        return translate_with_google(text, source_lang, target_lang, url=url, timeout=timeout)
    else:
        # custom_api 或其他通用端点
        return translate_with_mymemory(text, source_lang, target_lang, url=url, timeout=timeout)



def _normalize_story_package_results(raw: dict, fields: dict) -> dict:
    clean_raw = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            if v is not None:
                clean_raw[str(k).strip().lower()] = str(v).strip()

    field_alias_map = {
        'title': ['title', 'title_en', 'title_zh', '标题', '故事标题', 'name', '故事名称'],
        'subtitle': ['subtitle', 'subtitle_en', 'subtitle_zh', '副标题', '故事寓意', '寓意', 'summary'],
        'content': ['content', 'content_en', 'content_zh', 'story', '正文', '故事正文', '全文', 'body', 'text'],
        'tips': ['tips', 'tips_en', 'tips_zh', 'advice', '胎教提示', '提示', '温馨提示', 'hint', 'suggestion'],
    }

    normalized = {}
    for target_key, aliases in field_alias_map.items():
        found_val = ''
        for alias in aliases:
            if alias.lower() in clean_raw and clean_raw[alias.lower()]:
                found_val = clean_raw[alias.lower()]
                break
        normalized[target_key] = found_val

    return {
        'title': normalized['title'],
        'title_en': normalized['title'],
        'subtitle': normalized['subtitle'],
        'subtitle_en': normalized['subtitle'],
        'content': normalized['content'],
        'content_en': normalized['content'],
        'tips': normalized['tips'],
        'tips_en': normalized['tips'],
    }


def translate_story_package(
    fields: Dict[str, str],
    source_lang: str = "zh",
    target_lang: str = "en",
    preferred_engine: Optional[str] = None,
    user=None,
) -> Dict[str, Any]:
    """
    全量翻译故事字段包（title, subtitle, content, tips），支持管线故障转移
    返回: {
        "success": bool,
        "results": {"title": ..., "subtitle": ..., "content": ..., "tips": ...},
        "used_engine": str,
        "used_engine_label": str,
        "error": str
    }
    """
    all_engines = get_enabled_translation_engines()
    engine_order = []

    # 若用户指定首选引擎，优先排在最前
    if preferred_engine:
        for e in all_engines:
            if e["key"] == preferred_engine:
                engine_order.append(e)
                break
    for e in all_engines:
        if not any(x["key"] == e["key"] for x in engine_order):
            engine_order.append(e)

    if not engine_order:
        engine_order = [
            {'key': 'ai_model', 'url': 'internal://ai-model', 'timeout': 15.0, 'enabled': True},
            {'key': 'mymemory', 'url': 'https://api.mymemory.translated.net/get', 'timeout': 12.0, 'enabled': True},
        ]

    # 尝试按引擎顺序执行
    errors = []
    for eng in engine_order:
        key = eng["key"]
        timeout = eng.get("timeout", 10.0)
        url = eng.get("url")

        # 针对 AI 引擎的单批次结构化翻译优化（大幅缩短等待时间）
        if key == "ai_model":
            try:
                # 过滤出非空需要翻译的项
                active_items = {k: v.strip() for k, v in fields.items() if isinstance(v, str) and v.strip()}
                if not active_items:
                    return {
                        "success": True,
                        "results": {},
                        "used_engine": key,
                        "used_engine_label": TRANSLATION_ENGINE_LABELS.get(key, key),
                    }

                src_label = "中文" if source_lang.startswith("zh") else "英文"
                tgt_label = "英文" if target_lang.startswith("en") else "中文"
                batch_prompt = (
                    f"请将以下母婴胎教故事的各个键值内容从{src_label}精准温情地翻译为{tgt_label}。\n"
                    "请以标准 JSON 字典格式返回，键名必须保持完全一致：\n"
                    f"{json.dumps(active_items, ensure_ascii=False, indent=2)}\n\n"
                    "注意：严格仅返回合法 JSON 代码块，绝不要任何多余问候或解释。"
                )

                configs = _build_config_list(user)
                if configs:
                    raw_res = _call_openai(
                        prompt=batch_prompt,
                        api_key=configs[0]["api_key"],
                        base_url=configs[0].get("base_url") or None,
                        model=configs[0].get("model") or None,
                        timeout=timeout,
                    )
                    clean = (raw_res or "").strip()
                    if clean.startswith("```"):
                        lines = clean.splitlines()
                        if len(lines) >= 3:
                            clean = "\n".join(lines[1:-1]).strip()
                    parsed = json.loads(clean)
                    if isinstance(parsed, dict):
                        return {
                            "success": True,
                            "results": _normalize_story_package_results(parsed, fields),
                            "used_engine": key,
                            "used_engine_label": TRANSLATION_ENGINE_LABELS.get(key, key),
                        }
            except Exception as e:
                errors.append(f"[{key}] 批量AI翻译失败: {str(e)}")

        # 逐字段翻译模式
        try:
            results = {}
            for f_key, f_val in fields.items():
                if not f_val or not str(f_val).strip():
                    results[f_key] = ""
                    continue
                trans = translate_by_engine(
                    key,
                    str(f_val).strip(),
                    source_lang=source_lang,
                    target_lang=target_lang,
                    url=url,
                    timeout=timeout,
                    user=user,
                )
                results[f_key] = trans

            return {
                "success": True,
                "results": _normalize_story_package_results(results, fields),
                "used_engine": key,
                "used_engine_label": TRANSLATION_ENGINE_LABELS.get(key, key),
            }
        except Exception as e:
            errors.append(f"[{key}] {str(e)}")
            continue

    return {
        "success": False,
        "results": {},
        "used_engine": "",
        "used_engine_label": "",
        "error": "；".join(errors) or "所有可用翻译引擎均响应失败",
    }


def test_translation_engine(key: str, url: str = None, timeout: float = None, user=None) -> Dict[str, Any]:
    """连通性测试单个翻译引擎"""
    start = time.time()
    test_phrase = "小宝宝，晚安，做个甜甜的美梦。"
    if timeout is None:
        timeout = 8.0

    try:
        translated = translate_by_engine(
            key,
            test_phrase,
            source_lang="zh",
            target_lang="en",
            url=url,
            timeout=timeout,
            user=user,
        )
        latency = int((time.time() - start) * 1000)
        if translated:
            return {
                "url": url or key,
                "ok": True,
                "message": f"翻译连通成功（{latency}ms）：{translated[:40]}...",
                "latency_ms": latency,
            }
        return {
            "url": url or key,
            "ok": False,
            "message": "端点响应为空",
            "latency_ms": latency,
        }
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return {
            "url": url or key,
            "ok": False,
            "message": f"连接或翻译异常: {str(e)[:150]}",
            "latency_ms": latency,
        }
