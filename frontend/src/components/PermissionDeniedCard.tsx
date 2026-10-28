/**
 * v1.88.5 无权限整页提示卡
 *
 * 普通用户访问被管理员关闭的页面（菜单权限被拒，接口返回 code=4030）时，
 * 展示明确的提示卡取代误导性的"暂无内容"空态：
 * 图标 + 标题 + 后端返回的提示文案 + 返回首页按钮。
 */
import { Link } from "react-router-dom";
import { Home, ShieldX } from "lucide-react";

interface PermissionDeniedCardProps {
  /** 提示文案（后端 4030 的 message），缺省给出通用文案 */
  message?: string;
}

export default function PermissionDeniedCard({ message }: PermissionDeniedCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-900/40">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/40">
        <ShieldX className="h-8 w-8 text-red-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">无法访问本页面</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        {message || "管理员已关闭本页面访问，如有需要请联系管理员开启。"}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
      >
        <Home className="h-4 w-4" />
        返回首页
      </Link>
    </div>
  );
}
