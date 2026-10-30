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
            qs = qs.filter(Q(name__icontains=keyword) | Q(description__icontains=keyword))

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
