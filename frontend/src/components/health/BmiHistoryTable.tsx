import { Fragment, useMemo, useState } from "react";
import { ClipboardList, Trash2, ChevronDown, ChevronUp, FileText, Sparkles, Edit3 } from "lucide-react";
import type { BmiTimeSeriesRecord } from "@/types/health";
import { gestationLabel } from "@/utils/gestation";
import { useAuthStore } from "@/store/authStore";
import CopyButton from "@/components/CopyButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PaginationBar, { useListPagination } from "@/components/ui/PaginationBar";

interface BmiHistoryTableProps {
  records: BmiTimeSeriesRecord[];
  loading?: boolean;
  onDelete: (id: number) => Promise<void> | void;
  /** v1.57：批量删除（后端单事务批量接口） */
  onBatchDelete: (ids: number[]) => Promise<void> | void;
  deletingId?: number | null;
  /** v2.00：单条编辑打卡明细（调出统一打卡弹窗回填修改） */
  onEdit?: (record: BmiTimeSeriesRecord) => void;
}

/** 达标状态徽章渲染 */
function GainStatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (status === "normal") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        增重达标
      </span>
    );
  }
  if (status === "below") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
        增重偏低
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
      增重超标
    </span>
  );
}

export default function BmiHistoryTable({ records, loading, onDelete, onBatchDelete, deletingId, onEdit }: BmiHistoryTableProps) {
  const { hasPermission } = useAuthStore();
  const canDelete = hasPermission("health_record_delete");
  const canEdit = hasPermission("health_record_update");
  // v1.57：单条删除确认 / 批量删除确认 / 批删执行中
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // v1.61：支持历史表折叠展开，空数据时默认紧凑
  const [isCollapsed, setIsCollapsed] = useState(false);
  // v1.59：展开打卡详情（备注 + AI 临床解读）
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const sortDesc = useMemo(
    () => (a: BmiTimeSeriesRecord, b: BmiTimeSeriesRecord) =>
      a.record_date === b.record_date ? b.id - a.id : a.record_date < b.record_date ? 1 : -1,
    []
  );
  const { pageItems, page, pageSize, totalPages, total, setPage, setPageSize } = useListPagination(
    records,
    sortDesc,
    "mengya_page_size_bmi_history",
    5
  );

  const baselineId = useMemo(() => {
    if (records.length === 0) return null;
    const earliest = [...records].sort((a, b) =>
      a.record_date === b.record_date ? a.id - b.id : a.record_date < b.record_date ? -1 : 1
    );
    return earliest[0].id;
  }, [records]);

  // v1.57 同日脏数据检测：历史上同日多条时提示用户可勾选清理
  const duplicateDateCount = useMemo(() => {
    const dateCount = new Map<string, number>();
    records.forEach((r) => dateCount.set(r.record_date, (dateCount.get(r.record_date) || 0) + 1));
    return [...dateCount.values()].filter((c) => c > 1).length;
  }, [records]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 全选当前页（跨页不选中，防止误删未浏览数据） */
  const toggleSelectPage = () => {
    const pageIds = pageItems.map((r) => r.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const pageAllSelected = pageItems.length > 0 && pageItems.every((r) => selected.has(r.id));

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      await onBatchDelete([...selected]);
      setSelected(new Set());
      setBatchConfirm(false);
    } finally {
      setBatchDeleting(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 pb-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              测量打卡历史数据表
            </h3>
            <p className="text-xs text-gray-400">
              支持按天回溯历史打卡 · 点击「详情」展开备注与AI解读 · 勾选支持批量删除 · 删除后图表自动刷新
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600 dark:bg-brand-950/50 dark:text-brand-300">
            共 {records.length} 条打卡
          </span>
          {canDelete && selected.size > 0 && (
            <button
              type="button"
              onClick={() => setBatchConfirm(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除所选 ({selected.size})
            </button>
          )}
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="btn-secondary shrink-0 gap-1 text-xs"
              title={isCollapsed ? "展开历史数据表" : "收起历史数据表"}
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {isCollapsed ? "展开表格" : "收起表格"}
            </button>
          )}
        </div>
      </div>

      {duplicateDateCount > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          检测到 {duplicateDateCount} 个日期存在多条历史记录（历史数据，新打卡已强制同日唯一）——可勾选多余记录批量删除清理。
        </div>
      )}

      {isCollapsed ? (
        <div className="rounded-xl bg-orange-50/50 px-4 py-3 text-xs text-gray-500 dark:bg-gray-900/40 dark:text-gray-400 flex items-center justify-between">
          <span>历史打卡数据表已收起（共 {records.length} 条记录），可随时展开查看明细。</span>
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="text-brand-600 hover:text-brand-700 dark:text-brand-400 text-xs font-medium ml-2"
          >
            展开查看
          </button>
        </div>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-gray-400">历史数据加载中…</p>
      ) : total === 0 ? (
        <div className="rounded-xl bg-orange-50/40 px-4 py-3.5 text-center text-xs text-gray-400 dark:bg-gray-900/30 dark:text-gray-500">
          暂无测量打卡记录 · 完成一次健康打卡后将在此自动生成结构化历史档案
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] uppercase text-gray-400 dark:border-gray-800">
                  {canDelete && (
                    <th className="w-8 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={toggleSelectPage}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                        aria-label="全选当前页"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2.5 font-semibold">测量日期</th>
                  <th className="px-3 py-2.5 font-semibold">阶段</th>
                  <th className="px-3 py-2.5 font-semibold">身高 (cm)</th>
                  <th className="px-3 py-2.5 font-semibold">实测体重 (kg)</th>
                  <th className="px-3 py-2.5 font-semibold">BMI</th>
                  <th className="px-3 py-2.5 font-semibold">腹围 (cm)</th>
                  <th className="px-3 py-2.5 font-semibold">增量 (Δ kg)</th>
                  <th className="px-3 py-2.5 font-semibold">达标状态</th>
                  <th className="w-16 px-2 py-2.5 text-center font-semibold">明细</th>
                  {(canDelete || (canEdit && !!onEdit)) && <th className="px-3 py-2.5 text-right font-semibold">操作</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const isBaseline = r.id === baselineId;
                  const isDeleting = deletingId === r.id;
                  const isSelected = selected.has(r.id);
                  const isExpanded = expandedIds.has(r.id);
                  const hasDetails = !!(r.note || (r as any).ai_analysis);

                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`border-b border-gray-50 transition hover:bg-orange-50/40 dark:border-gray-800/60 dark:hover:bg-gray-800/40 ${
                          isSelected ? "bg-orange-50/60 dark:bg-gray-800/60" : ""
                        }`}
                      >
                        {canDelete && (
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(r.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                              aria-label={`选择 ${r.record_date} 打卡`}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5 font-medium text-gray-700 dark:text-gray-200">
                          {r.record_date}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                          {r.stage === "general" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              🌿 非孕期/备孕
                            </span>
                          ) : r.stage === "postpartum" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              🤱 {r.postpartum_months != null ? `产后 ${r.postpartum_months} 个月` : "产后恢复"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              🤰 {r.gestational_week ? gestationLabel(r.gestational_week, r.gestational_days) : "全孕期"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                          {r.height ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-gray-800 dark:text-gray-100">
                          {r.weight}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                          {r.bmi ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                          {r.waist_circumference ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                          {isBaseline ? (
                            <span className="text-gray-400">基准</span>
                          ) : (
                            <span
                              className={
                                r.delta_kg > 0.9
                                  ? "font-semibold text-red-500"
                                  : r.delta_kg > 0.6
                                  ? "font-semibold text-amber-500"
                                  : r.delta_kg < -0.5
                                  ? "font-semibold text-indigo-500"
                                  : "font-semibold text-emerald-600 dark:text-emerald-400"
                              }
                            >
                              {r.delta_kg > 0 ? "+" : ""}
                              {r.delta_kg}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <GainStatusBadge status={r.gain_status} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(r.id)}
                              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40 transition"
                              title={isExpanded ? "收起详情" : "查看打卡备注与AI医学解读"}
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              <span>{isExpanded ? "收起" : "详情"}</span>
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        {(canDelete || (canEdit && !!onEdit)) && (
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && onEdit && (
                                <button
                                  type="button"
                                  onClick={() => onEdit(r)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-gray-700 cursor-pointer"
                                  title={`编辑 ${r.record_date} 体重与BMI记录`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  编辑
                                </button>
                              )}
                              {canDelete && (
                                isDeleting ? (
                                  <span className="text-[11px] text-gray-400">删除中…</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmId(r.id)}
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {isExpanded && hasDetails && (
                        <tr className="border-b border-orange-100/60 bg-orange-50/30 dark:border-gray-800/80 dark:bg-gray-800/40">
                          <td colSpan={(canDelete || (canEdit && !!onEdit)) ? 11 : 10} className="px-4 py-3">
                            <div className="space-y-2 rounded-xl border border-orange-100/80 bg-white p-3 shadow-2xs dark:border-gray-800 dark:bg-gray-900">
                              <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                <FileText className="h-3.5 w-3.5 text-brand-500" />
                                <span>{r.record_date} 打卡明细记录</span>
                              </div>
                              {r.note && (
                                <div className="rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                  <div className="mb-1 flex items-center justify-between">
                                    <span className="font-semibold text-gray-500 dark:text-gray-400">打卡备注：</span>
                                    <CopyButton text={r.note} label="复制" />
                                  </div>
                                  <p className="whitespace-pre-wrap">{r.note}</p>
                                </div>
                              )}
                              {(r as any).ai_analysis && (
                                <div className="rounded-lg border border-amber-200/60 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                                  <div className="mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1 font-semibold">
                                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                      AI 临床解读：
                                    </span>
                                    <CopyButton text={(r as any).ai_analysis} label="复制" />
                                  </div>
                                  <p className="whitespace-pre-wrap">{(r as any).ai_analysis}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            unitLabel="条打卡"
          />
        </>
      )}

      {/* v1.57 单条删除确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmId !== null}
        title="删除这条打卡记录？"
        message="删除后将无法恢复，时序图表看板与统计将同步联动刷新。"
        confirmText="确认删除"
        loading={deletingId === confirmId}
        onConfirm={async () => {
          if (confirmId != null) await onDelete(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />

      {/* v1.57 批量删除确认弹窗 */}
      <ConfirmDialog
        isOpen={batchConfirm}
        title={`删除所选 ${selected.size} 条打卡记录？`}
        message="所选记录将被批量删除且无法恢复，时序图表看板与统计将同步联动刷新。"
        detail={`涉及日期：${records
          .filter((r) => selected.has(r.id))
          .sort((a, b) => (a.record_date < b.record_date ? 1 : -1))
          .map((r) => r.record_date)
          .join("、")}`}
        confirmText={`确认删除 ${selected.size} 条`}
        loading={batchDeleting}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchConfirm(false)}
      />
    </div>
  );
}
