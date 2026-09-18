import { useAuthStore } from "@/store/authStore";
import { useEffect, useState, useCallback } from "react";
import { Baby, Calendar, CalendarCheck, LineChart, Plus, Trash2 } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import { healthApi } from "@/api/services";
import type { HealthRecord } from "@/types";
import GrowthChart from "@/components/GrowthChart";
import VaccineCalendar from "@/components/VaccineCalendar";
import HealthCalendar from "@/components/HealthCalendar";

type TabKey = "checkup" | "growth" | "vaccine" | "calendar";

const TABS: Array<{ key: TabKey; label: string; icon: typeof CalendarCheck }> = [
  { key: "checkup", label: "产检记录", icon: CalendarCheck },
  { key: "growth", label: "生长曲线", icon: LineChart },
  { key: "vaccine", label: "疫苗日历", icon: Baby },
  { key: "calendar", label: "日历总览", icon: Calendar },
];

export default function HealthPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("checkup");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const [form, setForm] = useState({
    record_type: "prenatal_exam",
    record_date: new Date().toISOString().slice(0, 10),
    gestational_week: "",
    height: "",
    weight: "",
    note: "",
  });

  const load = () => {
    setLoading(true);
    healthApi
      .list()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [tab]);

  const submit = async () => {
    const payload: Partial<HealthRecord> = {
      record_type: form.record_type,
      record_date: form.record_date,
      note: form.note || undefined,
    };
    if (form.record_type === "prenatal_exam" && form.gestational_week) {
      payload.gestational_week = Number(form.gestational_week);
    }
    if (form.record_type === "growth_measurement") {
      payload.height = form.height ? Number(form.height) : undefined;
      payload.weight = form.weight ? Number(form.weight) : undefined;
    }
    try {
      await healthApi.create(payload);
      showToast("保存成功");
      setShowForm(false);
      setForm({ ...form, note: "", gestational_week: "", height: "", weight: "" });
      // 提交后自动切换到对应类型 tab，确保用户看到刚保存的记录
      if (form.record_type === "growth_measurement") {
        setTab("growth");
      } else {
        setTab("checkup");
      }
      load();
    } catch {
      showToast("保存失败，请重试");
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("确认删除这条记录？")) return;
    try {
      await healthApi.remove(id);
      showToast("已删除");
      load();
    } catch {
      showToast("删除失败，请重试");
    }
  };

  const checkupRecords = records.filter((r) => r.record_type === "prenatal_exam");
  const growthRecords = records.filter((r) => r.record_type === "growth_measurement");

  // 生长曲线数据源：生长测量记录 + 产检记录中的身高体重数据（若有）
  const growthChartPoints = [
    ...growthRecords.map((r) => ({
      date: r.record_date,
      weight: r.weight,
      height: r.height,
      head: r.head_circumference,
    })),
    ...checkupRecords
      .filter((r) => r.weight || r.height)
      .map((r) => ({
        date: r.record_date,
        weight: r.weight,
        height: r.height,
        head: r.head_circumference,
      })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">健康中心</h1>
          <p className="mt-1 text-sm text-gray-400">产检 · 生长曲线 · 疫苗日历</p>
        </div>
        {tab !== "vaccine" && tab !== "calendar" && (
          <button
            className="btn-primary"
            onClick={() => {
              // 在生长曲线 tab 下新增，自动选择生长记录类型
              setForm((f) => ({
                ...f,
                record_type: tab === "growth" ? "growth_measurement" : "prenatal_exam",
              }));
              setShowForm((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" /> 新增记录
          </button>
        )}
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition ${
              tab === t.key ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 新增表单 */}
      {showForm && (
        <section className="card space-y-3">
          <div className="flex gap-2">
            {[
              { key: "prenatal_exam", label: "产检" },
              { key: "growth_measurement", label: "生长" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setForm((f) => ({ ...f, record_type: t.key }))}
                className={`rounded-lg px-3 py-1 text-xs ${
                  form.record_type === t.key ? "bg-brand-100 text-brand-600" : "bg-gray-50 text-gray-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label">日期</label>
            <input
              type="date"
              className="input"
              value={form.record_date}
              onChange={(e) => setForm((f) => ({ ...f, record_date: e.target.value }))}
            />
          </div>
          {form.record_type === "prenatal_exam" ? (
            <div>
              <label className="label">孕周</label>
              <input
                type="number"
                className="input"
                placeholder="例如 24"
                value={form.gestational_week}
                onChange={(e) => setForm((f) => ({ ...f, gestational_week: e.target.value }))}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">身高 (cm)</label>
                <input
                  type="number"
                  className="input"
                  value={form.height}
                  onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">体重 (kg)</label>
                <input
                  type="number"
                  className="input"
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                />
              </div>
            </div>
          )}
          <div>
            <label className="label">备注</label>
            <input
              className="input"
              placeholder="如：胎心正常 / 医生建议"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={submit}>
              保存
            </button>
            <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>
              取消
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : tab === "checkup" ? (
        <div className="space-y-3">
          {checkupRecords.length === 0 && <p className="py-10 text-center text-gray-400">暂无产检记录</p>}
          {checkupRecords.map((r) => (
            <div key={r.id} className="card flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-brand-500" />
                  <span className="font-medium text-gray-700">{r.record_date}</span>
                  {r.gestational_week && <span className="tag">孕{r.gestational_week}周</span>}
                </div>
                {r.note && (
                  <>
                    <p className="mt-1 text-sm text-gray-500">{r.note}</p>
                    <div className="mt-1 flex justify-end">
                      <CopyButton text={r.note} label="复制" />
                    </div>
                  </>
                )}
                {r.ai_analysis && (
                  <>
                    <p className="mt-2 rounded-lg bg-cream p-2 text-xs text-gray-500">AI 解读：{r.ai_analysis}</p>
                    <div className="mt-1 flex justify-end">
                      <CopyButton text={r.ai_analysis} label="复制" />
                    </div>
                  </>
                )}
              </div>
              {hasPermission("health_record_delete") && (
                <button className="text-gray-300 hover:text-red-500" onClick={() => remove(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : tab === "growth" ? (
        <section className="card">
          <h2 className="mb-3 font-semibold text-gray-800">生长曲线</h2>
          <GrowthChart points={growthChartPoints} />
          {growthRecords.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">暂无生长数据，点击右上角新增</p>
          )}
        </section>
      ) : tab === "calendar" ? (
        <HealthCalendar
          records={records}
          currentMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          onDayClick={(_date, dayRecords) => {
            const hasGrowth = dayRecords.some((r) => r.record_type === "growth_measurement");
            const hasCheckup = dayRecords.some((r) => r.record_type === "prenatal_exam");
            if (hasGrowth) setTab("growth");
            else if (hasCheckup) setTab("checkup");
            else setTab("vaccine");
          }}
        />
      ) : (
        <VaccineCalendar records={records} onChanged={load} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}