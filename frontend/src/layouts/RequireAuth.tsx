import { useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** 需要登录的页面包装：初始化 auth 状态，未登录重定向 /login，全员会话无操作超时防护，权限实时静默同步 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, init, logout, fetchMe } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const called = useRef(false);
  const lastSyncTimeRef = useRef(0);

  // 初次挂载时执行初始化（只一次）
  useEffect(() => {
    if (!called.current) {
      called.current = true;
      init();
    }
  }, [init]);

  // 初始化完成后，若没有 token 或没有 user，重定向登录
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, navigate]);

  // ===== 全员登录会话无操作超时核心判定（模式 A：覆盖全平台所有登录账号） =====
  const checkIdleTimeout = useCallback(() => {
    if (!user) return false;
    const timeoutMinsStr = localStorage.getItem("mengya_admin_timeout");
    const timeoutMins = timeoutMinsStr !== null ? Number(timeoutMinsStr) : 30;
    // 0 表示禁用无操作超时检测
    if (timeoutMins <= 0) return false;

    const lastActiveStr = localStorage.getItem("mengya_last_active");
    const lastActive = lastActiveStr ? Number(lastActiveStr) : Date.now();
    const idleMs = Date.now() - lastActive;

    if (idleMs >= timeoutMins * 60 * 1000) {
      logout();
      localStorage.removeItem("mengya_last_active");
      navigate("/login?timeout=1", { replace: true });
      return true;
    }
    return false;
  }, [user, logout, navigate]);

  // 路由变化时静默同步最新用户信息与权限（3秒节流防抖；优先判定超时状态）
  useEffect(() => {
    if (!user) return;
    if (checkIdleTimeout()) return;
    const now = Date.now();
    if (now - lastSyncTimeRef.current > 3000) {
      lastSyncTimeRef.current = now;
      fetchMe();
    }
  }, [location.pathname, user, fetchMe, checkIdleTimeout]);

  // 窗口聚焦与页面可见性恢复时静默同步权限（优先做超时判定，避免已超时仍被后台同步重置）
  useEffect(() => {
    if (!user) return;
    const handleFocus = () => {
      if (checkIdleTimeout()) return;
      const now = Date.now();
      if (now - lastSyncTimeRef.current > 3000) {
        lastSyncTimeRef.current = now;
        fetchMe();
      }
    };
    window.addEventListener("focus", handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user, fetchMe, checkIdleTimeout]);

  // 定时静默同步权限：前台活动且未超时时每60秒同步一次
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        if (!checkIdleTimeout()) {
          fetchMe();
        }
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [user, fetchMe, checkIdleTimeout]);

  // ===== 物理人机交互事件监听与空闲心跳轮询引擎 =====
  useEffect(() => {
    if (!user) return;

    if (!localStorage.getItem("mengya_last_active")) {
      localStorage.setItem("mengya_last_active", String(Date.now()));
    }

    let lastThrottleTime = 0;
    const updateActivity = () => {
      const now = Date.now();
      // 3秒节流写入 localStorage
      if (now - lastThrottleTime > 3000) {
        lastThrottleTime = now;
        localStorage.setItem("mengya_last_active", String(now));
      }
    };

    // 仅监听真实的物理人机交互事件（键鼠、触屏、滚动、点击）
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));

    // 跨 Tab / 跨窗口活动状态同步监听
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "mengya_last_active" && e.newValue) {
        // 其他 Tab 产生了交互，本 Tab 也及时感知
      }
    };
    window.addEventListener("storage", handleStorage);

    // 每 5 秒轮询检查一次空闲是否达标（及时触发踢出与友好跳转）
    const timer = setInterval(() => {
      checkIdleTimeout();
    }, 5000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, updateActivity));
      window.removeEventListener("storage", handleStorage);
      clearInterval(timer);
    };
  }, [user, checkIdleTimeout]);

  // loading 或未登录时仅显示加载界面，不渲染业务子组件，防止闪烁
  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  return <>{children}</>;
}
