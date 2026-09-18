from django.db import models


class BabyProfile(models.Model):
    """宝宝档案"""

    GENDER_CHOICES = [
        ("boy", "男宝"),
        ("girl", "女宝"),
        ("unknown", "保密"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="babies", verbose_name="用户")
    name = models.CharField(max_length=50, verbose_name="宝宝昵称")
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, default="unknown", verbose_name="性别")
    birthday = models.DateField(verbose_name="出生日期")
    birth_weight = models.FloatField(null=True, blank=True, verbose_name="出生体重(kg)")
    birth_height = models.FloatField(null=True, blank=True, verbose_name="出生身高(cm)")
    birth_head_circumference = models.FloatField(null=True, blank=True, verbose_name="出生头围(cm)")
    is_primary = models.BooleanField(default=False, verbose_name="是否默认宝宝")
    avatar = models.URLField(blank=True, null=True, verbose_name="宝宝头像")
    note = models.TextField(blank=True, verbose_name="备注")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-is_primary", "birthday"]

    @property
    def nickname(self):
        """兼容代码中对 nickname 属性的调用"""
        return self.name

    def get_age_days(self):
        from datetime import date

        return (date.today() - self.birthday).days

    def get_age_months(self):
        days = self.get_age_days()
        return days // 30 if days >= 0 else 0

    def get_age_display(self):
        days = self.get_age_days()
        if days < 0:
            return "尚未出生"
        if days < 30:
            return f"{days}天"
        months = days // 30
        if months >= 36:
            years = months // 12
            rem = months % 12
            return f"{years}岁{rem}个月" if rem else f"{years}岁"
        return f"{months}个月" 

    def __str__(self):
        return f"{self.user.phone} - {self.name}"