import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scale, CheckCircle2, ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown, FileText } from "lucide-react";
import { healthApi } from "@/api/services";
import { extractGestationAnchor, gestationLabel } from "@/utils/gestation";
import type { BmiAnalysisInput, BmiAnalysisResult, BmiTimeSeriesRecord, SameDayConflictPayload } from "@/types/health";
import BmiFormCard from "./BmiFormCard";
import BmiTimeSeriesBoard from "./BmiTimeSeriesBoard";
import BmiHistoryTable from "./BmiHistoryTable";
import MedicalAlertBanner from "./MedicalAlertBanner";
import WeightGainChart from "./WeightGainChart";
import DietPlanCard from "./DietPlanCard";
import LifestyleCareCard from "./LifestyleCareCard";
import HealthReportExport from "./HealthReportExport";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const STORAGE_KEY = "mengya_latest_bmi_analysis";

interface BmiAnalysisViewProps {
  /** v1.59：外部刷新触发令牌（健康打卡弹窗/CSV导入/外层变动时联动刷新） */
  refreshTrigger?: number;
  /** v1.59：内部变更回调（分析打卡/删除/批量删除后通知外层刷新 HealthPage.records） */
  onRecordChanged?: () => void;
  /** v1.60：外部打卡传入的最新分析评估结果（打卡后联动展示分析报告） */
  externalAnalysisResult?: BmiAnalysisResult | null;
}

export default function BmiAnalysisView({ refreshTrigger, onRecordChanged, externalAnalysisResult }: BmiAnalysisViewProps = {}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<BmiAnalysisResult | null>(() => {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const reportSectionRef = useRef<HTMLDivElement | null>(null);

  const updateResult = useCallback((newRes: BmiAnalysisResult | null) => {
    setResult(newRes);
    try {
      if (newRes) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newRes));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);
  const [toast, setToast] = useState<string>("");
  const [timeseries, setTimeseries] = useState<BmiTimeSeriesRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // v1.57：分析报告可逆折叠（默认展开；收起仅隐藏报告区块，分析数据保留可反复切换）
  const [reportCollapsed, setReportCollapsed] = useState(false);
  // v1.57：同日重复打卡 409 冲突信息与待覆盖重发的原 payload
  const [conflictInfo, setConflictInfo] = useState<SameDayConflictPayload | null>(null);
  const [pendingPayload, setPendingPayload] = useState<BmiAnalysisInput | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  /** 拉取全时序测量打卡历史（看板与历史表共用数据源） */
  const loadTimeseries = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await healthApi.getBmiTimeseries();
      setTimeseries(data?.timeseries || []);
    } catch {
      setTimeseries([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimeseries();
  }, [loadTimeseries, refreshTrigger]);

  // v1.60：当外部健康打卡弹窗生成了最新医学评估报告时，同步更新并自动平滑滚动定位
  useEffect(() => {
    if (externalAnalysisResult) {
      updateResult(externalAnalysisResult);
      setReportCollapsed(false);
      setTimeout(() => {
        reportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [externalAnalysisResult, updateResult]);

  const handleAnalyze = async (data: BmiAnalysisInput, overwrite = false) => {
    setLoading(true);
    try {
      const res = await healthApi.analyzeBmi(overwrite ? { ...data, overwrite: true } : data);
      updateResult(res);
      // 分析打卡已自动持久化，优先直接采用响应内带回的最新时序，失败再回源拉取
      if (res?.timeseries) {
        setTimeseries(res.timeseries);
      } else {
        loadTimeseries();
      }
      onRecordChanged?.();
      // v1.55：透出孕周引擎自动校准与基线初始化提示；v1.57：区分首次归档与覆盖当日记录
      const hints: string[] = [
        res?.record_action === "updated"
          ? "已覆盖更新当日打卡记录，评估报告已重新生成"
          : "分析完成！已为您生成专属医学达标报告与个性化方案",
      ];
      if (res?.baseline_initialized) {
        hints.push("首次打卡已自动以当前体重初始化孕前基线");
      }
      if (res?.gestation_check?.hint) {
        hints.push(res.gestation_check.hint);
      }
      showToast(hints.join("；"));
      // 覆盖/新增都切回展开态，并自动平滑滚动定位到分析报告
      setReportCollapsed(false);
      setTimeout(() => {
        reportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (err: any) {
      // v1.57：同日重复打卡 409 → 弹出覆盖确认弹窗（保留原 payload，确认后携 overwrite 重发）
      const conflict = (err?.data || err?.response?.data?.data) as SameDayConflictPayload | undefined;
      if (conflict?.conflict && conflict?.overwrite_supported) {
        setConflictInfo(conflict);
        setPendingPayload(data);
      } else {
        const data = err?.response?.data;
        showToast(data?.message || err?.message || "分析请求失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  /** 删除历史打卡记录（后端二次权限校验），删除后联动刷新看板 */
  const handleDeleteRecord = async (id: number) => {
    setDeletingId(id);
    try {
      await healthApi.remove(id);
      showToast("打卡记录已删除，图表看板已联动刷新");
      await loadTimeseries();
      onRecordChanged?.();
    } catch (err: any) {
      showToast(err.message || "删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  };

  /** v1.57：批量删除历史打卡记录（后端单事务批量接口），删除后联动刷新看板与状态卡 */
  const handleBatchDeleteRecords = async (ids: number[]) => {
    try {
      const res = await healthApi.batchDelete(ids);
      showToast(`已批量删除 ${res?.deleted ?? ids.length} 条打卡记录，看板已联动刷新`);
    } catch (err: any) {
      showToast(err?.message || "批量删除失败，请稍后重试");
    } finally {
      await loadTimeseries();
      onRecordChanged?.();
    }
  };

  const evalData = result?.evaluation;
  const isGainNormal = evalData?.gain_status === "normal";
  const isGainBelow = evalData?.gain_status === "below";

  // ===== v1.56：BMI 状态卡数据源（标准区间 + 当前测算 BMI + 孕前基线）=====
  const latestRecord = useMemo(() => {
    if (!timeseries.length) return null;
    const sorted = [...timeseries].sort((a, b) => (a.record_date < b.record_date ? -1 : 1));
    return sorted[sorted.length - 1] ?? null;
  }, [timeseries]);

  // v1.58：首次孕期打卡锚点（无预产期时孕周自动推算 孕x周x天）
  const gestationAnchor = useMemo(() => extractGestationAnchor(timeseries), [timeseries]);

  const bmiStatus = useMemo(() => {
    if (!latestRecord || !latestRecord.height) return null;
    const h = latestRecord.height / 100;
    const currentBmi = latestRecord.weight && h > 0 ? +(latestRecord.weight / (h * h)).toFixed(1) : null;
    const preBmi = latestRecord.bmi ?? null;
    const cat = (b: number) =>
      b < 18.5
        ? { label: "偏瘦", cls: "text-amber-500 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400" }
        : b < 24
        ? { label: "正常", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" }
        : b < 28
        ? { label: "超重", cls: "text-amber-500 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400" }
        : { label: "肥胖", cls: "text-red-500 bg-red-50 dark:bg-red-950/40 dark:text-red-400" };
    return { currentBmi, preBmi, currentCat: currentBmi ? cat(currentBmi) : null, preCat: preBmi ? cat(preBmi) : null };
  }, [latestRecord]);

  return (
    <div className="space-y-6">
      {/* 模块头部说明卡 */}
      <div className="rounded-2xl border border-orange-100/80 bg-gradient-to-r from-orange-50/70 via-warm/50 to-white p-5 shadow-2xs dark:border-gray-800 dark:from-gray-900 dark:via-gray-900/90 dark:to-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/20">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                孕产妇体重/BMI分析与个性化方案
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                国家卫健委标准 (WS/T 801-2022) 临床增重曲线 · 平台与SearXNG双通道膳食推荐 · 剧吐及子痫风险筛查
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 导出 A4 评估报告（打印 / PDF 下载，动态分包不影响首屏） */}
            <HealthReportExport records={timeseries} result={result} />
          </div>
        </div>
      </div>

      {/* v1.56：BMI 状态卡——标准区间 / 当前测算 BMI / 孕前基线（三个时段通用） */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">标准 BMI 区间（中国成人）</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-gray-800 dark:text-gray-100">18.5 ~ 23.9</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              正常
            </span>
          </div>
          <p className="text-[11px] text-gray-400">低于 18.5 偏瘦 · 24.0 ~ 27.9 超重 · ≥ 28.0 肥胖</p>
        </div>

        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">当前测算 BMI（按最新打卡）</span>
          {bmiStatus?.currentBmi ? (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold text-brand-600 dark:text-brand-400">
                {bmiStatus.currentBmi}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${bmiStatus.currentCat?.cls}`}>
                {bmiStatus.currentCat?.label}
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-300 dark:text-gray-600">完成一次打卡后展示</p>
          )}
          <p className="text-[11px] text-gray-400">按最新实测体重与身高实时测算</p>
        </div>

        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">孕前 BMI 基线</span>
          {bmiStatus?.preBmi ? (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold text-gray-800 dark:text-gray-100">{bmiStatus.preBmi}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${bmiStatus.preCat?.cls}`}>
                {bmiStatus.preCat?.label}
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-300 dark:text-gray-500">首次打卡自动初始化</p>
          )}
          <p className="text-[11px] text-gray-400">评估体重增长与目标设定的基准</p>
        </div>
      </div>

      {/* 卡片 1: 测量录入与按天打卡（v1.56 基线连续预填；v1.58 孕周锚点自动推算） */}
      <BmiFormCard
        onSubmit={handleAnalyze}
        loading={loading}
        initialHeight={latestRecord?.height ?? null}
        initialPreWeight={latestRecord?.pre_weight ?? null}
        gestationAnchor={gestationAnchor}
      />

      {/* 卡片 2: 多维度时序图表看板（趋势折线 / 增量柱状 + 时间跨度筛选） */}
      <BmiTimeSeriesBoard records={timeseries} loading={historyLoading} />

      {/* 卡片 3: 测量打卡历史数据表 */}
      <BmiHistoryTable
        records={timeseries}
        loading={historyLoading}
        onDelete={handleDeleteRecord}
        onBatchDelete={handleBatchDeleteRecords}
        deletingId={deletingId}
      />

      {/* 卡片 4: 本次分析报告（v1.60：双向联动折叠 + 平滑滚动锚点 + 持久化留存） */}
      {result && evalData && (
        <div ref={reportSectionRef} className="card overflow-hidden">
          {/* 报告标题栏：标题 + 评估摘要 + 折叠开关 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100/60 bg-gradient-to-r from-orange-50/70 to-transparent px-4 py-3 dark:border-gray-800 dark:from-gray-900/60">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">本次分析报告</h3>
                <p className="text-[11px] text-gray-400">
                  {`评估摘要：${evalData.stage_type === "pregnancy" ? gestationLabel(evalData.gestational_week, latestRecord?.gestational_days ?? null) : evalData.stage_type === "postpartum" ? `产后${evalData.postpartum_months ?? ""}个月` : "非孕期"} · 实际增重 ${evalData.actual_gain > 0 ? "+" : ""}${evalData.actual_gain}kg（${evalData.gain_status_label || "—"}）`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReportCollapsed((c) => !c)}
              className="btn-secondary shrink-0 gap-1 text-xs"
              title={reportCollapsed ? "展开报告内容（医学预警/指标概览/曲线/食谱/运动关怀）" : "收起报告内容，数据保留可随时展开"}
            >
              {reportCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {reportCollapsed ? "展开分析报告" : "收起分析报告"}
            </button>
          </div>

          {/* 报告内容（折叠时隐藏，数据保留） */}
          {!reportCollapsed && (
            <div className="space-y-6 p-4">
              {/* 4.1 医学异常预警 Banner */}
              <MedicalAlertBanner alerts={result.alerts || []} />

          {/* 4.2 核心指标概览看板 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card space-y-1 p-4">
              <span className="text-xs text-gray-400">孕前 BMI</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
                  {evalData.bmi}
                </span>
                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                  {evalData.category_label}
                </span>
              </div>
            </div>

            <div className="card space-y-1 p-4">
              <span className="text-xs text-gray-400">全孕期适宜总增重</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {evalData.recommended_total_gain_min} ~ {evalData.recommended_total_gain_max}
                </span>
                <span className="text-xs text-gray-500">kg</span>
              </div>
            </div>

            <div className="card space-y-1 p-4">
              <span className="text-xs text-gray-400">
                {evalData.stage_type === "postpartum" ? "产后滞留体重" : `当前${gestationLabel(evalData.gestational_week)}适宜区间`}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
                  {evalData.current_week_target_min} ~ {evalData.current_week_target_max}
                </span>
                <span className="text-xs text-gray-500">kg</span>
              </div>
            </div>

            <div className="card space-y-1 p-4">
              <span className="text-xs text-gray-400">当前实测增重</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-2xl font-extrabold ${
                    isGainNormal
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isGainBelow
                      ? "text-amber-500"
                      : "text-red-500"
                  }`}
                >
                  {evalData.actual_gain > 0 ? `+${evalData.actual_gain}` : evalData.actual_gain} kg
                </span>
                {isGainNormal ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isGainBelow ? (
                  <ArrowDownRight className="h-5 w-5 text-amber-500" />
                ) : (
                  <ArrowUpRight className="h-5 w-5 text-red-500" />
                )}
              </div>
            </div>
          </div>

          {/* 4.3 WS/T 801-2022 标准全孕期曲线看板 */}
          {evalData.curve && evalData.curve.length > 0 && (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 pb-2 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  国家卫健委 WS/T 801-2022 全孕期增重走势看板
                </h3>
                <span className="text-xs text-gray-400">
                  实线区域为达标区间 · 橙色点为您当前实测轨迹
                </span>
              </div>
              <WeightGainChart
                curve={evalData.curve}
                currentWeek={evalData.gestational_week}
                actualGain={evalData.actual_gain}
              />
            </div>
          )}

          {/* 4.4 双通道一日食谱卡片 */}
          {result.diet_plan && result.diet_plan.length > 0 && (
            <DietPlanCard
              meals={result.diet_plan}
              calorieBudget={evalData.recommended_weekly_gain}
              disclaimer={result.disclaimer}
            />
          )}

          {/* 4.5 运动与心理关怀卡片 */}
          <LifestyleCareCard advice={result.lifestyle_advice} />
            </div>
          )}
        </div>
      )}



      {/* 管理员 SearXNG 配置已移至「AI 助手配置」页（v1.56） */}

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      {/* v1.57：同日重复打卡覆盖确认弹窗（深度表单链路） */}
      <ConfirmDialog
        isOpen={conflictInfo !== null && pendingPayload !== null}
        title={`${conflictInfo?.existing_date ?? "当日"} 已有妈妈打卡记录`}
        message={`当日已有记录：体重 ${conflictInfo?.existing_weight ?? "—"} kg、身高 ${
          conflictInfo?.existing_height ?? "—"
        } cm。是否用本次测量数据覆盖更新当日记录？（覆盖保留原记录归档时间，不产生重复数据）`}
        confirmText="覆盖当日记录"
        cancelText="取消本次分析"
        danger={false}
        loading={loading}
        onConfirm={() => {
          if (pendingPayload) handleAnalyze(pendingPayload, true);
          setConflictInfo(null);
        }}
        onCancel={() => {
          setConflictInfo(null);
          setPendingPayload(null);
        }}
      />
    </div>
  );
}
