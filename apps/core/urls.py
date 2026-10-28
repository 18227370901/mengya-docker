from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views, views_searxng, views_daily_tips, views_service_config, views_backup, views_knowledge_admin

router = DefaultRouter()
router.register(r"mothers", views.MotherViewSet, basename="mother")
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
    path("users/ai-config/models/", views.AIConfigModelsView.as_view(), name="ai-config-models"),
    path("weather/query/", views.WeatherQueryView.as_view(), name="weather-query"),
    path("weather/home/", views.HomeWeatherView.as_view(), name="weather-home"),
    path("weather/holiday/<int:year>/", views.HolidayYearView.as_view(), name="weather-holiday"),
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
    path("health/bmi-analysis/", views.HealthBmiAnalysisView.as_view(), name="health-bmi-analysis"),
    path("health/vitals-analysis/", views.HealthVitalsAnalysisView.as_view(), name="health-vitals-analysis"),
    path("health/vitals-ai-analyze/", views.HealthVitalsAiAnalysisView.as_view(), name="health-vitals-ai-analyze"),
    path("admin/searxng-config/", views_searxng.AdminSearXNGConfigView.as_view(), name="admin-searxng-config"),
    path("admin/searxng-config/test/", views_searxng.AdminSearXNGConfigTestView.as_view(), name="admin-searxng-config-test"),
    # v1.73 外部接口服务配置（天气/节假日/AI公网搜索引擎管线）
    path("admin/service-config/", views_service_config.AdminServiceConfigView.as_view(), name="admin-service-config"),
    path("admin/service-config/test/", views_service_config.AdminServiceConfigTestView.as_view(), name="admin-service-config-test"),
    path("admin/service-config/restore/", views_service_config.AdminServiceConfigRestoreView.as_view(), name="admin-service-config-restore"),
    # WebDAV 云端备份与全量容灾恢复 API
    path("admin/backups/config/", views_backup.AdminBackupConfigView.as_view(), name="admin-backup-config"),
    path("admin/backups/test/", views_backup.AdminBackupTestView.as_view(), name="admin-backup-test"),
    path("admin/backups/list/", views_backup.AdminBackupListView.as_view(), name="admin-backup-list"),
    path("admin/backups/upload/", views_backup.AdminBackupUploadView.as_view(), name="admin-backup-upload"),
    path("admin/backups/restore/", views_backup.AdminBackupRestoreView.as_view(), name="admin-backup-restore"),
    path("admin/backups/delete/", views_backup.AdminBackupDeleteView.as_view(), name="admin-backup-delete"),
    path("admin/backups/download-local/", views_backup.AdminBackupDownloadLocalView.as_view(), name="admin-backup-download-local"),
    path("admin/backups/download-remote/", views_backup.AdminBackupDownloadRemoteView.as_view(), name="admin-backup-download-remote"),
    path("admin/backups/upload-local/", views_backup.AdminBackupUploadLocalView.as_view(), name="admin-backup-upload-local"),
    path("admin/backups/tasks/", views_backup.AdminScheduledTaskListView.as_view(), name="admin-backup-tasks"),
    path("admin/backups/tasks/<int:pk>/", views_backup.AdminScheduledTaskDetailView.as_view(), name="admin-backup-task-detail"),
    path("admin/backups/tasks/<int:pk>/toggle/", views_backup.AdminScheduledTaskToggleView.as_view(), name="admin-backup-task-toggle"),
    path("admin/backups/tasks/<int:pk>/run/", views_backup.AdminScheduledTaskRunView.as_view(), name="admin-backup-task-run"),
    path("admin/backups/tasks/<int:pk>/logs/", views_backup.AdminScheduledTaskLogsView.as_view(), name="admin-backup-task-logs"),
    path("admin/backups/rollbacks/", views_backup.AdminBackupRollbackListView.as_view(), name="admin-backup-rollbacks"),
    path("admin/backups/rollbacks/clean/", views_backup.AdminBackupRollbackCleanView.as_view(), name="admin-backup-rollbacks-clean"),
    path("ai/chat/", views.ai_chat, name="ai-chat"),
    path("ai/compare/", views.ai_compare, name="ai-compare"),
    path("ai/history/", views.ai_history, name="ai-history"),
    path("ai/suggestions/", views.ai_suggestions, name="ai-suggestions"),
    path("ai/sessions/", views.ai_sessions, name="ai-sessions"),
    path("ai/sessions/create/", views.ai_session_create, name="ai-session-create"),
    path("ai/sessions/<int:session_id>/", views.ai_session_detail, name="ai-session-detail"),
    path("ai/sessions/<int:session_id>/rename/", views.ai_session_rename, name="ai-session-rename"),
    path("ai/sessions/<int:session_id>/delete/", views.ai_session_delete, name="ai-session-delete"),
    # 今日关怀小锦囊 API
    path("daily-tips/", views_daily_tips.public_daily_tips_view, name="daily-tips-public"),
    path("admin/daily-tips/", views_daily_tips.admin_daily_tips_list_create_view, name="admin-daily-tips-list-create"),
    path("admin/daily-tips/<int:pk>/", views_daily_tips.admin_daily_tip_detail_view, name="admin-daily-tips-detail"),
    path("admin/daily-tips/batch-status/", views_daily_tips.admin_daily_tips_batch_status_view, name="admin-daily-tips-batch-status"),
    path("admin/daily-tips/batch-delete/", views_daily_tips.admin_daily_tips_batch_delete_view, name="admin-daily-tips-batch-delete"),
    path("admin/daily-tips/config/", views_daily_tips.admin_daily_tips_config_view, name="admin-daily-tips-config"),
    path("admin/daily-tips/reset-builtin/", views_daily_tips.admin_daily_tips_reset_builtin_view, name="admin-daily-tips-reset-builtin"),
    # v1.88 知识库管理中心：各模块一键恢复出厂内置数据
    path("admin/knowledge/reset/", views_knowledge_admin.AdminKnowledgeResetView.as_view(), name="admin-knowledge-reset"),
    path("", include(router.urls)),
]
