from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"babies", views.BabyViewSet, basename="baby")
router.register(r"timeline", views.TimelineViewSet, basename="timeline")
router.register(r"recipes", views.RecipeViewSet, basename="recipe")
router.register(r"kids-encyclopedia", views.KidsEncyclopediaViewSet, basename="kids-encyclopedia")
router.register(r"products", views.ProductViewSet, basename="product")
router.register(r"brands", views.BrandViewSet, basename="brand")
router.register(r"shopping-lists", views.ShoppingListViewSet, basename="shopping-list")
router.register(r"baby-shopping", views.BabyShoppingItemViewSet, basename="baby-shopping")
router.register(r"health/records", views.HealthRecordViewSet, basename="health-record")
router.register(r"notifications", views.NotificationViewSet, basename="notification")
router.register(r"favorites", views.FavoriteViewSet, basename="favorite")
router.register(r"fetal-stories", views.FetalStoryViewSet, basename="fetal-story")

urlpatterns = [
    path("auth/register/", views.register, name="register"),
    path("auth/registration-mode/", views.registration_mode, name="registration-mode"),
    path("auth/invite/verify/", views.verify_invite, name="verify-invite"),
    path("auth/login/", views.login, name="login"),
    path("auth/captcha/status/", views.captcha_status, name="captcha-status"),
    path("auth/captcha/new/", views.captcha_new, name="captcha-new"),
    path("auth/sms/send/", views.sms_send, name="sms-send"),
    path("users/me/", views.MeView.as_view(), name="me"),
    path("users/ai-config/", views.AIConfigView.as_view(), name="ai-config"),
    path("users/ai-config/test/", views.AIConfigTestView.as_view(), name="ai-config-test"),
    path("users/ai-auth/", views.AIAuthManageView.as_view(), name="ai-auth-manage"),
    path("users/permissions/", views.UserPermissionsView.as_view(), name="user-permissions"),
    path("admin/permissions/", views.AdminPermissionsView.as_view(), name="admin-permissions"),
    path("admin/registration/", views.RegistrationManageView.as_view(), name="registration-manage"),
    path("admin/users/", views.UserManageView.as_view(), name="user-manage"),
    path("admin/audit-logs/", views.AuditLogView.as_view(), name="audit-logs"),
    path("users/change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("users/security-question/", views.SecurityQuestionView.as_view(), name="security-question"),
    path("users/forgot-password/", views.ForgotPasswordView.as_view(), name="forgot-password"),
    path("users/delete/", views.UserDeleteView.as_view(), name="user-delete"),
    # 对比相关接口需在 router 之前注册，避免被 products/{pk} 拦截
    path("products/compare/", views.ProductCompareView.as_view(), name="product-compare"),
    path("products/compare/radar/", views.CompareRadarView.as_view(), name="compare-radar"),
    path("ai/chat/", views.ai_chat, name="ai-chat"),
    path("ai/compare/", views.ai_compare, name="ai-compare"),
    path("ai/history/", views.ai_history, name="ai-history"),
    path("ai/suggestions/", views.ai_suggestions, name="ai-suggestions"),
    path("ai/sessions/", views.ai_sessions, name="ai-sessions"),
    path("ai/sessions/create/", views.ai_session_create, name="ai-session-create"),
    path("ai/sessions/<int:session_id>/", views.ai_session_detail, name="ai-session-detail"),
    path("ai/sessions/<int:session_id>/rename/", views.ai_session_rename, name="ai-session-rename"),
    path("ai/sessions/<int:session_id>/delete/", views.ai_session_delete, name="ai-session-delete"),
    path("", include(router.urls)),
]