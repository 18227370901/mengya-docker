import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** 附加详情（如将删除的清单摘要），可选 */
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作红色样式（删除类操作默认 true） */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * v1.57 通用二次确认弹窗（危险操作强制二次确认）
 * 统一替换此前散落各处的 window.confirm 与表格内两段式按钮，
 * 删除/批量删除等高危操作展示红色警示样式与操作明细。
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  detail,
  confirmText = "确认",
  cancelText = "取消",
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800 dark:text-gray-100"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              danger
                ? "bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400"
                : "bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h4>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{message}</p>
            {detail && (
              <p className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                {detail}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary text-xs" disabled={loading}>
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-md transition ${
              danger
                ? "bg-red-500 hover:bg-red-600 disabled:opacity-60"
                : "bg-brand-500 hover:bg-brand-600 disabled:opacity-60"
            }`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
