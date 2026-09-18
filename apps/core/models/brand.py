from django.db import models


class BrandProfile(models.Model):
    """品牌档案"""

    POSITIONING_CHOICES = [
        ("premium", "高端"),
        ("mid_high", "中高端"),
        ("mid", "中端"),
        ("value", "性价比"),
        ("budget", "平价"),
    ]

    name = models.CharField(max_length=100, unique=True, verbose_name="品牌名")
    name_en = models.CharField(max_length=100, blank=True, verbose_name="品牌英文名")
    logo = models.URLField(blank=True, null=True, verbose_name="品牌Logo")
    country_of_origin = models.CharField(max_length=50, blank=True, verbose_name="原产国")
    positioning = models.CharField(max_length=20, choices=POSITIONING_CHOICES, default="mid", verbose_name="定位")
    positioning_desc = models.CharField(max_length=200, blank=True, verbose_name="定位描述")
    market_rank = models.CharField(max_length=50, blank=True, verbose_name="市场排名")
    market_share = models.CharField(max_length=50, blank=True, verbose_name="市场份额")
    brand_story = models.TextField(blank=True, verbose_name="品牌故事")
    official_url = models.URLField(blank=True, null=True, verbose_name="官网")
    founded_year = models.IntegerField(null=True, blank=True, verbose_name="成立年份")
    parent_company = models.CharField(max_length=100, blank=True, verbose_name="母公司")
    is_active = models.BooleanField(default=True, verbose_name="是否有效")
    view_count = models.IntegerField(default=0, verbose_name="浏览次数")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-market_rank"]

    def __str__(self):
        return self.name