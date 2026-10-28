/**
 * v1.88.2 CSV 导入结果明细弹窗（v1.88.3 扩展双模式）
 *
 * 两种展示模式：
 * - kind="result"：数据行导入结果 —— 成功 N 条/失败 M 条 + 逐行失败原因（含真实文件行号）；
 *   导入完成且有失败行时弹窗展示明细，便于按行号修正 CSV 后重导；
 * - kind="error"：接口级失败（网络异常/权限不足/服务器错误）—— 常驻展示错误信息，
 *   必须手动点击「知道了」关闭。
 * 除纯成功（仅 toast 自动消失）外，任何异常均通过本弹窗常驻展示，等待用户手动确认。
 */
import { AlertCircle, CheckCircle2, X } from "lucide-react";

interface CsvImportResultModalProps {
  /** 是否展示 */
  open: boolean;
  /** 展示模式：result=数据行导入结果；error=接口级失败 */
  kind?: "result" | "error";
  /** 弹窗标题（默认「导入结果」，接口失败可传「导入失败」） */
  title?: string;
  /** 成功条数（result 模式） */
  created?: number;
  /** 失败原因明细（result 模式，来自后端 data.errors） */
  errors?: string[];
  /** 接口失败消息（error 模式） */
  message?: string;
  onClose: () => void;
}

export default function CsvImportResultModal({
  open,
  kind = "result",
  title,
  created = 0,
  errors = [],
  message = "",
  onClose,
}: CsvImportResultModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:border dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
            {kind === "error" ? title || "导入失败" : title || "导入结果"}
          </h3>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 汇总 / 错误信息 */}
        <div className="flex items-center gap-4 px-5 py-3">
          {kind === "error" ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              导入未完成，请处理以下问题
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                成功 {created} 条
              </span>
              {errors.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-500">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  失败 {errors.length} 条
                </span>
              )}
            </>
          )}
        </div>

        {/* 明细 / 错误消息 */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {kind === "error" ? (
            <p className="rounded-xl border border-red-100 bg-red-50/70 px-4 py-3 text-xs leading-relaxed text-red-600">
              {message || "导入失败，请重试"}
            </p>
          ) : errors.length === 0 ? (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
              全部数据已成功导入，无需处理。
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-gray-400">
                请按下列行号与原因修正 CSV 后重新导入（# 开头说明行与表头不计入数据）：
              </p>
              <ul className="space-y-1.5">
                {errors.map((e, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-600"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-all">{e}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* 底部：常驻等待用户手动确认（只有用户点击「知道了」才会关闭） */}
        <div className="flex justify-end border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button type="button" className="btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}