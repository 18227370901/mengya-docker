from django.db import models


class Recipe(models.Model):
    """孕期食谱"""

    PERIOD_CHOICES = [
        ("early", "孕早期（1-12周）"),
        ("mid", "孕中期（13-27周）"),
        ("late", "孕晚期（28-40周）"),
    ]

    PERIOD_MONTH_MAP = {
        "month_1_2": "孕期一、二月",
        "month_3_4": "孕期三、四月",
        "month_5_6": "孕期五、六月",
        "month_7_8": "孕期七、八月",
        "month_9_10": "孕期九、十月",
    }

    title = models.CharField(max_length=200, verbose_name="菜品名称")
    nutrient_tag = models.CharField(max_length=100, blank=True, verbose_name="营养标识")
    period = models.CharField(max_length=20, choices=PERIOD_CHOICES, verbose_name="孕期阶段")
    period_month = models.CharField(max_length=20, default="", verbose_name="孕期月份分组")
    ingredients = models.TextField(verbose_name="材料（支持多行）")
    steps = models.TextField(verbose_name="做法步骤（支持多行）")
    nutrition_tip = models.TextField(blank=True, verbose_name="营养小叮咛")
    cover_image = models.URLField(blank=True, null=True, verbose_name="封面图")
    sort_order = models.IntegerField(default=0, verbose_name="排序权重")
    view_count = models.IntegerField(default=0, verbose_name="浏览次数")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        indexes = [
            models.Index(fields=["period"]),
            models.Index(fields=["period_month"]),
            models.Index(fields=["nutrient_tag"]),
        ]
        ordering = ["period_month", "sort_order"]

    def __str__(self):
        return f"{self.title}（{self.nutrient_tag}）"
