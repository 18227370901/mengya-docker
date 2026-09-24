import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { useThemeStore } from "@/store/themeStore";

interface RadarData {
  indicator?: Array<{ name: string; max: number }>;
  indicators?: Array<{ name: string; max: number }>;
  series: Array<{ name: string; value: number[] }>;
}

export default function ComparisonRadar({ data, height = 320 }: { data: RadarData; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useThemeStore();

  useEffect(() => {
    const indicators = data?.indicators || data?.indicator || [];
    if (!ref.current || !indicators.length) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      tooltip: {
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: isDark ? "#334155" : "#fed7aa",
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
      },
      legend: {
        bottom: 0,
        textStyle: { color: isDark ? "#cbd5e1" : "#666" },
      },
      radar: {
        indicator: indicators,
        radius: "65%",
        splitArea: {
          areaStyle: {
            color: isDark ? ["#1e293b", "#0f172a"] : ["#fff7ed", "#fff"],
          },
        },
        splitLine: {
          lineStyle: { color: isDark ? "#334155" : "#ffedd5" },
        },
        axisLine: {
          lineStyle: { color: isDark ? "#334155" : "#ffedd5" },
        },
        axisName: {
          color: isDark ? "#94a3b8" : "#666",
        },
      },
      series: [
        {
          type: "radar",
          data: data.series.map((s) => ({
            name: s.name,
            value: s.value,
            areaStyle: { opacity: isDark ? 0.25 : 0.15 },
            lineStyle: { width: 2 },
          })),
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [data, isDark]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}
