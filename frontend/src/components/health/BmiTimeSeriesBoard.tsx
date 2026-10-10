import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { LineChart as LineChartIcon, BarChart3, TrendingUp } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { gestationLabel } from "@/utils/gestation";
import type { BmiTimeSeriesRecord } from "@/types/health";

/**
 * WS/T 801-2022 全孕期增重推荐标准（与后端 medical_calculator.py 保持一致）
 * first: 孕早期(1~13周)总增重区间; rate: 孕中晚期每周推荐增重速率
 */
const WS_STANDARDS = {
  single: {
    underweight: { firstMin: 1.0, firstMax: 2.0, rateMin: 0.38, rateMax: 0.58 },
    normal: { firstMin: 0.5, firstMax: 2.0, rateMin: 0.26, rateMax: 0.48 },
    overweight: { firstMin: 0.5, firstMax: 1.5, rateMin: 0.22, rateMax: 0.37 },
    obese: { firstMin: 0.0, firstMax: 1.0, rateMin: 0.15, rateMax: 0.3 },
  },
  twins: {
    underweight: { firstMin: 1.5, firstMax: 3.0, rateMin: 0.6, rateMax: 0.85 },
    normal: { firstMin: 1.0, firstMax: 2.8, rateMin: 0.55, rateMax: 0.78 },
    overweight: { firstMin: 1.0, firstMax: 2.5, rateMin: 0.45, rateMax: 0.7 },
    obese: { firstMin: 0.5, firstMax: 2.0, rateMin: 0.35, rateMax: 0.6 },
  },
} as const;

type BmiCategory = "underweight" | "normal" | "overweight" | "obese";
type ViewMode = "trend" | "delta";
type SpanKey = "7d" | "1m" | "all";

const SPAN_OPTIONS: Array<{ key: SpanKey; label: string }> = [
  { key: "7d", label: "近7天" },
  { key: "1m", label: "近1个月" },
  { key: "all", label: "全周期" },
];

/** 依据孕前 BMI 计算卫健委分级 */
function getBmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 24.0) return "normal";
  if (bmi < 28.0) return "overweight";
  return "obese";
}

/** 依据孕周与分级计算 WS/T 801-2022 当周推荐增重区间与中位线 */
function getWeekTarget(week: number, category: BmiCategory, isTwins: boolean) {
  const table = isTwins ? WS_STANDARDS.twins : WS_STANDARDS.single;
  const std = table[category];
  const w = Math.max(1, Math.min(week, 40));
  let tMin: number;
  let tMax: number;
  if (w <= 13) {
    const ratio = w / 13.0;
    tMin = std.firstMin * ratio;
    tMax = std.firstMax * ratio;
  } else {
    tMin = std.firstMin + (w - 13) * std.rateMin;
    tMax = std.firstMax + (w - 13) * std.rateMax;
  }
  tMin = +tMin.toFixed(2);
  tMax = +tMax.toFixed(2);
  return { min: tMin, max: tMax, median: +((tMin + tMax) / 2).toFixed(2) };
}

function recordLabel(r: BmiTimeSeriesRecord): string {
  const datePart = r.record_date.slice(5);
  // v1.55/1.56 语义统一：按 stage 区分（兼容历史数据 record_type 回推）；v1.58 孕x周x天粒度
  if (r.stage === "postpartum") {
    return r.postpartum_months != null ? `${datePart} 产后${r.postpartum_months}月` : `${datePart} 产后`;
  }
  if (r.stage === "general") {
    return `${datePart} 非孕期`;
  }
  if (r.stage === "pregnancy" || r.record_type === "prenatal_exam") {
    return r.gestational_week ? `${datePart} ${gestationLabel(r.gestational_week, r.gestational_days)}` : `${datePart} 孕期`;
  }
  return datePart;
}

interface BmiTimeSeriesBoardProps {
  records: BmiTimeSeriesRecord[];
  loading?: boolean;
}

export default function BmiTimeSeriesBoard({ records, loading }: BmiTimeSeriesBoardProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  // v1.57：图表实例复用——init 一次 + setOption 原地热更新，避免每次数据/主题变化重建实例的性能开销与闪烁
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const { isDark } = useThemeStore();
  const [viewMode, setViewMode] = useState<ViewMode>("trend");
  const [spanKey, setSpanKey] = useState<SpanKey>("all");

  /** 按时间正序整理并补充派生字段（累计增重 + 当周推荐区间） */
  const enriched = useMemo(() => {
    const sorted = [...records].sort((a, b) =>
      a.record_date === b.record_date ? a.id - b.id : a.record_date < b.record_date ? -1 : 1
    );
    let runningDelta = 0;
    return sorted.map((r, idx) => {
      // 累计增重：优先孕前基线法，缺失时回退为相邻增量链式累计
      let cumulative: number;
      if (r.cumulative_gain != null) {
        cumulative = r.cumulative_gain;
      } else if (r.pre_weight && r.pre_weight > 0) {
        cumulative = +(r.weight - r.pre_weight).toFixed(2);
      } else {
        runningDelta = idx === 0 ? 0 : +(runningDelta + r.delta_kg).toFixed(2);
        cumulative = runningDelta;
      }
      // 当周 WS/T 801-2022 推荐区间（仅孕期打卡且具备孕前基线数据时计算；产后/非孕期记录不绘通道带）
      let target: { min: number; max: number; median: number } | null = null;
      const isPregnancyStage = r.stage === "pregnancy" || (!r.stage && r.record_type === "prenatal_exam");
      if (isPregnancyStage && r.gestational_week && r.height && r.pre_weight) {
        const preBmi = r.pre_weight / ((r.height / 100) ** 2);
        target = getWeekTarget(r.gestational_week, getBmiCategory(preBmi), !!r.is_twins);
      }
      return { ...r, label: recordLabel(r), cumulative, target };
    });
  }, [records]);

  // v1.56：是否为纯非孕期视图（全部记录为 general 或产后且无任何孕期记录）
  const isNonPregnancyView = useMemo(() => {
    if (enriched.length === 0) return false;
    return !enriched.some((r) => r.stage === "pregnancy" || (!r.stage && r.record_type === "prenatal_exam"));
  }, [enriched]);

  /** 时间跨度筛选（以最近一次打卡日期为锚点回溯） */
  const filtered = useMemo(() => {
    if (spanKey === "all" || enriched.length === 0) return enriched;
    const spanDays = spanKey === "7d" ? 7 : 31;
    const anchor = new Date(enriched[enriched.length - 1].record_date).getTime();
    const from = anchor - (spanDays - 1) * 86400000;
    return enriched.filter((r) => new Date(r.record_date).getTime() >= from);
  }, [enriched, spanKey]);

  useEffect(() => {
    if (!chartRef.current || !chartInstanceRef.current || filtered.length === 0 || loading) return;

    const chart = chartInstanceRef.current;
    const axisLabelColor = isDark ? "#94a3b8" : "#64748b";
    const splitLineColor = isDark ? "#1e293b" : "#f1f5f9";
    const axisLineColor = isDark ? "#334155" : "#e2e8f0";

    const labels = filtered.map((r) => r.label);
    let option: echarts.EChartsOption;

    if (viewMode === "trend") {
      if (isNonPregnancyView) {
        // ===== v1.56 非孕期视图：体重走势 + BMI 标准区间（18.5~23.9）体重参考带 =====
        const heightM = filtered[0]?.height ? filtered[0].height / 100 : null;
        const bandMin = heightM ? +(18.5 * heightM * heightM).toFixed(1) : null;
        const bandMax = heightM ? +(23.9 * heightM * heightM).toFixed(1) : null;
        const bandDiffArr = filtered.map(() => (bandMin != null && bandMax != null ? +(bandMax - bandMin).toFixed(1) : null));
        const bandBase = filtered.map(() => bandMin);
        const midBmiWeight = heightM ? +(21.2 * heightM * heightM).toFixed(1) : null;
        const mediansWeight = filtered.map(() => midBmiWeight);
        const weights = filtered.map((r) => r.weight);

        option = {
          tooltip: {
            trigger: "axis",
            backgroundColor: isDark ? "#1e293b" : "#ffffff",
            borderColor: axisLineColor,
            textStyle: { color: isDark ? "#f1f5f9" : "#1e293b", fontSize: 12 },
            formatter: (params: any) => {
              const rec = filtered[params[0]?.dataIndex];
              if (!rec) return "";
              const stageTxt =
                rec.stage === "general" ? "非孕期" : rec.stage === "postpartum" ? "产后" : "孕期";
              let tip = `<b>${rec.record_date} · ${stageTxt}</b><br/>`;
              if (bandMin != null && bandMax != null) {
                tip += `<span style="color:#3b82f6">●</span> BMI 正常区间对应体重：${bandMin} ~ ${bandMax} kg<br/>`;
              }
              tip += `<span style="color:#f97316">★</span> <b>实测体重：${rec.weight} kg</b>${rec.bmi ? `（孕前 BMI ${rec.bmi}）` : ""}`;
              return tip;
            },
          },
          legend: {
            bottom: 0,
            textStyle: { color: axisLabelColor, fontSize: 12 },
            data: ["BMI 18.5~23.9 标准区间", "BMI 21 中位参考", "实测体重走势"],
          },
          grid: { top: 30, right: 25, bottom: 50, left: 45 },
          xAxis: {
            type: "category",
            data: labels,
            boundaryGap: false,
            axisLabel: { color: axisLabelColor, fontSize: 11 },
            axisLine: { lineStyle: { color: axisLineColor } },
          },
          yAxis: {
            type: "value",
            name: "体重 (kg)",
            nameTextStyle: { color: axisLabelColor, fontSize: 11 },
            axisLabel: { color: axisLabelColor },
            splitLine: { lineStyle: { color: splitLineColor } },
          },
          series: [
            {
              name: "下限基准",
              type: "line",
              data: bandMin != null ? bandBase : [],
              stack: "bmi-band",
              lineStyle: { opacity: 0 },
              symbol: "none",
              silent: true,
            },
            {
              name: "BMI 18.5~23.9 标准区间",
              type: "line",
              data: bandDiffArr,
              stack: "bmi-band",
              lineStyle: { opacity: 0 },
              areaStyle: { color: isDark ? "rgba(59, 130, 246, 0.22)" : "rgba(59, 130, 246, 0.15)" },
              symbol: "none",
            },
            {
              name: "BMI 21 中位参考",
              type: "line",
              data: mediansWeight,
              smooth: true,
              lineStyle: { color: isDark ? "#60a5fa" : "#3b82f6", width: 2, type: "dashed" },
              symbol: "none",
            },
            {
              name: "实测体重走势",
              type: "line",
              data: weights,
              smooth: true,
              lineStyle: { color: "#f97316", width: 3 },
              itemStyle: {
                color: "#f97316",
                borderColor: "#ffffff",
                borderWidth: 1.5,
                shadowBlur: 6,
                shadowColor: "rgba(249, 115, 22, 0.5)",
              },
              symbolSize: 9,
            },
          ],
        };
      } else {
      // ===== 趋势视图：WS/T 801-2022 通道带 + 中位线 + 实测走势 =====
      const bandMins = filtered.map((r) => (r.target ? r.target.min : null));
      const bandDiff = filtered.map((r) =>
        r.target ? +((r.target.max - r.target.min)).toFixed(2) : null
      );
      const medians = filtered.map((r) => (r.target ? r.target.median : null));
      const actualGains = filtered.map((r) => r.cumulative);

      option = {
        tooltip: {
          trigger: "axis",
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: axisLineColor,
          textStyle: { color: isDark ? "#f1f5f9" : "#1e293b", fontSize: 12 },
          formatter: (params: any) => {
            const rec = filtered[params[0]?.dataIndex];
            if (!rec) return "";
            let tip = `<b>${rec.record_date}${rec.gestational_week ? ` · ${gestationLabel(rec.gestational_week, rec.gestational_days)}` : rec.stage === "postpartum" ? " · 产后" : rec.stage === "general" ? " · 非孕期" : ""}</b><br/>`;
            if (rec.target) {
              tip += `<span style="color:#10b981">●</span> 当周适宜增重：${rec.target.min} ~ ${rec.target.max} kg<br/>`;
              tip += `<span style="color:#34d399">--</span> 适宜中位：${rec.target.median} kg<br/>`;
            }
            tip += `<span style="color:#f97316">★</span> <b>实测累计增重：${rec.cumulative > 0 ? "+" : ""}${rec.cumulative} kg</b>（体重 ${rec.weight} kg）`;
            return tip;
          },
        },
        legend: {
          bottom: 0,
          textStyle: { color: axisLabelColor, fontSize: 12 },
          data: ["WS/T 801-2022推荐区间", "推荐中位线", "实测增重走势"],
        },
        grid: { top: 30, right: 25, bottom: 50, left: 45 },
        xAxis: {
          type: "category",
          data: labels,
          boundaryGap: false,
          axisLabel: { color: axisLabelColor, fontSize: 11 },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          name: "累计增重 (kg)",
          nameTextStyle: { color: axisLabelColor, fontSize: 11 },
          axisLabel: { color: axisLabelColor },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            // 1. 通道带下限基准（透明占位）
            name: "下限基准",
            type: "line",
            data: bandMins,
            stack: "confidence-band",
            lineStyle: { opacity: 0 },
            symbol: "none",
            silent: true,
          },
          {
            // 2. WS/T 801-2022 推荐安全通道带（淡绿半透明堆叠面积）
            name: "WS/T 801-2022推荐区间",
            type: "line",
            data: bandDiff,
            stack: "confidence-band",
            lineStyle: { opacity: 0 },
            areaStyle: { color: isDark ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.18)" },
            symbol: "none",
          },
          {
            // 3. 推荐中位线（绿色虚线）
            name: "推荐中位线",
            type: "line",
            data: medians,
            smooth: true,
            lineStyle: { color: isDark ? "#34d399" : "#10b981", width: 2, type: "dashed" },
            symbol: "none",
          },
          {
            // 4. 用户实测时序曲线（橙色实线发光点）
            name: "实测增重走势",
            type: "line",
            data: actualGains,
            smooth: true,
            lineStyle: { color: "#f97316", width: 3 },
            itemStyle: {
              color: "#f97316",
              borderColor: "#ffffff",
              borderWidth: 1.5,
              shadowBlur: 6,
              shadowColor: "rgba(249, 115, 22, 0.5)",
            },
            symbolSize: 9,
          },
        ],
      };
      }
    } else {
      // ===== 增量视图：相邻两次打卡净增重 Δkg 变色柱状图 =====
      const deltaRecords = filtered.slice(1); // 首次打卡无前值参照，不参与柱状图
      const deltaLabels = deltaRecords.map((r) => r.label);
      const deltaValues = deltaRecords.map((r) => ({
        value: r.delta_kg,
        itemStyle: {
          // >0.9kg 红色预警 / >0.6kg 橙色提醒 / <-0.5kg 紫色下降 / 其余绿色达标
          color:
            r.delta_kg > 0.9
              ? "#ef4444"
              : r.delta_kg > 0.6
              ? "#f59e0b"
              : r.delta_kg < -0.5
              ? "#6366f1"
              : "#10b981",
        },
      }));

      option = {
        tooltip: {
          trigger: "item",
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: axisLineColor,
          textStyle: { color: isDark ? "#f1f5f9" : "#1e293b", fontSize: 12 },
          formatter: (param: any) => {
            const rec = deltaRecords[param.dataIndex];
            if (!rec) return "";
            const val = param.value as number;
            const verdict =
              val > 0.9 ? "⚠ 超出单次安全阈值" : val > 0.6 ? "注意：增重偏快" : val < -0.5 ? "体重明显下降，请关注" : "处于安全范围";
            return `<b>${rec.record_date}${rec.gestational_week ? ` · ${gestationLabel(rec.gestational_week, rec.gestational_days)}` : rec.stage === "postpartum" ? " · 产后" : ""}</b><br/>较上次变化：<b>${val > 0 ? "+" : ""}${val} kg</b><br/>${verdict}`;
          },
        },
        grid: { top: 30, right: 25, bottom: 45, left: 45 },
        xAxis: {
          type: "category",
          data: deltaLabels,
          axisLabel: { color: axisLabelColor, fontSize: 11 },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          name: "单次净增重 (kg)",
          nameTextStyle: { color: axisLabelColor, fontSize: 11 },
          axisLabel: { color: axisLabelColor },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            name: "净增重 Δkg",
            type: "bar",
            barMaxWidth: 36,
            data: deltaValues,
            markLine: {
              symbol: "none",
              data: [
                { yAxis: 0.9, lineStyle: { color: "#ef4444", type: "dashed" }, label: { formatter: "超标阈值 0.9kg", color: "#ef4444", fontSize: 10 } },
                { yAxis: 0, lineStyle: { color: axisLabelColor } },
              ],
            },
          },
        ],
      };
    }

    // v1.57 热更新：原地 setOption（notMerge 全量替换，视图切换时彻底清理旧系列/坐标轴）
    chart.setOption(option, { notMerge: true });
  }, [filtered, viewMode, isDark, loading]);

  // v1.57 图表实例生命周期：挂载时 init 一次 + ResizeObserver 容器级自适应（替代 window resize 监听），卸载时 dispose
  useEffect(() => {
    const container = chartRef.current;
    if (!container) return;
    const chart = echarts.init(container);
    chartInstanceRef.current = chart;
    const observer = new ResizeObserver(() => {
      if (chartInstanceRef.current) chartInstanceRef.current.resize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  const noData = filtered.length === 0;
  const deltaInsufficient = viewMode === "delta" && filtered.length < 2;

  return (
    <div className="card space-y-3">
      {/* 看板头部：视图切换器 + 时间跨度筛选 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100/60 pb-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              多维度时序图表看板
            </h3>
            <p className="text-xs text-gray-400">
              {isNonPregnancyView
                ? "BMI 18.5~23.9 标准区间体重参考带 · 实测体重走势"
                : "WS/T 801-2022 安全通道趋势 · 单次净增重 Δkg 变色预警"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 视图切换器 */}
          <div className="flex rounded-xl bg-gray-100 p-0.5 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setViewMode("trend")}
              className={`flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === "trend"
                  ? "bg-brand-500 text-white shadow-xs"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <LineChartIcon className="h-3.5 w-3.5" />
              趋势视图
            </button>
            <button
              type="button"
              onClick={() => setViewMode("delta")}
              className={`flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === "delta"
                  ? "bg-brand-500 text-white shadow-xs"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              增量视图
            </button>
          </div>

          {/* 时间跨度筛选 */}
          <div className="flex flex-wrap gap-1.5">
            {SPAN_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSpanKey(opt.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                  spanKey === opt.key
                    ? "bg-orange-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 增量变色规则图例 */}
      {viewMode === "delta" && !noData && !deltaInsufficient && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />安全 (≤0.6kg)</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />偏快 (0.6~0.9kg)</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />超标 (&gt;0.9kg)</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />下降 (&lt;-0.5kg)</span>
        </div>
      )}

      {/* 图表主体（v1.57：容器常驻挂载，提示层覆盖其上，避免条件渲染导致图表实例反复重建） */}
      <div className="relative">
        <div ref={chartRef} style={{ height: 320 }} className="w-full" />
        {(loading || noData || deltaInsufficient) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/50">
            <p className="max-w-[80%] text-center text-sm text-gray-400">
              {loading
                ? "时序数据加载中…"
                : noData
                ? "当前时间跨度内暂无测量打卡数据，完成一次打卡后即可查看趋势与增量分析"
                : "增量视图需至少两次打卡记录才能对比相邻变化，请再完成一次测量打卡"}
            </p>
          </div>
        )}
      </div>

      {viewMode === "trend" && !noData && (
        <p className="text-right text-[11px] text-gray-400">
          {isNonPregnancyView
            ? "蓝色带为 BMI 18.5~23.9 标准区间对应体重范围 · 橙色曲线为您的实测体重走势"
            : "绿色带为 WS/T 801-2022 当周推荐增重通道 · 橙色曲线为您的实测累计增重走势"}
        </p>
      )}
    </div>
  );
}
