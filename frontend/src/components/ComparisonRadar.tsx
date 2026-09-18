import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface RadarData {
  indicator?: Array<{ name: string; max: number }>;
  indicators?: Array<{ name: string; max: number }>;
  series: Array<{ name: string; value: number[] }>;
}

export default function ComparisonRadar({ data, height = 320 }: { data: RadarData; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const indicators = data?.indicators || data?.indicator || [];
    if (!ref.current || !indicators.length) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      tooltip: {},
      legend: { bottom: 0, textStyle: { color: "#666" } },
      radar: {
        indicator: indicators,
        radius: "65%",
        splitArea: { areaStyle: { color: ["#fff7ed", "#fff"] } },
        axisName: { color: "#666" },
      },
      series: [
        {
          type: "radar",
          data: data.series.map((s) => ({
            name: s.name,
            value: s.value,
            areaStyle: { opacity: 0.15 },
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
  }, [data]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}