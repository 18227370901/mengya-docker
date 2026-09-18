import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Edit3, Plus, Trash2, X } from "lucide-react";
import { healthApi } from "@/api/services";
import type { HealthRecord } from "@/types";

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
}

/** 疫苗日历：按月展示已接种/待接种，支持编辑、删除、年份切换 */
export default function VaccineCalendar({ records, onChanged }: VaccineCalendarProps) {
  const now = new Date();
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

  // 当前年月已接种的记录
  const currentMonthRecords = vaccineRecords.filter((r) => {
    const d = new Date(r.record_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // 已接种过的疫苗名称集合（全部时间）
  const doneNames = new Set(vaccineRecords.map((r) => r.vaccine_name));

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

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`确认删除「${name}」这条接种记录？`)) return;
    try {
      await healthApi.remove(id);
      showToast("已删除接种记录");
      onChanged?.();
    } catch {
      setError("删除失败，请稍后重试");
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
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-red-500" onClick={() => remove(r.id, r.vaccine_name || "")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
