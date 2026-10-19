import type { BabyProfile } from "@/types";
import type { GestationAnchor } from "@/utils/gestation";
import { useState, useEffect, useCallback } from "react";
import {
  HeartPulse,
  Droplet,
  Activity,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import { healthApi } from "@/api/services";
import type {
  PregnancyStage,
  VitalsAnalysisInput,
  VitalsAnalysisResult,
  VitalsTimeSeriesRecord,
  VitalsSummary,
  SameDayConflictPayload,
} from "@/types/health";
import VitalsFormCard from "./VitalsFormCard";
import VitalsAlertBanner from "./VitalsAlertBanner";
import VitalsTimeSeriesBoard from "./VitalsTimeSeriesBoard";
import VitalsAiAdviceCard from "./VitalsAiAdviceCard";
import VitalsHistoryTable from "./VitalsHistoryTable";

const STORAGE_KEY = "mengya_latest_vitals_analysis";

interface VitalsAnalysisViewProps {
  refreshTrigger?: number;
  onRecordChanged?: () => void;
  stageType?: PregnancyStage;
  onStageTypeChange?: (st: PregnancyStage) => void;
  motherId?: number | null;
  currentGestationalWeek?: number | null;
  currentGestationalDays?: number | null;
  babies?: BabyProfile[];
  gestationAnchor?: GestationAnchor | null;
}

export default function VitalsAnalysisView({
  refreshTrigger,
  onRecordChanged,
  stageType = "pregnancy",
  onStageTypeChange,
  motherId,
  currentGestationalWeek,
  currentGestationalDays,
  babies,
  gestationAnchor,
}: VitalsAnalysisViewProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [timeseries, setTimeseries] = useState<VitalsTimeSeriesRecord[]>([]);
  const [summary, setSummary] = useState<VitalsSummary>({
    total_records: 0,
    latest_bp: null,
    latest_glucose: null,
    avg_systolic_7d: null,
    avg_diastolic_7d: null,
    avg_glucose_7d: null,
    abnormal_count: 0,
  });

  const [result, setResult] = useState<VitalsAnalysisResult | null>(() => {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [conflictInfo, setConflictInfo] = useState<SameDayConflictPayload | null>(null);
  const [pendingPayload, setPendingPayload] = useState<VitalsAnalysisInput | null>(null);
  const [toast, setToast] = useState<string>("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const updateResult = useCallback((newRes: VitalsAnalysisResult | null) => {
    setResult(newRes);
    try {
      if (newRes) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newRes));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await healthApi.getVitalsTimeseries({ mother_id: motherId });
      setTimeseries(res.timeseries || []);
      setSummary(
        res.summary || {
          total_records: (res.timeseries || []).length,
          latest_bp: null,
          latest_glucose: null,
          abnormal_count: 0,
        }
      );
    } catch {
      showToast("加载生命体征时序数据失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [motherId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleSubmit = async (input: VitalsAnalysisInput) => {
    setLoading(true);
    setConflictInfo(null);
    try {
      const res = await healthApi.analyzeVitals(input);
      updateResult(res);
      setTimeseries(res.timeseries || []);
      setSummary(res.summary);
      showToast(
        res.record_action === "updated"
          ? "已成功合并更新当日生命体征记录"
          : "生命体征打卡与评估成功"
      );
      onRecordChanged?.();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setPendingPayload(input);
        setConflictInfo(err.response.data?.data || null);
      } else {
        showToast(err?.response?.data?.message || "生命体征录入失败，请检查输入");
        throw err;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResolveConflict = async (overwrite: boolean) => {
    if (!overwrite || !pendingPayload) {
      setConflictInfo(null);
      setPendingPayload(null);
      return;
    }
    const payloadWithOverwrite = { ...pendingPayload, overwrite: true };
    setConflictInfo(null);
    setPendingPayload(null);
    await handleSubmit(payloadWithOverwrite);
  };

  const handleDelete = async (id: number) => {
    try {
      await healthApi.remove(id);
      showToast("记录已删除");
      loadData();
      onRecordChanged?.();
      if (result?.created_record_id === id) {
        updateResult(null);
      }
    } catch {
      showToast("删除记录失败");
    }
  };

  const handleBatchDelete = async (ids: number[]) => {
    try {
      await healthApi.batchDelete(ids);
      showToast(`已批量删除 ${ids.length} 条记录`);
      loadData();
      onRecordChanged?.();
      if (result?.created_record_id && ids.includes(result.created_record_id)) {
        updateResult(null);
      }
    } catch {
      showToast("批量删除失败");
    }
  };

  const handleViewAiFromRecord = (rec: VitalsTimeSeriesRecord) => {
    if (!rec.ai_analysis) return;
    const mockResult: VitalsAnalysisResult = {
      created_record_id: rec.id,
      completeness: rec.completeness || {
        has_bp: rec.systolic_bp != null,
        has_glucose: rec.blood_sugar != null,
        has_weight: rec.weight != null,
        has_pulse: rec.pulse != null,
        recorded_items: [],
        unrecorded_items: [],
        recorded_count: 0,
        unrecorded_count: 0,
        summary_text: "历史记录解读",
      },
      alerts: [],
      lifestyle_diet: {
        diet: ["遵医嘱保持低盐平衡膳食与规律进餐。"],
        lifestyle: ["保证充足休息，保持左侧卧位。"],
      },
      ai_analysis: {
        response: rec.ai_analysis,
        used_openai: true,
        used_config_name: "历史存档解读",
        latency_ms: 0,
      },
      timeseries: timeseries,
      summary: summary,
    };
    updateResult(mockResult);
    showToast(`已载入 ${rec.record_date} 的 AI 解读报告`);
  };

  return (
    <div className="space-y-6">
      {/* 顶部轻提示 Toast */}
      {toast && (
        <div className="fixed top-20 right-5 z-50 rounded-2xl bg-gray-900/90 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur-xs transition-all">
          {toast}
        </div>
      )}

      {/* 统计指标卡片阵列 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* 最新血压 */}
        <div className="card border-rose-100 bg-white p-4 shadow-2xs dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <HeartPulse className="h-4 w-4 text-rose-500" />
              最新血压
            </span>
            <span className="text-[10px]">
              {summary.latest_bp ? summary.latest_bp.record_date.slice(5) : "暂无"}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-rose-600 dark:text-rose-400">
              {summary.latest_bp
                ? `${summary.latest_bp.systolic}/${summary.latest_bp.diastolic}`
                : "--/--"}
            </span>
            <span className="text-[10px] text-gray-400 font-normal">mmHg</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px]">
            {summary.latest_bp ? (
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                  summary.latest_bp.status === "normal"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : summary.latest_bp.status === "elevated"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                }`}
              >
                {summary.latest_bp.status_label}
              </span>
            ) : (
              <span className="text-gray-400">待首次录入</span>
            )}
          </div>
        </div>

        {/* 最新血糖 */}
        <div className="card border-amber-100 bg-white p-4 shadow-2xs dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <Droplet className="h-4 w-4 text-amber-500" />
              最新血糖
            </span>
            <span className="text-[10px]">
              {summary.latest_glucose ? summary.latest_glucose.record_date.slice(5) : "暂无"}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
              {summary.latest_glucose ? summary.latest_glucose.glucose : "--"}
            </span>
            <span className="text-[10px] text-gray-400 font-normal">mmol/L</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px]">
            {summary.latest_glucose ? (
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                  summary.latest_glucose.status === "normal"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : summary.latest_glucose.status === "hypoglycemia"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {summary.latest_glucose.glucose_type_label} · {summary.latest_glucose.status_label}
              </span>
            ) : (
              <span className="text-gray-400">待首次测定</span>
            )}
          </div>
        </div>

        {/* 近7天均值 */}
        <div className="card border-sky-100 bg-white p-4 shadow-2xs dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <TrendingUp className="h-4 w-4 text-sky-500" />
              近7天均值
            </span>
            <span className="text-[10px]">平稳度</span>
          </div>
          <div className="mt-2 text-xs font-bold text-gray-700 dark:text-gray-200 space-y-0.5">
            <div>
              血压：{summary.avg_systolic_7d && summary.avg_diastolic_7d ? (
                <span className="text-sky-600">{summary.avg_systolic_7d}/{summary.avg_diastolic_7d}</span>
              ) : "--"}
            </div>
            <div>
              血糖：{summary.avg_glucose_7d ? (
                <span className="text-amber-600">{summary.avg_glucose_7d} mmol/L</span>
              ) : "--"}
            </div>
          </div>
        </div>

        {/* 异常预警次数 */}
        <div className="card border-purple-100 bg-white p-4 shadow-2xs dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <ShieldAlert className="h-4 w-4 text-purple-500" />
              异常警戒波动
            </span>
            <span className="text-[10px]">累计</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span
              className={`text-xl font-extrabold ${
                summary.abnormal_count > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {summary.abnormal_count}
            </span>
            <span className="text-[10px] text-gray-400 font-normal">次</span>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            {summary.abnormal_count > 0 ? "需关注波动原因" : "近期生命体征平稳"}
          </p>
        </div>
      </div>

      {/* 录入表单卡片 */}
      <VitalsFormCard
        onSubmit={handleSubmit}
        loading={loading}
        stageType={stageType}
        onStageTypeChange={onStageTypeChange}
        motherId={motherId}
        currentGestationalWeek={currentGestationalWeek}
        currentGestationalDays={currentGestationalDays}
        conflictInfo={conflictInfo}
        onResolveConflict={handleResolveConflict}
        babies={babies}
        gestationAnchor={gestationAnchor}
      />

      {/* 医学警报指示条 */}
      {result?.alerts && result.alerts.length > 0 && (
        <VitalsAlertBanner alerts={result.alerts} />
      )}

      {/* AI 深度解读卡片 */}
      {result && (
        <VitalsAiAdviceCard
          analysisResult={result}
          loading={loading}
          onReanalyze={() => {
            if (result.created_record_id) {
              setLoading(true);
              healthApi
                .analyzeVitalsAi({ record_id: result.created_record_id })
                .then((aiRes) => {
                  updateResult({
                    ...result,
                    ai_analysis: aiRes,
                  });
                  showToast("已刷新 AI 深度解读报告");
                })
                .catch(() => showToast("刷新 AI 解读失败"))
                .finally(() => setLoading(false));
            }
          }}
        />
      )}

      {/* 时序走势图看板 */}
      <VitalsTimeSeriesBoard timeseries={timeseries} />

      {/* 历史明细表 */}
      <VitalsHistoryTable
        records={timeseries}
        loading={historyLoading}
        onDelete={handleDelete}
        onBatchDelete={handleBatchDelete}
        onViewAi={handleViewAiFromRecord}
      />
    </div>
  );
}
