import { Baby, Bell, Bot, Calendar, Heart, Home, LogOut, Search, ShoppingBag, Sprout, User } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const ALL_navItems = [
  { to: "/", label: "首页", icon: Home, perm: "menu_home" },
  { to: "/timeline", label: "时间轴", icon: Calendar, perm: "menu_timeline" },
  { to: "/products", label: "商品库", icon: Search, perm: "menu_products" },
  { to: "/ai-assistant", label: "AI助手", icon: Bot, perm: "menu_ai_assistant" },
  { to: "/profile", label: "我的", icon: User },
];

export default function MainLayout() {
  const { user, loading, logout, hasPermission } = useAuthStore();
  const navItems = ALL_navItems.filter((it) => user?.is_staff || !it.perm || hasPermission(it.perm));
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-orange-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <Sprout className="h-7 w-7 text-brand-500" />
            <span className="text-xl font-bold text-brand-600">萌芽</span>
            <span className="hidden text-xs text-gray-400 sm:inline">生命最初3000天陪伴</span>
          </NavLink>
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition ${
                    isActive ? "bg-brand-50 font-medium text-brand-600" : "text-gray-500 hover:bg-gray-50"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!loading && !user && (
              <button className="btn-primary" onClick={() => navigate("/login")}>
                登录
              </button>
            )}
            {user && (
              <>
                <span className="hidden items-center gap-1.5 text-sm text-gray-500 sm:flex">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  {user.nickname || user.phone}
                </span>
                <button
                  className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-500"
                  onClick={handleLogout}
                  title="退出登录"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">退出</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      {/* 底部导航（移动端） */}
      <nav className="nav-bottom flex justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs ${
                isActive ? "text-brand-500" : "text-gray-400"
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}