import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """统一 API 响应格式：{code, message, data}"""
    from apps.core.utils.single_session_auth import ForceLogoutError

    if isinstance(exc, ForceLogoutError):
        return Response(
            {"code": 1003, "message": str(exc), "data": None},
            status=exc.status_code,
        )

    response = exception_handler(exc, context)
    if response is not None:
        detail = response.data
        if isinstance(detail, dict) and "detail" in detail:
            inner = detail["detail"]
            if isinstance(inner, dict):
                message = inner.get("message") or str(inner)
                code = inner.get("code") or response.status_code
                try:
                    code = int(code)
                except (TypeError, ValueError):
                    pass
                perm = inner.get("permission")
                response.data = {
                    "code": code,
                    "message": message,
                    "data": {"permission": perm} if perm else None,
                }
                return response
            message = str(inner)
            code = 4000
            wait = getattr(exc, "wait", None) or detail.get("wait")
            if wait:
                response.data = {
                    "code": 4000,
                    "message": message,
                    "data": {"wait_seconds": int(wait)},
                }
                return response
        elif isinstance(detail, dict):
            if "message" in detail and ("code" in detail or "permission" in detail):
                raw_code = detail.get("code") or response.status_code
                try:
                    raw_code = int(raw_code)
                except (TypeError, ValueError):
                    pass
                response.data = {
                    "code": raw_code,
                    "message": detail.get("message") or "请求失败",
                    "data": (
                        {"permission": detail["permission"]}
                        if detail.get("permission")
                        else None
                    ),
                }
                return response
            first_key = list(detail.keys())[0] if detail else "error"
            first_val = detail[first_key] if detail else "请求失败"
            message = (
                str(first_val[0])
                if isinstance(first_val, list) and first_val
                else str(first_val)
            )
            code = 2001 if response.status_code == 400 else response.status_code
        else:
            message = str(detail)
            code = response.status_code
        response.data = {"code": code, "message": message, "data": None}
        return response

    view_obj = context.get("view") if context else None
    view_name = view_obj.__class__.__name__ if view_obj else "UnknownView"
    logger.error(f"[Unhandled System Exception] in {view_name}: {str(exc)}", exc_info=True)
    return Response(
        {"code": 5000, "message": "系统繁忙，请稍后再试", "data": None},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
