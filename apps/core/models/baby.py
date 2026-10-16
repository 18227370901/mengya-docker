from django.db import models


class BabyProfile(models.Model):
    """宝宝档案"""

    GENDER_CHOICES = [
        ("boy", "男宝"),
        ("girl", "女宝"),
        ("unknown", "保密"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="babies", verbose_name="用户")
    name = models.CharField(max_length=50, blank=True, default="", verbose_name="宝宝昵称")
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, default="unknown", verbose_name="性别")
    birthday = models.DateField(verbose_name="出生日期/预产期")
    is_born = models.BooleanField(default=True, verbose_name="是否已出生")
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
        from datetime import date
        today = date.today()
        if not self.is_born or self.birthday > today:
            return 0
        from dateutil.relativedelta import relativedelta
        r = relativedelta(today, self.birthday)
        return r.years * 12 + r.months

    def get_age_display(self):
        from datetime import date
        today = date.today()
        if not self.is_born or self.birthday > today:
            delta = self.birthday - today
            if delta.days >= 0:
                from apps.core.utils.stage_utils import calculate_pregnancy_progress
                prog = calculate_pregnancy_progress(self.birthday, today)
                return f"胎儿 ({prog['week_days_text']}，距预产期{delta.days}天)"
            return "即将出生"
        days = self.get_age_days()
        if days < 0:
            return "尚未出生"
        from apps.core.utils.stage_utils import calculate_baby_age
        age_info = calculate_baby_age(self.birthday, today)
        return age_info["age_text"]

    def __str__(self):
        return f"{self.user.phone} - {self.name}"
