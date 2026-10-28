/**
 * v1.88.4 展示页轻量分页条：页码导航 + 自定义每页条数（含"全部"选项）
 * 与管理页 PaginationBar 分开：展示页需要 12/24/48/全部 选项，且 total 来自服务端分页响应。
 * 每页条数选择由父组件持久化（localStorage），本组件只负责展示与回调。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PageSizeOption {
  value: number;
  label: string;
}

interface LightPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** 每页条数选项（如 12/24/48/-1全部） */
  sizeOptions: PageSizeOption[];
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  unitLabel?: string;
}

export default function LightPagination({
  page,
  totalPages,
  total,
  pageSize,
  sizeOptions,
  onPageChange,
  onPageSizeChange,
  unitLabel = "条",
}: LightPaginationProps) {
  if (total === 0) return null;
  const isAll = pageSize === -1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
      <span className="text-xs text-gray-400">
        共 {total} {unitLabel}
        {!isAll && ` · 第 ${page}/${totalPages} 页`}
      </span>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          aria-label="每页显示条数"
        >
          {sizeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!isAll && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-lg p-1 text-gray-400 transition enabled:hover:bg-gray-100 enabled:hover:text-gray-600 disabled:opacity-40 dark:enabled:hover:bg-gray-700"
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<number[]>((acc, p) => {
                if (acc.length && p - acc[acc.length - 1] > 1) acc.push(-1);
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === -1 ? (
                  <span key={`gap-${idx}`} className="px-1 text-xs text-gray-300 dark:text-gray-600">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={`h-7 min-w-7 rounded-lg px-1.5 text-xs font-medium transition ${
                      p === page
                        ? "bg-brand-500 text-white"
                        : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-lg p-1 text-gray-400 transition enabled:hover:bg-gray-100 enabled:hover:text-gray-600 disabled:opacity-40 dark:enabled:hover:bg-gray-700"
              aria-label="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
