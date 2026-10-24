import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Lock } from "lucide-react";

/** 需要登录的页面包装：初始化 auth 状态，全员会话无操作超时防护与现场弹窗提示，权限实时静默同步 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, init, logout, fetchMe } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const called = useRef(false);
  const lastSyncTimeRef = useRef(0);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [timeoutMinsDisplay, setTimeoutMinsDisplay] = useState(30);

  // 初次挂载时执行初始化（只一次）
  useEffect(() => {
    if (!called.current) {
      called.current = true;
      init();
    }
  }, [init]);

  // 获取当前配置的无操作超时分钟数
  const getTimeoutMinutes = useCallback(() => {
    const str = localStorage.getItem("mengya_admin_timeout");
    if (str === null || str === undefined || str === "") {
      return 30;
    }
    const val = Number(str);
    return Number.isNaN(val) ? 30 : val;
  }, []);

  // 获取上次活动时间戳
  const getLastActive = useCallback(() => {
    const str = localStorage.getItem("mengya_last_active");
    if (!str) return Date.now();
    const val = Number(str);
    return Number.isNaN(val) ? Date.now() : val;
  }, []);

  // 核心超时判定函数
  const checkIsTimedOut = useCallback(() => {
    const timeoutMins = getTimeoutMinutes();
    if (timeoutMins <= 0) return false; // 0 表示禁用
    const lastActive = getLastActive();
    const idleMs = Date.now() - lastActive;
    return idleMs >= timeoutMins * 60 * 1000;
  }, [getTimeoutMinutes, getLastActive]);

  // 触发超时处理流程：阻断式弹窗并清理认证状态
  const triggerTimeout = useCallback(() => {
    const mins = getTimeoutMinutes();
    setTimeoutMinsDisplay(mins > 0 ? mins : 30);
    sessionStorage.setItem("mengya_timeout_logout", "1");
    localStorage.removeItem("mengya_last_active");
    logout();
    setIsTimedOut(true);
  }, [getTimeoutMinutes, logout]);

  // 初始化完成后，若没有 token 或没有 user，且非超时状态，重定向到登录页
  useEffect(() => {
    if (!loading && !user && !isTimedOut) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, isTimedOut, navigate]);

  // 路由变化时静默同步最新用户信息与权限（优先判定超时状态）
  useEffect(() => {
    if (!user || isTimedOut) return;
    if (checkIsTimedOut()) {
      triggerTimeout();
      return;
    }
    const now = Date.now();
    if (now - lastSyncTimeRef.current > 3000) {
      lastSyncTimeRef.current = now;
      fetchMe();
    }
  }, [location.pathname, user, isTimedOut, checkIsTimedOut, triggerTimeout, fetchMe]);

  // 窗口聚焦与页面可见性恢复时（优先做超时判定，防止已超时仍被后台同步重置）
  useEffect(() => {
    if (!user || isTimedOut) return;
    const handleFocus = () => {
      if (checkIsTimedOut()) {
        triggerTimeout();
        return;
      }
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
  }, [user, isTimedOut, checkIsTimedOut, triggerTimeout, fetchMe]);

  // 定时静默同步权限：前台活动且未超时时每 60 秒同步一次
  useEffect(() => {
    if (!user || isTimedOut) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        if (checkIsTimedOut()) {
          triggerTimeout();
        } else {
          fetchMe();
        }
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [user, isTimedOut, checkIsTimedOut, triggerTimeout, fetchMe]);

  // ===== 物理人机交互事件监听与高频空闲巡检引擎 =====
  useEffect(() => {
    if (!user || isTimedOut) return;

    if (!localStorage.getItem("mengya_last_active")) {
      localStorage.setItem("mengya_last_active", String(Date.now()));
    }

    let lastThrottleTime = 0;
    const updateActivity = () => {
      // 核心防线：若已经达到超时时限，绝不允许任何人机事件重置活跃时间，立即触发超时弹窗！
      if (checkIsTimedOut()) {
        triggerTimeout();
        return;
      }
      const now = Date.now();
      // 2 秒节流落盘
      if (now - lastThrottleTime > 2000) {
        lastThrottleTime = now;
        localStorage.setItem("mengya_last_active", String(now));
      }
    };

    // 仅监听真实的物理人机交互事件（键鼠点击/移动、键盘敲击、触屏拖拽、滚轮滚动）
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));

    // 跨 Tab / 跨窗口状态监听
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "mengya_admin_timeout") {
        // 管理员更新了超时配置，立即重新判定
        if (checkIsTimedOut()) {
          triggerTimeout();
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    // 每 2 秒高频轮询检查一次空闲是否达标（及时触发弹窗提示）
    const timer = setInterval(() => {
      if (checkIsTimedOut()) {
        triggerTimeout();
      }
    }, 2000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, updateActivity));
      window.removeEventListener("storage", handleStorage);
      clearInterval(timer);
    };
  }, [user, isTimedOut, checkIsTimedOut, triggerTimeout]);

  // 1. 若触发会话超时，直接呈现全屏遮罩强提示模态框，彻底阻断操作并提示用户重新登录
  if (isTimedOut) {
    return (
      <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400 mb-4">
            <Lock className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">登录会话已超时</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            您已连续 <span className="font-semibold text-orange-600">{timeoutMinsDisplay} 分钟</span> 未进行任何操作。为保障账户数据安全，系统已自动退出登录，请重新登录以继续使用。
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/login?timeout=1";
              }}
              className="w-full btn btn-primary py-2.5 font-medium shadow-md flex items-center justify-center gap-2"
            >
              <Lock className="h-4 w-4" />
              重新登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. loading 或未登录时仅显示加载界面，不渲染业务子组件，防止闪烁
  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  return <>{children}</>;
}
