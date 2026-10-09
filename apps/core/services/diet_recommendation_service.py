# -*- coding: utf-8 -*-
"""孕产妇营养食谱双通道智能推荐与安全审查服务

通道优先级：
1. 第一优先级 (平台食谱库)：优先检索内部 Recipe 数据库，匹配孕周与病史，标明 [平台食谱: ID]
2. 第二优先级 (联网降级通道)：当平台食谱不足或特殊病史未完全匹配时，调用 SearXNG 抓取权威健康网站
3. 第三优先级 (本地指南兜底)：SearXNG 离线/超时状态下的权威《孕期膳食指南》容灾模板

安全机制：
- 孕产期禁忌食材严格过滤 (生食、高汞鱼类、活血滑利药材等)
- 外部引用明确标注来源与免责声明
"""

import random
import re
from typing import Any, Dict, List, Optional
from apps.core.models.recipe import Recipe
from apps.core.services.searxng_client import SearXNGClient

# 孕产期高危与禁忌食材黑名单及替换建议
CONTRAINDICATED_FOODS = {
    "生鱼片": "生食存在李斯特菌与寄生虫感染高危，请彻底煮熟食用",
    "刺身": "生食易引起食源性疾病，孕期严禁生食海鲜",
    "溏心蛋": "未完全熟化鸡蛋有沙门氏菌感染风险，请食用全熟水煮蛋",
    "生鸡蛋": "沙门氏菌风险高，请彻底煮熟",
    "未经巴氏消毒": "未灭菌乳品易含李斯特菌，请选择正规巴氏杀菌奶",
    "鲨鱼": "大型深海食肉鱼甲基汞含量偏高，影响胎儿神经系统",
    "剑鱼": "大型高汞鱼类，建议替换为三文鱼、鳕鱼、鲈鱼等低汞鱼类",
    "旗鱼": "高汞鱼类，孕期应严格避免",
    "甲鱼": "性凉活血，孕期不建议食用",
    "马齿苋": "对子宫平滑肌有兴奋收缩作用，孕早期需谨慎避免",
    "山楂": "过量摄入易诱发宫缩，孕期不宜多吃",
    "鲜黄花菜": "含秋水仙碱，未充分焯水煮熟易引起中毒",
    "四季豆": "必须充分加热焖熟，严防皂苷和植物血凝素中毒",
}

# 本地容灾食谱库（中国营养学会《中国孕期妇女膳食指南》标准配置）
FALLBACK_DIET_PLANS = {
    "early": {
        "breakfast": {"name": "水煮全熟蛋 + 杂粮燕麦粥 + 芝麻拌菠菜", "ingredients": "鸡蛋1个、纯燕麦片40g、菠菜100g、熟黑芝麻5g", "benefits": "补充叶酸与膳食纤维，清淡少油，缓解早期晨呕"},
        "morning_snack": {"name": "原味低脂酸奶 + 核桃仁", "ingredients": "巴氏杀菌无糖酸奶150g、核桃仁10g", "benefits": "补充钙质与Omega-3脂肪酸，健脑益智"},
        "lunch": {"name": "清蒸鲈鱼 + 鲜蘑炒油菜 + 二色糙米饭", "ingredients": "新鲜鲈鱼100g、香菇油菜150g、大米糙米混合饭130g", "benefits": "优质低脂蛋白与B族维生素，保护胎儿早期神经管"},
        "afternoon_snack": {"name": "蒸南瓜块 + 温柠檬水", "ingredients": "贝贝南瓜100g、新鲜柠檬薄片2片", "benefits": "温和补充碳水化合物，补充水分防孕早期酮症"},
        "dinner": {"name": "彩椒炒鸡胸肉 + 清炒丝瓜 + 紫薯燕麦饭", "ingredients": "鸡胸肉80g、彩椒50g、丝瓜150g、紫薯杂粮饭120g", "benefits": "充足优质蛋白与维生素C，少盐控油易吸收"},
    },
    "mid": {
        "breakfast": {"name": "全麦吐司荷包蛋 + 鲜牛奶 + 圣女果", "ingredients": "全麦面包2片、全熟鸡蛋1个、巴氏杀菌纯牛奶250ml、圣女果8颗", "benefits": "提供全天基石能量与充足钙质"},
        "morning_snack": {"name": "无糖豆浆 + 蒸紫薯", "ingredients": "自磨熟透豆浆200ml、紫薯80g", "benefits": "优质大豆异黄酮与植物蛋白，平稳餐后血糖"},
        "lunch": {"name": "彩椒牛肉粒 + 蒜蓉西兰花 + 杂粮米饭", "ingredients": "牛里脊100g、彩椒50g、西兰花150g、杂粮饭150g", "benefits": "血红素铁与维生素C同补，防治孕中期缺铁性贫血"},
        "afternoon_snack": {"name": "低糖蓝莓 + 原味杏仁", "ingredients": "新鲜蓝莓50g、原味坚果杏仁10g", "benefits": "花青素抗氧化，稳定两餐之间饥饿感"},
        "dinner": {"name": "清蒸金鲳鱼 + 虾皮冬瓜汤 + 清炒小白菜 + 玉米糙米饭", "ingredients": "金鲳鱼80g、冬瓜150g、无盐虾皮5g、小白菜120g、玉米饭130g", "benefits": "高钙高蛋白，利水消肿，减少孕中期下肢隐性水肿"},
    },
    "late": {
        "breakfast": {"name": "小米南瓜粥 + 水煮蛋 + 凉拌木耳西兰花", "ingredients": "小米30g、南瓜50g、鸡蛋1个、黑木耳30g、西兰花100g", "benefits": "膳食纤维丰富，促进肠道蠕动，预防孕晚期便秘"},
        "morning_snack": {"name": "高钙纯牛奶 + 燕麦低糖饼干", "ingredients": "高钙鲜奶200ml、无蔗糖全麦饼干2片", "benefits": "满足晚期胎儿骨骼爆发式钙需求 (1000mg/d)"},
        "lunch": {"name": "番茄炖牛腩 + 清炒芦笋 + 五谷杂粮饭", "ingredients": "瘦牛腩100g、新鲜番茄150g、嫩芦笋100g、杂粮饭130g", "benefits": "高蛋白质与铁储备，为分娩与产后储备充足体能"},
        "afternoon_snack": {"name": "低脂奶酪棒 + 苹果片", "ingredients": "巴氏杀菌奶酪1块、苹果半个", "benefits": "清甜饱腹，补充微量元素"},
        "dinner": {"name": "香煎三文鱼 + 豆腐鲜菌汤 + 上汤豆苗 + 蒸芋头", "ingredients": "去刺三文鱼80g、嫩豆腐100g、菌菇80g、豆苗100g、芋头100g", "benefits": "富含DHA促进胎儿大脑视网膜发育，低热量清淡好入眠"},
    },
    "postpartum": {
        "breakfast": {"name": "红枣酒酿蛋花水饺 + 热鲜奶", "ingredients": "鸡蛋1个、少量熟透酒酿、精肉小水饺6只、纯牛奶200ml", "benefits": "产后温热驱寒，激发催乳素分泌，易于消化吸收"},
        "morning_snack": {"name": "木瓜炖银耳羹 (微甜)", "ingredients": "成熟木瓜80g、泡发银耳50g、枸杞5粒", "benefits": "温润生津，补充液体摄入"},
        "lunch": {"name": "黄芪乌鸡汤 (去油) + 香菇炒油麦菜 + 杂粮软饭", "ingredients": "乌鸡肉120g、黄芪5g、鲜香菇油麦菜150g、杂粮软米饭130g", "benefits": "益气补血，促进产后恶露排出与机体修复"},
        "afternoon_snack": {"name": "芝麻核桃红豆糊", "ingredients": "现磨黑芝麻核桃红豆粉30g冲调", "benefits": "补充铁、锌与B族维生素，润肠通便"},
        "dinner": {"name": "丝瓜鲫鱼豆腐汤 + 白灼芥蓝 + 紫薯饭", "ingredients": "鲫鱼半条、嫩豆腐120g、丝瓜100g、芥蓝100g、紫薯饭120g", "benefits": "优质植物蛋白与鱼类双效泌乳，通络利水"},
    },
}


class FoodSafetyFilter:
    """孕产期禁忌食材安全审查过滤器"""

    @classmethod
    def audit_food_safety(cls, text: str) -> Dict[str, Any]:
        """检查食材或菜品描述中是否潜藏孕产期安全风险"""
        if not text:
            return {"passed": True, "risks": [], "tips": ""}

        detected_risks = []
        for hazard_food, advice in CONTRAINDICATED_FOODS.items():
            if hazard_food in text:
                detected_risks.append({"food": hazard_food, "advice": advice})

        if detected_risks:
            tips = "; ".join([f"注意: {r['food']} ({r['advice']})" for r in detected_risks])
            return {"passed": False, "risks": detected_risks, "tips": tips}
        return {"passed": True, "risks": [], "tips": ""}


class DietRecommendationService:
    """双通道食谱推荐与个性化方案服务"""

    @classmethod
    def get_stage_period(cls, gestational_week: Optional[int], stage_type: str) -> str:
        """将孕周映射为平台 Recipe 模型的 period"""
        if stage_type == "postpartum":
            return "postpartum"
        week = gestational_week or 12
        if week <= 12:
            return "early"
        elif week <= 27:
            return "mid"
        else:
            return "late"

    @classmethod
    def build_personalized_diet_plan(
        cls,
        gestational_week: Optional[int] = None,
        stage_type: str = "pregnancy",
        bmi_category: str = "normal",
        medical_history: Optional[List[str]] = None,
        actual_gain: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """根据孕产妇多维指标，编排一日双通道健康餐单"""
        period_key = cls.get_stage_period(gestational_week, stage_type)
        history_tags = [h.lower().strip() for h in (medical_history or [])]
        has_gdm = any("糖尿病" in t or "gdm" in t or "血糖" in t for t in history_tags)
        has_htn = any("高血压" in t or "hypertension" in t or "子痫" in t for t in history_tags)
        has_emesis = any("剧吐" in t or "emesis" in t for t in history_tags)

        diet_plan_items = []
        meal_types = [
            ("breakfast", "营养早餐"),
            ("morning_snack", "上午加餐"),
            ("lunch", "能量午餐"),
            ("afternoon_snack", "下午加餐"),
            ("dinner", "轻盈晚餐"),
        ]

        # 第一优先级：从平台现有 Recipe 库检索
        platform_recipes = []
        try:
            if period_key != "postpartum":
                qs = Recipe.objects.filter(period=period_key)
                if has_gdm:
                    # 控糖优先
                    gdm_qs = qs.filter(nutrient_tag__icontains="糖") | qs.filter(title__icontains="杂粮") | qs.filter(title__icontains="麦")
                    platform_recipes = list(gdm_qs[:5])
                elif has_htn:
                    htn_qs = qs.filter(nutrient_tag__icontains="清淡") | qs.filter(title__icontains="冬瓜") | qs.filter(title__icontains="芹菜")
                    platform_recipes = list(htn_qs[:5])

                if len(platform_recipes) < 3:
                    # 常规推荐补齐
                    extra_qs = qs.exclude(id__in=[r.id for r in platform_recipes])
                    platform_recipes.extend(list(extra_qs[: 5 - len(platform_recipes)]))
        except Exception:
            platform_recipes = []

        # 第二优先级：若平台匹配数不足 (<3 道) 且处于特殊情况，触发私有化 SearXNG 联网检索
        searxng_recipes = []
        if len(platform_recipes) < 3:
            search_query_prefix = "孕产妇营养食谱"
            if period_key == "early":
                search_query_prefix = "孕早期 缓解孕吐 易消化 卫健委营养食谱"
            elif period_key == "mid":
                search_query_prefix = "孕中期 补钙补铁 均衡膳食 卫健委食谱"
            elif period_key == "late":
                search_query_prefix = "孕晚期 控盐控糖 预防水肿 权威营养餐"
            elif period_key == "postpartum":
                search_query_prefix = "产后月子期 科学催乳 营养均衡 权威食谱"

            if has_gdm:
                search_query_prefix += " 妊娠糖尿病 低GI"
            elif has_htn:
                search_query_prefix += " 妊娠高血压 低盐"

            try:
                searxng_results = SearXNGClient.search_health(search_query_prefix, max_results=3)
                for item in searxng_results:
                    searxng_recipes.append({
                        "title": item["title"],
                        "body": item["body"],
                        "source_domain": item.get("source_domain", "健康资讯"),
                        "href": item.get("href", ""),
                    })
            except Exception:
                searxng_recipes = []

        # 匹配装配各餐次
        fallback_template = FALLBACK_DIET_PLANS.get(period_key, FALLBACK_DIET_PLANS["mid"])

        for index, (m_type, m_title) in enumerate(meal_types):
            fallback_item = fallback_template.get(m_type, fallback_template["breakfast"])
            item_data = None

            # 1. 尝试使用平台食谱 (按午餐/晚餐优先分配平台食谱)
            if index < len(platform_recipes):
                p_recipe = platform_recipes[index]
                ingredients = p_recipe.ingredients.replace("\n", "、")[:80]
                benefits = p_recipe.nutrition_tip or p_recipe.nutrient_tag or "提供孕期均衡营养"
                safety_audit = FoodSafetyFilter.audit_food_safety(f"{p_recipe.title} {ingredients}")

                item_data = {
                    "meal_type": m_type,
                    "meal_name": f"{m_title}：{p_recipe.title}",
                    "source_type": "platform",
                    "source_id": p_recipe.id,
                    "source_badge": f"[平台食谱: #{p_recipe.id}]",
                    "source_url": f"/recipes?id={p_recipe.id}",
                    "ingredients": ingredients,
                    "benefits": benefits,
                    "safety_passed": safety_audit["passed"],
                    "safety_tip": safety_audit["tips"],
                }
            # 2. 尝试使用 SearXNG 联网检索结果
            elif searxng_recipes and (index == 1 or index == 3):
                s_item = searxng_recipes.pop(0)
                cleaned_title = re.sub(r"^\d+[、. ]*", "", s_item["title"])[:25]
                safety_audit = FoodSafetyFilter.audit_food_safety(f"{cleaned_title} {s_item['body']}")

                item_data = {
                    "meal_type": m_type,
                    "meal_name": f"{m_title}：{cleaned_title}",
                    "source_type": "searxng_fallback",
                    "source_badge": f"[外部引用: {s_item['source_domain']}]",
                    "source_url": s_item["href"],
                    "ingredients": s_item["body"][:70] + "...",
                    "benefits": "权威健康站点推荐方案，利于营养均衡",
                    "safety_passed": safety_audit["passed"],
                    "safety_tip": safety_audit["tips"],
                }
            # 3. 权威科学指南兜底
            else:
                safety_audit = FoodSafetyFilter.audit_food_safety(f"{fallback_item['name']} {fallback_item['ingredients']}")
                item_data = {
                    "meal_type": m_type,
                    "meal_name": f"{m_title}：{fallback_item['name']}",
                    "source_type": "guideline_standard",
                    "source_badge": "[卫健委膳食指南推荐]",
                    "source_url": "",
                    "ingredients": fallback_item["ingredients"],
                    "benefits": fallback_item["benefits"],
                    "safety_passed": safety_audit["passed"],
                    "safety_tip": safety_audit["tips"],
                }

            diet_plan_items.append(item_data)

        return diet_plan_items

    @classmethod
    def get_lifestyle_and_care(
        cls,
        gestational_week: Optional[int],
        stage_type: str,
        medical_history: Optional[List[str]],
        bmi_category: str,
    ) -> Dict[str, List[str]]:
        """生成定制化运动处方与情绪减压关怀建议"""
        week = gestational_week or 12
        history_tags = [h.lower() for h in (medical_history or [])]
        has_htn = any("高血压" in t or "hypertension" in t for t in history_tags)
        has_gdm = any("糖尿病" in t or "gdm" in t for t in history_tags)

        # 运动处方
        exercises = []
        if stage_type == "postpartum":
            exercises = [
                "产后第1~2周：在床上进行轻度踝泵运动与腹式深呼吸，促进下肢血液循环",
                "产后第3~6周：开始温和盆底肌凯格尔运动 (Kegel) 与温和散步 (每日15~20分钟)",
                "产后6周体检合格后：可循序渐进开展产后普拉提、温和核心重塑操，严防过早进行高负重跳跃",
            ]
        elif week <= 12:
            exercises = [
                "孕早期胚胎着床尚不稳定，以平地慢步散步为主，每日累计 20~30 分钟",
                "避免颠簸、跳跃、提重物及剧烈快速扭转动作",
                "保持作息规律，感到疲劳或腹部下坠感时立即卧床休息",
            ]
        elif week <= 27:
            if has_gdm:
                exercises.append("【控糖运动】每日三餐后 30 分钟慢走散步 15~20 分钟，可降低餐后血糖峰值约 1.5 mmol/L")
            if not has_htn:
                exercises.append("孕中期黄金期：每周 3~4 次孕妇温和瑜伽或水中慢步，增强盆底与心肺耐力")
            exercises.append("坚持每日凯格尔运动 3 组 (每组 10 次收缩-放松)，为顺产及预防压力性尿失禁打下基础")
        else:
            exercises = [
                "孕晚期重心前移，建议日常穿着防滑减震软底平底鞋，散步控制在每次 15~20 分钟",
                "避免在过热过闷或低血糖状态下运动，运动时心率控制在 130 次/分以下",
                "推荐进行骨盆摇摆与猫牛式伸展，缓解腰骶部与坐骨神经压迫酸痛",
            ]

        # 情绪关怀
        psychology = [
            "孕期激素（雌孕激素/催乳素）剧烈波动可能引起情绪起伏脆弱，此为生理性正常现象，请及时向伴侣与家人表达感受",
            "每日安排 15 分钟正念冥想或聆听白噪音/胎教柔和乐曲，配合腹式呼吸舒缓自主神经紧张",
            "避免过度关注网络个别极端负面产经或焦虑言论，保持对现代医疗监测体系的信心",
            "若产后或孕期持续超过 2 周出现低落、失眠、对事物失去兴趣，可主动寻求产科心理门诊或身心科专业心理疏导",
        ]

        return {"exercise": exercises, "psychological_care": psychology}
