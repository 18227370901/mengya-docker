# -*- coding: utf-8 -*-
"""v1.88 知识库管理中心 API —— 各知识库模块一键恢复出厂内置数据

权限：管理员直通；普通用户需被显式授予对应模块的管理权限
（时间轴/胎教故事/孕期食谱/幼儿百科/待产包为 kb_*_manage，商品库/品牌库沿用商品管理权限）。
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services.knowledge_seed_service import RESET_MODULES, get_module_stats, reset_module
from .utils.audit import audit
from .utils.permissions import has_permission
from .views import _is_admin


class AdminKnowledgeResetView(APIView):
    """知识库恢复出厂：清空模块全部数据并重灌系统初始内置数据"""

    permission_classes = [IsAuthenticated]

    def _check_perm(self, request, module_key):
        """恢复权限校验：管理员或对应模块管理权限"""
        if _is_admin(request.user):
            return None
        cfg = RESET_MODULES.get(module_key)
        perm_key = cfg.get("perm") if cfg else None
        if not perm_key or not has_permission(request.user, perm_key):
            return Response(
                {"code": 4003, "message": "只有管理员或被授权用户可以执行恢复出厂操作", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def get(self, request):
        """获取各模块恢复统计（当前条数 / 内置初始条数），用于恢复确认弹窗展示"""
        if not _is_admin(request.user) and not any(
            has_permission(request.user, cfg["perm"]) for cfg in RESET_MODULES.values()
        ):
            return Response(
                {"code": 4003, "message": "只有管理员或被授权用户可以查看知识库恢复信息", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        module = request.query_params.get("module")
        keys = [module] if module in RESET_MODULES else list(RESET_MODULES.keys())
        return Response({
            "code": 0,
            "message": "success",
            "data": [get_module_stats(k) for k in keys],
        })

    def post(self, request):
        """执行恢复出厂：module 为模块键（timeline/fetal_stories/recipes/encyclopedia/baby_shopping/products/brands）"""
        module_key = str(request.data.get("module") or "").strip()
        if module_key not in RESET_MODULES:
            return Response(
                {"code": 2001, "message": f"未知模块: {module_key}", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        denied = self._check_perm(request, module_key)
        if denied:
            return denied
        try:
            label, deleted, created = reset_module(module_key)
        except ValueError as e:
            return Response(
                {"code": 5001, "message": str(e), "data": None},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        audit(
            request, "knowledge_reset", f"恢复{label}出厂数据", module_key, "all", label,
            f"恢复{label}出厂：清空 {deleted} 条（含管理员新增数据），重灌系统初始内置数据 {created} 条",
        )
        return Response({
            "code": 0,
            "message": f"{label}已恢复为系统初始数据：清除 {deleted} 条，重灌内置 {created} 条",
            "data": {"module": module_key, "deleted": deleted, "created": created},
        })
