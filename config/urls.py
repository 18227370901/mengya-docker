from django.urls import include, path, re_path
from django.views.generic import TemplateView, RedirectView
from django.views.static import serve
from django.conf import settings

def serve_fetal_story(request, path):
    """
    智能服务胎教故事图片：
    1. 优先从生产/构建静态目录 static/fetal-stories 查找；
    2. 若未构建或目录缺失，自动无缝回退至前端源码源目录 frontend/public/fetal-stories；
    3. 彻底避免因 Git 排除 static/ 导致的 404 破图。
    """
    primary_dir = settings.BASE_DIR / "static" / "fetal-stories"
    fallback_dir = settings.BASE_DIR / "frontend" / "public" / "fetal-stories"
    if (primary_dir / path).is_file():
        return serve(request, path, document_root=primary_dir)
    return serve(request, path, document_root=fallback_dir)

urlpatterns = [
    # 严格封堵原生 Django Admin 页面，统一重定向至前端认证登录页，彻底杜绝后台暴露
    path("admin/login/", RedirectView.as_view(url="/login", permanent=False)),
    path("admin/", RedirectView.as_view(url="/login", permanent=False)),
    path("api/", include("apps.core.urls")),

    # 前端静态资源直发服务（assets/、fetal-stories/、static/ 与常用图标）
    re_path(r"^assets/(?P<path>.*)$", serve, {"document_root": settings.BASE_DIR / "static" / "assets"}),
    re_path(r"^fetal-stories/(?P<path>.*)$", serve_fetal_story),
    re_path(r"^static/(?P<path>.*)$", serve, {"document_root": settings.STATIC_ROOT if settings.STATIC_ROOT.exists() else settings.BASE_DIR / "static"}),
    re_path(r"^(?P<path>favicon\.(?:ico|svg))$", serve, {"document_root": settings.BASE_DIR / "static"}),

    # SPA 前端全路由兜底：除 api/、static/、assets/、fetal-stories/ 外的页面请求全部渲染 index.html
    re_path(r"^(?!api/|static/|assets/|fetal-stories/).*$", TemplateView.as_view(template_name="index.html")),
]
