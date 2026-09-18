from django.db import models


class HealthRecord(models.Model):
    """健康记录（产检 / 生长发育 / 疫苗 / 生病）"""

    RECORD_TYPES = [
        ("prenatal_exam", "产检记录"),
        ("growth_measurement", "生长发育测量"),
        ("vaccination", "疫苗接种"),
        ("illness", "生病记录"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="health_records", verbose_name="用户")
    baby = models.ForeignKey(
        "BabyProfile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="health_records",
        verbose_name="宝宝",
    )
    record_type = models.CharField(max_length=20, choices=RECORD_TYPES, verbose_name="记录类型")

    # 通用字段
    record_date = models.DateField(verbose_name="记录日期")
    note = models.TextField(blank=True, verbose_name="备注")

    # 产检字段
    gestational_week = models.IntegerField(null=True, blank=True, verbose_name="孕周")
    exam_items = models.JSONField(default=dict, blank=True, verbose_name="检查项目")

    # 生长发育字段
    baby_age_days = models.IntegerField(null=True, blank=True, verbose_name="宝宝天数")
    height = models.FloatField(null=True, blank=True, verbose_name="身高/身长(cm)")
    weight = models.FloatField(null=True, blank=True, verbose_name="体重(kg)")
    head_circumference = models.FloatField(null=True, blank=True, verbose_name="头围(cm)")

    # 疫苗接种字段
    vaccine_name = models.CharField(max_length=100, blank=True, verbose_name="疫苗名称")
    vaccine_dose = models.IntegerField(null=True, blank=True, verbose_name="第几剂")
    vaccine_site = models.CharField(max_length=50, blank=True, verbose_name="接种部位")

    # 附件
    attachment_url = models.URLField(blank=True, null=True, verbose_name="报告图片")
    ai_analysis = models.TextField(blank=True, verbose_name="AI解读结果")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-record_date"]

    def __str__(self):
        return f"{self.user.phone} - {self.record_date}"