import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HealthRecord } from "@/types";

const TYPE_COLORS: Record<string, string> = {
  prenatal_exam: "bg-pink-100 text-pink-600 border-pink-200",
  growth_measurement: "bg-green-100 text-green-600 border-green-200",
  vaccine: "bg-blue-100 text-blue-600 border-blue-200",
};

const TYPE_LABELS: Record<string, string> = {
  prenatal_exam: "产检",
  growth_measurement: "生长",
  vaccine: "疫苗",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

interface Props {
  records: HealthRecord[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onDayClick?: (date: string, records: HealthRecord[]) => void;
}

export default function HealthCalendar({ records, currentMonth, onMonthChange, onDayClick }: Props) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const { daysInMonth, firstDayWeekday } = useMemo(() => {
    const days = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    return { daysInMonth: days, firstDayWeekday: firstWeekday };
  }, [year, month]);

  const recordsByDate = useMemo(() => {
    const map: Record<string, HealthRecord[]> = {};
    for (const r of records) {
      if (!map[r.record_date]) map[r.record_date] = [];
      map[r.record_date].push(r);
    }
    return map;
  }, [records]);

  const today = new Date().toISOString().slice(0, 10);

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDayWeekday; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr });
  }

  return (
    <div className="card">
      {/* 月份导航 */}
      <div className="mb-4 flex items-center justify-between">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          onClick={() => onMonthChange(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-semibold text-gray-800">
          {year}年 {month + 1}月
        </span>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 星期头 */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-xs font-medium text-gray-400">{w}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (cell.day === null) {
            return <div key={i} className="min-h-[60px] rounded-lg" />;
          }
          const dayRecords = cell.dateStr ? (recordsByDate[cell.dateStr] || []) : [];
          const isToday = cell.dateStr === today;
          const hasRecords = dayRecords.length > 0;

          return (
            <div
              key={i}
              className={`min-h-[60px] rounded-lg border p-1 transition ${
                isToday
                  ? "border-brand-300 bg-brand-50/50"
                  : hasRecords
                  ? "border-gray-100 bg-white hover:border-brand-200"
                  : "border-gray-50 hover:bg-gray-50"
              } ${hasRecords && onDayClick ? "cursor-pointer" : ""}`}
              onClick={() => {
                if (hasRecords && onDayClick && cell.dateStr) {
                  onDayClick(cell.dateStr, dayRecords);
                }
              }}
            >
              <div className={`text-xs ${isToday ? "font-bold text-brand-600" : "text-gray-500"}`}>
                {cell.day}
              </div>
              {dayRecords.slice(0, 2).map((r, ri) => (
                <div
                  key={ri}
                  className={`mt-0.5 truncate rounded px-1 py-0.5 text-[10px] border ${
                    TYPE_COLORS[r.record_type] || "bg-gray-100 text-gray-500 border-gray-200"
                  }`}
                >
                  {TYPE_LABELS[r.record_type] || r.record_type}
                  {r.record_type === "growth_measurement" && r.weight ? ` ${r.weight}kg` : ""}
                  {r.record_type === "prenatal_exam" && r.gestational_week ? ` ${r.gestational_week}w` : ""}
                  {r.record_type === "vaccine" && r.vaccine_name ? ` ${r.vaccine_name}` : ""}
                </div>
              ))}
              {dayRecords.length > 2 && (
                <div className="text-[10px] text-gray-400">+{dayRecords.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 图例 */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400">
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded border ${TYPE_COLORS[key]}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
