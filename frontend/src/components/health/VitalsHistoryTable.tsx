import { useState, useMemo } from "react";
import {
  ClipboardList,
  Trash2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Droplet,
  Bot,
  AlertTriangle,
  Info,
  Check,
} from "lucide-react";
import type { VitalsTimeSeriesRecord } from "@/types/health";
import { useAuthStore } from "@/store/authStore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PaginationBar, { useListPagination } from "@/components/ui/PaginationBar";

interface VitalsHistoryTableProps {
  records: VitalsTimeSeriesRecord[];
  loading?: boolean;
  onDelete: (id: number) => Promise<void> | void;
  onBatchDelete?: (ids: number[]) => Promise<void> | void;
  onViewAi?: (record: VitalsTimeSeriesRecord) => void;
}

export default function VitalsHistoryTable({
  records,
  loading = false,
  onDelete,
  onBatchDelete,
  onViewAi,
}: VitalsHistoryTableProps) {
  const { hasPermission } = useAuthStore();
  const canDelete = hasPermission("health_record_delete");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false);

  // 按日期降序排列
  const sortFn = useMemo(
    () => (a: VitalsTimeSeriesRecord, b: VitalsTimeSeriesRecord) =>
      b.record_date.localeCompare(a.record_date),
    []
  );

  const {
    page,
    pageSize,
    total,
    totalPages,
    pageItems,
    setPage,
    setPageSize,
  } = useListPagination(records, sortFn, "mengya_vitals_history_page_size", 5);

  const isAllCurrentPageSelected = useMemo(() => {
    if (pageItems.length === 0) return false;
    return pageItems.every((r) => selectedIds.includes(r.id));
  }, [pageItems, selectedIds]);

  const toggleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      const pageIds = new Set(pageItems.map((r) => r.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = new Set([...selectedIds, ...pageItems.map((r) => r.id)]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0 || !onBatchDelete) return;
    try {
      await onBatchDelete(selectedIds);
      setSelectedIds([]);
      setShowBatchDeleteDialog(false);
    } catch {}
  };

  const handleConfirmSingleDelete = async () => {
    if (deletingId == null) return;
    try {
      await onDelete(deletingId);
      setSelectedIds((prev) => prev.filter((id) => id !== deletingId));
      setDeletingId(null);
    } catch {}
  };

  return (
    <div className="card space-y-4 border-rose-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-50 pb-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-950/40">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              生命体征打卡历史明细
            </h3>
            <span className="text-[11px] text-gray-400">
              支持勾选批量删除 · 清晰展示各项指标已录/未录完备度
            </span>
          </div>
        </div>

        {/* 批量操作工具栏 */}
        {selectedIds.length > 0 && canDelete && onBatchDelete && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-1 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <span>已选 {selectedIds.length} 条</span>
            <button
              type="button"
              onClick={() => setShowBatchDeleteDialog(true)}
              className="flex items-center gap-1 font-bold text-rose-600 hover:text-rose-800 underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量删除
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-gray-400">正在载入记录...</div>
      ) : records.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-400">
          暂无生命体征打卡历史，完成首次录入后可在此查看完整明细。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 dark:border-gray-700">
                {canDelete && (
                  <th className="w-8 py-2.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      onChange={toggleSelectAllCurrentPage}
                      className="checkbox-primary h-3.5 w-3.5 rounded"
                    />
                  </th>
                )}
                <th className="py-2.5 px-2">测量日期 / 阶段</th>
                <th className="py-2.5 px-2">血压读数 (mmHg)</th>
                <th className="py-2.5 px-2">血糖读数 (mmol/L)</th>
                <th className="py-2.5 px-2">数据完备度说明</th>
                <th className="py-2.5 px-2">备注 / 症状</th>
                <th className="py-2.5 px-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {pageItems.map((rec) => {
                const isSelected = selectedIds.includes(rec.id);
                const isExpanded = expandedId === rec.id;
                const stageStr = rec.gestational_week
                  ? rec.gestational_days != null && rec.gestational_days > 0
                    ? `孕${rec.gestational_week}周${rec.gestational_days}天`
                    : `孕${rec.gestational_week}周`
                  : rec.postpartum_months
                  ? `产后${rec.postpartum_months}个月`
                  : "非孕期/备孕";

                const stageBadge = rec.stage === "general" || (!rec.stage && !rec.gestational_week && !rec.postpartum_months) ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    🌿 非孕期/备孕
                  </span>
                ) : rec.stage === "postpartum" || (!rec.stage && rec.postpartum_months) ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    🤱 {rec.postpartum_months != null ? `产后${rec.postpartum_months}月` : "产后恢复"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    🤰 {stageStr}
                  </span>
                );

                const hasBp = rec.systolic_bp != null && rec.diastolic_bp != null;
                const hasGlu = rec.blood_sugar != null;

                return (
                  <tr
                    key={rec.id}
                    className={`transition-colors hover:bg-rose-50/20 dark:hover:bg-gray-700/30 ${
                      isSelected ? "bg-rose-50/40 dark:bg-rose-950/20" : ""
                    }`}
                  >
                    {canDelete && (
                      <td className="py-3 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(rec.id)}
                          className="checkbox-primary h-3.5 w-3.5 rounded"
                        />
                      </td>
                    )}

                    <td className="py-3 px-2 font-medium">
                      <div className="font-bold text-gray-800 dark:text-gray-100">
                        {rec.record_date}
                      </div>
                      <div className="mt-0.5">{stageBadge}</div>
                    </td>

                    {/* 血压单元格 */}
                    <td className="py-3 px-2">
                      {hasBp ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                            <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
                            <span>{rec.systolic_bp}/{rec.diastolic_bp}</span>
                            {rec.pulse != null && (
                              <span className="text-[10px] font-normal text-gray-400">
                                ({rec.pulse} bpm)
                              </span>
                            )}
                          </div>
                          <div>
                            <span
                              className={`rounded-md px-1.5 py-0.2 text-[10px] font-semibold ${
                                rec.bp_status === "normal"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : rec.bp_status === "elevated"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              }`}
                            >
                              {rec.bp_status_label || "已记录"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400 dark:bg-gray-800">
                          未录入血压
                        </span>
                      )}
                    </td>

                    {/* 血糖单元格 */}
                    <td className="py-3 px-2">
                      {hasGlu ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                            <Droplet className="h-3.5 w-3.5 text-amber-500" />
                            <span>{rec.blood_sugar}</span>
                            <span className="text-[10px] font-normal text-gray-400">
                              ({rec.glucose_type_label || rec.glucose_type})
                            </span>
                          </div>
                          <div>
                            <span
                              className={`rounded-md px-1.5 py-0.2 text-[10px] font-semibold ${
                                rec.glucose_status === "normal"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : rec.glucose_status === "hypoglycemia"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              }`}
                            >
                              {rec.glucose_status_label || "已测定"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400 dark:bg-gray-800">
                          未录入血糖
                        </span>
                      )}
                    </td>

                    {/* 数据完备度徽章（满足用户清晰说明添加了哪些数据的诉求） */}
                    <td className="py-3 px-2 max-w-xs">
                      {rec.completeness ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {rec.completeness.recorded_items?.map((item) => (
                              <span
                                key={item.key}
                                className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
                              >
                                ✓ {item.label}
                              </span>
                            ))}
                            {rec.completeness.unrecorded_items?.map((item) => (
                              <span
                                key={item.key}
                                className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                              >
                                — {item.label}未测
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {hasBp && hasGlu ? "血压+血糖双录" : hasBp ? "仅血压" : hasGlu ? "仅血糖" : "常规记录"}
                        </span>
                      )}
                    </td>

                    {/* 备注 / 伴随症状 */}
                    <td className="py-3 px-2 text-[11px] text-gray-500 max-w-xs truncate">
                      {rec.symptoms && rec.symptoms.length > 0 && (
                        <div className="text-amber-600 font-medium">
                          {rec.symptoms.join("、")}
                        </div>
                      )}
                      {rec.note ? (
                        <div className="truncate" title={rec.note}>
                          {rec.note}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* 操作列 */}
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {rec.ai_analysis && (
                          <button
                            type="button"
                            onClick={() => onViewAi?.(rec)}
                            title="查看 AI 解读"
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Bot className="h-4 w-4" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingId(rec.id)}
                            title="删除单条记录"
                            className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 分页组件 */}
          <div className="mt-3">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}

      {/* 单条删除确认框 */}
      <ConfirmDialog
        isOpen={deletingId != null}
        title="确认删除生命体征记录？"
        message="删除后将无法恢复，相关血压与血糖时序走势图将同步联动重新计算。"
        confirmText="确认删除"
        danger
        onConfirm={handleConfirmSingleDelete}
        onCancel={() => setDeletingId(null)}
      />

      {/* 批量删除确认框 */}
      <ConfirmDialog
        isOpen={showBatchDeleteDialog}
        title={`确认批量删除选中的 ${selectedIds.length} 条记录？`}
        message="批量删除将在单事务内执行，相关历史走势与统计看板将联动刷新。"
        confirmText="确认批量删除"
        danger
        onConfirm={handleConfirmBatchDelete}
        onCancel={() => setShowBatchDeleteDialog(false)}
      />
    </div>
  );
}
