from django.db import models


class Product(models.Model):
    """商品库（14 大类，含五维评分与安全数据）"""

    FIRST_CATEGORY_CHOICES = [
        ("food", "食品类"),
        ("feeding", "食具类"),
        ("clothing", "服装及布类"),
        ("diaper", "尿裤类"),
        ("bedding", "寝具类"),
        ("furniture", "家具类"),
        ("bath", "洗护日用品类"),
        ("health_tool", "护理工具类"),
        ("travel", "出行类"),
        ("toy", "启智早教类"),
        ("mama_pregnancy", "妈妈用品-孕期"),
        ("mama_postpartum", "妈妈用品-产后"),
        ("mama_nursing", "妈妈用品-哺乳"),
        ("appliance", "电子电器类"),
    ]
    SEASON_CHOICES = [
        ("spring", "春季"),
        ("summer", "夏季"),
        ("autumn", "秋季"),
        ("winter", "冬季"),
        ("all", "全年"),
    ]

    name = models.CharField(max_length=200, verbose_name="产品名称")
    brand = models.CharField(max_length=100, verbose_name="品牌")
    brand_profile = models.ForeignKey(
        "BrandProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="品牌档案",
    )
    model = models.CharField(max_length=100, blank=True, verbose_name="型号")
    image_url = models.TextField(verbose_name="主图")
    gallery_images = models.JSONField(default=list, blank=True, verbose_name="多图展示")

    # 分类层级
    first_category = models.CharField(max_length=30, choices=FIRST_CATEGORY_CHOICES, verbose_name="一级分类")
    second_category = models.CharField(max_length=50, verbose_name="二级分类")
    third_category = models.CharField(max_length=50, blank=True, verbose_name="三级分类")

    # 规格参数（结构化 JSON）
    specifications = models.JSONField(default=dict, blank=True, verbose_name="规格参数")
    price_info = models.JSONField(default=dict, blank=True, verbose_name="价格信息")
    ratings = models.JSONField(default=dict, blank=True, verbose_name="五维评分")
    overall_rating = models.FloatField(default=0, verbose_name="综合推荐指数(0-10)")

    # 安全与品质
    has_ccc_certification = models.BooleanField(default=False, verbose_name="是否通过CCC认证")
    safety_alert = models.TextField(blank=True, verbose_name="安全风险提示")
    test_report_source = models.CharField(max_length=200, blank=True, verbose_name="测试报告来源")

    # 市场地位
    market_position = models.JSONField(default=dict, blank=True, verbose_name="市场地位")

    # 适用阶段
    applicable_age_start = models.IntegerField(null=True, blank=True, verbose_name="起始月龄")
    applicable_age_end = models.IntegerField(null=True, blank=True, verbose_name="结束月龄")
    applicable_week_start = models.IntegerField(null=True, blank=True, verbose_name="适用孕周起")
    applicable_week_end = models.IntegerField(null=True, blank=True, verbose_name="适用孕周止")
    applicable_season = models.CharField(
        max_length=20,
        choices=SEASON_CHOICES,
        default="all",
        blank=True,
        verbose_name="适用季节",
    )

    # 内容字段
    description = models.TextField(blank=True, verbose_name="产品描述")
    purchase_links = models.JSONField(default=dict, blank=True, verbose_name="推荐购买链接")
    purchase_guide = models.TextField(blank=True, verbose_name="选购指南（含避坑提示）")
    quantity_suggestion = models.JSONField(default=dict, blank=True, verbose_name="数量建议")

    # 标记字段
    is_essential = models.BooleanField(default=False, verbose_name="是否刚需必备")
    has_seasonal_variation = models.BooleanField(default=False, verbose_name="是否因季节调整数量")
    has_delivery_variation = models.BooleanField(default=False, verbose_name="是否因分娩方式调整")
    is_active = models.BooleanField(default=True, verbose_name="是否上架")

    # 统计
    view_count = models.IntegerField(default=0, verbose_name="浏览次数")
    fav_count = models.IntegerField(default=0, verbose_name="收藏次数")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        indexes = [
            models.Index(fields=["first_category", "second_category"]),
            models.Index(fields=["brand"]),
            models.Index(fields=["overall_rating"]),
            models.Index(fields=["is_essential"]),
            models.Index(fields=["applicable_age_start", "applicable_age_end"]),
        ]

    def __str__(self):
        return f"{self.brand} {self.name}"

    def get_compare_context(self):
        """返回用于对比的数据上下文"""
        return {
            "id": self.id,
            "name": self.name,
            "brand": self.brand,
            "image": self.image_url,
            "price": self.price_info,
            "ratings": self.ratings,
            "overall": self.overall_rating,
            "specs": self.specifications,
            "safety": {
                "ccc": self.has_ccc_certification,
                "alert": self.safety_alert,
                "test_source": self.test_report_source,
            },
            "purchase_guide": self.purchase_guide,
        }