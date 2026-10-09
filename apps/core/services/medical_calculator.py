# -*- coding: utf-8 -*-
"""国家卫健委《妊娠期妇女体重增长推荐值标准》(WS/T 801-2022) 核心医学计算引擎

提供：
1. 孕前 BMI 计算及分类 (WS/T 801-2022 中国单胎成人女性标准)
2. 全孕期总增重适宜区间计算
3. 动态孕周推荐增重基准区间与达标状态评估 (0~40周标准曲线数据流)
4. 双胎妊娠与产后能量代谢评估
5. 医学异常风险多维预警机制 (妊娠剧吐、子痫前期/水肿、FGR、巨大儿/GDM风险)
"""

import math
from typing import Dict, List, Optional, Tuple, Any

# WS/T 801-2022 单胎全孕期增重推荐参数
# 分类边界：低体重 < 18.5, 正常 18.5~23.9, 超重 24.0~27.9, 肥胖 >= 28.0
WS_T_801_RANGES = {
    "underweight": {
        "label": "低体重 (BMI < 18.5)",
        "total_min": 11.0,
        "total_max": 16.0,
        "early_min": 1.0,
        "early_max": 2.0,
        "mid_late_rate_min": 0.38,
        "mid_late_rate_max": 0.58,
        "mid_late_rate_median": 0.46,
    },
    "normal": {
        "label": "正常体重 (18.5 <= BMI < 24.0)",
        "total_min": 8.0,
        "total_max": 14.0,
        "early_min": 0.5,
        "early_max": 2.0,
        "mid_late_rate_min": 0.26,
        "mid_late_rate_max": 0.48,
        "mid_late_rate_median": 0.37,
    },
    "overweight": {
        "label": "超重 (24.0 <= BMI < 28.0)",
        "total_min": 7.0,
        "total_max": 11.0,
        "early_min": 0.5,
        "early_max": 1.5,
        "mid_late_rate_min": 0.22,
        "mid_late_rate_max": 0.37,
        "mid_late_rate_median": 0.30,
    },
    "obese": {
        "label": "肥胖 (BMI >= 28.0)",
        "total_min": 5.0,
        "total_max": 9.0,
        "early_min": 0.0,
        "early_max": 1.0,
        "mid_late_rate_min": 0.15,
        "mid_late_rate_max": 0.30,
        "mid_late_rate_median": 0.22,
    },
}

# 双胎妊娠全孕期增重参考 (IOM 2009 / 卫健委参考标准)
TWINS_RANGES = {
    "underweight": {"total_min": 18.0, "total_max": 25.0, "early_min": 1.5, "early_max": 3.0, "mid_late_rate_min": 0.55, "mid_late_rate_max": 0.75},
    "normal": {"total_min": 16.8, "total_max": 24.5, "early_min": 1.0, "early_max": 2.5, "mid_late_rate_min": 0.52, "mid_late_rate_max": 0.73},
    "overweight": {"total_min": 14.1, "total_max": 22.7, "early_min": 1.0, "early_max": 2.0, "mid_late_rate_min": 0.42, "mid_late_rate_max": 0.65},
    "obese": {"total_min": 11.3, "total_max": 19.1, "early_min": 0.5, "early_max": 1.5, "mid_late_rate_min": 0.35, "mid_late_rate_max": 0.55},
}


class MedicalCalculator:
    """国家卫健委标准医学计算与异常预警分析器"""

    @staticmethod
    def calculate_bmi(height_cm: float, weight_kg: float) -> float:
        """计算体重指数 BMI = 体重(kg) / 身高(m)^2"""
        if height_cm <= 0 or weight_kg <= 0:
            raise ValueError("身高和体重必须为正数")
        height_meters = height_cm / 100.0
        bmi_value = weight_kg / (height_meters * height_meters)
        return round(bmi_value, 2)

    @classmethod
    def get_bmi_category(cls, bmi: float) -> str:
        """根据中国成人女性标准划分 BMI 类别"""
        if bmi < 18.5:
            return "underweight"
        elif bmi < 24.0:
            return "normal"
        elif bmi < 28.0:
            return "overweight"
        else:
            return "obese"

    @classmethod
    def evaluate_weight_gain(
        cls,
        height_cm: float,
        pre_pregnancy_weight_kg: float,
        current_weight_kg: float,
        gestational_week: Optional[int] = None,
        is_twins: bool = False,
        stage_type: str = "pregnancy",
        postpartum_months: Optional[int] = None,
        medical_history: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """全面评估孕产妇体重增长及营养达标状态"""
        bmi = cls.calculate_bmi(height_cm, pre_pregnancy_weight_kg)
        category_key = cls.get_bmi_category(bmi)
        ranges_table = TWINS_RANGES if is_twins else WS_T_801_RANGES
        standards = ranges_table[category_key]

        actual_gain = round(current_weight_kg - pre_pregnancy_weight_kg, 2)
        medical_history = medical_history or []

        # 处理产后阶段
        if stage_type == "postpartum":
            months = postpartum_months or 1
            retention = actual_gain  # 产后体重滞留
            # 产后能量需求 (DRIs): 乳母增加约 500 kcal/d
            return {
                "bmi": bmi,
                "category": category_key,
                "category_label": WS_T_801_RANGES[category_key]["label"],
                "is_twins": is_twins,
                "stage_type": "postpartum",
                "postpartum_months": months,
                "weight_retention": retention,
                "energy_extra_kcal": 500,
                "protein_extra_g": 25,
                "actual_gain": actual_gain,
                "gain_status": "normal" if -2.0 <= retention <= 5.0 else ("above" if retention > 5.0 else "below"),
                "advice": "产后哺乳期建议保持每日约 2100~2300 kcal 能量摄入，重在补充优质蛋白与深色蔬菜，避免盲目剧烈节食。",
                "curve": [],
            }

        # 孕期阶段（默认以孕周为准）
        current_week = max(1, min(42, gestational_week or 12))

        # 计算当前孕周适宜累计增重区间
        if current_week <= 13:
            # 孕早期
            target_min = standards["early_min"] * (current_week / 13.0)
            target_max = standards["early_max"] * (current_week / 13.0)
        else:
            # 孕中晚期
            weeks_in_mid_late = current_week - 13
            target_min = standards["early_min"] + (weeks_in_mid_late * standards["mid_late_rate_min"])
            target_max = standards["early_max"] + (weeks_in_mid_late * standards["mid_late_rate_max"])

        target_min = round(target_min, 2)
        target_max = round(target_max, 2)

        # 判定达标状态
        if actual_gain < target_min - 0.5:
            gain_status = "below"
            gain_status_label = "增长不足"
        elif actual_gain > target_max + 0.5:
            gain_status = "above"
            gain_status_label = "增长超标"
        else:
            gain_status = "normal"
            gain_status_label = "增重达标"

        # 生成 0~40 周标准基线曲线数据点序列 (供前端 ECharts 渲染带状区间)
        curve_points = []
        for week_idx in range(0, 41):
            if week_idx == 0:
                w_min, w_max, w_mid = 0.0, 0.0, 0.0
            elif week_idx <= 13:
                fraction = week_idx / 13.0
                w_min = round(standards["early_min"] * fraction, 2)
                w_max = round(standards["early_max"] * fraction, 2)
                w_mid = round((w_min + w_max) / 2.0, 2)
            else:
                extra_weeks = week_idx - 13
                w_min = round(standards["early_min"] + (extra_weeks * standards["mid_late_rate_min"]), 2)
                w_max = round(standards["early_max"] + (extra_weeks * standards["mid_late_rate_max"]), 2)
                w_mid = round((w_min + w_max) / 2.0, 2)
            curve_points.append({
                "week": week_idx,
                "target_min": w_min,
                "target_max": w_max,
                "target_median": w_mid,
            })

        # 医学异常预警筛查
        alerts = cls.detect_medical_alerts(
            current_week=current_week,
            pre_weight=pre_pregnancy_weight_kg,
            current_weight=current_weight_kg,
            actual_gain=actual_gain,
            target_min=target_min,
            target_max=target_max,
            bmi_category=category_key,
            is_twins=is_twins,
            medical_history=medical_history,
        )

        return {
            "bmi": bmi,
            "category": category_key,
            "category_label": WS_T_801_RANGES[category_key]["label"],
            "is_twins": is_twins,
            "stage_type": "pregnancy",
            "gestational_week": current_week,
            "recommended_total_gain_min": standards["total_min"],
            "recommended_total_gain_max": standards["total_max"],
            "recommended_weekly_gain": f"{standards['mid_late_rate_min']} ~ {standards['mid_late_rate_max']} kg/周",
            "current_week_target_min": target_min,
            "current_week_target_max": target_max,
            "actual_gain": actual_gain,
            "gain_status": gain_status,
            "gain_status_label": gain_status_label,
            "alerts": alerts,
            "curve": curve_points,
        }

    @classmethod
    def detect_medical_alerts(
        cls,
        current_week: int,
        pre_weight: float,
        current_weight: float,
        actual_gain: float,
        target_min: float,
        target_max: float,
        bmi_category: str,
        is_twins: bool,
        medical_history: List[str],
    ) -> List[Dict[str, Any]]:
        """触发严谨的三级医学异常风险预警"""
        alerts = []
        normalized_history = [item.lower().strip() for item in medical_history]

        # 1. 剧吐脱水警报 (Hyperemesis Gravidarum Alert)
        weight_drop_percent = ((pre_weight - current_weight) / pre_weight) * 100.0 if current_weight < pre_weight else 0.0
        has_emesis_history = any("剧吐" in tag or "emesis" in tag for tag in normalized_history)

        if current_week <= 14 and (weight_drop_percent >= 5.0 or has_emesis_history and actual_gain < 0):
            alerts.append({
                "level": "danger",
                "code": "EMESIS_DEHYDRATION_ALERT",
                "title": "【严重警报】疑似妊娠剧吐与脱水代谢风险",
                "description": f"孕早期体重较孕前下降 {weight_drop_percent:.1f}% (>=5%)，已达到临床妊娠剧吐干预阈值，易引发酮症酸中毒与电解质紊乱。",
                "action_advice": "请立即前往医院产科急诊或门诊复查尿常规（检测尿酮体）与电解质，并在医生指导下静脉补液，暂停高脂油腻进食，少量多次饮用温柠檬水或电解质水。",
            })

        # 2. 子痫前期 / 突发性隐性水肿警报 (Preeclampsia & Edema Alert)
        has_htn = any("高血压" in tag or "hypertension" in tag or "子痫" in tag for tag in normalized_history)
        # 孕20周后，如果体重严重超额增长
        excess_over_max = actual_gain - target_max
        if current_week >= 20 and (has_htn or excess_over_max >= 2.5):
            alert_level = "danger" if (has_htn and excess_over_max >= 1.5) else "warning"
            alerts.append({
                "level": alert_level,
                "code": "PREECLAMPSIA_EDEMA_ALERT",
                "title": "【医学预警】突发性体重激增 / 子痫前期与隐性水肿风险",
                "description": f"孕 {current_week} 周体重增长已超出 WS/T 801-2022 推荐上限 {excess_over_max:.1f} kg，短期骤增多由体内水钠潴留引发，伴随子痫前期风险。",
                "action_advice": "建议每日固定早晨空腹监测血压并记录胎动，密切注意有无下肢凹陷性水肿、头晕、眼花或上腹痛，如有异常须即刻就诊排查尿蛋白。烹饪严格控盐 (<5g/天)。",
            })

        # 3. 胎儿生长受限 (FGR) 偏慢风险
        if current_week >= 20 and (target_min - actual_gain) >= 2.0:
            alerts.append({
                "level": "warning",
                "code": "FGR_GROWTH_RESTRICTION_RISK",
                "title": "【营养提示】体重增长落后 / 胎儿生长受限风险",
                "description": f"当前增重落后于同孕周适宜下限 {(target_min - actual_gain):.1f} kg，母体能量与微量元素储备偏低，可能影响胎儿宫内发育。",
                "action_advice": "建议适度增加鱼禽肉蛋奶等优质蛋白质摄入，两餐间增加坚果与酸奶加餐，并在下次常规产检时由超声科医生评估胎儿双顶径与腹围。",
            })

        # 4. 妊娠期糖尿病 (GDM) 控糖专责提醒
        has_gdm = any("糖尿病" in tag or "gdm" in tag or "血糖" in tag for tag in normalized_history)
        if has_gdm:
            alerts.append({
                "level": "warning",
                "code": "GDM_MANAGEMENT_NOTICE",
                "title": "【专病关怀】妊娠期糖尿病 (GDM) 血糖与体重双规管理",
                "description": "确诊妊娠期高血糖，全日进食必须遵循“低生糖指数 (低GI)、分餐制、高膳食纤维”原则，避免餐后血糖骤然飙升。",
                "action_advice": "推荐每日三正餐加二至三加餐，主食采用杂粮饭、全麦或燕麦替代白米白面，餐后 30 分钟进行温和散步 15~20 分钟，并定期监测餐后 2 小时血糖 (<6.7 mmol/L)。",
            })

        # 5. 双胎专属负荷预警
        if is_twins and current_week >= 28 and excess_over_max >= 3.0:
            alerts.append({
                "level": "info",
                "code": "TWINS_HEAVY_BURDEN",
                "title": "【双胎关怀】孕晚期宫腔张力与脊柱下肢负荷关怀",
                "description": "双胎妊娠晚期腹壁与盆底肌承受较大张力，增重偏高易增加早产与下肢静脉曲张几率。",
                "action_advice": "建议多采取左侧卧位休息，白天可使用医用托腹带缓解腰背负担，避免久站久坐，定期数胎动。",
            })

        return alerts
