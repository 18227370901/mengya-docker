import { useAuthStore } from "./store/authStore";
import { ShieldAlert, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

function PermissionGuard({ perm, label, children }: { perm: string; label?: string; children: React.ReactNode }) {
  const { user, loading, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gray-400">
        正在加载...
      </div>
    );
  }

  // 管理员无条件具备所有页面菜单与功能权限
  if (user?.is_staff) {
    return <>{children}</>;
  }

  if (!hasPermission(perm)) {
    const canGoHome = hasPermission("menu_home");
    // v1.88.5 提示词统一：与后端 4030 文案同句式，带具体页名（无 label 时用通用文案）
    const tip = label
      ? `管理员已关闭「${label}」页面访问，如有需要请联系管理员开启。`
      : "管理员已关闭您的该页面菜单或功能访问权限，如需使用请联系管理员开通。";
    return (
      <div className="card my-12 mx-auto max-w-md space-y-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">无法访问本页面</h2>
          <p className="mt-1 text-xs text-gray-400">{tip}</p>
        </div>
        <button
          className="btn-primary inline-flex items-center gap-1.5"
          onClick={() => navigate(canGoHome ? "/" : "/profile")}
        >
          <Home className="h-4 w-4" /> {canGoHome ? "返回首页" : "返回个人中心"}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

function AdminGuard({ perm, perms, children }: { perm?: string; perms?: string[]; children: React.ReactNode }) {
  const { user, loading, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gray-400">
        正在加载...
      </div>
    );
  }

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  // 管理员或拥有任一指定管理菜单权限的用户放行（v1.88 支持 perms 多权限任一命中）
  const allowed =
    user.is_staff ||
    (perm && hasPermission(perm)) ||
    (perms && perms.length > 0 && perms.some((p) => hasPermission(p)));
  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div className="card my-12 mx-auto max-w-md space-y-4 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-800">无权访问管理后台</h2>
        <p className="mt-1 text-xs text-gray-400">该页面需要系统管理员身份或对应的管理菜单权限授权，您暂未获得该模块访问权限。</p>
      </div>
      <button
        className="btn-primary inline-flex items-center gap-1.5"
        onClick={() => navigate("/")}
      >
        <Home className="h-4 w-4" /> 返回首页
      </button>
    </div>
  );
}

import { Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import RequireAuth from "./layouts/RequireAuth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TimelinePage from "./pages/TimelinePage";
import TimelineDetailPage from "./pages/TimelineDetailPage";
import ProductListPage from "./pages/ProductListPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import ComparePage from "./pages/ComparePage";
import ShoppingListPage from "./pages/ShoppingListPage";
import ShoppingListDetailPage from "./pages/ShoppingListDetailPage";
import GenerateShoppingListPage from "./pages/GenerateShoppingListPage";
import BabyShoppingDetailPage from "./pages/BabyShoppingDetailPage";
import HealthPage from "./pages/HealthPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import WeatherPage from "./pages/WeatherPage";
import ProfilePage from "./pages/ProfilePage";
import AIConfigPage from "./pages/AIConfigPage";
import RegistrationManagePage from "./pages/RegistrationManagePage";
import ProductAdminPage from "./pages/ProductAdminPage";
import UserManagePage from "./pages/UserManagePage";
import AuditLogPage from "./pages/AuditLogPage";
import DailyTipsManagePage from "./pages/DailyTipsManagePage";
import AdminServiceConfigPage from "./pages/AdminServiceConfigPage";
import AdminBackupPage from "./pages/AdminBackupPage";
import ThirdPartyHubPage from "./pages/ThirdPartyHubPage";
import PlatformManagePage from "./pages/PlatformManagePage";
import KnowledgeAdminPage from "./pages/KnowledgeAdminPage";
import BrandListPage from "./pages/BrandListPage";
import BrandDetailPage from "./pages/BrandDetailPage";
import PregnancyWeeklyPage from "./pages/PregnancyWeeklyPage";
import PregnancyRecipePage from "./pages/PregnancyRecipePage";
import KidsEncyclopediaPage from "./pages/KidsEncyclopediaPage";
import FetalStoryPage from "./pages/FetalStoryPage";
import NotificationPage from "./pages/NotificationPage";
import FavoritePage from "./pages/FavoritePage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<PermissionGuard perm="menu_home" label="首页"><HomePage /></PermissionGuard>} />
        <Route path="/timeline" element={<PermissionGuard perm="menu_timeline" label="时间轴"><TimelinePage /></PermissionGuard>} />
        <Route path="/weekly" element={<PermissionGuard perm="menu_timeline" label="孕期周历"><PregnancyWeeklyPage /></PermissionGuard>} />
        <Route path="/recipes" element={<PermissionGuard perm="menu_recipes" label="孕期食谱"><PregnancyRecipePage /></PermissionGuard>} />
        <Route path="/kids-encyclopedia" element={<PermissionGuard perm="menu_encyclopedia" label="幼儿百科"><KidsEncyclopediaPage /></PermissionGuard>} />
        <Route path="/timeline/:id" element={<PermissionGuard perm="menu_timeline" label="时间轴"><TimelineDetailPage /></PermissionGuard>} />
        <Route path="/products" element={<PermissionGuard perm="menu_products" label="商品库"><ProductListPage /></PermissionGuard>} />
        <Route path="/products/:id" element={<PermissionGuard perm="menu_products" label="商品详情"><ProductDetailPage /></PermissionGuard>} />
        <Route path="/compare" element={<PermissionGuard perm="menu_products" label="商品对比"><ComparePage /></PermissionGuard>} />
        <Route path="/shopping-list" element={<PermissionGuard perm="menu_shopping_list" label="待产包清单"><ShoppingListPage /></PermissionGuard>} />
        <Route path="/shopping-list/generate" element={<PermissionGuard perm="shopping_list_create" label="智能待产包"><GenerateShoppingListPage /></PermissionGuard>} />
        <Route path="/shopping-list/ref/:id" element={<PermissionGuard perm="menu_shopping_list" label="待产包预置"><BabyShoppingDetailPage /></PermissionGuard>} />
        <Route path="/shopping-list/:id" element={<PermissionGuard perm="menu_shopping_list" label="待产包清单"><ShoppingListDetailPage /></PermissionGuard>} />
        <Route path="/health" element={<PermissionGuard perm="menu_health" label="健康中心"><HealthPage /></PermissionGuard>} />
        <Route path="/ai-assistant" element={<PermissionGuard perm="menu_ai_assistant" label="AI 助手"><AIAssistantPage /></PermissionGuard>} />
        <Route path="/weather" element={<PermissionGuard perm="menu_weather" label="天气"><WeatherPage /></PermissionGuard>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/ai" element={<AIConfigPage />} />
        <Route path="/admin/registration" element={<AdminGuard perm="menu_admin_registration"><RegistrationManagePage /></AdminGuard>} />
        <Route path="/admin/products" element={<AdminGuard perm="menu_admin_products_manage"><ProductAdminPage /></AdminGuard>} />
        <Route path="/admin/users" element={<AdminGuard perm="menu_admin_users"><UserManagePage /></AdminGuard>} />
        <Route path="/admin/audit-logs" element={<AdminGuard perm="menu_admin_audit_logs"><AuditLogPage /></AdminGuard>} />
        <Route path="/admin/daily-tips" element={<AdminGuard perm="menu_admin_daily_tips"><DailyTipsManagePage /></AdminGuard>} />
        <Route
          path="/admin/knowledge-base"
          element={
            <AdminGuard
              perms={[
                "menu_admin_kb_timeline",
                "menu_admin_kb_stories",
                "menu_admin_kb_recipes",
                "menu_admin_kb_encyclopedia",
                "menu_admin_kb_shopping",
              ]}
            >
              <KnowledgeAdminPage />
            </AdminGuard>
          }
        />
        <Route path="/admin/service-config" element={<AdminGuard perm="menu_admin_service_config"><AdminServiceConfigPage /></AdminGuard>} />
        <Route path="/admin/backups" element={<AdminGuard perm="menu_admin_backups"><AdminBackupPage /></AdminGuard>} />
          <Route path="/admin/platforms" element={<AdminGuard perm="menu_admin_platforms"><PlatformManagePage /></AdminGuard>} />
          <Route path="/platforms" element={<PermissionGuard perm="menu_third_party_hub" label="三方中转站"><ThirdPartyHubPage /></PermissionGuard>} />
        <Route path="/brands" element={<BrandListPage />} />
        <Route path="/brands/:id" element={<BrandDetailPage />} />
        <Route path="/fetal-stories" element={<PermissionGuard perm="menu_fetal_stories" label="胎教故事"><FetalStoryPage /></PermissionGuard>} />
        <Route path="/notifications" element={<PermissionGuard perm="menu_notifications" label="消息通知"><NotificationPage /></PermissionGuard>} />
        <Route path="/favorites" element={<PermissionGuard perm="menu_favorites" label="我的收藏"><FavoritePage /></PermissionGuard>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}