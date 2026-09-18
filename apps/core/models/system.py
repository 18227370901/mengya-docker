from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone
import secrets

User = get_user_model()


class SystemSetting(models.Model):
    """系统全局设置（单行记录，id=1）"""

    REGISTRATION_MODE_CHOICES = [
        ("open", "开放注册"),
        ("invitation_only", "仅限邀请注册"),
    ]

    registration_mode = models.CharField(
        max_length=20,
        choices=REGISTRATION_MODE_CHOICES,
        default="open",
        verbose_name="注册模式",
    )
    # 安全风控阈值（连续失败达到该次数触发验证码 / 冻结）
    login_captcha_threshold = models.IntegerField(default=3, verbose_name="触发验证码的连续失败次数")
    login_freeze_threshold = models.IntegerField(default=10, verbose_name="触发冻结的连续失败次数")
    # 触发风控后的等待时长（分钟，0=不等待）；达到阈值后需等待该时长才能再次尝试
    # 触发风控后的等待时长（秒级控制，默认 300 秒 = 5分钟）
    login_lock_seconds = models.IntegerField(default=300, verbose_name="风控熔断等待时长（秒）")
    login_lock_minutes = models.IntegerField(default=5, verbose_name="风控等待时长（分钟）")
    # 审计日志保留期限（天，0 表示永久保留）
    forgot_password_max_attempts = models.IntegerField(default=5, verbose_name="找回密码密保最大尝试次数")
    audit_retention_days = models.IntegerField(default=90, verbose_name="审计日志保留天数（0=永久）")
    # 普通用户功能与菜单权限配置（JSON字典，颗粒度覆盖菜单及增删改查）
    default_user_permissions = models.JSONField(default=dict, blank=True, verbose_name="普通用户默认功能与菜单权限")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={"registration_mode": "open"})
        return obj

    @classmethod
    def get_registration_mode(cls):
        return cls.get_settings().registration_mode

    @classmethod
    def is_open_registration(cls):
        return cls.get_registration_mode() == "open"

    def __str__(self):
        return f"系统设置({self.get_registration_mode_display()})"


class InviteLink(models.Model):
    """邀请注册链接"""

    token = models.CharField(max_length=64, unique=True, verbose_name="邀请令牌")
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="created_invites",
        verbose_name="创建者",
    )
    max_uses = models.IntegerField(default=1, verbose_name="最大使用次数")
    used_count = models.IntegerField(default=0, verbose_name="已使用次数")
    expires_at = models.DateTimeField(null=True, blank=True, verbose_name="过期时间")
    is_active = models.BooleanField(default=True, verbose_name="是否有效")
    note = models.CharField(max_length=200, blank=True, verbose_name="备注")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(24)
        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        """检查邀请链接是否仍然有效"""
        if not self.is_active:
            return False
        if self.used_count >= self.max_uses:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True

    @property
    def remaining_uses(self):
        return max(0, self.max_uses - self.used_count)

    def __str__(self):
        return f"邀请链接({self.token[:8]}...) by {self.created_by.phone}"
