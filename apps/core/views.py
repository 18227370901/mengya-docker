"""API 视图：萌芽母婴平台全部接口"""
import csv
import io
import random
import re

from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import models
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    AIQueryLog,
    AuditLog,
    BabyProfile,
    BabyShoppingItem,
    BrandProfile,
    ChatMessage,
    ChatSession,
    FetalStory,
    HealthRecord,
    InviteLink,
    Notification,
    Product,
    ProductComparison,
    Recipe,
    KidsEncyclopedia,
    ShoppingList,
    ShoppingListItem,
    SystemSetting,
    TimelineEvent,
    UserFavorite,
)
from .serializers import (
    BabyProfileSerializer,
    BabyShoppingItemSerializer,
    BrandProfileSerializer,
    FetalStorySerializer,
    FavoriteSerializer,
    HealthRecordSerializer,
    NotificationSerializer,
    ProductSerializer,
    RecipeSerializer,
    KidsEncyclopediaSerializer,
    ShoppingListItemSerializer,
    ShoppingListSerializer,
    TimelineSerializer,
    UserSerializer,
)
from .services import ai_service
from .services.product_comparator import ProductComparator
from .services.shopping_list_generator import ShoppingListGenerator
from .utils.rate_limit import rate_limit
from .utils.stage_utils import get_stage_info
from .utils.audit import audit
from .utils.permissions import DEFAULT_USER_PERMISSIONS, PERMISSION_DEFINITIONS, get_user_permissions, has_permission, check_permission_or_403, normalize_permissions

User = get_user_model()


# ============ 安全风控辅助 ============

def _get_client_ip(request):
    """获取客户端 IP（兼容反代）"""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _is_admin(user):
    """判断指定用户是否为管理员（管理员账号受永不冻结保护，具有最高免死金牌与权限保护）"""
    if not user:
        return False
    return bool(
        getattr(user, "is_staff", False)
        or getattr(user, "is_superuser", False)
        or getattr(user, "role", "") == "admin"
        or getattr(user, "username", "") == "admin"
        or getattr(user, "phone", "") == "admin"
    )


def _find_user_by_account(account):
    """按手机号或用户名查找用户（支持大小写不敏感匹配，若为管理员则自愈激活）"""
    if not account:
        return None
    acc = str(account).strip()
    user = (
        User.objects.filter(phone__iexact=acc).first()
        or User.objects.filter(username__iexact=acc).first()
    )
    if user and _is_admin(user) and not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])
    return user


def _security_setting():
    """获取当前安全风控阈值配置（兜底容错，支持秒级熔断等待控制）"""
    try:
        s = SystemSetting.get_settings()
        sec = getattr(s, "login_lock_seconds", None)
        if sec is None or sec <= 0:
            sec = max(1, (s.login_lock_minutes or 5) * 60)
        return {
            "captcha_threshold": max(1, s.login_captcha_threshold or 3),
            "freeze_threshold": max(2, s.login_freeze_threshold or 10),
            "lock_minutes": max(1, sec // 60),
            "lock_seconds": max(1, sec),
            "forgot_password_max_attempts": max(1, getattr(s, "forgot_password_max_attempts", 5) or 5),
        }
    except Exception:
        return {
            "captcha_threshold": 3,
            "freeze_threshold": 10,
            "lock_minutes": 5,
            "lock_seconds": 300,
            "forgot_password_max_attempts": 5,
        }


def _maybe_require_captcha(user, fail_count, threshold):
    """达到阈值时返回需要验证码的响应"""
    return Response(
        {
            "code": 1010,
            "message": "密码失败次数较多，请输入验证码后重试",
            "data": {
                "need_captcha": True,
                "fail_count": fail_count,
                "threshold": threshold,
            },
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _check_locked(user, sec):
    """检查用户是否处于临时锁定保护期，返回 (locked, remaining_seconds, response)"""
    if not user or not user.locked_until:
        return False, 0, None
    from django.utils import timezone
    now = timezone.now()
    if now < user.locked_until:
        remaining = int((user.locked_until - now).total_seconds())
        if _is_admin(user):
            # 管理员永不冻结，仅触发强制等待与图形验证码要求
            user.is_active = True
            user.save(update_fields=["is_active"])
            return True, remaining, Response(
                {
                    "code": 1012,
                    "message": f"管理员账号触发安全风控保护，请强制等待 {remaining} 秒后输入图形验证码重试",
                    "data": {
                        "locked": True,
                        "is_frozen": False,
                        "wait_seconds": remaining,
                        "need_captcha": True,
                    },
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return True, remaining, Response(
            {
                "code": 1012,
                "message": f"账号处于安全锁定期，请在 {remaining} 秒后重试",
                "data": {
                    "locked": True,
                    "is_frozen": not user.is_active,
                    "wait_seconds": remaining,
                },
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    # 锁定已过期，解除锁定状态
    user.locked_until = None
    if _is_admin(user):
        user.is_active = True
        user.save(update_fields=["locked_until", "is_active"])
    else:
        user.save(update_fields=["locked_until"])
    return False, 0, None


def _register_login_failure(user, fail_count, freeze_threshold, lock_seconds=300):
    """记录登录失败。普通用户达到冻结阈值后将账号冻结（is_active=False）；管理员账号永不冻结，仅触发强制等待与图形验证码要求（秒级控制）"""
    if user:
        user.login_fail_count = fail_count
        if fail_count >= freeze_threshold:
            from django.utils import timezone
            from datetime import timedelta
            lock_sec = max(1, lock_seconds)
            user.locked_until = timezone.now() + timedelta(seconds=lock_sec)
            if _is_admin(user):
                user.is_active = True
            else:
                user.is_active = False
            user.save(update_fields=["is_active", "locked_until", "login_fail_count"])
            return True
        user.save(update_fields=["login_fail_count"])
    return False


# ============ 认证 ============

@api_view(["POST"])
@permission_classes([AllowAny])
@rate_limit("login", 10)
def register(request):
    from .serializers import RegisterSerializer

    # 检查注册模式
    reg_mode = SystemSetting.get_registration_mode()
    invite_token = request.data.get("invite_token", "")

    invite = None
    if reg_mode == "invitation_only":
        if not invite_token:
            return Response(
                {"code": 3001, "message": "当前为邀请注册模式，请通过邀请链接注册", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            invite = InviteLink.objects.get(token=invite_token)
        except InviteLink.DoesNotExist:
            return Response(
                {"code": 3002, "message": "邀请链接无效", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not invite.is_valid:
            return Response(
                {"code": 3003, "message": "邀请链接已失效或已用完", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    # 邀请注册：更新使用次数
    if invite:
        invite.used_count += 1
        invite.save(update_fields=["used_count"])
        if invite.used_count >= invite.max_uses:
            invite.is_active = False
            invite.save(update_fields=["is_active"])

    refresh = RefreshToken.for_user(user)
    access_token = refresh.access_token
    user.active_token_jti = str(access_token["jti"])
    user.save(update_fields=["active_token_jti"])

    audit(request, "register", "注册账号", "user", user.id, user.username or user.phone,
          f"注册新账号 {user.username}", user=user)
    return Response(
        {
            "code": 0,
            "message": "注册成功",
            "data": {
                "user": UserSerializer(user).data,
                "access": str(access_token),
                "refresh": str(refresh),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def registration_mode(request):
    """获取当前注册模式（公开接口，注册页面使用）"""
    mode = SystemSetting.get_registration_mode()
    return Response({"code": 0, "message": "success", "data": {"mode": mode}})


@api_view(["POST"])
@permission_classes([AllowAny])
@rate_limit("login", 60)
def login(request):
    account = request.data.get("phone", "")  # 前端字段名可能是 phone，支持用户名
    password = request.data.get("password", "")
    captcha = request.data.get("captcha", "")
    sec = _security_setting()

    # 支持手机号或用户名登录
    user = _find_user_by_account(account)
    if user and _is_admin(user) and not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])

    if user and not user.is_active and not _is_admin(user):
        return Response(
            {"code": 1002, "message": "该账号已被冻结，请联系管理员", "data": None},
            status=status.HTTP_403_FORBIDDEN,
        )

    # 检查临时锁定状态
    locked, wait_secs, lock_resp = _check_locked(user, sec)
    if locked:
        return lock_resp

    # 密码校验（无论账号是否存在都统一提示，防止账号枚举）
    password_ok = bool(user) and user.check_password(password)
    if not password_ok:
        if user is None:
            # 不存在的账号，直接提示错误（防暴力探测）
            return Response(
                {"code": 1001, "message": "账号或密码错误", "data": None},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        # 存在账号，累加失败次数
        fail_count = user.login_fail_count + 1
        if fail_count >= sec["freeze_threshold"]:
            _register_login_failure(user, fail_count, sec["freeze_threshold"], sec["lock_seconds"])
            from django.utils import timezone
            remaining = int((user.locked_until - timezone.now()).total_seconds()) if user.locked_until else sec["lock_seconds"]
            if _is_admin(user):
                audit(request, "login_fail", "管理员登录失败(触发强制等待)", "用户", user.username,
                      user.nickname or user.username,
                      f"密码失败 {fail_count} 次，触发管理员强制等待 {remaining} 秒与验证码要求，未冻结账号",
                      user=user)
                return Response(
                    {
                        "code": 1012,
                        "message": f"密码连续错误已达上限（{sec['freeze_threshold']}次），已触发安全风控，请强制等待 {remaining} 秒后输入图形验证码重试",
                        "data": {"locked": True, "is_frozen": False, "wait_seconds": remaining, "need_captcha": True},
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            else:
                audit(request, "login_fail", "登录失败(超限冻结)", "用户", user.username,
                      user.nickname or user.username,
                      f"密码失败 {fail_count} 次，已达冻结阈值，账号已冻结",
                      user=user)
                return Response(
                    {
                        "code": 1012,
                        "message": f"密码连续错误已达上限（{sec['freeze_threshold']}次），该账号已被冻结，请联系管理员解冻",
                        "data": {"locked": True, "is_frozen": True, "wait_seconds": remaining},
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        if fail_count >= sec["captcha_threshold"]:
            user.login_fail_count = fail_count
            user.save(update_fields=["login_fail_count"])
            audit(request, "login_fail", "登录失败(需验证码)", "用户", user.username,
                  user.nickname or user.username, f"密码失败 {fail_count} 次，已达验证码阈值",
                  user=user)
            return _maybe_require_captcha(user, fail_count, sec["captcha_threshold"])

        user.login_fail_count = fail_count
        user.save(update_fields=["login_fail_count"])
        audit(request, "login_fail", "登录失败", "用户", user.username,
              user.nickname or user.username, f"密码错误累计失败 {fail_count} 次",
              user=user)
        return Response(
            {"code": 1001, "message": "账号或密码错误", "data": None},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # 密码正确，校验验证码（若失败次数已达阈值或管理员有输错历史）
    need_captcha = bool(
        user.login_fail_count >= sec["captcha_threshold"]
        or user.security_fail_count >= sec["captcha_threshold"]
        or user.locked_until is not None
        or (_is_admin(user) and (
            user.login_fail_count >= sec["freeze_threshold"]
            or user.security_fail_count >= sec["forgot_password_max_attempts"]
        ))
    )
    if need_captcha:
        expected = ""
        if hasattr(request, "session"):
            expected = request.session.get("login_captcha", "")
        if not captcha or captcha.lower() != str(expected).lower():
            return Response(
                {
                    "code": 1011,
                    "message": "验证码不正确，请重新输入",
                    "data": {"need_captcha": True, "fail_count": user.login_fail_count, "threshold": sec["captcha_threshold"]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    # 登录成功，全量重置连续密码错误与密保错误计数、解除锁定状态与等待时间
    user.login_fail_count = 0
    user.security_fail_count = 0
    user.locked_until = None
    user.is_active = True
    user.save(update_fields=["login_fail_count", "security_fail_count", "locked_until", "is_active"])
    if hasattr(request, "session"):
        request.session.pop("login_captcha", None)

    refresh = RefreshToken.for_user(user)

    # ===== 单终端登录：记录当前 access token 的 JTI，旧 token 自动失效 =====
    access_token = refresh.access_token
    user.active_token_jti = str(access_token["jti"])
    user.save(update_fields=["active_token_jti"])

    audit(request, "login", "登录成功", "用户", user.username,
          user.nickname or user.username, detail=f"账号：{user.username}", user=user)
    return Response(
        {
            "code": 0,
            "message": "登录成功",
            "data": {
                "user": UserSerializer(user).data,
                "access": str(access_token),
                "refresh": str(refresh),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def captcha_status(request):
    """查询当前账号是否需要验证码及锁定状态（免登录接口，登录页轮询）"""
    account = request.query_params.get("phone", "")
    user = _find_user_by_account(account)
    if not user:
        return Response({"code": 0, "message": "success", "data": {"need_captcha": False, "fail_count": 0, "locked": False, "wait_seconds": 0}})
    sec = _security_setting()
    if _is_admin(user) and not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])

    # 检查锁定状态
    locked, wait_secs, _ = _check_locked(user, sec)
    need_captcha = bool(
        (user.login_fail_count >= sec["captcha_threshold"])
        or (user.security_fail_count >= sec["captcha_threshold"])
        or (user.locked_until is not None)
        or (_is_admin(user) and (
            user.login_fail_count >= sec["freeze_threshold"]
            or user.security_fail_count >= sec["forgot_password_max_attempts"]
        ))
    )
    return Response({
        "code": 0,
        "message": "success",
        "data": {
            "need_captcha": need_captcha,
            "fail_count": user.login_fail_count,
            "threshold": sec["captcha_threshold"],
            "locked": locked,
            "is_frozen": not user.is_active if not _is_admin(user) else False,
            "wait_seconds": wait_secs,
            "is_admin": _is_admin(user),
        },
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def captcha_new(request):
    """生成图形验证码（返回 base64 图片 + 会话存答案）"""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        # 无 PIL 时退化为纯数字文本验证码
        code = str(random.randint(1000, 9999))
        request.session["login_captcha"] = code
        return Response({"code": 0, "message": "success", "data": {"type": "text", "code": code}})

    import base64
    from io import BytesIO

    # 生成 4 位随机字符（排除易混淆字符）
    chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    code = "".join(random.choice(chars) for _ in range(4))
    request.session["login_captcha"] = code

    width, height = 120, 44
    img = Image.new("RGB", (width, height), (249, 250, 251))
    draw = None
    try:
        from PIL import ImageDraw

        draw = ImageDraw.Draw(img)
        # 干扰线
        for _ in range(5):
            x1 = random.randint(0, width)
            y1 = random.randint(0, height)
            x2 = random.randint(0, width)
            y2 = random.randint(0, height)
            draw.line([(x1, y1), (x2, y2)], fill=(220, 230, 240), width=1)
        # 噪点
        for _ in range(40):
            draw.point((random.randint(0, width), random.randint(0, height)), fill=(180, 200, 215))
        # 字符
        try:
            font = ImageFont.truetype("arial.ttf", 26)
        except Exception:
            font = ImageFont.load_default()
        x = 14
        for ch in code:
            draw.text((x, 8), ch, font=font, fill=(60, 80, 110))
            x += 24
    except Exception:
        pass

    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return Response({"code": 0, "message": "success", "data": {"type": "image", "image": f"data:image/png;base64,{b64}"}})


@api_view(["POST"])
@permission_classes([AllowAny])
def sms_send(request):
    """发送验证码（演示环境直接返回验证码）"""
    phone = request.data.get("phone", "")
    if not phone.isdigit() or len(phone) != 11:
        return Response(
            {"code": 2001, "message": "手机号格式不正确", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    code = "".join([str(random.randint(0, 9)) for _ in range(6)])
    return Response({"code": 0, "message": "验证码已发送", "data": {"debug_code": code}})


# ============ 用户 ============

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        stage = get_stage_info(user.due_date, user.baby_birthday, user.is_pregnant)
        return Response(
            {
                "code": 0,
                "message": "success",
                "data": {
                    "user": UserSerializer(user).data,
                    "stage": stage,
                    "permissions": get_user_permissions(user),
                },
            }
        )

    def put(self, request):
        put_data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        is_pregnant_val = put_data.get("is_pregnant")
        if is_pregnant_val is True or str(is_pregnant_val).lower() == "true":
            put_data["is_pregnant"] = True
            # 切换为孕期时，若未显式传 baby_birthday 则置为 None
            if "baby_birthday" not in put_data or put_data.get("baby_birthday") is None:
                put_data["baby_birthday"] = None
        elif is_pregnant_val is False or str(is_pregnant_val).lower() == "false":
            put_data["is_pregnant"] = False
            # 切换为已出生时，若未显式传 due_date 则置为 None
            if "due_date" not in put_data or put_data.get("due_date") is None:
                put_data["due_date"] = None

        serializer = UserSerializer(request.user, data=put_data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # 数据库层互斥清理防御：孕期时清空 baby_birthday，已出生时清空 due_date
        fields_to_update = []
        if user.is_pregnant and user.baby_birthday is not None:
            user.baby_birthday = None
            fields_to_update.append("baby_birthday")
        elif not user.is_pregnant and user.baby_birthday and user.due_date is not None:
            user.due_date = None
            fields_to_update.append("due_date")

        if fields_to_update:
            user.save(update_fields=fields_to_update)

        audit(request, "profile_update", "更新个人资料/孕育阶段", "user", user.id,
              user.nickname or user.phone, "更新个人资料、预产期或宝宝生日")
        stage = get_stage_info(user.due_date, user.baby_birthday, user.is_pregnant)
        return Response({"code": 0, "message": "已更新", "data": {"user": UserSerializer(user).data, "stage": stage}})


class AIConfigView(APIView):
    """AI 助手配置：支持多配置列表管理
    管理员可配置系统/个人模型与授权管理；普通用户可配置个人专属 API Key 或使用系统共享模型。

    GET  返回: { ai_configs: [...], has_global_key, can_manage }
    PUT  接收: { ai_configs: [{name, api_key, base_url, model, enabled}, ...] }
           也兼容旧版单字段: { ai_api_key, ai_base_url, ai_model }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        ai_configs = user.ai_configs or []
        # 若多配置为空但旧版单配置有值，自动迁移
        if not ai_configs and (user.ai_api_key or user.ai_base_url or user.ai_model):
            ai_configs = [{
                "name": "默认配置",
                "api_key": user.ai_api_key or "",
                "base_url": user.ai_base_url or "",
                "model": user.ai_model or "",
                "enabled": True,
            }]
        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "ai_configs": ai_configs,
                "ai_api_key": user.ai_api_key or "",
                "ai_base_url": user.ai_base_url or "",
                "ai_model": user.ai_model or "",
                "has_global_key": bool(settings.OPENAI_API_KEY) or User.objects.filter(is_staff=True, ai_configs__isnull=False).exclude(ai_configs=[]).exists() or User.objects.filter(is_staff=True, ai_api_key__isnull=False).exclude(ai_api_key="").exists(),
                "can_manage": user.is_staff,
            },
        })

    def put(self, request):
        user = request.user
        ai_configs_data = request.data.get("ai_configs")

        if ai_configs_data is not None:
            # 新版多配置保存
            if not isinstance(ai_configs_data, list):
                return Response(
                    {"code": 2001, "message": "ai_configs 必须是数组", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cleaned = []
            for cfg in ai_configs_data:
                if not isinstance(cfg, dict):
                    continue
                api_key = (cfg.get("api_key") or "").strip()
                if not api_key:
                    continue  # 跳过没有 key 的空配置
                cleaned.append({
                    "name": (cfg.get("name") or "未命名配置").strip()[:50],
                    "api_key": api_key,
                    "base_url": (cfg.get("base_url") or "").strip(),
                    "model": (cfg.get("model") or "").strip(),
                    "enabled": bool(cfg.get("enabled", True)),
                })
            user.ai_configs = cleaned
            # 同步第一个配置到旧版字段（向后兼容）
            if cleaned:
                user.ai_api_key = cleaned[0]["api_key"]
                user.ai_base_url = cleaned[0]["base_url"]
                user.ai_model = cleaned[0]["model"]
            else:
                user.ai_api_key = ""
                user.ai_base_url = ""
                user.ai_model = ""
            user.save(update_fields=["ai_configs", "ai_api_key", "ai_base_url", "ai_model"])
        else:
            # 旧版单配置兼容
            user.ai_api_key = request.data.get("ai_api_key", user.ai_api_key or "")
            user.ai_base_url = request.data.get("ai_base_url", user.ai_base_url or "")
            user.ai_model = request.data.get("ai_model", user.ai_model or "")
            user.save(update_fields=["ai_api_key", "ai_base_url", "ai_model"])

        return Response({
            "code": 0,
            "message": "AI 配置已保存",
            "data": {
                "ai_configs": user.ai_configs or [],
                "ai_api_key": user.ai_api_key or "",
                "ai_base_url": user.ai_base_url or "",
                "ai_model": user.ai_model or "",
                "has_global_key": bool(settings.OPENAI_API_KEY) or User.objects.filter(is_staff=True, ai_configs__isnull=False).exclude(ai_configs=[]).exists() or User.objects.filter(is_staff=True, ai_api_key__isnull=False).exclude(ai_api_key="").exists(),
                "can_manage": user.is_staff,
            },
        })


class AIAuthManageView(APIView):
    """管理员管理 AI 授权用户列表"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        """获取所有用户及其 AI 授权状态"""
        users = User.objects.all().values("id", "phone", "nickname", "is_staff", "ai_authorized").order_by("-date_joined")
        return Response({"code": 0, "message": "success", "data": list(users)})

    def post(self, request):
        """切换用户 AI 授权"""
        user_id = request.data.get("user_id")
        authorized = request.data.get("ai_authorized")
        if not user_id:
            return Response(
                {"code": 2001, "message": "缺少 user_id", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        target.ai_authorized = bool(authorized)
        target.save(update_fields=["ai_authorized"])
        return Response({"code": 0, "message": "已更新授权状态", "data": None})


class RegistrationManageView(APIView):
    """管理员管理注册模式和邀请链接"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        """获取注册模式和邀请链接列表"""
        setting = SystemSetting.get_settings()
        invites = InviteLink.objects.select_related("created_by").all()[:50]
        invite_data = [
            {
                "id": inv.id,
                "token": inv.token,
                "max_uses": inv.max_uses,
                "used_count": inv.used_count,
                "remaining_uses": inv.remaining_uses,
                "is_valid": inv.is_valid,
                "is_active": inv.is_active,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                "note": inv.note,
                "created_by": inv.created_by.nickname or inv.created_by.phone,
                "created_at": inv.created_at.isoformat(),
            }
            for inv in invites
        ]
        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "registration_mode": setting.registration_mode,
                "invites": invite_data,
            },
        })

    def post(self, request):
        """切换注册模式 或 创建邀请链接"""
        action = request.data.get("action", "")

        if action == "set_mode":
            mode = request.data.get("mode", "")
            if mode not in ("open", "invitation_only"):
                return Response(
                    {"code": 2001, "message": "无效的注册模式", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            setting = SystemSetting.get_settings()
            setting.registration_mode = mode
            setting.save(update_fields=["registration_mode"])
            return Response({
                "code": 0,
                "message": f"已切换为{'开放注册' if mode == 'open' else '邀请注册'}模式",
                "data": {"mode": mode},
            })

        if action == "create_invite":
            max_uses = int(request.data.get("max_uses", 1))
            expire_hours = request.data.get("expire_hours")
            note = request.data.get("note", "")

            expires_at = None
            if expire_hours:
                from datetime import timedelta
                import django.utils.timezone as tz
                expires_at = tz.now() + timedelta(hours=int(expire_hours))

            invite = InviteLink.objects.create(
                created_by=request.user,
                max_uses=max_uses,
                expires_at=expires_at,
                note=note,
            )
            return Response({
                "code": 0,
                "message": "邀请链接已生成",
                "data": {
                    "token": invite.token,
                    "register_url": f"/register?invite={invite.token}",
                    "max_uses": invite.max_uses,
                    "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
                },
            })

        if action == "deactivate_invite":
            invite_id = request.data.get("invite_id")
            invite = InviteLink.objects.filter(id=invite_id).first()
            if not invite:
                return Response(
                    {"code": 2002, "message": "邀请链接不存在", "data": None},
                    status=status.HTTP_404_NOT_FOUND,
                )
            invite.is_active = False
            invite.save(update_fields=["is_active"])
            return Response({"code": 0, "message": "已停用该邀请链接", "data": None})

        if action == "delete_invite":
            invite_id = request.data.get("invite_id")
            InviteLink.objects.filter(id=invite_id).delete()
            audit(request, "invite_delete", "删除邀请链接", "invite", invite_id, "邀请链接", f"管理员删除邀请链接 #{invite_id}")
            return Response({"code": 0, "message": "已删除该邀请链接", "data": None})

        if action == "batch_delete_invites":
            invite_ids = request.data.get("invite_ids", [])
            if not isinstance(invite_ids, list):
                return Response({"code": 2001, "message": "invite_ids 必须为数组", "data": None}, status=status.HTTP_400_BAD_REQUEST)
            deleted, _ = InviteLink.objects.filter(id__in=invite_ids).delete()
            audit(request, "invite_batch_delete", "批量删除邀请链接", "invite", ",".join(map(str, invite_ids)), f"批量删除 {deleted} 个邀请链接")
            return Response({"code": 0, "message": f"成功删除选中的 {deleted} 个邀请链接", "data": {"deleted": deleted}})

        if action == "clear_all_invites":
            cnt = InviteLink.objects.count()
            InviteLink.objects.all().delete()
            audit(request, "invite_clear_all", "一键清空邀请链接", "invite", "all", f"一键清空全部 {cnt} 个邀请链接")
            return Response({"code": 0, "message": f"已清空全部 {cnt} 个邀请链接", "data": {"cleared": cnt}})

        return Response(
            {"code": 2001, "message": "无效的操作", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_invite(request):
    """验证邀请链接是否有效（公开接口，注册页面未登录时调用）"""
    token = request.data.get("token", "")
    try:
        invite = InviteLink.objects.get(token=token)
    except InviteLink.DoesNotExist:
        return Response({"code": 0, "message": "success", "data": {"valid": False, "reason": "链接不存在"}})
    if not invite.is_valid:
        from django.utils import timezone as tz
        reason = "链接已过期" if invite.expires_at and invite.expires_at < tz.now() else "链接已用完或已停用"
        return Response({"code": 0, "message": "success", "data": {"valid": False, "reason": reason}})
    return Response({
        "code": 0,
        "message": "success",
        "data": {
            "valid": True,
            "remaining_uses": invite.remaining_uses,
            "max_uses": invite.max_uses,
            "used_count": invite.used_count,
        },
    })


class BabyViewSet(viewsets.ModelViewSet):
    serializer_class = BabyProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BabyProfile.objects.filter(user=self.request.user)

    def _sync_user_stage(self, user, baby):
        """将宝宝档案（未出生/已出生）同步至用户的孕育阶段"""
        from datetime import date
        today = date.today()
        is_born = getattr(baby, "is_born", True)
        if not is_born or baby.birthday > today:
            # 未出生宝宝 -> 同步为孕期模式
            user.is_pregnant = True
            user.due_date = baby.birthday
            user.baby_birthday = None
            user.save(update_fields=["is_pregnant", "due_date", "baby_birthday"])
        else:
            # 已出生宝宝 -> 同步为已出生模式
            user.is_pregnant = False
            user.baby_birthday = baby.birthday
            user.due_date = None
            user.save(update_fields=["is_pregnant", "due_date", "baby_birthday"])

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "baby_create", "您没有添加宝宝档案的权限")
        baby = serializer.save(user=self.request.user)
        total_babies = BabyProfile.objects.filter(user=self.request.user).count()
        if total_babies == 1 or baby.is_primary or self.request.data.get("sync_stage", True):
            BabyProfile.objects.filter(user=self.request.user).exclude(id=baby.id).update(is_primary=False)
            baby.is_primary = True
            baby.save(update_fields=["is_primary"])
            self._sync_user_stage(self.request.user, baby)
        b_name = getattr(baby, "name", "") or f"宝宝#{baby.id}"
        audit(self.request, "baby_create", "添加宝宝档案", "baby", baby.id, b_name, f"添加宝宝 {b_name}")

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "baby_update", "您没有修改宝宝档案的权限")
        baby = serializer.save()
        if baby.is_primary or BabyProfile.objects.filter(user=self.request.user).count() == 1:
            self._sync_user_stage(self.request.user, baby)
        b_name = getattr(baby, "name", "") or f"宝宝#{baby.id}"
        audit(self.request, "baby_update", "修改宝宝档案", "baby", baby.id, b_name, f"更新宝宝档案 {b_name}")

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "baby_delete", "您没有删除宝宝档案的权限")
        user = self.request.user
        was_primary = instance.is_primary
        b_name = getattr(instance, "name", "") or f"宝宝#{instance.id}"
        audit(self.request, "baby_delete", "删除宝宝档案", "baby", instance.id, b_name, f"删除宝宝档案 {b_name}")
        instance.delete()
        if was_primary:
            remaining = BabyProfile.objects.filter(user=user).order_by("-id").first()
            if remaining:
                remaining.is_primary = True
                remaining.save(update_fields=["is_primary"])
                self._sync_user_stage(user, remaining)

    @action(detail=True, methods=["post"])
    def set_primary(self, request, pk=None):
        baby = get_object_or_404(BabyProfile, pk=pk, user=request.user)
        BabyProfile.objects.filter(user=request.user).update(is_primary=False)
        baby.is_primary = True
        baby.save()
        self._sync_user_stage(request.user, baby)
        b_name = getattr(baby, "name", "") or f"宝宝#{baby.id}"
        audit(request, "baby_switch", "切换默认宝宝", "baby", baby.id, b_name, f"设为默认宝宝 {b_name}")
        return Response({"code": 0, "message": "已设为默认宝宝并同步孕育阶段", "data": None})

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        """路由别名兼容：同时支持 set_default 与 set_primary"""
        return self.set_primary(request, pk=pk)


# ============ 时间轴 ============

class TimelineViewSet(viewsets.ModelViewSet):
    serializer_class = TimelineSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TimelineEvent.objects.prefetch_related("products").all()
        stage = self.request.query_params.get("stage")
        category = self.request.query_params.get("category")
        essential = self.request.query_params.get("essential")
        if stage:
            # 支持模糊匹配：pregnancy → 所有孕期，baby → 0-1岁，toddler → 1-3岁，preschool → 3-6岁
            if stage == "pregnancy":
                qs = qs.filter(stage_type__startswith="pregnancy")
            elif stage == "baby":
                # 0-1岁：baby_age_day 全部 + baby_age_month 1-12月
                qs = qs.filter(
                    stage_type="baby_age_day"
                ) | qs.filter(
                    stage_type="baby_age_month", stage_value__lte=12
                )
            elif stage == "toddler":
                # 1-3岁：baby_age_month 13-36
                qs = qs.filter(
                    stage_type="baby_age_month", stage_value__gte=13, stage_value__lte=36
                )
            elif stage == "preschool":
                # 3-6岁：baby_age_month 37-72
                qs = qs.filter(
                    stage_type="baby_age_month", stage_value__gte=37, stage_value__lte=72
                )
            else:
                # 精确匹配：pregnancy_20w / baby_6m / baby_3d
                parts = stage.split("_")
                if len(parts) >= 2 and parts[1].rstrip("wdm").isdigit():
                    stage_value = int("".join([c for c in parts[1] if c.isdigit()]))
                    if parts[0] == "pregnancy":
                        qs = qs.filter(stage_type="pregnancy_week", stage_value=stage_value)
                    elif parts[0] == "baby":
                        suffix = parts[1][-1] if parts[1] else "d"
                        if suffix == "m":
                            qs = qs.filter(stage_type="baby_age_month", stage_value=stage_value)
                        else:
                            qs = qs.filter(stage_type="baby_age_day", stage_value=stage_value)
        if category:
            qs = qs.filter(category=category)
        if essential:
            qs = qs.filter(is_essential=True)
        return qs

    def get_permissions(self):
        """知识库写操作仅管理员"""
        if self.action in ("create", "update", "partial_update", "destroy", "export_csv", "import_csv", "import_template"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        """导出知识库 CSV（仅管理员）"""
        qs = TimelineEvent.objects.all().order_by("stage_type", "stage_value", "sort_order")
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="timeline_export.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "id", "stage_type", "stage_value", "category", "title", "subtitle",
            "content", "tips", "cover_image", "is_essential", "sort_order",
        ])
        for e in qs:
            writer.writerow([
                e.id, e.stage_type, e.stage_value, e.category, e.title,
                e.subtitle or "", e.content or "", e.tips or "", e.cover_image or "",
                "是" if e.is_essential else "否", e.sort_order,
            ])
        return response

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """下载知识库导入模板 CSV（仅管理员）"""
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="timeline_import_template.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "stage_type", "stage_value", "category", "title", "subtitle",
            "content", "tips", "cover_image", "is_essential", "sort_order",
        ])
        writer.writerow([
            "pregnancy_week", 10, "health", "孕10周：胎儿发育关键期",
            "神经系统快速发育", "本周宝宝……", "补充叶酸、均衡饮食",
            "", "是", 0,
        ])
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入知识库 CSV（仅管理员）"""
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"code": 2001, "message": "请上传 CSV 文件", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            text = file.read().decode("utf-8-sig")
        except Exception:
            try:
                text = file.read().decode("gbk")
            except Exception:
                return Response(
                    {"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        reader = csv.DictReader(io.StringIO(text))
        valid_stage_types = {c[0] for c in TimelineEvent.STAGE_TYPES}
        valid_categories = {c[0] for c in TimelineEvent.CATEGORY_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=False):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for idx, row in enumerate(reader, start=2):
            title = (row.get("title") or "").strip()
            stage_type = (row.get("stage_type") or "").strip()
            if not title or not stage_type:
                errors.append(f"第{idx}行：缺少 title 或 stage_type")
                continue
            if stage_type not in valid_stage_types:
                errors.append(f"第{idx}行：无效的阶段类型「{stage_type}」")
                continue
            try:
                stage_value = int(row.get("stage_value") or 0)
            except ValueError:
                errors.append(f"第{idx}行：stage_value 不是数字")
                continue
            category = (row.get("category") or "health").strip()
            if category not in valid_categories:
                errors.append(f"第{idx}行：无效的分类「{category}」")
                continue
            try:
                sort_order = int(row.get("sort_order") or 0)
            except ValueError:
                sort_order = 0
            TimelineEvent.objects.create(
                stage_type=stage_type,
                stage_value=stage_value,
                category=category,
                title=title,
                subtitle=(row.get("subtitle") or "").strip(),
                content=(row.get("content") or "").strip() or title,
                tips=(row.get("tips") or "").strip(),
                cover_image=(row.get("cover_image") or "").strip() or None,
                is_essential=_yn(row.get("is_essential")),
                sort_order=sort_order,
            )
            created += 1
        return Response({
            "code": 0,
            "message": f"导入完成：成功 {created} 条" + (f"，{len(errors)} 条失败" if errors else ""),
            "data": {"created": created, "errors": errors},
        })


# ============ 孕期食谱 ============

class RecipeViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Recipe.objects.all()
        period = self.request.query_params.get("period")
        period_month = self.request.query_params.get("period_month")
        nutrient = self.request.query_params.get("nutrient")
        search = self.request.query_params.get("search")
        if period:
            qs = qs.filter(period=period)
        if period_month:
            qs = qs.filter(period_month=period_month)
        if nutrient:
            qs = qs.filter(nutrient_tag__icontains=nutrient)
        if search:
            qs = qs.filter(title__icontains=search)
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def increment_view(self, request, pk=None):
        """增加浏览次数"""
        recipe = self.get_object()
        recipe.view_count += 1
        recipe.save(update_fields=["view_count"])
        return Response({"code": 0, "message": "ok", "data": {"view_count": recipe.view_count}})

    @action(detail=False, methods=["get"])
    def nutrients(self, request):
        """获取所有营养标签及对应食谱数"""
        from django.db.models import Count
        qs = Recipe.objects.exclude(nutrient_tag="").values("nutrient_tag").annotate(count=Count("id")).order_by("-count")
        return Response({"code": 0, "message": "ok", "data": list(qs)})


# ============ 幼儿百科 ============

class KidsEncyclopediaViewSet(viewsets.ModelViewSet):
    serializer_class = KidsEncyclopediaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = KidsEncyclopedia.objects.all()
        chapter = self.request.query_params.get("chapter")
        search = self.request.query_params.get("search")
        if chapter:
            qs = qs.filter(chapter=chapter)
        if search:
            qs = qs.filter(question__icontains=search)
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def increment_view(self, request, pk=None):
        """增加浏览次数"""
        item = self.get_object()
        item.view_count += 1
        item.save(update_fields=["view_count"])
        return Response({"code": 0, "message": "ok", "data": {"view_count": item.view_count}})

    @action(detail=False, methods=["get"])
    def chapters(self, request):
        """获取章节列表及问题数"""
        from django.db.models import Count
        qs = KidsEncyclopedia.objects.values("chapter").annotate(count=Count("id")).order_by("chapter")
        return Response({"code": 0, "message": "ok", "data": list(qs)})


# ============ 商品 ============

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # 管理员可以查看所有商品（含下架/暂存），普通用户只看上架商品
        if self.request.user.is_staff:
            qs = Product.objects.all()
        else:
            qs = Product.objects.filter(is_active=True)

        category = self.request.query_params.get("category")
        brand = self.request.query_params.get("brand")
        q = self.request.query_params.get("q")
        sort = self.request.query_params.get("sort")
        if category:
            qs = qs.filter(first_category=category)
        if brand:
            qs = qs.filter(brand=brand)
        if q:
            qs = qs.filter(name__icontains=q)
        if sort == "rating":
            qs = qs.order_by("-overall_rating")
        elif sort == "price_asc":
            qs = qs.order_by("price_info__avg")
        elif sort == "price_desc":
            qs = qs.order_by("-price_info__avg")
        else:
            qs = qs.order_by("-is_essential", "-overall_rating")
        return qs

    def get_permissions(self):
        """只有管理员可以创建/更新/删除商品"""
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "export_csv", "import_template"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        """重写 list，支持分页；传 no_page=1 时返回全量"""
        qs = self.filter_queryset(self.get_queryset())

        if request.query_params.get("no_page"):
            serializer = self.get_serializer(qs, many=True)
            return Response({"code": 0, "message": "success", "data": serializer.data})

        total = qs.count()
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 10))
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        start = (page - 1) * page_size
        end = start + page_size
        items = qs[start:end]
        serializer = self.get_serializer(items, many=True)

        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "items": serializer.data,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
            },
        })

    def retrieve(self, request, *args, **kwargs):
        """详情页：普通用户访问暂存商品返回 404"""
        product = self.get_object()
        if not request.user.is_staff and not product.is_active:
            return Response(
                {"code": 2002, "message": "商品不存在或已下架", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"code": 0, "message": "success", "data": ProductSerializer(product).data})

    def perform_create(self, serializer):
        product = serializer.save()
        audit(self.request, "product_create", "新增商品", "product", product.id, product.name, f"新增商品【{product.brand} {product.name}】")

    def perform_update(self, serializer):
        product = serializer.save()
        audit(self.request, "product_update", "编辑商品", "product", product.id, product.name, f"修改商品【{product.brand} {product.name}】")

    def perform_destroy(self, instance):
        audit(self.request, "product_delete", "删除商品", "product", instance.id, instance.name, f"删除商品【{instance.brand} {instance.name}】")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="ai-evaluate")
    def ai_evaluate(self, request, pk=None):
        """商品 AI 一键深度评测"""
        check_permission_or_403(request.user, "product_ai_evaluate", "管理员已关闭普通用户的 AI 一键评测功能")
        product = self.get_object()
        result = ai_service.ai_evaluate_product(product, user=request.user)
        audit(request, "ai_evaluate", "AI商品评测", "product", product.id, product.name, f"对商品【{product.brand} {product.name}】进行AI深度评测")
        return Response({"code": 0, "message": "success", "data": result})


    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        """导出商品 CSV（仅管理员）"""
        qs = Product.objects.all().order_by("id")
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="products_export.csv"'
        response.write("\ufeff")  # BOM 使 Excel 正确识别 UTF-8
        writer = csv.writer(response)
        writer.writerow([
            "id", "name", "brand", "model", "first_category", "second_category",
            "image_url", "description", "overall_rating", "price_avg", "price_range",
            "is_essential", "is_active", "has_ccc_certification", "safety_alert",
            "applicable_age_start", "applicable_age_end", "applicable_season",
        ])
        for p in qs:
            writer.writerow([
                p.id, p.name, p.brand, p.model or "", p.first_category, p.second_category,
                p.image_url, p.description or "", p.overall_rating,
                (p.price_info or {}).get("avg", ""), (p.price_info or {}).get("range", ""),
                "是" if p.is_essential else "否", "是" if p.is_active else "否",
                "是" if p.has_ccc_certification else "否", p.safety_alert or "",
                p.applicable_age_start or "", p.applicable_age_end or "", p.applicable_season or "",
            ])
        return response

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """下载商品导入模板 CSV（仅管理员）"""
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="products_import_template.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "name", "brand", "model", "first_category", "second_category",
            "image_url", "description", "overall", "price_avg", "price_range",
            "is_essential", "is_active", "has_ccc_certification", "safety_alert",
            "applicable_age_start", "applicable_age_end", "applicable_season",
        ])
        # 示例行
        writer.writerow([
            "婴儿连体衣", "英氏", "YSS-01", "clothing", "连体衣",
            "https://example.com/1.jpg", "纯棉A类，透气亲肤", 8.5, 129, "99-159",
            "是", "是", "是", "注意按需购买，避免囤货过多", 0, 6, "all",
        ])
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入商品 CSV（仅管理员）"""
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"code": 2001, "message": "请上传 CSV 文件", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            text = file.read().decode("utf-8-sig")
        except Exception:
            try:
                text = file.read().decode("gbk")
            except Exception:
                return Response(
                    {"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        reader = csv.DictReader(io.StringIO(text))
        valid_categories = {c[0] for c in Product.FIRST_CATEGORY_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=False):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for idx, row in enumerate(reader, start=2):
            name = (row.get("name") or "").strip()
            brand = (row.get("brand") or "").strip()
            if not name or not brand:
                errors.append(f"第{idx}行：缺少 name 或 brand")
                continue
            first_category = (row.get("first_category") or "").strip()
            if first_category not in valid_categories:
                errors.append(f"第{idx}行：无效的一级分类「{first_category}」")
                continue
            try:
                overall = float(row.get("overall") or 0)
            except ValueError:
                overall = 0
            try:
                price_avg = float(row.get("price_avg") or 0)
            except ValueError:
                price_avg = 0
            try:
                age_start = int(row.get("applicable_age_start")) if row.get("applicable_age_start") else None
            except ValueError:
                age_start = None
            try:
                age_end = int(row.get("applicable_age_end")) if row.get("applicable_age_end") else None
            except ValueError:
                age_end = None
            Product.objects.create(
                name=name,
                brand=brand,
                model=(row.get("model") or "").strip(),
                first_category=first_category,
                second_category=(row.get("second_category") or "默认").strip(),
                image_url=(row.get("image_url") or "").strip() or f"https://placehold.co/300x300/fef3c7/f97316?text={name[:4]}",
                description=(row.get("description") or "").strip(),
                overall_rating=overall,
                price_info={"avg": price_avg, "range": (row.get("price_range") or str(price_avg)).strip()},
                is_essential=_yn(row.get("is_essential")),
                is_active=_yn(row.get("is_active"), True),
                has_ccc_certification=_yn(row.get("has_ccc_certification")),
                safety_alert=(row.get("safety_alert") or "").strip(),
                applicable_age_start=age_start,
                applicable_age_end=age_end,
                applicable_season=(row.get("applicable_season") or "all").strip() or "all",
            )
            created += 1
        return Response({
            "code": 0,
            "message": f"导入完成：成功 {created} 条" + (f"，{len(errors)} 条失败" if errors else ""),
            "data": {"created": created, "errors": errors},
        })


# ============ 品牌 ============

class BrandViewSet(viewsets.ModelViewSet):
    serializer_class = BrandProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BrandProfile.objects.filter(is_active=True)


# ============ 待产包 ============

class ShoppingListViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShoppingList.objects.filter(user=self.request.user).prefetch_related("items", "items__product")

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "shopping_list_create", "您没有新建待产包清单的权限")
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "shopping_list_update", "您没有修改待产包清单的权限")
        serializer.save()

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "shopping_list_delete", "您没有删除待产包清单的权限")
        instance.delete()

    @action(detail=False, methods=["post"])
    def generate(self, request):
        check_permission_or_403(request.user, "shopping_list_create", "您没有生成待产包清单的权限")
        """智能生成待产包"""
        season = request.data.get("season", "all")
        delivery_method = request.data.get("delivery_method", "both")
        name = request.data.get("name", "我的待产包")
        result = ShoppingListGenerator.generate(season, delivery_method)

        shopping_list = ShoppingList.objects.create(
            user=request.user,
            name=name,
            list_type="hospital_bag",
            season=season,
            delivery_method=delivery_method,
        )
        for idx, item in enumerate(result["items"]):
            ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                custom_name=item["product_name"],
                quantity=item.get("quantity", 1),
                unit=item.get("unit", "件"),
                note=item.get("note", ""),
                sort_order=idx,
            )
        for idx, doc in enumerate(result["documents"]):
            ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                custom_name="【证件】" + doc["name"],
                quantity=1,
                unit="份",
                note=doc.get("note", ""),
                sort_order=100 + idx,
            )
        shopping_list.update_progress()
        return Response(
            {"code": 0, "message": "生成成功", "data": ShoppingListSerializer(shopping_list).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def toggle_check(self, request, pk=None):
        item_id = request.data.get("item_id")
        item = get_object_or_404(
            ShoppingListItem,
            pk=item_id,
            shopping_list_id=pk,
            shopping_list__user=request.user,
        )
        item.is_checked = not item.is_checked
        item.save()
        item.shopping_list.update_progress()
        return Response({"code": 0, "message": "已更新", "data": None})

    @action(detail=False, methods=["post"])
    def from_template(self, request):
        """将参考模板（Excel导入数据）引用为我的清单"""
        name = request.data.get("name", "我的待产包")
        owner = request.data.get("owner", "")  # 可选: mom/baby，限制归属
        categories = request.data.get("categories", [])  # 可选: 分类列表，限制分类
        item_ids = request.data.get("item_ids", [])  # 可选: 具体物品ID列表
        season = request.data.get("season", "all")
        delivery_method = request.data.get("delivery_method", "both")
        list_type = request.data.get("list_type", "hospital_bag")

        # 构建查询
        qs = BabyShoppingItem.objects.filter(is_active=True)
        if owner:
            qs = qs.filter(owner=owner)
        if categories:
            qs = qs.filter(category__in=categories)
        if item_ids:
            qs = qs.filter(id__in=item_ids)
        if not qs.exists():
            return Response(
                {"code": 1, "message": "未选择任何物品，请先勾选要引用的模板物品"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shopping_list = ShoppingList.objects.create(
            user=request.user,
            name=name,
            list_type=list_type,
            season=season,
            delivery_method=delivery_method,
            note="来自参考模板引用",
        )
        for idx, tpl in enumerate(qs.order_by("owner", "sort_order", "id")):
            ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                provider_item=tpl,
                custom_name=tpl.name,
                owner=tpl.owner,
                category=tpl.category,
                quantity=tpl.quantity,
                unit=tpl.unit,
                unit_price=tpl.unit_price,
                total_price=tpl.total_price,
                image_url=tpl.image_url,
                extra_image_url=tpl.extra_image_url,
                note=tpl.remark,
                sort_order=idx,
            )
        shopping_list.update_progress()
        return Response(
            {"code": 0, "message": "引用成功，已在“我的清单”中创建", "data": ShoppingListSerializer(shopping_list).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def adopt_ai(self, request):
        """将 AI 推荐结果采纳为我的清单"""
        name = request.data.get("name", "AI推荐待产包")
        season = request.data.get("season", "all")
        delivery_method = request.data.get("delivery_method", "both")
        categories = request.data.get("categories", [])  # [{category, owner, items:[{name,quantity,unit,remark,estimated_price}]}]

        if not categories:
            return Response(
                {"code": 1, "message": "没有可采纳的 AI 推荐内容"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shopping_list = ShoppingList.objects.create(
            user=request.user,
            name=name,
            list_type="hospital_bag",
            season=season,
            delivery_method=delivery_method,
            note="由 AI 推荐生成",
        )
        sort_idx = 0
        for cat in categories:
            owner = cat.get("owner", "mom")
            category = cat.get("category", "其他")
            for item in cat.get("items", []):
                ShoppingListItem.objects.create(
                    shopping_list=shopping_list,
                    custom_name=item.get("name", "未命名"),
                    owner=owner,
                    category=category,
                    quantity=str(item.get("quantity", 1)),
                    unit=item.get("unit", "件"),
                    note=item.get("remark", ""),
                    sort_order=sort_idx,
                )
                sort_idx += 1
        shopping_list.update_progress()
        return Response(
            {"code": 0, "message": "已采纳 AI 推荐，生成我的清单", "data": ShoppingListSerializer(shopping_list).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def update_item(self, request, pk=None):
        """更新清单中某个物品的字段（数量/单价/总价/购买状态/备注等）"""
        shopping_list = get_object_or_404(ShoppingList, pk=pk, user=request.user)
        item_id = request.data.get("item_id")
        item = get_object_or_404(ShoppingListItem, pk=item_id, shopping_list=shopping_list)
        # 允许更新的字段
        for field in ["custom_name", "quantity", "unit", "unit_price", "total_price", "purchase_status", "note", "category", "owner", "image_url"]:
            if field in request.data:
                setattr(item, field, request.data[field])
        item.save()
        return Response({"code": 0, "message": "已更新", "data": ShoppingListItemSerializer(item).data})


# ============ 待产包参考数据（妈妈篇/宝宝篇） ============

class BabyShoppingItemViewSet(viewsets.ModelViewSet):
    """待产包参考物品 — 所有用户可读，仅管理员可写"""
    serializer_class = BabyShoppingItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BabyShoppingItem.objects.filter(is_active=True).order_by("owner", "sort_order", "id")
        # 筛选参数
        owner = self.request.query_params.get("owner")
        if owner:
            qs = qs.filter(owner=owner)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        keyword = self.request.query_params.get("keyword")
        if keyword:
            qs = qs.filter(models.Q(name__icontains=keyword) | models.Q(remark__icontains=keyword))
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def list(self, request, *args, **kwargs):
        """重写 list，返回分页 + 统计信息"""
        qs = self.filter_queryset(self.get_queryset())
        total = qs.count()
        mom_count = qs.filter(owner="mom").count()
        baby_count = qs.filter(owner="baby").count()
        total_price_mom = sum(
            item.total_price or 0 for item in qs.filter(owner="mom")
        )
        total_price_baby = sum(
            item.total_price or 0 for item in qs.filter(owner="baby")
        )

        # 分页
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 10))
        start = (page - 1) * page_size
        end = start + page_size
        items = qs[start:end]
        serializer = self.get_serializer(items, many=True)

        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "items": serializer.data,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "stats": {
                    "mom_count": mom_count,
                    "baby_count": baby_count,
                    "total_price_mom": str(total_price_mom),
                    "total_price_baby": str(total_price_baby),
                    "total_price_all": str(total_price_mom + total_price_baby),
                },
            },
        })

    @action(detail=False, methods=["get"])
    def categories(self, request):
        """获取所有分类列表（按 owner 分组）"""
        qs = BabyShoppingItem.objects.filter(is_active=True)
        result = {}
        for owner_key, owner_label in BabyShoppingItem.OWNER_CHOICES:
            cats = qs.filter(owner=owner_key).values_list("category", flat=True).distinct().order_by("category")
            result[owner_key] = list(cats)
        return Response({"code": 0, "message": "success", "data": result})

    def _parse_ai_markdown(self, content):
        """AI 返回 Markdown 表格时，回退解析为结构化 categories 数据。
        支持形如：
          ### 一、妈妈衣物类（或 "妈妈衣物类"）
          | 物品名称 | 数量 | 单位 | 备注 | 预估价格 |
          |---|---|---|---|
          | 哺乳内衣 | 3-4 | 件 | ... | 80-150元 |
        返回 None 表示无法解析。
        """
        import json as json_lib
        lines = [l.strip() for l in (content or "").splitlines() if l.strip()]
        if not lines:
            return None

        summary_lines = []
        categories = []
        current_cat = None
        current_owner = "mom"
        header_map = {}
        seen_table = False
        header_used = False
        header_map_cur = {}

        for line in lines:
            # 跳过代码块围栏
            if line.startswith("```"):
                continue
            # 标题行 → 新分类
            if line.startswith("#") or re.match(r"^(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五)['、.．]", line):
                title = re.sub(r"^#+\s*", "", line).strip()
                title = re.sub(r"^(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五)['、.．]\s*", "", title)
                # 非物品分类的章节（总体建议/额外建议/注意事项等）不建立分类
                if any(k in title for k in ("总体", "额外", "注意", "小贴士", "提示", "补充", "说明")):
                    continue
                if "妈妈" in title or "产妇" in title or "成人" in title:
                    current_owner = "mom"
                elif "宝宝" in title or "婴儿" in title or "新生儿" in title or "幼儿" in title:
                    current_owner = "baby"
                else:
                    current_owner = "mom"
                if current_cat:
                    categories.append(current_cat)
                current_cat = {"category": title or "其他", "owner": current_owner, "items": []}
                header_used = False
                continue

            # 表头行：| 物品 | 数量 | 单位 | ... |
            if line.startswith("|") and not re.match(r"^\|[\s\-:|]+\|$", line):
                cells = [c.strip() for c in line.strip("|").split("|")]
                # 判断是否为表头：包含"物品/名称/数量/单位"等关键词
                if any(k in "".join(cells) for k in ("物品", "名称", "数量", "单位", "价格", "备注", "建议")):
                    header_map = {}
                    for i, cell in enumerate(cells):
                        lc = cell.lower()
                        if "物品" in lc or "名称" in lc or "商品" in lc:
                            header_map["name"] = i
                        elif "数量" in lc:
                            header_map["quantity"] = i
                        elif "单位" in lc:
                            header_map["unit"] = i
                        elif "价格" in lc or "费用" in lc or "预算" in lc:
                            header_map["price"] = i
                        elif "备注" in lc or "注意" in lc or "建议" in lc or "说明" in lc:
                            header_map["remark"] = i
                    if header_map:
                        header_used = True
                        header_map_cur = header_map
                    continue

                # 数据行
                if not header_used or not header_map_cur:
                    continue
                row = {}
                for key, idx in header_map_cur.items():
                    if idx < len(cells):
                        row[key] = cells[idx]
                name = row.get("name", "")
                if not name or name in ("物品名称", "名称", "-"):
                    continue
                if not current_cat:
                    current_cat = {"category": "其他", "owner": current_owner, "items": []}
                item = {
                    "name": name,
                    "quantity": row.get("quantity", "1"),
                    "unit": row.get("unit", "件"),
                    "remark": row.get("remark", ""),
                    "estimated_price": row.get("price", ""),
                }
                current_cat["items"].append(item)
                seen_table = True
                continue

            # 非表格普通文本
            if current_cat:
                # 分类名后到行分类前的说明行：加入 remark 或忽略
                continue
            if not seen_table:
                # 表格出现前的普通行：当作 summary/提示
                summary_lines.append(line)

        if current_cat:
            categories.append(current_cat)

        # 汇总最后的 summary
        if not categories and not seen_table:
            return None

        summary = " ".join(summary_lines)[:300] or ""
        tips_text = " ".join([l for l in lines if l.startswith(("提示", "建议", "小贴士", "额外"))])[:200] or ""

        return {
            "summary": summary,
            "categories": categories,
            "tips": tips_text,
            "raw_content": content,
        }

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated])
    def ai_recommend(self, request):
        """AI 联网分析推荐待产包"""
        import urllib.request
        import json as json_lib

        season = request.data.get("season", "")
        delivery = request.data.get("delivery_method", "")
        budget = request.data.get("budget", "")
        extra = request.data.get("extra", "")

        user = request.user
        api_key = user.ai_api_key or ""
        base_url = user.ai_base_url or ""
        ai_model = user.ai_model or ""

        if not api_key:
            # 尝试全局设置
            setting = SystemSetting.get_settings()
            api_key = setting.get("default_ai_api_key", "")
            base_url = setting.get("default_ai_base_url", "")
            ai_model = setting.get("default_ai_model", "")

        if not api_key:
            return Response(
                {"code": 1, "message": "尚未配置 AI API Key，请联系管理员在设置页配置"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        season_map = {"spring": "春季", "summer": "夏季", "autumn": "秋季", "winter": "冬季"}
        delivery_map = {"vaginal": "顺产", "cesarean": "剖腹产", "both": "通用"}

        prompt = f"""你是一位专业母婴顾问，请根据以下信息，联网搜索最新数据，为用户推荐一份待产包清单。

用户信息：
- 季节：{season_map.get(season, season)}
- 分娩方式：{delivery_map.get(delivery, delivery)}
- 预算：{budget or '不限'}
- 其他需求：{extra or '无'}

请严格按以下 JSON 格式返回（只输出 JSON，不要包含 markdown 代码块标记、不要加任何解释文字）：
{{
  "summary": "总体建议（2-3句话）",
  "categories": [
    {{
      "category": "类别名称（如：妈妈衣物类、宝宝护理类）",
      "owner": "mom 或 baby",
      "items": [
        {{
          "name": "物品名称",
          "quantity": "建议数量（数字或范围，如 3-4）",
          "unit": "单位（如 件/套/包）",
          "remark": "购买建议/注意事项",
          "estimated_price": "预估价格（如 50-100元/件）"
        }}
      ]
    }}
  ],
  "tips": "额外建议（1-2句话）"
}}"""

        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            payload = json_lib.dumps({
                "model": ai_model,
                "messages": [
                    {"role": "system", "content": "你是一位专业母婴顾问，请根据用户需求联网搜索最新数据，给出专业、实用的待产包建议。回复必须是纯 JSON 格式。"},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
            }).encode("utf-8")

            url = f"{base_url.rstrip('/')}/chat/completions"
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json_lib.loads(resp.read().decode("utf-8"))

            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")

            # 尝试解析 JSON
            content_stripped = content.strip()
            if content_stripped.startswith("```"):
                content_stripped = content_stripped.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = None
            try:
                parsed = json_lib.loads(content_stripped)
                if not isinstance(parsed, dict):
                    parsed = None
            except (json_lib.JSONDecodeError, ValueError):
                parsed = None

            # JSON 解析失败 → 尝试从 Markdown 表格中提取结构化数据
            if parsed is None:
                parsed = self._parse_ai_markdown(content)

            if parsed is None:
                parsed = {"raw_content": content}

            return Response({"code": 0, "message": "success", "data": parsed})

        except Exception as e:
            return Response(
                {"code": 1, "message": f"AI 分析失败：{str(e)}", "data": None},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ============ 对比 ============

class ProductCompareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_ids = request.data.get("product_ids", [])
        title = request.data.get("title", "")
        products = list(Product.objects.filter(id__in=product_ids, is_active=True))
        if len(products) < 2:
            return Response(
                {"code": 2001, "message": "至少选择2个产品进行对比", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comparison = ProductComparison.objects.create(
            user=request.user,
            title=title or "未命名对比",
            category=products[0].first_category,
        )
        comparison.products.set(products)
        comparison.save_snapshot()
        data = ProductComparator.compare(products)
        return Response({"code": 0, "message": "success", "data": {"comparison_id": comparison.id, **data}})


class CompareRadarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_ids = request.data.get("product_ids", [])
        products = list(Product.objects.filter(id__in=product_ids, is_active=True))
        if len(products) < 2:
            return Response(
                {"code": 2001, "message": "至少选择2个产品", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"code": 0, "message": "success", "data": ProductComparator.compare(products)["radar"]})


# ============ 健康 ============

class HealthRecordViewSet(viewsets.ModelViewSet):
    serializer_class = HealthRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HealthRecord.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "health_record_create", "您没有添加健康记录的权限")
        rec = serializer.save(user=self.request.user)
        audit(self.request, "health_record_create", "添加健康记录", "health", rec.id, rec.record_type, f"记录类型: {rec.record_type}")

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "health_record_update", "您没有修改健康记录的权限")
        rec = serializer.save()
        audit(self.request, "health_record_update", "修改健康记录", "health", rec.id, rec.record_type, f"修改记录 #{rec.id}")

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "health_record_delete", "您没有删除健康记录的权限")
        audit(self.request, "health_record_delete", "删除健康记录", "health", instance.id, instance.record_type, f"删除记录 #{instance.id}")
        instance.delete()


# ============ AI ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_chat(request):
    check_permission_or_403(request.user, "ai_chat", "管理员已关闭普通用户的 AI 问答功能")
    query_text = request.data.get("query", "").strip()
    if not query_text:
        return Response(
            {"code": 2001, "message": "请输入问题", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    session_id = request.data.get("session_id")
    stage = get_stage_info(request.user.due_date, request.user.baby_birthday)
    try:
        result = ai_service.ai_chat(query_text, stage_label=stage["label"], user=request.user)
    except Exception as e:
        local_ans = ai_service._local_question(query_text, stage["label"])
        result = {
            "query": query_text,
            "response": local_ans,
            "used_openai": False,
            "used_config_name": "",
            "used_search": False,
            "latency_ms": 300,
            "suggestions": ai_service._suggestions(stage["label"]),
            "error_hint": f"AI 服务异常，已自动降级本地知识库：{e}",
        }

    # 获取或创建会话
    session = None
    if session_id:
        session = ChatSession.objects.filter(id=session_id, user=request.user).first()
    if not session:
        title = query_text[:30] + ("…" if len(query_text) > 30 else "")
        session = ChatSession.objects.create(user=request.user, title=title)

    # 保存用户消息
    ChatMessage.objects.create(
        session=session,
        role="user",
        content=query_text,
    )
    # 保存 AI 消息
    ChatMessage.objects.create(
        session=session,
        role="ai",
        content=result["response"],
        used_config_name=result.get("used_config_name", ""),
        used_search=result.get("used_search", False),
        error_hint=result.get("error_hint", ""),
    )

    # 如果是新建会话且第一条消息，用问题更新标题
    if not session_id and session.messages.count() == 2:
        session.title = title
        session.save(update_fields=["title"])

    audit(request, "ai_chat", "AI助手问答", "chat_session", session.id, session.title, f"用户提问: {query_text[:50]}")
    # 兼容旧版 AIQueryLog
    AIQueryLog.objects.create(
        user=request.user,
        session_id=str(session.id),
        query_type="qa",
        query_text=query_text,
        response_text=result["response"],
        response_time_ms=result.get("latency_ms", 0),
    )

    result["session_id"] = session.id
    result["session_title"] = session.title
    return Response({"code": 0, "message": "success", "data": result})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_compare(request):
    product_ids = request.data.get("product_ids", [])
    query_text = request.data.get("query", "")
    products = list(Product.objects.filter(id__in=product_ids, is_active=True))
    if len(products) < 2:
        return Response(
            {"code": 2001, "message": "至少选择2个产品", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    stage = get_stage_info(request.user.due_date, request.user.baby_birthday)
    result = ai_service.ai_compare(query_text, products, stage_label=stage["label"], user=request.user)
    return Response({"code": 0, "message": "success", "data": result})


# ============ AI 会话管理 ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_sessions(request):
    """获取当前用户的会话列表（不含消息内容，仅摘要）"""
    sessions = ChatSession.objects.filter(user=request.user).order_by("-updated_at")[:100]
    data = []
    for s in sessions:
        msg_count = s.messages.count()
        last_msg = s.messages.order_by("-created_at").first()
        data.append({
            "id": s.id,
            "title": s.title,
            "message_count": msg_count,
            "last_message": last_msg.content[:80] if last_msg else "",
            "last_role": last_msg.role if last_msg else "",
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
        })
    return Response({"code": 0, "message": "success", "data": data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_session_detail(request, session_id):
    """获取某个会话的完整消息列表"""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    messages = session.messages.order_by("created_at")
    data = {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "used_config_name": m.used_config_name,
                "used_search": m.used_search,
                "error_hint": m.error_hint,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }
    return Response({"code": 0, "message": "success", "data": data})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def ai_session_rename(request, session_id):
    """重命名会话标题"""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    title = (request.data.get("title") or "").strip()
    if not title:
        return Response(
            {"code": 2001, "message": "标题不能为空", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    session.title = title[:100]
    session.save(update_fields=["title"])
    return Response({"code": 0, "message": "已更新", "data": {"id": session.id, "title": session.title}})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def ai_session_delete(request, session_id):
    """删除会话及其所有消息"""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    session.delete()
    return Response({"code": 0, "message": "已删除", "data": None})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_session_create(request):
    """创建新会话"""
    title = (request.data.get("title") or "新会话").strip()[:100]
    session = ChatSession.objects.create(user=request.user, title=title)
    return Response({"code": 0, "message": "success", "data": {"id": session.id, "title": session.title}})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_history(request):
    """旧版兼容：获取最近的 AI 问答记录"""
    logs = AIQueryLog.objects.filter(user=request.user)[:50]
    data = [
        {
            "id": log.id,
            "query": log.query_text,
            "response": log.response_text,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
    return Response({"code": 0, "message": "success", "data": data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_suggestions(request):
    stage = get_stage_info(request.user.due_date, request.user.baby_birthday)
    return Response({"code": 0, "message": "success", "data": ai_service._suggestions(stage["label"])})


# ============ 通知 ============

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        notification.is_read = True
        notification.save()
        return Response({"code": 0, "message": "已读", "data": None})

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"code": 0, "message": "已全部标记已读", "data": None})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({"code": 0, "message": "success", "data": {"count": count}})


# ============ 收藏 ============

class FavoriteViewSet(viewsets.ModelViewSet):
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = UserFavorite.objects.filter(user=self.request.user)
        fav_type = self.request.query_params.get("favorite_type")
        if fav_type:
            qs = qs.filter(favorite_type=fav_type)
        object_id = self.request.query_params.get("object_id")
        if object_id:
            qs = qs.filter(object_id=object_id)
        return qs

    def create(self, request, *args, **kwargs):
        check_permission_or_403(request.user, "product_favorite", "您没有添加收藏的权限")
        fav_type = request.data.get("favorite_type", "product")
        obj_id = request.data.get("object_id")
        existing = UserFavorite.objects.filter(
            user=request.user,
            favorite_type=fav_type,
            object_id=obj_id,
        ).first()
        if existing:
            serializer = self.get_serializer(existing)
            return Response({"code": 0, "message": "已在收藏夹中", "data": serializer.data}, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        fav = serializer.save(user=self.request.user)
        if fav.favorite_type == "product":
            Product.objects.filter(id=fav.object_id).update(fav_count=models.F("fav_count") + 1)
        audit(self.request, "favorite_add", "添加收藏", fav.favorite_type, fav.object_id, fav.note or "",
              f"收藏了 {fav.favorite_type} #{fav.object_id}")

    def destroy(self, request, *args, **kwargs):
        check_permission_or_403(request.user, "product_unfavorite", "您没有取消收藏的权限")
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({"code": 0, "message": "已取消收藏", "data": None}, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        if instance.favorite_type == "product":
            Product.objects.filter(id=instance.object_id, fav_count__gt=0).update(fav_count=models.F("fav_count") - 1)
        audit(self.request, "favorite_remove", "取消收藏", instance.favorite_type, instance.object_id, instance.note or "",
              f"取消收藏了 {instance.favorite_type} #{instance.object_id}")
        instance.delete()

    @action(detail=False, methods=["post"], url_path="toggle")
    def toggle(self, request):
        """切换收藏状态（传 favorite_type 和 object_id）"""
        fav_type = request.data.get("favorite_type", "product")
        obj_id = request.data.get("object_id")
        if not obj_id:
            return Response({"code": 2001, "message": "缺少 object_id", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        existing = UserFavorite.objects.filter(user=request.user, favorite_type=fav_type, object_id=obj_id).first()
        if existing:
            check_permission_or_403(request.user, "product_unfavorite", "您没有取消收藏的权限")
            fav_id = existing.id
            if existing.favorite_type == "product":
                Product.objects.filter(id=existing.object_id, fav_count__gt=0).update(fav_count=models.F("fav_count") - 1)
            audit(request, "favorite_remove", "取消收藏", existing.favorite_type, existing.object_id, existing.note or "",
                  f"取消收藏了 {existing.favorite_type} #{existing.object_id}")
            existing.delete()
            return Response({"code": 0, "message": "已取消收藏", "data": {"favorited": False, "object_id": obj_id, "id": fav_id}})
        else:
            check_permission_or_403(request.user, "product_favorite", "您没有添加收藏的权限")
            fav = UserFavorite.objects.create(
                user=request.user,
                favorite_type=fav_type,
                object_id=obj_id,
                note=request.data.get("note", ""),
            )
            if fav.favorite_type == "product":
                Product.objects.filter(id=fav.object_id).update(fav_count=models.F("fav_count") + 1)
            audit(request, "favorite_add", "添加收藏", fav.favorite_type, fav.object_id, fav.note or "",
                  f"收藏了 {fav.favorite_type} #{fav.object_id}")
            return Response({"code": 0, "message": "已添加到收藏夹", "data": {"favorited": True, "object_id": obj_id, "id": fav.id}})


# ============ 用户管理 ============

class AuditLogView(APIView):
    """管理员审计日志管理：查看 / 删除（单个、批量、全部）/ 设置保留期限"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    ACTION_LABELS = dict(AuditLog.ACTION_CHOICES)

    def get(self, request):
        """日志列表，支持筛选：action / keyword（账号或目标名）/ date（YYYY-MM-DD）"""
        qs = AuditLog.objects.all()
        action = request.query_params.get("action", "")
        keyword = request.query_params.get("keyword", "")
        date = request.query_params.get("date", "")
        if action:
            qs = qs.filter(action=action)
        if keyword:
            qs = qs.filter(
                models.Q(username__icontains=keyword)
                | models.Q(target_name__icontains=keyword)
                | models.Q(detail__icontains=keyword)
            )
        if date:
            qs = qs.filter(created_at__date=date)

        # 自动清理超过保留期限的日志
        setting = SystemSetting.get_settings()
        if setting.audit_retention_days > 0:
            from django.utils import timezone
            from datetime import timedelta
            cutoff = timezone.now() - timedelta(days=setting.audit_retention_days)
            qs.filter(created_at__lt=cutoff).delete()

        logs = qs[:500].values(
            "id", "username", "action", "action_label", "target_type",
            "target_id", "target_name", "detail", "ip", "created_at",
        )
        # 统计各操作类型数量（供筛选下拉框）
        stats = {k: v for k, v in AuditLog.objects.values_list("action").annotate(c=models.Count("id"))}
        from django.utils import timezone
        today_date = timezone.now().date()
        total_count = AuditLog.objects.count()
        today_count = AuditLog.objects.filter(created_at__date=today_date).count()
        auth_actions = ["login", "login_fail", "logout", "register", "change_password", "security_question", "forgot_password_attempt", "forgot_password_reset", "forgot_password_locked"]
        auth_count = AuditLog.objects.filter(action__in=auth_actions).count()
        overview = {
            "total": total_count,
            "today": today_count,
            "auth": auth_count,
            "business": max(0, total_count - auth_count),
        }
        return Response({"code": 0, "message": "success", "data": {
            "logs": list(logs),
            "stats": stats,
            "overview": overview,
            "action_labels": AuditLog.ACTION_CHOICES,
            "audit_retention_days": setting.audit_retention_days,
        }})

    def delete(self, request):
        """删除日志：?ids=1,2,3 或 ?all=1（全部）"""
        all_flag = request.query_params.get("all", "")
        if all_flag == "1":
            AuditLog.objects.all().delete()
            audit(request, "audit_delete", "清空全部审计日志", "系统", 0, "全部", "管理员清空全部审计日志")
            return Response({"code": 0, "message": "已清空全部审计日志", "data": None})
        ids = request.query_params.get("ids", "")
        if not ids:
            return Response(
                {"code": 2005, "message": "请指定要删除的日志ID", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        id_list = [x for x in ids.split(",") if x.isdigit()]
        deleted, _ = AuditLog.objects.filter(id__in=id_list).delete()
        audit(request, "audit_delete", "删除审计日志", "audit", ",".join(id_list),
              f"{deleted} 条", f"管理员删除 {deleted} 条审计日志")
        return Response({"code": 0, "message": f"已删除 {deleted} 条日志", "data": {"deleted": deleted}})

    def put(self, request):
        """设置审计日志保留期限（天，0=永久）"""
        days = request.data.get("audit_retention_days")
        try:
            days = int(days)
        except (TypeError, ValueError):
            return Response(
                {"code": 2006, "message": "保留期限必须是整数（天）", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if days < 0 or days > 3650:
            return Response(
                {"code": 2006, "message": "保留期限范围为 0-3650 天", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setting = SystemSetting.get_settings()
        setting.audit_retention_days = days
        setting.save(update_fields=["audit_retention_days"])
        audit(request, "audit_retention", "设置审计保留期限", "系统", 1, "全局",
              f"审计日志保留期限设置为 {days} 天（0=永久）")
        return Response({"code": 0, "message": "保留期限已更新", "data": {"audit_retention_days": days}})


class UserManageView(APIView):
    """管理员用户管理：获取用户列表 / 修改用户信息 / 重置密码 / 冻结解冻"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        users = list(User.objects.all().order_by("-date_joined").values(
            "id", "phone", "username", "nickname", "role", "is_staff",
            "is_active", "ai_authorized", "security_question",
            "security_answer", "login_fail_count", "security_fail_count",
            "locked_until", "created_at",
        ))
        # 管理员账号自愈保障：管理员始终 is_active = True
        for u in users:
            if u.get("is_staff") or u.get("username") == "admin" or u.get("phone") == "admin":
                if not u.get("is_active"):
                    u["is_active"] = True
                    User.objects.filter(id=u["id"]).update(is_active=True, locked_until=None)

        setting = SystemSetting.get_settings()
        return Response({"code": 0, "message": "success", "data": {
            "users": users,
            "security_config": {
                "login_captcha_threshold": setting.login_captcha_threshold,
                "login_freeze_threshold": setting.login_freeze_threshold,
                "login_lock_minutes": setting.login_lock_minutes,
                "login_lock_seconds": getattr(setting, "login_lock_seconds", (setting.login_lock_minutes or 5) * 60),
                "forgot_password_max_attempts": getattr(setting, "forgot_password_max_attempts", 5),
            },
        }})

    def put(self, request):
        """修改指定用户信息（nickname / role / is_staff / is_active）或安全风控配置"""
        user_id = request.data.get("user_id")
        # 安全风控阈值配置（不含 user_id）
        if user_id is None:
            setting = SystemSetting.get_settings()
            if "login_captcha_threshold" in request.data:
                setting.login_captcha_threshold = max(1, int(request.data.get("login_captcha_threshold", 3)))
            if "login_freeze_threshold" in request.data:
                setting.login_freeze_threshold = max(2, int(request.data.get("login_freeze_threshold", 10)))
            if "login_lock_seconds" in request.data:
                sec_val = max(1, int(request.data.get("login_lock_seconds", 300)))
                setting.login_lock_seconds = sec_val
                setting.login_lock_minutes = max(1, sec_val // 60)
            elif "login_lock_minutes" in request.data:
                min_val = max(0, int(request.data.get("login_lock_minutes", 5)))
                setting.login_lock_minutes = min_val
                setting.login_lock_seconds = max(1, min_val * 60)
            if "forgot_password_max_attempts" in request.data:
                setting.forgot_password_max_attempts = max(1, int(request.data.get("forgot_password_max_attempts", 5)))
            setting.save(update_fields=["login_captcha_threshold", "login_freeze_threshold", "login_lock_minutes", "login_lock_seconds", "forgot_password_max_attempts"])
            audit(request, "security_config", "修改安全风控配置", "系统", 1, "全局",
                  f"验证码阈值={setting.login_captcha_threshold}，冻结阈值={setting.login_freeze_threshold}，熔断等待={setting.login_lock_seconds}秒({setting.login_lock_minutes}分钟)，密保上限={setting.forgot_password_max_attempts}次")
            return Response({"code": 0, "message": "安全风控配置已更新", "data": {
                "login_captcha_threshold": setting.login_captcha_threshold,
                "login_freeze_threshold": setting.login_freeze_threshold,
                "login_lock_minutes": setting.login_lock_minutes,
                "login_lock_seconds": setting.login_lock_seconds,
                "forgot_password_max_attempts": setting.forgot_password_max_attempts,
            }})
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if "nickname" in request.data:
            target.nickname = request.data["nickname"]
        if "role" in request.data:
            target.role = request.data["role"]
        if "is_staff" in request.data:
            target.is_staff = bool(request.data["is_staff"])
        if "is_active" in request.data:
            if _is_admin(target):
                # 管理员账号永不冻结
                target.is_active = True
            else:
                target.is_active = bool(request.data["is_active"])
            if target.is_active:
                target.security_fail_count = 0
                target.login_fail_count = 0
                target.locked_until = None
        if request.data.get("reset_security_lock"):
            target.is_active = True
            target.security_fail_count = 0
            target.login_fail_count = 0
            target.locked_until = None
        if _is_admin(target):
            target.is_active = True
        target.save()
        # 审计操作类型：冻结/解冻 或 信息编辑
        if "is_active" in request.data and not _is_admin(target):
            audit(request,
                  "user_freeze" if not target.is_active else "user_unfreeze",
                  "冻结账号" if not target.is_active else "解冻账号",
                  "用户", target.id, target.nickname or target.username,
                  f"{'冻结' if not target.is_active else '解冻'}用户 {target.username}")
        else:
            audit(request, "user_update", "编辑用户", "用户", target.id,
                  target.nickname or target.username,
                  f"修改用户 {target.username}：昵称/角色/状态等")
        return Response({"code": 0, "message": "已更新用户信息", "data": {
            "id": target.id, "phone": target.phone, "username": target.username,
            "nickname": target.nickname, "role": target.role,
            "is_staff": target.is_staff, "is_active": target.is_active,
        }})

    def post(self, request):
        """重置指定用户密码"""
        user_id = request.data.get("user_id")
        new_password = request.data.get("new_password", "")
        if len(new_password) < 6:
            return Response(
                {"code": 2001, "message": "密码至少6位", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        target.set_password(new_password)
        target.is_active = True
        target.security_fail_count = 0
        target.login_fail_count = 0
        target.locked_until = None
        target.save()
        audit(request, "user_reset_password", "管理员重置密码", "用户", target.id,
              target.nickname or target.username, f"管理员重置用户 {target.username} 的密码")
        return Response({"code": 0, "message": "密码已重置", "data": None})

    def delete(self, request):
        """管理员删除指定用户"""
        user_id = request.query_params.get("user_id")
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.id == request.user.id:
            return Response(
                {"code": 2003, "message": "不能删除自己", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        audit(request, "user_delete", "删除用户", "用户", target.id,
              target.nickname or target.username, f"管理员删除用户 {target.username}（{target.phone}）")
        target.delete()
        return Response({"code": 0, "message": "用户已删除", "data": None})

    def patch(self, request):
        """管理员修改指定用户的密保"""
        user_id = request.data.get("user_id")
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if "security_question" in request.data:
            target.security_question = request.data["security_question"]
        if "security_answer" in request.data:
            target.security_answer = request.data["security_answer"]
        target.save(update_fields=["security_question", "security_answer"])
        q_label = dict(User.SECURITY_Q_CHOICES).get(target.security_question, "")
        audit(request, "user_security", "修改用户密保", "用户", target.id,
              target.nickname or target.username, f"管理员修改用户 {target.username} 的密保")
        return Response({"code": 0, "message": "密保已更新", "data": {
            "security_question": q_label,
            "has_answer": bool(target.security_answer),
        }})


class ChangePasswordView(APIView):
    """用户修改自己的密码"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")
        if not request.user.check_password(old_password):
            return Response(
                {"code": 1003, "message": "原密码不正确", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 6:
            return Response(
                {"code": 2001, "message": "新密码至少6位", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(new_password)
        request.user.save()
        audit(request, "change_password", "修改密码", "用户", request.user.username,
              request.user.nickname or request.user.username, "用户自助修改密码")
        return Response({"code": 0, "message": "密码修改成功", "data": None})


class SecurityQuestionView(APIView):
    """用户密保管理"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({"code": 0, "message": "success", "data": {
            "security_question": user.security_question,
            "has_answer": bool(user.security_answer),
        }})

    def put(self, request):
        user = request.user
        q = request.data.get("security_question", "")
        a = request.data.get("security_answer", "")
        if q and q not in [k for k, _ in User.SECURITY_Q_CHOICES]:
            return Response(
                {"code": 2001, "message": "无效的密保问题", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.security_question = q
        user.security_answer = a
        user.save(update_fields=["security_question", "security_answer"])
        audit(request, "security_question", "设置密保", "用户", user.username,
              user.nickname or user.username, f"密保问题：{dict(User.SECURITY_Q_CHOICES).get(q, q)}")
        return Response({"code": 0, "message": "密保已设置", "data": None})


class ForgotPasswordView(APIView):
    """通过密保找回密码（免登录接口，支持手机号或用户名查询）"""
    permission_classes = [AllowAny]

    def get(self, request):
        """输入账号（手机号或用户名），获取密保问题与剩余尝试次数"""
        account = request.query_params.get("phone", "")
        user = _find_user_by_account(account)
        if not user:
            return Response(
                {"code": 2002, "message": "该账号未注册", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.security_question:
            return Response(
                {"code": 2003, "message": "该用户未设置密保问题，请联系管理员重置", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sec = _security_setting()
        max_att = sec["forgot_password_max_attempts"]

        if _is_admin(user) and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        # 检查是否处于强制等待中
        from django.utils import timezone
        now = timezone.now()
        if user.locked_until:
            if now < user.locked_until:
                wait_secs = int((user.locked_until - now).total_seconds())
                if _is_admin(user):
                    return Response(
                        {
                            "code": 1012,
                            "message": f"管理员密保错误次数超限，已触发安全风控，请强制等待 {wait_secs} 秒后输入图形验证码重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": False,
                                "wait_seconds": wait_secs,
                                "need_captcha": True,
                                "remaining_attempts": 0,
                                "max_attempts": max_att,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return Response(
                        {
                            "code": 1012,
                            "message": f"账号处于安全锁定期，请等待 {wait_secs} 秒后重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": not user.is_active,
                                "wait_seconds": wait_secs,
                                "remaining_attempts": 0,
                                "max_attempts": max_att,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                user.locked_until = None
                if _is_admin(user):
                    user.is_active = True
                    user.security_fail_count = 0  # 等待期结束允许重新尝试
                user.save(update_fields=["locked_until", "is_active", "security_fail_count"])

        fail_count = user.security_fail_count or 0
        remaining = max(0, max_att - fail_count)

        if not _is_admin(user):
            is_locked = fail_count >= max_att or not user.is_active
            if is_locked:
                audit(request, "forgot_password_locked", "找回密码超限锁定", "user", user.id, user.phone,
                      f"尝试次数已达上限（{max_att}次）或账号已冻结，限制找回密码", user=user)
                return Response(
                    {
                        "code": 1012,
                        "message": f"密保尝试次数已达上限（{max_att}次），该账号已冻结，限制找回密码，请联系管理员解冻",
                        "data": {"is_locked": True, "is_frozen": True, "remaining_attempts": 0, "max_attempts": max_att},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        need_captcha = bool(
            (fail_count >= sec["captcha_threshold"])
            or (user.locked_until is not None)
            or (_is_admin(user) and fail_count >= max_att)
        )
        q_label = dict(User.SECURITY_Q_CHOICES).get(user.security_question, "")
        return Response({"code": 0, "message": "success", "data": {
            "security_question": q_label,
            "max_attempts": max_att,
            "remaining_attempts": remaining,
            "is_locked": False,
            "need_captcha": need_captcha,
        }})

    def post(self, request):
        """验证密保答案（带剩余次数扣减与超限风控）"""
        account = request.data.get("phone", "")
        answer = (request.data.get("security_answer") or "").strip()
        captcha = (request.data.get("captcha") or "").strip()
        user = _find_user_by_account(account)
        if not user:
            return Response(
                {"code": 2002, "message": "该账号未注册", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.security_answer:
            return Response(
                {"code": 2003, "message": "该用户未设置密保，请联系管理员重置", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sec = _security_setting()
        max_att = sec["forgot_password_max_attempts"]

        if _is_admin(user) and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        # 检查强制等待锁定
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        if user.locked_until:
            if now < user.locked_until:
                wait_secs = int((user.locked_until - now).total_seconds())
                if _is_admin(user):
                    return Response(
                        {
                            "code": 1012,
                            "message": f"管理员密保错误过多，已触发安全风控，请强制等待 {wait_secs} 秒后输入图形验证码重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": False,
                                "wait_seconds": wait_secs,
                                "need_captcha": True,
                                "remaining_attempts": 0,
                                "max_attempts": max_att,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return Response(
                        {
                            "code": 1012,
                            "message": f"账号处于安全锁定期，请等待 {wait_secs} 秒后重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": not user.is_active,
                                "wait_seconds": wait_secs,
                                "remaining_attempts": 0,
                                "max_attempts": max_att,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                user.locked_until = None
                if _is_admin(user):
                    user.is_active = True
                    user.security_fail_count = 0
                user.save(update_fields=["locked_until", "is_active", "security_fail_count"])

        # 普通用户冻结拦截
        if not _is_admin(user) and (not user.is_active or (user.security_fail_count or 0) >= max_att):
            audit(request, "forgot_password_locked", "找回密码超限锁定", "user", user.id, user.phone,
                  f"尝试次数已达上限（{max_att}次），该账号已冻结，限制找回密码", user=user)
            return Response(
                {
                    "code": 1012,
                    "message": f"密保尝试次数已达上限（{max_att}次），该账号已冻结，限制找回密码，请联系管理员解冻",
                    "data": {"is_locked": True, "is_frozen": True, "remaining_attempts": 0, "max_attempts": max_att},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 校验验证码（若达到验证码阈值或管理员曾输错）
        need_captcha = bool(
            (user.security_fail_count or 0) >= sec["captcha_threshold"]
            or (user.locked_until is not None)
            or (_is_admin(user) and (user.security_fail_count or 0) >= max_att)
        )
        if need_captcha:
            expected = ""
            if hasattr(request, "session"):
                expected = request.session.get("login_captcha", "")
            if not captcha or captcha.lower() != str(expected).lower():
                return Response(
                    {
                        "code": 1011,
                        "message": "验证码不正确，请重新输入",
                        "data": {
                            "need_captcha": True,
                            "fail_count": user.security_fail_count or 0,
                            "remaining_attempts": max(0, max_att - (user.security_fail_count or 0)),
                            "max_attempts": max_att,
                            "threshold": sec["captcha_threshold"],
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if user.security_answer != answer:
            fail_count = (user.security_fail_count or 0) + 1
            user.security_fail_count = fail_count
            remaining = max(0, max_att - fail_count)

            if remaining == 0:
                if _is_admin(user):
                    # 管理员绝对不能冻结！增加强制等待与验证码要求（秒级控制）
                    lock_sec = max(1, sec["lock_seconds"])
                    user.is_active = True
                    user.locked_until = now + timedelta(seconds=lock_sec)
                    user.save(update_fields=["security_fail_count", "is_active", "locked_until"])
                    wait_secs = lock_sec
                    audit(request, "forgot_password_locked", "管理员密保验证错误超限强制等待", "user", user.id, user.phone,
                          f"连续输入错误密保达到上限（{max_att}次），已触发强制等待 {lock_sec} 秒与验证码要求，未冻结账号", user=user)
                    return Response(
                        {
                            "code": 1012,
                            "message": f"密保答案不正确，管理员尝试次数已达上限（{max_att}次），已触发安全风控，请强制等待 {wait_secs} 秒后输入图形验证码重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": False,
                                "wait_seconds": wait_secs,
                                "need_captcha": True,
                                "remaining_attempts": 0,
                                "max_attempts": max_att,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    # 普通用户冻结账号
                    user.is_active = False
                    user.save(update_fields=["security_fail_count", "is_active"])
                    audit(request, "forgot_password_locked", "密保验证超限锁定", "user", user.id, user.phone,
                          f"连续输入错误密保达到系统限制（{max_att}次），账号已冻结锁定", user=user)
                    return Response(
                        {
                            "code": 1012,
                            "message": f"密保答案不正确，已达最大尝试次数（{max_att}次），该账号已被冻结锁定，请联系管理员解冻",
                            "data": {"is_locked": True, "is_frozen": True, "remaining_attempts": 0, "max_attempts": max_att},
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            user.save(update_fields=["security_fail_count"])
            audit(request, "forgot_password_attempt", "密保回答错误", "user", user.id, user.phone,
                  f"密保回答错误，累计失败{fail_count}次，剩余{remaining}次", user=user)

            if fail_count >= sec["captcha_threshold"]:
                return Response(
                    {
                        "code": 1010,
                        "message": f"密保答案不正确（剩余 {remaining} 次机会），请输入图形验证码后重试",
                        "data": {
                            "need_captcha": True,
                            "fail_count": fail_count,
                            "remaining_attempts": remaining,
                            "max_attempts": max_att,
                            "threshold": sec["captcha_threshold"],
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {
                    "code": 1004,
                    "message": f"密保答案不正确，还剩 {remaining} 次尝试机会",
                    "data": {"is_locked": False, "remaining_attempts": remaining, "max_attempts": max_att},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 答案正确，清除密保错误计数与锁状态
        user.security_fail_count = 0
        user.locked_until = None
        user.is_active = True
        user.save(update_fields=["security_fail_count", "locked_until", "is_active"])
        return Response({"code": 0, "message": "密保验证通过", "data": {"verified": True}})

    def put(self, request):
        """验证密保答案并重置密码（带管理员风控与验证码校验）"""
        account = request.data.get("phone", "")
        answer = (request.data.get("security_answer") or "").strip()
        new_password = request.data.get("new_password", "")
        captcha = (request.data.get("captcha") or "").strip()
        user = _find_user_by_account(account)
        if not user:
            return Response(
                {"code": 2002, "message": "该账号未注册", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.security_answer:
            return Response(
                {"code": 2003, "message": "该用户未设置密保，请联系管理员重置", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sec = _security_setting()
        max_att = sec["forgot_password_max_attempts"]

        if _is_admin(user) and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        # 检查强制等待锁定
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        if user.locked_until:
            if now < user.locked_until:
                wait_secs = int((user.locked_until - now).total_seconds())
                if _is_admin(user):
                    return Response(
                        {
                            "code": 1012,
                            "message": f"管理员密保错误过多，已触发安全风控，请强制等待 {wait_secs} 秒后输入图形验证码重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": False,
                                "wait_seconds": wait_secs,
                                "need_captcha": True,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return Response(
                        {
                            "code": 1012,
                            "message": f"账号处于安全锁定期，请等待 {wait_secs} 秒后重试",
                            "data": {"is_locked": True, "is_frozen": not user.is_active, "wait_seconds": wait_secs},
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                user.locked_until = None
                if _is_admin(user):
                    user.is_active = True
                    user.security_fail_count = 0
                user.save(update_fields=["locked_until", "is_active", "security_fail_count"])

        if not _is_admin(user) and (not user.is_active or (user.security_fail_count or 0) >= max_att):
            return Response(
                {
                    "code": 1012,
                    "message": f"密保尝试次数已达上限（{max_att}次），该账号已冻结，无法重置密码，请联系管理员解冻",
                    "data": {"is_locked": True, "is_frozen": True},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 校验验证码
        need_captcha = bool(
            (user.security_fail_count or 0) >= sec["captcha_threshold"]
            or (user.locked_until is not None)
            or (_is_admin(user) and (user.security_fail_count or 0) >= max_att)
        )
        if need_captcha:
            expected = ""
            if hasattr(request, "session"):
                expected = request.session.get("login_captcha", "")
            if not captcha or captcha.lower() != str(expected).lower():
                return Response(
                    {
                        "code": 1011,
                        "message": "验证码不正确，请重新输入",
                        "data": {"need_captcha": True, "fail_count": user.security_fail_count or 0, "threshold": sec["captcha_threshold"]},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if user.security_answer != answer:
            fail_count = (user.security_fail_count or 0) + 1
            user.security_fail_count = fail_count
            remaining = max(0, max_att - fail_count)
            if remaining == 0:
                if _is_admin(user):
                    lock_sec = max(1, sec["lock_seconds"])
                    user.is_active = True
                    user.locked_until = now + timedelta(seconds=lock_sec)
                    user.save(update_fields=["security_fail_count", "is_active", "locked_until"])
                    wait_secs = lock_sec
                    audit(request, "forgot_password_locked", "管理员密保验证错误超限强制等待", "user", user.id, user.phone,
                          f"连续输入错误密保达到上限（{max_att}次），已触发强制等待 {lock_sec} 秒与验证码要求，未冻结账号", user=user)
                    return Response(
                        {
                            "code": 1012,
                            "message": f"密保答案不正确，管理员尝试次数已达上限（{max_att}次），已触发安全风控，请强制等待 {wait_secs} 秒后输入图形验证码重试",
                            "data": {
                                "is_locked": True,
                                "is_frozen": False,
                                "wait_seconds": wait_secs,
                                "need_captcha": True,
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    user.is_active = False
                    user.save(update_fields=["security_fail_count", "is_active"])
                    audit(request, "forgot_password_locked", "重置密码超限锁定", "user", user.id, user.phone,
                          f"密保答案不正确且达到最大限制（{max_att}次），账号已冻结锁定", user=user)
                    return Response(
                        {"code": 1012, "message": f"密保答案不正确，已达上限（{max_att}次），该账号已被冻结锁定，请联系管理员解冻", "data": {"is_locked": True, "is_frozen": True}},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            user.save(update_fields=["security_fail_count"])
            return Response(
                {"code": 1004, "message": f"密保答案不正确，还剩 {remaining} 次机会", "data": {"remaining_attempts": remaining}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 6:
            return Response(
                {"code": 2001, "message": "密码至少6位", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.is_active = True
        user.security_fail_count = 0
        user.login_fail_count = 0
        user.locked_until = None
        user.save()
        if hasattr(request, "session"):
            request.session.pop("login_captcha", None)
        audit(request, "forgot_password_reset", "密保找回重置密码", "user", user.id, user.phone, "通过密保成功重置登录密码", user=user)
        return Response({"code": 0, "message": "密码重置成功，请使用新密码登录", "data": None})


class UserDeleteView(APIView):
    """管理员删除用户 / 用户注销自己"""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        """用户注销自己的账号（管理员账号不可自助注销）"""
        user = request.user
        if user.is_staff:
            return Response(
                {"code": 2004, "message": "管理员账号不可自助注销，请通过其他管理员操作", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        RefreshToken.for_user(user)  # 使 token 失效
        audit(request, "delete_account", "注销账号", "用户", user.username,
              user.nickname or user.username, f"用户自助注销账号 {user.username}")
        user.delete()
        return Response({"code": 0, "message": "账号已注销", "data": None})


# ============ 胎教故事 ============

class FetalStoryViewSet(viewsets.ModelViewSet):
    """胎教故事 ViewSet —— 按孕周天序展示，支持中英双语"""
    queryset = FetalStory.objects.all()
    serializer_class = FetalStorySerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def list(self, request, *args, **kwargs):
        """列表：支持按 week_start / narrator 筛选"""
        week = request.query_params.get("week")
        narrator = request.query_params.get("narrator")
        qs = self.get_queryset()
        if week:
            qs = qs.filter(week_start=int(week))
        if narrator:
            qs = qs.filter(narrator=narrator)
        qs = qs.order_by("week_start", "day_offset", "day_index")
        serializer = self.get_serializer(qs, many=True)
        return Response({"code": 0, "message": "success", "data": serializer.data})

    @action(detail=False, methods=["get"])
    def weeks(self, request):
        """获取所有有故事的孕周列表"""
        weeks = (
            self.get_queryset()
            .values_list("week_start", flat=True)
            .distinct()
            .order_by("week_start")
        )
        return Response({"code": 0, "message": "success", "data": list(weeks)})

    @action(detail=True, methods=["post"])
    def increment_view(self, request, pk=None):
        """增加阅读次数"""
        story = self.get_object()
        story.view_count += 1
        story.save(update_fields=["view_count"])
        return Response({"code": 0, "message": "success", "data": {"view_count": story.view_count}})

class AIConfigTestView(APIView):
    """测试 AI API 配置连接可用性（一键测试）"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        api_key = (request.data.get("api_key") or "").strip()
        base_url = (request.data.get("base_url") or "").strip()
        model = (request.data.get("model") or "").strip()

        if not api_key:
            return Response(
                {"code": 2001, "message": "API Key 不能为空", "data": {"status": "failed", "error": "API Key 不能为空"}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        import time
        start = time.time()
        used_model = ai_service._infer_model(model, base_url)
        try:
            client = ai_service._client(api_key=api_key, base_url=base_url, timeout=10.0)
            if client is None:
                return Response(
                    {"code": 2001, "message": "客户端初始化失败或未安装 OpenAI SDK", "data": {"status": "failed", "error": "客户端初始化失败"}},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            resp = client.chat.completions.create(
                model=used_model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=10,
            )
            latency_ms = max(1, int((time.time() - start) * 1000))
            reply = resp.choices[0].message.content if resp.choices else ""
            audit(request, "ai_config_test", "测试AI配置连接", "ai_config", 0, model or used_model,
                  f"测试连接成功，模型={used_model}，耗时={latency_ms}ms")
            return Response({
                "code": 0,
                "message": f"连接成功 (响应耗时 {latency_ms}ms)",
                "data": {"status": "success", "latency_ms": latency_ms, "model": used_model, "reply": reply},
            })
        except Exception as e:
            latency_ms = max(1, int((time.time() - start) * 1000))
            err_str = str(e)
            err_lower = err_str.lower()
            if "401" in err_str or "unauthorized" in err_lower or "authentication" in err_lower:
                user_msg = "API Key 无效或未授权 (401)"
            elif "404" in err_str or "not found" in err_lower:
                user_msg = f"模型 '{used_model}' 不存在或 Base URL 路径错误 (404)"
            elif "connection" in err_lower or "connect" in err_lower or "timeout" in err_lower or "timed out" in err_lower:
                user_msg = "网络连接失败或请求超时，请检查 Base URL 是否可访问"
            elif "429" in err_str or "rate limit" in err_lower or "quota" in err_lower:
                user_msg = "API 调用频率超限或账户余额不足 (429)"
            else:
                user_msg = f"连接测试失败: {err_str[:120]}"

            audit(request, "ai_config_test", "测试AI配置连接", "ai_config", 0, model or used_model,
                  f"测试连接失败: {user_msg}")
            return Response(
                {"code": 2002, "message": user_msg, "data": {"status": "failed", "error": err_str, "latency_ms": latency_ms}},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ============ 普通用户权限管控 API ============

class UserPermissionsView(APIView):
    """获取当前用户生效的功能与菜单权限"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        perms = get_user_permissions(request.user)
        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "permissions": perms,
                "is_staff": request.user.is_staff,
                "user_id": request.user.id,
            },
        })


class AdminPermissionsView(APIView):
    """管理员管理普通用户菜单与功能权限矩阵（支持针对具体用户配置以及全局默认模板）"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        user_id = request.query_params.get("user_id")
        if user_id:
            try:
                target = User.objects.get(id=int(user_id))
            except (User.DoesNotExist, ValueError):
                return Response(
                    {"code": 2002, "message": "用户不存在", "data": None},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if target.is_staff or target.is_superuser:
                admin_perms = {k: True for k in DEFAULT_USER_PERMISSIONS}
                return Response({
                    "code": 0,
                    "message": "success",
                    "data": {
                        "user_id": target.id,
                        "username": target.username,
                        "nickname": target.nickname,
                        "is_staff": True,
                        "has_custom": False,
                        "custom_permissions": {},
                        "effective_permissions": admin_perms,
                        "definitions": PERMISSION_DEFINITIONS,
                    },
                })

            custom = target.custom_permissions or {}
            effective = get_user_permissions(target)
            return Response({
                "code": 0,
                "message": "success",
                "data": {
                    "user_id": target.id,
                    "username": target.username,
                    "nickname": target.nickname,
                    "is_staff": False,
                    "has_custom": bool(custom),
                    "custom_permissions": custom,
                    "effective_permissions": effective,
                    "definitions": PERMISSION_DEFINITIONS,
                },
            })

        # 未传 user_id：获取系统全局默认权限模板
        setting = SystemSetting.get_settings()
        sys_perms = getattr(setting, "default_user_permissions", {}) or {}
        merged = dict(DEFAULT_USER_PERMISSIONS)
        if isinstance(sys_perms, dict):
            for k, v in sys_perms.items():
                if k in merged:
                    merged[k] = bool(v)

        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "definitions": PERMISSION_DEFINITIONS,
                "default_permissions": merged,
            },
        })

    def put(self, request):
        user_id = request.data.get("user_id")

        # 1. 针对具体指定用户的个性化权限配置
        if user_id is not None:
            try:
                target = User.objects.get(id=int(user_id))
            except (User.DoesNotExist, ValueError):
                return Response(
                    {"code": 2002, "message": "用户不存在", "data": None},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if target.is_staff or target.is_superuser:
                return Response(
                    {"code": 2003, "message": "系统管理员默认具备所有最高权限，菜单与功能权限不可禁用", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 重置该用户的权限为系统默认
            if request.data.get("reset_to_default"):
                target.custom_permissions = {}
                target.save(update_fields=["custom_permissions"])
                audit(request, "permission_update", "重置用户权限为默认", "用户", target.id,
                      target.nickname or target.username,
                      f"已清除用户 {target.username} 的个性化权限覆盖，恢复为系统默认配置")
                return Response({
                    "code": 0,
                    "message": f"已将用户 {target.username} 的权限重置为系统默认配置",
                    "data": {
                        "user_id": target.id,
                        "custom_permissions": {},
                        "effective_permissions": get_user_permissions(target),
                    },
                })

            perms_input = request.data.get("permissions")
            if not isinstance(perms_input, dict):
                return Response(
                    {"code": 2001, "message": "permissions 必须为字典格式", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            cleaned = {}
            for k in DEFAULT_USER_PERMISSIONS:
                if k in perms_input:
                    cleaned[k] = bool(perms_input[k])
                else:
                    cleaned[k] = DEFAULT_USER_PERMISSIONS[k]

            # 递归规范化父子权限联动
            cleaned = normalize_permissions(cleaned, previous_perms=target.custom_permissions or {})
            target.custom_permissions = cleaned
            target.save(update_fields=["custom_permissions"])

            audit(request, "permission_update", "修改用户权限", "用户", target.id,
                  target.nickname or target.username,
                  f"为用户 {target.username} 单独配置个性化权限，启用项：{sum(1 for v in cleaned.values() if v)}/{len(cleaned)}")

            return Response({
                "code": 0,
                "message": f"用户 {target.username} 权限配置已保存并立即生效",
                "data": {
                    "user_id": target.id,
                    "custom_permissions": target.custom_permissions,
                    "effective_permissions": get_user_permissions(target),
                },
            })

        # 2. 全局默认权限模板更新（未传 user_id）
        perms_input = request.data.get("default_permissions", {})
        if not isinstance(perms_input, dict):
            return Response(
                {"code": 2001, "message": "default_permissions 必须为字典格式", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setting = SystemSetting.get_settings()
        cleaned = {}
        for k in DEFAULT_USER_PERMISSIONS:
            if k in perms_input:
                cleaned[k] = bool(perms_input[k])
            else:
                cleaned[k] = DEFAULT_USER_PERMISSIONS[k]

        # 递归规范化父子权限联动
        cleaned = normalize_permissions(cleaned, previous_perms=setting.default_user_permissions or {})
        setting.default_user_permissions = cleaned
        setting.save(update_fields=["default_user_permissions"])

        audit(request, "permission_update", "修改全局默认权限模板", "系统", 1, "全局权限配置",
              f"更新系统全局默认权限模板，启用项数：{sum(1 for v in cleaned.values() if v)}/{len(cleaned)}")
        return Response({
            "code": 0,
            "message": "全局默认权限模板已成功保存并立即生效",
            "data": {
                "default_permissions": setting.default_user_permissions,
            },
        })
