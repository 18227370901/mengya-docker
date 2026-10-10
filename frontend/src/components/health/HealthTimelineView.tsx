import React, { useMemo, useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import {
  Calendar,
  Clock,
  BarChart3,
  TrendingUp,
  HeartPulse,
  Baby,
  ShieldCheck,
  Filter,
  Sparkles,
  ChevronRight,
  Activity,
  FileText,
  CalendarCheck2,
} from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { gestationLabel } from "@/utils/gestation";
import type { HealthRecord } from "@/types";
import HealthCalendar from "../HealthCalendar";
import CopyButton from "@/components/CopyButton";

type ViewMode = "timeline" | "charts" | "calendar";
type FilterType = "all" | "prenatal_exam" | "growth_measurement" | "vaccination";

interface HealthTimelineViewProps {
  records: HealthRecord[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onDayClick?: (date: string, records: HealthRecord[]) => void;
  onCheckInClick?: (date?: string) => void;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; badgeCls: string; dotCls: string; icon: typeof HeartPulse }
> = {
  prenatal_exam: {
    label: "孕期产检",
    color: "#ec4899",
    badgeCls: "bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800",
    dotCls: "bg-pink-500 ring-pink-100 dark:ring-pink-950",
    icon: HeartPulse,
  },
  growth_measurement: {
    label: "生长测量",
    color: "#10b981",
    badgeCls: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    dotCls: "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950",
    icon: Baby,
  },
  vaccination: {
    label: "疫苗接种",
    color: "#3b82f6",
    badgeCls: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    dotCls: "bg-blue-500 ring-blue-100 dark:ring-blue-950",
    icon: ShieldCheck,
  },
  vaccine: {
    label: "疫苗接种",
    color: "#3b82f6",
    badgeCls: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    dotCls: "bg-blue-500 ring-blue-100 dark:ring-blue-950",
    icon: ShieldCheck,
  },
};

export default function HealthTimelineView({
  records,
  currentMonth,
  onMonthChange,
  onDayClick,
  onCheckInClick,
}: HealthTimelineViewProps) {
  const isDark = useThemeStore((s) => s.theme === "dark");

  // 持久化视图偏好，默认首选“时间轴流”
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem("mengya_timeline_view_mode");
      if (saved === "timeline" || saved === "charts" || saved === "calendar") return saved;
    } catch {}
    return "timeline";
  });

  const [filterType, setFilterType] = useState<FilterType>("all");

  const handleViewChange = (m: ViewMode) => {
    setViewMode(m);
    try {
      localStorage.setItem("mengya_timeline_view_mode", m);
    } catch {}
  };

  // 1. 统计数据摘要
  const stats = useMemo(() => {
    let momCount = 0;
    let babyCount = 0;
    let vaccineCount = 0;
    for (const r of records) {
      if (r.record_type === "prenatal_exam") momCount++;
      else if (r.record_type === "growth_measurement") babyCount++;
      else if (r.record_type === "vaccination" || r.record_type === "vaccine") vaccineCount++;
    }
    const sorted = [...records].sort((a, b) => (a.record_date < b.record_date ? 1 : -1));
    return {
      total: records.length,
      momCount,
      babyCount,
      vaccineCount,
      latestDate: sorted[0]?.record_date || null,
    };
  }, [records]);

  // 2. 过滤排序后的时间轴记录（时间倒序）
  const timelineRecords = useMemo(() => {
    const list = records.filter((r) => {
      if (filterType === "all") return true;
      if (filterType === "vaccination") return r.record_type === "vaccination" || r.record_type === "vaccine";
      return r.record_type === filterType;
    });
    return list.sort((a, b) => (a.record_date === b.record_date ? b.id - a.id : a.record_date < b.record_date ? 1 : -1));
  }, [records, filterType]);

  // 3. ECharts 图表容器引用
  const barChartRef = useRef<HTMLDivElement | null>(null);
  const pieChartRef = useRef<HTMLDivElement | null>(null);
  const barInstanceRef = useRef<echarts.ECharts | null>(null);
  const pieInstanceRef = useRef<echarts.ECharts | null>(null);

  // 初始化与更新统计图表
  useEffect(() => {
    if (viewMode !== "charts") return;

    const axisLabelColor = isDark ? "#94a3b8" : "#64748b";
    const axisLineColor = isDark ? "#334155" : "#e2e8f0";
    const splitLineColor = isDark ? "#1e293b" : "#f1f5f9";

    // 3.1 柱状图：按近6个月统计各类型打卡频次
    if (barChartRef.current) {
      if (!barInstanceRef.current) {
        barInstanceRef.current = echarts.init(barChartRef.current);
      }
      const chart = barInstanceRef.current;

      // 生成最近 6 个月月份标签
      const months: string[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      const momMonthly = months.map(() => 0);
      const babyMonthly = months.map(() => 0);
      const vacMonthly = months.map(() => 0);

      records.forEach((r) => {
        const m = r.record_date.slice(0, 7);
        const idx = months.indexOf(m);
        if (idx !== -1) {
          if (r.record_type === "prenatal_exam") momMonthly[idx]++;
          else if (r.record_type === "growth_measurement") babyMonthly[idx]++;
          else if (r.record_type === "vaccination" || r.record_type === "vaccine") vacMonthly[idx]++;
        }
      });

      chart.setOption(
        {
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            backgroundColor: isDark ? "#1e293b" : "#ffffff",
            borderColor: axisLineColor,
            textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
          },
          legend: {
            bottom: 0,
            textStyle: { color: axisLabelColor, fontSize: 11 },
            data: ["孕期产检", "宝宝生长", "疫苗接种"],
          },
          grid: { top: 30, right: 20, bottom: 40, left: 40 },
          xAxis: {
            type: "category",
            data: months,
            axisLabel: { color: axisLabelColor, fontSize: 11 },
            axisLine: { lineStyle: { color: axisLineColor } },
          },
          yAxis: {
            type: "value",
            minInterval: 1,
            axisLabel: { color: axisLabelColor },
            splitLine: { lineStyle: { color: splitLineColor } },
          },
          series: [
            {
              name: "孕期产检",
              type: "bar",
              stack: "total",
              itemStyle: { color: "#ec4899" },
              data: momMonthly,
            },
            {
              name: "宝宝生长",
              type: "bar",
              stack: "total",
              itemStyle: { color: "#10b981" },
              data: babyMonthly,
            },
            {
              name: "疫苗接种",
              type: "bar",
              stack: "total",
              itemStyle: { color: "#3b82f6" },
              data: vacMonthly,
            },
          ],
        },
        { notMerge: true }
      );
    }

    // 3.2 环形饼图：健康档案记录构成
    if (pieChartRef.current) {
      if (!pieInstanceRef.current) {
        pieInstanceRef.current = echarts.init(pieChartRef.current);
      }
      const chart = pieInstanceRef.current;
      const pieData = [
        { value: stats.momCount, name: "孕期产检", itemStyle: { color: "#ec4899" } },
        { value: stats.babyCount, name: "宝宝生长", itemStyle: { color: "#10b981" } },
        { value: stats.vaccineCount, name: "疫苗接种", itemStyle: { color: "#3b82f6" } },
      ].filter((d) => d.value > 0);

      chart.setOption(
        {
          tooltip: {
            trigger: "item",
            backgroundColor: isDark ? "#1e293b" : "#ffffff",
            borderColor: axisLineColor,
            textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
            formatter: "{b}: {c} 次 ({d}%)",
          },
          legend: {
            bottom: 0,
            textStyle: { color: axisLabelColor, fontSize: 11 },
          },
          series: [
            {
              name: "记录类型",
              type: "pie",
              radius: ["42%", "70%"],
              center: ["50%", "45%"],
              avoidLabelOverlap: false,
              itemStyle: {
                borderRadius: 6,
                borderColor: isDark ? "#1f2937" : "#fff",
                borderWidth: 2,
              },
              label: { show: false },
              emphasis: {
                label: {
                  show: true,
                  fontSize: 12,
                  fontWeight: "bold",
                  color: isDark ? "#f1f5f9" : "#1e293b",
                },
              },
              data: pieData.length > 0 ? pieData : [{ value: 1, name: "暂无记录", itemStyle: { color: "#cbd5e1" } }],
            },
          ],
        },
        { notMerge: true }
      );
    }

    const handleResize = () => {
      barInstanceRef.current?.resize();
      pieInstanceRef.current?.resize();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [viewMode, records, isDark, stats]);

  return (
    <div className="space-y-5">
      {/* 顶部宏观统计卡片栏 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">健康档案总数</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">{stats.total}</span>
            <span className="text-xs text-gray-500">次打卡</span>
          </div>
          <p className="text-[11px] text-gray-400 truncate">
            {stats.latestDate ? `最近：${stats.latestDate}` : "暂无打卡数据"}
          </p>
        </div>

        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">妈妈产检记录</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-pink-600 dark:text-pink-400">{stats.momCount}</span>
            <span className="text-xs text-gray-500">条</span>
          </div>
          <p className="text-[11px] text-gray-400">孕期指标与体重时序</p>
        </div>

        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">宝宝生长测量</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.babyCount}</span>
            <span className="text-xs text-gray-500">条</span>
          </div>
          <p className="text-[11px] text-gray-400">身长 · 体重 · 头围</p>
        </div>

        <div className="card space-y-1 p-4">
          <span className="text-xs text-gray-400">疫苗接种档案</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{stats.vaccineCount}</span>
            <span className="text-xs text-gray-500">针次</span>
          </div>
          <p className="text-[11px] text-gray-400">计划免疫与防病接种</p>
        </div>
      </div>

      {/* 控制工具条：标题 + 视图模式切换器 */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 shadow-2xs">
            {viewMode === "timeline" ? (
              <Clock className="h-4.5 w-4.5" />
            ) : viewMode === "charts" ? (
              <BarChart3 className="h-4.5 w-4.5" />
            ) : (
              <Calendar className="h-4.5 w-4.5" />
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
              {viewMode === "timeline"
                ? "健康事件时间轴"
                : viewMode === "charts"
                ? "健康打卡统计与图表看板"
                : "健康日历总览"}
            </h2>
            <p className="text-xs text-gray-400">
              {viewMode === "timeline"
                ? "纵向时间轴流 · 支持按产检/生长/疫苗分类筛选"
                : viewMode === "charts"
                ? "月度活跃度堆叠柱状图 · 记录类型构成环形图"
                : "经典月历视图 · 点击历史日期可快速补录健康打卡"}
            </p>
          </div>
        </div>

        {/* 视图模式三选一切换器 */}
        <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => handleViewChange("timeline")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "timeline"
                ? "bg-white text-brand-600 shadow-2xs dark:bg-gray-700 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            时间轴流
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("charts")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "charts"
                ? "bg-white text-brand-600 shadow-2xs dark:bg-gray-700 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            统计图表
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("calendar")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "calendar"
                ? "bg-white text-brand-600 shadow-2xs dark:bg-gray-700 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            日历总览
          </button>
        </div>
      </div>

      {/* 视图 1：纵向时间轴流 (Timeline) */}
      {viewMode === "timeline" && (
        <div className="space-y-4">
          {/* 类型筛选标签 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400 font-medium mr-1">
              <Filter className="h-3.5 w-3.5" /> 筛选：
            </span>
            {[
              { key: "all", label: `全部 (${stats.total})` },
              { key: "prenatal_exam", label: `孕期产检 (${stats.momCount})` },
              { key: "growth_measurement", label: `宝宝生长 (${stats.babyCount})` },
              { key: "vaccination", label: `疫苗接种 (${stats.vaccineCount})` },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilterType(f.key as FilterType)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterType === f.key
                    ? "bg-brand-500 text-white shadow-2xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {timelineRecords.length === 0 ? (
            <div className="card py-12 text-center text-sm text-gray-400 space-y-2">
              <p>暂无符合筛选条件的健康时间轴记录</p>
              <button
                type="button"
                onClick={() => onCheckInClick?.()}
                className="btn-primary text-xs mx-auto"
              >
                立即健康打卡
              </button>
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 space-y-4">
              {/* 垂直时间轴基线 */}
              <div className="absolute left-2.5 sm:left-3.5 top-3 bottom-3 w-0.5 bg-orange-100 dark:bg-gray-800" />

              {timelineRecords.map((r) => {
                const cfg = TYPE_CONFIG[r.record_type] || TYPE_CONFIG.prenatal_exam;
                const IconComponent = cfg.icon;

                return (
                  <div key={r.id} className="relative group">
                    {/* 时间轴节点圆点光标 */}
                    <div
                      className={`absolute -left-6 sm:-left-8 top-4 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-white ring-4 transition ${cfg.dotCls}`}
                    >
                      <IconComponent className="h-3 w-3" />
                    </div>

                    {/* 节点卡片 */}
                    <div className="card p-4 transition-all hover:shadow-md dark:hover:border-gray-700">
                      {/* 卡片头部：日期 + 类型徽章 + 阶段 */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                            {r.record_date}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.badgeCls}`}>
                            {cfg.label}
                          </span>
                          {r.gestational_week && (
                            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
                              {gestationLabel(r.gestational_week, (r as any).exam_items?.gestational_days ?? null)}
                            </span>
                          )}
                          {r.baby_age_days != null && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                              宝宝 {Math.floor(r.baby_age_days / 30.44)} 个月
                            </span>
                          )}
                        </div>

                        {/* 操作提示 */}
                        {onDayClick && (
                          <button
                            type="button"
                            onClick={() => onDayClick(r.record_date, [r])}
                            className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition flex items-center gap-0.5"
                          >
                            补录该日 <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* 测量指标芯片 */}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {r.weight != null && (
                          <div className="rounded-lg bg-gray-50 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <span className="text-gray-400 mr-1">体重:</span>
                            <span className="font-semibold">{r.weight} kg</span>
                          </div>
                        )}
                        {r.height != null && (
                          <div className="rounded-lg bg-gray-50 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <span className="text-gray-400 mr-1">{r.record_type === "growth_measurement" ? "身长:" : "身高:"}</span>
                            <span className="font-semibold">{r.height} cm</span>
                          </div>
                        )}
                        {r.head_circumference != null && (
                          <div className="rounded-lg bg-gray-50 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <span className="text-gray-400 mr-1">头围:</span>
                            <span className="font-semibold">{r.head_circumference} cm</span>
                          </div>
                        )}
                        {r.exam_items?.bp ? (
                          <div className="rounded-lg bg-gray-50 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <span className="text-gray-400 mr-1">血压:</span>
                            <span className="font-semibold">{String(r.exam_items.bp)} mmHg</span>
                          </div>
                        ) : (r.exam_items?.systolic_bp != null && r.exam_items?.diastolic_bp != null) ? (
                          <div className="rounded-lg bg-gray-50 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <span className="text-gray-400 mr-1">血压:</span>
                            <span className="font-semibold">{String(r.exam_items.systolic_bp)}/{String(r.exam_items.diastolic_bp)} mmHg</span>
                          </div>
                        ) : null}
                        {r.exam_items?.temperature != null && (
                          <div className="rounded-lg bg-gray-50 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            <span className="text-gray-400 mr-1">体温:</span>
                            <span className="font-semibold">{String(r.exam_items.temperature)} ℃</span>
                          </div>
                        )}
                        {r.vaccine_name && (
                          <div className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-semibold">
                            {r.vaccine_name} {r.vaccine_dose ? `(第${r.vaccine_dose}剂)` : ""}
                          </div>
                        )}
                      </div>

                      {/* 备注信息 */}
                      {r.note && (
                        <div className="mt-2.5 rounded-lg bg-gray-50/70 p-2 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300 flex items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap"><span className="text-gray-400 font-medium">备注：</span>{r.note}</p>
                          <CopyButton text={r.note} label="复制" />
                        </div>
                      )}

                      {/* AI 解读摘要 */}
                      {r.ai_analysis && (
                        <div className="mt-2 rounded-lg border border-amber-200/60 bg-amber-50/60 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                              <Sparkles className="h-3.5 w-3.5" /> AI 健康解读：
                            </span>
                            <CopyButton text={r.ai_analysis} label="复制" />
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{r.ai_analysis}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 视图 2：统计图表看板 (Charts) */}
      {viewMode === "charts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 堆叠柱状图：月度打卡频次 */}
            <div className="card space-y-2 p-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  近 6 个月健康打卡活跃度与类型分布
                </h3>
                <span className="text-xs text-gray-400">堆叠柱状图</span>
              </div>
              <div ref={barChartRef} style={{ height: 280 }} className="w-full" />
            </div>

            {/* 环形饼图：记录类型构成 */}
            <div className="card space-y-2 p-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  健康档案记录类型构成
                </h3>
                <span className="text-xs text-gray-400">环形图</span>
              </div>
              <div ref={pieChartRef} style={{ height: 280 }} className="w-full" />
            </div>
          </div>

          <div className="card p-4 text-xs text-gray-400 flex items-center justify-between">
            <span>💡 统计图表按全量健康记录动态聚合更新，完成新打卡后图表自动联动重绘。</span>
            <button
              type="button"
              onClick={() => handleViewChange("timeline")}
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium"
            >
              查看时间轴明细 →
            </button>
          </div>
        </div>
      )}

      {/* 视图 3：经典日历总览 (Calendar) */}
      {viewMode === "calendar" && (
        <div>
          <HealthCalendar
            records={records}
            currentMonth={currentMonth}
            onMonthChange={onMonthChange}
            onDayClick={onDayClick}
          />
        </div>
      )}
    </div>
  );
}
