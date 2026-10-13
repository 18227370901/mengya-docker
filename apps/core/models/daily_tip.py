from django.db import models


class DailyTip(models.Model):
    """今日关怀小锦囊 / 科学育儿与孕期健康提示"""

    STAGE_TYPE_CHOICES = [
        ("newborn", "新生儿期 (0-28天)"),
        ("infant", "婴儿期 (1-12个月)"),
        ("toddler", "幼儿期 (1岁以上)"),
        ("pregnancy", "孕期"),
        ("general", "通用/备孕"),
    ]

    title = models.CharField(max_length=100, verbose_name="提示标题")
    content = models.TextField(verbose_name="提示内容")
    tag = models.CharField(max_length=50, blank=True, default="", verbose_name="阶段标签")
    stage_type = models.CharField(
        max_length=20,
        choices=STAGE_TYPE_CHOICES,
        default="newborn",
        verbose_name="适用阶段",
        db_index=True,
    )
    is_active = models.BooleanField(default=True, verbose_name="是否启用显示", db_index=True)
    is_builtin = models.BooleanField(default=False, verbose_name="系统内置提示")
    sort_order = models.IntegerField(default=0, verbose_name="排序序号")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["sort_order", "-created_at"]
        verbose_name = "今日关怀小锦囊"
        verbose_name_plural = "今日关怀小锦囊"

    def __str__(self):
        return f"[{self.get_stage_type_display()}] {self.title}"
