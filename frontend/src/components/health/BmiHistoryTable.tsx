import { useMemo, useState } from "react";
import { ClipboardList, Trash2 } from "lucide-react";
import type { BmiTimeSeriesRecord } from "@/types/health";
import { gestationLabel } from "@/utils/gestation";
import { useAuthStore } from "@/store/authStore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PaginationBar, { useListPagination } from "@/components/ui/PaginationBar";

interface BmiHistoryTableProps {
  records: BmiTimeSeriesRecord[];
  loading?: boolean;
  onDelete: (id: number) => Promise<void> | void;
  /** v1.57：批量删除（后端单事务批量接口） */
  onBatchDelete: (ids: number[]) => Promise<void> | void;
  deletingId?: number | null;
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

export default function BmiHistoryTable({ records, loading, onDelete, onBatchDelete, deletingId }: BmiHistoryTableProps) {
  const { hasPermission } = useAuthStore();
  const canDelete = hasPermission("health_record_delete");
  // v1.57：单条删除确认 / 批量删除确认 / 批删执行中
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

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
              支持按天回溯历史打卡 · 勾选支持单选/多选/全选批量删除 · 删除后时序图表看板将自动联动刷新
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
        </div>
      </div>

      {duplicateDateCount > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          检测到 {duplicateDateCount} 个日期存在多条历史记录（历史数据，新打卡已强制同日唯一）——可勾选多余记录批量删除清理。
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">历史数据加载中…</p>
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          暂无测量打卡记录，完成一次打卡后将在此形成可回溯的历史档案
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
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
                  {canDelete && <th className="px-3 py-2.5 text-right font-semibold">操作</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const isBaseline = r.id === baselineId;
                  const isDeleting = deletingId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-gray-50 transition hover:bg-orange-50/40 dark:border-gray-800/60 dark:hover:bg-gray-800/40 ${
                        selected.has(r.id) ? "bg-orange-50/60 dark:bg-gray-800/60" : ""
                      }`}
                    >
                      {canDelete && (
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                            aria-label={`选择 ${r.record_date} 记录`}
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-700 dark:text-gray-200">
                        {r.record_date}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-400">
                        {r.stage === "general"
                          ? "非孕期"
                          : r.stage === "postpartum"
                          ? r.postpartum_months != null
                            ? `产后 ${r.postpartum_months} 个月`
                            : "产后恢复"
                          : r.gestational_week
                          ? gestationLabel(r.gestational_week, r.gestational_days)
                          : r.stage === "pregnancy"
                          ? "孕期"
                          : r.record_type === "prenatal_exam"
                          ? r.gestational_week
                            ? gestationLabel(r.gestational_week, r.gestational_days)
                            : "孕期"
                          : "—"}
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
                      {canDelete && (
                        <td className="px-3 py-2.5 text-right">
                          {isDeleting ? (
                            <span className="text-[11px] text-gray-400">删除中…</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmId(r.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
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

      {/* v1.57 单条删除确认弹窗（替换原表格内两段式按钮） */}
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
