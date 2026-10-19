import { useState, useMemo, useRef, useEffect } from "react";
import * as echarts from "echarts";
import { HeartPulse, Droplet, Activity } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import type { VitalsTimeSeriesRecord } from "@/types/health";

interface VitalsTimeSeriesBoardProps {
  timeseries: VitalsTimeSeriesRecord[];
}

type ChartMode = "bp" | "glucose" | "all";
type TimeRange = "7d" | "30d" | "all";

export default function VitalsTimeSeriesBoard({ timeseries }: VitalsTimeSeriesBoardProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const { isDark } = useThemeStore();

  const [chartMode, setChartMode] = useState<ChartMode>("bp");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const filteredData = useMemo(() => {
    if (!timeseries || timeseries.length === 0) return [];
    let list = [...timeseries].sort((a, b) => a.record_date.localeCompare(b.record_date));

    if (timeRange === "7d") {
      list = list.slice(-7);
    } else if (timeRange === "30d") {
      list = list.slice(-30);
    }

    return list.map((item) => {
      const stageStr = item.gestational_week
        ? item.gestational_days != null && item.gestational_days > 0
          ? `W${item.gestational_week}+${item.gestational_days}`
          : `W${item.gestational_week}`
        : item.postpartum_months
        ? `P${item.postpartum_months}M`
        : "";

      return {
        id: item.id,
        date: item.record_date.slice(5),
        fullDate: item.record_date,
        stageStr,
        systolic: item.systolic_bp != null ? Number(item.systolic_bp) : null,
        diastolic: item.diastolic_bp != null ? Number(item.diastolic_bp) : null,
        pulse: item.pulse != null ? Number(item.pulse) : null,
        bpStatus: item.bp_status_label || "",
        bloodSugar: item.blood_sugar != null ? Number(item.blood_sugar) : null,
        glucoseType: item.glucose_type_label || item.glucose_type || "",
        glucoseStatus: item.glucose_status_label || "",
      };
    });
  }, [timeseries, timeRange]);

  const hasBpData = useMemo(() => filteredData.some((d) => d.systolic != null), [filteredData]);
  const hasGlucoseData = useMemo(() => filteredData.some((d) => d.bloodSugar != null), [filteredData]);

  // ECharts 绘制与更新
  useEffect(() => {
    if (!chartRef.current) return;
    let chart = chartInstanceRef.current;
    if (!chart || chart.isDisposed()) {
      chart = echarts.init(chartRef.current);
      chartInstanceRef.current = chart;
    }

    if (filteredData.length === 0) {
      chart.clear();
      return;
    }

    const xLabels = filteredData.map((d) => (d.stageStr ? `${d.date}\n${d.stageStr}` : d.date));
    const textColor = isDark ? "#94a3b8" : "#64748b";
    const gridColor = isDark ? "#334155" : "#f1f5f9";

    const series: echarts.SeriesOption[] = [];

    if (chartMode === "bp" || chartMode === "all") {
      // 收缩压
      series.push({
        name: "收缩压 (高压)",
        type: "line",
        smooth: 0.3,
        data: filteredData.map((d) => d.systolic),
        itemStyle: { color: "#f43f5e" },
        lineStyle: { width: 3 },
        symbolSize: 7,
        markLine: chartMode === "bp" ? {
          silent: true,
          symbol: "none",
          data: [
            { yAxis: 140, lineStyle: { color: "#f43f5e", type: "dashed" }, label: { formatter: "高压警戒线 140", position: "insideEndTop", fontSize: 10 } },
            { yAxis: 90, lineStyle: { color: "#0284c7", type: "dashed" }, label: { formatter: "低压警戒线 90", position: "insideEndTop", fontSize: 10 } },
          ],
        } : undefined,
      });

      // 舒张压
      series.push({
        name: "舒张压 (低压)",
        type: "line",
        smooth: 0.3,
        data: filteredData.map((d) => d.diastolic),
        itemStyle: { color: "#0284c7" },
        lineStyle: { width: 3 },
        symbolSize: 7,
      });

      // 脉搏
      series.push({
        name: "脉搏 (次/分)",
        type: "line",
        smooth: 0.2,
        data: filteredData.map((d) => d.pulse),
        itemStyle: { color: "#8b5cf6" },
        lineStyle: { width: 1.5, type: "dotted" },
        symbolSize: 5,
      });
    }

    if (chartMode === "glucose" || chartMode === "all") {
      series.push({
        name: "血糖值 (mmol/L)",
        type: "line",
        smooth: 0.3,
        yAxisIndex: chartMode === "all" ? 1 : 0,
        data: filteredData.map((d) => d.bloodSugar),
        itemStyle: { color: "#f59e0b" },
        lineStyle: { width: 3 },
        symbolSize: 8,
        markLine: chartMode === "glucose" ? {
          silent: true,
          symbol: "none",
          data: [
            { yAxis: 5.1, lineStyle: { color: "#10b981", type: "dashed" }, label: { formatter: "孕期空腹标准 5.1", position: "insideEndTop", fontSize: 10 } },
            { yAxis: 6.7, lineStyle: { color: "#f59e0b", type: "dashed" }, label: { formatter: "餐后2h目标 6.7", position: "insideEndTop", fontSize: 10 } },
            { yAxis: 8.5, lineStyle: { color: "#ef4444", type: "dashed" }, label: { formatter: "GDM异常线 8.5", position: "insideEndTop", fontSize: 10 } },
          ],
        } : undefined,
      });
    }

    const yAxisOptions: any[] = [];
    if (chartMode === "glucose") {
      yAxisOptions.push({
        type: "value",
        name: "mmol/L",
        nameTextStyle: { color: textColor, fontSize: 10 },
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
        min: 2,
        max: 16,
      });
    } else if (chartMode === "bp") {
      yAxisOptions.push({
        type: "value",
        name: "mmHg",
        nameTextStyle: { color: textColor, fontSize: 10 },
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
        min: 40,
        max: 180,
      });
    } else {
      // 双轨模式
      yAxisOptions.push({
        type: "value",
        name: "血压 (mmHg)",
        nameTextStyle: { color: textColor, fontSize: 10 },
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
        min: 40,
        max: 180,
      });
      yAxisOptions.push({
        type: "value",
        name: "血糖 (mmol/L)",
        nameTextStyle: { color: textColor, fontSize: 10 },
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { show: false },
        min: 2,
        max: 16,
      });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.95)" : "rgba(255, 255, 255, 0.95)",
        borderColor: isDark ? "#475569" : "#e2e8f0",
        textStyle: { color: isDark ? "#f8fafc" : "#1e293b", fontSize: 11 },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const idx = params[0].dataIndex;
          const row = filteredData[idx];
          let tip = `<div style="font-weight: bold; margin-bottom: 4px;">${row.fullDate} ${row.stageStr ? '(' + row.stageStr + ')' : ''}</div>`;
          if (row.systolic != null) {
            tip += `<div style="color:#f43f5e;">血压: ${row.systolic}/${row.diastolic} mmHg (${row.bpStatus})</div>`;
          }
          if (row.pulse != null) {
            tip += `<div style="color:#8b5cf6;">脉搏: ${row.pulse} 次/分</div>`;
          }
          if (row.bloodSugar != null) {
            tip += `<div style="color:#f59e0b;">血糖: ${row.bloodSugar} mmol/L (${row.glucoseType} · ${row.glucoseStatus})</div>`;
          }
          return tip;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: textColor, fontSize: 11 },
      },
      grid: {
        top: 25,
        left: 45,
        right: chartMode === "all" ? 45 : 20,
        bottom: 35,
      },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLabel: { color: textColor, fontSize: 10, interval: 0 },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: yAxisOptions,
      series: series,
    };

    chart.setOption(option, true);

    const handleResize = () => {
      chart?.resize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [filteredData, chartMode, isDark]);

  if (!timeseries || timeseries.length === 0) {
    return (
      <div className="card border-dashed border-gray-200 bg-gray-50/50 p-8 text-center dark:border-gray-800 dark:bg-gray-800/40">
        <Activity className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <h4 className="mt-2 text-sm font-bold text-gray-700 dark:text-gray-300">
          暂无生命体征时序数据
        </h4>
        <p className="mt-1 text-xs text-gray-400">
          在上方表单或统一健康打卡中录入血压/血糖后，系统将自动绘制动态时序波动趋势图表。
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-4 border-rose-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-50 pb-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-950/40">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              生命体征波动走势看板
            </h3>
            <span className="text-[11px] text-gray-400">
              共记录 {filteredData.length} 次有效测量 · 支持血压低高压双曲线与多场景血糖走势
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 图表类型切换 */}
          <div className="flex rounded-xl bg-gray-100 p-0.5 text-xs dark:bg-gray-700/60">
            <button
              type="button"
              onClick={() => setChartMode("bp")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                chartMode === "bp"
                  ? "bg-white text-rose-600 shadow-xs dark:bg-gray-800 dark:text-rose-400"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
              }`}
            >
              <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
              血压走势
            </button>
            <button
              type="button"
              onClick={() => setChartMode("glucose")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                chartMode === "glucose"
                  ? "bg-white text-amber-600 shadow-xs dark:bg-gray-800 dark:text-amber-400"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
              }`}
            >
              <Droplet className="h-3.5 w-3.5 text-amber-500" />
              血糖走势
            </button>
            <button
              type="button"
              onClick={() => setChartMode("all")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                chartMode === "all"
                  ? "bg-white text-indigo-600 shadow-xs dark:bg-gray-800 dark:text-indigo-400"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
              }`}
            >
              双轨对比
            </button>
          </div>

          {/* 时间范围切换 */}
          <div className="flex rounded-xl bg-gray-100 p-0.5 text-xs dark:bg-gray-700/60">
            <button
              type="button"
              onClick={() => setTimeRange("7d")}
              className={`rounded-lg px-2 py-1 font-medium ${
                timeRange === "7d" ? "bg-white text-gray-800 shadow-xs dark:bg-gray-800 dark:text-gray-100" : "text-gray-400"
              }`}
            >
              近 7 次
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("30d")}
              className={`rounded-lg px-2 py-1 font-medium ${
                timeRange === "30d" ? "bg-white text-gray-800 shadow-xs dark:bg-gray-800 dark:text-gray-100" : "text-gray-400"
              }`}
            >
              近 30 次
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("all")}
              className={`rounded-lg px-2 py-1 font-medium ${
                timeRange === "all" ? "bg-white text-gray-800 shadow-xs dark:bg-gray-800 dark:text-gray-100" : "text-gray-400"
              }`}
            >
              全周期
            </button>
          </div>
        </div>
      </div>

      {/* ECharts 容器 */}
      <div className="w-full">
        {(chartMode === "bp" && !hasBpData) ? (
          <div className="flex h-64 items-center justify-center text-xs text-gray-400">
            暂无记录的血压数据，仅记录了血糖或体重
          </div>
        ) : (chartMode === "glucose" && !hasGlucoseData) ? (
          <div className="flex h-64 items-center justify-center text-xs text-gray-400">
            暂无记录的血糖数据，仅记录了血压或体重
          </div>
        ) : (
          <div ref={chartRef} style={{ height: 280 }} className="w-full" />
        )}
      </div>
    </div>
  );
}
