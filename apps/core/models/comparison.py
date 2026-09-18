from django.db import models


class ProductComparison(models.Model):
    """产品对比组"""

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="comparisons", verbose_name="用户")
    title = models.CharField(max_length=200, blank=True, verbose_name="对比标题")
    category = models.CharField(max_length=50, verbose_name="对比品类")
    products = models.ManyToManyField("Product", related_name="comparisons", verbose_name="对比产品")
    snapshot_data = models.JSONField(default=dict, blank=True, verbose_name="对比快照")
    is_public = models.BooleanField(default=False, verbose_name="是否公开")
    view_count = models.IntegerField(default=0, verbose_name="浏览次数")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-created_at"]

    def save_snapshot(self):
        """保存对比时的产品数据快照"""
        from datetime import datetime

        snapshot = [p.get_compare_context() for p in self.products.all()]
        self.snapshot_data = {"products": snapshot, "saved_at": str(datetime.now())}
        self.save(update_fields=["snapshot_data"])

    def __str__(self):
        return f"{self.user.phone} - {self.title or self.category}"