# -*- coding: utf-8 -*-
"""
国家卫健委标准 (WS/T 801-2022) 妊娠期妇女体重增长推荐值与医学计算引擎
涵盖孕前 BMI 分级、单/双胎增重推荐区间、动态周数达标看板及三级医学异常预警。
"""
from typing import Any, Dict, List, Optional


class MedicalCalculator:
    """孕产妇健康与体重指标计算核心"""

    STANDARDS_SINGLE = {
        "underweight": {
            "label": "低体重 (BMI < 18.5)",
            "bmi_min": 0.0,
            "bmi_max": 18.49,
            "total_gain_min": 11.0,
            "total_gain_max": 16.0,
            "first_trimester_min": 1.0,
            "first_trimester_max": 2.0,
            "weekly_rate_min": 0.38,
            "weekly_rate_max": 0.58,
            "weekly_rate_label": "0.38 ~ 0.58 kg/周",
        },
        "normal": {
            "label": "正常体重 (18.5 <= BMI < 24.0)",
            "bmi_min": 18.5,
            "bmi_max": 23.99,
            "total_gain_min": 8.0,
            "total_gain_max": 14.0,
            "first_trimester_min": 0.5,
            "first_trimester_max": 2.0,
            "weekly_rate_min": 0.26,
            "weekly_rate_max": 0.48,
            "weekly_rate_label": "0.26 ~ 0.48 kg/周",
        },
        "overweight": {
            "label": "超重 (24.0 <= BMI < 28.0)",
            "bmi_min": 24.0,
            "bmi_max": 27.99,
            "total_gain_min": 7.0,
            "total_gain_max": 11.0,
            "first_trimester_min": 0.5,
            "first_trimester_max": 1.5,
            "weekly_rate_min": 0.22,
            "weekly_rate_max": 0.37,
            "weekly_rate_label": "0.22 ~ 0.37 kg/周",
        },
        "obese": {
            "label": "肥胖 (BMI >= 28.0)",
            "bmi_min": 28.0,
            "bmi_max": 99.0,
            "total_gain_min": 5.0,
            "total_gain_max": 9.0,
            "first_trimester_min": 0.0,
            "first_trimester_max": 1.0,
            "weekly_rate_min": 0.15,
            "weekly_rate_max": 0.30,
            "weekly_rate_label": "0.15 ~ 0.30 kg/周",
        },
    }

    STANDARDS_TWINS = {
        "underweight": {
            "label": "双胎-低体重 (BMI < 18.5)",
            "total_gain_min": 18.0,
            "total_gain_max": 25.0,
            "first_trimester_min": 1.5,
            "first_trimester_max": 3.0,
            "weekly_rate_min": 0.60,
            "weekly_rate_max": 0.85,
            "weekly_rate_label": "0.60 ~ 0.85 kg/周",
        },
        "normal": {
            "label": "双胎-正常体重 (18.5 <= BMI < 24.0)",
            "total_gain_min": 16.8,
            "total_gain_max": 24.5,
            "first_trimester_min": 1.0,
            "first_trimester_max": 2.8,
            "weekly_rate_min": 0.55,
            "weekly_rate_max": 0.78,
            "weekly_rate_label": "0.55 ~ 0.78 kg/周",
        },
        "overweight": {
            "label": "双胎-超重 (24.0 <= BMI < 28.0)",
            "total_gain_min": 14.1,
            "total_gain_max": 22.7,
            "first_trimester_min": 1.0,
            "first_trimester_max": 2.5,
            "weekly_rate_min": 0.45,
            "weekly_rate_max": 0.70,
            "weekly_rate_label": "0.45 ~ 0.70 kg/周",
        },
        "obese": {
            "label": "双胎-肥胖 (BMI >= 28.0)",
            "total_gain_min": 11.3,
            "total_gain_max": 19.1,
            "first_trimester_min": 0.5,
            "first_trimester_max": 2.0,
            "weekly_rate_min": 0.35,
            "weekly_rate_max": 0.60,
            "weekly_rate_label": "0.35 ~ 0.60 kg/周",
        },
    }

    @classmethod
    def calculate_bmi(cls, height_cm: float, weight_kg: float) -> float:
        if height_cm <= 0:
            return 0.0
        meter = height_cm / 100.0
        return round(weight_kg / (meter * meter), 2)

    @classmethod
    def get_bmi_category_key(cls, bmi: float) -> str:
        if bmi < 18.5:
            return "underweight"
        if bmi < 24.0:
            return "normal"
        if bmi < 28.0:
            return "overweight"
        return "obese"

    @classmethod
    def calculate_evaluation(
        cls,
        height_cm: float,
        pre_pregnancy_weight_kg: float,
        current_weight_kg: float,
        gestational_week: Optional[int] = None,
        postpartum_months: Optional[int] = None,
        is_twins: bool = False,
        stage_type: str = "mid",
    ) -> Dict[str, Any]:
        bmi = cls.calculate_bmi(height_cm, pre_pregnancy_weight_kg)
        category_key = cls.get_bmi_category_key(bmi)
        standard_map = cls.STANDARDS_TWINS if is_twins else cls.STANDARDS_SINGLE
        std = standard_map[category_key]
        actual_gain = round(current_weight_kg - pre_pregnancy_weight_kg, 2)

        if stage_type in ("postpartum", "general") or (postpartum_months is not None and postpartum_months >= 0):
            months = postpartum_months or 0
            ppwr = actual_gain
            if stage_type == "general":
                # v1.56：非孕期（备孕/日常）体重管理——无孕周增重通道，以 BMI 与较基线差值评估
                summary = "非孕期体重管理阶段：保持均衡膳食与规律运动，将体重维持在健康 BMI 区间（18.5 ~ 23.9）内。"
            elif months <= 6:
                summary = f"产后 {months} 个月处于母乳黄金期，每日基础热量推荐增加约 500 kcal，忌盲目过度断食。"
            else:
                summary = f"产后 {months} 个月处于体形恢复期，建议将体重平稳过渡恢复至孕前基线区间。"

            return {
                "bmi": bmi,
                "category": category_key,
                "category_label": std["label"],
                "recommended_total_gain_min": std["total_gain_min"],
                "recommended_total_gain_max": std["total_gain_max"],
                "recommended_weekly_gain": std["weekly_rate_label"],
                "current_week_target_min": 0.0,
                "current_week_target_max": std["total_gain_max"],
                "actual_gain": actual_gain,
                "postpartum_retention": ppwr,
                "gain_status": "normal" if ppwr <= 5.0 else "above",
                "stage_summary": summary,
            }

        week = max(1, min(gestational_week or 16, 42))
        if week <= 13:
            week_min = std["first_trimester_min"]
            week_max = std["first_trimester_max"]
        else:
            diff_weeks = week - 13
            week_min = round(std["first_trimester_min"] + diff_weeks * std["weekly_rate_min"], 2)
            week_max = round(std["first_trimester_max"] + diff_weeks * std["weekly_rate_max"], 2)

        if actual_gain < week_min:
            gain_status = "below"
        elif actual_gain > week_max:
            gain_status = "above"
        else:
            gain_status = "normal"

        return {
            "bmi": bmi,
            "category": category_key,
            "category_label": std["label"],
            "recommended_total_gain_min": std["total_gain_min"],
            "recommended_total_gain_max": std["total_gain_max"],
            "recommended_weekly_gain": std["weekly_rate_label"],
            "current_week_target_min": week_min,
            "current_week_target_max": week_max,
            "actual_gain": actual_gain,
            "gain_status": gain_status,
            "gestational_week": week,
            "stage_summary": f"当前孕 {week} 周，卫健委建议累计增重 {week_min} ~ {week_max} kg，实测增重 {actual_gain:+.2f} kg。",
        }

    @classmethod
    def generate_trajectory(cls, bmi: float, is_twins: bool = False) -> List[Dict[str, Any]]:
        category_key = cls.get_bmi_category_key(bmi)
        standard_map = cls.STANDARDS_TWINS if is_twins else cls.STANDARDS_SINGLE
        std = standard_map[category_key]

        trajectory = []
        for week in range(1, 41):
            if week <= 13:
                ratio = week / 13.0
                t_min = round(std["first_trimester_min"] * ratio, 2)
                t_max = round(std["first_trimester_max"] * ratio, 2)
            else:
                diff_weeks = week - 13
                t_min = round(std["first_trimester_min"] + diff_weeks * std["weekly_rate_min"], 2)
                t_max = round(std["first_trimester_max"] + diff_weeks * std["weekly_rate_max"], 2)
            median = round((t_min + t_max) / 2.0, 2)
            trajectory.append({
                "week": week,
                "target_min": t_min,
                "target_max": t_max,
                "target_median": median,
            })
        return trajectory

    @classmethod
    def detect_medical_alerts(
        cls,
        height_cm: float,
        pre_pregnancy_weight_kg: float,
        current_weight_kg: float,
        gestational_week: Optional[int] = None,
        postpartum_months: Optional[int] = None,
        stage_type: str = "mid",
        medical_history: Optional[List[str]] = None,
        is_twins: bool = False,
    ) -> List[Dict[str, Any]]:
        alerts = []
        history = [str(item).lower() for item in (medical_history or [])]
        actual_gain = current_weight_kg - pre_pregnancy_weight_kg
        loss_ratio = (pre_pregnancy_weight_kg - current_weight_kg) / pre_pregnancy_weight_kg if pre_pregnancy_weight_kg > 0 else 0.0

        is_early = stage_type == "early" or (gestational_week is not None and gestational_week <= 14)
        if is_early and (loss_ratio >= 0.05 or any(k in h for h in history for k in ["剧吐", "emesis", "呕吐"])):
            alerts.append({
                "level": "danger",
                "code": "EMESIS_ALERT",
                "title": "【严重预警】妊娠剧吐脱水风险警报",
                "description": f"孕早期体重较孕前已下降 {loss_ratio * 100:.1f}%（>=5% 临床诊断阈值），伴恶心呕吐，极易引发水电解质紊乱及尿酮体强阳性。",
                "action_advice": "请立即前往医院产科就诊，检查尿常规酮体与电解质，遵医嘱进行补液与止吐对症治疗，切勿盲目硬撑。",
            })

        if gestational_week and gestational_week >= 20:
            bmi = cls.calculate_bmi(height_cm, pre_pregnancy_weight_kg)
            cat = cls.get_bmi_category_key(bmi)
            std = cls.STANDARDS_TWINS[cat] if is_twins else cls.STANDARDS_SINGLE[cat]
            diff_weeks = gestational_week - 13
            upper_limit = std["first_trimester_max"] + diff_weeks * std["weekly_rate_max"]
            has_hypertension = any(k in h for h in history for k in ["高血压", "hypertension", "子痫", "preeclampsia", "水肿"])

            if (actual_gain - upper_limit >= 3.0) or (has_hypertension and actual_gain > upper_limit):
                alerts.append({
                    "level": "danger",
                    "code": "PREECLAMPSIA_ALERT",
                    "title": "【高危预警】显性水肿 / 子痫前期风险警报",
                    "description": f"孕 {gestational_week} 周体重增长已超出权威上限 {actual_gain - upper_limit:.1f} kg。短期体重暴增极可能是隐性水肿表现，合并高血压风险高。",
                    "action_advice": "请保持每日早晚监测血压，关注有无头晕、眼花、下肢凹陷性水肿及胸闷，尽快就医复查尿蛋白与产科超声。",
                })

        if gestational_week and gestational_week >= 20:
            bmi = cls.calculate_bmi(height_cm, pre_pregnancy_weight_kg)
            cat = cls.get_bmi_category_key(bmi)
            std = cls.STANDARDS_TWINS[cat] if is_twins else cls.STANDARDS_SINGLE[cat]
            diff_weeks = gestational_week - 13
            lower_limit = std["first_trimester_min"] + diff_weeks * std["weekly_rate_min"]
            if actual_gain < lower_limit - 1.5:
                alerts.append({
                    "level": "warning",
                    "code": "FGR_DEFICIT_ALERT",
                    "title": "【重点关注】孕中晚期增重显著滞后",
                    "description": f"当前实际增重低于国家卫健委推荐下限 {lower_limit - actual_gain:.1f} kg，可能与母体热量蛋白质摄入不足有关。",
                    "action_advice": "建议每餐增加 1 份优质蛋白质（鸡蛋、瘦肉、鱼虾或豆腐），并在下次产检时核对胎儿双顶径与腹围发育百分位。",
                })

        if any(k in h for h in history for k in ["糖尿病", "gdm", "血糖"]) or actual_gain > 18.0:
            alerts.append({
                "level": "warning",
                "code": "GDM_DIET_ALERT",
                "title": "【营养控糖】妊娠期糖代谢与低GI食谱提示",
                "description": "监测到妊娠期糖尿病(GDM)病史或增重增速偏高，必须执行平稳血糖饮食方案，严格控制单糖和精制碳水化合物摄入。",
                "action_advice": "主食建议 1/3 替换为燕麦、糙米或杂粮；遵循少食多餐（三正餐+两小加餐），餐后 30 分钟进行温和散步以稳定血糖。",
            })

        if is_twins:
            alerts.append({
                "level": "info",
                "code": "TWINS_SPECIAL_CARE",
                "title": "【双胎关怀】双胎妊娠能量与铁钙储备要求",
                "description": "双胎妊娠母体子宫负荷与胎儿营养需求显著增加，推荐增重区间已自动匹配双胎医学基线（正常体重全孕期约 16.8~24.5 kg）。",
                "action_advice": "需特别注重铁剂、叶酸与钙质的足量补充，预防晚期贫血与早产，产检随访频率应高于单胎。",
            })

        return alerts

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
        """统一对齐 HealthBmiAnalysisView 的评估入口"""
        evaluation = cls.calculate_evaluation(
            height_cm=height_cm,
            pre_pregnancy_weight_kg=pre_pregnancy_weight_kg,
            current_weight_kg=current_weight_kg,
            gestational_week=gestational_week,
            postpartum_months=postpartum_months,
            is_twins=is_twins,
            stage_type=stage_type,
        )
        gain_status = evaluation.get("gain_status", "normal")
        status_map = {
            "below": "增重不足（低于卫健委适宜下限）",
            "normal": "增重达标（处于推荐适宜区间）",
            "above": "增重超标（超出推荐上限）",
        }
        evaluation["gain_status_label"] = status_map.get(gain_status, "正常范围")
        # v1.56：阶段归一化（pregnancy / postpartum / general 非孕期）
        evaluation["stage_type"] = {
            "postpartum": "postpartum",
            "general": "general",
        }.get(stage_type, "pregnancy")
        evaluation["is_twins"] = bool(is_twins)

        alerts = cls.detect_medical_alerts(
            height_cm=height_cm,
            pre_pregnancy_weight_kg=pre_pregnancy_weight_kg,
            current_weight_kg=current_weight_kg,
            gestational_week=gestational_week,
            postpartum_months=postpartum_months,
            stage_type=stage_type,
            medical_history=medical_history,
            is_twins=is_twins,
        )
        evaluation["alerts"] = alerts
        # WS/T 801-2022 全孕期推荐增重曲线（前端 BmiAnalysisView 与 WeightGainChart 依赖 curve 字段）
        evaluation["curve"] = cls.generate_trajectory(evaluation["bmi"], is_twins=is_twins)
        return evaluation
