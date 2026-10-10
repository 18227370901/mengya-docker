import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import { useThemeStore } from "@/store/themeStore";

interface GrowthPoint {
  date: string;
  weight?: number;
  height?: number;
  head?: number;
}

/** v1.56 P1-B：WHO 0~3岁男童生长标准 P50 参考值（月龄 → 身高cm / 体重kg / 头围cm） */
const WHO_P50_BOY = [
  { m: 0, height: 49.9, weight: 3.3, head: 34.5 },
  { m: 1, height: 54.7, weight: 4.5, head: 37.3 },
  { m: 2, height: 58.4, weight: 5.6, head: 39.1 },
  { m: 3, height: 61.4, weight: 6.4, head: 40.5 },
  { m: 4, height: 63.9, weight: 7.0, head: 41.6 },
  { m: 5, height: 65.9, weight: 7.5, head: 42.6 },
  { m: 6, height: 67.6, weight: 7.9, head: 43.3 },
  { m: 9, height: 72.0, weight: 8.9, head: 45.2 },
  { m: 12, height: 75.7, weight: 9.6, head: 46.1 },
  { m: 18, height: 82.3, weight: 10.9, head: 47.4 },
  { m: 24, height: 87.8, weight: 12.2, head: 48.3 },
  { m: 30, height: 92.0, weight: 13.3, head: 49.0 },
  { m: 36, height: 96.1, weight: 14.3, head: 49.5 },
];

/** 按月龄线性插值获取 WHO P50 参考值 */
function whoP50(monthAge: number, key: "height" | "weight" | "head"): number | null {
  if (monthAge < 0) return null;
  const table = WHO_P50_BOY;
  if (monthAge <= table[0].m) return table[0][key];
  if (monthAge >= table[table.length - 1].m) return table[table.length - 1][key];
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (monthAge >= a.m && monthAge <= b.m) {
      const ratio = (monthAge - a.m) / (b.m - a.m);
      return +(a[key] + (b[key] - a[key]) * ratio).toFixed(1);
    }
  }
  return null;
}

/** 生长曲线折线图（体重/身高/头围 + v1.56 WHO P50 参考线） */
export default function GrowthChart({
  points,
  height = 280,
  birthDate,
}: {
  points: GrowthPoint[];
  height?: number;
  /** v1.56：宝宝生日（用于对齐 WHO 参考线的月龄坐标） */
  birthDate?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useThemeStore();

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points]
  );
  const dates = sorted.map((p) => p.date);

  /** 每个数据点对应的宝宝月龄（无生日时为 null，不叠加 WHO 参考线） */
  const monthAges = useMemo(() => {
    if (!birthDate) return sorted.map(() => null);
    const birth = new Date(birthDate);
    return sorted.map((p) => {
      const d = new Date(p.date);
      if (Number.isNaN(birth.getTime()) || Number.isNaN(d.getTime()) || d < birth) return null;
      return Math.max(0, (d.getTime() - birth.getTime()) / (30.44 * 86400000));
    });
  }, [sorted, birthDate]);

  useEffect(() => {
    if (!ref.current || !points?.length) return;
    const chart = echarts.init(ref.current);

    const series: echarts.SeriesOption[] = [];
    const define = [
      { key: "weight" as const, name: "体重(kg)", color: "#f97316", whoColor: "rgba(249,115,22,0.55)" },
      { key: "height" as const, name: "身高(cm)", color: "#38bdf8", whoColor: "rgba(56,189,248,0.55)" },
      { key: "head" as const, name: "头围(cm)", color: "#a78bfa", whoColor: "rgba(167,139,250,0.55)" },
    ];
    for (const d of define) {
      const values = sorted.map((p) => p[d.key] ?? null);
      if (values.some((v) => v !== null)) {
        series.push({
          name: d.name,
          type: "line",
          smooth: true,
          data: values,
          lineStyle: { color: d.color, width: 3 },
          itemStyle: { color: d.color },
          connectNulls: true,
          z: 2,
        });
      }
      // v1.56 P1-B：WHO P50 参考线（需宝宝生日）
      const whoValues = monthAges.map((m) => (m != null ? whoP50(m, d.key) : null));
      if (birthDate && whoValues.some((v) => v !== null)) {
        series.push({
          name: `${d.name} · WHO P50 参考`,
          type: "line",
          data: whoValues,
          smooth: true,
          lineStyle: { color: d.whoColor, width: 1.5, type: "dashed" },
          itemStyle: { color: d.whoColor },
          symbol: "none",
          silent: true,
          z: 1,
        });
      }
    }

    chart.setOption({
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: isDark ? "#334155" : "#e2e8f0",
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b" },
      },
      legend: {
        bottom: 0,
        textStyle: { color: isDark ? "#cbd5e1" : "#666", fontSize: 11 },
      },
      grid: { top: 20, right: 20, bottom: 50, left: 40 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: isDark ? "#94a3b8" : "#888" },
        axisLine: { lineStyle: { color: isDark ? "#334155" : "#e5e7eb" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#94a3b8" : "#888" },
        splitLine: { lineStyle: { color: isDark ? "#1e293b" : "#f0f0f0" } },
      },
      series,
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [sorted, monthAges, birthDate, isDark]);

  return (
    <div>
      <div ref={ref} style={{ height }} className="w-full" />
      {birthDate && (
        <p className="mt-1 text-right text-[11px] text-gray-400">
          虚线为 WHO 0-5 岁男童 P50 参考值（按宝宝月龄对齐），仅供参考
        </p>
      )}
    </div>
  );
}