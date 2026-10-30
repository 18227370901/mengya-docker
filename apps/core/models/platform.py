# -*- coding: utf-8 -*-
from django.db import models
from .base import BaseModel


class ThirdPartyPlatform(BaseModel):
    """
    三方平台接入中转站配置表
    """
    CATEGORY_CHOICES = [
        ("parenting", "育儿早教"),
        ("health", "母婴健康"),
        ("learning", "课外学习"),
        ("tools", "实用工具"),
        ("entertainment", "益智娱乐"),
        ("other", "其他资源"),
    ]

    AGE_GROUP_CHOICES = [
        ("all", "全年龄段"),
        ("prenatal", "孕产阶段"),
        ("infant", "婴儿期(0-1岁)"),
        ("toddler", "幼儿期(1-3岁)"),
        ("preschool", "学龄前(3-6岁)"),
        ("school_age", "学龄期(6岁以上)"),
    ]

    VISIBILITY_CHOICES = [
        ("all", "全部普通用户(需有模块权限)"),
        ("restricted", "指定白名单用户"),
    ]

    name = models.CharField(max_length=100, verbose_name="平台名称")
    url = models.URLField(max_length=500, verbose_name="访问主地址")
    logo_url = models.CharField(max_length=500, blank=True, default="", verbose_name="Logo图标链接")
    description = models.TextField(blank=True, default="", verbose_name="平台描述")
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="tools", verbose_name="分类")
    age_group = models.CharField(max_length=30, choices=AGE_GROUP_CHOICES, default="all", verbose_name="适用年龄段")
    tags = models.JSONField(default=list, blank=True, verbose_name="标签列表")
    sort_order = models.IntegerField(default=0, verbose_name="排序权重(越小越靠前)")
    is_enabled = models.BooleanField(default=True, verbose_name="是否启用")
    is_active = models.BooleanField(default=True, verbose_name="软删除标记(True为正常)")
    
    visibility_type = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default="all",
        verbose_name="用户可见性范围"
    )
    allowed_user_ids = models.JSONField(default=list, blank=True, verbose_name="允许访问的用户ID白名单")

    created_by = models.ForeignKey(
        'core.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_platforms',
        verbose_name="创建人"
    )

    class Meta:
        db_table = "core_third_party_platform"
        ordering = ["sort_order", "id"]
        verbose_name = "三方平台"
        verbose_name_plural = "三方平台配置"

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class ThirdPartyPlatformResource(BaseModel):
    """
    三方平台子资源/子入口路径配置表
    """
    ACCESS_RULE_CHOICES = [
        ("inherit", "继承所属平台权限"),
        ("restricted", "平台可见用户中进一步指定白名单"),
    ]

    platform = models.ForeignKey(
        ThirdPartyPlatform,
        on_delete=models.CASCADE,
        related_name="resources",
        verbose_name="所属平台"
    )
    title = models.CharField(max_length=100, verbose_name="资源名称")
    path_or_url = models.CharField(max_length=500, verbose_name="子路径或独立URL")
    description = models.CharField(max_length=255, blank=True, default="", verbose_name="资源简要描述")
    icon = models.CharField(max_length=100, blank=True, default="", verbose_name="图标标识(如Lucide图标名称或URL)")
    sort_order = models.IntegerField(default=0, verbose_name="排序权重(越小越靠前)")
    is_enabled = models.BooleanField(default=True, verbose_name="是否启用")
    is_active = models.BooleanField(default=True, verbose_name="软删除标记")

    access_rule = models.CharField(
        max_length=20,
        choices=ACCESS_RULE_CHOICES,
        default="inherit",
        verbose_name="资源级访问规则"
    )
    allowed_user_ids = models.JSONField(default=list, blank=True, verbose_name="允许访问的用户ID白名单")

    class Meta:
        db_table = "core_third_party_resource"
        ordering = ["sort_order", "id"]
        verbose_name = "平台子资源"
        verbose_name_plural = "平台子资源配置"

    def __str__(self):
        return f"{self.platform.name} - {self.title}"
