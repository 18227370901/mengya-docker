import { useAuthStore } from "./store/authStore";
import { ShieldAlert, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

function PermissionGuard({ perm, children }: { perm: string; children: React.ReactNode }) {
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
    return (
      <div className="card my-12 mx-auto max-w-md space-y-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">暂无该功能访问权限</h2>
          <p className="mt-1 text-xs text-gray-400">管理员已关闭您的该页面菜单或功能访问权限，如需使用请联系管理员开通。</p>
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

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
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

  if (!user.is_staff) {
    return (
      <div className="card my-12 mx-auto max-w-md space-y-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">无权访问管理后台</h2>
          <p className="mt-1 text-xs text-gray-400">该页面仅限系统超级管理员访问，已对非授权账号严格阻断。</p>
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
  return <>{children}</>;
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
import ProfilePage from "./pages/ProfilePage";
import AIConfigPage from "./pages/AIConfigPage";
import RegistrationManagePage from "./pages/RegistrationManagePage";
import ProductAdminPage from "./pages/ProductAdminPage";
import UserManagePage from "./pages/UserManagePage";
import AuditLogPage from "./pages/AuditLogPage";
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
        <Route path="/" element={<PermissionGuard perm="menu_home"><HomePage /></PermissionGuard>} />
        <Route path="/timeline" element={<PermissionGuard perm="menu_timeline"><TimelinePage /></PermissionGuard>} />
        <Route path="/weekly" element={<PermissionGuard perm="menu_timeline"><PregnancyWeeklyPage /></PermissionGuard>} />
        <Route path="/recipes" element={<PermissionGuard perm="menu_recipes"><PregnancyRecipePage /></PermissionGuard>} />
        <Route path="/kids-encyclopedia" element={<PermissionGuard perm="menu_encyclopedia"><KidsEncyclopediaPage /></PermissionGuard>} />
        <Route path="/timeline/:id" element={<PermissionGuard perm="menu_timeline"><TimelineDetailPage /></PermissionGuard>} />
        <Route path="/products" element={<PermissionGuard perm="menu_products"><ProductListPage /></PermissionGuard>} />
        <Route path="/products/:id" element={<PermissionGuard perm="menu_products"><ProductDetailPage /></PermissionGuard>} />
        <Route path="/compare" element={<PermissionGuard perm="menu_products"><ComparePage /></PermissionGuard>} />
        <Route path="/shopping-list" element={<PermissionGuard perm="menu_shopping_list"><ShoppingListPage /></PermissionGuard>} />
        <Route path="/shopping-list/generate" element={<PermissionGuard perm="shopping_list_create"><GenerateShoppingListPage /></PermissionGuard>} />
        <Route path="/shopping-list/ref/:id" element={<PermissionGuard perm="menu_shopping_list"><BabyShoppingDetailPage /></PermissionGuard>} />
        <Route path="/shopping-list/:id" element={<PermissionGuard perm="menu_shopping_list"><ShoppingListDetailPage /></PermissionGuard>} />
        <Route path="/health" element={<PermissionGuard perm="menu_health"><HealthPage /></PermissionGuard>} />
        <Route path="/ai-assistant" element={<PermissionGuard perm="menu_ai_assistant"><AIAssistantPage /></PermissionGuard>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/ai" element={<AIConfigPage />} />
        <Route path="/admin/registration" element={<AdminGuard><RegistrationManagePage /></AdminGuard>} />
        <Route path="/admin/products" element={<AdminGuard><ProductAdminPage /></AdminGuard>} />
        <Route path="/admin/users" element={<AdminGuard><UserManagePage /></AdminGuard>} />
        <Route path="/admin/audit-logs" element={<AdminGuard><AuditLogPage /></AdminGuard>} />
        <Route path="/brands" element={<BrandListPage />} />
        <Route path="/brands/:id" element={<BrandDetailPage />} />
        <Route path="/fetal-stories" element={<PermissionGuard perm="menu_fetal_stories"><FetalStoryPage /></PermissionGuard>} />
        <Route path="/notifications" element={<PermissionGuard perm="menu_notifications"><NotificationPage /></PermissionGuard>} />
        <Route path="/favorites" element={<PermissionGuard perm="menu_favorites"><FavoritePage /></PermissionGuard>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}