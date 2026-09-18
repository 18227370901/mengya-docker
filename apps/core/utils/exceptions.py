from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """统一 API 响应格式：{code, message, data}"""
    # 处理单终端登录被踢下线
    from apps.core.utils.single_session_auth import ForceLogoutError
    if isinstance(exc, ForceLogoutError):
        from rest_framework.response import Response
        return Response(
            {"code": 1003, "message": str(exc), "data": None},
            status=exc.status_code,
        )

    response = exception_handler(exc, context)
    if response is not None:
        detail = response.data
        # Throttled 异常携带 wait 字段
        if isinstance(detail, dict) and "detail" in detail:
            message = str(detail["detail"])
            code = 4000
            # 限流时携带等待秒数
            wait = getattr(exc, "wait", None) or detail.get("wait")
            if wait:
                response.data = {
                    "code": 4000,
                    "message": message,
                    "data": {"wait_seconds": int(wait)},
                }
                return response
        elif isinstance(detail, dict):
            first_key = list(detail.keys())[0]
            first_val = detail[first_key]
            message = str(first_val[0]) if isinstance(first_val, list) and first_val else str(first_val)
            code = 2001 if response.status_code == 400 else response.status_code
        else:
            message = str(detail)
            code = response.status_code
        response.data = {"code": code, "message": message, "data": None}
    return response
