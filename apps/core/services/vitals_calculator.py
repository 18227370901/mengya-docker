# -*- coding: utf-8 -*-
"""
妈妈生命体征（血压、血糖）临床规则与医学评估引擎
标准参考：
1. 中华医学会妇产科学分会《妊娠期高血压疾病诊治指南》与 WS/T 标准
2. 中华医学会妇产科学分会《妊娠期高血糖诊治指南(2021)》
3. 中华医学会糖尿病学分会《中国2型糖尿病防治指南》
"""
from typing import Any, Dict, List, Optional


class VitalsCalculator:
    """血压、血糖与生命体征临床规则计算与分级评估器"""

    # 血压分级阈值配置 (mmHg)
    BP_LEVELS = {
        "hypotension": {
            "key": "hypotension",
            "label": "偏低",
            "severity": "warning",
            "color": "blue",
            "desc": "收缩压 < 90 或 舒张压 < 60 mmHg",
        },
        "normal": {
            "key": "normal",
            "label": "理想健康",
            "severity": "info",
            "color": "green",
            "desc": "收缩压 90~119 且 舒张压 60~79 mmHg",
        },
        "elevated": {
            "key": "elevated",
            "label": "正常高值 / 预警",
            "severity": "warning",
            "color": "yellow",
            "desc": "收缩压 120~139 或 舒张压 80~89 mmHg",
        },
        "hypertension_stage1": {
            "key": "hypertension_stage1",
            "label": "轻度偏高 (妊娠高血压预警)",
            "severity": "warning",
            "color": "orange",
            "desc": "收缩压 140~159 或 舒张压 90~109 mmHg",
        },
        "hypertension_severe": {
            "key": "hypertension_severe",
            "label": "重度偏高 (急症风险警报)",
            "severity": "danger",
            "color": "red",
            "desc": "收缩压 >= 160 或 舒张压 >= 110 mmHg",
        },
    }

    # 血糖场景标签与说明
    GLUCOSE_SCENARIOS = {
        "fasting": "空腹",
        "postprandial_1h": "餐后1小时",
        "postprandial_2h": "餐后2小时",
        "bedtime": "睡前",
        "random": "随机",
    }

    @classmethod
    def evaluate_blood_pressure(
        cls,
        systolic: float,
        diastolic: float,
        pulse: Optional[float] = None,
        stage_type: str = "pregnancy",
    ) -> Dict[str, Any]:
        """
        临床评估血压数值
        支持孕期生理性评估与非孕期评估
        """
        sbp = float(systolic)
        dbp = float(diastolic)

        if sbp >= 160 or dbp >= 110:
            status_key = "hypertension_severe"
            advice = (
                "【紧急医疗警报】血压达到重度高血压警戒线（>=160/110 mmHg）！存在重度子痫前期及母婴急症风险。"
                "若伴随持续头痛、视物模糊、右上腹痛或胎动异常，请立即由家属陪同前往综合医院产科急诊就诊！"
            )
        elif sbp >= 140 or dbp >= 90:
            status_key = "hypertension_stage1"
            advice = (
                "已达到妊娠期高血压临床警戒标准（>=140/90 mmHg）。建议尽快就医产检并查尿蛋白与胎心彩超。"
                "日常需严格低盐饮食（每日食盐<5g），保持左侧卧位休息，保证每天 8~10 小时睡眠。"
            )
        elif sbp >= 120 or dbp >= 80:
            status_key = "elevated"
            advice = (
                "处于正常高值预警区间。孕产期机体对血压较为敏感，建议每日早晚定点测量并记录。"
                "避免高盐高脂加工食品，保持情绪平稳与充足睡眠，适当进行散步放松。"
            )
        elif sbp < 90 or dbp < 60:
            status_key = "hypotension"
            advice = (
                "血压偏低。孕期由于血管扩张部分妈妈会出现生理性低血压。"
                "起床和改变体位时动作宜缓慢，避免空腹久站以防体位性眩晕；若伴随乏力眼花，请复查血常规排查贫血。"
            )
        else:
            status_key = "normal"
            advice = "血压读数处于理想健康区间，胎盘血流灌注良好。请继续保持清淡平衡膳食与规律作息。"

        config = cls.BP_LEVELS[status_key]

        pulse_info = None
        if pulse is not None:
            p = float(pulse)
            max_normal_pulse = 110 if stage_type == "pregnancy" else 100
            min_normal_pulse = 60
            if p > max_normal_pulse:
                pulse_status = "tachycardia"
                pulse_label = "心率偏快"
                pulse_desc = f"静息脉搏 {p} 次/分，孕期血容量增加可使心率轻微增快，如持续高于 110 次/分或伴心慌胸闷需就医。"
            elif p < min_normal_pulse:
                pulse_status = "bradycardia"
                pulse_label = "心率偏慢"
                pulse_desc = f"静息脉搏 {p} 次/分，低于常规静息标准，请关注是否伴随头晕乏力。"
            else:
                pulse_status = "normal"
                pulse_label = "正常"
                pulse_desc = f"静息脉搏 {p} 次/分，节律正常。"
            pulse_info = {
                "pulse": p,
                "status": pulse_status,
                "label": pulse_label,
                "desc": pulse_desc,
            }

        return {
            "systolic": sbp,
            "diastolic": dbp,
            "pulse": pulse,
            "pulse_info": pulse_info,
            "status": status_key,
            "status_label": config["label"],
            "severity": config["severity"],
            "color": config["color"],
            "definition": config["desc"],
            "clinical_advice": advice,
            "stage_type": stage_type,
        }

    @classmethod
    def evaluate_blood_sugar(
        cls,
        glucose: float,
        glucose_type: str = "fasting",
        stage_type: str = "pregnancy",
    ) -> Dict[str, Any]:
        """
        临床评估血糖数值
        区分孕期标准（妊娠期高血糖 GDM 标准）与非孕期标准
        """
        val = round(float(glucose), 2)
        scene = glucose_type if glucose_type in cls.GLUCOSE_SCENARIOS else "fasting"
        scene_label = cls.GLUCOSE_SCENARIOS.get(scene, "空腹")
        is_pregnancy = (stage_type == "pregnancy")

        status_key = "normal"
        status_label = "正常达标"
        severity = "info"
        color = "green"
        advice = ""
        target_range = ""

        if is_pregnancy:
            if scene == "fasting":
                target_range = "3.1 ~ 5.1 mmol/L"
                if val < 3.1:
                    status_key = "hypoglycemia"
                    status_label = "偏低 (低血糖风险)"
                    severity = "warning"
                    color = "blue"
                    advice = "空腹血糖偏低，可能引起头晕、心慌、出冷汗。建议随身备好苏打饼干或水果糖，睡前可适量加餐（如半杯温牛奶）。"
                elif val <= 5.1:
                    status_key = "normal"
                    status_label = "正常达标"
                    advice = "空腹血糖达标（3.1~5.1 mmol/L），糖代谢维持平稳，请继续保持健康均衡饮食。"
                elif val < 7.0:
                    status_key = "elevated"
                    status_label = "偏高 (GDM筛查异常线)"
                    severity = "warning"
                    color = "orange"
                    advice = "空腹血糖达到或超过孕期 GDM 诊断阈值（>=5.1 mmol/L）。建议控制精制碳水摄入，增加粗杂粮比例，并前往产科内分泌门诊进一步做 OGTT 复查。"
                else:
                    status_key = "high"
                    status_label = "显著升高"
                    severity = "danger"
                    color = "red"
                    advice = "空腹血糖显著升高（>=7.0 mmol/L），提示显性糖尿病可能。必须严格就医，在产科医生与营养师指导下规范干预，必要时启动胰岛素治疗。"
            elif scene == "postprandial_1h":
                target_range = "4.0 ~ 7.8 mmol/L (上限 < 10.0)"
                if val < 4.0:
                    status_key = "hypoglycemia"
                    status_label = "偏低"
                    severity = "warning"
                    color = "blue"
                    advice = "餐后1小时血糖偏低，请关注是否有乏力出汗等症状，避免碳水过低或运动过量。"
                elif val <= 7.8:
                    status_key = "normal"
                    status_label = "理想达标"
                    advice = "餐后1小时血糖非常理想（<=7.8 mmol/L），餐后升糖平稳。"
                elif val < 10.0:
                    status_key = "elevated"
                    status_label = "轻度偏高"
                    severity = "warning"
                    color = "orange"
                    advice = "餐后1小时血糖轻微偏高（7.8~10.0 mmol/L）。建议注意进餐顺序（先蔬菜、再蛋白质、最后主食），餐后 30 分钟适度散步。"
                else:
                    status_key = "high"
                    status_label = "显著升高"
                    severity = "danger"
                    color = "red"
                    advice = "餐后1小时血糖超标（>=10.0 mmol/L）。需严格限制甜食、稀饭及精米白面，建议就医咨询营养控糖处方。"
            elif scene == "postprandial_2h":
                target_range = "4.4 ~ 6.7 mmol/L (上限 < 8.5)"
                if val < 4.0:
                    status_key = "hypoglycemia"
                    status_label = "偏低"
                    severity = "warning"
                    color = "blue"
                    advice = "餐后2小时血糖偏低，注意规律三餐加餐，避免长时间饥饿。"
                elif val <= 6.7:
                    status_key = "normal"
                    status_label = "理想达标"
                    advice = "餐后2小时血糖控制极佳（<=6.7 mmol/L），符合孕期严格控糖标准。"
                elif val < 8.5:
                    status_key = "elevated"
                    status_label = "轻度升高 (超出孕期理想值)"
                    severity = "warning"
                    color = "orange"
                    advice = "餐后2小时血糖略超孕期理想范围（6.7~8.4 mmol/L）。建议减少该餐碳水化合物总量，增加富含膳食纤维蔬菜，餐后散步 20~30 分钟。"
                else:
                    status_key = "high"
                    status_label = "异常升高"
                    severity = "danger"
                    color = "red"
                    advice = "餐后2小时血糖达到 GDM 异常诊断线（>=8.5 mmol/L）。请尽快去医院产科/内分泌科复查并制定医学营养治疗方案。"
            else:  # bedtime or random
                target_range = "4.4 ~ 6.7 mmol/L"
                if val < 4.0:
                    status_key = "hypoglycemia"
                    status_label = "偏低"
                    severity = "warning"
                    color = "blue"
                    advice = "睡前/随机血糖偏低，睡前可适量补充低脂牛奶或燕麦饼干，预防夜间低血糖发生。"
                elif val <= 6.7:
                    status_key = "normal"
                    status_label = "正常达标"
                    advice = "睡前/随机血糖正常，代谢平稳。"
                elif val < 10.0:
                    status_key = "elevated"
                    status_label = "偏高"
                    severity = "warning"
                    color = "orange"
                    advice = "睡前/随机血糖略偏高，晚餐需避免高糖高油进食，睡前两小时内不宜加餐甜点。"
                else:
                    status_key = "high"
                    status_label = "显著偏高"
                    severity = "danger"
                    color = "red"
                    advice = "随机血糖显著升高（>=10.0 mmol/L），需警惕糖代谢异常，建议就医完善糖化血红蛋白检查。"
        else:
            # 非孕期/产后普通标准
            if scene == "fasting":
                target_range = "3.9 ~ 6.1 mmol/L"
                if val < 3.9:
                    status_key = "hypoglycemia"
                    status_label = "偏低"
                    severity = "warning"
                    color = "blue"
                    advice = "空腹血糖偏低，注意按时规律进餐。"
                elif val <= 6.1:
                    status_key = "normal"
                    status_label = "正常达标"
                    advice = "空腹血糖在普通成年人正常范围。"
                elif val < 7.0:
                    status_key = "elevated"
                    status_label = "空腹血糖受损 (IFG)"
                    severity = "warning"
                    color = "orange"
                    advice = "空腹血糖处于糖尿病前期水平，建议控糖减脂并定期复查。"
                else:
                    status_key = "high"
                    status_label = "显著升高"
                    severity = "danger"
                    color = "red"
                    advice = "空腹血糖达到糖尿病诊断线（>=7.0 mmol/L），请到内分泌科正规确诊。"
            else:
                target_range = "4.4 ~ 7.8 mmol/L"
                if val < 4.4:
                    status_key = "hypoglycemia"
                    status_label = "偏低"
                    severity = "warning"
                    color = "blue"
                    advice = "血糖偏低，注意补充碳水。"
                elif val <= 7.8:
                    status_key = "normal"
                    status_label = "正常达标"
                    advice = "餐后血糖在正常达标区间。"
                elif val < 11.1:
                    status_key = "elevated"
                    status_label = "糖耐量受损 (IGT)"
                    severity = "warning"
                    color = "orange"
                    advice = "餐后血糖处于糖尿病前期范围，建议注意主食粗细搭配，加强体育锻炼。"
                else:
                    status_key = "high"
                    status_label = "显著偏高"
                    severity = "danger"
                    color = "red"
                    advice = "餐后血糖达到糖尿病诊断标准（>=11.1 mmol/L），请尽快就诊。"

        return {
            "glucose": val,
            "glucose_type": scene,
            "glucose_type_label": scene_label,
            "target_range": target_range,
            "status": status_key,
            "status_label": status_label,
            "severity": severity,
            "color": color,
            "clinical_advice": advice,
            "stage_type": stage_type,
        }

    @classmethod
    def build_metrics_completeness(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        分析本次录入的数据完备度，明确标出已录入与未录入指标项
        满足用户“清晰看到添加了哪些数据、未录入数据做说明”的需求
        """
        has_bp = bool(
            data.get("systolic_bp") is not None and data.get("diastolic_bp") is not None
        )
        has_glucose = bool(data.get("blood_sugar") is not None)
        has_weight = bool(data.get("weight") is not None)
        has_pulse = bool(data.get("pulse") is not None)

        recorded_items: List[Dict[str, Any]] = []
        unrecorded_items: List[Dict[str, Any]] = []

        if has_bp:
            sbp = data.get("systolic_bp")
            dbp = data.get("diastolic_bp")
            recorded_items.append({
                "key": "blood_pressure",
                "label": "血压",
                "value": f"{sbp}/{dbp} mmHg",
                "badge": "已录入",
                "status": data.get("bp_status", "normal"),
                "status_label": data.get("bp_status_label", "已测定"),
            })
        else:
            unrecorded_items.append({
                "key": "blood_pressure",
                "label": "血压",
                "hint": "本次未录入血压数值。孕中晚期易发生妊娠期高血压，建议常规自测血压。",
            })

        if has_pulse:
            recorded_items.append({
                "key": "pulse",
                "label": "脉搏",
                "value": f"{data.get('pulse')} 次/分",
                "badge": "已录入",
                "status": "info",
                "status_label": "正常",
            })
        else:
            unrecorded_items.append({
                "key": "pulse",
                "label": "脉搏",
                "hint": "本次未录入脉搏（心率）。如测血压时有脉搏读数可一并记录。",
            })

        if has_glucose:
            glu = data.get("blood_sugar")
            gtype = data.get("glucose_type_label") or cls.GLUCOSE_SCENARIOS.get(
                data.get("glucose_type", "fasting"), "空腹"
            )
            recorded_items.append({
                "key": "blood_sugar",
                "label": "血糖",
                "value": f"{glu} mmol/L ({gtype})",
                "badge": "已录入",
                "status": data.get("glucose_status", "normal"),
                "status_label": data.get("glucose_status_label", "已测定"),
            })
        else:
            unrecorded_items.append({
                "key": "blood_sugar",
                "label": "血糖",
                "hint": "本次未录入血糖值。孕 24~28 周是 GDM 高发期，若近期有血糖检测可随时补充。",
            })

        if has_weight:
            w = data.get("weight")
            recorded_items.append({
                "key": "weight",
                "label": "体重",
                "value": f"{w} kg",
                "badge": "已录入",
                "status": "info",
                "status_label": f"BMI {data.get('bmi', '--')}" if data.get("bmi") else "已称重",
            })
        else:
            unrecorded_items.append({
                "key": "weight",
                "label": "体重 / BMI",
                "hint": "本次未录入体重。若需评估孕期体重增幅曲线及每日能量推荐，可在体重/BMI模块中录入。",
            })

        rec_labels = [item["label"] for item in recorded_items]
        unrec_labels = [item["label"] for item in unrecorded_items]

        if rec_labels and unrec_labels:
            summary_text = f"本次已录入：{'、'.join(rec_labels)}；未录入：{'、'.join(unrec_labels)}。"
        elif rec_labels:
            summary_text = f"本次已全量录入：{'、'.join(rec_labels)}，数据完备度极佳！"
        else:
            summary_text = "本次尚未录入有效测量数据。"

        return {
            "has_bp": has_bp,
            "has_glucose": has_glucose,
            "has_weight": has_weight,
            "has_pulse": has_pulse,
            "recorded_items": recorded_items,
            "unrecorded_items": unrecorded_items,
            "recorded_count": len(recorded_items),
            "unrecorded_count": len(unrecorded_items),
            "summary_text": summary_text,
        }

    @classmethod
    def detect_vitals_alerts(
        cls,
        bp_eval: Optional[Dict[str, Any]] = None,
        glucose_eval: Optional[Dict[str, Any]] = None,
        symptoms: Optional[List[str]] = None,
        stage_type: str = "pregnancy",
    ) -> List[Dict[str, Any]]:
        """生成多级医学警报与临床就医指导"""
        alerts: List[Dict[str, Any]] = []
        syms = symptoms or []

        if bp_eval and bp_eval.get("status") == "hypertension_severe":
            alerts.append({
                "level": "danger",
                "code": "BP_SEVERE_HYPERTENSION",
                "title": "【高危急症】重度高血压警戒 (>=160/110 mmHg)",
                "description": f"当前收缩压 {bp_eval['systolic']} / 舒张压 {bp_eval['diastolic']} mmHg 达到重度高血压线。孕期存在子痫前期急症风险！",
                "action_advice": "必须立即由家属陪同前往综合医院妇产科急诊！请勿剧烈走动，保持左侧卧位静卧，立即就医。",
            })
        elif bp_eval and bp_eval.get("status") == "hypertension_stage1":
            alerts.append({
                "level": "warning",
                "code": "BP_STAGE1_HYPERTENSION",
                "title": "【医学预警】妊娠期高血压预警 (>=140/90 mmHg)",
                "description": f"血压 {bp_eval['systolic']}/{bp_eval['diastolic']} mmHg 已达到临床高血压标准。需排查蛋白尿。",
                "action_advice": "建议近1-2天内就医产检复核血压并查尿常规；居家请保持低盐饮食与充足静息。",
            })

        if bp_eval and bp_eval.get("status") == "hypotension":
            alerts.append({
                "level": "warning",
                "code": "BP_HYPOTENSION",
                "title": "【提示】血压偏低，防范眩晕",
                "description": f"当前血压 {bp_eval['systolic']}/{bp_eval['diastolic']} mmHg 偏低。",
                "action_advice": "改变姿势（如下床、起立）时放慢动作，避免突然站起引起黑蒙；少量多餐，保证充足饮水。",
            })

        if glucose_eval and glucose_eval.get("status") == "high":
            alerts.append({
                "level": "danger",
                "code": "GLUCOSE_SIGNIFICANTLY_HIGH",
                "title": f"【高危警报】{glucose_eval['glucose_type_label']}血糖显著超标 ({glucose_eval['glucose']} mmol/L)",
                "description": "血糖显著超出孕期控制目标，可能增加羊水过多、巨大儿或代谢并发症风险。",
                "action_advice": "请在产科或内分泌科医生指导下进行糖耐量或糖化血红蛋白评估，严格执行控糖食谱，切忌自行盲目用药。",
            })
        elif glucose_eval and glucose_eval.get("status") == "elevated":
            alerts.append({
                "level": "warning",
                "code": "GLUCOSE_ELEVATED",
                "title": f"【控糖提示】{glucose_eval['glucose_type_label']}血糖偏高 ({glucose_eval['glucose']} mmol/L)",
                "description": f"数值超出孕期优选参考区间（参考目标: {glucose_eval['target_range']}）。",
                "action_advice": "建议调整餐单：主食以杂粮替代1/3白米面，多吃绿叶蔬菜，餐后30分钟散步，避免含糖饮料与高糖水果。",
            })
        elif glucose_eval and glucose_eval.get("status") == "hypoglycemia":
            alerts.append({
                "level": "warning",
                "code": "GLUCOSE_HYPOGLYCEMIA",
                "title": "【低血糖风险】血糖偏低 (<3.1 或 <4.0 mmol/L)",
                "description": f"{glucose_eval['glucose_type_label']}血糖仅 {glucose_eval['glucose']} mmol/L，偏离正常底线。",
                "action_advice": "随身携带饼干或糖果应急；遵循少食多餐原则，切勿空腹时间过长。",
            })

        dangerous_symptoms = [s for s in syms if s in ["头痛", "视物模糊", "上腹剧痛", "严重水肿", "胸闷"]]
        if dangerous_symptoms and bp_eval and bp_eval.get("status") in ["hypertension_stage1", "hypertension_severe"]:
            alerts.insert(0, {
                "level": "danger",
                "code": "PREECLAMPSIA_SYMPTOMS",
                "title": "【先兆子痫高度警戒】血压偏高伴随神经或器官受累症状",
                "description": f"监测到血压异常且伴有：{'、'.join(dangerous_symptoms)}，此为子痫前期典型警报体征！",
                "action_advice": "不可延误！请立即前往附近具有产科救治能力的三甲或专科医院急诊就诊。",
            })

        return alerts

    @classmethod
    def get_lifestyle_and_diet_recommendations(
        cls,
        bp_eval: Optional[Dict[str, Any]] = None,
        glucose_eval: Optional[Dict[str, Any]] = None,
        stage_type: str = "pregnancy",
    ) -> Dict[str, Any]:
        """生成个性化生活与饮食干预方案"""
        diet_tips: List[str] = []
        lifestyle_tips: List[str] = []

        if bp_eval and bp_eval.get("status") in ["elevated", "hypertension_stage1", "hypertension_severe"]:
            diet_tips.append("实行低钠高钾高钙 DASH 膳食：每日食盐摄入控制在 5g（约一啤酒盖）以内，少吃酱油、咸菜及加工肉类。")
            diet_tips.append("多吃富含钾与钙的天然食物：如菠菜、油菜、西兰花、低脂牛奶、豆制品等，有助平稳血管压力。")
            lifestyle_tips.append("睡眠与体位指导：推荐每天充足睡眠 8~10 小时，休息时采取左侧卧位，减轻腹主动脉受压，增加子宫胎盘血流量。")
            lifestyle_tips.append("情绪与日常减压：保持舒缓心情，避免过度焦虑与突发精神刺激，每天可听轻音乐或练习轻柔腹式呼吸。")
        else:
            diet_tips.append("维持营养均衡清淡膳食，荤素搭配，补充优质蛋白（鱼禽蛋奶）。")
            lifestyle_tips.append("规律作息，避免熬夜，早晚按时休息。")

        if glucose_eval and glucose_eval.get("status") in ["elevated", "high"]:
            diet_tips.append("执行低 GI 饮食法：主食选用糙米、荞麦、燕麦或豆类替代 1/3 白米白面，减缓餐后碳水吸收速度。")
            diet_tips.append("调整进餐顺序与节奏：先吃蔬菜（每餐不少于 200g），再吃蛋白质肉类，最后吃主食，细嚼慢咽。")
            diet_tips.append("少食多餐防波动：正餐吃 7~8 分饱，在两餐之间安排 2~3 次健康加餐（如无糖酸奶、黄瓜、少量原味坚果）。")
            lifestyle_tips.append("餐后微运动：餐后 30 分钟进行 20~30 分钟温和散步，避免餐后立即卧床或久坐，可显著改善餐后血糖曲线。")

        return {
            "diet": diet_tips,
            "lifestyle": lifestyle_tips,
        }
