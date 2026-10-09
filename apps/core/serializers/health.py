# -*- coding: utf-8 -*-
"""孕产妇健康与 BMI 分析相关序列化器"""

from rest_framework import serializers


class BmiAnalysisInputSerializer(serializers.Serializer):
    """孕产妇体重/BMI 分析输入参数验证"""

    height_cm = serializers.FloatField(
        min_value=100.0,
        max_value=230.0,
        required=True,
        error_messages={
            "min_value": "身高不能低于 100 cm",
            "max_value": "身高不能高于 230 cm",
            "required": "请输入身高",
        },
    )
    pre_pregnancy_weight_kg = serializers.FloatField(
        min_value=30.0,
        max_value=200.0,
        required=True,
        error_messages={
            "min_value": "孕前体重不能低于 30 kg",
            "max_value": "孕前体重不能高于 200 kg",
            "required": "请输入孕前体重",
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
        choices=["pregnancy", "postpartum"],
        default="pregnancy",
    )
    gestational_week = serializers.IntegerField(
        min_value=1,
        max_value=42,
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
    medical_history = serializers.ListField(
        child=serializers.CharField(max_length=50),
        default=list,
        required=False,
    )
    save_record = serializers.BooleanField(
        default=False,
        required=False,
    )

    def validate(self, attrs):
        stage = attrs.get("stage_type", "pregnancy")
        if stage == "pregnancy":
            if not attrs.get("gestational_week"):
                raise serializers.ValidationError({"gestational_week": "孕期阶段必须提供当前孕周(1~42周)"})
        elif stage == "postpartum":
            if attrs.get("postpartum_months") is None:
                attrs["postpartum_months"] = 1
        return attrs
