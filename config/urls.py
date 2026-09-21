from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView
from django.views.static import serve
from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/", include("apps.core.urls")),

    # 前端静态资源直发服务（assets/、fetal-stories/、static/ 与常用图标）
    re_path(r"^assets/(?P<path>.*)$", serve, {"document_root": settings.BASE_DIR / "static" / "assets"}),
    re_path(r"^fetal-stories/(?P<path>.*)$", serve, {"document_root": settings.BASE_DIR / "static" / "fetal-stories"}),
    re_path(r"^static/(?P<path>.*)$", serve, {"document_root": settings.STATIC_ROOT if settings.STATIC_ROOT.exists() else settings.BASE_DIR / "static"}),
    re_path(r"^(?P<path>favicon\.(?:ico|svg))$", serve, {"document_root": settings.BASE_DIR / "static"}),

    # SPA 前端全路由兜底：除 api/、admin/、static/、assets/、fetal-stories/ 外的页面请求全部渲染 index.html
    re_path(r"^(?!api/|admin/|static/|assets/|fetal-stories/).*$", TemplateView.as_view(template_name="index.html")),
]
