import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** 需要登录的页面包装：初始化 auth 状态，未登录则跳转 /login */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuthStore();
  const navigate = useNavigate();
  const called = useRef(false);

  // 挂载时立即初始化（只调一次）
  useEffect(() => {
    if (!called.current) {
      called.current = true;
      init();
    }
  }, [init]);

  // 初始化完成后，如果没有 token 且没有 user，跳转登录
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, navigate]);

  // loading 或未登录时，显示加载界面，不渲染受保护内容（防止闪现）
  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-400">
        加载中…
      </div>
    );
  }

  return <>{children}</>;
}
