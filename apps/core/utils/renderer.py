"""自定义渲染器：统一所有 API 响应为 {code, message, data} 格式"""

from rest_framework.renderers import JSONRenderer


class CustomJSONRenderer(JSONRenderer):
    """
    将 DRF 默认输出统一包装为：
    { "code": 0, "message": "success", "data": <原始数据> }

    如果响应已经是 {code, message, data} 格式则不重复包装。
    对 204 No Content 遵循 HTTP 规范，不携带响应体，避免反代解析异常。
    """

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # 204 No Content 规范处理：返回空字节，防止 Node/Vite 代理报 Parse Error
        if renderer_context and renderer_context.get("response"):
            status_code = getattr(renderer_context["response"], "status_code", 200)
            if status_code == 204:
                return b""

        # 如果已经是统一格式（有 code 字段），直接输出
        if isinstance(data, dict) and "code" in data and "message" in data:
            return super().render(data, accepted_media_type, renderer_context)

        # 如果是错误响应（DRF 的 ValidationError 等），交给 exception_handler 处理过了
        # 正常成功响应，包装为统一格式
        wrapped = {"code": 0, "message": "success", "data": data}
        return super().render(wrapped, accepted_media_type, renderer_context)
