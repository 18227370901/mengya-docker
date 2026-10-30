import React, { useMemo, useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import {
  BarChart3,
  HeartPulse,
  Baby,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Plus,
  Edit3,
} from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { gestationLabel } from "@/utils/gestation";
import type { HealthRecord, BabyProfile } from "@/types";

function hexToRgba(hex: string, alpha: number) {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export type TimeRangeOption = "7" | "14" | "30" | "90" | "180" | "all";
export type GranularityOption = "day" | "week" | "month";
export type ChartTypeOption = "bar" | "line" | "area";

export interface PeriodSlot {
  key: string;
  label: string;
  fullLabel: string;
  startDate: string;
  endDate: string;
  records: HealthRecord[];
  momCount: number;
  babyCount: number;
  vaccineCount: number;
  totalCount: number;
}

export interface DrillDownPeriod {
  key: string;
  label: string;
  granularity: GranularityOption;
  startDate: string;
  endDate: string;
  records: HealthRecord[];
}

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; badgeCls: string; icon: typeof HeartPulse }
> = {
  prenatal_exam: {
    label: "孕期产检",
    color: "#ec4899",
    badgeCls: "bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800",
    icon: HeartPulse,
  },
  growth_measurement: {
    label: "生长测量",
    color: "#10b981",
    badgeCls: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    icon: Baby,
  },
  vaccination: {
    label: "疫苗接种",
    color: "#3b82f6",
    badgeCls: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    icon: ShieldCheck,
  },
  vaccine: {
    label: "疫苗接种",
    color: "#3b82f6",
    badgeCls: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    icon: ShieldCheck,
  },
};

export default function HealthChartsBoard({
  records,
  stats,
  onViewTimeline,
  babies,
  onDayClick,
  onRecordClick,
}: {
  records: HealthRecord[];
  stats: { total: number; momCount: number; babyCount: number; vaccineCount: number; latestDate: string | null };
  onViewTimeline: () => void;
  babies?: BabyProfile[];
  onDayClick?: (date: string, records: HealthRecord[], targetRecord?: HealthRecord) => void;
  onRecordClick?: (record: HealthRecord) => void;
}) {
  const isDark = useThemeStore((s) => s.theme === "dark");
  const barChartRef = useRef<HTMLDivElement | null>(null);
  const pieChartRef = useRef<HTMLDivElement | null>(null);
  const drillChartRef = useRef<HTMLDivElement | null>(null);

  // 1. 交互控制状态
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("30");
  const [granularity, setGranularity] = useState<GranularityOption>("day");
  const [chartType, setChartType] = useState<ChartTypeOption>("bar");
  const [drillDownPeriod, setDrillDownPeriod] = useState<DrillDownPeriod | null>(null);
  const [drillChartType, setDrillChartType] = useState<ChartTypeOption>("bar");

  // 外部图表形态（折线/面积/柱状）变化时，自动同步下钻子页面形态
  useEffect(() => {
    setDrillChartType(chartType);
  }, [chartType]);

  // 宝宝字典映射
  const babyNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (babies) {
      babies.forEach((b) => {
        map[b.id] = b.name;
      });
    }
    return map;
  }, [babies]);

  // 2. 依据所选时间跨度与聚合粒度，生成槽位序列与核心指标
  const { periodSlots, kpiSummary } = useMemo(() => {
    const now = new Date();
    let startLimit: Date;
    let endLimit: Date = now;

    if (timeRange === "all") {
      if (records.length > 0) {
        const sortedDates = records.map((r) => r.record_date).sort();
        startLimit = parseDate(sortedDates[0]);
        const maxD = parseDate(sortedDates[sortedDates.length - 1]);
        if (maxD > endLimit) endLimit = maxD;
      } else {
        startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      }
    } else {
      const days = parseInt(timeRange, 10);
      startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
    }

    const minDateStr = formatDateStr(startLimit);
    const maxDateStr = formatDateStr(endLimit);

    const scopedRecords = records.filter(
      (r) => r.record_date >= minDateStr && r.record_date <= maxDateStr
    );

    const slots: PeriodSlot[] = [];

    if (granularity === "day") {
      const cur = new Date(startLimit);
      while (cur <= endLimit) {
        const dStr = formatDateStr(cur);
        const mStr = `${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        const weekday = WEEKDAY_NAMES[cur.getDay()];
        const dayRecs = scopedRecords.filter((r) => r.record_date === dStr);
        let momCount = 0;
        let babyCount = 0;
        let vaccineCount = 0;
        dayRecs.forEach((r) => {
          if (r.record_type === "prenatal_exam") momCount++;
          else if (r.record_type === "growth_measurement") babyCount++;
          else if (r.record_type === "vaccination" || r.record_type === "vaccine") vaccineCount++;
        });
        slots.push({
          key: dStr,
          label: mStr,
          fullLabel: `${dStr} (${weekday})`,
          startDate: dStr,
          endDate: dStr,
          records: dayRecs,
          momCount,
          babyCount,
          vaccineCount,
          totalCount: dayRecs.length,
        });
        cur.setDate(cur.getDate() + 1);
      }
    } else if (granularity === "month") {
      const cur = new Date(startLimit.getFullYear(), startLimit.getMonth(), 1);
      const endMonth = new Date(endLimit.getFullYear(), endLimit.getMonth(), 1);
      while (cur <= endMonth) {
        const y = cur.getFullYear();
        const m = cur.getMonth() + 1;
        const mPrefix = `${y}-${String(m).padStart(2, "0")}`;
        const lastDay = new Date(y, m, 0).getDate();
        const sDate = `${mPrefix}-01`;
        const eDate = `${mPrefix}-${String(lastDay).padStart(2, "0")}`;
        const monthRecs = scopedRecords.filter((r) => r.record_date.startsWith(mPrefix));
        let momCount = 0;
        let babyCount = 0;
        let vaccineCount = 0;
        monthRecs.forEach((r) => {
          if (r.record_type === "prenatal_exam") momCount++;
          else if (r.record_type === "growth_measurement") babyCount++;
          else if (r.record_type === "vaccination" || r.record_type === "vaccine") vaccineCount++;
        });
        slots.push({
          key: mPrefix,
          label: mPrefix,
          fullLabel: `${y}年${m}月 (全月)`,
          startDate: sDate,
          endDate: eDate,
          records: monthRecs,
          momCount,
          babyCount,
          vaccineCount,
          totalCount: monthRecs.length,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      // granularity === "week"
      const cur = new Date(startLimit);
      const day = cur.getDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      cur.setDate(cur.getDate() + diffToMon);

      while (cur <= endLimit) {
        const monStr = formatDateStr(cur);
        const sun = new Date(cur);
        sun.setDate(sun.getDate() + 6);
        const sunStr = formatDateStr(sun);

        const m1 = String(cur.getMonth() + 1).padStart(2, "0");
        const d1 = String(cur.getDate()).padStart(2, "0");
        const m2 = String(sun.getMonth() + 1).padStart(2, "0");
        const d2 = String(sun.getDate()).padStart(2, "0");
        const wLabel = `${m1}.${d1}~${m2}.${d2}`;

        const weekRecs = scopedRecords.filter(
          (r) => r.record_date >= monStr && r.record_date <= sunStr
        );
        let momCount = 0;
        let babyCount = 0;
        let vaccineCount = 0;
        weekRecs.forEach((r) => {
          if (r.record_type === "prenatal_exam") momCount++;
          else if (r.record_type === "growth_measurement") babyCount++;
          else if (r.record_type === "vaccination" || r.record_type === "vaccine") vaccineCount++;
        });
        slots.push({
          key: `${monStr}_${sunStr}`,
          label: wLabel,
          fullLabel: `${monStr} 至 ${sunStr} (周度)`,
          startDate: monStr,
          endDate: sunStr,
          records: weekRecs,
          momCount,
          babyCount,
          vaccineCount,
          totalCount: weekRecs.length,
        });
        cur.setDate(cur.getDate() + 7);
      }
    }

    const activeDaysSet = new Set(scopedRecords.map((r) => r.record_date));
    const diffDays = Math.max(1, Math.round((endLimit.getTime() - startLimit.getTime()) / 86400000) + 1);
    let totalMom = 0;
    let totalBaby = 0;
    let totalVac = 0;
    scopedRecords.forEach((r) => {
      if (r.record_type === "prenatal_exam") totalMom++;
      else if (r.record_type === "growth_measurement") totalBaby++;
      else if (r.record_type === "vaccination" || r.record_type === "vaccine") totalVac++;
    });

    return {
      periodSlots: slots,
      kpiSummary: {
        total: scopedRecords.length,
        momCount: totalMom,
        babyCount: totalBaby,
        vaccineCount: totalVac,
        activeDays: activeDaysSet.size,
        totalDays: diffDays,
        coverageRate: Math.min(100, Math.round((activeDaysSet.size / diffDays) * 100)),
      },
    };
  }, [records, timeRange, granularity]);

  // 3. 构建 ECharts 系列配置辅助函数
  const buildSeries = (
    name: string,
    color: string,
    data: number[],
    mode: ChartTypeOption,
    stackName?: string
  ) => {
    if (mode === "bar") {
      return {
        name,
        type: "bar",
        stack: stackName || "total",
        barMaxWidth: 26,
        itemStyle: { color, borderRadius: [3, 3, 0, 0] },
        data,
      };
    }
    if (mode === "area") {
      return {
        name,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        itemStyle: { color },
        lineStyle: { width: 2, color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexToRgba(color, 0.45) },
            { offset: 1, color: hexToRgba(color, 0.05) },
          ]),
        },
        data,
      };
    }
    return {
      name,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 6,
      itemStyle: { color },
      lineStyle: { width: 2.5, color },
      data,
    };
  };

  // 4. 总览趋势图与类型构成饼图 ECharts 绘制（保留实例与安全恢复）
  useEffect(() => {
    const barEl = barChartRef.current;
    const pieEl = pieChartRef.current;
    if (!barEl || !pieEl) return;

    let barChart = echarts.getInstanceByDom(barEl);
    if (!barChart) {
      barChart = echarts.init(barEl);
    }
    let pieChart = echarts.getInstanceByDom(pieEl);
    if (!pieChart) {
      pieChart = echarts.init(pieEl);
    }

    if (drillDownPeriod) {
      return;
    }

    const axisLabelColor = isDark ? "#94a3b8" : "#64748b";
    const axisLineColor = isDark ? "#334155" : "#e2e8f0";
    const splitLineColor = isDark ? "#1e293b" : "#f1f5f9";

    const labels = periodSlots.map((s) => s.label);
    const momData = periodSlots.map((s) => s.momCount);
    const vacData = periodSlots.map((s) => s.vaccineCount);

    const hasMultiBabies = Boolean(babies && babies.length > 1);
    const babySeriesMap: Record<number, number[]> = {};
    const babyColors = ["#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ec4899"];

    if (hasMultiBabies && babies) {
      babies.forEach((b) => {
        babySeriesMap[b.id] = periodSlots.map(
          (s) => s.records.filter((r) => r.record_type === "growth_measurement" && r.baby === b.id).length
        );
      });
    }
    const genericBabyData = periodSlots.map(
      (s) =>
        s.records.filter(
          (r) =>
            r.record_type === "growth_measurement" &&
            (!hasMultiBabies || !r.baby || !babyNameMap[r.baby])
        ).length
    );

    const barSeries: any[] = [];
    const legendData: string[] = [];

    legendData.push("孕期产检");
    barSeries.push(buildSeries("孕期产检", "#ec4899", momData, chartType, "overview"));

    if (hasMultiBabies && babies) {
      babies.forEach((b, idx) => {
        const sName = `${b.name}生长`;
        legendData.push(sName);
        barSeries.push(
          buildSeries(sName, babyColors[idx % babyColors.length], babySeriesMap[b.id], chartType, "overview")
        );
      });
      if (genericBabyData.some((v) => v > 0)) {
        legendData.push("宝宝通用测量");
        barSeries.push(buildSeries("宝宝通用测量", "#10b981", genericBabyData, chartType, "overview"));
      }
    } else {
      const defaultBabyName = babies && babies.length === 1 ? `${babies[0].name}生长` : "宝宝生长测量";
      legendData.push(defaultBabyName);
      const combined = genericBabyData.map((v, i) =>
        v + (babies && babies[0] && babySeriesMap[babies[0].id] ? babySeriesMap[babies[0].id][i] : 0)
      );
      barSeries.push(buildSeries(defaultBabyName, "#10b981", combined, chartType, "overview"));
    }

    legendData.push("疫苗接种");
    barSeries.push(buildSeries("疫苗接种", "#3b82f6", vacData, chartType, "overview"));

    barChart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: chartType === "bar" ? "shadow" : "line" },
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: axisLineColor,
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
        formatter: (params: any) => {
          if (!params || !params.length) return "";
          const idx = params[0].dataIndex;
          const slot = periodSlots[idx];
          if (!slot) return "";
          let html = `<div style="font-weight:bold;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid ${axisLineColor};">${slot.fullLabel}</div>`;
          let total = 0;
          params.forEach((p: any) => {
            if (p.value > 0) {
              total += p.value;
              html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:3px;font-size:12px;">
                <span>${p.marker} ${p.seriesName}</span>
                <span style="font-weight:700;">${p.value} 次</span>
              </div>`;
            }
          });
          if (total === 0) {
            html += `<div style="color:#94a3b8;font-size:11px;margin-top:2px;">本周期暂无打卡</div>`;
          } else {
            html += `<div style="margin-top:6px;padding-top:4px;border-top:1px dashed ${axisLineColor};display:flex;justify-content:space-between;font-size:11px;color:${
              isDark ? "#cbd5e1" : "#475569"
            };">
              <span>合计</span>
              <span style="font-weight:700;color:#f97316;">${total} 次</span>
            </div>`;
          }
          html += `<div style="margin-top:5px;font-size:10px;color:#f97316;border-top:1px dotted ${axisLineColor};padding-top:3px;">👉 点击柱子/节点可下钻深度查看本周期详情</div>`;
          return html;
        },
      },
      legend: {
        top: 4,
        right: 16,
        textStyle: { color: axisLabelColor, fontSize: 11 },
        data: legendData,
      },
      grid: { top: 38, right: 25, bottom: periodSlots.length > 14 ? 58 : 32, left: 40 },
      dataZoom: [
        {
          type: "inside",
          start: periodSlots.length > (granularity === "day" ? 14 : 12)
            ? Math.max(0, Math.floor(((periodSlots.length - (granularity === "day" ? 14 : 12)) / periodSlots.length) * 100))
            : 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        ...(periodSlots.length > 14
          ? [
              {
                type: "slider",
                height: 16,
                bottom: 8,
                start: periodSlots.length > (granularity === "day" ? 14 : 12)
                  ? Math.max(0, Math.floor(((periodSlots.length - (granularity === "day" ? 14 : 12)) / periodSlots.length) * 100))
                  : 0,
                end: 100,
                borderColor: "transparent",
                backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                fillerColor: "rgba(249, 115, 22, 0.25)",
                handleSize: "100%",
                handleStyle: { color: "#f97316" },
                textStyle: { color: axisLabelColor, fontSize: 10 },
              },
            ]
          : []),
      ],
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          color: axisLabelColor,
          fontSize: 10,
          interval: "auto",
          hideOverlap: true,
          rotate: periodSlots.length > 16 && granularity === "day" ? 30 : 0,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: axisLabelColor },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: barSeries,
    }, true);

    barChart.on("click", (params: any) => {
      const idx = params.dataIndex;
      if (idx != null && periodSlots[idx]) {
        const slot = periodSlots[idx];
        setDrillChartType(chartType);
        setDrillDownPeriod({
          key: slot.key,
          label: slot.fullLabel,
          granularity,
          startDate: slot.startDate,
          endDate: slot.endDate,
          records: slot.records,
        });
      }
    });

    barChart.getZr().on("mousemove", (params: any) => {
      const pointInPixel = [params.offsetX, params.offsetY];
      if (barChart.containPixel("grid", pointInPixel)) {
        barChart.getZr().setCursorStyle("pointer");
      } else {
        barChart.getZr().setCursorStyle("default");
      }
    });

    const pieData: any[] = [];
    if (stats.momCount > 0) {
      pieData.push({ value: stats.momCount, name: "孕期产检", itemStyle: { color: "#ec4899" } });
    }
    if (hasMultiBabies && babies) {
      babies.forEach((b, idx) => {
        const count = records.filter(
          (r) =>
            r.record_type === "growth_measurement" &&
            (Number(r.baby) === Number(b.id) || r.baby_name === b.name)
        ).length;
        if (count > 0) {
          pieData.push({
            value: count,
            name: `${b.name}生长`,
            itemStyle: { color: babyColors[idx % babyColors.length] },
          });
        }
      });
      const unassigned = records.filter(
        (r) =>
          r.record_type === "growth_measurement" &&
          (!r.baby || (!babyNameMap[r.baby] && !babies.some((b) => b.name === r.baby_name)))
      ).length;
      if (unassigned > 0) {
        pieData.push({ value: unassigned, name: "宝宝通用测量", itemStyle: { color: "#10b981" } });
      }
    } else if (stats.babyCount > 0) {
      const bLabel = babies && babies.length === 1 ? `${babies[0].name}生长` : "宝宝生长测量";
      pieData.push({ value: stats.babyCount, name: bLabel, itemStyle: { color: "#10b981" } });
    }
    if (stats.vaccineCount > 0) {
      pieData.push({ value: stats.vaccineCount, name: "疫苗接种", itemStyle: { color: "#3b82f6" } });
    }

    pieChart.setOption({
      tooltip: {
        trigger: "item",
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: axisLineColor,
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
        formatter: (params: any) => {
          if (!params || !params.data) return "";
          return `<div style="font-size:12px;padding:2px;">
            <div style="font-weight:bold;margin-bottom:4px;color:${isDark ? "#f1f5f9" : "#1e293b"};">${params.marker} ${params.name}</div>
            <div style="display:flex;justify-content:space-between;gap:12px;color:${isDark ? "#cbd5e1" : "#475569"};">
              <span>记录条数:</span>
              <span style="font-weight:700;color:#f97316;">${params.value} 条</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px;color:${isDark ? "#cbd5e1" : "#475569"};">
              <span>构成占比:</span>
              <span style="font-weight:700;">${params.percent}%</span>
            </div>
          </div>`;
        },
      },
      legend: {
        type: "scroll",
        bottom: 4,
        left: "center",
        itemGap: 12,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: axisLabelColor, fontSize: 11 },
        pageTextStyle: { color: axisLabelColor },
      },
      graphic: [
        {
          type: "text",
          left: "center",
          top: "40%",
          style: {
            text: `共 ${stats.total} 条`,
            fontSize: 14,
            fontWeight: "bold",
            fill: isDark ? "#f1f5f9" : "#1e293b",
          },
        },
        {
          type: "text",
          left: "center",
          top: "48%",
          style: {
            text: "健康档案",
            fontSize: 11,
            fill: axisLabelColor,
          },
        },
      ],
      series: [
        {
          name: "记录构成",
          type: "pie",
          radius: ["36%", "56%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? "#1f2937" : "#fff",
            borderWidth: 2,
          },
          label: {
            show: true,
            position: "outside",
            formatter: (params: any) => {
              if (params.name === "暂无记录") return params.name;
              return `{name|${params.name}}\n{stat|${params.percent}% (${params.value}条)}`;
            },
            rich: {
              name: {
                fontSize: 11,
                fontWeight: 600,
                color: isDark ? "#e2e8f0" : "#334155",
                lineHeight: 16,
              },
              stat: {
                fontSize: 10,
                color: isDark ? "#94a3b8" : "#64748b",
                lineHeight: 14,
              },
            },
            distanceToLabelLine: 4,
          },
          labelLine: {
            show: true,
            length: 12,
            length2: 14,
            smooth: true,
            lineStyle: {
              color: isDark ? "#475569" : "#cbd5e1",
              width: 1,
            },
          },
          labelLayout: {
            hideOverlap: true,
            moveOverlap: "shiftY",
          },
          emphasis: {
            scale: true,
            scaleSize: 5,
            label: {
              show: true,
              fontSize: 11,
              fontWeight: "bold",
            },
          },
          data: pieData.length > 0 ? pieData : [{ value: 1, name: "暂无记录", itemStyle: { color: "#cbd5e1" } }],
        },
      ],
    }, true);

    const observer = new ResizeObserver(() => {
      barChart?.resize();
      pieChart?.resize();
    });
    observer.observe(barEl);
    observer.observe(pieEl);

    // 下钻返回后立即触发一次安全重排，确保饼图与趋势图尺寸完美适配
    const rafId = requestAnimationFrame(() => {
      barChart?.resize();
      pieChart?.resize();
    });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [records, isDark, stats, periodSlots, chartType, drillDownPeriod, babies, babyNameMap]);

  // 5. 下钻模式：周期内按天时序趋势子图表绘制
  useEffect(() => {
    if (!drillDownPeriod || !drillChartRef.current) return;
    const drillEl = drillChartRef.current;
    const chart = echarts.init(drillEl);

    const axisLabelColor = isDark ? "#94a3b8" : "#64748b";
    const axisLineColor = isDark ? "#334155" : "#e2e8f0";
    const splitLineColor = isDark ? "#1e293b" : "#f1f5f9";

    const dStart = parseDate(drillDownPeriod.startDate);
    const dEnd = parseDate(drillDownPeriod.endDate);
    const daysList: string[] = [];
    const dayLabels: string[] = [];

    const cur = new Date(dStart);
    while (cur <= dEnd) {
      const dStr = formatDateStr(cur);
      daysList.push(dStr);
      dayLabels.push(`${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
      cur.setDate(cur.getDate() + 1);
    }

    const hasMultiBabies = Boolean(babies && babies.length > 1);
    const babyColors = ["#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ec4899"];

    const momData = daysList.map(() => 0);
    const vacData = daysList.map(() => 0);
    const babyDataMap: Record<number, number[]> = {};
    if (hasMultiBabies && babies) {
      babies.forEach((b) => {
        babyDataMap[b.id] = daysList.map(() => 0);
      });
    }
    const genericBabyData = daysList.map(() => 0);

    drillDownPeriod.records.forEach((r) => {
      const idx = daysList.indexOf(r.record_date);
      if (idx !== -1) {
        if (r.record_type === "prenatal_exam") {
          momData[idx]++;
        } else if (r.record_type === "growth_measurement") {
          if (hasMultiBabies && r.baby && babyDataMap[r.baby]) {
            babyDataMap[r.baby][idx]++;
          } else {
            genericBabyData[idx]++;
          }
        } else if (r.record_type === "vaccination" || r.record_type === "vaccine") {
          vacData[idx]++;
        }
      }
    });

    const series: any[] = [];
    const legendData: string[] = [];

    legendData.push("孕期产检");
    series.push(buildSeries("孕期产检", "#ec4899", momData, drillChartType, "drill_daily"));

    if (hasMultiBabies && babies) {
      babies.forEach((b, idx) => {
        const sName = `${b.name}生长`;
        legendData.push(sName);
        series.push(buildSeries(sName, babyColors[idx % babyColors.length], babyDataMap[b.id], drillChartType, "drill_daily"));
      });
      if (genericBabyData.some((v) => v > 0)) {
        legendData.push("宝宝通用测量");
        series.push(buildSeries("宝宝通用测量", "#10b981", genericBabyData, drillChartType, "drill_daily"));
      }
    } else {
      const bName = babies && babies.length === 1 ? `${babies[0].name}生长` : "宝宝生长测量";
      legendData.push(bName);
      const combined = genericBabyData.map(
        (v, i) => v + (babies && babies[0] && babyDataMap[babies[0].id] ? babyDataMap[babies[0].id][i] : 0)
      );
      series.push(buildSeries(bName, "#10b981", combined, drillChartType, "drill_daily"));
    }

    legendData.push("疫苗接种");
    series.push(buildSeries("疫苗接种", "#3b82f6", vacData, drillChartType, "drill_daily"));

    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: drillChartType === "bar" ? "shadow" : "line" },
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: axisLineColor,
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
        formatter: (params: any) => {
          if (!params || !params.length) return "";
          const idx = params[0].dataIndex;
          const fullDate = daysList[idx];
          const weekday = WEEKDAY_NAMES[new Date(fullDate).getDay()];
          let html = `<div style="font-weight:bold;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid ${axisLineColor};">${fullDate} (${weekday})</div>`;
          let dayTotal = 0;
          params.forEach((p: any) => {
            if (p.value > 0) {
              dayTotal += p.value;
              html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:3px;font-size:12px;">
                <span>${p.marker} ${p.seriesName}</span>
                <span style="font-weight:700;">${p.value} 次</span>
              </div>`;
            }
          });
          if (dayTotal === 0) {
            html += `<div style="color:#94a3b8;font-size:11px;margin-top:2px;">当日暂无打卡</div>`;
          } else {
            html += `<div style="margin-top:6px;padding-top:4px;border-top:1px dashed ${axisLineColor};display:flex;justify-content:space-between;font-size:11px;color:${
              isDark ? "#cbd5e1" : "#475569"
            };">
              <span>当日合计</span>
              <span style="font-weight:700;color:#f97316;">${dayTotal} 次</span>
            </div>`;
          }
          return html;
        },
      },
      legend: {
        top: 4,
        right: 16,
        textStyle: { color: axisLabelColor, fontSize: 11 },
        data: legendData,
      },
      grid: { top: 38, right: 25, bottom: daysList.length > 14 ? 58 : 32, left: 40 },
      dataZoom: [
        {
          type: "inside",
          start: daysList.length > 14 ? Math.max(0, Math.floor(((daysList.length - 14) / daysList.length) * 100)) : 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        ...(daysList.length > 14
          ? [
              {
                type: "slider",
                height: 16,
                bottom: 8,
                start: Math.max(0, Math.floor(((daysList.length - 14) / daysList.length) * 100)),
                end: 100,
                borderColor: "transparent",
                backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                fillerColor: "rgba(249, 115, 22, 0.25)",
                handleSize: "100%",
                handleStyle: { color: "#f97316" },
                textStyle: { color: axisLabelColor, fontSize: 10 },
              },
            ]
          : []),
      ],
      xAxis: {
        type: "category",
        data: dayLabels,
        axisLabel: {
          color: axisLabelColor,
          fontSize: 10,
          interval: "auto",
          hideOverlap: true,
          rotate: daysList.length > 16 ? 30 : 0,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: axisLabelColor },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series,
    }, true);

    chart.on("click", (params: any) => {
      const idx = params.dataIndex;
      if (idx != null && daysList[idx]) {
        const clickedDate = daysList[idx];
        const dayRecs = drillDownPeriod.records.filter((r) => r.record_date === clickedDate);
        if (dayRecs.length === 0) return;

        let matchedRec: HealthRecord | undefined;
        const seriesName = (params.seriesName as string) || "";

        if (seriesName === "孕期产检") {
          matchedRec = dayRecs.find((r) => r.record_type === "prenatal_exam" || r.record_type === "checkup");
        } else if (seriesName === "疫苗接种") {
          matchedRec = dayRecs.find((r) => r.record_type === "vaccination" || r.record_type === "vaccine");
        } else if (seriesName.endsWith("生长")) {
          const bName = seriesName.replace(/生长$/, "");
          const babyObj = babies?.find((b) => b.name === bName);
          matchedRec = dayRecs.find(
            (r) =>
              r.record_type === "growth_measurement" &&
              ((babyObj && Number(r.baby) === Number(babyObj.id)) || r.baby_name === bName)
          );
        } else if (seriesName === "宝宝通用测量") {
          matchedRec = dayRecs.find((r) => r.record_type === "growth_measurement");
        }

        if (!matchedRec) {
          matchedRec = dayRecs[0];
        }

        if (matchedRec && onRecordClick) {
          onRecordClick(matchedRec);
        } else if (onDayClick) {
          onDayClick(clickedDate, dayRecs, matchedRec);
        }
      }
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(drillEl);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [drillDownPeriod, drillChartType, isDark, babies]);

  // 下钻周期内按时间倒序排列的打卡记录
  const sortedDrillRecords = useMemo(() => {
    if (!drillDownPeriod) return [];
    return [...drillDownPeriod.records].sort((a, b) => {
      if (a.record_date === b.record_date) return b.id - a.id;
      return a.record_date < b.record_date ? 1 : -1;
    });
  }, [drillDownPeriod]);

  // 下钻周期 KPI 统计
  const drillKpis = useMemo(() => {
    if (!drillDownPeriod) return null;
    let momCount = 0;
    let babyCount = 0;
    let vaccineCount = 0;
    const activeDaysSet = new Set<string>();
    drillDownPeriod.records.forEach((r) => {
      activeDaysSet.add(r.record_date);
      if (r.record_type === "prenatal_exam") momCount++;
      else if (r.record_type === "growth_measurement") babyCount++;
      else if (r.record_type === "vaccination" || r.record_type === "vaccine") vaccineCount++;
    });
    const dStart = parseDate(drillDownPeriod.startDate);
    const dEnd = parseDate(drillDownPeriod.endDate);
    const totalDays = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / 86400000) + 1);

    return {
      total: drillDownPeriod.records.length,
      momCount,
      babyCount,
      vaccineCount,
      activeDays: activeDaysSet.size,
      totalDays,
      coverageRate: Math.min(100, Math.round((activeDaysSet.size / totalDays) * 100)),
    };
  }, [drillDownPeriod]);

  return (
    <div className="space-y-4">
      {/* ================= 视图 A：周期下钻深度详情 ================= */}
      {drillDownPeriod && (
        <div className="space-y-4">
          {/* 面包屑与顶部操作栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50/70 via-white to-pink-50/50 p-4 dark:border-orange-950 dark:from-gray-800 dark:via-gray-800/80 dark:to-gray-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setDrillDownPeriod(null)}
                  className="text-gray-500 hover:text-brand-600 dark:text-gray-400 font-medium cursor-pointer"
                >
                  统计图表总览
                </button>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-bold text-orange-600 dark:text-orange-400">
                  {drillDownPeriod.label} 下钻详情
                </span>
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>{drillDownPeriod.label} 健康打卡深度透视</span>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                  共 {drillDownPeriod.records.length} 条打卡记录
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                周期范围：{drillDownPeriod.startDate} 至 {drillDownPeriod.endDate}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* 子图表形态切换 */}
              <div className="flex items-center gap-1 rounded-xl bg-white/80 p-0.5 shadow-xs dark:bg-gray-700">
                <span className="text-[11px] text-gray-400 px-1.5">子图形态:</span>
                {(
                  [
                    { key: "bar", label: "柱状图" },
                    { key: "line", label: "折线图" },
                    { key: "area", label: "面积图" },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setDrillChartType(c.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      drillChartType === c.key
                        ? "bg-orange-500 text-white shadow-xs"
                        : "text-gray-600 hover:text-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setDrillDownPeriod(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-brand-400 cursor-pointer transition"
              >
                <ArrowLeft className="h-4 w-4" />
                返回总览看板
              </button>
            </div>
          </div>

          {/* 本周期 KPI 指标卡 */}
          {drillKpis && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">本周期打卡总计</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-black text-brand-600 dark:text-brand-400">{drillKpis.total}</span>
                  <span className="text-xs text-gray-500">次</span>
                </div>
                <span className="text-[10px] text-gray-400">
                  日均 {(drillKpis.total / drillKpis.totalDays).toFixed(1)} 次
                </span>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">活跃打卡天数</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{drillKpis.activeDays}</span>
                  <span className="text-xs text-gray-500">/ {drillKpis.totalDays} 天</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  覆盖率 {drillKpis.coverageRate}%
                </span>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">宝宝生长测量</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-black text-blue-600 dark:text-blue-400">{drillKpis.babyCount}</span>
                  <span className="text-xs text-gray-500">次</span>
                </div>
                <span className="text-[10px] text-gray-400">身长/体重/头围测量</span>
              </div>
              <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">孕期产检 / 疫苗</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-black text-pink-600 dark:text-pink-400">
                    {drillKpis.momCount + drillKpis.vaccineCount}
                  </span>
                  <span className="text-xs text-gray-500">次</span>
                </div>
                <span className="text-[10px] text-gray-400">
                  产检 {drillKpis.momCount} 次 · 疫苗 {drillKpis.vaccineCount} 剂
                </span>
              </div>
            </div>
          )}

          {/* 周期内日分解趋势图 (Sub-Chart) */}
          <div className="card space-y-2 p-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  {drillDownPeriod.label} 每日时序分布分解
                </h4>
                <p className="text-[11px] text-gray-400">
                  以天为单位透视本周期内每日打卡趋势，支持缩放与悬浮查看
                </p>
              </div>
            </div>
            <div ref={drillChartRef} style={{ height: 320 }} className="w-full" />
          </div>

          {/* 本周期打卡明细列表 */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
              <div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <span>本周期打卡明细列表</span>
                  <span className="text-xs text-gray-400">({drillDownPeriod.records.length} 条)</span>
                </h4>
                <p className="text-[11px] text-gray-400">
                  点击卡片右侧「查看 / 打卡修改」可直接回填并调整历史记录
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onDayClick) {
                    onDayClick(drillDownPeriod.endDate, drillDownPeriod.records);
                  }
                }}
                className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                在此周期补录新打卡
              </button>
            </div>

            {drillDownPeriod.records.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                本周期内暂无任何健康打卡记录，可点击上方「在此周期补录新打卡」进行添加
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedDrillRecords.map((rec) => {
                  const dObj = parseDate(rec.record_date);
                  const weekday = WEEKDAY_NAMES[dObj.getDay()];
                  const cfg = TYPE_CONFIG[rec.record_type] || TYPE_CONFIG.growth_measurement;
                  const targetName =
                    rec.baby && babyNameMap[rec.baby]
                      ? `${babyNameMap[rec.baby]}`
                      : rec.record_type === "growth_measurement" ||
                        rec.record_type === "vaccination" ||
                        rec.record_type === "vaccine"
                      ? "宝宝通用"
                      : "妈妈档案";

                  return (
                    <div
                      key={rec.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3 hover:bg-orange-50/30 hover:border-orange-200 transition dark:border-gray-800 dark:bg-gray-800/40 dark:hover:bg-gray-800"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                            {rec.record_date} ({weekday})
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border ${cfg.badgeCls}`}>
                            <cfg.icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                          <span className="rounded-md bg-gray-200/60 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {targetName}
                          </span>
                        </div>

                        {/* 数据明细 */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                          {rec.record_type === "growth_measurement" && (
                            <>
                              {rec.height != null && <span>身长: <b className="text-emerald-600 dark:text-emerald-400">{rec.height} cm</b></span>}
                              {rec.weight != null && <span>体重: <b className="text-emerald-600 dark:text-emerald-400">{rec.weight} kg</b></span>}
                              {rec.head_circumference != null && <span>头围: {rec.head_circumference} cm</span>}
                              {rec.waist_circumference != null && <span>腹围: {rec.waist_circumference} cm</span>}
                            </>
                          )}
                          {rec.record_type === "prenatal_exam" && (
                            <>
                              {rec.gestational_week != null && (
                                <span>孕周: <b className="text-pink-600 dark:text-pink-400">{gestationLabel(rec.gestational_week, rec.gestational_day)}</b></span>
                              )}
                              {rec.weight != null && <span>体重: <b className="text-pink-600 dark:text-pink-400">{rec.weight} kg</b></span>}
                              {rec.systolic_bp != null && rec.diastolic_bp != null && (
                                <span>血压: {rec.systolic_bp}/{rec.diastolic_bp} mmHg</span>
                              )}
                            </>
                          )}
                          {(rec.record_type === "vaccination" || rec.record_type === "vaccine") && (
                            <>
                              <span>疫苗: <b className="text-blue-600 dark:text-blue-400">{rec.vaccine_name || "接种记录"}</b></span>
                              {rec.vaccine_dose != null && <span>第 {rec.vaccine_dose} 剂</span>}
                            </>
                          )}
                        </div>

                        {rec.notes && (
                          <p className="text-[11px] text-gray-400 italic">备注: {rec.notes}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (onRecordClick) {
                            onRecordClick(rec);
                          } else if (onDayClick) {
                            onDayClick(rec.record_date, [rec], rec);
                          }
                        }}
                        className="btn-secondary py-1 px-3 text-xs inline-flex items-center gap-1 cursor-pointer hover:border-orange-400 hover:text-orange-600 transition"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        查看 / 打卡修改
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部返回操作 */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => setDrillDownPeriod(null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 cursor-pointer transition"
            >
              <ArrowLeft className="h-4 w-4" />
              返回统计总览看板
            </button>
          </div>
        </div>
      )}

      {/* ================= 视图 B：统计总览看板（保持 DOM 常驻，下钻时 hidden，杜绝下钻返回后图表失效） ================= */}
      <div className={drillDownPeriod ? "hidden" : "space-y-4"}>
          {/* 顶部控制栏：时间范围、展示粒度、图表形态 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                健康打卡时序与统计看板
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                支持范围筛选、天/周/月跨度聚合、图表形态切换及点击周期下钻深度分析
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* 时间跨度 */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-0.5 dark:bg-gray-800">
                <span className="text-[11px] text-gray-400 px-1.5">范围:</span>
                {(["7", "14", "30", "90", "180", "all"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setTimeRange(r);
                      if (r === "7" || r === "14") setGranularity("day");
                      else if (r === "180" || r === "all") setGranularity("month");
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      timeRange === r
                        ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {r === "all" ? "全部" : r === "180" ? "半年" : `近${r}天`}
                  </button>
                ))}
              </div>

              {/* 粒度选择 */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-0.5 dark:bg-gray-800">
                <span className="text-[11px] text-gray-400 px-1.5">粒度:</span>
                {(
                  [
                    { key: "day", label: "按天" },
                    { key: "week", label: "按周" },
                    { key: "month", label: "按月" },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGranularity(g.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      granularity === g.key
                        ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* 图表形态切换 */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-0.5 dark:bg-gray-800">
                <span className="text-[11px] text-gray-400 px-1.5">形态:</span>
                {(
                  [
                    { key: "bar", label: "柱状图" },
                    { key: "line", label: "折线图" },
                    { key: "area", label: "面积图" },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setChartType(c.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      chartType === c.key
                        ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 宏观 KPI 指标卡 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {timeRange === "all" ? "全部打卡总计" : `近 ${timeRange} 天打卡`}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-brand-600 dark:text-brand-400">{kpiSummary.total}</span>
                <span className="text-xs text-gray-500">次</span>
              </div>
              <span className="text-[10px] text-gray-400">
                日均 {(kpiSummary.total / kpiSummary.totalDays).toFixed(1)} 次
              </span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">活跃打卡天数</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{kpiSummary.activeDays}</span>
                <span className="text-xs text-gray-500">/ {kpiSummary.totalDays} 天</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                打卡覆盖率 {kpiSummary.coverageRate}%
              </span>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">宝宝生长测量</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-blue-600 dark:text-blue-400">{kpiSummary.babyCount}</span>
                <span className="text-xs text-gray-500">次</span>
              </div>
              <span className="text-[10px] text-gray-400">身长/体重/头围记录</span>
            </div>
            <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">孕期产检 / 疫苗</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-pink-600 dark:text-pink-400">
                  {kpiSummary.momCount + kpiSummary.vaccineCount}
                </span>
                <span className="text-xs text-gray-500">次</span>
              </div>
              <span className="text-[10px] text-gray-400">
                产检 {kpiSummary.momCount} 次 · 疫苗 {kpiSummary.vaccineCount} 剂
              </span>
            </div>
          </div>

          {/* 双图联动看板：时序趋势图 + 类型构成环形饼图 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 时序趋势图 */}
            <div className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    时序打卡活跃度与类型分布
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    按「{granularity === "day" ? "天" : granularity === "week" ? "周" : "月"}」聚合，点击任意节点可下钻深度查看
                  </p>
                </div>
                <span className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  可点击下钻
                </span>
              </div>
              <div ref={barChartRef} style={{ height: 320 }} className="w-full" />
            </div>

            {/* 环形饼图：全期记录类型构成 */}
            <div className="card space-y-2 p-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    健康档案记录类型构成
                  </h3>
                  <p className="text-[11px] text-gray-400">全周期多宝宝与多记录类型占比透视</p>
                </div>
                <span className="text-xs text-gray-400">环形图</span>
              </div>
              <div ref={pieChartRef} style={{ height: 320 }} className="w-full" />
            </div>
          </div>

          {/* 快捷周期下钻栏（当有记录时展示最近几个月或周供一键下钻） */}
          {periodSlots.some((s) => s.records.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                快捷下钻周期：
              </span>
              {periodSlots
                .filter((slot) => slot.records.length > 0)
                .slice(-6)
                .reverse()
                .map((slot) => (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => {
                      setDrillChartType(chartType);
                      setDrillDownPeriod({
                        key: slot.key,
                        label: slot.fullLabel,
                        granularity,
                        startDate: slot.startDate,
                        endDate: slot.endDate,
                        records: slot.records,
                      });
                    }}
                    className="rounded-lg border border-orange-200 bg-orange-50/70 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 hover:border-orange-300 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300 cursor-pointer transition flex items-center gap-1"
                  >
                    <span>{slot.label}</span>
                    <span className="rounded-full bg-orange-200/60 px-1 text-[10px] text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                      {slot.records.length}条
                    </span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                ))}
            </div>
          )}

          <div className="card p-4 text-xs text-gray-400 flex flex-wrap items-center justify-between gap-2">
            <span>
              💡 优化提示：点击图表中任意数据柱、折线点或上方快捷周期胶囊，即可下钻展开该周期的日趋势与打卡明细；支持切换柱状图、折线图与面积图。
            </span>
            <button
              type="button"
              onClick={onViewTimeline}
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium cursor-pointer"
            >
              查看时间轴明细 →
            </button>
          </div>
        </div>
    </div>
  );
}
