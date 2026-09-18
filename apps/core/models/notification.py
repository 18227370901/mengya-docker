from django.db import models


class Notification(models.Model):
    """消息通知"""

    NOTIFICATION_TYPES = [
        ("vaccine", "疫苗提醒"),
        ("exam", "产检提醒"),
        ("milestone", "成长里程碑"),
        ("shopping", "购物提醒"),
        ("system", "系统消息"),
        ("ai", "AI推荐"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="notifications", verbose_name="用户")
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES, verbose_name="通知类型")
    title = models.CharField(max_length=200, verbose_name="标题")
    content = models.TextField(verbose_name="内容")
    link = models.URLField(blank=True, null=True, verbose_name="跳转链接")
    extra_data = models.JSONField(default=dict, blank=True, verbose_name="附加数据")
    is_read = models.BooleanField(default=False, verbose_name="是否已读")
    scheduled_at = models.DateTimeField(null=True, blank=True, verbose_name="计划发送时间")
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name="实际发送时间")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.phone} - {self.title[:30]}..."