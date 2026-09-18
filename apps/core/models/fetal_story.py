from django.db import models


class FetalStory(models.Model):
    """胎教故事 —— 按孕周天序排列，中英双语"""

    LANGUAGE_CHOICES = [
        ("zh", "中文"),
        ("en", "English"),
    ]

    NARRATOR_CHOICES = [
        ("mom", "妈妈讲"),
        ("dad", "爸爸讲"),
        ("either", "都可以"),
    ]

    title = models.CharField(max_length=200, verbose_name="故事标题")
    title_en = models.CharField(max_length=400, blank=True, default="", verbose_name="英文标题")
    subtitle = models.CharField(max_length=200, blank=True, default="", verbose_name="副标题/寓意")
    subtitle_en = models.CharField(max_length=400, blank=True, default="", verbose_name="英文副标题")

    # 从孕第17周开始，到孕第40周（共24周，每周7天=168天，每天1-2个故事）
    week_start = models.IntegerField(default=17, verbose_name="起始孕周")
    day_offset = models.IntegerField(default=0, verbose_name="天数偏移（从week_start起第几天，0=第1天）")
    day_index = models.IntegerField(default=1, verbose_name="当天序号（同一天多个故事时用）")

    # 内容
    content = models.TextField(verbose_name="故事正文（中文）")
    content_en = models.TextField(blank=True, default="", verbose_name="故事正文（英文）")
    tips = models.TextField(blank=True, default="", verbose_name="胎教提示")
    tips_en = models.TextField(blank=True, default="", verbose_name="英文胎教提示")

    # 配图
    cover_image = models.URLField(max_length=500, blank=True, default="", verbose_name="封面图URL")

    # 讲述者
    narrator = models.CharField(max_length=10, choices=NARRATOR_CHOICES, default="mom", verbose_name="适合讲述者")

    # 来源
    source = models.CharField(max_length=200, blank=True, default="", verbose_name="来源")
    source_en = models.CharField(max_length=200, blank=True, default="", verbose_name="英文来源")

    sort_order = models.IntegerField(default=0, verbose_name="排序权重")
    view_count = models.IntegerField(default=0, verbose_name="阅读次数")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        ordering = ["week_start", "day_offset", "day_index"]
        indexes = [
            models.Index(fields=["week_start", "day_offset"]),
            models.Index(fields=["narrator"]),
        ]
        verbose_name = "胎教故事"
        verbose_name_plural = "胎教故事"

    def __str__(self):
        return f"孕{self.week_start}周+{self.day_offset}天 #{self.day_index} {self.title}"
