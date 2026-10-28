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
            inner = detail["detail"]
            # v1.88.5 修复：PermissionDenied(detail={"code":..., "message":..., "permission":...}) 结构。
            # 此前对 dict 直接 str() 透传，前端用户看到的是原始字典字符串
            # （如 "{'code': 4030, ...}"）而非可读文案。
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
            # v1.88.5 修复：DRF 对 PermissionDenied(detail={...}) 这类 dict detail 会直接展开为
            # response.data（没有 "detail" 包裹键）。此前走通用分支取第一个键（"code"），
            # message 变成 str(4030)="4030" —— 用户看到裸数字提示的真正来源。
            # 这里优先识别内嵌 message/code/permission 的结构化详情并原样规范输出。
            if "message" in detail and ("code" in detail or "permission" in detail):
                # v1.88.5 补充：DRF 会把 dict detail 的值转为 ErrorDetail 字符串（code 变 "4030"），
                # 此处显式转回 int，保证响应中 code 是数字
                raw_code = detail.get("code") or response.status_code
                try:
                    raw_code = int(raw_code)
                except (TypeError, ValueError):
                    pass
                response.data = {
                    "code": raw_code,
                    "message": detail.get("message") or "请求失败",
                    "data": {"permission": detail["permission"]} if detail.get("permission") else None,
                }
                return response
            first_key = list(detail.keys())[0]
            first_val = detail[first_key]
            message = str(first_val[0]) if isinstance(first_val, list) and first_val else str(first_val)
            code = 2001 if response.status_code == 400 else response.status_code
        else:
            message = str(detail)
            code = response.status_code
        response.data = {"code": code, "message": message, "data": None}
    return response
