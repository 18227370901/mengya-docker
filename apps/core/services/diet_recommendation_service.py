# -*- coding: utf-8 -*-
"""
孕产妇双通道食谱智能推荐与生活方式关怀服务
第一通道：平台自研食谱库 (Recipe.objects) 优先检索，标注 [平台食谱: #ID]
第二通道：SearXNG 权威健康联网搜索降级，标注 [外部引用: 来源]
安全保障：孕产期禁忌食材全量扫描过滤 + 医疗级免责声明
"""
import logging
import re
from typing import Any, Dict, List, Optional
from apps.core.models.recipe import Recipe
from apps.core.services.searxng_client import SearXNGClient

logger = logging.getLogger(__name__)

# 孕产期高危与禁忌食材黑名单
FORBIDDEN_INGREDIENTS = [
    "生鱼片", "刺身", "生肉", "溏心蛋", "生鸡蛋", "未熟牛排", "生蚝",
    "未经巴氏消毒", "生牛奶", "生羊奶", "未灭菌鲜奶",
    "剑鱼", "旗鱼", "大眼金枪鱼", "鲨鱼", "方头鱼",
    "甲鱼", "马齿苋", "生豆浆", "未煮熟四季豆", "发芽马铃薯",
    "山楂糕", "山楂片大量", "桂圆肉过量", "红花", "益母草",
]

DISCLAIMER_TEXT = (
    "【医学免责声明】本食谱与营养建议基于国家卫生健康委《孕产期妇女膳食指南》及权威健康资料生成，"
    "仅作为日常科普与健康管理参考，不能替代临床医生的个体化诊疗处方。"
    "若合并妊娠期并发症、重度过敏或指标异常，请务必遵从线下主治医师及临床营养师指导。"
)


class DietRecommendationService:
    """双通道个性化膳食与生活方式方案生成器"""

    # v1.57 食材用量正则：匹配中文食谱正文中「食材+用量」片段，如 "鸡蛋2个""菠菜100克""盐 3g""牛奶250ml"
    # 数量型：鸡蛋2个 / 大米100克 / 牛奶250ml（单位后可紧跟动词如"焯水"，不设前瞻限制）
    _INGREDIENT_QTY_PATTERN = re.compile(
        r"([\u4e00-\u9fa5]{1,6})\s*(\d+(?:\.\d+)?)\s*(个|只|枚|片|张|段|勺|杯|碗|根|颗|滴|瓣|条|块|克|g|G|千克|kg|KG|公斤|毫升|ml|mL|升|L|毫克|mg)"
    )
    # 适量/少许型：盐适量 / 葱花少许
    _INGREDIENT_FREE_PATTERN = re.compile(r"([\u4e00-\u9fa5]{1,6})\s*(?:适量|少许|少量|些许)")
    # 干扰词排除：非食材动词/量词开头，避免"洗净2个""切块300克"之类误提取
    _NOISE_PREFIXES = ("洗净", "切块", "切片", "切丁", "切段", "去皮", "锅中", "加入", "倒入", "热锅", "大火", "小火", "中火", "煮熟", "烧开", "翻炒", "搅拌", "腌制", "提前", "适量即可", "焯水", "打散", "蒸熟", "浸泡", "备用")

    @classmethod
    def extract_ingredients_from_text(cls, text: str, limit: int = 6) -> str:
        """从外部检索正文/标题中正则提取食材用量列表，补全推荐卡片细节。

        搜索结果正文通常是食谱简介（如"菠菜100克焯水，鸡蛋2个打散……"），
        提取前 limit 个「食材+用量」片段拼接为简短清单；提取不到时返回空串，
        由调用方回退到默认占位文案。
        """
        if not text:
            return ""
        hits: list = []
        seen: set = set()

        def _try_add(name: str, qty: str, unit: str) -> None:
            if len(hits) >= limit or not name or name in seen:
                return
            if any(w in name for w in cls._NOISE_PREFIXES) or any(name.startswith(w) for w in cls._NOISE_PREFIXES):
                return
            seen.add(name)
            hits.append(f"{name}{qty}{unit}")

        for match in cls._INGREDIENT_QTY_PATTERN.finditer(text):
            _try_add(match.group(1), (match.group(2) or "").strip(), (match.group(3) or "").strip())
            if len(hits) >= limit:
                break
        for match in cls._INGREDIENT_FREE_PATTERN.finditer(text):
            _try_add(match.group(1), "+", "适量")
            if len(hits) >= limit:
                break
        return "、".join(hits)

    @classmethod
    def check_food_safety(cls, text: str) -> tuple[bool, List[str]]:
        """检查文本是否包含孕产期禁忌食材"""
        if not text:
            return True, []
        matched = [bad for bad in FORBIDDEN_INGREDIENTS if bad in text]
        return (len(matched) == 0), matched

    @classmethod
    def get_stage_key(cls, gestational_week: Optional[int], stage_type: str) -> str:
        if stage_type == "postpartum":
            return "mid"
        week = gestational_week or 16
        if week <= 12:
            return "early"
        if week <= 27:
            return "mid"
        return "late"

    @classmethod
    def retrieve_platform_recipes(
        cls,
        period: str,
        medical_history: Optional[List[str]] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """通道一：检索内部平台 Recipe 库并打标"""
        history = [str(item).lower() for item in (medical_history or [])]
        queryset = Recipe.objects.filter(period=period)
        if not queryset.exists():
            queryset = Recipe.objects.all()

        matched_recipes = []
        if any(k in h for h in history for k in ["糖尿病", "gdm", "血糖"]):
            matched_recipes.extend(list(queryset.filter(nutrient_tag__icontains="控糖")[: limit]))
            if len(matched_recipes) < limit:
                matched_recipes.extend(list(queryset.filter(nutrient_tag__icontains="低脂")[: limit - len(matched_recipes)]))
        elif any(k in h for h in history for k in ["高血压", "hypertension", "水肿"]):
            matched_recipes.extend(list(queryset.filter(nutrient_tag__icontains="清淡")[: limit]))
            if len(matched_recipes) < limit:
                matched_recipes.extend(list(queryset.filter(nutrient_tag__icontains="低盐")[: limit - len(matched_recipes)]))

        if len(matched_recipes) < limit:
            remaining_needed = limit - len(matched_recipes)
            existing_ids = [r.id for r in matched_recipes]
            fallbacks = list(queryset.exclude(id__in=existing_ids).order_by("?")[: remaining_needed])
            matched_recipes.extend(fallbacks)

        items = []
        for recipe in matched_recipes:
            safe, _ = cls.check_food_safety(f"{recipe.title} {recipe.ingredients}")
            if not safe:
                continue
            items.append({
                "meal_name": recipe.title,
                "nutrient_tag": recipe.nutrient_tag or "均衡营养",
                "source_type": "platform",
                "source_id": recipe.id,
                "source_badge": f"[平台优选: {recipe.id}]",
                "ingredients": recipe.ingredients[:160],
                "steps": recipe.steps[:200] if recipe.steps else "",
                "benefits": recipe.nutrition_tip or "富含孕产期关键营养素，清淡好吸收。",
                "cover_image": recipe.cover_image or "",
                "safety_passed": True,
            })
        return items

    @classmethod
    def retrieve_searxng_fallback(
        cls,
        stage_desc: str,
        medical_history: Optional[List[str]] = None,
        limit: int = 3,
    ) -> List[Dict[str, Any]]:
        """通道二：触发 SearXNG 私有化元搜索抓取外部食谱"""
        history_keyword = ""
        if medical_history:
            if any("糖" in h or "gdm" in h for h in medical_history):
                history_keyword = "妊娠糖尿病 降糖"
            elif any("压" in h or "水肿" in h for h in medical_history):
                history_keyword = "妊娠高血压 控盐"
            elif any("吐" in h for h in medical_history):
                history_keyword = "孕吐缓解 清淡"

        query = f"{stage_desc} {history_keyword} 孕期营养食谱 做法 食材".strip()
        search_res = SearXNGClient.search_health(query, max_results=limit * 2)

        items = []
        for res in search_res:
            safe, _ = cls.check_food_safety(f"{res['title']} {res['body']}")
            if not safe:
                continue
            domain = res.get("source_domain") or "权威健康机构"
            # v1.57 食谱深度结构化：从检索正文正则提取食材用量列表，补全外部推荐卡片细节
            ingredients = cls.extract_ingredients_from_text(f"{res['title']} {res['body']}")
            items.append({
                "meal_name": res["title"][:28],
                "nutrient_tag": "权威联网推荐",
                "source_type": "searxng_fallback",
                "source_badge": f"[外部检索: {domain}]",
                "source_url": res["href"],
                "ingredients": ingredients if ingredients else "详见权威来源网页解析",
                "benefits": res["body"][:140],
                "safety_passed": True,
            })
            if len(items) >= limit:
                break
        return items

    @classmethod
    def assemble_full_plan(
        cls,
        gestational_week: Optional[int] = None,
        postpartum_months: Optional[int] = None,
        stage_type: str = "mid",
        medical_history: Optional[List[str]] = None,
        is_twins: bool = False,
    ) -> Dict[str, Any]:
        """组装一日五餐个性化方案与生活关怀建议"""
        period = cls.get_stage_key(gestational_week, stage_type)
        stage_label = "产后母乳期" if stage_type == "postpartum" else f"孕{gestational_week or 16}周"

        platform_items = cls.retrieve_platform_recipes(period, medical_history, limit=5)

        final_recipes = list(platform_items)
        if len(final_recipes) < 5:
            needed = 5 - len(final_recipes)
            searxng_items = cls.retrieve_searxng_fallback(stage_label, medical_history, limit=needed)
            final_recipes.extend(searxng_items)

        if len(final_recipes) < 5:
            defaults = [
                {"name": "燕麦坚果牛奶粥 + 水煮蛋", "tag": "优质蛋白/低GI", "ben": "平稳早间血糖，长效供能"},
                {"name": "番茄无糖酸奶杯 + 亚麻籽", "tag": "上午加餐/钙质", "ben": "促进肠道蠕动，补钙生津"},
                {"name": "清蒸鲈鱼 + 西兰花木耳 + 杂粮糙米饭", "tag": "午餐/DHA补铁", "ben": "补充脑发育DHA与微量元素"},
                {"name": "低脂鲜奶 + 蒸苹果/蓝莓", "tag": "下午加餐/维生素", "ben": "缓解下午饥饿，抗氧化"},
                {"name": "冬瓜虾仁豆腐汤 + 清炒芥蓝", "tag": "晚餐/低钠利尿", "ben": "减轻晚间下肢水肿负荷"},
            ]
            for idx in range(len(final_recipes), 5):
                item_def = defaults[idx]
                final_recipes.append({
                    "meal_name": item_def["name"],
                    "nutrient_tag": item_def["tag"],
                    "source_type": "platform",
                    "source_badge": "[平台指南推荐]",
                    "ingredients": "见菜品组成",
                    "benefits": item_def["ben"],
                    "safety_passed": True,
                })

        meal_types = [
            ("breakfast", "早餐 (7:30~8:30)"),
            ("morning_snack", "上午加餐 (10:00~10:30)"),
            ("lunch", "午餐 (12:00~13:00)"),
            ("afternoon_snack", "下午加餐 (15:30~16:00)"),
            ("dinner", "晚餐 (18:00~19:00)"),
        ]

        meals = []
        for i, (m_key, m_label) in enumerate(meal_types):
            r = final_recipes[i]
            r["meal_type"] = m_key
            r["meal_slot_label"] = m_label
            meals.append(r)

        if stage_type == "postpartum":
            exercise = [
                "产后 42 天内：卧床腹式深呼吸训练，轻柔凯格尔骨盆底肌收缩。",
                "产后 42 天至 3 个月：循序渐进进行温和快走 (20-30分钟/天)，避免负重跳跃。",
                "产后 3 个月以上：增加核心普拉提与低强度全身力量训练，重塑体态。",
            ]
            psychology = [
                "警惕产后情绪低落：与伴侣充分分担夜间育儿，保证连续 4 小时以上深度睡眠。",
                "允许自己做‘70 分妈妈’：接纳育儿中的不确定性，遇到喂养焦虑及时与专业医护倾诉。",
            ]
        elif gestational_week and gestational_week <= 13:
            exercise = [
                "孕早期避免剧烈跑跳与腹部压迫运动，可进行每日 20-30 分钟平地轻柔散步。",
                "如出现阴道流血、腹痛或剧吐头晕，应立即停止活动卧床静养。",
            ]
            psychology = [
                "早孕激素波动易引起情绪敏感，可适度听胎教音乐或进行正念呼吸放松身心。",
            ]
        else:
            exercise = [
                "每日规律散步 30-40 分钟，餐后半小时走动有助于平稳餐后血糖。",
                "每周可安排 2-3 次孕妇温和瑜伽或猫牛式伸展，缓解腰骶部酸痛。",
                "每日进行凯格尔运动（Kegel）3 组，增强骨盆底肌韧性，助力顺利分娩。",
            ]
            psychology = [
                "定期与家属沟通待产感受，提前熟悉分娩流程，减轻未知带来的分娩恐惧。",
            ]

        calorie_budget = "约 2100 ~ 2300 kcal/天"
        if stage_type == "postpartum":
            calorie_budget = "约 2300 ~ 2500 kcal/天（乳母推荐较孕前增加 500 kcal）"
        elif gestational_week and gestational_week <= 13:
            calorie_budget = "约 1800 ~ 2000 kcal/天（早期不宜过度盲目进补）"

        return {
            "meals": meals,
            "calorie_budget": calorie_budget,
            "lifestyle_care": {
                "exercise": exercise,
                "psychological_care": psychology,
            },
            "disclaimer": DISCLAIMER_TEXT,
        }

    @classmethod
    def build_personalized_diet_plan(
        cls,
        gestational_week: Optional[int] = None,
        stage_type: str = "pregnancy",
        bmi_category: str = "normal",
        medical_history: Optional[List[str]] = None,
        actual_gain: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """对齐视图层的个性化餐单生成方法"""
        plan = cls.assemble_full_plan(
            gestational_week=gestational_week,
            stage_type=stage_type,
            medical_history=medical_history,
        )
        return plan.get("meals", [])

    @classmethod
    def get_lifestyle_and_care(
        cls,
        gestational_week: Optional[int] = None,
        stage_type: str = "pregnancy",
        medical_history: Optional[List[str]] = None,
        bmi_category: str = "normal",
    ) -> Dict[str, Any]:
        """对齐视图层的生活方式与心理关怀方法"""
        plan = cls.assemble_full_plan(
            gestational_week=gestational_week,
            stage_type=stage_type,
            medical_history=medical_history,
        )
        return plan.get("lifestyle_care", {})
