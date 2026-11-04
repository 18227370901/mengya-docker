
def _normalize_platform_url(raw_url: str) -> str:
    """标准化平台 URL：去除前后空白、BOM 字符、多余末尾斜杠以确保查重一致性"""
    if not raw_url:
        return ""
    clean = raw_url.strip().strip("\ufeff").strip("\u200b")
    # 去除末尾所有多余斜杠
    clean = clean.rstrip("/")
    return clean

# -*- coding: utf-8 -*-
"""
三方平台接入与聚合中转站 API (Third Party Platform Views)
- 平台元数据安全抓取 (SSRF 防御)
- 平台配置 CRUD 与资源级授权控制
- 子资源/路径 CRUD 与访问过滤
- 平台跳转与访问审计日志
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q

from .models.platform import ThirdPartyPlatform, ThirdPartyPlatformResource
from .models.favorite import UserFavorite
from .services.platform_meta_service import fetch_platform_metadata
from .utils.audit import audit
from .utils.permissions import has_permission
from .views import _is_admin


def _serialize_resource(res, is_admin_user=False):
    """序列化子资源项"""
    return {
        "id": res.id,
        "platform_id": res.platform_id,
        "title": res.title,
        "path_or_url": res.path_or_url,
        "description": res.description,
        "icon": res.icon,
        "sort_order": res.sort_order,
        "is_enabled": res.is_enabled,
        "access_rule": res.access_rule,
        "allowed_user_ids": res.allowed_user_ids if is_admin_user else [],
        "created_at": res.created_at.strftime("%Y-%m-%d %H:%M:%S") if res.created_at else "",
        "updated_at": res.updated_at.strftime("%Y-%m-%d %H:%M:%S") if res.updated_at else "",
    }


def _serialize_platform(p, allowed_resources=None, is_admin_user=False):
    """序列化平台对象"""
    if allowed_resources is None:
        resources = []
    else:
        resources = [_serialize_resource(r, is_admin_user) for r in allowed_resources]

    return {
        "id": p.id,
        "name": p.name,
        "url": p.url,
        "logo_url": p.logo_url,
        "description": p.description,
        "category": p.category,
        "category_display": p.get_category_display(),
        "age_group": p.age_group,
        "age_group_display": p.get_age_group_display(),
        "tags": p.tags or [],
        "sort_order": p.sort_order,
        "fav_count": UserFavorite.objects.filter(favorite_type="platform", object_id=p.id).count(),
        "is_enabled": p.is_enabled,
        "visibility_type": p.visibility_type,
        "allowed_user_ids": p.allowed_user_ids if is_admin_user else [],
        "created_by": p.created_by.username if p.created_by else "",
        "resources": resources,
        "created_at": p.created_at.strftime("%Y-%m-%d %H:%M:%S") if p.created_at else "",
        "updated_at": p.updated_at.strftime("%Y-%m-%d %H:%M:%S") if p.updated_at else "",
    }


class PlatformMetaFetchView(APIView):
    """一键获取三方平台标题、描述与 Logo (带严格 SSRF 校验)"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user) and not has_permission(request.user, "platform_manage_edit"):
            return Response(
                {"code": 4003, "message": "无权使用一键解析功能", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

        url = request.data.get("url", "").strip()
        if not url:
            return Response(
                {"code": 4000, "message": "请提供目标 URL 地址", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = fetch_platform_metadata(url)
        audit(
            request,
            action="platform_fetch_meta",
            action_label="一键解析三方平台信息",
            target_type="ThirdPartyPlatform",
            target_name=url[:100],
            detail=f"请求URL: {url}, 解析结果: {result.get('message')}, 成功状态: {result.get('success')}",
        )

        return Response({"code": 0, "message": "success", "data": result})


class PlatformListView(APIView):
    """三方平台列表与新增 API"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        获取平台列表：
        - 管理员：查看所有未软删除平台及所有子资源
        - 普通用户：须具备 menu_third_party_hub 权限，只能查看已启用、且在可见白名单内的平台及其可见子资源
        """
        user = request.user
        is_admin = _is_admin(user)

        # 校验是否有中转站或管理页访问权限
        has_hub_access = is_admin or has_permission(user, "menu_third_party_hub") or has_permission(user, "menu_admin_platforms")
        if not has_hub_access:
            return Response(
                {"code": 4003, "message": "您暂无访问三方中转站模块的权限，请联系管理员开通", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

        category = request.query_params.get("category", "").strip()
        age_group = request.query_params.get("age_group", "").strip()
        keyword = request.query_params.get("keyword", "").strip()

        qs = ThirdPartyPlatform.objects.filter(is_active=True)

        if not is_admin:
            # 普通用户仅查看启用的平台
            qs = qs.filter(is_enabled=True)
            # 可见性过滤: visibility_type == 'all' OR allowed_user_ids 包含 user.id
            # SQLite / PostgreSQL JSONField 包含过滤容错
            all_platforms = list(qs)
            visible_platforms = [
                p for p in all_platforms
                if p.visibility_type == "all" or (user.id in (p.allowed_user_ids or []))
            ]
            platform_ids = [p.id for p in visible_platforms]
            qs = qs.filter(id__in=platform_ids)

        if category:
            qs = qs.filter(category=category)
        if age_group:
            qs = qs.filter(Q(age_group=age_group) | Q(age_group="all"))
        if keyword:
            qs = qs.filter(Q(name__icontains=keyword) | Q(description__icontains=keyword) | Q(url__icontains=keyword))

        platforms = list(qs.order_by("sort_order", "id"))
        p_ids = [p.id for p in platforms]

        # 查询子资源
        res_qs = ThirdPartyPlatformResource.objects.filter(platform_id__in=p_ids, is_active=True)
        if not is_admin:
            res_qs = res_qs.filter(is_enabled=True)

        all_res = list(res_qs.order_by("sort_order", "id"))

        # 按平台归集并过滤资源级权限
        res_map = {}
        for r in all_res:
            if not is_admin:
                if r.access_rule == "restricted" and user.id not in (r.allowed_user_ids or []):
                    continue
            res_map.setdefault(r.platform_id, []).append(r)

        data = [_serialize_platform(p, res_map.get(p.id, []), is_admin) for p in platforms]
        return Response({"code": 0, "message": "success", "data": data})

    def post(self, request):
        """新增平台（仅管理员可操作）"""
        if not _is_admin(request.user):
            return Response(
                {"code": 4003, "message": "只有系统管理员可以新增三方平台配置", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

        name = request.data.get("name", "").strip()
        url = request.data.get("url", "").strip()
        if not name or not url:
            return Response(
                {"code": 4000, "message": "平台名称与访问地址不能为空", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clean_url = _normalize_platform_url(url)
        existing_dup = ThirdPartyPlatform.objects.filter(is_active=True, url__in=[clean_url, clean_url + "/"]).first()
        if existing_dup:
            return Response(
                {"code": 4001, "message": f"该访问地址已存在同名平台【{existing_dup.name}】，请勿重复添加", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        platform = ThirdPartyPlatform.objects.create(
            name=name,
            url=url,
            logo_url=request.data.get("logo_url", "").strip(),
            description=request.data.get("description", "").strip(),
            category=request.data.get("category", "tools"),
            age_group=request.data.get("age_group", "all"),
            tags=request.data.get("tags") or [],
            sort_order=int(request.data.get("sort_order", 0)),
            is_enabled=bool(request.data.get("is_enabled", True)),
            visibility_type=request.data.get("visibility_type", "all"),
            allowed_user_ids=request.data.get("allowed_user_ids") or [],
            created_by=request.user,
        )

        audit(
            request,
            action="platform_create",
            action_label="新增三方平台配置",
            target_type="ThirdPartyPlatform",
            target_id=str(platform.id),
            target_name=platform.name,
            detail=f"创建平台: {platform.name}, 地址: {platform.url}, 分类: {platform.category}",
        )

        return Response(
            {"code": 0, "message": "平台配置创建成功", "data": _serialize_platform(platform, [], True)},
            status=status.HTTP_201_CREATED,
        )


class PlatformDetailView(APIView):
    """单个平台详情、更新与软删除"""

    permission_classes = [IsAuthenticated]

    def _get_platform(self, pk):
        try:
            return ThirdPartyPlatform.objects.get(pk=pk, is_active=True)
        except ThirdPartyPlatform.DoesNotExist:
            return None

    def get(self, request, pk):
        """获取单个平台详情"""
        p = self._get_platform(pk)
        if not p:
            return Response({"code": 4004, "message": "平台不存在或已下线", "data": None}, status=status.HTTP_404_NOT_FOUND)

        is_admin = _is_admin(request.user)
        # 权限校验
        if not is_admin:
            if not has_permission(request.user, "menu_third_party_hub"):
                return Response({"code": 4003, "message": "无权访问此模块", "data": None}, status=status.HTTP_403_FORBIDDEN)
            if not p.is_enabled:
                return Response({"code": 4004, "message": "该平台已暂时停用", "data": None}, status=status.HTTP_404_NOT_FOUND)
            if p.visibility_type == "restricted" and request.user.id not in (p.allowed_user_ids or []):
                return Response({"code": 4003, "message": "您不在该平台的访问授权名单中", "data": None}, status=status.HTTP_403_FORBIDDEN)

        res_qs = p.resources.filter(is_active=True)
        if not is_admin:
            res_qs = res_qs.filter(is_enabled=True)
            res_list = [r for r in res_qs if r.access_rule != "restricted" or (request.user.id in (r.allowed_user_ids or []))]
        else:
            res_list = list(res_qs)

        return Response({"code": 0, "message": "success", "data": _serialize_platform(p, res_list, is_admin)})

    def put(self, request, pk):
        """编辑平台（仅管理员）"""
        if not _is_admin(request.user):
            return Response({"code": 4003, "message": "只有管理员可以修改平台配置", "data": None}, status=status.HTTP_403_FORBIDDEN)

        p = self._get_platform(pk)
        if not p:
            return Response({"code": 4004, "message": "平台不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)

        for field in ("name", "url", "logo_url", "description", "category", "age_group", "sort_order", "is_enabled", "visibility_type"):
            if field in request.data:
                setattr(p, field, request.data[field])

        if "tags" in request.data:
            p.tags = request.data["tags"] or []
        if "allowed_user_ids" in request.data:
            p.allowed_user_ids = request.data["allowed_user_ids"] or []

        p.save()

        audit(
            request,
            action="platform_update",
            action_label="编辑三方平台配置",
            target_type="ThirdPartyPlatform",
            target_id=str(p.id),
            target_name=p.name,
            detail=f"更新平台信息: {p.name}, 地址: {p.url}, 启用: {p.is_enabled}",
        )

        return Response({"code": 0, "message": "更新成功", "data": _serialize_platform(p, list(p.resources.filter(is_active=True)), True)})

    def delete(self, request, pk):
        """删除平台（软删除，仅管理员）"""
        if not _is_admin(request.user):
            return Response({"code": 4003, "message": "只有管理员可以删除平台配置", "data": None}, status=status.HTTP_403_FORBIDDEN)

        p = self._get_platform(pk)
        if not p:
            return Response({"code": 4004, "message": "平台不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)

        p.is_active = False
        p.save()
        # 连带软删除子资源
        p.resources.update(is_active=False)

        audit(
            request,
            action="platform_delete",
            action_label="删除三方平台配置",
            target_type="ThirdPartyPlatform",
            target_id=str(p.id),
            target_name=p.name,
            detail=f"软删除平台: {p.name}",
        )

        return Response({"code": 0, "message": "平台已删除", "data": None})


class PlatformResourceCreateView(APIView):
    """为指定平台新增子资源入口（仅管理员）"""

    permission_classes = [IsAuthenticated]

    def post(self, request, platform_id):
        if not _is_admin(request.user):
            return Response({"code": 4003, "message": "只有系统管理员可添加子资源", "data": None}, status=status.HTTP_403_FORBIDDEN)

        try:
            platform = ThirdPartyPlatform.objects.get(pk=platform_id, is_active=True)
        except ThirdPartyPlatform.DoesNotExist:
            return Response({"code": 4004, "message": "所属主平台不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)

        title = request.data.get("title", "").strip()
        path_or_url = request.data.get("path_or_url", "").strip()
        if not title or not path_or_url:
            return Response({"code": 4000, "message": "子资源名称与路径不能为空", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        res = ThirdPartyPlatformResource.objects.create(
            platform=platform,
            title=title,
            path_or_url=path_or_url,
            description=request.data.get("description", "").strip(),
            icon=request.data.get("icon", "").strip(),
            sort_order=int(request.data.get("sort_order", 0)),
            is_enabled=bool(request.data.get("is_enabled", True)),
            access_rule=request.data.get("access_rule", "inherit"),
            allowed_user_ids=request.data.get("allowed_user_ids") or [],
        )

        audit(
            request,
            action="platform_resource_create",
            action_label="新增平台子资源",
            target_type="ThirdPartyPlatformResource",
            target_id=str(res.id),
            target_name=res.title,
            detail=f"为平台[{platform.name}]新增子资源: {res.title}, 地址: {res.path_or_url}",
        )

        return Response({"code": 0, "message": "子资源创建成功", "data": _serialize_resource(res, True)}, status=status.HTTP_201_CREATED)


class PlatformResourceDetailView(APIView):
    """子资源更新与软删除（仅管理员）"""

    permission_classes = [IsAuthenticated]

    def _get_resource(self, pk):
        try:
            return ThirdPartyPlatformResource.objects.get(pk=pk, is_active=True)
        except ThirdPartyPlatformResource.DoesNotExist:
            return None

    def put(self, request, pk):
        if not _is_admin(request.user):
            return Response({"code": 4003, "message": "只有管理员可修改子资源", "data": None}, status=status.HTTP_403_FORBIDDEN)

        res = self._get_resource(pk)
        if not res:
            return Response({"code": 4004, "message": "子资源不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)

        for field in ("title", "path_or_url", "description", "icon", "sort_order", "is_enabled", "access_rule"):
            if field in request.data:
                setattr(res, field, request.data[field])

        if "allowed_user_ids" in request.data:
            res.allowed_user_ids = request.data["allowed_user_ids"] or []

        res.save()

        audit(
            request,
            action="platform_resource_update",
            action_label="编辑平台子资源",
            target_type="ThirdPartyPlatformResource",
            target_id=str(res.id),
            target_name=res.title,
            detail=f"编辑子资源: {res.title}, 路径: {res.path_or_url}",
        )

        return Response({"code": 0, "message": "子资源更新成功", "data": _serialize_resource(res, True)})

    def delete(self, request, pk):
        if not _is_admin(request.user):
            return Response({"code": 4003, "message": "只有管理员可删除子资源", "data": None}, status=status.HTTP_403_FORBIDDEN)

        res = self._get_resource(pk)
        if not res:
            return Response({"code": 4004, "message": "子资源不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)

        res.is_active = False
        res.save()

        audit(
            request,
            action="platform_resource_delete",
            action_label="删除平台子资源",
            target_type="ThirdPartyPlatformResource",
            target_id=str(res.id),
            target_name=res.title,
            detail=f"删除子资源: {res.title}",
        )

        return Response({"code": 0, "message": "子资源已删除", "data": None})


class PlatformAccessLogView(APIView):
    """用户点击平台或子资源时的访问审计上报"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            platform = ThirdPartyPlatform.objects.get(pk=pk, is_active=True, is_enabled=True)
        except ThirdPartyPlatform.DoesNotExist:
            return Response({"code": 4004, "message": "平台不存在或已停用", "data": None}, status=status.HTTP_404_NOT_FOUND)

        # 权限校验
        if not _is_admin(request.user):
            if not has_permission(request.user, "menu_third_party_hub"):
                return Response({"code": 4003, "message": "无访问权限", "data": None}, status=status.HTTP_403_FORBIDDEN)
            if platform.visibility_type == "restricted" and request.user.id not in (platform.allowed_user_ids or []):
                return Response({"code": 4003, "message": "无访问权限", "data": None}, status=status.HTTP_403_FORBIDDEN)

        resource_id = request.data.get("resource_id")
        resource_title = ""
        if resource_id:
            try:
                res = platform.resources.get(pk=resource_id, is_active=True)
                resource_title = res.title
            except Exception:
                pass

        audit(
            request,
            action="platform_access",
            action_label="访问三方平台或资源",
            target_type="ThirdPartyPlatform",
            target_id=str(platform.id),
            target_name=platform.name,
            detail=f"用户访问了平台[{platform.name}]" + (f" 下的子入口[{resource_title}]" if resource_title else ""),
        )

        return Response({"code": 0, "message": "已记录访问行为", "data": None})



class PlatformUserOptionsView(APIView):
    """获取供三方平台授权勾选的用户简要列表"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user) and not has_permission(request.user, "menu_admin_platforms"):
            return Response({"code": 4003, "message": "无权获取用户列表", "data": None}, status=status.HTTP_403_FORBIDDEN)

        from apps.core.models import User
        users = list(
            User.objects.filter(is_active=True, is_staff=False, is_superuser=False).order_by("id").values(
                "id", "phone", "username", "nickname", "role", "is_staff"
            )
        )
        return Response({"code": 0, "message": "success", "data": users})

class PlatformCheckUrlView(APIView):
    """精准检查 URL 访问地址是否已存在重复项（完全精确匹配）"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        url = request.query_params.get("url", "").strip()
        exclude_id = request.query_params.get("exclude_id", "").strip()
        if not url:
            return Response({"code": 0, "message": "success", "data": {"exists": False}})

        clean_url = _normalize_platform_url(url)
        qs = ThirdPartyPlatform.objects.filter(is_active=True, url__in=[clean_url, clean_url + "/"])
        if exclude_id and exclude_id.isdigit():
            qs = qs.exclude(id=int(exclude_id))

        dup = qs.order_by("id").first()
        if dup:
            return Response({
                "code": 0,
                "message": "success",
                "data": {
                    "exists": True,
                    "duplicate": {
                        "id": dup.id,
                        "name": dup.name,
                        "url": dup.url,
                    }
                }
            })
        return Response({"code": 0, "message": "success", "data": {"exists": False}})


class PlatformBatchActionView(APIView):
    """第三方平台批量操作（启用/停用/删除）"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response(
                {"code": 4003, "message": "只有系统管理员可执行批量操作", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

        action = request.data.get("action", "").strip()
        ids = request.data.get("ids", [])
        if not isinstance(ids, list) or not ids:
            return Response(
                {"code": 4000, "message": "请选择要操作的平台数据项", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        platforms = ThirdPartyPlatform.objects.filter(id__in=ids, is_active=True)
        count = platforms.count()
        if count == 0:
            return Response(
                {"code": 4004, "message": "未找到有效的平台数据", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )

        ids_text = ",".join(str(p.id) for p in platforms)
        names_text = "、".join(p.name for p in platforms[:5])
        if count > 5:
            names_text += f" 等 {count} 个平台"

        if action == "delete":
            platforms.update(is_active=False)
            ThirdPartyPlatformResource.objects.filter(platform_id__in=ids, is_active=True).update(is_active=False)
            audit(
                request,
                action="platform_batch_delete",
                action_label="批量删除第三方平台",
                target_type="ThirdPartyPlatform",
                target_id=ids_text[:255],
                detail=f"批量删除 {count} 个平台（{names_text}）及其关联子资源",
            )
            return Response({"code": 0, "message": f"成功批量删除 {count} 个平台", "data": None})

        elif action == "enable":
            platforms.update(is_enabled=True)
            audit(
                request,
                action="platform_batch_enable",
                action_label="批量启用第三方平台",
                target_type="ThirdPartyPlatform",
                target_id=ids_text[:255],
                detail=f"批量启用 {count} 个平台（{names_text}）",
            )
            return Response({"code": 0, "message": f"成功批量启用 {count} 个平台", "data": None})

        elif action == "disable":
            platforms.update(is_enabled=False)
            audit(
                request,
                action="platform_batch_disable",
                action_label="批量停用第三方平台",
                target_type="ThirdPartyPlatform",
                target_id=ids_text[:255],
                detail=f"批量停用 {count} 个平台（{names_text}）",
            )
            return Response({"code": 0, "message": f"成功批量停用 {count} 个平台", "data": None})

        return Response(
            {"code": 4000, "message": "未知的批量操作类型", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )



class PlatformIconProxyView(APIView):
    """三方平台外部 Logo 安全代理与缓存端点 (带严格 SSRF 防御与长效客户端缓存)"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        url = request.query_params.get("url", "").strip()
        if not url:
            return Response({"code": 4000, "message": "缺少 url 参数", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        # 校验 URL 协议合法性
        import urllib.parse
        import socket
        import requests
        from django.http import HttpResponse
        from .services.platform_meta_service import is_ip_safe, BROWSER_HEADERS

        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return Response({"code": 4001, "message": "仅支持 HTTP/HTTPS URL", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        # SSRF 防御校验
        try:
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            addrinfo = socket.getaddrinfo(parsed.hostname, port)
            for item in addrinfo:
                ip = item[4][0]
                safe, reason = is_ip_safe(ip)
                if not safe:
                    return Response({"code": 4003, "message": f"禁止请求私有或非法地址: {reason}", "data": None}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"code": 4002, "message": f"目标域名解析失败: {str(e)}", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        # 流式抓取
        try:
            with requests.get(url, headers=BROWSER_HEADERS, timeout=(3.0, 5.0), stream=True) as resp:
                if resp.status_code != 200:
                    return Response({"code": resp.status_code, "message": "上游资源获取失败", "data": None}, status=status.HTTP_502_BAD_GATEWAY)
                
                content_type = resp.headers.get("Content-Type", "image/png")
                # 限制最大 512KB，防止大文件攻击
                content = resp.raw.read(512 * 1024)
                
                http_resp = HttpResponse(content, content_type=content_type)
                # 允许前端缓存 24 小时
                http_resp["Cache-Control"] = "private, max-age=86400"
                http_resp["Access-Control-Allow-Origin"] = "*"
                return http_resp
        except Exception as e:
            return Response({"code": 5000, "message": f"中转抓取失败: {str(e)}", "data": None}, status=status.HTTP_502_BAD_GATEWAY)


import io
import csv
import json
from datetime import datetime
from django.http import HttpResponse


class PlatformExportView(APIView):
    """一键导出三方平台数据 (支持 JSON 与 CSV)"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user) and not has_permission(request.user, "platform_manage_import_export"):
            return Response(
                {"code": 4003, "message": "无权导出三方平台数据", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

        fmt = (request.query_params.get("export_type") or request.query_params.get("fmt") or request.query_params.get("format") or "json").lower()
        platforms_qs = ThirdPartyPlatform.objects.filter(is_active=True).prefetch_related("resources").order_by("sort_order", "id")

        if fmt == "csv":
            response = HttpResponse(content_type="text/csv; charset=utf-8-sig")
            response["Content-Disposition"] = 'attachment; filename="mengya_platforms_export.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "平台名称*",
                "访问主地址*",
                "分类*",
                "适用年龄段*",
                "Logo图标链接",
                "平台描述",
                "标签(逗号分隔)",
                "排序权重",
                "是否启用(true/false)",
                "可见范围(all/restricted)",
                "允许用户ID白名单(逗号分隔)",
            ])
            for p in platforms_qs:
                writer.writerow([
                    p.name,
                    p.url,
                    p.category,
                    p.age_group,
                    p.logo_url,
                    p.description,
                    ",".join(p.tags or []),
                    p.sort_order,
                    "true" if p.is_enabled else "false",
                    p.visibility_type,
                    ",".join(map(str, p.allowed_user_ids or [])),
                ])
            audit(
                request,
                action="platform_export",
                action_label="导出三方平台数据",
                target_type="ThirdPartyPlatform",
                detail=f"成功导出 {platforms_qs.count()} 个平台 (CSV格式)",
            )
            return response

        # 默认 JSON 格式
        data_list = []
        for p in platforms_qs:
            p_data = {
                "name": p.name,
                "url": p.url,
                "logo_url": p.logo_url,
                "description": p.description,
                "category": p.category,
                "age_group": p.age_group,
                "tags": p.tags or [],
                "sort_order": p.sort_order,
                "is_enabled": p.is_enabled,
                "visibility_type": p.visibility_type,
                "allowed_user_ids": p.allowed_user_ids or [],
                "resources": [
                    {
                        "title": r.title,
                        "path_or_url": r.path_or_url,
                        "description": r.description,
                        "icon": r.icon,
                        "sort_order": r.sort_order,
                        "is_enabled": r.is_enabled,
                        "access_rule": r.access_rule,
                        "allowed_user_ids": r.allowed_user_ids or [],
                    }
                    for r in p.resources.filter(is_active=True).order_by("sort_order", "id")
                ],
            }
            data_list.append(p_data)

        audit(
            request,
            action="platform_export",
            action_label="导出三方平台数据",
            target_type="ThirdPartyPlatform",
            detail=f"成功导出 {len(data_list)} 个平台 (JSON格式)",
        )

        response = HttpResponse(
            json.dumps({"version": "2.0", "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "platforms": data_list}, ensure_ascii=False, indent=2),
            content_type="application/json; charset=utf-8",
        )
        response["Content-Disposition"] = 'attachment; filename="mengya_platforms_export.json"'
        return response


class PlatformImportView(APIView):
    """一键批量导入三方平台数据 (支持 JSON 与 CSV，自动排重与白名单校验)"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user) and not has_permission(request.user, "platform_manage_import_export"):
            return Response(
                {"code": 4003, "message": "无权导入三方平台数据", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            # 兼容从 request.data 传 json
            raw_data = request.data.get("platforms") or request.data.get("items")
            if not raw_data:
                return Response({"code": 4000, "message": "请上传需要导入的 JSON 或 CSV 文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)
            items = raw_data if isinstance(raw_data, list) else []
        else:
            fn = uploaded_file.name.lower()
            try:
                if fn.endswith(".json"):
                    content = uploaded_file.read().decode("utf-8")
                    parsed = json.loads(content)
                    items = parsed.get("platforms", parsed) if isinstance(parsed, dict) else parsed
                elif fn.endswith(".csv"):
                    content = uploaded_file.read().decode("utf-8-sig")
                    reader = csv.reader(io.StringIO(content))
                    rows = list(reader)
                    if not rows:
                        return Response({"code": 4001, "message": "CSV 文件为空", "data": None}, status=status.HTTP_400_BAD_REQUEST)
                    headers = [h.strip() for h in rows[0]]
                    items = []
                    for row in rows[1:]:
                        if not any(row):
                            continue
                        row_dict = dict(zip(headers, row))
                        # 兼容中文或英文表头
                        name = row_dict.get("平台名称*") or row_dict.get("name*") or row_dict.get("name") or ""
                        url = row_dict.get("访问主地址*") or row_dict.get("url*") or row_dict.get("url") or ""
                        if not name or not url:
                            continue
                        cat = row_dict.get("分类*") or row_dict.get("category*") or row_dict.get("category") or "tools"
                        age = row_dict.get("适用年龄段*") or row_dict.get("age_group*") or row_dict.get("age_group") or "all"
                        logo = row_dict.get("Logo图标链接") or row_dict.get("logo_url") or ""
                        desc = row_dict.get("平台描述") or row_dict.get("description") or ""
                        tags_raw = row_dict.get("标签(逗号分隔)") or row_dict.get("tags") or ""
                        tags = [t.strip() for t in tags_raw.replace("，", ",").split(",") if t.strip()]
                        sort_val = int(row_dict.get("排序权重") or row_dict.get("sort_order") or 0)
                        enabled_str = str(row_dict.get("是否启用(true/false)") or row_dict.get("is_enabled") or "true").lower()
                        is_enabled = enabled_str in ("true", "1", "是", "yes")
                        vis_raw = str(row_dict.get("可见范围(all/restricted)") or row_dict.get("visibility_type") or "all").lower()
                        vis = "restricted" if "rest" in vis_raw or "白名单" in vis_raw else "all"
                        uid_raw = row_dict.get("允许用户ID白名单(逗号分隔)") or row_dict.get("allowed_user_ids") or ""
                        uids = [int(u.strip()) for u in uid_raw.replace("，", ",").split(",") if u.strip().isdigit()]

                        items.append({
                            "name": name,
                            "url": url,
                            "category": cat,
                            "age_group": age,
                            "logo_url": logo,
                            "description": desc,
                            "tags": tags,
                            "sort_order": sort_val,
                            "is_enabled": is_enabled,
                            "visibility_type": vis,
                            "allowed_user_ids": uids,
                        })
                else:
                    return Response({"code": 4002, "message": "不支持的文件格式，仅支持 .json 与 .csv 文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                return Response({"code": 5001, "message": f"文件解析异常: {str(e)}", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(items, list) or len(items) == 0:
            return Response({"code": 4004, "message": "未发现有效的三方平台配置记录", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        imported_count = 0
        updated_count = 0
        errors = []

        valid_categories = {k for k, _ in ThirdPartyPlatform.CATEGORY_CHOICES}
        valid_age_groups = {k for k, _ in ThirdPartyPlatform.AGE_GROUP_CHOICES}

        for idx, item in enumerate(items, start=1):
            name = str(item.get("name") or "").strip()
            url = str(item.get("url") or "").strip()
            if not name or not url:
                errors.append(f"第 {idx} 项：缺少平台名称或访问主地址，已跳过")
                continue

            # 分类与年龄段自动容错映射
            cat = str(item.get("category") or "tools").strip()
            if cat not in valid_categories:
                cat = "tools"
            age = str(item.get("age_group") or "all").strip()
            if age not in valid_age_groups:
                age = "all"

            # 查重与合并（归一化匹配：同时比对末尾斜杠与去斜杠，彻底防止重复导入）
            clean_url = _normalize_platform_url(url)
            candidate_urls = [clean_url, clean_url + "/"]
            existing = ThirdPartyPlatform.objects.filter(url__in=candidate_urls, is_active=True).first()
            if not existing:
                # 兼容查找可能被软删除的旧记录进行复用激活
                existing = ThirdPartyPlatform.objects.filter(url__in=candidate_urls).first()
            if existing:
                existing.name = name
                existing.category = cat
                existing.age_group = age
                if item.get("logo_url"):
                    existing.logo_url = item["logo_url"]
                if item.get("description"):
                    existing.description = item["description"]
                if "tags" in item:
                    existing.tags = item["tags"] if isinstance(item["tags"], list) else []
                if "sort_order" in item:
                    try:
                        existing.sort_order = int(item["sort_order"])
                    except Exception:
                        pass
                if "is_enabled" in item:
                    existing.is_enabled = bool(item["is_enabled"])
                if "visibility_type" in item:
                    existing.visibility_type = item["visibility_type"]
                if "allowed_user_ids" in item and isinstance(item["allowed_user_ids"], list):
                    existing.allowed_user_ids = item["allowed_user_ids"]
                existing.is_active = True
                existing.save()
                target_platform = existing
                updated_count += 1
            else:
                target_platform = ThirdPartyPlatform.objects.create(
                    name=name,
                    url=url,
                    logo_url=item.get("logo_url") or "",
                    description=item.get("description") or "",
                    category=cat,
                    age_group=age,
                    tags=item.get("tags") if isinstance(item.get("tags"), list) else [],
                    sort_order=int(item.get("sort_order") or 0),
                    is_enabled=bool(item.get("is_enabled", True)),
                    is_active=True,
                    visibility_type=item.get("visibility_type") or "all",
                    allowed_user_ids=item.get("allowed_user_ids") if isinstance(item.get("allowed_user_ids"), list) else [],
                    created_by=request.user,
                )
                imported_count += 1

            # 兼容导入子资源
            resources = item.get("resources")
            if isinstance(resources, list):
                for r in resources:
                    r_title = str(r.get("title") or "").strip()
                    r_path = str(r.get("path_or_url") or "").strip()
                    if not r_title or not r_path:
                        continue
                    ThirdPartyPlatformResource.objects.update_or_create(
                        platform=target_platform,
                        path_or_url=r_path,
                        defaults={
                            "title": r_title,
                            "description": r.get("description") or "",
                            "icon": r.get("icon") or "",
                            "sort_order": int(r.get("sort_order") or 0),
                            "is_enabled": bool(r.get("is_enabled", True)),
                            "is_active": True,
                            "access_rule": r.get("access_rule") or "inherit",
                            "allowed_user_ids": r.get("allowed_user_ids") if isinstance(r.get("allowed_user_ids"), list) else [],
                        },
                    )

        audit(
            request,
            action="platform_import",
            action_label="导入三方平台数据",
            target_type="ThirdPartyPlatform",
            detail=f"批量导入完成：新增 {imported_count} 条，更新覆盖 {updated_count} 条，跳过错误 {len(errors)} 项",
        )

        return Response({
            "code": 0,
            "message": f"导入成功！新增 {imported_count} 条，更新覆盖 {updated_count} 条",
            "data": {
                "imported_count": imported_count,
                "updated_count": updated_count,
                "errors": errors,
            },
        })


class PlatformTemplateDownloadView(APIView):
    """三方平台批量导入中英文模板下载与字典字段说明"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        lang = request.query_params.get("lang", "zh").lower()
        response = HttpResponse(content_type="text/csv; charset=utf-8-sig")

        if lang == "en":
            response["Content-Disposition"] = 'attachment; filename="mengya_platform_import_template_en.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "name*",
                "url*",
                "category*",
                "age_group*",
                "logo_url",
                "description",
                "tags",
                "sort_order",
                "is_enabled",
                "visibility_type",
                "allowed_user_ids",
            ])
            writer.writerow([
                "Example Maternal & Infant Hub",
                "https://example.com/parenting",
                "parenting",
                "all",
                "https://example.com/logo.png",
                "High-quality authoritative parenting knowledge hub",
                "parenting,early-learning",
                "1",
                "true",
                "all",
                "",
            ])
        else:
            response["Content-Disposition"] = 'attachment; filename="mengya_platform_import_template_zh.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "平台名称*",
                "访问主地址*",
                "分类*",
                "适用年龄段*",
                "Logo图标链接",
                "平台描述",
                "标签(逗号分隔)",
                "排序权重",
                "是否启用(true/false)",
                "可见范围(all/restricted)",
                "允许用户ID白名单(逗号分隔)",
            ])
            writer.writerow([
                "示例优质母婴中转站",
                "https://example.com/parenting",
                "parenting",
                "all",
                "https://example.com/logo.png",
                "权威母婴早教与健康聚合导航",
                "早教,权威科普",
                "1",
                "true",
                "all",
                "",
            ])

        return response
