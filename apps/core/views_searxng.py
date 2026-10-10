# -*- coding: utf-8 -*-
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .views import _is_admin
from .utils.audit import audit
from .services.searxng_client import SearXNGClient

class AdminSearXNGConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({'code': 4003, 'message': '只有系统管理员有权查看 SearXNG 引擎配置', 'data': None}, status=status.HTTP_403_FORBIDDEN)
        cfg = SearXNGClient.get_config_dict()
        cfg['can_manage'] = True
        return Response({'code': 0, 'message': 'success', 'data': cfg})

    def put(self, request):
        if not _is_admin(request.user):
            return Response({'code': 4003, 'message': '只有系统管理员有权修改 SearXNG 引擎配置', 'data': None}, status=status.HTTP_403_FORBIDDEN)
        base_url = request.data.get('base_url')
        if not base_url or not str(base_url).startswith('http'):
            return Response({'code': 2001, 'message': 'base_url 必须为有效的 HTTP/HTTPS URL', 'data': None}, status=status.HTTP_400_BAD_REQUEST)
        try:
            timeout = float(request.data.get('timeout', 4.0))
            if timeout < 0.5 or timeout > 30.0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({'code': 2001, 'message': 'timeout 超时时间需在 0.5 ~ 30 秒之间', 'data': None}, status=status.HTTP_400_BAD_REQUEST)
        engines = str(request.data.get('engines', '')).strip()
        health_domains = str(request.data.get('health_domains', '')).strip()
        # AI 公网引擎兜底开关（v1.55 管理员可控；未传时保持现状不覆盖）
        ai_fallback_raw = request.data.get('ai_fallback_enabled')
        ai_fallback_enabled = None if ai_fallback_raw is None else str(ai_fallback_raw).strip().lower() in ('1', 'true', 'yes', 'on')
        success = SearXNGClient.sync_to_env(
            base_url=base_url, timeout=timeout, engines=engines,
            health_domains=health_domains, ai_fallback_enabled=ai_fallback_enabled,
        )
        if not success:
            return Response({'code': 5001, 'message': '写入 .env 配置文件失败', 'data': None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        audit(request, 'searxng_config_update', '更新SearXNG搜索引擎配置', 'system', 1, base_url, f'更新SearXNG配置并同步到.env: URL={base_url}, 超时={timeout}s, AI公网兜底={"开启" if ai_fallback_enabled else ("保持" if ai_fallback_enabled is None else "关闭")}')
        cfg = SearXNGClient.get_config_dict()
        cfg['can_manage'] = True
        return Response({'code': 0, 'message': 'SearXNG 配置已成功保存并同步到 .env 配置文件', 'data': cfg})


class AdminSearXNGConfigTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({'code': 4003, 'message': '只有系统管理员有权执行连通性测试', 'data': None}, status=status.HTTP_403_FORBIDDEN)
        res = SearXNGClient.test_connection(
            base_url=request.data.get('base_url'),
            timeout=request.data.get('timeout'),
            engines=request.data.get('engines'),
            health_domains=request.data.get('health_domains'),
        )
        return Response({'code': 0, 'message': '测试完成', 'data': res})
