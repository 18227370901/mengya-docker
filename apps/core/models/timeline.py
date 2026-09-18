from django.db import models


class TimelineEvent(models.Model):
    """时间轴事件（平台心脏）"""

    STAGE_TYPES = [
        ("pregnancy_week", "孕周"),
        ("baby_age_day", "宝宝天数"),
        ("baby_age_month", "宝宝月龄"),
        ("pregnancy_trimester", "孕早期/中期/晚期"),
    ]
    CATEGORY_CHOICES = [
        ("food", "饮食"),
        ("clothing", "穿衣"),
        ("housing", "居家"),
        ("travel", "出行"),
        ("health", "健康"),
        ("shopping", "购物"),
        ("milestone", "里程碑"),
        ("emotion", "心理情绪"),
        ("exercise", "运动"),
        ("checkup", "产检"),
        ("education", "胎教"),
    ]

    stage_type = models.CharField(max_length=30, choices=STAGE_TYPES, verbose_name="阶段类型")
    stage_value = models.IntegerField(help_text="如孕10周->10，宝宝6月龄->6", verbose_name="阶段值")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, verbose_name="分类")
    title = models.CharField(max_length=200, verbose_name="标题")
    subtitle = models.CharField(max_length=200, blank=True, verbose_name="副标题")
    content = models.TextField(verbose_name="详细内容（支持HTML/Markdown）")
    tips = models.TextField(blank=True, verbose_name="注意事项/小贴士")
    cover_image = models.URLField(blank=True, null=True, verbose_name="封面图")
    is_essential = models.BooleanField(default=False, verbose_name="是否必读/重点")
    sort_order = models.IntegerField(default=0, verbose_name="排序权重")
    view_count = models.IntegerField(default=0, verbose_name="浏览次数")
    products = models.ManyToManyField("Product", blank=True, related_name="timeline_events", verbose_name="关联商品")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        indexes = [
            models.Index(fields=["stage_type", "stage_value", "category"]),
            models.Index(fields=["is_essential"]),
        ]
        ordering = ["stage_type", "stage_value", "sort_order"]

    def __str__(self):
        return f"{self.get_stage_type_display()}: {self.stage_value} - {self.title}"