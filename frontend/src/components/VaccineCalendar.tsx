import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Edit3, Plus, Trash2, X } from "lucide-react";
import { healthApi } from "@/api/services";
import { useAuthStore } from "@/store/authStore";
import type { HealthRecord } from "@/types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PaginationBar, { useListPagination } from "@/components/ui/PaginationBar";

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/** 标准免疫规划疫苗清单（按月龄排列） */
const PLANNED_VACCINES = [
  { name: "乙肝疫苗第1剂", age: "出生时" },
  { name: "卡介苗", age: "出生时" },
  { name: "乙肝疫苗第2剂", age: "1月龄" },
  { name: "脊灰疫苗第1剂", age: "2月龄" },
  { name: "百白破第1剂", age: "3月龄" },
  { name: "脊灰疫苗第2剂", age: "3月龄" },
  { name: "百白破第2剂", age: "4月龄" },
  { name: "脊灰疫苗第3剂", age: "4月龄" },
  { name: "百白破第3剂", age: "5月龄" },
  { name: "乙肝疫苗第3剂", age: "6月龄" },
  { name: "A群流脑疫苗第1剂", age: "6月龄" },
  { name: "A群流脑疫苗第2剂", age: "9月龄" },
  { name: "麻腮风疫苗第1剂", age: "8月龄" },
  { name: "乙脑疫苗第1剂", age: "8月龄" },
  { name: "麻腮风疫苗第2剂", age: "18月龄" },
  { name: "百白破加强", age: "18月龄" },
  { name: "甲肝疫苗", age: "18月龄" },
  { name: "乙脑疫苗第2剂", age: "2岁" },
  { name: "A+C群流脑疫苗第1剂", age: "3岁" },
  { name: "A+C群流脑疫苗第2剂", age: "6岁" },
  { name: "白破疫苗", age: "6岁" },
];

interface VaccineCalendarProps {
  records: HealthRecord[];
  onChanged?: () => void;
  /** v1.56 P1-A：宝宝生日（用于推算下一针建议） */
  babyBirthday?: string;
}

/** 疫苗日历：按月展示已接种/待接种，支持编辑、删除、年份切换；v1.57 接种记录支持勾选批量删除与分页 */
export default function VaccineCalendar({ records, onChanged, babyBirthday }: VaccineCalendarProps) {
  const now = new Date();
  const { hasPermission } = useAuthStore();
  const canDelete = hasPermission("health_record_delete");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [vaccineName, setVaccineName] = useState("");
  const [vaccineDate, setVaccineDate] = useState(now.toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  // v1.57：单删确认 / 批删确认 / 勾选集合
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // 计算当前选中年月的默认日期
  const defaultDateForCurrentMonth = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(now.getDate(), lastDay);
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }, [year, month, now]);

  // 所有疫苗记录
  const vaccineRecords = records.filter((r) => r.record_type === "vaccination" && r.vaccine_name);

  // v1.57：全部接种记录管理列表（时间倒序分页，勾选批量删除）
  const allSort = useMemo(
    () => (a: HealthRecord, b: HealthRecord) =>
      a.record_date === b.record_date ? b.id - a.id : a.record_date < b.record_date ? 1 : -1,
    []
  );
  const allPage = useListPagination(vaccineRecords, allSort, "mengya_page_size_vaccine_records", 5);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    const ids = allPage.pageItems.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      const res = await healthApi.batchDelete([...selected]);
      showToast(`已批量删除 ${res?.deleted ?? selected.size} 条接种记录`);
      setSelected(new Set());
      setBatchConfirm(false);
      onChanged?.();
    } catch {
      setError("批量删除失败，请稍后重试");
    } finally {
      setBatchDeleting(false);
    }
  };

  // 当前年月已接种的记录
  const currentMonthRecords = vaccineRecords.filter((r) => {
    const d = new Date(r.record_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // 已接种过的疫苗名称集合（全部时间）
  const doneNames = new Set(vaccineRecords.map((r) => r.vaccine_name));

  // v1.56 P1-A：下一针建议——按宝宝月龄取第一个未完成的规划剂次
  const nextVaccine = useMemo(() => {
    if (!babyBirthday) return null;
    const birth = new Date(babyBirthday);
    if (Number.isNaN(birth.getTime())) return null;
    const monthAge = Math.max(0, (Date.now() - birth.getTime()) / (30.44 * 86400000));
    // 按规划顺序取第一个未接种剂次
    const pending = PLANNED_VACCINES.filter((v) => !doneNames.has(v.name));
    if (pending.length === 0) return null;
    const next = pending[0];
    // 解析月龄提示（出生时=0，X月龄=X，X岁=X*12）
    const ageNum = (age: string): number => {
      if (age.includes("出生")) return 0;
      if (age.includes("岁")) return parseInt(age, 10) * 12;
      return parseInt(age, 10) || 0;
    };
    const dueMonths = ageNum(next.age);
    return {
      ...next,
      dueAge: Math.round(monthAge), // 宝宝当前月龄（渲染用）
      overdue: monthAge >= dueMonths + 1, // 已到建议月龄且超过 1 个月视为“已到期”
    };
  }, [babyBirthday, doneNames]);

  const resetForm = () => {
    setVaccineName("");
    setVaccineDate(defaultDateForCurrentMonth);
    setNote("");
    setEditingId(null);
    setError("");
    setShowAdd(false);
  };

  const startEdit = (record: HealthRecord) => {
    setEditingId(record.id);
    setVaccineName(record.vaccine_name || "");
    setVaccineDate(record.record_date);
    setNote(record.note || "");
    setShowAdd(true);
    setError("");
  };

  const startAdd = () => {
    setEditingId(null);
    setVaccineName("");
    setVaccineDate(defaultDateForCurrentMonth);
    setNote("");
    setError("");
    setShowAdd(true);
  };

  const submit = async () => {
    if (!vaccineName.trim()) {
      setError("请输入疫苗名称");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (editingId !== null) {
        await healthApi.update(editingId, {
          record_type: "vaccination",
          record_date: vaccineDate,
          vaccine_name: vaccineName.trim(),
          note: note || undefined,
        });
        showToast("接种记录已更新");
      } else {
        await healthApi.create({
          record_type: "vaccination",
          record_date: vaccineDate,
          vaccine_name: vaccineName.trim(),
          note: note || undefined,
        });
        showToast("接种记录已添加");
      }
      resetForm();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "保存失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await healthApi.remove(id);
      showToast("已删除接种记录");
      setConfirmId(null);
      onChanged?.();
    } catch {
      setError("删除失败，请稍后重试");
      setConfirmId(null);
    }
  };

  const switchMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setMonth(newMonth);
    setYear(newYear);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  return (
    <div className="card space-y-5">
      {/* 标题 + 年月导航 */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">疫苗日历</h3>
        <div className="flex items-center gap-2 text-sm">
          <button className="rounded-lg p-1.5 hover:bg-gray-100" onClick={() => switchMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[6rem] text-center font-medium">{year}年{MONTHS[month]}</span>
          <button className="rounded-lg p-1.5 hover:bg-gray-100" onClick={() => switchMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentMonth && (
            <button
              className="ml-1 rounded-lg px-2 py-0.5 text-xs text-brand-500 hover:bg-brand-50"
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            >
              回到本月
            </button>
          )}
        </div>
      </div>

      {/* 新增/编辑表单 */}
      {showAdd ? (
        <div className="space-y-3 rounded-xl bg-cream p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {editingId !== null ? "编辑接种记录" : "添加接种记录"}
            </span>
            <button className="text-gray-400 hover:text-gray-600" onClick={resetForm}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">疫苗名称</label>
              <input
                className="input"
                value={vaccineName}
                onChange={(e) => setVaccineName(e.target.value)}
                placeholder="如：乙肝疫苗第2剂"
                list="vaccine-suggestions"
              />
              <datalist id="vaccine-suggestions">
                {PLANNED_VACCINES.map((v) => (
                  <option key={v.name} value={v.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">接种日期</label>
              <input type="date" className="input" value={vaccineDate} onChange={(e) => setVaccineDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">备注</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：接种部位、反应" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={submit} disabled={submitting}>
              {submitting ? "保存中…" : "保存"}
            </button>
            <button className="btn-secondary flex-1" onClick={resetForm}>取消</button>
          </div>
        </div>
      ) : (
        <button
          className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-brand-200 py-2.5 text-sm text-brand-500 hover:bg-brand-50"
          onClick={startAdd}
        >
          <Plus className="h-4 w-4" /> 添加接种记录
        </button>
      )}

      {/* v1.56 P1-A：下一针接种建议 */}
      {nextVaccine && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            nextVaccine.overdue
              ? "border-red-200 bg-red-50/60 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
              : "border-brand-200 bg-brand-50/60 text-brand-700 dark:border-brand-900/50 dark:bg-brand-950/20 dark:text-brand-300"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold">下一针：{nextVaccine.name}</span>
            <span className="ml-2 text-xs opacity-80">建议 {nextVaccine.age} 接种 · 宝宝当前 {nextVaccine.dueAge >= 36 ? `${Math.floor(nextVaccine.dueAge / 12)}岁` : `${nextVaccine.dueAge}个月`}</span>
            {nextVaccine.overdue && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs dark:bg-red-900/40">已到接种时间，请尽快安排</span>
            )}
          </div>
        </div>
      )}

      {/* 当前月份已接种记录 */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-600">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {year}年{MONTHS[month]}已接种 ({currentMonthRecords.length})
        </h4>
        {currentMonthRecords.length === 0 ? (
          <p className="rounded-xl bg-gray-50 py-4 text-center text-sm text-gray-400">
            本月暂无接种记录
          </p>
        ) : (
          <div className="space-y-2">
            {currentMonthRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-green-50/60 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{r.vaccine_name}</span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                      {new Date(r.record_date).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {r.note && <p className="mt-0.5 text-xs text-gray-400">{r.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-brand-500" onClick={() => startEdit(r)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  {canDelete && (
                    <button
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-red-500"
                      onClick={() => {
                        setConfirmId(r.id);
                        setConfirmName(r.vaccine_name || "");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* v1.57 全部接种记录管理（时间倒序 · 勾选单选/多选/全选当前页 · 批量删除 · 分页） */}
      {vaccineRecords.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
              全部接种记录 ({vaccineRecords.length})
              {canDelete && (
                <label className="ml-2 flex cursor-pointer items-center gap-1 text-[11px] text-gray-400">
                  <input
                    type="checkbox"
                    checked={allPage.pageItems.length > 0 && allPage.pageItems.every((r) => selected.has(r.id))}
                    onChange={toggleSelectPage}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                  />
                  全选本页
                </label>
              )}
            </h4>
            {canDelete && selected.size > 0 && (
              <button
                type="button"
                onClick={() => setBatchConfirm(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除所选 ({selected.size})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 dark:border-gray-800">
                  {canDelete && <th className="w-8 px-3 py-2 font-medium" />}
                  <th className="px-3 py-2 font-medium">接种日期</th>
                  <th className="px-3 py-2 font-medium">疫苗名称</th>
                  <th className="px-3 py-2 font-medium">备注</th>
                  {canDelete && <th className="px-3 py-2 font-medium">操作</th>}
                </tr>
              </thead>
              <tbody>
                {allPage.pageItems.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-gray-50 transition hover:bg-orange-50/40 dark:border-gray-800/60 dark:hover:bg-gray-800/40 ${
                      selected.has(r.id) ? "bg-orange-50/60 dark:bg-gray-800/60" : ""
                    }`}
                  >
                    {canDelete && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                          aria-label={`选择 ${r.vaccine_name} 记录`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{r.record_date}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200">{r.vaccine_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{r.note || "—"}</td>
                    {canDelete && (
                      <td className="px-3 py-2">
                        <button
                          className="text-gray-300 hover:text-red-500"
                          onClick={() => {
                            setConfirmId(r.id);
                            setConfirmName(r.vaccine_name || "");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={allPage.page}
            totalPages={allPage.totalPages}
            total={allPage.total}
            pageSize={allPage.pageSize}
            onPageChange={allPage.setPage}
            onPageSizeChange={allPage.setPageSize}
            unitLabel="条"
          />
        </div>
      )}

      {/* 免疫规划待接种清单 */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-600">免疫规划清单</h4>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {PLANNED_VACCINES.map((v) => {
            const isDone = doneNames.has(v.name);
            return (
              <div
                key={v.name}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isDone ? "bg-green-50/40" : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-gray-300" />
                  )}
                  <span className={isDone ? "text-gray-400 line-through" : "text-gray-700"}>{v.name}</span>
                  <span className="text-xs text-gray-400">{v.age}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${isDone ? "bg-green-100 text-green-600" : "bg-brand-50 text-brand-600"}`}>
                  {isDone ? "已接种" : "待接种"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* v1.57 单条删除确认 / 批量删除确认 */}
      <ConfirmDialog
        isOpen={confirmId !== null}
        title={`删除「${confirmName}」接种记录？`}
        message="删除后将无法恢复，免疫规划清单的接种状态将同步回退为待接种。"
        confirmText="确认删除"
        onConfirm={() => confirmId != null && remove(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
      <ConfirmDialog
        isOpen={batchConfirm}
        title={`删除所选 ${selected.size} 条接种记录？`}
        message="所选接种记录将被批量删除且无法恢复，对应免疫规划项将回退为待接种。"
        detail={`涉及疫苗：${vaccineRecords
          .filter((r) => selected.has(r.id))
          .map((r) => r.vaccine_name)
          .join("、")}`}
        confirmText={`确认删除 ${selected.size} 条`}
        loading={batchDeleting}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchConfirm(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
