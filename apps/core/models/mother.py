# -*- coding: utf-8 -*-
from django.db import models


class MotherProfile(models.Model):
    """妈妈孕产档案"""

    user = models.ForeignKey(
        "User",
        on_delete=models.CASCADE,
        related_name="mothers",
        verbose_name="所属用户",
    )
    name = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name="妈妈姓名",
    )
    is_primary = models.BooleanField(
        default=False,
        verbose_name="是否默认妈妈档案",
    )
    due_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="预产期",
    )
    is_pregnant = models.BooleanField(
        default=True,
        verbose_name="是否孕期中",
    )
    avatar = models.URLField(
        blank=True,
        null=True,
        verbose_name="头像",
    )
    note = models.TextField(
        blank=True,
        default="",
        verbose_name="备注说明",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="创建时间",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="更新时间",
    )

    class Meta:
        ordering = ["-is_primary", "-id"]
        verbose_name = "妈妈档案"
        verbose_name_plural = "妈妈档案"

    def __str__(self):
        return f"{self.user.phone} - {self.name or '妈妈'}"
