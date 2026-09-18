"""单终端登录校验 —— 新登录踢掉旧会话"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication


class SingleSessionJWTAuthentication(JWTAuthentication):
    """
    在标准 JWT 认证基础上，额外校验 token 的 JTI 是否与用户当前 active_token_jti 一致。
    若不一致说明已有新终端登录，旧 token 自动失效（返回 401 + code=1003）。
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # 获取 token 中的 JTI
        try:
            token_jti = validated_token["jti"]
        except KeyError:
            return user

        # 校验 JTI 是否匹配
        if user.active_token_jti and str(token_jti) != user.active_token_jti:
            # 返回特殊错误码 1003，前端据此提示"已在其他设备登录"
            raise ForceLogoutError()

        return user


class ForceLogoutError(Exception):
    """被踢下线异常 —— 携带特殊错误码 1003"""
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = 1003
    default_detail = "此账号已在其他设备登录，请重新登录"

    def __init__(self, detail=None):
        self.detail = detail or self.default_detail

    def __str__(self):
        return str(self.detail)
