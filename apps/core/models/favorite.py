from django.db import models


class UserFavorite(models.Model):
    """用户收藏"""

    FAVORITE_TYPES = [
        ("product", "商品"),
        ("timeline", "内容"),
        ("shopping_list", "清单"),
        ("comparison", "对比"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="favorites", verbose_name="用户")
    favorite_type = models.CharField(max_length=20, choices=FAVORITE_TYPES, verbose_name="收藏类型")
    object_id = models.IntegerField(verbose_name="收藏对象ID")
    note = models.CharField(max_length=200, blank=True, verbose_name="备注")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        unique_together = [["user", "favorite_type", "object_id"]]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.phone} - {self.favorite_type} - {self.object_id}"