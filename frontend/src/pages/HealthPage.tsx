import { useAuthStore } from "@/store/authStore";
import { useEffect, useMemo, useState } from "react";
import { Baby, Calendar, CalendarCheck, LineChart, Plus, Trash2, HeartPulse, FileUp } from "lucide-react";
import { healthApi } from "@/api/services";
import { authApi } from "@/api/auth";
import { extractGestationAnchor, gestationLabel } from "@/utils/gestation";
import type { HealthRecord } from "@/types";
import type { BmiAnalysisResult, PregnancyStage } from "@/types/health";
import GrowthChart from "@/components/GrowthChart";
import VaccineCalendar from "@/components/VaccineCalendar";
import HealthCalendar from "@/components/HealthCalendar";
import HealthTimelineView from "@/components/health/HealthTimelineView";
import BmiAnalysisView from "@/components/health/BmiAnalysisView";
import UnifiedHealthCheckIn from "@/components/health/UnifiedHealthCheckIn";
import CsvImportModal from "@/components/health/CsvImportModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PaginationBar, { useListPagination } from "@/components/ui/PaginationBar";

/**
 * 健康中心（v1.56 信息架构重构 / v1.57 列表管理增强）
 * 按「对象 + 记录类型」组织为 4 个 Tab：
 * ① 妈妈·孕产档案（记录 + BMI 分析/看板/医学评估，合并原"孕产记录"+"体重/BMI分析"）
 * ② 宝宝·生长档案（生长曲线 + WHO 参考线 + 测量记录）
 * ③ 宝宝·疫苗计划（疫苗日历 + 接种状态 + 下一针建议）
 * ④ 健康时间轴（日历总览：按日聚合妈妈+宝宝全部记录，点击日期补录）
 * v1.57：妈妈明细卡片流与宝宝测量记录表支持勾选（单选/多选/全选当前页）批量删除 + 分页（默认 5 条/页）；
 * 页头新增「导入数据」入口（CSV 批量导入：妈妈体重 / 宝宝生长测量）。
 */
type TabKey = "mom" | "growth" | "vaccine" | "calendar";

const TABS: Array<{ key: TabKey; label: string; icon: typeof CalendarCheck }> = [
  { key: "mom", label: "妈妈·孕产档案", icon: HeartPulse },
  { key: "growth", label: "宝宝·生长档案", icon: LineChart },
  { key: "vaccine", label: "宝宝·疫苗计划", icon: Baby },
  { key: "calendar", label: "健康时间轴与日历", icon: Calendar },
];

export default function HealthPage() {
  const { hasPermission, user } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("mom");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInDate, setCheckInDate] = useState<string | undefined>(undefined);
  const [checkInMode, setCheckInMode] = useState<"mom_pregnancy" | "mom_postpartum" | "mom_general" | "baby" | undefined>(undefined);
  const [bmiStageType, setBmiStageType] = useState<PregnancyStage>(() =>
    user?.is_pregnant
      ? "pregnancy"
      : !user?.is_pregnant && user?.baby_birthday
      ? "postpartum"
      : "general"
  );
  const [showImport, setShowImport] = useState(false);
  const [importTarget, setImportTarget] = useState<"mom" | "baby">("mom");
  const [toast, setToast] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  // v1.59/v1.60：跨组件同步触发器、宝宝性别基准与最新分析报告联动
  const [refreshTick, setRefreshTick] = useState(0);
  const [latestAnalysisResult, setLatestAnalysisResult] = useState<BmiAnalysisResult | null>(null);
  const [babyGender, setBabyGender] = useState<"boy" | "girl">("boy");

  const triggerRefresh = () => {
    setRefreshTick((c) => c + 1);
    load();
  };

  useEffect(() => {
    authApi
      .babies()
      .then((list) => {
        if (list && list.length > 0) {
          const g = (list[0].gender || "").toLowerCase();
          if (g === "girl" || g === "女" || g === "female") setBabyGender("girl");
          else setBabyGender("boy");
        }
      })
      .catch(() => {});
  }, []);

  // v1.57 删除交互统一：单删/批删均走 ConfirmDialog 确认弹窗
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<{ ids: number[]; label: string } | null>(null);
  const [babySelected, setBabySelected] = useState<Set<number>>(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

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

  /** 打开 CSV 批量导入弹窗：导入对象根据当前子页面自动联动匹配 */
  const openImport = (targetOverride?: "mom" | "baby") => {
    setImportTarget(targetOverride || (tab === "growth" ? "baby" : "mom"));
    setShowImport(true);
  };

  /** 打开健康打卡弹窗：记录类型根据当前子页面自动联动匹配 */
  const openCheckIn = (date?: string, targetMode?: "mom_pregnancy" | "mom_postpartum" | "mom_general" | "baby") => {
    setCheckInDate(date || undefined);
    if (targetMode) {
      setCheckInMode(targetMode);
    } else if (tab === "growth") {
      setCheckInMode("baby");
    } else if (tab === "mom") {
      setCheckInMode(
        bmiStageType === "pregnancy"
          ? "mom_pregnancy"
          : bmiStageType === "postpartum"
          ? "mom_postpartum"
          : "mom_general"
      );
    } else {
      setCheckInMode(undefined);
    }
    setShowCheckIn(true);
  };

  const removeRecord = async (id: number) => {
    setDeleting(true);
    try {
      await healthApi.remove(id);
      showToast("已删除记录，相关图表已联动刷新");
      load();
    } catch {
      showToast("删除失败，请重试");
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  };

  /** v1.57 宝宝测量记录批量删除（后端单事务批量接口），删除后清理勾选并刷新 */
  const batchRemove = async (ids: number[]) => {
    if (batchConfirm) setBatchConfirm(null);
    setDeleting(true);
    try {
      const res = await healthApi.batchDelete(ids);
      showToast(`已批量删除 ${res?.deleted ?? ids.length} 条测量记录`);
    } catch {
      showToast("批量删除失败，请重试");
    } finally {
      setBabySelected(new Set());
      setDeleting(false);
      load();
    }
  };

  // ===== v1.55/1.56 统一数据口径：妈妈记录 = prenatal_exam；宝宝记录 = growth_measurement =====
  const momRecords = records.filter((r) => r.record_type === "prenatal_exam");
  const growthRecords = records.filter((r) => r.record_type === "growth_measurement");

  // 妈妈最近一次打卡基线身高（用于健康打卡自动继承）
  const latestMomHeight = useMemo(() => {
    const rec = momRecords.find((r) => r.height && r.height > 0);
    return rec?.height ?? null;
  }, [momRecords]);

  // 妈妈最近一次打卡基线孕前体重（用于健康打卡与 BMI 分析自动继承）
  const latestMomPreWeight = useMemo(() => {
    for (const r of momRecords) {
      const items = r.exam_items && typeof r.exam_items === "object" ? (r.exam_items as any) : {};
      if (items.pre_weight && Number(items.pre_weight) > 0) return Number(items.pre_weight);
    }
    return null;
  }, [momRecords]);

  // v1.58：首次孕期打卡锚点（打卡弹窗无预产期时孕周自动推算 孕x周x天）
  const gestationAnchor = useMemo(() => extractGestationAnchor(records), [records]);

  // 生长曲线数据源：仅宝宝测量记录（妈妈数据不再混入宝宝曲线）
  const growthChartPoints = growthRecords.map((r) => ({
    date: r.record_date,
    weight: r.weight,
    height: r.height,
    head: r.head_circumference,
  }));

  // ===== v1.57 宝宝测量记录表分页 =====
  const babySort = useMemo(
    () => (a: HealthRecord, b: HealthRecord) =>
      a.record_date === b.record_date ? b.id - a.id : a.record_date < b.record_date ? 1 : -1,
    []
  );
  const babyPage = useListPagination(growthRecords, babySort, "mengya_page_size_baby_growth", 5);

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageAll = (
    pageItems: HealthRecord[],
    selected: Set<number>,
    setter: React.Dispatch<React.SetStateAction<Set<number>>>
  ) => {
    const ids = pageItems.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setter((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">健康中心</h1>
          <p className="mt-1 text-sm text-gray-400">妈妈孕产档案 · 宝宝生长与疫苗 · 全周期时间轴</p>
        </div>
        {/* 仅在相关页面（妈妈·孕产档案 与 宝宝·生长档案）展示健康打卡与导入数据，不相关页面（宝宝疫苗、健康时间轴与日历）不做展示 */}
        {(tab === "mom" || tab === "growth") && (
          <div className="flex items-center gap-2">
            {hasPermission("health_record_create") && (
              <button className="btn-secondary gap-1.5" onClick={() => openImport()} title="健康数据 CSV 批量导入">
                <FileUp className="h-4 w-4" /> 导入数据
              </button>
            )}
            {hasPermission("health_record_create") ? (
              <button
                className="btn-primary"
                onClick={() =>
                  openCheckIn(
                    undefined,
                    tab === "growth"
                      ? "baby"
                      : bmiStageType === "pregnancy"
                      ? "mom_pregnancy"
                      : bmiStageType === "postpartum"
                      ? "mom_postpartum"
                      : "mom_general"
                  )
                }
              >
                <Plus className="h-4 w-4" /> 健康打卡
              </button>
            ) : (
              <span className="text-xs text-gray-400">管理员已关闭您的健康记录录入权限</span>
            )}
          </div>
        )}
      </div>

      {/* Tab 导航 */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition ${
              tab === t.key
                ? "bg-brand-500 text-white shadow-xs"
                : "border border-gray-100 bg-white text-gray-500 hover:bg-brand-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 统一健康打卡弹窗（唯一录入入口：记录类型根据子页面自动联动） */}
      <UnifiedHealthCheckIn
        isOpen={showCheckIn}
        onClose={() => setShowCheckIn(false)}
        initialDate={checkInDate}
        initialMode={checkInMode}
        initialHeight={latestMomHeight}
        gestationAnchor={gestationAnchor}
        onSaved={(archiveHint, analysisResult) => {
          showToast(archiveHint);
          if (analysisResult) {
            setLatestAnalysisResult(analysisResult);
          }
          triggerRefresh();
        }}
      />

      {/* v1.57 CSV 批量导入弹窗（导入对象根据当前子页面自动联动） */}
      <CsvImportModal
        isOpen={showImport}
        initialTarget={importTarget}
        onClose={() => setShowImport(false)}
        onImported={(hint, resolvedStage) => {
          showToast(hint);
          if (resolvedStage) {
            setBmiStageType(resolvedStage);
          }
          triggerRefresh();
        }}
      />

      {/* Tab 页面主体切换 */}
      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : tab === "mom" ? (
        <div className="space-y-6">
          {/* 妈妈·孕产档案：BMI 分析（状态卡 + 表单 + 时序看板 + 历史表 + 医学评估） */}
          <BmiAnalysisView
            refreshTrigger={refreshTick}
            onRecordChanged={load}
            externalAnalysisResult={latestAnalysisResult}
            stageType={bmiStageType}
            onStageTypeChange={(newSt) => setBmiStageType(newSt)}
            fallbackHeight={latestMomHeight}
            fallbackPreWeight={latestMomPreWeight}
          />
        </div>
      ) : tab === "growth" ? (
        <div className="space-y-5">
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 pb-2 dark:border-gray-800">
              <div>
                <h2 className="font-semibold text-gray-800 dark:text-gray-100">宝宝生长曲线</h2>
                <span className="text-xs text-gray-400">
                  {user?.baby_birthday
                    ? `虚线为 WHO ${babyGender === "girl" ? "女童" : "男童"} P50 参考`
                    : "设置宝宝生日后可叠加 WHO 参考线"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">WHO 标准：</span>
                <button
                  type="button"
                  onClick={() => setBabyGender("boy")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    babyGender === "boy"
                      ? "bg-blue-500 text-white shadow-2xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  男童
                </button>
                <button
                  type="button"
                  onClick={() => setBabyGender("girl")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    babyGender === "girl"
                      ? "bg-pink-500 text-white shadow-2xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  女童
                </button>
              </div>
            </div>
            <GrowthChart points={growthChartPoints} birthDate={user?.baby_birthday} gender={babyGender} />
            {growthRecords.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                暂无宝宝生长数据，点击右上角「健康打卡」选择"宝宝·生长测量"录入
              </p>
            )}
          </section>

          {/* 宝宝测量记录明细表（v1.57 勾选 + 批量删除 + 分页） */}
          {growthRecords.length > 0 && (
            <section className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    测量记录 ({growthRecords.length})
                  </h3>
                  {hasPermission("health_record_delete") && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={babyPage.pageItems.length > 0 && babyPage.pageItems.every((r) => babySelected.has(r.id))}
                        onChange={() => togglePageAll(babyPage.pageItems, babySelected, setBabySelected)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                      />
                      全选本页
                    </label>
                  )}
                </div>
                {hasPermission("health_record_delete") && babySelected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchConfirm({ ids: [...babySelected], label: `${babySelected.size} 条宝宝测量记录` })}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除所选 ({babySelected.size})
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 dark:border-gray-800">
                      {hasPermission("health_record_delete") && <th className="w-8 px-3 py-2 font-medium" />}
                      <th className="px-3 py-2 font-medium">日期</th>
                      <th className="px-3 py-2 font-medium">身高 (cm)</th>
                      <th className="px-3 py-2 font-medium">体重 (kg)</th>
                      <th className="px-3 py-2 font-medium">头围 (cm)</th>
                      {hasPermission("health_record_delete") && <th className="px-3 py-2 font-medium">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {babyPage.pageItems.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-gray-50 transition hover:bg-orange-50/40 dark:border-gray-800/60 dark:hover:bg-gray-800/40 ${
                          babySelected.has(r.id) ? "bg-orange-50/60 dark:bg-gray-800/60" : ""
                        }`}
                      >
                        {hasPermission("health_record_delete") && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={babySelected.has(r.id)}
                              onChange={() => toggleInSet(setBabySelected, r.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                              aria-label={`选择 ${r.record_date} 测量记录`}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{r.record_date}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.height ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.weight ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.head_circumference ?? "—"}</td>
                        {hasPermission("health_record_delete") && (
                          <td className="px-3 py-2">
                            <button className="text-gray-300 hover:text-red-500" onClick={() => setConfirmId(r.id)}>
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
                page={babyPage.page}
                totalPages={babyPage.totalPages}
                total={babyPage.total}
                pageSize={babyPage.pageSize}
                onPageChange={babyPage.setPage}
                onPageSizeChange={babyPage.setPageSize}
                unitLabel="条"
              />
            </section>
          )}
        </div>
      ) : tab === "calendar" ? (
        <HealthTimelineView
          records={records}
          currentMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          onDayClick={(_date, dayRecords) => {
            // v1.56 P1-D：点击日期 → 打开健康打卡弹窗并预填该日期（补录入口）
            openCheckIn(_date);
          }}
          onCheckInClick={() => openCheckIn()}
        />
      ) : (
        <VaccineCalendar records={records} onChanged={load} babyBirthday={user?.baby_birthday} />
      )}

      {/* v1.57 单条删除确认（全局统一替换 window.confirm） */}
      <ConfirmDialog
        isOpen={confirmId !== null}
        title="删除这条健康记录？"
        message="删除后将无法恢复，孕产档案 / 生长曲线 / 时间轴等相关图表将同步联动刷新。"
        confirmText="确认删除"
        loading={deleting}
        onConfirm={() => confirmId != null && removeRecord(confirmId)}
        onCancel={() => setConfirmId(null)}
      />

      {/* v1.57 批量删除确认 */}
      <ConfirmDialog
        isOpen={batchConfirm !== null}
        title={`删除所选 ${batchConfirm?.ids.length ?? 0} 条记录？`}
        message={`即将批量删除 ${batchConfirm?.label ?? ""}，删除后无法恢复。`}
        detail={
          batchConfirm
            ? `涉及记录：${records
                .filter((r) => batchConfirm.ids.includes(r.id))
                .sort((a, b) => (a.record_date < b.record_date ? 1 : -1))
                .map((r) => r.record_date)
                .join("、")}`
            : undefined
        }
        confirmText={`确认删除 ${batchConfirm?.ids.length ?? 0} 条`}
        loading={deleting}
        onConfirm={() => batchConfirm && batchRemove(batchConfirm.ids)}
        onCancel={() => setBatchConfirm(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}
