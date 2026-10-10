import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

interface ListPaginationState<T> {
  /** 当前页数据切片（已切片，直接渲染） */
  pageItems: T[];
  /** 全量排序后数据（供全选当前页等场景使用，包含未分页部分） */
  sorted: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  /** 数据源变化（删除/刷新）后调用：若当前页被清空自动回退到上一有效页 */
  notifyDataChanged: () => void;
}

/**
 * v1.57 列表分页 Hook（含每页条数 localStorage 记忆）
 *
 * @param data 原始数据数组
 * @param sortFn 排序函数（如按日期倒序）
 * @param storageKey 每页条数持久化键（同键各列表共享记忆用户偏好）
 * @param defaultPageSize 默认 5 条/页
 */
export function useListPagination<T>(
  data: T[],
  sortFn: (a: T, b: T) => number,
  storageKey: string,
  defaultPageSize = 5
): ListPaginationState<T> {
  const [pageSize, setPageSizeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const n = saved ? parseInt(saved, 10) : NaN;
      return PAGE_SIZE_OPTIONS.includes(n) ? n : defaultPageSize;
    } catch {
      return defaultPageSize;
    }
  });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => [...data].sort(sortFn), [data, sortFn]);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 页码/页大小越界自动收敛（删除后当前页清空回退、缩小页大小后超界回退）
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // 切换每页条数后回到第一页，避免落到大偏移的空页
  const setPageSize = (s: number) => {
    if (!PAGE_SIZE_OPTIONS.includes(s)) return;
    setPageSizeState(s);
    try {
      localStorage.setItem(storageKey, String(s));
    } catch {
      /* localStorage 不可用时静默降级为会话内记忆 */
    }
    setPage(1);
  };

  const pageItems = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  );

  /** 数据源变化后主动收缩页码（应对当前页被整页删除且 total 变 0 的场景） */
  const notifyDataChanged = () => {
    const tp = Math.max(1, Math.ceil(data.length / pageSize));
    setPage((p) => Math.min(p, tp));
  };

  return { pageItems, sorted, page, pageSize, totalPages, total, setPage, setPageSize, notifyDataChanged };
}

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  /** 条数单位文案（默认"条"） */
  unitLabel?: string;
}

/** v1.57 通用分页条：页码导航 + 每页条数选择器（5/10/20/50） */
export default function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unitLabel = "条",
}: PaginationBarProps) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
      <span className="text-[11px] text-gray-400">
        共 {total} {unitLabel} · 第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          aria-label="每页显示条数"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s} {unitLabel}/页
            </option>
          ))}
        </select>
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
                <span key={`gap-${idx}`} className="px-1 text-[11px] text-gray-300 dark:text-gray-600">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`h-6 min-w-6 rounded-lg px-1.5 text-[11px] font-medium transition ${
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
      </div>
    </div>
  );
}
