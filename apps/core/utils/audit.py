"""审计日志辅助函数"""
from ..models import AuditLog


def _client_ip(request):
    """获取客户端 IP（兼容反代）"""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def audit(request, action, action_label="", target_type="", target_id="", target_name="", detail="", user=None):
    """写入一条审计日志。user 缺省时取 request.user（未登录则为 None）。增加异常防护，防止审计写入异常阻断主流程。"""
    try:
        op_user = user if user is not None else getattr(request, "user", None)
        op_user = op_user if (op_user and op_user.is_authenticated) else None
        return AuditLog.objects.create(
            user=op_user,
            username=(op_user.username if op_user else ""),
            action=action,
            action_label=action_label,
            target_type=target_type,
            target_id=str(target_id) if target_id not in (None, "") else "",
            target_name=target_name or "",
            detail=detail or "",
            ip=_client_ip(request),
        )
    except Exception:
        return None
