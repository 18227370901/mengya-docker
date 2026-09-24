import { Baby, Bell, Bot, Calendar, Heart, Home, LogOut, Moon, Search, ShoppingBag, Sprout, Sun, User } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";

const ALL_navItems = [
  { to: "/", label: "首页", icon: Home, perm: "menu_home" },
  { to: "/timeline", label: "时间轴", icon: Calendar, perm: "menu_timeline" },
  { to: "/products", label: "商品库", icon: Search, perm: "menu_products" },
  { to: "/ai-assistant", label: "AI助手", icon: Bot, perm: "menu_ai_assistant" },
  { to: "/profile", label: "我的", icon: User },
];

export default function MainLayout() {
  const { user, loading, logout, hasPermission } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const navItems = ALL_navItems.filter((it) => user?.is_staff || !it.perm || hasPermission(it.perm));
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-orange-100 bg-white/90 backdrop-blur transition-colors duration-200 dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <Sprout className="h-7 w-7 text-brand-500" />
            <span className="text-xl font-bold text-brand-600 dark:text-brand-500">萌芽</span>
            <span className="hidden text-xs text-gray-400 dark:text-gray-500 sm:inline">生命最初3000天陪伴</span>
          </NavLink>
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-950/60 dark:text-brand-400"
                      : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* 主题切换按钮 */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-gray-500 transition hover:bg-gray-100 hover:text-brand-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-amber-400"
              title={isDark ? "切换为白天模式" : "切换为黑夜模式"}
              aria-label="切换主题模式"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>

            {!loading && !user && (
              <button className="btn-primary" onClick={() => navigate("/login")}>
                登录
              </button>
            )}
            {user && (
              <>
                <span className="hidden items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 sm:flex">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  {user.nickname || user.phone}
                </span>
                <button
                  className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
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
              `flex flex-col items-center gap-0.5 py-2 text-xs transition ${
                isActive ? "text-brand-500 dark:text-brand-400 font-medium" : "text-gray-400 dark:text-gray-500"
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
