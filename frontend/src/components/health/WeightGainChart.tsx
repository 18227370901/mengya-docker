import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { useThemeStore } from "@/store/themeStore";
import type { CurvePoint } from "@/types/health";

interface WeightGainChartProps {
  curve: CurvePoint[];
  currentWeek?: number;
  actualGain?: number;
  height?: number;
}

export default function WeightGainChart({
  curve,
  currentWeek,
  actualGain,
  height = 320,
}: WeightGainChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useThemeStore();

  useEffect(() => {
    if (!ref.current || !curve || curve.length === 0) return;
    const chart = echarts.init(ref.current);

    const weeks = curve.map((p) => `孕${p.week}周`);
    const targetMinData = curve.map((p) => p.target_min);
    const targetBandData = curve.map((p) => Math.max(0, +(p.target_max - p.target_min).toFixed(2)));
    const targetMedianData = curve.map((p) => p.target_median);

    // 用户实测打点
    const userScatterData: Array<[number, number]> = [];
    if (typeof currentWeek === "number" && typeof actualGain === "number") {
      userScatterData.push([currentWeek, actualGain]);
    }

    const series: echarts.SeriesOption[] = [
      // 1. 占位基线（透明线，不绘制内容）
      {
        name: "下限基准",
        type: "line",
        data: targetMinData,
        lineStyle: { opacity: 0 },
        stack: "confidence-band",
        symbol: "none",
      },
      // 2. 堆叠面积带（WS/T 801-2022 达标推荐增重区间）
      {
        name: "WS/T 801-2022推荐区间",
        type: "line",
        data: targetBandData,
        lineStyle: { opacity: 0 },
        areaStyle: {
          color: isDark ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.18)",
        },
        stack: "confidence-band",
        symbol: "none",
      },
      // 3. 中位参考线
      {
        name: "适宜增重中位线",
        type: "line",
        data: targetMedianData,
        smooth: true,
        lineStyle: {
          color: isDark ? "#34d399" : "#10b981",
          width: 2,
          type: "dashed",
        },
        symbol: "none",
      },
      // 4. 用户当前实际测量点
      {
        name: "当前实际增重 (kg)",
        type: "scatter",
        data: userScatterData,
        symbolSize: 14,
        itemStyle: {
          color: "#f97316",
          borderColor: "#ffffff",
          borderWidth: 2,
          shadowBlur: 6,
          shadowColor: "rgba(249, 115, 22, 0.5)",
        },
        label: {
          show: true,
          formatter: (param: any) => `${param.value[1]} kg`,
          position: "top",
          color: isDark ? "#fb923c" : "#ea580c",
          fontWeight: "bold",
        },
      },
    ];

    chart.setOption({
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: isDark ? "#334155" : "#e2e8f0",
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b", fontSize: 12 },
        formatter: (params: any) => {
          const weekParam = params[0];
          const weekIdx = weekParam.dataIndex;
          const point = curve[weekIdx];
          if (!point) return "";
          let tip = `<b>孕${point.week}周</b><br/>`;
          tip += `<span style="color:#10b981">●</span> 适宜区间：${point.target_min} ~ ${point.target_max} kg<br/>`;
          tip += `<span style="color:#34d399">--</span> 适宜中位：${point.target_median} kg<br/>`;
          if (weekIdx === currentWeek && typeof actualGain === "number") {
            tip += `<span style="color:#f97316">★</span> <b>您当前实际增重：${actualGain} kg</b>`;
          }
          return tip;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: isDark ? "#cbd5e1" : "#64748b", fontSize: 12 },
        data: ["WS/T 801-2022推荐区间", "适宜增重中位线", "当前实际增重 (kg)"],
      },
      grid: { top: 25, right: 25, bottom: 50, left: 45 },
      xAxis: {
        type: "category",
        data: weeks,
        axisLabel: {
          color: isDark ? "#94a3b8" : "#64748b",
          interval: 4,
        },
        axisLine: { lineStyle: { color: isDark ? "#334155" : "#e2e8f0" } },
      },
      yAxis: {
        type: "value",
        name: "增重 (kg)",
        nameTextStyle: { color: isDark ? "#94a3b8" : "#64748b", fontSize: 11 },
        axisLabel: { color: isDark ? "#94a3b8" : "#64748b" },
        splitLine: { lineStyle: { color: isDark ? "#1e293b" : "#f1f5f9" } },
      },
      series,
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [curve, currentWeek, actualGain, isDark]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}
