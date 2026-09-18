"""待产包参考数据模型 — 来自用户 Excel 导入的妈妈篇/宝宝篇物品清单"""
from django.db import models


class BabyShoppingItem(models.Model):
    """待产包参考物品（样例数据，区别于用户个人的 ShoppingListItem）"""

    OWNER_CHOICES = [
        ("mom", "妈妈"),
        ("baby", "宝宝"),
    ]

    owner = models.CharField(max_length=10, choices=OWNER_CHOICES, verbose_name="物品归属")
    category = models.CharField(max_length=50, verbose_name="类别")
    name = models.CharField(max_length=200, verbose_name="物品名称")
    quantity = models.CharField(max_length=50, default="1", verbose_name="数量")
    unit = models.CharField(max_length=20, default="件", blank=True, verbose_name="单位")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="单价")
    total_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="总价")
    remark = models.TextField(blank=True, verbose_name="备注")
    image_url = models.URLField(blank=True, null=True, verbose_name="示例图片")
    extra_image_url = models.URLField(blank=True, null=True, verbose_name="额外示例图片")
    sort_order = models.IntegerField(default=0, verbose_name="排序")
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["owner", "sort_order", "id"]
        verbose_name = "待产包参考物品"
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"[{'妈妈' if self.owner == 'mom' else '宝宝'}] {self.category} - {self.name}"
