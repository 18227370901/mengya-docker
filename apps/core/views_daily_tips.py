import json
from django.core.paginator import Paginator, EmptyPage
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from apps.core.models import DailyTip, SystemSetting
from apps.core.services.daily_tip_service import DailyTipService


def serialize_tip(t):
    return {
        "id": t.id,
        "title": t.title,
        "content": t.content,
        "tag": t.tag,
        "stage_type": t.stage_type,
        "stage_type_label": t.get_stage_type_display(),
        "is_active": t.is_active,
        "is_builtin": t.is_builtin,
        "sort_order": t.sort_order,
        "created_at": t.created_at.strftime("%Y-%m-%d %H:%M:%S") if t.created_at else "",
        "updated_at": t.updated_at.strftime("%Y-%m-%d %H:%M:%S") if t.updated_at else "",
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def public_daily_tips_view(request):
    """前台获取当前阶段启用的提示信息列表"""
    stage_type = request.GET.get("stage_type", "newborn")
    tips, limit = DailyTipService.get_tips_for_stage(stage_type)
    return Response({
        "code": 0,
        "message": "ok",
        "data": {
            "tips": tips,
            "display_count": limit,
        }
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_daily_tips_list_create_view(request):
    """管理员：获取提示信息分页列表 / 新增提示信息"""
    if DailyTip.objects.count() == 0:
        DailyTipService.seed_builtin_tips()

    if request.method == "GET":
        qs = DailyTip.objects.all()

        stage_type = request.GET.get("stage_type", "").strip()
        if stage_type and stage_type != "all":
            qs = qs.filter(stage_type=stage_type)

        is_active = request.GET.get("is_active", "").strip()
        if is_active in ["true", "1"]:
            qs = qs.filter(is_active=True)
        elif is_active in ["false", "0"]:
            qs = qs.filter(is_active=False)

        search = request.GET.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) | Q(content__icontains=search) | Q(tag__icontains=search)
            )

        qs = qs.order_by("stage_type", "sort_order", "-id")

        try:
            page = max(1, int(request.GET.get("page", 1)))
        except (TypeError, ValueError):
            page = 1

        try:
            page_size = max(1, min(100, int(request.GET.get("page_size", 10))))
        except (TypeError, ValueError):
            page_size = 10

        paginator = Paginator(qs, page_size)
        try:
            paged = paginator.page(page)
        except EmptyPage:
            paged = paginator.page(paginator.num_pages if paginator.num_pages > 0 else 1)
            page = paged.number

        items = [serialize_tip(t) for t in paged]
        settings = SystemSetting.get_settings()

        stats = {
            "total": DailyTip.objects.count(),
            "active_count": DailyTip.objects.filter(is_active=True).count(),
            "builtin_count": DailyTip.objects.filter(is_builtin=True).count(),
        }

        return Response({
            "code": 0,
            "message": "ok",
            "data": {
                "items": items,
                "total": paginator.count,
                "page": page,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
                "display_count": settings.daily_tip_display_count,
                "stats": stats,
            }
        })

    elif request.method == "POST":
        data = request.data or {}
        title = (data.get("title") or "").strip()
        content = (data.get("content") or "").strip()
        tag = (data.get("tag") or "").strip()
        stage_type = (data.get("stage_type") or "newborn").strip()
        is_active = bool(data.get("is_active", True))
        sort_order = int(data.get("sort_order") or 0)

        if not title:
            return Response({"code": 400, "message": "标题不能为空"}, status=status.HTTP_400_BAD_REQUEST)
        if not content:
            return Response({"code": 400, "message": "内容不能为空"}, status=status.HTTP_400_BAD_REQUEST)

        tip = DailyTip.objects.create(
            title=title,
            content=content,
            tag=tag,
            stage_type=stage_type,
            is_active=is_active,
            is_builtin=False,
            sort_order=sort_order,
        )

        return Response({
            "code": 0,
            "message": "创建成功",
            "data": serialize_tip(tip)
        }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_daily_tip_detail_view(request, pk):
    """管理员：获取/编辑/删除指定提示"""
    try:
        tip = DailyTip.objects.get(pk=pk)
    except DailyTip.DoesNotExist:
        return Response({"code": 404, "message": "提示不存在"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response({"code": 0, "message": "ok", "data": serialize_tip(tip)})

    elif request.method == "PUT":
        data = request.data or {}
        if "title" in data:
            title = data["title"].strip()
            if not title:
                return Response({"code": 400, "message": "标题不能为空"}, status=status.HTTP_400_BAD_REQUEST)
            tip.title = title
        if "content" in data:
            content = data["content"].strip()
            if not content:
                return Response({"code": 400, "message": "内容不能为空"}, status=status.HTTP_400_BAD_REQUEST)
            tip.content = content
        if "tag" in data:
            tip.tag = data["tag"].strip()
        if "stage_type" in data:
            tip.stage_type = data["stage_type"].strip()
        if "is_active" in data:
            tip.is_active = bool(data["is_active"])
        if "sort_order" in data:
            try:
                tip.sort_order = int(data["sort_order"])
            except (ValueError, TypeError):
                pass

        tip.save()
        return Response({"code": 0, "message": "更新成功", "data": serialize_tip(tip)})

    elif request.method == "DELETE":
        tip_id = tip.id
        tip.delete()
        return Response({"code": 0, "message": "删除成功", "data": {"id": tip_id}})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_daily_tips_batch_status_view(request):
    """管理员：批量修改启用/停用状态"""
    data = request.data or {}
    ids = data.get("ids", [])
    is_active = bool(data.get("is_active", True))

    if not isinstance(ids, list) or len(ids) == 0:
        return Response({"code": 400, "message": "请选择要操作的数据项"}, status=status.HTTP_400_BAD_REQUEST)

    count = DailyTip.objects.filter(id__in=ids).update(is_active=is_active)
    return Response({
        "code": 0,
        "message": f"成功更新 {count} 条数据的显示状态",
        "data": {"count": count, "is_active": is_active}
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_daily_tips_batch_delete_view(request):
    """管理员：批量删除提示"""
    data = request.data or {}
    ids = data.get("ids", [])

    if not isinstance(ids, list) or len(ids) == 0:
        return Response({"code": 400, "message": "请选择要删除的数据项"}, status=status.HTTP_400_BAD_REQUEST)

    count, _ = DailyTip.objects.filter(id__in=ids).delete()
    return Response({
        "code": 0,
        "message": f"成功删除 {count} 条数据",
        "data": {"count": count}
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_daily_tips_config_view(request):
    """管理员：设置前台展示条数限制"""
    data = request.data or {}
    try:
        count = int(data.get("display_count", 5))
        if count < 0:
            count = 0
    except (ValueError, TypeError):
        count = 5

    settings = SystemSetting.get_settings()
    settings.daily_tip_display_count = count
    settings.save()

    return Response({
        "code": 0,
        "message": "展示条数设置已保存",
        "data": {"display_count": count}
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def admin_daily_tips_reset_builtin_view(request):
    """管理员：恢复或补充系统内置提示"""
    data = request.data or {}
    force_reset = bool(data.get("force_reset", False))

    created, updated = DailyTipService.seed_builtin_tips(force_reset=force_reset)
    return Response({
        "code": 0,
        "message": f"系统内置提示处理完成：新增 {created} 条，更新 {updated} 条",
        "data": {"created": created, "updated": updated}
    })
