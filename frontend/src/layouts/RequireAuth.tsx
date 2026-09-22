import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** 需要登录的页面包装：初始化 auth 状态，未登录重定向 /login，管理员无操作超时防护 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, init, logout } = useAuthStore();
  const navigate = useNavigate();
  const called = useRef(false);

  // 挂载时触发初始化（只一次）
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

  // ===== 管理员登录无操作超时检测引擎 =====
  useEffect(() => {
    if (!user || !user.is_staff) return;

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

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));

    const timer = setInterval(() => {
      const timeoutMinsStr = localStorage.getItem("mengya_admin_timeout");
      const timeoutMins = timeoutMinsStr !== null ? Number(timeoutMinsStr) : 30;
      // 0 表示禁用无操作超时检测
      if (timeoutMins <= 0) return;

      const lastActiveStr = localStorage.getItem("mengya_last_active");
      const lastActive = lastActiveStr ? Number(lastActiveStr) : Date.now();
      const idleMs = Date.now() - lastActive;

      if (idleMs >= timeoutMins * 60 * 1000) {
        logout();
        localStorage.removeItem("mengya_last_active");
        navigate("/login?timeout=1", { replace: true });
      }
    }, 10000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, updateActivity));
      clearInterval(timer);
    };
  }, [user, logout, navigate]);

  // loading 或未登录时，显示加载界面，不渲染被保护内容（防止闪烁）
  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  return <>{children}</>;
}
