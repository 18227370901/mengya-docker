import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface GrowthPoint {
  date: string;
  weight?: number;
  height?: number;
  head?: number;
}

/** 生长曲线折线图（体重/身高/头围） */
export default function GrowthChart({ points, height = 280 }: { points: GrowthPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !points?.length) return;
    const chart = echarts.init(ref.current);
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((p) => p.date);

    const series: echarts.SeriesOption[] = [];
    const define = [
      { key: "weight", name: "体重(kg)", color: "#f97316" },
      { key: "height", name: "身高(cm)", color: "#38bdf8" },
      { key: "head", name: "头围(cm)", color: "#a78bfa" },
    ];
    for (const d of define) {
      const values = sorted.map((p) => p[d.key as keyof GrowthPoint] ?? null);
      if (values.some((v) => v !== null)) {
        series.push({
          name: d.name,
          type: "line",
          smooth: true,
          data: values,
          lineStyle: { color: d.color, width: 3 },
          itemStyle: { color: d.color },
          connectNulls: true,
        });
      }
    }

    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { bottom: 0 },
      grid: { top: 20, right: 20, bottom: 50, left: 40 },
      xAxis: { type: "category", data: dates, axisLabel: { color: "#888" } },
      yAxis: { type: "value", axisLabel: { color: "#888" }, splitLine: { lineStyle: { color: "#f0f0f0" } } },
      series,
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [points]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}