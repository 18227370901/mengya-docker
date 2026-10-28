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
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    AIQueryLog,
    AuditLog,
    BabyProfile,
    MotherProfile,
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
    MotherProfileSerializer,
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
            "admin_session_timeout_minutes": max(0, getattr(s, "admin_session_timeout_minutes", 30) or 30),
        }
    except Exception:
        return {
            "captcha_threshold": 3,
            "freeze_threshold": 10,
            "lock_minutes": 5,
            "lock_seconds": 300,
            "admin_session_timeout_minutes": 30,
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
                "admin_session_timeout_minutes": getattr(SystemSetting.get_settings(), "admin_session_timeout_minutes", 30),
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
                "admin_session_timeout_minutes": getattr(SystemSetting.get_settings(), "admin_session_timeout_minutes", 30),
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
                    "admin_session_timeout_minutes": getattr(SystemSetting.get_settings(), "admin_session_timeout_minutes", 30),
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
        elif not user.is_pregnant and user.due_date is not None:
            user.due_date = None
            fields_to_update.append("due_date")

        # 若未被管理员单独定制权限，随阶段切换同步更新初始阶段菜单权限
        custom_perms = getattr(user, "custom_permissions", {}) or {}
        if not custom_perms.get("_admin_customized"):
            from apps.core.utils.permissions import get_default_permissions_for_stage
            user.custom_permissions = get_default_permissions_for_stage(
                due_date=user.due_date,
                baby_birthday=user.baby_birthday,
                is_pregnant=user.is_pregnant,
            )
            fields_to_update.append("custom_permissions")

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


class MotherViewSet(viewsets.ModelViewSet):
    serializer_class = MotherProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MotherProfile.objects.filter(user=user)
        if not qs.exists():
            from apps.core.models.baby import BabyProfile
            primary_baby = BabyProfile.objects.filter(user=user, is_primary=True).first() or BabyProfile.objects.filter(user=user).first()
            b_name = getattr(primary_baby, "name", "") or ""
            mom_name = f"{b_name}妈妈" if b_name else "萌宝妈妈"
            MotherProfile.objects.create(
                user=user,
                name=mom_name,
                is_primary=True,
                due_date=user.due_date,
                is_pregnant=user.is_pregnant,
            )
            qs = MotherProfile.objects.filter(user=user)
        else:
            pri_mom = qs.filter(is_primary=True).first() or qs.first()
            if pri_mom:
                changed = False
                if pri_mom.due_date != user.due_date:
                    pri_mom.due_date = user.due_date
                    changed = True
                if pri_mom.is_pregnant != user.is_pregnant:
                    pri_mom.is_pregnant = user.is_pregnant
                    changed = True
                # 若妈妈名称仍为通用“萌宝妈妈”但当前已有明确命名的默认宝宝，则自动同步为 xx妈妈
                from apps.core.models.baby import BabyProfile
                primary_baby = BabyProfile.objects.filter(user=user, is_primary=True).first() or BabyProfile.objects.filter(user=user).first()
                if primary_baby and primary_baby.name and (not pri_mom.name or pri_mom.name == "萌宝妈妈" or pri_mom.name.endswith("妈妈")):
                    expected_name = f"{primary_baby.name}妈妈"
                    if pri_mom.name != expected_name:
                        pri_mom.name = expected_name
                        changed = True
                if changed:
                    pri_mom.save(update_fields=["due_date", "is_pregnant", "name"])
        return qs

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "health_record_create", "您暂无「添加妈妈档案」的权限，请联系管理员开启")
        user = self.request.user
        raw_name = (self.request.data.get("name") or "").strip()
        if not raw_name:
            primary_baby = BabyProfile.objects.filter(user=user, is_primary=True).first() or BabyProfile.objects.filter(user=user).first()
            if primary_baby and primary_baby.name:
                raw_name = f"{primary_baby.name}妈妈"
            else:
                raw_name = "萌宝妈妈"

        is_primary = bool(self.request.data.get("is_primary", False))
        total_mothers = MotherProfile.objects.filter(user=user).count()
        if total_mothers == 0:
            is_primary = True
        elif is_primary:
            MotherProfile.objects.filter(user=user).update(is_primary=False)

        mom = serializer.save(user=user, name=raw_name, is_primary=is_primary)
        audit(self.request, "mother_create", "添加妈妈档案", "mother", mom.id, mom.name, f"添加妈妈档案 {mom.name}")

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "health_record_update", "您暂无「修改妈妈档案」的权限，请联系管理员开启")
        raw_name = (self.request.data.get("name") or "").strip()
        if not raw_name:
            primary_baby = BabyProfile.objects.filter(user=self.request.user, is_primary=True).first() or BabyProfile.objects.filter(user=self.request.user).first()
            if primary_baby and primary_baby.name:
                raw_name = f"{primary_baby.name}妈妈"
            else:
                raw_name = "萌宝妈妈"
        mom = serializer.save(name=raw_name)
        audit(self.request, "mother_update", "修改妈妈档案", "mother", mom.id, mom.name, f"更新妈妈档案 {mom.name}")

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "health_record_delete", "您暂无「删除妈妈档案」的权限，请联系管理员开启")
        user = self.request.user
        was_primary = instance.is_primary
        m_name = instance.name or f"妈妈#{instance.id}"
        audit(self.request, "mother_delete", "删除妈妈档案", "mother", instance.id, m_name, f"删除妈妈档案 {m_name}")
        instance.delete()
        if was_primary:
            remaining = MotherProfile.objects.filter(user=user).order_by("-id").first()
            if remaining:
                remaining.is_primary = True
                remaining.save(update_fields=["is_primary"])

    @action(detail=True, methods=["post"])
    def set_primary(self, request, pk=None):
        mom = get_object_or_404(MotherProfile, pk=pk, user=request.user)
        MotherProfile.objects.filter(user=request.user).update(is_primary=False)
        mom.is_primary = True
        mom.save(update_fields=["is_primary"])
        audit(request, "mother_switch", "切换默认妈妈", "mother", mom.id, mom.name, f"设为默认妈妈 {mom.name}")
        return Response({"code": 0, "message": "已设为默认妈妈档案", "data": None})


class BabyViewSet(viewsets.ModelViewSet):
    serializer_class = BabyProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BabyProfile.objects.filter(user=self.request.user)

    def _sync_user_stage(self, user, baby):
        """将宝宝档案（未出生/已出生）同步至用户的孕育阶段，并同步更新妈妈档案"""
        from datetime import date
        from apps.core.models.mother import MotherProfile
        today = date.today()
        is_born = getattr(baby, "is_born", True)
        if not is_born or baby.birthday > today:
            # 未出生宝宝 -> 同步为孕期模式
            user.is_pregnant = True
            user.due_date = baby.birthday
            user.baby_birthday = None
            user.save(update_fields=["is_pregnant", "due_date", "baby_birthday"])
        else:
            # 已出生宝宝 -> 同步为已出生/育儿模式
            user.is_pregnant = False
            user.baby_birthday = baby.birthday
            user.due_date = None
            user.save(update_fields=["is_pregnant", "due_date", "baby_birthday"])

        # 同步更新用户的默认妈妈档案（保持与默认宝宝的关联与阶段一致）
        pri_mom = MotherProfile.objects.filter(user=user, is_primary=True).first() or MotherProfile.objects.filter(user=user).first()
        b_name = getattr(baby, "name", "") or ""
        expected_mom_name = f"{b_name}妈妈" if b_name else "萌宝妈妈"
        if pri_mom:
            pri_mom.due_date = user.due_date
            pri_mom.is_pregnant = user.is_pregnant
            if not pri_mom.name or pri_mom.name == "萌宝妈妈" or pri_mom.name.endswith("妈妈"):
                pri_mom.name = expected_mom_name
            pri_mom.save(update_fields=["due_date", "is_pregnant", "name"])
        else:
            MotherProfile.objects.create(
                user=user,
                name=expected_mom_name,
                is_primary=True,
                due_date=user.due_date,
                is_pregnant=user.is_pregnant,
            )

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "baby_create", "您暂无「添加宝宝档案」的权限，请联系管理员开启")
        user = self.request.user
        raw_name = (self.request.data.get("name") or "").strip()
        if not raw_name:
            primary_baby = BabyProfile.objects.filter(user=user, is_primary=True).first() or BabyProfile.objects.filter(user=user).first()
            if primary_baby and primary_baby.name:
                raw_name = primary_baby.name
            else:
                raw_name = "小萌宝"
        baby = serializer.save(user=user, name=raw_name)
        total_babies = BabyProfile.objects.filter(user=self.request.user).count()
        if total_babies == 1 or baby.is_primary or self.request.data.get("sync_stage", True):
            BabyProfile.objects.filter(user=self.request.user).exclude(id=baby.id).update(is_primary=False)
            baby.is_primary = True
            baby.save(update_fields=["is_primary"])
            self._sync_user_stage(self.request.user, baby)
        b_name = getattr(baby, "name", "") or f"宝宝#{baby.id}"
        audit(self.request, "baby_create", "添加宝宝档案", "baby", baby.id, b_name, f"添加宝宝 {b_name}")

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "baby_update", "您暂无「修改宝宝档案」的权限，请联系管理员开启")
        baby = serializer.save()
        if baby.is_primary or BabyProfile.objects.filter(user=self.request.user).count() == 1:
            self._sync_user_stage(self.request.user, baby)
        b_name = getattr(baby, "name", "") or f"宝宝#{baby.id}"
        audit(self.request, "baby_update", "修改宝宝档案", "baby", baby.id, b_name, f"更新宝宝档案 {b_name}")

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "baby_delete", "您暂无「删除宝宝档案」的权限，请联系管理员开启")
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


# ============ v1.88 知识库管理通用辅助 ============

class KbWritePermission(IsAuthenticated):
    """知识库写操作权限：管理员直通；普通用户需被显式授予对应模块管理权限（kb_*_manage）"""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if _is_admin(request.user):
            return True
        perm_key = getattr(view, "kb_manage_perm", None)
        if not perm_key or not has_permission(request.user, perm_key):
            # v1.88.5 拒绝时显式抛出中文提示（此前返回 False 走 DRF 默认英文文案）
            raise PermissionDenied(detail={
                "code": 4030,
                "message": "该操作需要「知识库管理」权限，请联系管理员处理",
                "permission": perm_key or "kb_manage",
            })
        return True


def _kb_menu_allowed(user, menu_key, kb_view_key):
    """知识库读取权限：模块菜单权限或知识库查看权限任一即可（管理员恒通过）"""
    return has_permission(user, menu_key) or has_permission(user, kb_view_key)


def _kb_paged_response(qs, request, serializer_class, extra_stats=None):
    """知识库列表通用分页响应：带 page 参数时服务端分页，否则全量（兼容现有展示页调用）
    v1.88.4 新增 page_size=-1 语义：展示页"全部"选项，返回全量但保持分页响应结构。
    """
    total = qs.count()
    page_param = request.query_params.get("page")
    if not page_param:
        data = serializer_class(qs, many=True).data
        return Response({"code": 0, "message": "success", "data": data})
    try:
        page = max(1, int(page_param))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    if page_size == -1:
        # v1.88.4 展示页"全部"：不分页返回全量（响应结构与分页保持一致）
        items = qs
        data = {
            "items": serializer_class(items, many=True).data,
            "total": total,
            "page": 1,
            "page_size": total if total > 0 else 1,
            "total_pages": 1,
        }
        if extra_stats is not None:
            data["stats"] = extra_stats
        return Response({"code": 0, "message": "success", "data": data})
    page_size = max(1, min(100, page_size))
    start = (page - 1) * page_size
    items = qs[start:start + page_size]
    data = {
        "items": serializer_class(items, many=True).data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
    }
    if extra_stats is not None:
        data["stats"] = extra_stats
    return Response({"code": 0, "message": "success", "data": data})


def _kb_batch_action(request, qs, module_label, target_type, get_name=None):
    """知识库通用批量操作：delete / active / inactive / essential / unessential（含审计）"""
    data = request.data or {}
    ids = data.get("ids", [])
    act = str(data.get("action") or "").strip()
    if not isinstance(ids, list) or len(ids) == 0:
        return Response({"code": 2001, "message": "请选择要操作的数据项"}, status=status.HTTP_400_BAD_REQUEST)
    valid_actions = ("delete", "active", "inactive", "essential", "unessential")
    if act not in valid_actions:
        return Response({"code": 2001, "message": "无效的操作类型"}, status=status.HTTP_400_BAD_REQUEST)
    if get_name is None:
        get_name = lambda x: getattr(x, "title", None) or getattr(x, "name", "") or f"#{x.id}"  # noqa: E731
    targets = list(qs.filter(id__in=ids))
    ids_text = ",".join(str(i) for i in ids[:50])
    if act == "delete":
        names = "、".join([str(get_name(t)) for t in targets[:5]])
        suffix = "…" if len(targets) > 5 else ""
        count, _ = qs.filter(id__in=ids).delete()
        audit(request, "knowledge_batch_delete", f"批量删除{module_label}", target_type, ids_text,
              f"{len(targets)}条", f"批量删除{module_label} {len(targets)} 条：{names}{suffix}")
        return Response({"code": 0, "message": f"成功删除 {count} 条数据", "data": {"count": count, "action": act}})
    updates = {}
    if act == "active":
        updates = {"is_active": True}
    elif act == "inactive":
        updates = {"is_active": False}
    elif act == "essential":
        updates = {"is_essential": True}
    elif act == "unessential":
        updates = {"is_essential": False}
    count = qs.filter(id__in=ids).update(**updates)
    audit(request, "knowledge_batch_status", f"批量修改{module_label}状态", target_type, ids_text,
          f"{len(targets)}条", f"对{module_label}执行批量操作「{act}」，共 {count} 条")
    return Response({"code": 0, "message": f"成功更新 {count} 条数据", "data": {"count": count, "action": act}})


def _kb_write_audit(request, action_kind, module_label, target_type, obj, detail):
    """知识库单条写操作审计（action_kind: create/update/delete）"""
    name = getattr(obj, "title", None) or getattr(obj, "name", "") or f"#{getattr(obj, 'id', 0)}"
    audit(request, f"knowledge_{action_kind}", f"{'新增' if action_kind == 'create' else '编辑' if action_kind == 'update' else '删除'}{module_label}",
          target_type, getattr(obj, "id", 0), str(name), detail)


def _kb_params(view):
    """v1.88.1 统一取请求参数：GET 用 query_params，POST（导出）用 body，便于导出复用列表筛选"""
    req = view.request
    if req.method == "POST" and isinstance(getattr(req, "data", None), dict):
        return req.data
    return req.query_params


def _kb_can_see_inactive(view):
    """v1.88.1 判断当前请求是否可查看停用数据：管理接口带 with_inactive=1 且管理员/被授权用户"""
    user = view.request.user
    if not (_is_admin(user) or has_permission(user, getattr(view, "kb_manage_perm", "") or "___")
            or has_permission(user, getattr(view, "kb_view_perm", "") or "___")):
        return False
    return _kb_params(view).get("with_inactive") == "1"


def _kb_export_response(qs, request, filename, header, rows_fn):
    """v1.88.1 知识库通用 CSV 导出：UTF-8 with BOM，防乱码"""
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("\ufeff")  # BOM 确保 Excel/WPS 以 UTF-8 打开不乱码
    writer = csv.writer(response)
    writer.writerow(header)
    for obj in qs:
        writer.writerow(rows_fn(obj))
    audit(request, "knowledge_export", "导出知识库数据", filename.split("_")[0], "all",
          f"{qs.count()}条", f"导出 {filename}，共 {qs.count()} 条")
    return response


def _kb_apply_export_scope(qs, request_data):
    """v1.88.1 应用导出范围：page=当前页 / filtered=筛选结果全部 / selected=仅选中"""
    scope = str(request_data.get("scope") or "page").strip()
    if scope == "selected":
        ids = request_data.get("ids") or []
        if not isinstance(ids, list) or len(ids) == 0:
            return qs.none()
        return qs.filter(id__in=ids)
    if scope == "filtered":
        return qs
    # page：当前页切片
    try:
        page = max(1, int(request_data.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(200, int(request_data.get("page_size", 10))))
    except (TypeError, ValueError):
        page_size = 10
    start = (page - 1) * page_size
    return qs[start:start + page_size]


def _kb_read_csv_rows(text):
    """v1.88.2 解析 CSV 文本：剥离 BOM，自动跳过 # 开头的说明行，返回 (原始表头, 数据行字典列表)

    行字典的键为原始表头（中文或英文，未归一化），另附带 __line__ 键 = 该条记录在
    原始文件中的起始物理行号（表头为第 1 行），供导入报错精确定位到真实行。
    """
    # v1.88.2 剥离 UTF-8 BOM：Excel/WPS 另存 CSV 可能带 BOM；GBK 解码分支也可能残留 BOM 字符
    text = (text or "").lstrip("\ufeff")
    reader = csv.reader(io.StringIO(text))
    header = None
    data = []
    prev_end = 0  # 上一条记录结束时的物理行号
    for r in reader:
        start_line = prev_end + 1  # 本条记录的起始物理行号（多行字段从首行起算）
        prev_end = reader.line_num
        if not r or str(r[0]).lstrip().startswith("#"):
            continue
        if header is None:
            header = [h.strip() for h in r]
            continue
        item = {"__line__": start_line}
        for i, key in enumerate(header):
            item[key] = r[i] if i < len(r) else ""
        data.append(item)
    if header is None:
        return [], []
    return header, data


def _kb_import_result(request, module_label, target_type, created, errors):
    """v1.88.2 知识库导入统一响应：汇总文案附首条失败原因，明细见 data.errors，并落审计"""
    audit(request, "knowledge_import", f"批量导入{module_label}", target_type, 0, f"{created}条",
          f"CSV 导入{module_label}：成功 {created} 条，失败 {len(errors)} 条")
    msg = f"导入完成：成功 {created} 条" + (f"，{len(errors)} 条失败" if errors else "")
    if errors:
        msg += f"（首因：{errors[0]}）"
    return Response({"code": 0, "message": msg, "data": {"created": created, "errors": errors}})


def _kb_normalize_header(header, cn_map):
    """v1.88.1 表头归一化：中文表头映射为英文字段名（兼容旧纯英文模板）"""
    return [cn_map.get(h, h) for h in header]


# ============ 时间轴 ============

class TimelineViewSet(viewsets.ModelViewSet):
    serializer_class = TimelineSerializer
    permission_classes = [IsAuthenticated]
    kb_manage_perm = "kb_timeline_manage"
    kb_view_perm = "kb_timeline_view"

    # v1.88.1 导入模板：中文表头 → 英文字段名映射（双语兼容）
    CN_HEADER_MAP = {
        "阶段类型*": "stage_type", "阶段值*": "stage_value", "分类*": "category",
        "标题*": "title", "副标题": "subtitle", "详细内容*": "content", "小贴士": "tips",
        "封面图URL": "cover_image", "必读（是/否）": "is_essential", "排序权重": "sort_order",
        "是否启用（是/否）": "is_active",
    }

    def list(self, request, *args, **kwargs):
        # v1.88 兼容知识库管理页：模块菜单权限或知识库查看权限任一即可；带 page 参数时服务端分页
        # 保留原有语义：带 essential 参数的首页「本周重点」调用不做菜单强制校验
        if not request.query_params.get("essential"):
            if not _kb_menu_allowed(request.user, "menu_timeline", "kb_timeline_view"):
                raise PermissionDenied(detail={"code": 4030, "message": "管理员已关闭「时间轴/孕期周历」页面访问，如有需要请联系管理员开启", "permission": "menu_timeline"})
        qs = self.filter_queryset(self.get_queryset())
        stats = {
            "total": qs.count(),
            "essential_count": qs.filter(is_essential=True).count(),
            "pregnancy_count": qs.filter(stage_type="pregnancy_week").count(),
            "baby_count": qs.exclude(stage_type__startswith="pregnancy").count(),
        }
        return _kb_paged_response(qs, request, TimelineSerializer, extra_stats=stats)

    def retrieve(self, request, *args, **kwargs):
        if not _kb_menu_allowed(request.user, "menu_timeline", "kb_timeline_view"):
            raise PermissionDenied(detail={"code": 4030, "message": "管理员已关闭「时间轴/孕期周历」页面访问，如有需要请联系管理员开启", "permission": "menu_timeline"})
        return super().retrieve(request, *args, **kwargs)

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
        # v1.88.1 前台一律只显示启用数据（含管理员）；仅知识库管理中心（with_inactive=1 且有权限）可见全部
        # v1.88.1 前台展示（list/retrieve）只显示启用数据；写操作放行（否则停用条目无法编辑/删除/重新启用）
        if self.action in ("list", "retrieve") and not _kb_can_see_inactive(self):
            qs = qs.filter(is_active=True)
        # 知识库管理：启用状态筛选（active/inactive，仅管理接口有效）
        status_filter = _kb_params(self).get("status")
        if status_filter in ("active", "inactive") and _kb_can_see_inactive(self):
            qs = qs.filter(is_active=(status_filter == "active"))
        # v1.88 知识库管理：关键字搜索
        search = _kb_params(self).get("search")
        if search:
            qs = qs.filter(
                models.Q(title__icontains=search)
                | models.Q(subtitle__icontains=search)
                | models.Q(content__icontains=search)
            )
        # v1.88 知识库管理：必读状态筛选（all/essential/normal）
        essential_filter = _kb_params(self).get("essential_filter")
        if essential_filter == "essential":
            qs = qs.filter(is_essential=True)
        elif essential_filter == "normal":
            qs = qs.filter(is_essential=False)
        return qs

    def get_permissions(self):
        """知识库写操作仅管理员或被授权用户（kb_timeline_manage）"""
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "batch"):
            return [KbWritePermission()]
        return super().get_permissions()

    def perform_create(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "create", "时间轴事件", "timeline", obj, f"新增时间轴事件【{obj.title}】(阶段 {obj.stage_type} {obj.stage_value})")

    def perform_update(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "update", "时间轴事件", "timeline", obj, f"修改时间轴事件【{obj.title}】(#{obj.id})")

    def perform_destroy(self, instance):
        _kb_write_audit(self.request, "delete", "时间轴事件", "timeline", instance, f"删除时间轴事件【{instance.title}】(#{instance.id})")
        instance.delete()

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """v1.88 批量操作：delete / essential / unessential"""
        return _kb_batch_action(request, TimelineEvent.objects.all(), "时间轴事件", "timeline",
                                get_name=lambda x: x.title)

    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """v1.88.1 导出时间轴 CSV：scope=page(当前页)/filtered(筛选结果)/selected(选中项)"""
        data = request.data or {}
        qs = self.get_queryset().order_by("stage_type", "stage_value", "sort_order")
        qs = _kb_apply_export_scope(qs, data)
        scope_suffix = {"selected": "选中", "filtered": "筛选", "page": f"第{data.get('page', 1)}页"}.get(str(data.get("scope") or "page"), "")
        return _kb_export_response(
            qs, request, f"timeline_export_{scope_suffix}.csv",
            ["ID", "阶段类型", "阶段值", "分类", "标题", "副标题", "详细内容", "小贴士", "封面图URL", "必读", "是否启用", "排序权重"],
            lambda e: [e.id, e.stage_type, e.stage_value, e.category, e.title, e.subtitle or "",
                       e.content or "", e.tips or "", e.cover_image or "",
                       "是" if e.is_essential else "否", "是" if e.is_active else "否", e.sort_order],
        )

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """v1.88.1 下载时间轴导入模板（?lang=cn|en，三段式：表头+说明行+示例行）"""
        lang = (request.query_params.get("lang") or "cn").strip().lower()
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="timeline_import_template_{lang}.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        if lang == "en":
            writer.writerow(["stage_type*", "stage_value*", "category*", "title*", "subtitle",
                             "content*", "tips", "cover_image", "is_essential(是/否)", "sort_order", "is_active(是/否)"])
            writer.writerow(["# Required: stage_type, stage_value, category, title, content. "
                             "stage_type: pregnancy_week/baby_age_day/baby_age_month/pregnancy_trimester. "
                             "category: food/clothing/housing/travel/health/shopping/milestone/emotion/exercise/checkup/education. "
                             "is_essential & is_active: 是/否, blank=否/是. Lines starting with # are ignored on import."])
            writer.writerow(["pregnancy_week", 10, "health", "孕10周：胎儿发育关键期",
                             "神经系统快速发育", "本周宝宝神经系统快速发育……", "补充叶酸、均衡饮食", "", "是", 0, "是"])
        else:
            writer.writerow(["阶段类型*", "阶段值*", "分类*", "标题*", "副标题", "详细内容*",
                             "小贴士", "封面图URL", "必读（是/否）", "排序权重", "是否启用（是/否）"])
            writer.writerow(["# 必填列：阶段类型/阶段值/分类/标题/详细内容。阶段类型：pregnancy_week(孕周)/baby_age_day(宝宝天数)/"
                             "baby_age_month(宝宝月龄)/pregnancy_trimester(孕早中晚期)；分类：food(饮食)/clothing(穿衣)/housing(居家)/"
                             "travel(出行)/health(健康)/shopping(购物)/milestone(里程碑)/emotion(心理情绪)/exercise(运动)/"
                             "checkup(产检)/education(胎教)；必读、是否启用填 是/否，留空默认为 否、是；# 开头的说明行导入时自动忽略"])
            writer.writerow(["pregnancy_week", 10, "health", "孕10周：胎儿发育关键期",
                             "神经系统快速发育", "本周宝宝神经系统快速发育……", "补充叶酸、均衡饮食", "", "是", 0, "是"])
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入时间轴 CSV（支持中英文表头，自动跳过 # 说明行）"""
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"code": 2001, "message": "请上传 CSV 文件", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            # v1.88.2 修复：字节流只读一次——此前 UTF-8 解码失败后第二次 read() 返回空流，
            # 导致 GBK/ANSI 编码文件（Excel 中文环境另存）静默导入 0 条
            raw = file.read()
            text = raw.decode("utf-8-sig")
        except Exception:
            try:
                text = raw.decode("gbk")
            except Exception:
                return Response(
                    {"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        raw_header, rows = _kb_read_csv_rows(text)
        header = _kb_normalize_header(raw_header, self.CN_HEADER_MAP)
        valid_stage_types = {c[0] for c in TimelineEvent.STAGE_TYPES}
        valid_categories = {c[0] for c in TimelineEvent.CATEGORY_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=False):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for row in rows:
            # v1.88.2 真实文件行号（含表头/说明行计数），报错可精确定位
            idx = row.get("__line__") or 0
            # v1.88.2 修复：行字典键为原始表头（中文），须按位置从原始键取值；
            # 此前用归一化后的英文键查询导致全部取空 → 每行报"缺少必填"，导入 0 条
            mapped = {header[i]: row.get(raw_header[i], "") for i in range(len(header))}
            title = (mapped.get("title") or "").strip()
            stage_type = (mapped.get("stage_type") or "").strip()
            if not title or not stage_type:
                errors.append(f"第{idx}行：缺少 标题 或 阶段类型")
                continue
            if stage_type not in valid_stage_types:
                errors.append(f"第{idx}行：无效的阶段类型「{stage_type}」")
                continue
            try:
                stage_value = int(mapped.get("stage_value") or 0)
            except ValueError:
                errors.append(f"第{idx}行：阶段值不是数字")
                continue
            category = (mapped.get("category") or "health").strip()
            if category not in valid_categories:
                errors.append(f"第{idx}行：无效的分类「{category}」")
                continue
            try:
                sort_order = int(mapped.get("sort_order") or 0)
            except ValueError:
                sort_order = 0
            TimelineEvent.objects.create(
                stage_type=stage_type,
                stage_value=stage_value,
                category=category,
                title=title,
                subtitle=(mapped.get("subtitle") or "").strip(),
                content=(mapped.get("content") or "").strip() or title,
                tips=(mapped.get("tips") or "").strip(),
                cover_image=(mapped.get("cover_image") or "").strip() or None,
                is_essential=_yn(mapped.get("is_essential")),
                is_active=_yn(mapped.get("is_active"), default=True),
                sort_order=sort_order,
            )
            created += 1
        # v1.88.2 统一导入响应：汇总文案附首条失败原因，并落审计
        return _kb_import_result(request, "时间轴事件", "timeline", created, errors)


# ============ 孕期食谱 ============

class RecipeViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeSerializer
    permission_classes = [IsAuthenticated]
    kb_manage_perm = "kb_recipes_manage"
    kb_view_perm = "kb_recipes_view"

    # v1.88.1 导入模板：中文表头 → 英文字段名映射
    CN_HEADER_MAP = {
        "标题*": "title", "营养标签": "nutrient_tag", "孕期阶段*": "period",
        "月份分组": "period_month", "材料*": "ingredients", "做法步骤*": "steps",
        "营养小叮咛": "nutrition_tip", "封面图URL": "cover_image", "排序权重": "sort_order",
        "是否启用（是/否）": "is_active",
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in ("OPTIONS",):
            # v1.88 兼容知识库管理页：菜单权限 / 知识库查看 / 知识库管理权限任一即可
            if not (
                _kb_menu_allowed(request.user, "menu_recipes", "kb_recipes_view")
                or has_permission(request.user, "kb_recipes_manage")
            ):
                raise PermissionDenied(detail={"code": 4030, "message": "管理员已关闭「孕期食谱」页面访问，如有需要请联系管理员开启", "permission": "menu_recipes"})

    def get_queryset(self):
        qs = Recipe.objects.all()
        # v1.88.1 前台一律只显示启用条目（含管理员）；仅知识库管理中心（with_inactive=1）可见全部
        # v1.88.1 前台展示（list/retrieve）只显示启用数据；写操作放行（否则停用条目无法编辑/删除/重新启用）
        if self.action in ("list", "retrieve") and not _kb_can_see_inactive(self):
            qs = qs.filter(is_active=True)
        params = _kb_params(self)
        period = params.get("period")
        period_month = params.get("period_month")
        nutrient = params.get("nutrient")
        search = params.get("search")
        if period:
            qs = qs.filter(period=period)
        if period_month:
            qs = qs.filter(period_month=period_month)
        if nutrient:
            qs = qs.filter(nutrient_tag__icontains=nutrient)
        if search:
            qs = qs.filter(
                models.Q(title__icontains=search)
                | models.Q(nutrient_tag__icontains=search)
                | models.Q(ingredients__icontains=search)
            )
        # v1.88 知识库管理：启用状态筛选（active/inactive，仅管理接口有效）
        status_filter = params.get("status")
        if status_filter in ("active", "inactive") and _kb_can_see_inactive(self):
            qs = qs.filter(is_active=(status_filter == "active"))
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        stats = {
            "total": qs.count(),
            "active_count": qs.filter(is_active=True).count(),
            "inactive_count": qs.filter(is_active=False).count(),
        }
        return _kb_paged_response(qs, request, RecipeSerializer, extra_stats=stats)

    def get_permissions(self):
        """知识库写操作仅管理员或被授权用户（kb_recipes_manage）"""
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "batch"):
            return [KbWritePermission()]
        return super().get_permissions()

    def perform_create(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "create", "孕期食谱", "recipe", obj, f"新增食谱【{obj.title}】")

    def perform_update(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "update", "孕期食谱", "recipe", obj, f"修改食谱【{obj.title}】(#{obj.id})")

    def perform_destroy(self, instance):
        _kb_write_audit(self.request, "delete", "孕期食谱", "recipe", instance, f"删除食谱【{instance.title}】(#{instance.id})")
        instance.delete()

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """v1.88 批量操作：delete / active / inactive"""
        return _kb_batch_action(request, Recipe.objects.all(), "孕期食谱", "recipe", get_name=lambda x: x.title)

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

    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """v1.88.1 导出孕期食谱 CSV：scope=page/filtered/selected"""
        data = request.data or {}
        qs = self.get_queryset().order_by("period_month", "sort_order")
        qs = _kb_apply_export_scope(qs, data)
        scope_suffix = {"selected": "选中", "filtered": "筛选", "page": f"第{data.get('page', 1)}页"}.get(str(data.get("scope") or "page"), "")
        return _kb_export_response(
            qs, request, f"recipes_export_{scope_suffix}.csv",
            ["ID", "标题", "营养标签", "孕期阶段", "月份分组", "材料", "做法步骤", "营养小叮咛", "封面图URL", "排序权重", "是否启用"],
            lambda r: [r.id, r.title, r.nutrient_tag, r.period, r.period_month, r.ingredients, r.steps,
                       r.nutrition_tip, r.cover_image or "", r.sort_order, "是" if r.is_active else "否"],
        )

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """v1.88.1 下载食谱导入模板（?lang=cn|en）"""
        lang = (request.query_params.get("lang") or "cn").strip().lower()
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="recipes_import_template_{lang}.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        if lang == "en":
            writer.writerow(["title*", "nutrient_tag", "period*", "period_month", "ingredients*",
                             "steps*", "nutrition_tip", "cover_image", "sort_order", "is_active(是/否)"])
            writer.writerow(["# Required: title, period, ingredients, steps. period: early(1-12w)/mid(13-27w)/late(28-40w). "
                             "period_month like month_5_6, optional. is_active: 是/否, blank=是. # lines are ignored."])
            writer.writerow(["清蒸鲈鱼", "高蛋白·DHA", "mid", "month_5_6",
                             "鲈鱼一条约500g\n姜丝适量", "1. 鲈鱼洗净划刀\n2. 大火蒸8分钟", "孕中期优质蛋白助力大脑发育", "", 0, "是"])
        else:
            writer.writerow(["标题*", "营养标签", "孕期阶段*", "月份分组", "材料*",
                             "做法步骤*", "营养小叮咛", "封面图URL", "排序权重", "是否启用（是/否）"])
            writer.writerow(["# 必填列：标题/孕期阶段/材料/做法步骤。孕期阶段：early(孕早期1-12周)/mid(孕中期13-27周)/late(孕晚期28-40周)；"
                             "月份分组如 month_5_6 可留空；营养标签如“高蛋白·DHA”；是否启用填 是/否，留空默认为是；# 开头说明行导入时自动忽略"])
            writer.writerow(["清蒸鲈鱼", "高蛋白·DHA", "mid", "month_5_6",
                             "鲈鱼一条约500g\n姜丝适量", "1. 鲈鱼洗净划刀\n2. 大火蒸8分钟", "孕中期优质蛋白助力大脑发育", "", 0, "是"])
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入食谱 CSV（管理员/授权用户）"""
        file = request.FILES.get("file")
        if not file:
            return Response({"code": 2001, "message": "请上传 CSV 文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        try:
            # v1.88.2 修复：字节流只读一次——此前 UTF-8 解码失败后第二次 read() 返回空流，
            # 导致 GBK/ANSI 编码文件（Excel 中文环境另存）静默导入 0 条
            raw = file.read()
            text = raw.decode("utf-8-sig")
        except Exception:
            try:
                text = raw.decode("gbk")
            except Exception:
                return Response({"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        raw_header, rows = _kb_read_csv_rows(text)
        header = _kb_normalize_header(raw_header, self.CN_HEADER_MAP)
        valid_periods = {c[0] for c in Recipe.PERIOD_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=True):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for row in rows:
            # v1.88.2 真实文件行号（含表头/说明行计数），报错可精确定位
            idx = row.get("__line__") or 0
            # v1.88.2 修复：行字典键为原始表头（中文），须按位置从原始键取值；
            # 此前用归一化后的英文键查询导致全部取空 → 每行报"缺少必填"，导入 0 条
            mapped = {header[i]: row.get(raw_header[i], "") for i in range(len(header))}
            title = (mapped.get("title") or "").strip()
            if not title:
                errors.append(f"第{idx}行：缺少 标题")
                continue
            period = (mapped.get("period") or "mid").strip()
            if period not in valid_periods:
                errors.append(f"第{idx}行：无效的孕期阶段「{period}」(early/mid/late)")
                continue
            try:
                sort_order = int(mapped.get("sort_order") or 0)
            except ValueError:
                sort_order = 0
            obj = Recipe.objects.create(
                title=title,
                nutrient_tag=(mapped.get("nutrient_tag") or "").strip(),
                period=period,
                period_month=(mapped.get("period_month") or "").strip(),
                ingredients=(mapped.get("ingredients") or "").strip() or "见原文",
                steps=(mapped.get("steps") or "").strip() or "见原文",
                nutrition_tip=(mapped.get("nutrition_tip") or "").strip(),
                cover_image=(mapped.get("cover_image") or "").strip() or None,
                sort_order=sort_order,
                is_active=_yn(mapped.get("is_active")),
            )
            created += 1
        # v1.88.2 统一导入响应：汇总文案附首条失败原因，并落审计
        return _kb_import_result(request, "孕期食谱", "recipe", created, errors)


# ============ 幼儿百科 ============

class KidsEncyclopediaViewSet(viewsets.ModelViewSet):
    serializer_class = KidsEncyclopediaSerializer
    permission_classes = [IsAuthenticated]
    kb_manage_perm = "kb_encyclopedia_manage"
    kb_view_perm = "kb_encyclopedia_view"

    # v1.88.1 导入模板：中文表头 → 英文字段名映射
    CN_HEADER_MAP = {
        "章节*": "chapter", "题号*": "question_number", "问题*": "question",
        "选项A": "option_a", "选项B": "option_b", "选项C": "option_c",
        "解答正文*": "answer", "漫画对话": "comic_dialogue", "配图URL": "cover_image",
        "排序权重": "sort_order", "是否启用（是/否）": "is_active",
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in ("OPTIONS",):
            # v1.88 兼容知识库管理页：菜单权限 / 知识库查看 / 知识库管理权限任一即可
            if not (
                _kb_menu_allowed(request.user, "menu_encyclopedia", "kb_encyclopedia_view")
                or has_permission(request.user, "kb_encyclopedia_manage")
            ):
                raise PermissionDenied(detail={"code": 4030, "message": "管理员已关闭「幼儿百科」页面访问，如有需要请联系管理员开启", "permission": "menu_encyclopedia"})

    def get_queryset(self):
        qs = KidsEncyclopedia.objects.all()
        # v1.88.1 前台一律只显示启用条目（含管理员）；仅知识库管理中心（with_inactive=1）可见全部
        # v1.88.1 前台展示（list/retrieve）只显示启用数据；写操作放行（否则停用条目无法编辑/删除/重新启用）
        if self.action in ("list", "retrieve") and not _kb_can_see_inactive(self):
            qs = qs.filter(is_active=True)
        params = _kb_params(self)
        chapter = params.get("chapter")
        search = params.get("search")
        if chapter:
            qs = qs.filter(chapter=chapter)
        if search:
            qs = qs.filter(
                models.Q(question__icontains=search)
                | models.Q(answer__icontains=search)
                | models.Q(option_a__icontains=search)
                | models.Q(option_b__icontains=search)
            )
        # v1.88 知识库管理：启用状态筛选（仅管理接口有效）
        status_filter = params.get("status")
        if status_filter in ("active", "inactive") and _kb_can_see_inactive(self):
            qs = qs.filter(is_active=(status_filter == "active"))
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        stats = {
            "total": qs.count(),
            "active_count": qs.filter(is_active=True).count(),
            "inactive_count": qs.filter(is_active=False).count(),
        }
        return _kb_paged_response(qs, request, KidsEncyclopediaSerializer, extra_stats=stats)

    def get_permissions(self):
        """知识库写操作仅管理员或被授权用户（kb_encyclopedia_manage）"""
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "batch"):
            return [KbWritePermission()]
        return super().get_permissions()

    def perform_create(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "create", "幼儿百科", "encyclopedia", obj, f"新增百科问答【{obj.question}】")

    def perform_update(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "update", "幼儿百科", "encyclopedia", obj, f"修改百科问答【{obj.question}】(#{obj.id})")

    def perform_destroy(self, instance):
        _kb_write_audit(self.request, "delete", "幼儿百科", "encyclopedia", instance, f"删除百科问答【{instance.question}】(#{instance.id})")
        instance.delete()

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """v1.88 批量操作：delete / active / inactive"""
        return _kb_batch_action(request, KidsEncyclopedia.objects.all(), "幼儿百科", "encyclopedia", get_name=lambda x: x.question)

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

    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """v1.88.1 导出幼儿百科 CSV：scope=page/filtered/selected"""
        data = request.data or {}
        qs = self.get_queryset().order_by("chapter", "sort_order")
        qs = _kb_apply_export_scope(qs, data)
        scope_suffix = {"selected": "选中", "filtered": "筛选", "page": f"第{data.get('page', 1)}页"}.get(str(data.get("scope") or "page"), "")
        return _kb_export_response(
            qs, request, f"encyclopedia_export_{scope_suffix}.csv",
            ["ID", "章节", "题号", "问题", "选项A", "选项B", "选项C", "解答正文", "漫画对话", "配图URL", "排序权重", "是否启用"],
            lambda e: [e.id, e.chapter, e.question_number, e.question, e.option_a, e.option_b, e.option_c,
                       e.answer, e.comic_dialogue, e.cover_image or "", e.sort_order, "是" if e.is_active else "否"],
        )

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """v1.88.1 下载幼儿百科导入模板（?lang=cn|en）"""
        lang = (request.query_params.get("lang") or "cn").strip().lower()
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="encyclopedia_import_template_{lang}.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        sample = ["body", 1, "为什么我会肚子疼？", "吃太多啦", "肚子着凉了", "要拉便便了",
                  "小朋友的肚子里住着一位「小管家」，吃太多、着凉或者想拉便便时它都会提醒你哦。",
                  "", "", 0, "是"]
        if lang == "en":
            writer.writerow(["chapter*", "question_number*", "question*", "option_a", "option_b",
                             "option_c", "answer*", "comic_dialogue", "cover_image", "sort_order", "is_active(是/否)"])
            writer.writerow(["# Required: chapter, question_number, question, answer. chapter: origin(Where do I come from)/"
                             "body(My body)/growth(My growth)/mystery(Mysteries of body). is_active: 是/否, blank=是."])
        else:
            writer.writerow(["章节*", "题号*", "问题*", "选项A", "选项B", "选项C", "解答正文*",
                             "漫画对话", "配图URL", "排序权重", "是否启用（是/否）"])
            writer.writerow(["# 必填列：章节/题号/问题/解答正文。章节：origin(我从哪里来)/body(我的身体)/growth(我的成长)/"
                             "mystery(身体的奥秘)；题号为数字；选项C可留空；是否启用填 是/否，留空默认为是；# 开头说明行导入时自动忽略"])
        writer.writerow(sample)
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入幼儿百科 CSV（管理员/授权用户）"""
        file = request.FILES.get("file")
        if not file:
            return Response({"code": 2001, "message": "请上传 CSV 文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        try:
            # v1.88.2 修复：字节流只读一次——此前 UTF-8 解码失败后第二次 read() 返回空流，
            # 导致 GBK/ANSI 编码文件（Excel 中文环境另存）静默导入 0 条
            raw = file.read()
            text = raw.decode("utf-8-sig")
        except Exception:
            try:
                text = raw.decode("gbk")
            except Exception:
                return Response({"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        raw_header, rows = _kb_read_csv_rows(text)
        header = _kb_normalize_header(raw_header, self.CN_HEADER_MAP)
        valid_chapters = {c[0] for c in KidsEncyclopedia.CHAPTER_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=True):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for row in rows:
            # v1.88.2 真实文件行号（含表头/说明行计数），报错可精确定位
            idx = row.get("__line__") or 0
            # v1.88.2 修复：行字典键为原始表头（中文），须按位置从原始键取值；
            # 此前用归一化后的英文键查询导致全部取空 → 每行报"缺少必填"，导入 0 条
            mapped = {header[i]: row.get(raw_header[i], "") for i in range(len(header))}
            question = (mapped.get("question") or "").strip()
            if not question:
                errors.append(f"第{idx}行：缺少 问题")
                continue
            chapter = (mapped.get("chapter") or "body").strip()
            if chapter not in valid_chapters:
                errors.append(f"第{idx}行：无效的章节「{chapter}」(origin/body/growth/mystery)")
                continue
            try:
                q_number = int(mapped.get("question_number") or 0)
            except ValueError:
                errors.append(f"第{idx}行：题号不是数字")
                continue
            try:
                sort_order = int(mapped.get("sort_order") or 0)
            except ValueError:
                sort_order = 0
            KidsEncyclopedia.objects.create(
                chapter=chapter,
                question_number=q_number,
                question=question,
                option_a=(mapped.get("option_a") or "").strip(),
                option_b=(mapped.get("option_b") or "").strip(),
                option_c=(mapped.get("option_c") or "").strip(),
                answer=(mapped.get("answer") or "").strip() or question,
                comic_dialogue=(mapped.get("comic_dialogue") or "").strip(),
                cover_image=(mapped.get("cover_image") or "").strip() or None,
                sort_order=sort_order,
                is_active=_yn(mapped.get("is_active")),
            )
            created += 1
        # v1.88.2 统一导入响应：汇总文案附首条失败原因，并落审计
        return _kb_import_result(request, "幼儿百科", "encyclopedia", created, errors)


# ============ 商品 ============

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    # v1.88.1 导入模板：中文表头 → 英文字段名映射
    CN_HEADER_MAP = {
        "商品名称*": "name", "品牌*": "brand", "型号": "model", "一级分类*": "first_category",
        "二级分类": "second_category", "商品图片URL": "image_url", "商品描述": "description",
        "综合评分(0-10)": "overall", "均价(元)": "price_avg", "价格区间": "price_range",
        "必备（是/否）": "is_essential", "上架（是/否）": "is_active", "CCC认证（是/否）": "has_ccc_certification",
        "安全提示": "safety_alert", "适用起始月龄": "applicable_age_start", "适用结束月龄": "applicable_age_end",
        "适用季节": "applicable_season",
    }

    def get_queryset(self):
        # v1.88.1 前台一律只显示上架商品（含管理员）；仅管理场景（with_inactive=1 且有权限）可见全部
        params = _kb_params(self)
        can_manage = _is_admin(self.request.user) or has_permission(self.request.user, "menu_admin_products_manage")
        if params.get("with_inactive") == "1" and can_manage:
            qs = Product.objects.all()
        elif self.action not in ("list", "retrieve"):
            # v1.88.1 写操作（编辑/删除/重新上架暂存商品）不受上架过滤限制
            qs = Product.objects.all()
        else:
            qs = Product.objects.filter(is_active=True)

        category = params.get("category")
        brand = params.get("brand")
        q = params.get("q")
        sort = params.get("sort")
        # v1.88 知识库管理：上下架状态筛选（active/inactive，仅管理接口有效）
        status = params.get("status")
        if status in ("active", "inactive") and params.get("with_inactive") == "1" and can_manage:
            qs = qs.filter(is_active=(status == "active"))
        if category:
            qs = qs.filter(first_category=category)
        if brand:
            qs = qs.filter(brand=brand)
        # v1.88.1 品牌库：按品牌档案 ID 筛选关联商品（品牌删除前提示使用）
        brand_profile_id = params.get("brand_profile_id")
        if brand_profile_id:
            qs = qs.filter(brand_profile_id=brand_profile_id)
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
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "export_csv", "import_template", "batch"):
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

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """v1.88 商品批量操作：delete / active（上架）/ inactive（暂存）"""
        data = request.data or {}
        ids = data.get("ids", [])
        act = str(data.get("action") or "").strip()
        if not isinstance(ids, list) or len(ids) == 0:
            return Response({"code": 2001, "message": "请选择要操作的商品"}, status=status.HTTP_400_BAD_REQUEST)
        if act not in ("delete", "active", "inactive"):
            return Response({"code": 2001, "message": "无效的操作类型"}, status=status.HTTP_400_BAD_REQUEST)
        targets = list(Product.objects.filter(id__in=ids))
        ids_text = ",".join(str(i) for i in ids[:50])
        if act == "delete":
            count, _ = Product.objects.filter(id__in=ids).delete()
            names = "、".join([t.name for t in targets[:5]])
            suffix = "…" if len(targets) > 5 else ""
            audit(request, "product_batch_delete", "批量删除商品", "product", ids_text, f"{len(targets)}条",
                  f"批量删除商品 {len(targets)} 条：{names}{suffix}")
            return Response({"code": 0, "message": f"成功删除 {count} 条商品", "data": {"count": count, "action": act}})
        count = Product.objects.filter(id__in=ids).update(is_active=(act == "active"))
        audit(request, "product_batch_status", "批量修改商品状态", "product", ids_text, f"{len(targets)}条",
              f"批量{'上架' if act == 'active' else '暂存'}商品 {count} 条")
        return Response({"code": 0, "message": f"成功{'上架' if act == 'active' else '暂存'} {count} 条商品", "data": {"count": count, "action": act}})

    @action(detail=True, methods=["post"], url_path="ai-evaluate")
    def ai_evaluate(self, request, pk=None):
        """商品 AI 一键深度评测"""
        check_permission_or_403(request.user, "product_ai_evaluate", "您暂无「AI 一键评测」权限，请联系管理员开启")
        product = self.get_object()
        result = ai_service.ai_evaluate_product(product, user=request.user)
        audit(request, "ai_evaluate", "AI商品评测", "product", product.id, product.name, f"对商品【{product.brand} {product.name}】进行AI深度评测")
        return Response({"code": 0, "message": "success", "data": result})


    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """v1.88.1 导出商品 CSV：scope=page/filtered/selected；带品牌档案标签列"""
        data = request.data or {}
        qs = self.get_queryset().order_by("id")
        qs = _kb_apply_export_scope(qs, data)
        scope_suffix = {"selected": "选中", "filtered": "筛选", "page": f"第{data.get('page', 1)}页"}.get(str(data.get("scope") or "page"), "")
        return _kb_export_response(
            qs, request, f"products_export_{scope_suffix}.csv",
            ["ID", "商品名称", "品牌", "品牌库定位", "型号", "一级分类", "二级分类", "商品图片URL", "商品描述",
             "综合评分", "均价", "价格区间", "必备", "上架", "CCC认证", "安全提示",
             "适用起始月龄", "适用结束月龄", "适用季节"],
            lambda p: [p.id, p.name, p.brand,
                       (p.brand_profile.get_positioning_display() if p.brand_profile else "未建档"),
                       p.model or "", p.first_category, p.second_category, p.image_url, p.description or "",
                       p.overall_rating, (p.price_info or {}).get("avg", ""), (p.price_info or {}).get("range", ""),
                       "是" if p.is_essential else "否", "是" if p.is_active else "否",
                       "是" if p.has_ccc_certification else "否", p.safety_alert or "",
                       p.applicable_age_start or "", p.applicable_age_end or "", p.applicable_season or ""],
        )

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """v1.88.1 下载商品导入模板（?lang=cn|en）"""
        lang = (request.query_params.get("lang") or "cn").strip().lower()
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="products_import_template_{lang}.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        sample = [
            "婴儿连体衣", "英氏", "YSS-01", "clothing", "连体衣",
            "https://example.com/1.jpg", "纯棉A类，透气亲肤", 8.5, 129, "99-159",
            "是", "是", "是", "注意按需购买，避免囤货过多", 0, 6, "all",
        ]
        if lang == "en":
            writer.writerow(["name*", "brand*", "model", "first_category*", "second_category",
                              "image_url", "description", "overall(0-10)", "price_avg", "price_range",
                              "is_essential(是/否)", "is_active(是/否)", "has_ccc_certification(是/否)", "safety_alert",
                              "applicable_age_start", "applicable_age_end", "applicable_season"])
            writer.writerow(["# Required: name, brand, first_category. first_category: food/feeding/clothing/diaper/bedding/"
                             "furniture/bath/health_tool/travel/toy/mama_pregnancy/mama_postpartum/mama_nursing/appliance. "
                             "applicable_season: spring/summer/autumn/winter/all. Yes-no columns: 是/否, blank=否(essential/ccc) or 是(active)."])
        else:
            writer.writerow(["商品名称*", "品牌*", "型号", "一级分类*", "二级分类",
                              "商品图片URL", "商品描述", "综合评分(0-10)", "均价(元)", "价格区间",
                              "必备（是/否）", "上架（是/否）", "CCC认证（是/否）", "安全提示",
                              "适用起始月龄", "适用结束月龄", "适用季节"])
            writer.writerow(["# 必填列：商品名称/品牌/一级分类。一级分类：food(食品)/feeding(食具)/clothing(服装)/diaper(尿裤)/"
                             "bedding(寝具)/furniture(家具)/bath(洗护)/health_tool(护理工具)/travel(出行)/toy(启智早教)/"
                             "mama_pregnancy(妈妈孕期)/mama_postpartum(妈妈产后)/mama_nursing(妈妈哺乳)/appliance(电子电器)；"
                             "综合评分 0-10；必备/上架/CCC认证填 是/否，留空默认：必备=否、上架=是、CCC=否；"
                             "适用季节：spring(春)/summer(夏)/autumn(秋)/winter(冬)/all(全年)；# 开头说明行导入时自动忽略"])
        writer.writerow(sample)
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
            # v1.88.2 修复：字节流只读一次——此前 UTF-8 解码失败后第二次 read() 返回空流，
            # 导致 GBK/ANSI 编码文件（Excel 中文环境另存）静默导入 0 条
            raw = file.read()
            text = raw.decode("utf-8-sig")
        except Exception:
            try:
                text = raw.decode("gbk")
            except Exception:
                return Response(
                    {"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        raw_header, rows = _kb_read_csv_rows(text)
        header = _kb_normalize_header(raw_header, self.CN_HEADER_MAP)
        valid_categories = {c[0] for c in Product.FIRST_CATEGORY_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=False):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for row in rows:
            # v1.88.2 真实文件行号（含表头/说明行计数），报错可精确定位
            idx = row.get("__line__") or 0
            # v1.88.2 修复：行字典键为原始表头（中文），须按位置从原始键取值；
            # 此前用归一化后的英文键查询导致全部取空 → 每行报"缺少必填"，导入 0 条
            mapped = {header[i]: row.get(raw_header[i], "") for i in range(len(header))}
            name = (mapped.get("name") or "").strip()
            brand = (mapped.get("brand") or "").strip()
            if not name or not brand:
                errors.append(f"第{idx}行：缺少 商品名称 或 品牌")
                continue
            first_category = (mapped.get("first_category") or "").strip()
            if first_category not in valid_categories:
                errors.append(f"第{idx}行：无效的一级分类「{first_category}」")
                continue
            try:
                overall = float(mapped.get("overall") or 0)
            except ValueError:
                overall = 0
            try:
                price_avg = float(mapped.get("price_avg") or 0)
            except ValueError:
                price_avg = 0
            try:
                age_start = int(mapped.get("applicable_age_start")) if mapped.get("applicable_age_start") else None
            except ValueError:
                age_start = None
            try:
                age_end = int(mapped.get("applicable_age_end")) if mapped.get("applicable_age_end") else None
            except ValueError:
                age_end = None
            # v1.88.1 自动关联品牌库：同名品牌档案存在时建立关联
            brand_profile = BrandProfile.objects.filter(name=brand).first()
            Product.objects.create(
                name=name,
                brand=brand,
                brand_profile=brand_profile,
                model=(mapped.get("model") or "").strip(),
                first_category=first_category,
                second_category=(mapped.get("second_category") or "默认").strip(),
                image_url=(mapped.get("image_url") or "").strip() or f"https://placehold.co/300x300/fef3c7/f97316?text={name[:4]}",
                description=(mapped.get("description") or "").strip(),
                overall_rating=overall,
                price_info={"avg": price_avg, "range": (mapped.get("price_range") or str(price_avg)).strip()},
                is_essential=_yn(mapped.get("is_essential")),
                is_active=_yn(mapped.get("is_active"), True),
                has_ccc_certification=_yn(mapped.get("has_ccc_certification")),
                safety_alert=(mapped.get("safety_alert") or "").strip(),
                applicable_age_start=age_start,
                applicable_age_end=age_end,
                applicable_season=(mapped.get("applicable_season") or "all").strip() or "all",
            )
            created += 1
        # v1.88.2 统一导入响应：汇总文案附首条失败原因，并补齐此前缺失的审计落库
        return _kb_import_result(request, "商品", "product", created, errors)


# ============ 品牌 ============

class BrandViewSet(viewsets.ModelViewSet):
    serializer_class = BrandProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # v1.88.1 前台一律只显示有效品牌（含管理员）；仅管理场景（with_inactive=1 且有权限）可见全部
        params = _kb_params(self)
        can_manage = _is_admin(self.request.user) or has_permission(self.request.user, "menu_admin_products_manage")
        if params.get("with_inactive") == "1" and can_manage:
            qs = BrandProfile.objects.all()
        elif self.action not in ("list", "retrieve"):
            # v1.88.1 写操作（编辑/删除/重新启用停用品牌）不受有效过滤限制
            qs = BrandProfile.objects.all()
        else:
            qs = BrandProfile.objects.filter(is_active=True)
        # v1.88.1 品牌名搜索（品牌库管理页用）
        search = params.get("search")
        if search:
            qs = qs.filter(models.Q(name__icontains=search) | models.Q(name_en__icontains=search))
        return qs.order_by("id")

    def get_permissions(self):
        """v1.88 安全收口：品牌写操作仅限管理员（此前任何登录用户均可创建/修改/删除品牌）"""
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "knowledge_create", "新增品牌", "brand", obj.id, obj.name, f"新增品牌【{obj.name}】")

    def perform_update(self, serializer):
        obj = serializer.save()
        audit(self.request, "knowledge_update", "编辑品牌", "brand", obj.id, obj.name, f"修改品牌【{obj.name}】(#{obj.id})")

    def perform_destroy(self, instance):
        audit(self.request, "knowledge_delete", "删除品牌", "brand", instance.id, instance.name, f"删除品牌【{instance.name}】(#{instance.id})")
        instance.delete()


# ============ 待产包 ============

class ShoppingListViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShoppingList.objects.filter(user=self.request.user).prefetch_related("items", "items__product")

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "shopping_list_create", "您暂无「新建清单」的权限，请联系管理员开启")
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "shopping_list_update", "您暂无「修改清单」的权限，请联系管理员开启")
        serializer.save()

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "shopping_list_delete", "您暂无「删除清单」的权限，请联系管理员开启")
        instance.delete()

    @action(detail=False, methods=["post"])
    def generate(self, request):
        check_permission_or_403(request.user, "shopping_list_create", "您暂无「生成清单」的权限，请联系管理员开启")
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
    """待产包参考物品 — 所有用户可读，管理员或被授权用户（kb_shopping_manage）可写"""
    serializer_class = BabyShoppingItemSerializer
    permission_classes = [IsAuthenticated]
    kb_manage_perm = "kb_shopping_manage"
    kb_view_perm = "kb_shopping_view"

    def get_queryset(self):
        # v1.88.1 前台展示（list/retrieve）只显示启用条目（含管理员）；写操作放行（停用条目可编辑/删除/重新启用）
        if self.action not in ("list", "retrieve") or _kb_can_see_inactive(self):
            qs = BabyShoppingItem.objects.all()
        else:
            qs = BabyShoppingItem.objects.filter(is_active=True)
        qs = qs.order_by("owner", "sort_order", "id")
        # 筛选参数（兼容 GET/POST）
        params = _kb_params(self)
        owner = params.get("owner")
        if owner:
            qs = qs.filter(owner=owner)
        category = params.get("category")
        if category:
            qs = qs.filter(category=category)
        keyword = params.get("keyword")
        if keyword:
            qs = qs.filter(models.Q(name__icontains=keyword) | models.Q(remark__icontains=keyword))
        # v1.88 知识库管理：启用状态筛选（仅管理接口有效）
        status_filter = params.get("status")
        if status_filter in ("active", "inactive") and _kb_can_see_inactive(self):
            qs = qs.filter(is_active=(status_filter == "active"))
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "batch"):
            return [KbWritePermission()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "create", "待产包预置物品", "baby_shopping", obj, f"新增预置物品【{obj.name}】(归属 {obj.get_owner_display()})")

    def perform_update(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "update", "待产包预置物品", "baby_shopping", obj, f"修改预置物品【{obj.name}】(#{obj.id})")

    def perform_destroy(self, instance):
        _kb_write_audit(self.request, "delete", "待产包预置物品", "baby_shopping", instance, f"删除预置物品【{instance.name}】(#{instance.id})")
        instance.delete()

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """v1.88 批量操作：delete / active / inactive"""
        return _kb_batch_action(request, BabyShoppingItem.objects.all(), "待产包预置物品", "baby_shopping", get_name=lambda x: x.name)

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
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = max(1, min(100, int(request.query_params.get("page_size", 10))))
        except (TypeError, ValueError):
            page_size = 10
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

    # ===== v1.57 数据合理性校验：测量类记录同日唯一（妈妈 prenatal_exam / 宝宝 growth_measurement；疫苗同日可多剂不查重）=====
    UNIQUE_DATE_TYPES = ("prenatal_exam", "growth_measurement")

    def _find_same_day_record(self, user, record_type, record_date, mother=None, baby=None):
        """查找同日同类型已有记录（按单个妈妈或单个宝宝维度严格物理隔离，历史脏数据同日多条时取创建时间最新的一条）"""
        if record_type not in self.UNIQUE_DATE_TYPES or not record_date:
            return None
        qs = HealthRecord.objects.filter(user=user, record_type=record_type, record_date=record_date)
        if record_type == "prenatal_exam" and mother:
            qs = qs.filter(mother=mother)
        elif record_type == "growth_measurement" and baby:
            qs = qs.filter(baby=baby)
        return qs.order_by("-created_at").first()

    @staticmethod
    def _conflict_payload(existing):
        """409 冲突响应：透出当日已有记录摘要，供前端展示与覆盖决策"""
        items = existing.exam_items if isinstance(existing.exam_items, dict) else {}
        stage = items.get("stage") or ("pregnancy" if existing.gestational_week else "pregnancy")
        return {
            "conflict": True,
            "conflict_code": 4090,
            "existing_id": existing.id,
            "existing_date": str(existing.record_date),
            "existing_stage": stage,
            "existing_weight": existing.weight,
            "existing_height": existing.height,
            "overwrite_supported": True,
        }

    def create(self, request, *args, **kwargs):
        """新增记录入口：同日唯一性校验 + 阶段合理性校验（按单个妈妈隔离）"""
        record_type = request.data.get("record_type")
        record_date = request.data.get("record_date")

        target_mother = None
        if record_type == "prenatal_exam":
            from apps.core.models.mother import MotherProfile
            mother_id = request.data.get("mother_id") or request.data.get("mother")
            if mother_id:
                target_mother = MotherProfile.objects.filter(id=mother_id, user=request.user).first()
            if not target_mother:
                target_mother = MotherProfile.objects.filter(user=request.user, is_primary=True).first() or MotherProfile.objects.filter(user=request.user).first()

            if record_date:
                from datetime import datetime
                try:
                    rec_date_obj = datetime.strptime(record_date, "%Y-%m-%d").date() if isinstance(record_date, str) else record_date
                except Exception:
                    rec_date_obj = None

                if rec_date_obj:
                    exam_items = request.data.get("exam_items") or {}
                    if isinstance(exam_items, str):
                        import json
                        try:
                            exam_items = json.loads(exam_items)
                        except Exception:
                            exam_items = {}
                    stage = exam_items.get("stage") or request.data.get("stage_type") or request.data.get("stage")
                    gw = request.data.get("gestational_week") or exam_items.get("gestational_week")
                    gd = exam_items.get("gestational_days")
                    if not stage:
                        stage = "pregnancy" if gw else "general"
                    try:
                        gw_int = int(gw) if gw is not None else None
                    except (ValueError, TypeError):
                        gw_int = None
                    try:
                        gd_int = int(gd) if gd is not None else None
                    except (ValueError, TypeError):
                        gd_int = None
                    try:
                        pm_int = int(exam_items.get("postpartum_months")) if exam_items.get("postpartum_months") is not None else None
                    except (ValueError, TypeError):
                        pm_int = None

                    existing = self._find_same_day_record(request.user, record_type, record_date, mother=target_mother)
                    from apps.core.services.stage_validator import validate_stage_transition
                    is_st_ok, st_msg = validate_stage_transition(
                        user=request.user,
                        record_date=rec_date_obj,
                        stage_type=stage,
                        gestational_week=gw_int,
                        gestational_days=gd_int,
                        postpartum_months=pm_int,
                        mother=target_mother,
                        exclude_record_id=existing.id if existing else None,
                    )
                    if not is_st_ok:
                        return Response(
                            {"code": 4005, "message": st_msg, "data": None},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

        target_baby = None
        if record_type in ("growth_measurement", "vaccination", "illness"):
            from apps.core.models.baby import BabyProfile
            baby_id = request.data.get("baby_id") or request.data.get("baby")
            if baby_id:
                target_baby = BabyProfile.objects.filter(id=baby_id, user=request.user).first()
            if not target_baby:
                target_baby = BabyProfile.objects.filter(user=request.user, is_primary=True).first() or BabyProfile.objects.filter(user=request.user).first()

        if record_type and record_date:
            existing = self._find_same_day_record(request.user, record_type, record_date, mother=target_mother, baby=target_baby)
            if existing:
                if not bool(request.data.get("overwrite", False)):
                    return Response(
                        {
                            "code": 4090,
                            "message": f"{record_date} 当日已有该类型记录，确认覆盖后可更新当日数据",
                            "data": self._conflict_payload(existing),
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                # 用户已确认覆盖：原地更新当日记录（保留记录 id 与创建时间）
                serializer = self.get_serializer(existing, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                self.perform_update(serializer)
                return Response(
                    {
                        "code": 0,
                        "message": "已覆盖更新当日记录",
                        "data": serializer.data,
                    }
                )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        check_permission_or_403(self.request.user, "health_record_create", "您暂无「添加健康记录」的权限，请联系管理员开启")
        record_type = serializer.validated_data.get("record_type") or self.request.data.get("record_type")
        extra_kwargs = {"user": self.request.user}
        if record_type == "prenatal_exam" and not serializer.validated_data.get("mother"):
            from apps.core.models.mother import MotherProfile
            mother_id = self.request.data.get("mother_id") or self.request.data.get("mother")
            target_mother = None
            if mother_id:
                target_mother = MotherProfile.objects.filter(id=mother_id, user=self.request.user).first()
            if not target_mother:
                target_mother = MotherProfile.objects.filter(user=self.request.user, is_primary=True).first() or MotherProfile.objects.filter(user=self.request.user).first()
            if target_mother:
                extra_kwargs["mother"] = target_mother

        if record_type in ("growth_measurement", "vaccination", "illness") and not serializer.validated_data.get("baby"):
            from apps.core.models.baby import BabyProfile
            baby_id = self.request.data.get("baby_id") or self.request.data.get("baby")
            target_baby = None
            if baby_id:
                target_baby = BabyProfile.objects.filter(id=baby_id, user=self.request.user).first()
            if not target_baby:
                target_baby = BabyProfile.objects.filter(user=self.request.user, is_primary=True).first() or BabyProfile.objects.filter(user=self.request.user).first()
            if target_baby:
                extra_kwargs["baby"] = target_baby

        rec = serializer.save(**extra_kwargs)
        audit(self.request, "health_record_create", "添加健康记录", "health", rec.id, rec.record_type, f"记录类型: {rec.record_type}")

    def perform_update(self, serializer):
        check_permission_or_403(self.request.user, "health_record_update", "您暂无「修改健康记录」的权限，请联系管理员开启")
        rec = serializer.save()
        audit(self.request, "health_record_update", "修改健康记录", "health", rec.id, rec.record_type, f"修改记录 #{rec.id}")

    def perform_destroy(self, instance):
        check_permission_or_403(self.request.user, "health_record_delete", "您暂无「删除健康记录」的权限，请联系管理员开启")
        audit(self.request, "health_record_delete", "删除健康记录", "health", instance.id, instance.record_type, f"删除记录 #{instance.id}")
        instance.delete()

    # ===== v1.57 批量删除（单事务 + 逐条审计 + 权限校验，仅删除本人记录） =====
    @action(detail=False, methods=["post"], url_path="batch-delete")
    def batch_delete(self, request):
        check_permission_or_403(request.user, "health_record_delete", "您暂无「删除健康记录」的权限，请联系管理员开启")
        ids = request.data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return Response(
                {"code": 4001, "message": "ids 必须为非空数组", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 清洗为正整数并去重，单次上限 200 条防御误操作
        clean_ids = []
        for i in ids:
            try:
                v = int(i)
                if v > 0 and v not in clean_ids:
                    clean_ids.append(v)
            except (TypeError, ValueError):
                continue
        if not clean_ids:
            return Response(
                {"code": 4001, "message": "ids 中没有有效记录编号", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(clean_ids) > 200:
            return Response(
                {"code": 4002, "message": "单次最多删除 200 条记录，请分批操作", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from django.db import transaction

        deleted_count = 0
        skipped = []
        with transaction.atomic():
            targets = HealthRecord.objects.filter(user=request.user, id__in=clean_ids)
            for rec in targets:
                audit(request, "health_record_delete", "批量删除健康记录", "health", rec.id, rec.record_type, f"批量删除记录 #{rec.id}")
                rec.delete()
                deleted_count += 1
            skipped = [i for i in clean_ids if not HealthRecord.objects.filter(id=i).exists()]
        return Response(
            {
                "code": 0,
                "message": f"已删除 {deleted_count} 条记录",
                "data": {"deleted": deleted_count, "skipped": skipped},
            }
        )

    # ===== v1.57 CSV 健康数据批量导入（妈妈体重打卡 / 宝宝生长测量，冲突策略 skip|overwrite） =====
    @action(detail=False, methods=["post"], url_path="batch-import")
    def batch_import(self, request):
        check_permission_or_403(request.user, "health_record_create", "您暂无「添加健康记录」的权限，请联系管理员开启")
        from django.utils import timezone

        records = request.data.get("records") or []
        target = request.data.get("target", "mom")  # mom | mom_bmi | mom_vitals | baby
        if target in ("mom_bmi", "mom_vitals"):
            target = "mom"
        strategy = request.data.get("conflict_strategy", "skip")  # skip | overwrite
        stage_mode = request.data.get("stage_mode", "keep_csv")  # convert_to_profile | keep_csv
        allow_cross_stage = bool(request.data.get("allow_cross_stage", False)) or (stage_mode == "keep_csv")
        if target not in ("mom", "baby"):
            return Response(
                {"code": 4001, "message": "target 仅支持 mom（妈妈体重打卡）或 baby（宝宝生长测量）", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if strategy not in ("skip", "overwrite"):
            return Response(
                {"code": 4002, "message": "conflict_strategy 仅支持 skip（跳过冲突）或 overwrite（覆盖当日已有记录）", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(records, list) or not records:
            return Response(
                {"code": 4003, "message": "records 必须为非空数组（由前端解析 CSV 后逐行传入）", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(records) > 500:
            return Response(
                {"code": 4004, "message": "单次最多导入 500 条记录，请分批导入", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.localdate()
        user = request.user
        # 宽松防呆边界（仅拒绝明显脏数据，不限制正常特殊值）
        MOM_RANGE = {"weight": (25.0, 250.0), "height": (80.0, 250.0), "waist": (30.0, 220.0)}
        BABY_RANGE = {"height": (20.0, 200.0), "weight": (0.2, 60.0), "head": (20.0, 80.0)}

        created, updated, skipped, corrected, errors = 0, 0, 0, 0, []

        from apps.core.models.mother import MotherProfile
        mother_id = request.data.get("mother_id")
        target_mother = None
        if mother_id:
            target_mother = MotherProfile.objects.filter(id=mother_id, user=user).first()
        if not target_mother and target == "mom":
            target_mother = MotherProfile.objects.filter(user=user, is_primary=True).first() or MotherProfile.objects.filter(user=user).first()

        # 妈妈：身高与孕前体重从最近一条打卡记录继承（批量导入免填，减少列数）
        last_mom_qs = HealthRecord.objects.filter(user=user, record_type="prenatal_exam")
        if target_mother:
            last_mom_qs = last_mom_qs.filter(mother=target_mother)
        last_mom = last_mom_qs.order_by("-record_date", "-created_at").first()
        inherit_height = last_mom.height if last_mom else None
        inherit_pre_weight = (
            last_mom.exam_items.get("pre_weight")
            if last_mom and isinstance(last_mom.exam_items, dict)
            else None
        )

        for idx, row in enumerate(records, start=1):
            def _fail(reason):
                errors.append({"row": idx, "date": row.get("date", ""), "reason": reason})

            raw_date = str(row.get("date") or "").strip()
            try:
                from datetime import datetime as _dt

                rec_date = _dt.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                _fail("日期格式错误（应为 YYYY-MM-DD）")
                continue
            if rec_date > today:
                _fail("日期不能晚于今天")
                continue

            def _to_float(val):
                if val is None or str(val).strip() == "":
                    return None
                try:
                    return round(float(str(val).strip()), 2)
                except (TypeError, ValueError):
                    return None

            target_baby = None
            if target == "baby":
                from apps.core.models.baby import BabyProfile
                baby_id = request.data.get("baby_id") or request.data.get("baby")
                if baby_id:
                    target_baby = BabyProfile.objects.filter(id=baby_id, user=user).first()
                if not target_baby:
                    target_baby = BabyProfile.objects.filter(user=user, is_primary=True).first() or BabyProfile.objects.filter(user=user).first()
            existing = self._find_same_day_record(user, "prenatal_exam" if target == "mom" else "growth_measurement", rec_date, mother=target_mother, baby=target_baby)
            if existing and strategy == "skip":
                skipped += 1
                continue

            try:
                if target == "mom":
                    from apps.core.services.vitals_calculator import VitalsCalculator
                    weight = _to_float(row.get("weight"))
                    sbp = _to_float(row.get("systolic_bp") or row.get("systolic") or row.get("sbp"))
                    dbp = _to_float(row.get("diastolic_bp") or row.get("diastolic") or row.get("dbp"))
                    pulse = _to_float(row.get("pulse") or row.get("heart_rate"))
                    blood_sugar = _to_float(row.get("blood_sugar") or row.get("glucose") or row.get("sugar"))
                    raw_gtype = str(row.get("glucose_type") or row.get("scene") or "").strip().lower()
                    gtype_map = {
                        "fasting": "fasting", "空腹": "fasting",
                        "postprandial_1h": "postprandial_1h", "餐后1小时": "postprandial_1h", "餐后1h": "postprandial_1h",
                        "postprandial_2h": "postprandial_2h", "餐后2小时": "postprandial_2h", "餐后2h": "postprandial_2h", "餐后": "postprandial_2h",
                        "bedtime": "bedtime", "睡前": "bedtime",
                        "random": "random", "随机": "random",
                    }
                    glucose_type = gtype_map.get(raw_gtype, "fasting")

                    has_bp = (sbp is not None and dbp is not None)
                    has_glu = (blood_sugar is not None)
                    has_w = (weight is not None)

                    if not (has_bp or has_glu or has_w):
                        _fail("每行记录至少需包含体重、血压（收缩压与舒张压）或血糖中的一项有效数据。")
                        continue

                    if (sbp is not None and dbp is None) or (sbp is None and dbp is not None):
                        _fail("血压记录必须同时包含收缩压（高压）与舒张压（低压）。")
                        continue
                    if has_bp:
                        if not (50.0 <= sbp <= 260.0 and 30.0 <= dbp <= 180.0):
                            _fail("血压数值超出合理医学范围（收缩压50~260，舒张压30~180 mmHg）。")
                            continue
                        if sbp <= dbp:
                            _fail("收缩压（高压）必须大于舒张压（低压）。")
                            continue

                    if has_glu:
                        if not (1.0 <= blood_sugar <= 35.0):
                            _fail("血糖数值超出合理医学范围（1.0~35.0 mmol/L）。")
                            continue

                    if has_w:
                        if not (MOM_RANGE["weight"][0] <= weight <= MOM_RANGE["weight"][1]):
                            _fail(f"体重数值无效（合理防呆范围 {MOM_RANGE['weight'][0]}~{MOM_RANGE['weight'][1]} kg）")
                            continue

                    height = _to_float(row.get("height")) or inherit_height
                    waist = _to_float(row.get("waist"))
                    if waist is not None and not (MOM_RANGE["waist"][0] <= waist <= MOM_RANGE["waist"][1]):
                        _fail("腹围数值超出防呆范围")
                        continue
                    if height is not None and not (MOM_RANGE["height"][0] <= height <= MOM_RANGE["height"][1]):
                        height = inherit_height
                    stage_raw = str(row.get("stage") or "").strip().lower()
                    stage_map = {
                        "pregnancy": "pregnancy", "孕期": "pregnancy", "全孕期": "pregnancy", "怀孕中": "pregnancy", "孕": "pregnancy",
                        "postpartum": "postpartum", "产后": "postpartum", "产后恢复": "postpartum", "恢复期": "postpartum",
                        "general": "general", "非孕期": "general", "备孕": "general", "日常": "general",
                        "": None,
                    }
                    stage = stage_map.get(stage_raw)
                    if stage is None and stage_raw:
                        if "孕" in stage_raw:
                            stage = "pregnancy"
                        elif "产后" in stage_raw:
                            stage = "postpartum"
                        elif "非" in stage_raw or "备" in stage_raw:
                            stage = "general"

                    if stage is None:
                        # 未显式指定阶段：按档案智能回推（孕期中→pregnancy；宝宝已出生→postpartum；其余→general）
                        if getattr(user, "is_pregnant", None) is True:
                            stage = "pregnancy"
                        elif getattr(user, "due_date", None) and not getattr(user, "baby_birthday", None):
                            stage = "pregnancy"
                        elif getattr(user, "baby_birthday", None):
                            stage = "postpartum"
                        else:
                            stage = "general"

                    gestational_week = None
                    gestational_days = None
                    auto_postpartum_months = None
                    fix_explanation = ""

                    if stage == "pregnancy":
                        from apps.core.services.gestation_engine import resolve_and_fix_gestational_week
                        final_wk, final_days, is_fixed, fix_msg = resolve_and_fix_gestational_week(
                            user=user,
                            record_date=rec_date,
                            input_week=_to_float(row.get("week")),
                            mother=target_mother,
                            batch_records=records,
                        )
                        if final_wk is not None:
                            gestational_week = final_wk
                            gestational_days = final_days
                            if is_fixed:
                                corrected += 1
                                fix_explanation = fix_msg
                        else:
                            _fail("未检测到预产期或有效孕周锚点，无法自动推算孕周，请先在档案中设置预产期或在 CSV 中填写 week（孕周）列")
                            continue

                    # 校验阶段合理性（按单个妈妈维度隔离拦截冲突行）
                    from apps.core.services.stage_validator import validate_stage_transition
                    is_st_ok, st_msg = validate_stage_transition(
                        user=user,
                        record_date=rec_date,
                        stage_type=stage,
                        gestational_week=gestational_week,
                        gestational_days=gestational_days,
                        postpartum_months=auto_postpartum_months,
                        mother=target_mother,
                        exclude_record_id=existing.id if existing else None,
                        allow_cross_stage=allow_cross_stage,
                    )
                    if not is_st_ok:
                        _fail(st_msg)
                        continue
                    elif stage == "postpartum":
                        # 产后阶段：如果未填 postpartum_months，尝试根据宝宝生日自动推算
                        baby_b = getattr(user, "baby_birthday", None)
                        if not baby_b:
                            from apps.core.models.baby import BabyProfile
                            born_baby = BabyProfile.objects.filter(user=user, is_born=True).order_by("-is_primary", "-id").first()
                            if born_baby and born_baby.birthday:
                                baby_b = born_baby.birthday
                        if baby_b and rec_date >= baby_b:
                            auto_postpartum_months = max(0, int((rec_date - baby_b).days / 30.44))

                    bmi_val = None
                    if height and weight:
                        bmi_val = round(weight / ((height / 100.0) ** 2), 2)

                    bp_eval = VitalsCalculator.evaluate_blood_pressure(sbp, dbp, pulse, stage_type=stage) if has_bp else None
                    glu_eval = VitalsCalculator.evaluate_blood_sugar(blood_sugar, glucose_type, stage_type=stage) if has_glu else None

                    existing_items = (existing.exam_items if existing and isinstance(existing.exam_items, dict) else {})
                    effective_sbp = sbp if has_bp else existing_items.get("systolic_bp")
                    effective_dbp = dbp if has_bp else existing_items.get("diastolic_bp")
                    effective_pulse = pulse if pulse is not None else existing_items.get("pulse")
                    effective_glu = blood_sugar if has_glu else existing_items.get("blood_sugar")
                    effective_gtype = glucose_type if has_glu else existing_items.get("glucose_type", "fasting")

                    exam_items = dict(existing_items)
                    exam_items.update({
                        "stage": stage,
                        "waist_circumference": waist or existing_items.get("waist_circumference"),
                        "pre_weight": inherit_pre_weight or existing_items.get("pre_weight"),
                        "bmi": bmi_val or existing_items.get("bmi"),
                        "gestational_days": gestational_days if gestational_days is not None else existing_items.get("gestational_days"),
                        "systolic_bp": effective_sbp,
                        "diastolic_bp": effective_dbp,
                        "pulse": effective_pulse,
                        "bp_status": bp_eval["status"] if bp_eval else existing_items.get("bp_status"),
                        "bp_status_label": bp_eval["status_label"] if bp_eval else existing_items.get("bp_status_label"),
                        "blood_sugar": effective_glu,
                        "glucose_type": effective_gtype,
                        "glucose_type_label": glu_eval["glucose_type_label"] if glu_eval else existing_items.get("glucose_type_label"),
                        "glucose_status": glu_eval["status"] if glu_eval else existing_items.get("glucose_status"),
                        "glucose_status_label": glu_eval["status_label"] if glu_eval else existing_items.get("glucose_status_label"),
                    })
                    if stage == "postpartum" and auto_postpartum_months is not None:
                        exam_items["postpartum_months"] = auto_postpartum_months

                    completeness_data = {
                        "systolic_bp": exam_items.get("systolic_bp"),
                        "diastolic_bp": exam_items.get("diastolic_bp"),
                        "pulse": exam_items.get("pulse"),
                        "blood_sugar": exam_items.get("blood_sugar"),
                        "glucose_type": exam_items.get("glucose_type"),
                        "glucose_type_label": exam_items.get("glucose_type_label"),
                        "bp_status": exam_items.get("bp_status"),
                        "bp_status_label": exam_items.get("bp_status_label"),
                        "glucose_status": exam_items.get("glucose_status"),
                        "glucose_status_label": exam_items.get("glucose_status_label"),
                        "weight": weight if weight is not None else (existing.weight if existing else None),
                        "bmi": exam_items.get("bmi"),
                    }
                    exam_items["completeness"] = VitalsCalculator.build_metrics_completeness(completeness_data)

                    effective_weight = weight if weight is not None else (existing.weight if existing else None)
                    effective_height = height or (existing.height if existing else None)

                    if existing:
                        existing.gestational_week = gestational_week or existing.gestational_week
                        existing.height = effective_height
                        existing.weight = effective_weight
                        existing.exam_items = exam_items
                        existing.note = row.get("note") or existing.note
                        if target_mother and not existing.mother_id:
                            existing.mother = target_mother
                            existing.save(update_fields=["gestational_week", "height", "weight", "exam_items", "note", "mother", "updated_at"])
                        else:
                            existing.save(update_fields=["gestational_week", "height", "weight", "exam_items", "note", "updated_at"])
                        updated += 1
                        audit(request, "health_record_import", "批量导入覆盖健康记录", "health", existing.id, "prenatal_exam", f"CSV 导入覆盖 {rec_date}")
                    else:
                        stage_cn = "全孕期" if stage == "pregnancy" else "产后恢复" if stage == "postpartum" else "非孕期/备孕"
                        new_rec = HealthRecord.objects.create(
                            user=user,
                            mother=target_mother,
                            record_type="prenatal_exam",
                            record_date=rec_date,
                            gestational_week=gestational_week,
                            height=effective_height,
                            weight=effective_weight,
                            exam_items=exam_items,
                            note=row.get("note") or f"CSV 批量导入（{stage_cn}）",
                        )
                        created += 1
                        audit(request, "health_record_import", "批量导入健康记录", "health", new_rec.id, "prenatal_exam", f"CSV 导入 {rec_date}")
                else:
                    height = _to_float(row.get("height"))
                    weight = _to_float(row.get("weight"))
                    head = _to_float(row.get("head"))
                    if height is None and weight is None and head is None:
                        _fail("身高/体重/头围至少需要一项")
                        continue
                    # 逐项防呆校验（超出任一范围即整行报错跳过，不阻断后续行）
                    range_error = None
                    for label, val, rng in (
                        ("身高", height, BABY_RANGE["height"]),
                        ("体重", weight, BABY_RANGE["weight"]),
                        ("头围", head, BABY_RANGE["head"]),
                    ):
                        if val is not None and not (rng[0] <= val <= rng[1]):
                            range_error = f"{label}数值超出防呆范围 {rng[0]}~{rng[1]}"
                            break
                    if range_error:
                        _fail(range_error)
                        continue
                    baby_age_days = None
                    baby_birthday = getattr(user, "baby_birthday", None)
                    if baby_birthday:
                        baby_age_days = (rec_date - baby_birthday).days
                    if existing:
                        existing.height = height or existing.height
                        existing.weight = weight or existing.weight
                        existing.head_circumference = head or existing.head_circumference
                        existing.baby_age_days = baby_age_days or existing.baby_age_days
                        existing.note = row.get("note") or existing.note
                        if target_baby and not existing.baby_id:
                            existing.baby = target_baby
                            existing.save(update_fields=["height", "weight", "head_circumference", "baby_age_days", "note", "baby", "updated_at"])
                        else:
                            existing.save(update_fields=["height", "weight", "head_circumference", "baby_age_days", "note", "updated_at"])
                        updated += 1
                        audit(request, "health_record_import", "批量导入覆盖健康记录", "health", existing.id, "growth_measurement", f"CSV 导入覆盖 {rec_date}")
                    else:
                        new_rec = HealthRecord.objects.create(
                            user=user,
                            baby=target_baby,
                            record_type="growth_measurement",
                            record_date=rec_date,
                            height=height,
                            weight=weight,
                            head_circumference=head,
                            baby_age_days=baby_age_days,
                            note=row.get("note") or "CSV 批量导入（宝宝生长测量）",
                        )
                        created += 1
                        audit(request, "health_record_import", "批量导入健康记录", "health", new_rec.id, "growth_measurement", f"CSV 导入 {rec_date}")
            except Exception as exc:  # 单行异常不阻断整体导入
                _fail(f"写入失败：{exc}")
                continue

        audit(
            request,
            "health_record_import",
            "健康数据 CSV 批量导入",
            "health",
            0,
            target,
            f"导入完成：新增 {created}，覆盖 {updated}，跳过 {skipped}，失败 {len(errors)}",
        )
        return Response(
            {
                "code": 0,
                "message": f"导入完成：新增 {created} 条，覆盖 {updated} 条，跳过 {skipped} 条，自动识别/校正孕周 {corrected} 条，失败 {len(errors)} 条",
                "data": {"created": created, "updated": updated, "skipped": skipped, "corrected": corrected, "errors": errors[:50]},
            }
        )


def _build_bmi_timeseries(user, mother_id=None):
    """构建妈妈时序测量打卡历史（仅 prenatal_exam，含孕期/产后阶段标记与达标状态），供 BMI 图表看板与历史数据表复用"""
    from apps.core.models.health import HealthRecord
    timeseries_history = []
    try:
        user_records = HealthRecord.objects.filter(
            user=user,
            record_type="prenatal_exam",
        ).exclude(weight__isnull=True)
        if mother_id:
            user_records = user_records.filter(mother_id=mother_id)
        else:
            from apps.core.models.mother import MotherProfile
            pri_mom = MotherProfile.objects.filter(user=user, is_primary=True).first()
            if pri_mom:
                pri_qs = user_records.filter(mother=pri_mom)
                if pri_qs.exists():
                    user_records = pri_qs
        user_records = user_records.order_by("record_date", "created_at")

        # 查找该用户历史最新有效身高与孕前基线体重（用于缺失记录自动继承基线）
        default_height = None
        default_pre_weight = None
        for r in user_records.reverse():
            if not default_height and r.height and r.height > 0:
                default_height = r.height
            items = r.exam_items if isinstance(r.exam_items, dict) else {}
            pw = items.get("pre_weight")
            if not default_pre_weight and pw and float(pw) > 0:
                default_pre_weight = float(pw)
            if default_height and default_pre_weight:
                break

        prev_w = None
        running_height = default_height
        running_pre_weight = default_pre_weight
        for r in user_records:
            delta = round(r.weight - prev_w, 2) if prev_w is not None else 0.0
            prev_w = r.weight
            items = r.exam_items if isinstance(r.exam_items, dict) else {}
            w_circum = items.get("waist_circumference")
            pre_weight = items.get("pre_weight")
            if pre_weight and float(pre_weight) > 0:
                running_pre_weight = float(pre_weight)
            effective_pre_weight = running_pre_weight

            if r.height and r.height > 0:
                running_height = r.height
            effective_height = running_height

            rec_bmi = round(r.weight / ((effective_height / 100.0) ** 2), 2) if (effective_height and effective_height > 0) else None
            cum_gain = round(r.weight - effective_pre_weight, 2) if (effective_pre_weight and effective_pre_weight > 0) else None
            # 阶段标记：新数据显式存 exam_items.stage；历史数据按孕周有无回推
            stage = items.get("stage") or ("pregnancy" if r.gestational_week else "pregnancy")
            timeseries_history.append({
                "id": r.id,
                "record_date": str(r.record_date),
                "record_type": r.record_type,
                "stage": stage,
                "gestational_week": r.gestational_week,
                # v1.58：孕x周x天粒度（历史无 days 的记录为 None，展示层降级为整周）
                "gestational_days": items.get("gestational_days"),
                "height": effective_height,
                "weight": r.weight,
                "waist_circumference": w_circum,
                "bmi": rec_bmi,
                "delta_kg": delta,
                "pre_weight": effective_pre_weight,
                "cumulative_gain": cum_gain,
                "gain_status": items.get("gain_status"),
                "is_twins": bool(items.get("is_twins", False)),
                "postpartum_months": items.get("postpartum_months"),
                "note": r.note,
                "ai_analysis": r.ai_analysis,
            })
    except Exception:
        pass
    return timeseries_history


class HealthBmiAnalysisView(APIView):
    """孕产妇体重/BMI 分析与个性化方案一键生成接口 (基于 WS/T 801-2022)"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        check_permission_or_403(request.user, "menu_health", "管理员已关闭「健康中心」页面访问，如有需要请联系管理员开启")
        # v1.57 权限补齐：时序拉取属于健康档案查看能力，需同时具备查看权限（原仅校验菜单级权限存在越权漏洞）
        check_permission_or_403(request.user, "health_record_view", "您暂无「查看健康档案」的权限，请联系管理员开启")
        mother_id = request.query_params.get("mother_id")
        return Response({
            "code": 0,
            "message": "获取成功",
            "data": {
                "timeseries": _build_bmi_timeseries(request.user, mother_id=mother_id),
            },
        })

    def post(self, request):
        check_permission_or_403(request.user, "menu_health", "管理员已关闭「健康中心」页面访问，如有需要请联系管理员开启")
        # v1.57 权限补齐：分析接口会自动归档写库，必须具备新增健康记录权限（原仅校验菜单级权限存在越权漏洞）
        check_permission_or_403(request.user, "health_record_create", "您暂无「添加健康记录」的权限，请联系管理员开启")
        from apps.core.serializers.health import BmiAnalysisInputSerializer
        from apps.core.services.medical_calculator import MedicalCalculator
        from apps.core.services.diet_recommendation_service import DietRecommendationService

        serializer = BmiAnalysisInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"code": 4001, "message": "输入参数有误", "data": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        from apps.core.services.gestation_engine import validate_gestational_week
        from apps.core.models.health import HealthRecord

        # ===== 基线自动补齐：身高与孕前体重可从最近一条妈妈记录继承（支持统一健康打卡轻量录入）=====
        from apps.core.models.mother import MotherProfile
        mother_id = request.data.get("mother_id")
        mother = None
        if mother_id:
            mother = MotherProfile.objects.filter(id=mother_id, user=request.user).first()
        if not mother:
            mother = MotherProfile.objects.filter(user=request.user, is_primary=True).first()

        stage_type = data.get("stage_type", "pregnancy")
        current_weight = data["current_weight_kg"]
        height_cm = data.get("height_cm")
        pre_weight = data.get("pre_pregnancy_weight_kg")
        last_mom_qs = HealthRecord.objects.filter(user=request.user, record_type="prenatal_exam")
        if mother:
            last_mom_qs = last_mom_qs.filter(mother=mother)
        last_mom_record = last_mom_qs.order_by("-record_date", "-created_at").first()
        if not height_cm and last_mom_record and last_mom_record.height:
            height_cm = last_mom_record.height
        if not pre_weight and last_mom_record and isinstance(last_mom_record.exam_items, dict):
            pre_weight = last_mom_record.exam_items.get("pre_weight")
        baseline_initialized = False
        if not pre_weight:
            # 首次打卡：以当前实测体重初始化孕前基线，后续打卡自动继承
            pre_weight = current_weight
            baseline_initialized = True
        if not height_cm:
            return Response(
                {"code": 4002, "message": "请填写身高（首次打卡需录入一次，之后将自动继承）", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ===== 孕周一致性校验引擎（孕期阶段专属；偏差 > 1 周直接拦截）=====
        target_date = data.get("record_date") or timezone.localdate()
        # ===== v1.57 同日唯一性校验：当日已有妈妈打卡时返回 409，前端弹窗确认后携 overwrite=true 覆盖更新 =====
        overwrite = bool(data.get("overwrite", False))
        existing_same_day_qs = HealthRecord.objects.filter(
            user=request.user, record_type="prenatal_exam", record_date=target_date
        )
        if mother:
            existing_same_day_qs = existing_same_day_qs.filter(mother=mother)
        existing_same_day = existing_same_day_qs.order_by("-created_at").first()
        if existing_same_day and not overwrite:
            existing_items = existing_same_day.exam_items if isinstance(existing_same_day.exam_items, dict) else {}
            # 与批次导出/记录接口保持一致：历史无 stage 的 prenatal_exam 按孕期回推
            existing_stage = existing_items.get("stage") or "pregnancy"
            return Response(
                {
                    "code": 4090,
                    "message": f"{target_date} 当日已有妈妈打卡记录，确认覆盖后将以本次数据更新当日记录",
                    "data": {
                        "conflict": True,
                        "conflict_code": 4090,
                        "existing_id": existing_same_day.id,
                        "existing_date": str(existing_same_day.record_date),
                        "existing_stage": existing_stage,
                        "existing_weight": existing_same_day.weight,
                        "existing_height": existing_same_day.height,
                        "overwrite_supported": True,
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )
        gestational_week = data.get("gestational_week")
        # v1.58：孕x周x天粒度——validate 透出周内天数（0~6）随记录存储；
        # 周+天输入：用户显式传 gestational_days 时优先采纳（周数仍经双基准校验），未传则用推算值
        user_input_days = data.get("gestational_days")
        gestational_days = 0
        gestation_check = {"week": None, "days": 0, "basis": "", "auto_filled": False, "hint": ""}
        if stage_type == "pregnancy":
            wk_check = validate_gestational_week(request.user, target_date, gestational_week, mother=mother)
            gestation_check = {
                "week": wk_check.get("week"),
                "days": wk_check.get("days"),
                "basis": wk_check.get("basis", ""),
                "auto_filled": wk_check.get("auto_filled", False),
                "hint": wk_check.get("hint", ""),
            }
            if not wk_check["ok"]:
                return Response(
                    {"code": 4003, "message": wk_check["hint"], "data": {"expected_week": wk_check.get("expected")}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if wk_check["week"] is None:
                return Response(
                    {"code": 4003, "message": "请填写当前孕周，或在「我的」档案中设置预产期以自动推算", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            gestational_week = wk_check["week"]
            if user_input_days is not None:
                # 用户输入的天数优先（前端 周+天 双输入框；超期孕40+N 场景仍由推算 days 表达）
                gestational_days = max(0, min(6, int(user_input_days)))
            else:
                gestational_days = int(wk_check.get("days") or 0)
            # 响应透出最终采纳的天数（供前端提示与历史回显一致）
            gestation_check["days"] = gestational_days
        else:
            gestational_week = None

        # 校验阶段类型合理性（按单个妈妈维度隔离拦截冲突数据）
        from apps.core.services.stage_validator import validate_stage_transition
        is_st_ok, st_msg = validate_stage_transition(
            user=request.user,
            record_date=target_date,
            stage_type=stage_type,
            gestational_week=gestational_week,
            gestational_days=gestational_days,
            postpartum_months=data.get("postpartum_months"),
            mother=mother,
            exclude_record_id=existing_same_day.id if existing_same_day else None,
        )
        if not is_st_ok:
            return Response(
                {"code": 4005, "message": st_msg, "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        evaluation = MedicalCalculator.evaluate_weight_gain(
            height_cm=height_cm,
            pre_pregnancy_weight_kg=pre_weight,
            current_weight_kg=current_weight,
            gestational_week=gestational_week,
            is_twins=data.get("is_twins", False),
            stage_type=stage_type,
            postpartum_months=data.get("postpartum_months"),
            medical_history=data.get("medical_history", []),
        )

        diet_plan = DietRecommendationService.build_personalized_diet_plan(
            gestational_week=gestational_week,
            stage_type=stage_type,
            bmi_category=evaluation.get("category", "normal"),
            medical_history=data.get("medical_history", []),
            actual_gain=evaluation.get("actual_gain", 0.0),
        )

        lifestyle_care = DietRecommendationService.get_lifestyle_and_care(
            gestational_week=gestational_week,
            stage_type=stage_type,
            medical_history=data.get("medical_history", []),
            bmi_category=evaluation.get("category", "normal"),
        )

        disclaimer = (
            "本评估与个性化方案依据国家卫生健康委《妊娠期妇女体重增长推荐值标准》(WS/T 801-2022)及中国营养学会《中国居民膳食指南》生成，"
            "仅供孕产期自我健康监测与营养科普参考，不能替代临床医生的个体化诊疗处方。"
            "若合并严重高血压、蛋白尿、剧烈腹痛、剧吐脱水或胎动异常，请立即前往正规医院产科就诊。"
        )

        created_record_id = None
        # 语义统一：妈妈记录一律 prenatal_exam，产后打卡以 exam_items.stage 标记（不再写入 growth_measurement）
        rec_type = "prenatal_exam"
        # v1.56：阶段语义归一化 pregnancy / postpartum / general（非孕期备孕·日常）
        stage_mark = {"postpartum": "postpartum", "general": "general"}.get(stage_type, "pregnancy")
        existing_items = (existing_same_day.exam_items if existing_same_day and isinstance(existing_same_day.exam_items, dict) else {})
        sbp = data.get("systolic_bp") if data.get("systolic_bp") is not None else existing_items.get("systolic_bp")
        dbp = data.get("diastolic_bp") if data.get("diastolic_bp") is not None else existing_items.get("diastolic_bp")
        pulse = data.get("pulse") if data.get("pulse") is not None else existing_items.get("pulse")
        glu = data.get("blood_sugar") if data.get("blood_sugar") is not None else existing_items.get("blood_sugar")
        glu_type = data.get("glucose_type") if data.get("blood_sugar") is not None else existing_items.get("glucose_type", "fasting")

        from apps.core.services.vitals_calculator import VitalsCalculator
        bp_eval = VitalsCalculator.evaluate_blood_pressure(sbp, dbp, pulse, stage_type=stage_mark) if (sbp is not None and dbp is not None) else None
        glu_eval = VitalsCalculator.evaluate_blood_sugar(glu, glu_type, stage_type=stage_mark) if glu is not None else None

        exam_items = dict(existing_items)
        exam_items.update({
            "stage": stage_mark,
            "waist_circumference": data.get("waist_circumference_cm") or existing_items.get("waist_circumference"),
            "pre_weight": pre_weight,
            "bmi": evaluation["bmi"],
            "actual_gain": evaluation["actual_gain"],
            "gain_status": evaluation.get("gain_status", "normal"),
            "is_twins": bool(data.get("is_twins", False)),
            "postpartum_months": data.get("postpartum_months"),
            "gestational_days": gestational_days if stage_mark == "pregnancy" else None,
            "systolic_bp": sbp,
            "diastolic_bp": dbp,
            "pulse": pulse,
            "bp_status": bp_eval["status"] if bp_eval else existing_items.get("bp_status"),
            "bp_status_label": bp_eval["status_label"] if bp_eval else existing_items.get("bp_status_label"),
            "blood_sugar": glu,
            "glucose_type": glu_type,
            "glucose_type_label": glu_eval["glucose_type_label"] if glu_eval else existing_items.get("glucose_type_label"),
            "glucose_status": glu_eval["status"] if glu_eval else existing_items.get("glucose_status"),
            "glucose_status_label": glu_eval["status_label"] if glu_eval else existing_items.get("glucose_status_label"),
        })
        completeness_data = {
            "systolic_bp": sbp, "diastolic_bp": dbp, "pulse": pulse,
            "blood_sugar": glu, "glucose_type": glu_type,
            "bp_status": exam_items.get("bp_status"), "bp_status_label": exam_items.get("bp_status_label"),
            "glucose_status": exam_items.get("glucose_status"), "glucose_status_label": exam_items.get("glucose_status_label"),
            "weight": current_weight, "bmi": evaluation["bmi"],
        }
        exam_items["completeness"] = VitalsCalculator.build_metrics_completeness(completeness_data)
        symptoms = data.get("symptoms", [])
        if symptoms:
            exam_items["symptoms"] = symptoms
        stage_prefix = (
            "非孕期" if stage_mark == "general" else "产后" if stage_mark == "postpartum"
            else f"孕{gestational_week}周{gestational_days}天" if gestational_days > 0 else f"孕{gestational_week}周"
        )
        note_text = (
            f"{stage_prefix}打卡："
            f"孕前BMI {evaluation['bmi']} ({evaluation['category_label']}), "
            f"累计增重 {evaluation['actual_gain']}kg ({evaluation.get('gain_status_label', '')})"
        )
        if sbp is not None and dbp is not None:
            note_text += f", 血压 {sbp}/{dbp} mmHg"
        if glu is not None:
            note_text += f", 血糖 {glu} mmol/L({glu_type})"
        user_custom_note = data.get("note")
        if user_custom_note:
            note_text += f" | {user_custom_note}"
        created_record_id = None
        # v1.57 record_action：created 首次归档 / updated 覆盖当日已有记录（保留记录 id 与创建时间）
        record_action = "created"
        try:
            if existing_same_day:
                existing_same_day.record_date = target_date
                existing_same_day.gestational_week = gestational_week
                existing_same_day.height = height_cm
                existing_same_day.weight = current_weight
                existing_same_day.exam_items = exam_items
                existing_same_day.note = note_text
                if mother:
                    existing_same_day.mother = mother
                existing_same_day.save(
                    update_fields=["record_date", "gestational_week", "height", "weight", "exam_items", "note", "mother", "updated_at"]
                )
                created_record_id = existing_same_day.id
                record_action = "updated"
            else:
                new_rec = HealthRecord.objects.create(
                    user=request.user,
                    mother=mother,
                    record_type=rec_type,
                    record_date=target_date,
                    gestational_week=gestational_week,
                    height=height_cm,
                    weight=current_weight,
                    exam_items=exam_items,
                    note=note_text,
                )
                created_record_id = new_rec.id
        except Exception:
            pass

        timeseries_history = _build_bmi_timeseries(request.user, mother_id=mother.id if mother else None)

        audit(
            request,
            "health_bmi_analyze",
            "孕产妇BMI与方案分析（覆盖当日记录）" if record_action == "updated" else "孕产妇BMI与方案分析",
            "health",
            created_record_id or 0,
            evaluation.get("category", ""),
            f"BMI: {evaluation['bmi']}, 状态: {evaluation.get('gain_status_label', '')}",
        )

        return Response({
            "code": 0,
            "message": "已覆盖更新当日打卡并重新生成评估" if record_action == "updated" else "分析成功",
            "data": {
                "evaluation": evaluation,
                "alerts": evaluation.get("alerts", []),
                "diet_plan": diet_plan,
                "lifestyle_advice": lifestyle_care,
                "disclaimer": disclaimer,
                "created_record_id": created_record_id,
                "record_action": record_action,
                "timeseries": timeseries_history,
                "gestation_check": gestation_check,
                "baseline_initialized": baseline_initialized,
            },
        })



# ============ 妈妈生命体征（血压、血糖）分析与时序看板 ============

def _build_vitals_timeseries(user, mother_id=None):
    """构建妈妈血压与血糖全生命周期时序打卡历史及统计指标看板"""
    from apps.core.models.health import HealthRecord
    from apps.core.services.vitals_calculator import VitalsCalculator
    from apps.core.models.mother import MotherProfile
    from django.utils import timezone
    from datetime import timedelta

    timeseries_history = []
    summary = {
        "total_records": 0,
        "latest_bp": None,
        "latest_glucose": None,
        "avg_systolic_7d": None,
        "avg_diastolic_7d": None,
        "avg_glucose_7d": None,
        "abnormal_count": 0,
    }

    try:
        user_records = HealthRecord.objects.filter(
            user=user,
            record_type="prenatal_exam",
        )
        if mother_id:
            user_records = user_records.filter(mother_id=mother_id)
        else:
            pri_mom = MotherProfile.objects.filter(user=user, is_primary=True).first()
            if pri_mom:
                pri_qs = user_records.filter(mother=pri_mom)
                if pri_qs.exists():
                    user_records = pri_qs
        user_records = list(user_records.order_by("record_date", "created_at"))

        seven_days_ago = timezone.localdate() - timedelta(days=7)
        systolic_list_7d = []
        diastolic_list_7d = []
        glucose_list_7d = []
        abnormal_count = 0
        latest_bp = None
        latest_glucose = None

        for r in user_records:
            items = r.exam_items if isinstance(r.exam_items, dict) else {}
            sbp = items.get("systolic_bp")
            dbp = items.get("diastolic_bp")
            pulse = items.get("pulse")
            glu = items.get("blood_sugar")
            raw_gtype = items.get("glucose_type", "fasting")
            stage = items.get("stage") or ("pregnancy" if r.gestational_week else "pregnancy")

            # 兼容既有脏数据中只有单项数值的情况
            has_bp = (sbp is not None and dbp is not None)
            has_glu = (glu is not None)
            has_w = (r.weight is not None)

            # 若该条记录既无血压也无血糖也无体重，则不作为生命体征有效时序
            if not (has_bp or has_glu or has_w):
                continue

            bp_eval = None
            if has_bp:
                bp_eval = VitalsCalculator.evaluate_blood_pressure(sbp, dbp, pulse, stage_type=stage)
                latest_bp = {
                    "id": r.id,
                    "record_date": str(r.record_date),
                    "systolic": sbp,
                    "diastolic": dbp,
                    "pulse": pulse,
                    "status": bp_eval["status"],
                    "status_label": bp_eval["status_label"],
                    "color": bp_eval["color"],
                    "severity": bp_eval["severity"],
                }
                if r.record_date >= seven_days_ago:
                    systolic_list_7d.append(sbp)
                    diastolic_list_7d.append(dbp)
                if bp_eval["status"] in ("elevated", "hypertension_stage1", "hypertension_severe"):
                    abnormal_count += 1

            glu_eval = None
            if has_glu:
                glu_eval = VitalsCalculator.evaluate_blood_sugar(glu, raw_gtype, stage_type=stage)
                latest_glucose = {
                    "id": r.id,
                    "record_date": str(r.record_date),
                    "glucose": glu,
                    "glucose_type": raw_gtype,
                    "glucose_type_label": glu_eval["glucose_type_label"],
                    "status": glu_eval["status"],
                    "status_label": glu_eval["status_label"],
                    "color": glu_eval["color"],
                    "severity": glu_eval["severity"],
                }
                if r.record_date >= seven_days_ago:
                    glucose_list_7d.append(glu)
                if glu_eval["status"] in ("elevated", "high", "hypoglycemia"):
                    abnormal_count += 1

            completeness_data = {
                "systolic_bp": sbp,
                "diastolic_bp": dbp,
                "pulse": pulse,
                "blood_sugar": glu,
                "glucose_type": raw_gtype,
                "glucose_type_label": glu_eval["glucose_type_label"] if glu_eval else items.get("glucose_type_label"),
                "bp_status": bp_eval["status"] if bp_eval else items.get("bp_status"),
                "bp_status_label": bp_eval["status_label"] if bp_eval else items.get("bp_status_label"),
                "glucose_status": glu_eval["status"] if glu_eval else items.get("glucose_status"),
                "glucose_status_label": glu_eval["status_label"] if glu_eval else items.get("glucose_status_label"),
                "weight": r.weight,
                "bmi": items.get("bmi"),
            }
            completeness = VitalsCalculator.build_metrics_completeness(completeness_data)

            timeseries_history.append({
                "id": r.id,
                "record_date": str(r.record_date),
                "stage": stage,
                "gestational_week": r.gestational_week,
                "gestational_days": items.get("gestational_days"),
                "postpartum_months": items.get("postpartum_months"),
                "systolic_bp": sbp,
                "diastolic_bp": dbp,
                "pulse": pulse,
                "bp_status": bp_eval["status"] if bp_eval else None,
                "bp_status_label": bp_eval["status_label"] if bp_eval else None,
                "bp_color": bp_eval["color"] if bp_eval else None,
                "bp_clinical_advice": bp_eval["clinical_advice"] if bp_eval else None,
                "blood_sugar": glu,
                "glucose_type": raw_gtype,
                "glucose_type_label": glu_eval["glucose_type_label"] if glu_eval else items.get("glucose_type_label"),
                "glucose_status": glu_eval["status"] if glu_eval else None,
                "glucose_status_label": glu_eval["status_label"] if glu_eval else None,
                "glucose_color": glu_eval["color"] if glu_eval else None,
                "glucose_clinical_advice": glu_eval["clinical_advice"] if glu_eval else None,
                "weight": r.weight,
                "height": r.height,
                "bmi": items.get("bmi"),
                "symptoms": items.get("symptoms", []),
                "completeness": completeness,
                "note": r.note,
                "ai_analysis": r.ai_analysis,
            })

        summary = {
            "total_records": len(timeseries_history),
            "latest_bp": latest_bp,
            "latest_glucose": latest_glucose,
            "avg_systolic_7d": round(sum(systolic_list_7d) / len(systolic_list_7d), 1) if systolic_list_7d else None,
            "avg_diastolic_7d": round(sum(diastolic_list_7d) / len(diastolic_list_7d), 1) if diastolic_list_7d else None,
            "avg_glucose_7d": round(sum(glucose_list_7d) / len(glucose_list_7d), 2) if glucose_list_7d else None,
            "abnormal_count": abnormal_count,
        }
    except Exception:
        pass

    return timeseries_history, summary


class HealthVitalsAnalysisView(APIView):
    """妈妈生命体征（血压、血糖）录入、医学评估与时序看板视图"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        check_permission_or_403(request.user, "menu_health", "管理员已关闭「健康中心」页面访问，如有需要请联系管理员开启")
        check_permission_or_403(request.user, "health_record_view", "您暂无「查看健康档案」的权限，请联系管理员开启")
        mother_id = request.query_params.get("mother_id")
        timeseries, summary = _build_vitals_timeseries(request.user, mother_id=mother_id)
        return Response({
            "code": 0,
            "message": "获取成功",
            "data": {
                "timeseries": timeseries,
                "summary": summary,
            },
        })

    def post(self, request):
        check_permission_or_403(request.user, "menu_health", "管理员已关闭「健康中心」页面访问，如有需要请联系管理员开启")
        check_permission_or_403(request.user, "health_record_create", "您暂无「添加健康记录」的权限，请联系管理员开启")
        from apps.core.serializers.health import VitalsAnalysisInputSerializer
        from apps.core.services.vitals_calculator import VitalsCalculator
        from apps.core.services.gestation_engine import validate_gestational_week
        from apps.core.services.stage_validator import validate_stage_transition
        from apps.core.models.health import HealthRecord
        from apps.core.models.mother import MotherProfile

        serializer = VitalsAnalysisInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"code": 4001, "message": "录入数据有误", "data": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data

        # 确定目标妈妈档案
        mother_id = data.get("mother_id") or request.data.get("mother_id")
        mother = None
        if mother_id:
            mother = MotherProfile.objects.filter(id=mother_id, user=request.user).first()
        if not mother:
            mother = MotherProfile.objects.filter(user=request.user, is_primary=True).first() or MotherProfile.objects.filter(user=request.user).first()

        stage_type = data.get("stage_type", "pregnancy")
        target_date = data.get("record_date") or timezone.localdate()
        overwrite = bool(data.get("overwrite", False))

        # 查重：同日记录冲突校验
        existing_same_day_qs = HealthRecord.objects.filter(
            user=request.user, record_type="prenatal_exam", record_date=target_date
        )
        if mother:
            existing_same_day_qs = existing_same_day_qs.filter(mother=mother)
        existing_same_day = existing_same_day_qs.order_by("-created_at").first()

        if existing_same_day and not overwrite:
            existing_items = existing_same_day.exam_items if isinstance(existing_same_day.exam_items, dict) else {}
            existing_stage = existing_items.get("stage") or ("pregnancy" if existing_same_day.gestational_week else "pregnancy")
            return Response(
                {
                    "code": 4090,
                    "message": f"{target_date} 已存在当日打卡记录，请确认是否合并覆盖更新",
                    "data": {
                        "conflict": True,
                        "conflict_code": 4090,
                        "existing_id": existing_same_day.id,
                        "existing_date": str(existing_same_day.record_date),
                        "existing_stage": existing_stage,
                        "existing_weight": existing_same_day.weight,
                        "existing_systolic": existing_items.get("systolic_bp"),
                        "existing_diastolic": existing_items.get("diastolic_bp"),
                        "existing_sugar": existing_items.get("blood_sugar"),
                        "overwrite_supported": True,
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        # 孕周与阶段验证
        gestational_week = data.get("gestational_week")
        user_input_days = data.get("gestational_days")
        gestational_days = 0
        if stage_type == "pregnancy":
            wk_check = validate_gestational_week(request.user, target_date, gestational_week, mother=mother)
            if not wk_check["ok"]:
                return Response(
                    {"code": 4003, "message": wk_check["hint"], "data": {"expected_week": wk_check.get("expected")}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            gestational_week = wk_check.get("week")
            if user_input_days is not None:
                gestational_days = max(0, min(6, int(user_input_days)))
            else:
                gestational_days = int(wk_check.get("days") or 0)
        else:
            gestational_week = None

        is_st_ok, st_msg = validate_stage_transition(
            user=request.user,
            record_date=target_date,
            stage_type=stage_type,
            gestational_week=gestational_week,
            gestational_days=gestational_days,
            postpartum_months=data.get("postpartum_months"),
            mother=mother,
            exclude_record_id=existing_same_day.id if existing_same_day else None,
        )
        if not is_st_ok:
            return Response(
                {"code": 4005, "message": st_msg, "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 提取指标并执行医学规则评估
        sbp = data.get("systolic_bp")
        dbp = data.get("diastolic_bp")
        pulse = data.get("pulse")
        blood_sugar = data.get("blood_sugar")
        glucose_type = data.get("glucose_type", "fasting")
        weight = data.get("current_weight_kg")
        height = data.get("height_cm")
        symptoms = data.get("symptoms", [])

        bp_eval = None
        if sbp is not None and dbp is not None:
            bp_eval = VitalsCalculator.evaluate_blood_pressure(sbp, dbp, pulse, stage_type=stage_type)

        glu_eval = None
        if blood_sugar is not None:
            glu_eval = VitalsCalculator.evaluate_blood_sugar(blood_sugar, glucose_type, stage_type=stage_type)

        bmi_val = None
        if weight and height:
            bmi_val = round(weight / ((height / 100.0) ** 2), 2)
        elif weight and existing_same_day and existing_same_day.height:
            bmi_val = round(weight / ((existing_same_day.height / 100.0) ** 2), 2)

        completeness_data = {
            "systolic_bp": sbp,
            "diastolic_bp": dbp,
            "pulse": pulse,
            "blood_sugar": blood_sugar,
            "glucose_type": glucose_type,
            "glucose_type_label": glu_eval["glucose_type_label"] if glu_eval else None,
            "bp_status": bp_eval["status"] if bp_eval else None,
            "bp_status_label": bp_eval["status_label"] if bp_eval else None,
            "glucose_status": glu_eval["status"] if glu_eval else None,
            "glucose_status_label": glu_eval["status_label"] if glu_eval else None,
            "weight": weight if weight is not None else (existing_same_day.weight if existing_same_day else None),
            "bmi": bmi_val,
        }
        completeness = VitalsCalculator.build_metrics_completeness(completeness_data)

        # 生成医学警戒与个性化调理建议
        alerts = VitalsCalculator.detect_vitals_alerts(
            bp_eval=bp_eval,
            glucose_eval=glu_eval,
            symptoms=symptoms,
            stage_type=stage_type,
        )
        lifestyle_diet = VitalsCalculator.get_lifestyle_and_diet_recommendations(
            bp_eval=bp_eval,
            glucose_eval=glu_eval,
            stage_type=stage_type,
        )

        # 构造 AI 解读上下文并调用
        ai_result = None
        request_ai = data.get("request_ai", True)
        recent_history, _ = _build_vitals_timeseries(request.user, mother_id=mother.id if mother else None)

        if request_ai:
            from apps.core.services.ai_service import ai_analyze_vitals
            stage_display = (
                f"孕{gestational_week}周{gestational_days}天" if stage_type == "pregnancy" and gestational_days > 0
                else f"孕{gestational_week}周" if stage_type == "pregnancy"
                else f"产后{data.get('postpartum_months', 1)}个月" if stage_type == "postpartum"
                else "备孕期/常规阶段"
            )
            vitals_context = {
                "bp_eval": bp_eval,
                "glucose_eval": glu_eval,
                "completeness": completeness,
                "symptoms": symptoms,
                "history_trend": [
                    {
                        "record_date": h["record_date"],
                        "systolic": h["systolic_bp"],
                        "diastolic": h["diastolic_bp"],
                        "blood_sugar": h["blood_sugar"],
                        "glucose_type": h.get("glucose_type_label", ""),
                    }
                    for h in recent_history[-5:]
                ],
            }
            ai_result = ai_analyze_vitals(vitals_context, stage_label=stage_display, user=request.user)

        # 整理 exam_items 并持久化
        existing_items = (existing_same_day.exam_items if existing_same_day and isinstance(existing_same_day.exam_items, dict) else {})
        exam_items = dict(existing_items)
        exam_items.update({
            "stage": stage_type,
            "gestational_days": gestational_days if stage_type == "pregnancy" else None,
            "postpartum_months": data.get("postpartum_months") if stage_type == "postpartum" else None,
            "systolic_bp": sbp if sbp is not None else existing_items.get("systolic_bp"),
            "diastolic_bp": dbp if dbp is not None else existing_items.get("diastolic_bp"),
            "pulse": pulse if pulse is not None else existing_items.get("pulse"),
            "bp_status": bp_eval["status"] if bp_eval else existing_items.get("bp_status"),
            "bp_status_label": bp_eval["status_label"] if bp_eval else existing_items.get("bp_status_label"),
            "blood_sugar": blood_sugar if blood_sugar is not None else existing_items.get("blood_sugar"),
            "glucose_type": glucose_type if blood_sugar is not None else existing_items.get("glucose_type", "fasting"),
            "glucose_type_label": glu_eval["glucose_type_label"] if glu_eval else existing_items.get("glucose_type_label"),
            "glucose_status": glu_eval["status"] if glu_eval else existing_items.get("glucose_status"),
            "glucose_status_label": glu_eval["status_label"] if glu_eval else existing_items.get("glucose_status_label"),
            "symptoms": symptoms,
            "bmi": bmi_val or existing_items.get("bmi"),
            "completeness": completeness,
        })

        note_prefix = (
            f"孕{gestational_week}周{gestational_days}天" if stage_type == "pregnancy" and gestational_days > 0
            else f"孕{gestational_week}周" if stage_type == "pregnancy"
            else f"产后{data.get('postpartum_months', 1)}个月" if stage_type == "postpartum"
            else "生命体征打卡"
        )
        note_parts = [note_prefix + "："]
        if bp_eval:
            note_parts.append(f"血压 {sbp}/{dbp} mmHg ({bp_eval['status_label']})")
        if glu_eval:
            note_parts.append(f"血糖 {blood_sugar} mmol/L ({glu_eval['glucose_type_label']} · {glu_eval['status_label']})")
        if data.get("note"):
            note_parts.append(f"备注: {data['note']}")
        full_note = " ； ".join(note_parts)

        effective_weight = weight if weight is not None else (existing_same_day.weight if existing_same_day else None)
        effective_height = height if height is not None else (existing_same_day.height if existing_same_day else None)

        record_action = "created"
        created_record_id = None
        if existing_same_day:
            existing_same_day.gestational_week = gestational_week
            existing_same_day.height = effective_height
            existing_same_day.weight = effective_weight
            existing_same_day.exam_items = exam_items
            existing_same_day.note = full_note
            if ai_result and ai_result.get("response"):
                existing_same_day.ai_analysis = ai_result["response"]
            if mother:
                existing_same_day.mother = mother
            existing_same_day.save(update_fields=["gestational_week", "height", "weight", "exam_items", "note", "ai_analysis", "mother", "updated_at"])
            created_record_id = existing_same_day.id
            record_action = "updated"
        else:
            new_rec = HealthRecord.objects.create(
                user=request.user,
                mother=mother,
                record_type="prenatal_exam",
                record_date=target_date,
                gestational_week=gestational_week,
                height=effective_height,
                weight=effective_weight,
                exam_items=exam_items,
                note=full_note,
                ai_analysis=ai_result.get("response", "") if ai_result else "",
            )
            created_record_id = new_rec.id

        # 审计日志
        audit(
            request,
            "health_vitals_analyze",
            "生命体征打卡并评估（覆盖更新）" if record_action == "updated" else "生命体征打卡并评估",
            "health",
            created_record_id or 0,
            f"BP: {sbp}/{dbp}" if sbp else f"Glu: {blood_sugar}",
            completeness.get("summary_text", ""),
        )

        timeseries, summary = _build_vitals_timeseries(request.user, mother_id=mother.id if mother else None)

        return Response({
            "code": 0,
            "message": "已成功更新当日生命体征记录" if record_action == "updated" else "生命体征录入与评估成功",
            "data": {
                "created_record_id": created_record_id,
                "record_action": record_action,
                "bp_evaluation": bp_eval,
                "glucose_evaluation": glu_eval,
                "bmi": bmi_val,
                "completeness": completeness,
                "alerts": alerts,
                "lifestyle_diet": lifestyle_diet,
                "ai_analysis": ai_result,
                "timeseries": timeseries,
                "summary": summary,
            },
        })


class HealthVitalsAiAnalysisView(APIView):
    """单独触发生命体征 AI 深度解读接口"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        check_permission_or_403(request.user, "menu_health", "管理员已关闭「健康中心」页面访问，如有需要请联系管理员开启")
        check_permission_or_403(request.user, "health_record_view", "您暂无「查看健康档案」的权限，请联系管理员开启")
        from apps.core.models.health import HealthRecord
        from apps.core.services.ai_service import ai_analyze_vitals
        from apps.core.services.vitals_calculator import VitalsCalculator

        record_id = request.data.get("record_id")
        rec = None
        if record_id:
            rec = HealthRecord.objects.filter(id=record_id, user=request.user).first()

        if rec:
            items = rec.exam_items if isinstance(rec.exam_items, dict) else {}
            sbp = items.get("systolic_bp")
            dbp = items.get("diastolic_bp")
            pulse = items.get("pulse")
            glu = items.get("blood_sugar")
            raw_gtype = items.get("glucose_type", "fasting")
            stage = items.get("stage") or ("pregnancy" if rec.gestational_week else "pregnancy")
            symptoms = items.get("symptoms", [])

            bp_eval = VitalsCalculator.evaluate_blood_pressure(sbp, dbp, pulse, stage_type=stage) if (sbp and dbp) else None
            glu_eval = VitalsCalculator.evaluate_blood_sugar(glu, raw_gtype, stage_type=stage) if glu else None
            completeness = items.get("completeness") or VitalsCalculator.build_metrics_completeness({
                "systolic_bp": sbp, "diastolic_bp": dbp, "pulse": pulse,
                "blood_sugar": glu, "glucose_type": raw_gtype,
                "weight": rec.weight, "bmi": items.get("bmi"),
            })

            timeseries, _ = _build_vitals_timeseries(request.user, mother_id=rec.mother_id)
            stage_display = (
                f"孕{rec.gestational_week}周{items.get('gestational_days', 0)}天" if stage == "pregnancy" and items.get("gestational_days")
                else f"孕{rec.gestational_week}周" if stage == "pregnancy"
                else f"产后{items.get('postpartum_months', 1)}个月" if stage == "postpartum"
                else "备孕期/常规阶段"
            )
            vitals_context = {
                "bp_eval": bp_eval,
                "glucose_eval": glu_eval,
                "completeness": completeness,
                "symptoms": symptoms,
                "history_trend": [
                    {
                        "record_date": h["record_date"],
                        "systolic": h["systolic_bp"],
                        "diastolic": h["diastolic_bp"],
                        "blood_sugar": h["blood_sugar"],
                        "glucose_type": h.get("glucose_type_label", ""),
                    }
                    for h in timeseries[-5:]
                ],
            }
            res = ai_analyze_vitals(vitals_context, stage_label=stage_display, user=request.user)
            if res.get("response"):
                rec.ai_analysis = res["response"]
                rec.save(update_fields=["ai_analysis", "updated_at"])
            return Response({"code": 0, "message": "AI解读生成完成", "data": res})

        return Response({"code": 4004, "message": "未找到对应的健康记录", "data": None}, status=status.HTTP_404_NOT_FOUND)


# ============ AI ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_chat(request):
    check_permission_or_403(request.user, "ai_chat", "您暂无「AI 问答」权限，请联系管理员开启")
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
        # v1.88.1 收藏权限独立成「我的收藏中心」组：favorite_create
        check_permission_or_403(request.user, "favorite_create", "您暂无添加收藏的权限，请联系管理员开启")
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
        check_permission_or_403(request.user, "favorite_delete", "您暂无取消收藏的权限，请联系管理员开启")
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
            check_permission_or_403(request.user, "favorite_delete", "您暂无取消收藏的权限，请联系管理员开启")
            fav_id = existing.id
            if existing.favorite_type == "product":
                Product.objects.filter(id=existing.object_id, fav_count__gt=0).update(fav_count=models.F("fav_count") - 1)
            audit(request, "favorite_remove", "取消收藏", existing.favorite_type, existing.object_id, existing.note or "",
                  f"取消收藏了 {existing.favorite_type} #{existing.object_id}")
            existing.delete()
            return Response({"code": 0, "message": "已取消收藏", "data": {"favorited": False, "object_id": obj_id, "id": fav_id}})
        else:
            check_permission_or_403(request.user, "favorite_create", "您暂无添加收藏的权限，请联系管理员开启")
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

    @action(detail=False, methods=["get"], url_path="map")
    def map(self, request):
        """v1.88.4 类型级收藏状态查询（一次返回当前用户该类型全部收藏）：
        GET /api/favorites/map/?favorite_type=timeline → {"182": true, "395": true}
        配合前端全局 favoriteStore，将列表页 N 次单对象查询收敛为 1 次请求。
        不传 favorite_type 时返回全部类型 {"timeline": {"182": true}, ...}。
        """
        fav_type = request.query_params.get("favorite_type", "")
        qs = UserFavorite.objects.filter(user=request.user)
        if fav_type:
            qs = qs.filter(favorite_type=fav_type)
        data: dict = {}
        for fav in qs.only("favorite_type", "object_id"):
            if fav_type:
                data[str(fav.object_id)] = True
            else:
                data.setdefault(fav.favorite_type, {})[str(fav.object_id)] = True
        return Response({"code": 0, "message": "ok", "data": data})

    @action(detail=False, methods=["post"], url_path="batch-delete")
    def batch_delete(self, request):
        """v1.88.1 批量取消收藏（收藏中心多选删除）：传 ids=[收藏记录ID]"""
        check_permission_or_403(request.user, "favorite_delete", "您暂无取消收藏的权限，请联系管理员开启")
        ids = request.data.get("ids", [])
        if not isinstance(ids, list) or len(ids) == 0:
            return Response({"code": 2001, "message": "请选择要取消的收藏项", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        targets = list(UserFavorite.objects.filter(user=request.user, id__in=ids))
        # 同步回减商品收藏计数
        product_ids = [t.object_id for t in targets if t.favorite_type == "product"]
        if product_ids:
            Product.objects.filter(id__in=product_ids, fav_count__gt=0).update(fav_count=models.F("fav_count") - 1)
        count, _ = UserFavorite.objects.filter(user=request.user, id__in=ids).delete()
        ids_text = ",".join(str(i) for i in ids[:50])
        audit(request, "favorite_batch_delete", "批量取消收藏", "favorite", ids_text, f"{count}条",
              f"批量取消收藏 {count} 条")
        return Response({"code": 0, "message": f"已取消 {count} 条收藏", "data": {"count": count}})


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
            "is_active", "ai_authorized", "custom_permissions", "security_question",
            "security_answer", "login_fail_count", "security_fail_count",
            "locked_until", "created_at", "due_date", "baby_birthday", "is_pregnant",
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
                "admin_session_timeout_minutes": getattr(setting, "admin_session_timeout_minutes", 30),
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
            if "admin_session_timeout_minutes" in request.data:
                setting.admin_session_timeout_minutes = max(0, int(request.data.get("admin_session_timeout_minutes", 30)))
            setting.save(update_fields=["login_captcha_threshold", "login_freeze_threshold", "login_lock_minutes", "login_lock_seconds", "forgot_password_max_attempts", "admin_session_timeout_minutes"])
            audit(request, "security_config", "修改安全风控配置", "系统", 1, "全局",
                  f"验证码阈值={setting.login_captcha_threshold}，冻结阈值={setting.login_freeze_threshold}，熔断等待={setting.login_lock_seconds}秒({setting.login_lock_minutes}分钟)，密保上限={setting.forgot_password_max_attempts}次，管理员无操作超时={setting.admin_session_timeout_minutes}分钟")
            return Response({"code": 0, "message": "安全风控配置已更新", "data": {
                "login_captcha_threshold": setting.login_captcha_threshold,
                "login_freeze_threshold": setting.login_freeze_threshold,
                "login_lock_minutes": setting.login_lock_minutes,
                "login_lock_seconds": setting.login_lock_seconds,
                "forgot_password_max_attempts": setting.forgot_password_max_attempts,
                "admin_session_timeout_minutes": setting.admin_session_timeout_minutes,
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
    permission_classes = [IsAuthenticated]
    kb_manage_perm = "kb_stories_manage"
    kb_view_perm = "kb_stories_view"

    # v1.88.1 导入模板：中文表头 → 英文字段名映射
    CN_HEADER_MAP = {
        "标题（中文）*": "title", "英文标题": "title_en", "副标题": "subtitle", "英文副标题": "subtitle_en",
        "起始孕周*": "week_start", "天数偏移": "day_offset", "当天序号": "day_index",
        "故事正文（中文）*": "content", "英文正文": "content_en", "胎教提示（中文）": "tips", "英文提示": "tips_en",
        "封面图URL": "cover_image", "讲述者": "narrator", "来源": "source", "英文来源": "source_en",
        "排序权重": "sort_order", "是否启用（是/否）": "is_active",
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in ("OPTIONS",):
            # v1.88 兼容知识库管理页：菜单权限 / 知识库查看 / 知识库管理权限任一即可
            if not (
                _kb_menu_allowed(request.user, "menu_fetal_stories", "kb_stories_view")
                or has_permission(request.user, "kb_stories_manage")
            ):
                raise PermissionDenied(detail={"code": 4030, "message": "管理员已关闭「胎教故事」页面访问，如有需要请联系管理员开启", "permission": "menu_fetal_stories"})

    def get_permissions(self):
        """知识库写操作仅管理员或被授权用户（kb_stories_manage）"""
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "batch"):
            return [KbWritePermission()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        # v1.88.1 前台一律只显示启用条目（含管理员）；仅知识库管理中心（with_inactive=1）可见全部
        # v1.88.1 前台展示（list/retrieve）只显示启用数据；写操作放行（否则停用条目无法编辑/删除/重新启用）
        if self.action in ("list", "retrieve") and not _kb_can_see_inactive(self):
            qs = qs.filter(is_active=True)
        return qs

    def list(self, request, *args, **kwargs):
        """列表：支持按 week_start / narrator 筛选；带 page 参数时服务端分页（v1.88）"""
        params = _kb_params(self)
        week = params.get("week")
        narrator = params.get("narrator")
        search = params.get("search")
        qs = self.get_queryset()
        if week:
            qs = qs.filter(week_start=int(week))
        if narrator:
            qs = qs.filter(narrator=narrator)
        if search:
            qs = qs.filter(
                models.Q(title__icontains=search)
                | models.Q(title_en__icontains=search)
                | models.Q(content__icontains=search)
                | models.Q(subtitle__icontains=search)
            )
        # v1.88 知识库管理：启用状态筛选（仅管理接口有效）
        status_filter = params.get("status")
        if status_filter in ("active", "inactive") and _kb_can_see_inactive(self):
            qs = qs.filter(is_active=(status_filter == "active"))
        qs = qs.order_by("week_start", "day_offset", "day_index")
        stats = {
            "total": qs.count(),
            "active_count": qs.filter(is_active=True).count(),
            "inactive_count": qs.filter(is_active=False).count(),
            "weeks_count": qs.values("week_start").distinct().count(),
        }
        return _kb_paged_response(qs, request, FetalStorySerializer, extra_stats=stats)

    def perform_create(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "create", "胎教故事", "fetal_story", obj, f"新增胎教故事【{obj.title}】(孕{obj.week_start}周+{obj.day_offset}天)")

    def perform_update(self, serializer):
        obj = serializer.save()
        _kb_write_audit(self.request, "update", "胎教故事", "fetal_story", obj, f"修改胎教故事【{obj.title}】(#{obj.id})")

    def perform_destroy(self, instance):
        _kb_write_audit(self.request, "delete", "胎教故事", "fetal_story", instance, f"删除胎教故事【{instance.title}】(#{instance.id})")
        instance.delete()

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """v1.88 批量操作：delete / active / inactive"""
        return _kb_batch_action(request, FetalStory.objects.all(), "胎教故事", "fetal_story", get_name=lambda x: x.title)

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

    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """v1.88.1 导出胎教故事 CSV：scope=page/filtered/selected"""
        data = request.data or {}
        qs = self.get_queryset().order_by("week_start", "day_offset", "day_index")
        qs = _kb_apply_export_scope(qs, data)
        scope_suffix = {"selected": "选中", "filtered": "筛选", "page": f"第{data.get('page', 1)}页"}.get(str(data.get("scope") or "page"), "")
        return _kb_export_response(
            qs, request, f"fetal_stories_export_{scope_suffix}.csv",
            ["ID", "标题（中文）", "英文标题", "副标题", "英文副标题", "起始孕周", "天数偏移", "当天序号",
             "故事正文（中文）", "英文正文", "胎教提示（中文）", "英文提示", "封面图URL", "讲述者", "来源", "英文来源", "排序权重", "是否启用"],
            lambda s: [s.id, s.title, s.title_en, s.subtitle, s.subtitle_en, s.week_start, s.day_offset, s.day_index,
                       s.content, s.content_en, s.tips, s.tips_en, s.cover_image or "", s.narrator, s.source, s.source_en,
                       s.sort_order, "是" if s.is_active else "否"],
        )

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """v1.88.1 下载胎教故事导入模板（?lang=cn|en）"""
        lang = (request.query_params.get("lang") or "cn").strip().lower()
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="fetal_stories_import_template_{lang}.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        sample = [
            "月亮婆婆的摇篮曲", "Moon Lullaby", "温柔与安全感", "Gentleness and security",
            17, 0, 1,
            "夜幕降临，月亮婆婆轻轻哼起了摇篮曲……",
            "Night falls, and Grandma Moon hums a soft lullaby...",
            "睡前轻声讲述，配合轻抚腹部节奏感更佳。",
            "Tell it softly before sleep, gently stroking your belly.",
            "", "mom", "", "", 0, "是",
        ]
        if lang == "en":
            writer.writerow(["title*", "title_en", "subtitle", "subtitle_en", "week_start*", "day_offset",
                             "day_index", "content*", "content_en", "tips", "tips_en", "cover_image",
                             "narrator", "source", "source_en", "sort_order", "is_active(是/否)"])
            writer.writerow(["# Required: title, week_start, content. narrator: mom(妈妈讲)/dad(爸爸讲)/either(都可以), "
                             "blank=mom. week_start range 17-40. is_active: 是/否, blank=是. # lines are ignored."])
        else:
            writer.writerow(["标题（中文）*", "英文标题", "副标题", "英文副标题", "起始孕周*", "天数偏移",
                             "当天序号", "故事正文（中文）*", "英文正文", "胎教提示（中文）", "英文提示", "封面图URL",
                             "讲述者", "来源", "英文来源", "排序权重", "是否启用（是/否）"])
            writer.writerow(["# 必填列：标题（中文）/起始孕周/故事正文（中文）。起始孕周范围 17-40；讲述者：mom(妈妈讲)/dad(爸爸讲)/"
                             "either(都可以)，留空默认 mom；天数偏移从本周起第几天（0=第1天）；当天序号同一天多个故事时用；"
                             "是否启用填 是/否，留空默认为是；# 开头说明行导入时自动忽略"])
        writer.writerow(sample)
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入胎教故事 CSV（管理员/授权用户）"""
        file = request.FILES.get("file")
        if not file:
            return Response({"code": 2001, "message": "请上传 CSV 文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        try:
            # v1.88.2 修复：字节流只读一次——此前 UTF-8 解码失败后第二次 read() 返回空流，
            # 导致 GBK/ANSI 编码文件（Excel 中文环境另存）静默导入 0 条
            raw = file.read()
            text = raw.decode("utf-8-sig")
        except Exception:
            try:
                text = raw.decode("gbk")
            except Exception:
                return Response({"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        raw_header, rows = _kb_read_csv_rows(text)
        header = _kb_normalize_header(raw_header, self.CN_HEADER_MAP)
        valid_narrators = {c[0] for c in FetalStory.NARRATOR_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=True):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        def _int(v, default=0):
            try:
                return int(str(v).strip())
            except (ValueError, TypeError):
                return default

        for row in rows:
            # v1.88.2 真实文件行号（含表头/说明行计数），报错可精确定位
            idx = row.get("__line__") or 0
            # v1.88.2 修复：行字典键为原始表头（中文），须按位置从原始键取值；
            # 此前用归一化后的英文键查询导致全部取空 → 每行报"缺少必填"，导入 0 条
            mapped = {header[i]: row.get(raw_header[i], "") for i in range(len(header))}
            title = (mapped.get("title") or "").strip()
            content = (mapped.get("content") or "").strip()
            if not title or not content:
                errors.append(f"第{idx}行：缺少 标题 或 故事正文")
                continue
            narrator = (mapped.get("narrator") or "mom").strip()
            if narrator not in valid_narrators:
                errors.append(f"第{idx}行：无效的讲述者「{narrator}」(mom/dad/either)")
                continue
            FetalStory.objects.create(
                title=title,
                title_en=(mapped.get("title_en") or "").strip(),
                subtitle=(mapped.get("subtitle") or "").strip(),
                subtitle_en=(mapped.get("subtitle_en") or "").strip(),
                week_start=_int(mapped.get("week_start"), 17),
                day_offset=_int(mapped.get("day_offset"), 0),
                day_index=_int(mapped.get("day_index"), 1),
                content=content,
                content_en=(mapped.get("content_en") or "").strip(),
                tips=(mapped.get("tips") or "").strip(),
                tips_en=(mapped.get("tips_en") or "").strip(),
                cover_image=(mapped.get("cover_image") or "").strip() or "",
                narrator=narrator,
                source=(mapped.get("source") or "").strip(),
                source_en=(mapped.get("source_en") or "").strip(),
                sort_order=_int(mapped.get("sort_order"), 0),
                is_active=_yn(mapped.get("is_active")),
            )
            created += 1
        # v1.88.2 统一导入响应：汇总文案附首条失败原因，并落审计
        return _kb_import_result(request, "胎教故事", "fetal_story", created, errors)

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
                    "has_custom": bool(custom.get("_admin_customized", False)),
                    "custom_permissions": {k: v for k, v in custom.items() if not k.startswith("_")},
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

            base_fallback = target.custom_permissions or get_user_permissions(target)
            cleaned = {}
            for k in DEFAULT_USER_PERMISSIONS:
                if k in perms_input:
                    cleaned[k] = bool(perms_input[k])
                else:
                    cleaned[k] = base_fallback.get(k, DEFAULT_USER_PERMISSIONS[k])

            # 递归规范化父子权限联动
            cleaned = normalize_permissions(cleaned, previous_perms=target.custom_permissions or {})
            cleaned["_admin_customized"] = True
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


# ============================================================
# 天气预报、历法与 AI 模型列表 API (迁移增量)
# ============================================================
import logging as _py_logging
import time as _py_time
from datetime import date as _py_date
from apps.core.services import weather_service, holiday_service
from apps.core.utils.permissions import check_permission_or_403, has_permission

_logger = _py_logging.getLogger(__name__)
_HOME_WEATHER_CACHE = {}
_HOME_WEATHER_TTL = 30 * 60  # 30 分钟缓存


def _get_cached_home_weather(city: str, lat: str = None, lon: str = None):
    now = _py_time.time()
    cache_key = f"{city}:{lat}:{lon}" if (lat and lon) else city
    hit = _HOME_WEATHER_CACHE.get(cache_key) or _HOME_WEATHER_CACHE.get(city)
    if hit and hit[0] > now:
        return hit[1]
    try:
        if lat and lon:
            data = weather_service.query_weather_by_coords(lat, lon, days=2, label=city)
        else:
            data = weather_service.query_weather(city, days=2)
    except Exception:
        return None
    current = (data or {}).get("current") or {}
    daily = (data or {}).get("daily") or []
    payload = {
        "city": (data or {}).get("city") or city,
        "temp": current.get("temperature"),
        "desc": current.get("weather_text") or "",
        "icon": current.get("icon") or "",
        "code": current.get("weather_code"),
        "today_max": (daily[0] or {}).get("temp_max") if daily else None,
        "today_min": (daily[0] or {}).get("temp_min") if daily else None,
        "tomorrow_max": (daily[1] or {}).get("temp_max") if len(daily) > 1 else None,
        "tomorrow_min": (daily[1] or {}).get("temp_min") if len(daily) > 1 else None,
        "update_time": current.get("time") or "",
    }
    _HOME_WEATHER_CACHE[cache_key] = (now + _HOME_WEATHER_TTL, payload)
    if city and city != cache_key:
        _HOME_WEATHER_CACHE[city] = (now + _HOME_WEATHER_TTL, payload)
    return payload


class WeatherQueryView(APIView):
    """天气查询 API：支持坐标直查（级联选择）与城市文本搜索，默认 15 天预报"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        check_permission_or_403(request.user, "menu_weather", "管理员已关闭「天气」功能，如有需要请联系管理员开启")
        days = request.query_params.get("days") or weather_service.DEFAULT_FORECAST_DAYS
        lat = (request.query_params.get("lat") or "").strip()
        lon = (request.query_params.get("lon") or "").strip()

        try:
            if lat and lon:
                label = (request.query_params.get("label") or "").strip()
                data = weather_service.query_weather_by_coords(lat, lon, days=days, label=label)
                target_city_name = label or (data.get("city") if isinstance(data, dict) else "")
            else:
                city = (request.query_params.get("city") or "").strip()
                if not city:
                    city = "成都"
                province = (request.query_params.get("province") or "").strip()
                city2 = (request.query_params.get("city2") or "").strip()
                data = weather_service.query_weather(city, province=province or None, district_city=city2 or None, days=int(days))
                target_city_name = city
            if request.user.is_staff and target_city_name:
                try:
                    from apps.core.models.system import SystemSetting
                    sys_setting = SystemSetting.get_settings()
                    sys_setting.default_user_permissions["_admin_weather_city"] = target_city_name
                    sys_setting.save(update_fields=["default_user_permissions"])
                except Exception:
                    pass
            return Response({"code": 0, "message": "ok", "data": data})
        except weather_service.WeatherError as e:
            return Response(
                {"code": 4000, "message": e.message, "data": None},
                status=status.HTTP_400_BAD_REQUEST if e.status_code == 400 else status.HTTP_502_BAD_GATEWAY
            )
        except Exception:
            _logger.exception("查询天气异常")
            return Response(
                {"code": 5000, "message": "天气服务查询异常，请稍后重试", "data": None},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class HomeWeatherView(APIView):
    """首页轻量天气与万年历 API：支持无天气权限时降级为管理员配置城市与提示说明"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.models.system import SystemSetting
        sys_setting = SystemSetting.get_settings()
        admin_city = (sys_setting.default_user_permissions or {}).get("_admin_weather_city") or "成都"
        has_perm = request.user.is_staff or has_permission(request.user, "menu_weather")

        raw_city = (request.query_params.get("city") or "").strip()
        lat = (request.query_params.get("lat") or "").strip()
        lon = (request.query_params.get("lon") or "").strip()
        if not has_perm:
            city = admin_city
            source = "admin"
            notice = "您没有天气页面权限，当前天气信息默认来源于管理员用户"
            lat = None
            lon = None
        else:
            if raw_city and len(raw_city) <= weather_service.CITY_NAME_MAX_LEN:
                city = raw_city
                source = "user"
                if request.user.is_staff:
                    try:
                        sys_setting.default_user_permissions["_admin_weather_city"] = city
                        sys_setting.save(update_fields=["default_user_permissions"])
                    except Exception:
                        pass
            else:
                city = admin_city
                source = "default"
            notice = ""

        weather = _get_cached_home_weather(city, lat=lat, lon=lon)
        if not weather:
            weather = {
                "city": city,
                "temp": 22,
                "desc": "晴",
                "icon": "01d",
                "code": 0,
                "today_max": 26,
                "today_min": 17,
                "tomorrow_max": 25,
                "tomorrow_min": 16,
                "update_time": _py_time.strftime("%H:%M"),
            }

        badge = None
        try:
            today = _py_date.today()
            holidays = holiday_service.get_year_holidays(today.year) or {}
            info = holidays.get("%02d-%02d" % (today.month, today.day))
            if info:
                badge = {"holiday": bool(info.get("holiday")), "name": info.get("name") or ""}
        except Exception:
            pass

        return Response({
            "code": 0,
            "message": "ok",
            "data": {
                "city": city,
                "source": source,
                "notice": notice,
                "has_permission": has_perm,
                "weather": weather,
                "badge": badge,
            }
        })


class HolidayYearView(APIView):
    """法定节假日班/休查询 API（万年历模块班/休角标数据源）"""
    permission_classes = [IsAuthenticated]

    def get(self, request, year):
        check_permission_or_403(request.user, "menu_weather", "管理员已关闭「万年历/节假日」功能，如有需要请联系管理员开启")
        if year < holiday_service.HOLIDAY_YEAR_MIN or year > holiday_service.HOLIDAY_YEAR_MAX:
            return Response(
                {"code": 4000, "message": f"年份超出支持范围（{holiday_service.HOLIDAY_YEAR_MIN}~{holiday_service.HOLIDAY_YEAR_MAX}）", "data": None},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            holidays = holiday_service.get_year_holidays(year)
        except Exception:
            _logger.exception("获取节假日班休数据异常")
            holidays = {}
        return Response({"code": 0, "message": "ok", "data": {"year": year, "holiday": holidays}})


class AIConfigModelsView(APIView):
    """获取 AI 提供商可用模型列表（仅具备 ai_fetch_models 权限或管理员可操作）"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        check_permission_or_403(request.user, "ai_fetch_models", "您暂无「获取 AI 模型列表」权限，请联系管理员开启")
        data = request.data or {}
        config_index = data.get("config_index")
        api_key = (data.get("api_key") or "").strip()
        base_url = (data.get("base_url") or "").strip()

        if config_index is not None:
            try:
                config_index = int(config_index)
                user_configs = request.user.ai_configs or []
                if 0 <= config_index < len(user_configs):
                    cfg = user_configs[config_index]
                    api_key = cfg.get("api_key") or ""
                    base_url = cfg.get("base_url") or ""
            except (ValueError, TypeError):
                pass

        if not api_key:
            return Response(
                {"code": 2001, "message": "API Key 不能为空，请先填写后再获取模型列表", "data": None},
                status=status.HTTP_400_BAD_REQUEST
            )

        res = ai_service.fetch_model_list(api_key, base_url)
        audit(request, "ai_fetch_models", "获取AI模型列表", "ai_config", 0, base_url or "api.openai.com",
              f"拉取模型成功={res.get('success')}, 数量={len(res.get('models', []))}")
        return Response({"code": 0, "message": "ok", "data": res})
