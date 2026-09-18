from django.db import models


class ChatSession(models.Model):
    """AI 助手会话"""

    user = models.ForeignKey(
        "User",
        on_delete=models.CASCADE,
        related_name="chat_sessions",
        verbose_name="用户",
    )
    title = models.CharField(max_length=100, default="新会话", verbose_name="会话标题")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "AI会话"
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"{self.user.phone} - {self.title}"


class ChatMessage(models.Model):
    """AI 会话消息"""

    ROLE_CHOICES = [
        ("user", "用户"),
        ("ai", "AI"),
    ]

    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="会话",
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, verbose_name="角色")
    content = models.TextField(verbose_name="消息内容")
    used_config_name = models.CharField(max_length=100, blank=True, default="", verbose_name="使用的AI配置")
    used_search = models.BooleanField(default=False, verbose_name="是否使用了联网搜索")
    error_hint = models.TextField(blank=True, default="", verbose_name="错误提示")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        ordering = ["created_at"]
        verbose_name = "AI消息"
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"[{self.role}] {self.content[:50]}..."
