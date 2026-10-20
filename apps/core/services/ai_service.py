import os
try:
    import certifi
    _ca_file = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", _ca_file)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _ca_file)
    os.environ.setdefault("CURL_CA_BUNDLE", _ca_file)
except Exception:
    pass


def normalize_base_url(url: str) -> str:
    """标准化 AI Base URL，去除尾部斜杠、多余的 /chat/completions 路径，保证与各家 API 兼容"""
    if not url:
        return ""
    u = url.strip().rstrip("/")
    if u.endswith("/chat/completions"):
        u = u[:-len("/chat/completions")].rstrip("/")
    return u
"""AI 服务 - 支持可选 OpenAI 接入，未配置时使用内置本地回复引擎"""

import json
import random
import re
import time
from datetime import datetime

from django.conf import settings

from apps.core.services.web_search import search_for_ai

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

GENERAL_CHAT_PROMPT = """
你是一个乐于助人的智能助手，名字叫"萌小芽"。
用户可能会问你任何问题，请尽力给出准确、有用的回答。

## 当前日期
今天是 {today}（{weekday}）。
当用户询问日期、时间、星期、节假日等相关问题时，请以上面的日期为准，不要使用你训练数据里的旧日期。

## 网络搜索结果
{search_context}

如果上方有网络搜索结果，请优先基于搜索结果回答用户的问题，并在回答末尾标注信息来源。
如果上方显示"（无网络搜索结果）"，则按你的知识回答；如涉及实时信息请如实告知可能不够准确。

## 用户当前阶段
{user_stage}

## 本周知识库（基于用户当前孕周）
{week_knowledge}

如果上方有本周知识库内容，请在回答孕产/胎儿发育/营养/产检/胎教等相关问题时，优先参考这些知识进行回答，使回答更有针对性。

## 用户问题
{user_query}

## 输出要求
1. 语气温暖、耐心，像朋友聊天一样
2. 如果涉及母婴/育儿/孕产相关问题，可结合用户阶段和本周知识库给出建议
3. 如果涉及医疗问题，提醒用户以医生建议为准
4. 回答尽量简洁明了，避免冗长
5. 如果有网络搜索结果，回答末尾用小字标注"（信息来源：网络搜索）"

请开始你的回复：
"""

PRODUCT_COMPARE_PROMPT = """
你是一位专业的母婴产品顾问，名叫"萌芽小秘书"。

## 用户问题
{user_query}

## 对比品类
{category}

## 对比产品列表
{product_list}

## 各产品详细数据
{product_details}

## 请按以下格式输出
1. **核心差异**：用3句话概括这几个产品的关键区别
2. **分产品点评**：
   - 【产品A】：优点1/优点2/优点3 | 缺点
   - 【产品B】：优点1/优点2/优点3 | 缺点
3. **场景化推荐**：性价比/预算充足/最看重安全
4. **价格提示**：各平台最优价对比
5. **安全提醒**：如有消协测试风险提示，必须高亮说明

请保持客观中立，用数据说话，不要贬低任何品牌。
"""


def _client(api_key=None, base_url=None, timeout=25.0):
    """创建 OpenAI 客户端（自动规范化 URL 并设置合理超时与单次重试）"""
    if not api_key or OpenAI is None:
        return None
    clean_url = normalize_base_url(base_url)
    kwargs = {"api_key": api_key, "timeout": timeout, "max_retries": 1}
    if clean_url:
        kwargs["base_url"] = clean_url
    return OpenAI(**kwargs)


def _infer_model(model: str = "", base_url: str = "") -> str:
    if model and model.strip():
        return model.strip()
    b = (base_url or "").lower()
    if "deepseek" in b:
        return "deepseek-chat"
    if "dashscope" in b or "aliyun" in b:
        return "qwen-turbo"
    if "moonshot" in b:
        return "moonshot-v1-8k"
    if "bigmodel" in b or "zhipu" in b:
        return "glm-4"
    return getattr(settings, "OPENAI_MODEL", "") or "gpt-3.5-turbo"


def _call_openai(
    prompt: str,
    api_key: str = None,
    base_url: str = None,
    model: str = None,
    timeout: float = 25.0,
    max_tokens: int = 1000,
    system: str = None,
) -> str:
    client = _client(api_key=api_key, base_url=base_url, timeout=timeout)
    if client is None:
        return ""
    used_model = _infer_model(model, base_url)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(
        model=used_model,
        messages=messages,
        temperature=0.7,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""


def _build_config_list(user=None):
    """构建按顺序尝试的 AI 配置列表。

    优先级：用户多配置(ai_configs) → 用户旧版单配置 → 全局配置 → 管理员共享配置（被授权用户）。
    返回 [{name, api_key, base_url, model}] 列表，仅包含 enabled 且有 api_key 的配置。
    """
    configs = []

    if user:
        # 多配置列表
        ai_configs = getattr(user, "ai_configs", None) or []
        for cfg in ai_configs:
            if cfg.get("enabled", True) and cfg.get("api_key"):
                configs.append({
                    "name": cfg.get("name", "未命名配置"),
                    "api_key": cfg["api_key"],
                    "base_url": cfg.get("base_url", ""),
                    "model": cfg.get("model", ""),
                })

        # 旧版单配置（向后兼容，仅在未重复时加入）
        user_api_key = getattr(user, "ai_api_key", "")
        if user_api_key and not any(c["api_key"] == user_api_key for c in configs):
            configs.append({
                "name": "默认配置",
                "api_key": user_api_key,
                "base_url": getattr(user, "ai_base_url", ""),
                "model": getattr(user, "ai_model", ""),
            })

    # 全局配置作为兜底
    if settings.OPENAI_API_KEY and not any(c["api_key"] == settings.OPENAI_API_KEY for c in configs):
        configs.append({
            "name": "全局配置",
            "api_key": settings.OPENAI_API_KEY,
            "base_url": getattr(settings, "OPENAI_BASE_URL", ""),
            "model": getattr(settings, "OPENAI_MODEL", ""),
        })

    # 用户无自己配置时，自动继承管理员配置的可用模型（系统共享 AI 服务模式）
    if not configs:
        from apps.core.models import User
        admin = User.objects.filter(is_staff=True, ai_configs__isnull=False).exclude(ai_configs=[]).first()
        if admin:
            for cfg in (admin.ai_configs or []):
                if cfg.get("enabled", True) and cfg.get("api_key"):
                    configs.append({
                        "name": f"系统共享({cfg.get('name', '默认配置')})",
                        "api_key": cfg["api_key"],
                        "base_url": cfg.get("base_url", ""),
                        "model": cfg.get("model", ""),
                    })
                    break
        if not configs:
            admin_legacy = User.objects.filter(is_staff=True, ai_api_key__isnull=False).exclude(ai_api_key="").first()
            if admin_legacy:
                configs.append({
                    "name": "系统共享(默认配置)",
                    "api_key": admin_legacy.ai_api_key,
                    "base_url": admin_legacy.ai_base_url or "",
                    "model": admin_legacy.ai_model or "",
                })

    return configs


# ============ 本地回复引擎（无 API Key 时兜底） ============

_LOCAL_INTENTS = [
    ("比价", "关于比价：建议您先在【京东自营】和【淘宝旗舰店】对比同一型号的到手价，拼多多百亿补贴通常价格更低但需认准官方旗舰店。购买前请核实正品资质。"),
    ("价格", "关于价格：不同平台价格会有差异，京东自营售后稳、淘宝旗舰店活动多、拼多多补贴价更低。建议以实际购买页面为准，注意甄别正品。"),
    ("安全座椅", "安全座椅选购要点：1）必须有3C认证和ECE/ADAC碰撞测试成绩；2）按身高体重选组别而非只看年龄；3）安装方式优先ISOFIX硬连接。推荐关注BeBeBus、虎贝尔等主流品牌。"),
    ("推车", "婴儿推车选购要点：1）避震性能优先（小月龄宝宝尤其重要）；2）一键收车；3）车重+折叠尺寸；4）推杆高度是否适合家人身高。建议到店实推感受。"),
    ("奶瓶", "奶瓶选购：PPSU轻便耐摔、玻璃材质安全但重；口径选宽口方便冲奶；奶嘴分SS/S/M/L按月龄更换。建议备2-3个交替使用。"),
    ("奶粉", "奶粉选购：1） 看配方（国标+品牌研发实力）；2） 看奶源（南北纬40-50°黄金奶源带）；3） 转奶需过渡；4） 注意开罐后保质期。建议选择适合宝宝消化情况的正规渠道产品。"),
    ("辅食", "辅食添加建议：6个月起从高铁米粉开始，由稀到稠、由少到多、由单一到混合。每次只添加一种新食物，观察3-5天有无过敏反应。"),
    ("黄疸", "新生儿黄疸：生理性黄疸一般出生后2-3天出现，7-14天消退。若黄疸出现早、消退慢、加重快，或伴随精神萎靡，请及时就医，不可自行处理。"),
    ("产检", "产检记录建议每次产检后同步记录孕周、体重、血压、宫高腹围等关键指标，平台支持记录并生成趋势图，方便医生快速了解孕期变化。"),
    ("疫苗", "疫苗接种请以当地疾控中心安排为准，出生后首月需接种乙肝疫苗、卡介苗等。平台疫苗日历会按宝宝月龄提醒，建议按时接种、注意间隔。"),
    ("辅食", "辅食初期（6-8月）：高铁米粉→菜泥→肉泥→蛋黄；9-12月可过渡到颗粒状；1岁后可尝试小块食物。注意每添加新食物观察3天。"),
    ("待产包", "待产包建议：产褥垫10片、一次性内裤10条、NB纸尿裤30片、哺乳文胸3件、连体衣4件等，并按季节增减。可以进入「智能待产包」按季节+分娩方式一键生成。"),
    ("黄疸", "新生儿黄疸很常见，生理性黄疸注意观察、多喂奶促进排泄；若值偏高或迟迟不退，需照蓝光处理，请遵医嘱，切勿自行用药。"),
]


def _local_answer(query: str, stage_label: str = "") -> str:
    q = query.lower()
    for kw, ans in _LOCAL_INTENTS:
        if kw in q:
            prefix = f"【萌芽小秘书·{stage_label or '通用'}】\n\n"
            return prefix + ans
    prefix = f"【萌芽小秘书·{stage_label or '通用'}】\n\n"
    return (
        prefix
        + "我收到您的问题啦。作为本地演示模式，我会在您配置 OpenAI API Key 后提供更智能的回答。\n\n"
        "针对您的问题，通用建议是：育儿问题请优先参考权威指南（如国家卫健委《婴幼儿喂养指南》），涉及医疗请遵医嘱；"
        "产品选购可到「商品库」使用五维对比与选购指南，或到「智能待产包」按季节+分娩方式一键生成清单。\n\n"
        "如需更针对性的回答，请补充：宝宝月龄/孕周、具体品牌或产品名称。"
    )


def _build_week_knowledge(user) -> str:
    """根据用户孕周构建知识库摘要"""
    if not user or not getattr(user, "is_pregnant", False) or not user.due_date:
        return "（用户非孕期或未设置预产期）"

    from datetime import date as date_cls
    from apps.core.models import TimelineEvent

    # 计算孕周
    today = date_cls.today()
    days_pregnant = (today - user.due_date).days + 280  # 预产期=末次月经+280天
    if days_pregnant < 7:
        return "（孕周计算异常）"
    week = max(1, min(40, days_pregnant // 7))

    # 获取本周所有时间轴事件
    events = TimelineEvent.objects.filter(
        stage_type="pregnancy_week", stage_value=week
    ).order_by("sort_order")

    if not events:
        return f"（第{week}周暂无知识库数据）"

    lines = [f"第{week}周知识点："]
    for e in events:
        line = f"- [{e.get_category_display()}] {e.title}"
        if e.content:
            # 截取前120字
            content = e.content[:120]
            if len(e.content) > 120:
                content += "…"
            line += f"：{content}"
        if e.tips:
            tips = e.tips[:60]
            if len(e.tips) > 60:
                tips += "…"
            line += f"（小贴士：{tips}）"
        lines.append(line)

    return "\n".join(lines)


def ai_chat(query_text: str, stage_label: str = "", user=None) -> dict:
    """AI 问答主入口：按顺序尝试多个 AI 配置，全部失败后回退本地引擎"""
    start = time.time()
    error_hints = []
    used_config_name = ""
    used_search = False

    # 判断是否需要联网检索（v1.55：SearXNG 私有实例优先；未配置或不通时按管理员开关决定是否公网兜底，默认直接 AI）
    search_context = ""
    engine_source = ""
    search_status = "skipped"
    sources = []
    try:
        search_res = search_for_ai(query_text, max_results=5)
        search_context = search_res.get("context") or ""
        engine_source = search_res.get("engine") or ""
        search_status = search_res.get("status") or "skipped"
        sources = search_res.get("sources") or []
    except Exception:
        search_status = "unavailable"
    used_search = bool(search_context)

    # 构建本周知识库
    week_knowledge = _build_week_knowledge(user)

    prompt = GENERAL_CHAT_PROMPT.format(
        today=datetime.now().strftime("%Y年%m月%d日"),
        weekday=("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")[datetime.now().weekday()],
        user_query=query_text,
        user_stage=stage_label or "未设置",
        search_context=search_context,
        has_search="以下是网络搜索结果" if search_context else "（无网络搜索结果）",
        week_knowledge=week_knowledge,
    )

    configs = _build_config_list(user)
    response = ""

    for cfg in configs:
        try:
            resp = _call_openai(
                prompt,
                api_key=cfg["api_key"],
                base_url=cfg["base_url"] or None,
                model=cfg["model"] or None,
                timeout=25.0,
            )
            if resp:
                response = resp
                used_config_name = cfg["name"]
                break
            else:
                error_hints.append(f"[{cfg['name']}] 返回空内容，请检查 Base URL 与模型名称")
        except Exception as e:
            error_hints.append(f"[{cfg['name']}] {e}")

    used_openai = bool(response)
    if not response:
        response = _local_question(query_text, stage_label)
    elif used_search:
        src_label = f"实时检索 - {engine_source}" if engine_source else "网络搜索"
        if "信息来源" not in response and "网络搜索" not in response and "来源" not in response:
            response = f"{response.rstrip()}\n\n（信息来源：{src_label}）"

    # 组装 error_hint
    if not used_openai:
        if error_hints:
            error_hint = "；".join(error_hints)
        else:
            error_hint = "未配置 API Key，当前为本地知识模式"
    else:
        error_hint = ""

    # 真实耗时统计（修复历史版本假随机数缺陷）
    latency = int((time.time() - start) * 1000)


    return {
        "query": query_text,
        "response": response,
        "used_openai": used_openai,
        "used_config_name": used_config_name,
        "used_search": used_search,
        "search_status": search_status,
        "sources": sources,
        "latency_ms": latency,
        "suggestions": _suggestions(stage_label),
        "error_hint": error_hint,
    }


def ai_compare(query_text: str, products, stage_label: str = "", user=None) -> dict:
    """AI 智能对比：按顺序尝试多个 AI 配置，全部失败后回退本地引擎"""
    product_list = "\n".join([f"- {p.brand} {p.name}" for p in products])
    details = []
    for p in products:
        c = p.get_compare_context()
        details.append(json.dumps(c, ensure_ascii=False))
    product_details = "\n".join(details)

    prompt = PRODUCT_COMPARE_PROMPT.format(
        user_query=query_text,
        category=products[0].first_category if products else "通用",
        product_list=product_list,
        product_details=product_details,
    )

    configs = _build_config_list(user)
    for cfg in configs:
        try:
            response = _call_openai(
                prompt,
                api_key=cfg["api_key"],
                base_url=cfg["base_url"] or None,
                model=cfg["model"] or None,
            )
            if response:
                return {
                    "response": response,
                    "mode": "openai",
                    "used_config_name": cfg["name"],
                    "products": [p.id for p in products],
                }
        except Exception:
            pass

    # 本地兜底：结构化对比建议
    lines = ["### 核心差异", "根据五维评分与价格数据，为您整理关键差异："]
    for p in products:
        c = p.get_compare_context()
        lines.append(
            f"- **{p.brand} {p.name}**：综合 {c['overall']} 分，安全性 {c['ratings'].get('safety', 0)} 分，"
            f"参考价 {c['price'].get('range', '-')}"
        )
    lines.append("\n### 场景化推荐")
    lines.append("- 追求性价比：选择同价位评分最高者，参考「性价比之选」标签")
    lines.append("- 预算充足：优先选择综合评分最高、安全性分最高的产品")
    lines.append("- 最看重安全：请优先对比安全性评分并关注 CCC 认证与消协测试记录")
    lines.append("\n### 价格提示")
    lines.append("具体平台价格以实际购买页面为准，建议在淘宝/京东/拼多多核对比价。")
    return {"response": "\n".join(lines), "mode": "local", "products": [p.id for p in products]}


def _local_question(query: str, stage_label: str = "") -> str:
    q = query.lower()
    for kw, ans in _LOCAL_INTENTS:
        if kw in q:
            return f"【萌小芽·{stage_label or '当前阶段'}】\n\n{ans}"
    return (
        f"【萌小芽·{stage_label or '当前阶段'}】\n\n"
        "收到您的问题啦！当前为本地知识模式，可先尝试问：\n"
        "· 待产包要准备什么？\n"
        "· 婴儿推车怎么选？\n"
        "· 6个月宝宝辅食怎么加？\n"
        "· 黄疸怎么办？\n\n"
        "如需更智能的答案，可在「我的 - AI 配置」中设置 API Key。"
    )


def _suggestions(stage_label: str = "") -> list:
    base = [
        "待产包应该准备哪些物品？",
        "婴儿推车怎么选？",
        "宝宝6个月辅食怎么加？",
        "新生儿黄疸怎么办？",
        "今天天气怎么样？",
        "帮我写一首关于春天的小诗",
    ]
    return base

def ai_evaluate_product(product, user=None) -> dict:
    """每个商品详情页 AI 一键评测功能
    调用 AI 获取该商品的信息并生成评测结论：包括价格分析、核心性能与安全、多平台对比、实用功能建议等。
    当 API 不可用或配置失败时，提供结构化规则本地兜底评测。
    """
    cat_label = product.get_first_category_display() if hasattr(product, "get_first_category_display") else product.first_category
    ratings = product.ratings or {}
    price_info = product.price_info or {}
    specs = {k: v for k, v in (product.specifications or {}).items() if "接口" not in k and "isofix" not in str(v).lower()}
    
    # 联网检索外部真实舆情、抽检合格性与召回缺陷（通过 SearXNG 赋能）
    external_context = ""
    try:
        from apps.core.services.searxng_client import SearXNGClient
        s_query = f"{product.brand} {product.name} 质量抽检 评测 缺陷 召回"
        s_res = SearXNGClient.search(s_query, max_results=3)
        if s_res:
            lines = [f"- 《{r['title']}》: {r['body'][:150]}" for r in s_res]
            external_context = "\n【互联网质检与消协评测参考(SearXNG)】:\n" + "\n".join(lines)
    except Exception:
        pass

    prompt = f"""请对以下母婴商品进行全面专业的深度评测：{external_context}
【商品名称】: {product.brand} {product.name}
【品类】: {cat_label} - {product.second_category}
【规格参数】: {specs}
【参考价格】: 均价 {price_info.get('avg', '暂无')} 元，区间 {price_info.get('range', '暂无')} 元（淘宝: {price_info.get('taobao', '暂无')}, 京东: {price_info.get('jd', '暂无')}, 拼多多: {price_info.get('pdd', '暂无')}）
【多维评分】: 综合 {product.overall_rating} 分，安全 {ratings.get('safety', '未评')} 分，舒适 {ratings.get('comfort', '未评')} 分，功能 {ratings.get('functionality', '未评')} 分，易用 {ratings.get('usability', '未评')} 分，颜值 {ratings.get('appearance', '未评')} 分
【CCC认证】: {'已通过' if product.has_ccc_certification else '未标明/不需要'}
【安全预警提示】: {product.safety_alert or '无严重不良警示'}
【商品描述与选购指南】: {product.description or ''} {product.purchase_guide or ''}

请按照以下五个模块输出评测结论（格式请清晰专业，有具体可操作的建议）：
1. 【综合评测结论】：2-3句话总结该产品核心价值、推荐指数与适合人群画像。
2. 【价格与性价比】：分析价格水平、不同档次对比、是否值得购买。
3. 【性能与安全保障】：分析材质用料、安全认证、关键性能指标与避坑提醒。
4. 【多平台购买对比】：淘宝、京东、拼多多等常见电商平台的选购策略（价格、正品保障、自营售后与大促时机）。
5. 【核心功能与使用建议】：日常使用的亮点功能、操作技巧、清洗维护或储存建议。
"""
    system = "你是一位国家级母婴产品评测专家，具备严谨客观的产品分析能力与亲和力，回答结构严谨、逻辑清晰。"
    
    configs = _build_config_list(user)
    for cfg in configs:
        try:
            resp = _call_openai(prompt, system=system, api_key=cfg["api_key"], base_url=cfg.get("base_url"), model=cfg.get("model"), timeout=25.0, max_tokens=1200)
            if resp and len(resp.strip()) > 50:
                return {
                    "source": "ai",
                    "used_config_name": cfg["name"],
                    "evaluation": resp.strip(),
                    "product_id": product.id,
                    "product_name": f"{product.brand} {product.name}",
                }
        except Exception:
            pass

    # 本地高品质规则兜底评测
    avg_price = price_info.get("avg") or "适中"
    p_range = price_info.get("range") or "参考市场行情"
    safety_score = ratings.get("safety", product.overall_rating)
    is_ccc = "已通过中国国家强制性产品CCC安全认证，安全系数可靠" if product.has_ccc_certification else "属于非强制CCC品类或符合行业执行标准"
    
    local_eval = f"""### 一、【综合评测结论】
【{product.brand} {product.name}】综合推荐指数为 **{product.overall_rating:.1f}/10分**。整体定位于优质母婴必备产品，各项关键指标表现均衡，尤其适合注重婴儿实用体验与母婴安全防护的家庭。

### 二、【价格与性价比分析】
- **价格定位**：当前参考价格区间为 **{p_range}元**（市场均价约 **{avg_price}元**）。
- **性价比评估**：处于该品类的主流价格带。对比同规格同质化产品，用料与设计细节符合该价位应有水准，无虚高溢价，性价比较高。

### 三、【性能与安全保障】
- **安全认证**：{is_ccc}。
- **安全评分**：安全维度评分为 **{safety_score}分**。
- **品质警示**：{product.safety_alert if product.safety_alert else "该产品无严重不良缺陷警示，日常可放心按说明书规范使用。"}

### 四、【多平台购买对比建议】
- **京东商城**：推荐追求次日达自营配送与正品发票保障的用户，自营售后退换便利。
- **淘宝/天猫**：官方旗舰店活动力度大，适合在大促满减（如618/双11）叠加会员券时囤货。
- **拼多多百亿补贴**：价格常具备较强优势，建议认准官方旗舰店或百亿补贴正品标签购买。

### 五、【核心功能与使用建议】
1. **规格适配**：请在使用前核对规格参数，适合对应周龄或月龄阶段的宝宝使用。
2. **清洁保养**：首次使用前建议按产品说明进行清洁消毒或温水擦拭，存放于通风干燥处。
3. **日常观察**：使用过程中定期检查零部件或包装完好度，确保使用安全。
"""
    return {
        "source": "local_fallback",
        "used_config_name": "智能本地评测引擎",
        "evaluation": local_eval.strip(),
        "product_id": product.id,
        "product_name": f"{product.brand} {product.name}",
    }


# ==================== 获取可用模型列表 (OpenAI 兼容接口) ====================
import requests

AI_HTTP_TIMEOUT = (5, 10)

def _ai_http_get(url, headers=None):
    """AI 网关 GET（requests 版）：1 禁代理直连；2 失败回落系统代理重试一次"""
    try:
        return requests.get(url, headers=headers, timeout=AI_HTTP_TIMEOUT,
                             proxies={"http": None, "https": None})
    except (requests.Timeout, requests.RequestException):
        pass
    return requests.get(url, headers=headers, timeout=AI_HTTP_TIMEOUT)


def fetch_model_list(api_key: str, base_url: str) -> dict:
    """调用 {base_url}/models 获取可用模型列表（OpenAI 兼容接口）"""
    if not api_key:
        return {"success": False, "models": [], "message": "API Key 为空，请先填写", "detail": ""}

    base = normalize_base_url(base_url) if base_url else "https://api.openai.com/v1"
    models_url = base.rstrip("/") + "/models"

    try:
        resp = _ai_http_get(models_url, headers={"Authorization": "Bearer " + api_key})
    except requests.Timeout:
        return {"success": False, "models": [], "message": "请求模型列表超时，请检查 Base URL 与网络", "detail": "timeout"}
    except requests.RequestException as e:
        return {"success": False, "models": [], "message": "无法连接模型列表接口，请检查 Base URL 与网络", "detail": str(e)[:300]}

    try:
        data = resp.json()
    except ValueError:
        return {"success": False, "models": [],
                "message": "接口返回的不是有效 JSON（可能不是 OpenAI 兼容的 /models 接口）",
                "detail": resp.text[:300]}

    if resp.status_code in (401, 403):
        return {"success": False, "models": [],
                "message": f"API Key 无效或无权访问模型列表（HTTP {resp.status_code}）",
                "detail": resp.text[:300]}

    if resp.status_code != 200:
        err_obj = data.get("error") or {}
        if isinstance(err_obj, dict):
            reason = err_obj.get("message") or data.get("reason") or f"HTTP {resp.status_code}"
        else:
            reason = data.get("reason") or f"HTTP {resp.status_code}"
        return {"success": False, "models": [],
                "message": f"模型列表接口返回错误：{reason}",
                "detail": resp.text[:300]}

    models = []
    for item in data.get("data") or []:
        if isinstance(item, dict) and item.get("id"):
            models.append(str(item["id"]))

    if not models:
        return {"success": False, "models": [],
                "message": "模型列表接口返回的模型列表为空",
                "detail": resp.text[:300]}

    return {"success": True, "models": models,
            "message": f"成功获取 {len(models)} 个可用模型",
            "detail": ""}


# ============ 妈妈生命体征（血压/血糖）AI 深度分析 ============

def _local_vitals_answer(vitals_data: dict, stage_label: str = "") -> str:
    """本地备用医学知识库：当公网大模型不可用或未配置时，生成高标准的临床解读"""
    completeness = vitals_data.get("completeness") or {}
    bp_eval = vitals_data.get("bp_eval")
    glu_eval = vitals_data.get("glucose_eval")
    symptoms = vitals_data.get("symptoms") or []
    stage = stage_label or "孕产期"

    recorded_items = completeness.get("recorded_items") or []
    unrecorded_items = completeness.get("unrecorded_items") or []

    lines = []
    lines.append(f"### 🩺 萌小芽健康顾问 · 生命体征综合解读 ({stage})\n")

    # 1. 录入数据与完备度说明
    lines.append("#### 📋 本次录入数据与完备度评估")
    if recorded_items:
        rec_texts = [f"**{item['label']}**: {item['value']} ({item.get('status_label', '已记录')})" for item in recorded_items]
        lines.append(f"- **已录入指标**：{' ｜ '.join(rec_texts)}")
    else:
        lines.append("- **已录入指标**：暂无有效测量数据")

    if unrecorded_items:
        unrec_texts = [f"**{item['label']}**（{item.get('hint', '')}）" for item in unrecorded_items]
        lines.append(f"- **未录入指标说明**：{' ； '.join(unrec_texts)}")
        lines.append("> 💡 *提示：健康中心支持按需单项或组合打卡，未录入指标不影响已录入项目的评估与趋势跟踪。*\n")
    else:
        lines.append("> ✨ *提示：本次指标全量录入，生命体征画像完整，建议继续保持定期记录习惯。*\n")

    # 2. 核心指标临床判读
    lines.append("#### 🔬 临床医学判读与生理机制")
    if bp_eval:
        sbp = bp_eval.get("systolic")
        dbp = bp_eval.get("diastolic")
        bp_label = bp_eval.get("status_label", "正常")
        lines.append(f"- **血压分析 ({sbp}/{dbp} mmHg · {bp_label})**：")
        lines.append(f"  {bp_eval.get('clinical_advice', '')}")
        if bp_eval.get("pulse_info"):
            p_info = bp_eval["pulse_info"]
            lines.append(f"  脉搏记录：{p_info.get('pulse')} 次/分（{p_info.get('label')}），{p_info.get('desc')}")
    else:
        lines.append("- **血压分析**：本次未提供血压测量值。孕产期血管张力随孕周变化明显，建议每周自测 2~3 次以排查隐性高血压。")

    if glu_eval:
        glu_val = glu_eval.get("glucose")
        glu_type = glu_eval.get("glucose_type_label", "空腹")
        glu_label = glu_eval.get("status_label", "正常")
        lines.append(f"- **血糖分析 ({glu_type} {glu_val} mmol/L · {glu_label})**：")
        lines.append(f"  {glu_eval.get('clinical_advice', '')}")
    else:
        lines.append("- **血糖分析**：本次未提供血糖测量值。孕 24~28 周糖耐量筛查前后，建议关注餐后碳水摄入与空腹血糖波动。")

    if symptoms:
        lines.append(f"- **伴随症状关注**：记录到您勾选了【{'、'.join(symptoms)}】。若症状持续或有加重趋势，请引起重视并向产科医生反映。")

    lines.append("")

    # 3. 膳食与生活方式干预建议
    lines.append("#### 🥗 营养膳食与日常调理建议")
    # 高血压或血糖异常饮食建议
    if bp_eval and bp_eval.get("status") in ["elevated", "hypertension_stage1", "hypertension_severe"]:
        lines.append("- **低钠高钾高钙 DASH 方案**：烹调时少放盐（每天<5g），少用味精、酱油和豆瓣酱；适量摄入菠菜、西兰花、西红柿及香蕉，保证每日 400~500ml 低脂牛奶或强化钙豆浆。")
        lines.append("- **体位与休息**：建议夜间及午休采取左侧卧位，有效减轻下腔静脉压迫，增加肾脏和胎盘血流量。")
    if glu_eval and glu_eval.get("status") in ["elevated", "high"]:
        lines.append("- **低 GI 粗细搭配与控糖**：主食减少精白米面与精细糕点，以燕麦、荞麦、黑米、杂豆替代 1/3 主食；进餐遵循「先汤菜、再蛋白质肉蛋、最后主食」顺序。")
        lines.append("- **餐后温和活动**：早餐或正餐后 30 分钟进行 20 分钟轻柔散步，有助于骨骼肌摄取葡萄糖，显著平抑餐后血糖峰值。")
    if (not bp_eval or bp_eval.get("status") == "normal") and (not glu_eval or glu_eval.get("status") == "normal"):
        lines.append("- **均衡稳态饮食**：保持三餐规律，荤素搭配；补充优质蛋白与深色蔬菜，避免暴饮暴食或长时间空腹。")
        lines.append("- **作息与情绪**：每天保证 8 小时高质量睡眠，适度进行孕妇瑜伽或散步，保持心情愉悦。")

    lines.append("")

    # 4. 就医红线与监测计划
    lines.append("#### ⚠️ 就医红线提示与监测建议")
    lines.append("- **立即就医指征 (红线警报)**：若出现**持续性搏动性头痛、眼花/视物模糊、突发上腹剧烈疼痛、严重下肢水肿波及大腿或面部、或者胎动突然明显减少/异常剧烈**，必须立即由家属陪同前往综合医院产科急诊！")
    lines.append("- **建议监测计划**：建议在清晨起床后（静息 5 分钟、排尿后）及晚餐后 2 小时进行测量并打卡记录。")
    lines.append("\n> 📌 *免责声明：本分析由萌芽母婴健康系统基于权威临床指南规则生成，仅供孕产期自我健康监测与营养生活调理参考，不能替代临床执业医师的面对面诊断与治疗处方。*")

    return "\n".join(lines)


def ai_analyze_vitals(vitals_data: dict, stage_label: str = "", user=None) -> dict:
    """
    妈妈生命体征（血压、血糖）AI 深度智能解读
    结合临床指南、已录入与未录入完备度、伴随症状进行结构化分析
    支持 OpenAI 优先 + 本地备用医学知识库平滑降级
    """
    start_time = time.time()
    completeness = vitals_data.get("completeness") or {}
    bp_eval = vitals_data.get("bp_eval")
    glu_eval = vitals_data.get("glucose_eval")
    symptoms = vitals_data.get("symptoms") or []
    history_trend = vitals_data.get("history_trend") or []

    recorded_summary = "、".join([item["label"] + ": " + item["value"] for item in completeness.get("recorded_items", [])]) or "无"
    unrecorded_summary = "、".join([item["label"] for item in completeness.get("unrecorded_items", [])]) or "无"

    bp_summary = (
        f"收缩压 {bp_eval['systolic']} / 舒张压 {bp_eval['diastolic']} mmHg，临床判定：{bp_eval['status_label']} ({bp_eval.get('definition', '')})"
        if bp_eval else "用户本次未录入血压"
    )
    glu_summary = (
        f"{glu_eval.get('glucose_type_label', '空腹')} 血糖 {glu_eval['glucose']} mmol/L，临床判定：{glu_eval['status_label']} (参考区间: {glu_eval.get('target_range', '')})"
        if glu_eval else "用户本次未录入血糖"
    )
    sym_summary = "、".join(symptoms) if symptoms else "无明显不适"

    history_texts = []
    for h in history_trend[:3]:
        h_bp = f"血压 {h['systolic']}/{h['diastolic']}" if h.get("systolic") else ""
        h_glu = f"血糖 {h['blood_sugar']}({h.get('glucose_type', '')})" if h.get("blood_sugar") else ""
        h_items = [x for x in [h_bp, h_glu] if x]
        if h_items:
            history_texts.append(f"{h.get('record_date', '')}: {', '.join(h_items)}")
    history_summary = "；".join(history_texts) if history_texts else "暂无更多近期记录"

    system_prompt = (
        "你是一位严谨、专业且富有亲和力的资深妇产科主治医师兼临床母婴营养顾问（萌芽平台健康顾问'萌小芽'）。"
        "你的任务是根据用户本次录入的生命体征数据、临床评估分级以及未录入指标说明，生成一份结构清晰、语言温和通俗的医学分析与调理指导。"
        "重要原则："
        "1. 严格以《妊娠期高血压疾病诊治指南》与《妊娠期高血糖诊治指南》为标准，切勿随意夸大或轻视病情；"
        "2. 必须客观区分【已录入指标】与【未录入指标】，未录入的数据切勿凭空编造；"
        "3. 必须明确列出产科急症红线体征（如子痫前期警报）与免责声明。"
    )

    user_prompt = f"""
请为这位正在孕育/抚育宝宝的妈妈生成专属生命体征深度健康解读报告：

【用户画像与阶段】：{stage_label or '孕产期'}
【伴随不适症状】：{sym_summary}

【本次数据录入完备度情况】：
- 已录入指标：{recorded_summary}
- 未录入指标：{unrecorded_summary}
- 录入总结说明：{completeness.get('summary_text', '')}

【临床医学判定结果】：
- 血压临床评估：{bp_summary}
- 血糖临床评估：{glu_summary}
- 近期历史趋势对比：{history_summary}

请按照以下 4 个板块组织回答（使用清晰 Markdown 格式）：
1. 🩺 录入数据与完备度说明（清晰客观指出本次记录了什么、未记录什么及监测意义）
2. 🔬 临床医学判读与生理机制（结合孕周/阶段通俗解释生理影响，胎盘血供或代谢）
3. 🥗 营养膳食与日常调理建议（针对血压/血糖的具体食谱搭配与运动建议）
4. ⚠️ 就医红线提示与监测建议（子痫前期危险体征预警、产科急诊指征及免责声明）
"""

    configs = _build_config_list(user)
    response_text = ""
    used_config_name = ""
    error_hints = []

    for cfg in configs:
        try:
            resp = _call_openai(
                user_prompt,
                api_key=cfg["api_key"],
                base_url=cfg["base_url"] or None,
                model=cfg["model"] or None,
                system=system_prompt,
                timeout=25.0,
                max_tokens=1500,
            )
            if resp and len(resp.strip()) > 30:
                response_text = resp.strip()
                used_config_name = cfg.get("name", "OpenAI")
                break
        except Exception as e:
            error_hints.append(f"{cfg.get('name', 'config')}: {str(e)[:100]}")

    latency_ms = int((time.time() - start_time) * 1000)

    if not response_text:
        response_text = _local_vitals_answer(vitals_data, stage_label=stage_label)
        return {
            "response": response_text,
            "used_openai": False,
            "used_config_name": "本地备用医学知识库",
            "latency_ms": latency_ms,
            "error_hint": "; ".join(error_hints) if error_hints else "",
        }

    return {
        "response": response_text,
        "used_openai": True,
        "used_config_name": used_config_name,
        "latency_ms": latency_ms,
        "error_hint": "",
    }
