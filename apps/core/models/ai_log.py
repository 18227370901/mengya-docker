from django.db import models


class AIQueryLog(models.Model):
    """AI 查询日志"""

    QUERY_TYPES = [
        ("qa", "普通问答"),
        ("price_compare", "比价"),
        ("product_recommend", "产品推荐"),
        ("product_compare", "产品对比"),
        ("health_advice", "健康建议"),
    ]

    user = models.ForeignKey("User", on_delete=models.SET_NULL, null=True, blank=True, related_name="ai_logs", verbose_name="用户")
    session_id = models.CharField(max_length=100, blank=True, verbose_name="会话ID")
    query_type = models.CharField(max_length=20, choices=QUERY_TYPES, default="qa", verbose_name="查询类型")
    query_text = models.TextField(verbose_name="用户提问")
    response_text = models.TextField(verbose_name="AI回复")
    products_mentioned = models.JSONField(default=list, blank=True, verbose_name="提及的产品ID列表")
    platform_results = models.JSONField(default=dict, blank=True, verbose_name="电商平台返回数据")
    response_time_ms = models.IntegerField(default=0, verbose_name="响应时间(毫秒)")
    token_usage = models.JSONField(default=dict, blank=True, verbose_name="Token用量")
    is_satisfied = models.BooleanField(null=True, blank=True, verbose_name="用户是否满意")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.phone if self.user else '匿名'} - {self.query_text[:30]}..."