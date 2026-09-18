from django.contrib.auth.models import AbstractUser
from django.db import models

ROLE_CHOICES = [
    ("mother", "妈妈"),
    ("father", "爸爸"),
    ("grandma", "奶奶/外婆"),
    ("caregiver", "其他照护者"),
]


class User(AbstractUser):
    """平台用户（手机号登录）"""

    phone = models.CharField(max_length=50, unique=True, verbose_name="手机号/用户名")
    avatar = models.URLField(blank=True, null=True, verbose_name="头像")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="mother", verbose_name="角色")
    due_date = models.DateField(null=True, blank=True, verbose_name="预产期")
    baby_birthday = models.DateField(null=True, blank=True, verbose_name="宝宝生日")
    is_pregnant = models.BooleanField(default=True, verbose_name="是否孕期")
    nickname = models.CharField(max_length=50, blank=True, verbose_name="昵称")
    bio = models.TextField(blank=True, verbose_name="个人简介")
    is_public_profile = models.BooleanField(default=False, verbose_name="是否公开档案")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    # ===== AI 助手配置（用户级，页面可设置）=====
    ai_api_key = models.CharField(max_length=255, blank=True, default="", verbose_name="AI API Key")
    ai_base_url = models.CharField(max_length=255, blank=True, default="", verbose_name="AI Base URL")
    ai_model = models.CharField(max_length=100, blank=True, default="", verbose_name="AI 模型名称")
    # 多 AI 配置列表（JSON 数组，每项含 name/api_key/base_url/model/enabled）
    ai_configs = models.JSONField(default=list, blank=True, verbose_name="AI 多配置列表")
    # 管理员授权用户可使用 AI 配置功能
    ai_authorized = models.BooleanField(default=True, verbose_name="AI 配置授权")
    # 用户个性化权限覆盖（为 None 或空字典时走系统全局默认权限）
    custom_permissions = models.JSONField(default=dict, blank=True, verbose_name="用户个性化权限覆盖")

    # ===== 密保问题（用于找回密码）=====
    SECURITY_Q_CHOICES = [
        ("pet", "你的宠物叫什么名字？"),
        ("city", "你出生的城市是哪里？"),
        ("teacher", "你小学班主任姓什么？"),
        ("food", "你最爱的食物是什么？"),
        ("book", "你最喜欢的一本书叫什么？"),
    ]
    security_question = models.CharField(
        max_length=20, blank=True, default="", verbose_name="密保问题"
    )
    security_answer = models.CharField(
        max_length=100, blank=True, default="", verbose_name="密保答案"
    )

    # ===== 安全风控 =====
    login_fail_count = models.IntegerField(default=0, verbose_name="连续登录失败次数")
    security_fail_count = models.IntegerField(default=0, verbose_name="连续找回密码失败次数")
    # 临时锁定时间（达到冻结阈值后锁定一段时间，到期自动解锁）
    locked_until = models.DateTimeField(null=True, blank=True, verbose_name="锁定截止时间")

    # ===== 单终端登录控制 =====
    # 存储当前有效的 access token JTI（JWT ID），新登录时更新此字段，旧 token 自动失效
    active_token_jti = models.CharField(max_length=64, blank=True, default="", verbose_name="当前有效Token JTI")

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        ordering = ["-date_joined"]

    def get_current_stage(self):
        """返回当前阶段标识，如 pregnancy_20w / baby_6m"""
        from datetime import date

        today = date.today()
        if self.due_date and not self.baby_birthday:
            delta = self.due_date - today
            weeks = 40 - (delta.days // 7) if delta.days > 0 else 40
            weeks = max(1, min(weeks, 40))
            return f"pregnancy_{weeks}w"
        if self.baby_birthday:
            delta = today - self.baby_birthday
            if delta.days < 0:
                return "waiting_for_birth"
            if delta.days < 30:
                return f"baby_{delta.days}d"
            return f"baby_{delta.days // 30}m"
        return "unknown"

    def __str__(self):
        return self.nickname or self.phone or self.username