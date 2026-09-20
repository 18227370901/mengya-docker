"""单终端登录校验 —— 新登录踢掉旧会话 / 服务重启强制下线"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication


class SingleSessionJWTAuthentication(JWTAuthentication):
    """
    在标准 JWT 认证基础上，额外校验 token 的 JTI 是否与用户当前 active_token_jti 一致。
    若另一端登录或服务重启导致会话失效，当前端持有的旧 token 自动失效（返回 401 + code=1003）。
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # 获取 token 中的 JTI
        try:
            token_jti = validated_token["jti"]
        except KeyError:
            return user

        # 校验 JTI 是否与用户当前活跃登录会话匹配
        if not user.active_token_jti or str(token_jti) != user.active_token_jti:
            # 返回特定错误码 1003，前端据此提示"您的账号已在其他设备登录或服务已重启，请重新登录"
            raise ForceLogoutError()

        return user


class ForceLogoutError(Exception):
    """强制下线异常 —— 携带业务错误码 1003"""
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = 1003
    default_detail = "您的账号已在其他设备登录或服务已重启，请重新登录"

    def __init__(self, detail=None):
        self.detail = detail or self.default_detail

    def __str__(self):
        return str(self.detail)
