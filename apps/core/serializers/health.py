# -*- coding: utf-8 -*-
"""孕产妇健康与 BMI 分析相关序列化器"""

from rest_framework import serializers


class BmiAnalysisInputSerializer(serializers.Serializer):
    """孕产妇体重/BMI 分析输入参数验证"""

    height_cm = serializers.FloatField(
        min_value=100.0,
        max_value=230.0,
        required=False,
        allow_null=True,
        error_messages={
            "min_value": "身高不能低于 100 cm",
            "max_value": "身高不能高于 230 cm",
        },
    )
    pre_pregnancy_weight_kg = serializers.FloatField(
        min_value=30.0,
        max_value=200.0,
        required=False,
        allow_null=True,
        error_messages={
            "min_value": "孕前体重不能低于 30 kg",
            "max_value": "孕前体重不能高于 200 kg",
        },
    )
    current_weight_kg = serializers.FloatField(
        min_value=30.0,
        max_value=220.0,
        required=True,
        error_messages={
            "min_value": "当前体重不能低于 30 kg",
            "max_value": "当前体重不能高于 220 kg",
            "required": "请输入当前体重",
        },
    )
    stage_type = serializers.ChoiceField(
        choices=["pregnancy", "postpartum", "general"],
        default="pregnancy",
    )
    gestational_week = serializers.IntegerField(
        min_value=1,
        max_value=42,
        required=False,
        allow_null=True,
    )
    # v1.58：孕x周x天输入——周内天数（0~6；周数仍经孕周引擎双基准校验，天数用户显式传值优先采纳）
    gestational_days = serializers.IntegerField(
        min_value=0,
        max_value=6,
        required=False,
        allow_null=True,
    )
    postpartum_months = serializers.IntegerField(
        min_value=0,
        max_value=36,
        required=False,
        allow_null=True,
    )
    is_twins = serializers.BooleanField(
        default=False,
    )
    record_date = serializers.DateField(
        required=False,
        allow_null=True,
    )
    # v1.57：同日重复打卡覆盖开关（检测到当日已有记录时，前端确认后携 true 覆盖更新）
    overwrite = serializers.BooleanField(
        default=False,
        required=False,
    )
    waist_circumference_cm = serializers.FloatField(
        min_value=30.0,
        max_value=200.0,
        required=False,
        allow_null=True,
    )
    medical_history = serializers.ListField(
        child=serializers.CharField(max_length=50),
        default=list,
        required=False,
    )
    save_record = serializers.BooleanField(
        default=True,
        required=False,
    )
    systolic_bp = serializers.FloatField(
        min_value=50.0,
        max_value=260.0,
        required=False,
        allow_null=True,
    )
    diastolic_bp = serializers.FloatField(
        min_value=30.0,
        max_value=180.0,
        required=False,
        allow_null=True,
    )
    pulse = serializers.FloatField(
        min_value=30.0,
        max_value=220.0,
        required=False,
        allow_null=True,
    )
    blood_sugar = serializers.FloatField(
        min_value=1.0,
        max_value=35.0,
        required=False,
        allow_null=True,
    )
    glucose_type = serializers.ChoiceField(
        choices=["fasting", "postprandial_1h", "postprandial_2h", "bedtime", "random"],
        default="fasting",
        required=False,
    )

    def validate(self, attrs):
        stage = attrs.get("stage_type", "pregnancy")
        # v1.57：测量日期硬拦截——不能晚于今天（补录回溯合理，未来预填会污染时序图与孕周引擎）
        record_date = attrs.get("record_date")
        if record_date:
            from django.utils import timezone

            if record_date > timezone.localdate():
                raise serializers.ValidationError(
                    {"record_date": "测量日期不能晚于今天，请选择今天或之前的日期"}
                )
        if stage == "postpartum":
            if attrs.get("postpartum_months") is None:
                attrs["postpartum_months"] = 1
        elif stage == "general":
            # v1.56：非孕期（备孕/日常）不携带产后月龄与孕周
            attrs["postpartum_months"] = None
            attrs["gestational_week"] = None
        # 孕周/身高/孕前体重的补齐与校验由视图层统一执行（孕周引擎 + 基线继承）
        return attrs


class VitalsAnalysisInputSerializer(serializers.Serializer):
    """妈妈生命体征（血压、血糖）录入与分析输入序列化器"""

    record_date = serializers.DateField(required=False, allow_null=True)
    overwrite = serializers.BooleanField(default=False, required=False)
    mother_id = serializers.IntegerField(required=False, allow_null=True)
    stage_type = serializers.ChoiceField(
        choices=["pregnancy", "postpartum", "general"],
        default="pregnancy",
    )
    gestational_week = serializers.IntegerField(
        min_value=1,
        max_value=42,
        required=False,
        allow_null=True,
    )
    gestational_days = serializers.IntegerField(
        min_value=0,
        max_value=6,
        required=False,
        allow_null=True,
    )
    postpartum_months = serializers.IntegerField(
        min_value=0,
        max_value=36,
        required=False,
        allow_null=True,
    )

    # 血压项（选填）
    systolic_bp = serializers.FloatField(
        min_value=50.0,
        max_value=260.0,
        required=False,
        allow_null=True,
        error_messages={
            "min_value": "收缩压不能低于 50 mmHg",
            "max_value": "收缩压不能高于 260 mmHg",
        },
    )
    diastolic_bp = serializers.FloatField(
        min_value=30.0,
        max_value=180.0,
        required=False,
        allow_null=True,
        error_messages={
            "min_value": "舒张压不能低于 30 mmHg",
            "max_value": "舒张压不能高于 180 mmHg",
        },
    )
    pulse = serializers.FloatField(
        min_value=30.0,
        max_value=220.0,
        required=False,
        allow_null=True,
    )

    # 血糖项（选填）
    blood_sugar = serializers.FloatField(
        min_value=1.0,
        max_value=35.0,
        required=False,
        allow_null=True,
        error_messages={
            "min_value": "血糖值不能低于 1.0 mmol/L",
            "max_value": "血糖值不能高于 35.0 mmol/L",
        },
    )
    glucose_type = serializers.ChoiceField(
        choices=["fasting", "postprandial_1h", "postprandial_2h", "bedtime", "random"],
        default="fasting",
        required=False,
    )
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=50),
        default=list,
        required=False,
    )
    note = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
    )

    # 体重与身高（选填，支持一并录入）
    current_weight_kg = serializers.FloatField(
        min_value=30.0,
        max_value=220.0,
        required=False,
        allow_null=True,
    )
    height_cm = serializers.FloatField(
        min_value=100.0,
        max_value=230.0,
        required=False,
        allow_null=True,
    )

    # 症状与备注
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=50),
        default=list,
        required=False,
    )
    note = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        default="",
    )
    request_ai = serializers.BooleanField(
        default=True,
        required=False,
    )

    def validate(self, attrs):
        from django.utils import timezone
        record_date = attrs.get("record_date")
        if record_date and record_date > timezone.localdate():
            raise serializers.ValidationError({"record_date": "记录日期不能晚于今天，请选择今天或之前的日期"})

        sbp = attrs.get("systolic_bp")
        dbp = attrs.get("diastolic_bp")
        if (sbp is not None and dbp is None) or (sbp is None and dbp is not None):
            raise serializers.ValidationError({"systolic_bp": "收缩压与舒张压须同时填写，或均保持为空"})

        if sbp is not None and dbp is not None and sbp <= dbp:
            raise serializers.ValidationError({"systolic_bp": "收缩压 (高压) 必须大于舒张压 (低压)"})

        # 校验：至少输入了血压、血糖或体重中的一项
        has_bp = (sbp is not None and dbp is not None)
        has_glu = (attrs.get("blood_sugar") is not None)
        has_weight = (attrs.get("current_weight_kg") is not None)

        if not (has_bp or has_glu or has_weight):
            raise serializers.ValidationError({
                "non_field_errors": ["请至少录入血压（收缩压+舒张压）、血糖值或体重中的一项有效数据"]
            })

        return attrs
