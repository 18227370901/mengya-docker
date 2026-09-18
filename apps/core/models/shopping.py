from django.db import models


class ShoppingList(models.Model):
    """待产包/购物清单"""

    LIST_TYPES = [
        ("hospital_bag", "入院待产包"),
        ("home_stock", "家中囤货"),
        ("travel_kit", "出行套装"),
        ("custom", "自定义清单"),
    ]
    SEASON_CHOICES = [
        ("spring", "春季"),
        ("summer", "夏季"),
        ("autumn", "秋季"),
        ("winter", "冬季"),
        ("all", "通用"),
    ]
    DELIVERY_CHOICES = [
        ("vaginal", "顺产"),
        ("cesarean", "剖腹产"),
        ("both", "通用"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="shopping_lists", verbose_name="用户")
    baby = models.ForeignKey(
        "BabyProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shopping_lists",
        verbose_name="宝宝",
    )
    name = models.CharField(max_length=100, verbose_name="清单名称")
    list_type = models.CharField(max_length=20, choices=LIST_TYPES, default="hospital_bag", verbose_name="清单类型")
    season = models.CharField(max_length=10, choices=SEASON_CHOICES, default="all", verbose_name="季节")
    delivery_method = models.CharField(max_length=10, choices=DELIVERY_CHOICES, default="both", verbose_name="分娩方式")
    total_items = models.IntegerField(default=0, verbose_name="总物品数")
    prepared_count = models.IntegerField(default=0, verbose_name="已准备数")
    progress_percent = models.IntegerField(default=0, verbose_name="进度百分比")
    is_public = models.BooleanField(default=False, verbose_name="是否公开分享")
    is_default_template = models.BooleanField(default=False, verbose_name="是否系统默认模板")
    cover_image = models.URLField(blank=True, null=True, verbose_name="清单封面")
    note = models.TextField(blank=True, verbose_name="备注")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-is_default_template", "-created_at"]

    def update_progress(self):
        items = self.items.all()
        total = items.count()
        prepared = items.filter(is_checked=True).count()
        self.total_items = total
        self.prepared_count = prepared
        self.progress_percent = int((prepared / total) * 100) if total > 0 else 0
        self.save(update_fields=["total_items", "prepared_count", "progress_percent"])

    def __str__(self):
        return f"{self.user.phone} - {self.name}"


class ShoppingListItem(models.Model):
    """清单明细项"""

    PURCHASE_STATUS = [
        ("not_bought", "未购买"),
        ("bought", "已购买"),
        ("considering", "考虑中"),
    ]

    shopping_list = models.ForeignKey(ShoppingList, on_delete=models.CASCADE, related_name="items", verbose_name="清单")
    product = models.ForeignKey(
        "Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="list_items",
        verbose_name="关联商品",
    )
    custom_name = models.CharField(max_length=200, blank=True, verbose_name="自定义名称")
    # 新增：来源模板引用（Excel 导入的参考物品）
    provider_item = models.ForeignKey(
        "BabyShoppingItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_items",
        verbose_name="来源参考物品",
    )
    owner = models.CharField(max_length=10, blank=True, default="", verbose_name="物品归属（mom/baby）")
    category = models.CharField(max_length=50, blank=True, default="", verbose_name="类别")
    quantity = models.CharField(max_length=50, default="1", verbose_name="建议数量")
    quantity_prepared = models.IntegerField(default=0, verbose_name="已准备数量")
    unit = models.CharField(max_length=20, default="件", blank=True, verbose_name="单位")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="单价")
    total_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="总价")
    image_url = models.URLField(blank=True, null=True, verbose_name="示例图片")
    extra_image_url = models.URLField(blank=True, null=True, verbose_name="额外示例图片")
    purchase_status = models.CharField(max_length=20, choices=PURCHASE_STATUS, default="not_bought", verbose_name="购买情况")
    is_checked = models.BooleanField(default=False, verbose_name="是否已完成")
    note = models.TextField(blank=True, verbose_name="备注（如尺码/颜色建议）")
    sort_order = models.IntegerField(default=0, verbose_name="排序")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return self.product.name if self.product else self.custom_name or "未命名物品"