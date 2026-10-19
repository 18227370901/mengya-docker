# -*- coding: utf-8 -*-
"""外部接口服务配置管理接口（v1.73 新增）
管理员统一管理各模块「内置默认调用地址」：天气三组、法定节假日、AI 公网搜索引擎管线。
支持多端点/多引擎、行级开关、排序、重试参数、一键测试；存储复用 SystemSetting.external_api_config。
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .views import _is_admin
from .utils.audit import audit
from .services import service_config
from .services.service_config import DEFAULT_GROUPS


class AdminServiceConfigView(APIView):
    """外部接口服务配置：GET 获取全量 / PUT 保存单组"""

    permission_classes = [IsAuthenticated]

    def _check_admin(self, request):
        if not _is_admin(request.user):
            return Response({'code': 4003, 'message': '只有系统管理员有权查看/修改外部接口服务配置', 'data': None},
                            status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request):
        denied = self._check_admin(request)
        if denied:
            return denied
        return Response({'code': 0, 'message': 'success', 'data': service_config.get_all_config()})

    def put(self, request):
        denied = self._check_admin(request)
        if denied:
            return denied
        group = str(request.data.get('group', '')).strip()
        if group not in DEFAULT_GROUPS:
            return Response({'code': 2001, 'message': '未知配置组: %s' % group, 'data': None},
                            status=status.HTTP_400_BAD_REQUEST)
        ok = service_config.save_group_config(group, request.data)
        if not ok:
            return Response({'code': 5001, 'message': '保存配置失败', 'data': None},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        audit(request, 'service_config_update', '更新外部接口服务配置', 'system', 1, group,
              '更新配置组[%s]：%s' % (DEFAULT_GROUPS[group]['label'], _summarize_payload(group, request.data)))
        try:
            from .views import _HOME_WEATHER_CACHE
            _HOME_WEATHER_CACHE.clear()
        except Exception:
            pass
        return Response({'code': 0, 'message': '配置已保存并即时生效', 'data': service_config.get_all_config()})


class AdminServiceConfigRestoreView(APIView):
    """恢复全部默认（清空外部接口配置，业务回落内置默认值）"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({'code': 4003, 'message': '只有系统管理员有权恢复默认配置', 'data': None},
                            status=status.HTTP_403_FORBIDDEN)
        service_config.restore_all_defaults()
        audit(request, 'service_config_restore', '恢复外部接口服务配置为默认值', 'system', 1, '', '清空 external_api_config，全部回落内置默认值')
        try:
            from .views import _HOME_WEATHER_CACHE
            _HOME_WEATHER_CACHE.clear()
        except Exception:
            pass
        return Response({'code': 0, 'message': '已恢复全部默认值', 'data': service_config.get_all_config()})


class AdminServiceConfigTestView(APIView):
    """一键测试：单行（endpoint/engine）或整组"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({'code': 4003, 'message': '只有系统管理员可以执行连通性测试', 'data': None},
                            status=status.HTTP_403_FORBIDDEN)
        group = str(request.data.get('group', '')).strip()
        if group not in DEFAULT_GROUPS:
            return Response({'code': 2001, 'message': '未知配置组: %s' % group, 'data': None},
                            status=status.HTTP_400_BAD_REQUEST)
        results = service_config.test_group(group, request.data)
        return Response({'code': 0, 'message': '测试完成', 'data': {'results': results}})


def _summarize_payload(group, data):
    """审计详情摘要（不泄露完整地址列表）"""
    if group == 'search_pipeline':
        engines = data.get('engines') or []
        return '引擎 %d 个（%s），超时 %ss，重试 %s 轮' % (
            len([e for e in engines if isinstance(e, dict) and e.get('enabled')]),
            '、'.join([str(e.get('key', '')) for e in engines if isinstance(e, dict)]),
            data.get('timeout', ''), data.get('retries', ''))
    endpoints = data.get('endpoints') or []
    return '端点 %d 个，超时 %ss，重试 %s 轮' % (
        len([e for e in endpoints if isinstance(e, dict) and e.get('enabled')]),
        data.get('timeout', ''), data.get('retries', ''))