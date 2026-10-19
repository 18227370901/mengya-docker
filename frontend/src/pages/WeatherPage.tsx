import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  Eye,
  Gauge,
  Info,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Wind,
  X,
} from "lucide-react";
import { weatherApi, type DailyWeather, type WeatherData } from "@/api/weather";
import { CHINA_REGIONS, resolveRegionFromText, type RegionNode } from "@/lib/chinaRegions";
import { LunarUtils } from "@/utils/lunar";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";

const WEEK_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function renderWeatherIcon(desc: string = "", sizeCls = "h-5 w-5") {
  if (desc.includes("雨")) return <CloudRain className={`${sizeCls} text-blue-500`} />;
  if (desc.includes("云") || desc.includes("阴")) return <CloudSun className={`${sizeCls} text-amber-500`} />;
  if (desc.includes("雪")) return <Cloud className={`${sizeCls} text-indigo-400`} />;
  return <Sun className={`${sizeCls} text-amber-500`} />;
}

function getAqiBadge(aqi?: number) {
  if (aqi === undefined || aqi === null) return null;
  if (aqi <= 50) return { label: "优", color: "bg-emerald-500 text-white" };
  if (aqi <= 100) return { label: "良", color: "bg-yellow-500 text-white" };
  if (aqi <= 150) return { label: "轻度污染", color: "bg-orange-500 text-white" };
  if (aqi <= 200) return { label: "中度污染", color: "bg-rose-500 text-white" };
  return { label: "重度污染", color: "bg-purple-600 text-white" };
}

export default function WeatherPage() {
  const { user } = useAuthStore();
  const { isDark } = useThemeStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);

  const [activeTab, setActiveTab] = useState<"forecast" | "almanac">("almanac");
  const [searchMode, setSearchMode] = useState<"cascade" | "search">("cascade");
  const [searchCityText, setSearchCityText] = useState("");
  const [lastUpdatedText, setLastUpdatedText] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (msg: string, ok = true) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const [provinceIdx, setProvinceIdx] = useState<number>(() => {
    const sc = CHINA_REGIONS.findIndex((p) => p.n.includes("四川"));
    return sc >= 0 ? sc : 0;
  });
  const [cityIdx, setCityIdx] = useState<number>(-1); // -1 表示未选城市 / 仅查询全省
  const [districtIdx, setDistrictIdx] = useState<number>(-1); // -1 表示未选区县 / 仅查询该市

  const today = useMemo(() => new Date(), []);
  const [almanacYear, setAlmanacYear] = useState<number>(today.getFullYear());
  const [almanacMonth, setAlmanacMonth] = useState<number>(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [holidayCache, setHolidayCache] = useState<Record<number, Record<string, { holiday: boolean; name: string }>>>({});

  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // 页面载入：优先从本地持久化缓存还原天气数据，实现免拉取秒开；未缓存时仅呈现离线万年历
  useEffect(() => {
    let saved = "";
    try {
      const uid = user?.id || 0;
      saved = localStorage.getItem(`mengya_weather_city_${uid}`) || "";
      const cachedRaw = localStorage.getItem(`mengya_weather_cache_${uid}`);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && cached.data) {
          setWeatherData(cached.data);
          if (cached.label || cached.city) {
            setSearchCityText(cached.label || cached.city);
          }
          if (cached.cachedAt) {
            const d = new Date(cached.cachedAt);
            const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            setLastUpdatedText(`缓存于 ${timeStr}`);
          }
        }
      }
    } catch {
      /* ignore */
    }

    if (saved && saved !== "[object Object]" && !searchCityText) {
      setSearchCityText(saved);
    }
  }, [user?.id]);

  const loadWeatherByCoords = async (lon: number, lat: number, label: string, isSilent = false) => {
    setLoading(true);
    setError("");
    try {
      const data = await weatherApi.query({ lon, lat, label, days: 15 });
      setWeatherData(data);
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setLastUpdatedText(`更新于 ${timeStr}`);
      try {
        const uid = user?.id || 0;
        const cName = typeof data.city === "string" ? data.city : (data.city as any)?.name || label;
        localStorage.setItem(`mengya_weather_city_${uid}`, cName);
        localStorage.setItem("mengya_last_weather_city", cName);
        localStorage.setItem(
          `mengya_weather_cache_${uid}`,
          JSON.stringify({ city: cName, label, coords: [lon, lat], data, cachedAt: Date.now() })
        );
        window.dispatchEvent(new CustomEvent("mengya_weather_city_changed", { detail: { city: cName } }));
      } catch {
        /* ignore */
      }
      if (!isSilent) {
        showToast(`已成功获取「${label}」气象数据`);
      }
    } catch (err: any) {
      const errMsg = err.message || "天气数据获取失败";
      setError(errMsg);
      showToast(errMsg, false);
    } finally {
      setLoading(false);
    }
  };

  const loadWeatherByCity = async (cityName: string) => {
    const text = cityName.trim();
    if (!text) return;

    // 1. 优先使用本地 3000+ 区县高精度行政区划树逆向解析（解决如"四川省巴中市恩阳区"、"恩阳区"精准匹配）
    const matched = resolveRegionFromText(text);
    if (matched && matched.coords) {
      setSearchCityText(matched.label);
      return loadWeatherByCoords(matched.coords[0], matched.coords[1], matched.label);
    }

    // 2. 本地未命中时回退到后端地理编码与天气查询
    setLoading(true);
    setError("");
    try {
      const data = await weatherApi.query({ city: text, days: 15 });
      setWeatherData(data);
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setLastUpdatedText(`更新于 ${timeStr}`);
      try {
        const uid = user?.id || 0;
        const cName = typeof data.city === "string" ? data.city : (data.city as any)?.name || text;
        localStorage.setItem(`mengya_weather_city_${uid}`, cName);
        localStorage.setItem("mengya_last_weather_city", cName);
        localStorage.setItem(
          `mengya_weather_cache_${uid}`,
          JSON.stringify({ city: cName, label: text, data, cachedAt: Date.now() })
        );
        window.dispatchEvent(new CustomEvent("mengya_weather_city_changed", { detail: { city: cName } }));
      } catch {
        /* ignore */
      }
      showToast(`已成功获取「${text}」气象数据`);
    } catch (err: any) {
      const errMsg = err.message || "未找到该城市天气";
      setError(errMsg);
      showToast(errMsg, false);
    } finally {
      setLoading(false);
    }
  };

  const currentProvince = CHINA_REGIONS[provinceIdx];
  const cities = currentProvince?.c || [];
  const currentCity = cityIdx >= 0 && cityIdx < cities.length ? cities[cityIdx] : null;
  const districts = currentCity?.c || [];
  const hasDistricts = districts.length > 0 && !(districts.length === 1 && districts[0].n === currentCity?.n);
  const currentDistrict = districtIdx >= 0 && districtIdx < districts.length && hasDistricts ? districts[districtIdx] : null;

  // 动态计算当前选中的目标节点（支持单独查省、单独查市、查区县）
  const targetInfo = useMemo(() => {
    if (currentDistrict && currentDistrict.g) {
      const pName = currentProvince?.n || "";
      const cName = currentCity?.n && currentCity.n !== pName ? currentCity.n : "";
      const dName = currentDistrict.n && currentDistrict.n !== cName ? currentDistrict.n : "";
      return {
        node: currentDistrict,
        label: `${pName}${cName}${dName}`,
        level: "区县",
      };
    }
    if (currentCity && currentCity.g) {
      const pName = currentProvince?.n || "";
      const cName = currentCity.n && currentCity.n !== pName ? currentCity.n : "";
      return {
        node: currentCity,
        label: `${pName}${cName}`,
        level: "城市",
      };
    }
    if (currentProvince && currentProvince.g) {
      return {
        node: currentProvince,
        label: currentProvince.n,
        level: "全省",
      };
    }
    return null;
  }, [currentProvince, currentCity, currentDistrict]);

  const handleCascadeQuery = () => {
    if (!targetInfo || !targetInfo.node || !targetInfo.node.g) return;
    const [lon, lat] = targetInfo.node.g;
    loadWeatherByCoords(lon, lat, targetInfo.label);
  };

  useEffect(() => {
    if (activeTab !== "almanac") return;
    if (holidayCache[almanacYear] !== undefined) return;

    weatherApi
      .getHolidays(almanacYear)
      .then((res) => {
        setHolidayCache((prev) => ({ ...prev, [almanacYear]: res.holiday || {} }));
      })
      .catch(() => {
        setHolidayCache((prev) => ({ ...prev, [almanacYear]: {} }));
      });
  }, [activeTab, almanacYear, holidayCache]);

  const dailyMap = useMemo(() => {
    const map: Record<string, DailyWeather> = {};
    (weatherData?.daily || []).forEach((d) => {
      map[d.date] = d;
    });
    return map;
  }, [weatherData?.daily]);

  useEffect(() => {
    if (!chartRef.current || !weatherData?.daily || weatherData.daily.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const daily = weatherData.daily;
    const xDates = daily.map((d) => {
      const parts = d.date.split("-");
      return `${Number(parts[1])}/${Number(parts[2])}`;
    });
    const maxTemps = daily.map((d) => Math.round(d.temp_max));
    const minTemps = daily.map((d) => Math.round(d.temp_min));

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const todayIndex = daily.findIndex((d) => d.date === todayStr);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const idx = params[0].dataIndex;
          const d = daily[idx];
          return `<div class="text-xs p-1">
            <div class="font-bold mb-1">${d.date} (${d.weather_text})</div>
            <div class="text-rose-500">最高温：${d.temp_max}°C</div>
            <div class="text-blue-500">最低温：${d.temp_min}°C</div>
            <div class="text-gray-500">降水概率：${d.precip_prob}%</div>
          </div>`;
        },
      },
      legend: {
        data: ["最高温", "最低温"],
        textStyle: { color: isDark ? "#9ca3af" : "#4b5563" },
        top: 0,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "8%",
        top: "16%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: xDates,
        axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
        axisLabel: { color: isDark ? "#9ca3af" : "#6b7280", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: "{value}°",
          color: isDark ? "#9ca3af" : "#6b7280",
        },
        splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
      },
      series: [
        {
          name: "最高温",
          type: "line",
          smooth: true,
          data: maxTemps,
          itemStyle: { color: "#f43f5e" },
          lineStyle: { width: 3 },
          label: { show: true, position: "top", formatter: "{c}°", color: "#f43f5e", fontSize: 10 },
          markLine:
            todayIndex >= 0
              ? {
                  symbol: "none",
                  data: [{ xAxis: todayIndex, label: { formatter: "今天", position: "start" } }],
                  lineStyle: { color: "#6366f1", type: "dashed" },
                }
              : undefined,
        },
        {
          name: "最低温",
          type: "line",
          smooth: true,
          data: minTemps,
          itemStyle: { color: "#3b82f6" },
          lineStyle: { width: 3 },
          label: { show: true, position: "bottom", formatter: "{c}°", color: "#3b82f6", fontSize: 10 },
        },
      ],
    };

    try {
      chartInstance.current.setOption(option, true);
    } catch (e) {
      console.error("ECharts error:", e);
    }

    const handleResize = () => {
      try {
        chartInstance.current?.resize();
      } catch {}
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [weatherData?.daily, isDark, today]);

  useEffect(() => {
    return () => {
      try {
        chartInstance.current?.dispose();
        chartInstance.current = null;
      } catch {}
    };
  }, []);

  const almanacGrid = useMemo(() => {
    const y = almanacYear;
    const m = almanacMonth;
    const firstDay = new Date(y, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells: Array<{
      dateKey: string;
      year: number;
      month: number;
      day: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      dayLabel: { text: string; type: "festival" | "term" | "lunar" | "none" };
      holidayBadge?: { holiday: boolean; name: string };
      weather?: DailyWeather;
    }> = [];

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const yearHolidays = holidayCache[y] || {};

    const prevDays = new Date(y, m, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const pDay = prevDays - i;
      const pMonth = m === 0 ? 12 : m;
      const pYear = m === 0 ? y - 1 : y;
      const dateKey = `${pYear}-${String(pMonth).padStart(2, "0")}-${String(pDay).padStart(2, "0")}`;
      const label = LunarUtils.getDayLabel(pYear, pMonth, pDay);
      cells.push({
        dateKey,
        year: pYear,
        month: pMonth,
        day: pDay,
        isCurrentMonth: false,
        isToday: dateKey === todayStr,
        dayLabel: label,
        weather: dailyMap[dateKey],
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const mmdd = `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const label = LunarUtils.getDayLabel(y, m + 1, d);
      const hBadge = yearHolidays[mmdd];

      cells.push({
        dateKey,
        year: y,
        month: m + 1,
        day: d,
        isCurrentMonth: true,
        isToday: dateKey === todayStr,
        dayLabel: label,
        holidayBadge: hBadge,
        weather: dailyMap[dateKey],
      });
    }

    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      const nMonth = m + 2 > 12 ? 1 : m + 2;
      const nYear = m + 2 > 12 ? y + 1 : y;
      const dateKey = `${nYear}-${String(nMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
      const label = LunarUtils.getDayLabel(nYear, nMonth, nextDay);
      cells.push({
        dateKey,
        year: nYear,
        month: nMonth,
        day: nextDay,
        isCurrentMonth: false,
        isToday: dateKey === todayStr,
        dayLabel: label,
        weather: dailyMap[dateKey],
      });
      nextDay++;
    }

    return cells;
  }, [almanacYear, almanacMonth, dailyMap, holidayCache, today]);

  const selectedDetail = useMemo(() => {
    if (!selectedDate) return null;
    const parts = selectedDate.split("-").map(Number);
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    const lunarInfo = LunarUtils.getFullInfo(y, m, d);
    const mmdd = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hBadge = (holidayCache[y] || {})[mmdd];
    const weather = dailyMap[selectedDate];

    return {
      dateKey: selectedDate,
      year: y,
      month: m,
      day: d,
      lunarInfo,
      holidayBadge: hBadge,
      weather,
    };
  }, [selectedDate, dailyMap, holidayCache]);

  const curr = weatherData?.current;
  const displayCity = typeof weatherData?.city === "string" ? weatherData.city : (weatherData?.city as any)?.name || "天气预报与万年历";
  const aqiVal = weatherData?.air_quality?.aqi ?? weatherData?.air_quality?.us_aqi;
  const aqiBadge = getAqiBadge(aqiVal);

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
              <CloudSun className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {displayCity}
              </h1>
              <p className="text-xs text-gray-400">Open-Meteo 气象源 · 阿里云 DataV 行政区划 · 1900-2100 寿星天文历</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                searchMode === "cascade"
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              }`}
              onClick={() => setSearchMode("cascade")}
            >
              省市区级联
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                searchMode === "search"
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              }`}
              onClick={() => setSearchMode("search")}
            >
              自由搜索
            </button>
          </div>
        </div>

        {searchMode === "cascade" ? (
          <div className="mt-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* 第 1 级：省份选择（始终展示） */}
              <div className="flex-1 min-w-[140px] max-w-xs">
                <select
                  className="input text-xs py-1.5 w-full"
                  value={provinceIdx}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setProvinceIdx(idx);
                    setCityIdx(-1);
                    setDistrictIdx(-1);
                  }}
                >
                  {CHINA_REGIONS.map((p, idx) => (
                    <option key={p.n} value={idx}>
                      {p.n}
                    </option>
                  ))}
                </select>
              </div>

              {/* 第 2 级：城市选择（动态展示，提供仅查全省选项） */}
              {cities.length > 0 && (
                <div className="flex-1 min-w-[140px] max-w-xs">
                  <select
                    className="input text-xs py-1.5 w-full"
                    value={cityIdx}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setCityIdx(idx);
                      setDistrictIdx(-1);
                    }}
                  >
                    <option value={-1}>— 仅查询全省 ({currentProvince?.n}) —</option>
                    {cities.map((c, idx) => (
                      <option key={c.n} value={idx}>
                        {c.n}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 第 3 级：区县选择（仅当选中了具体城市且有下级区县时动态展示） */}
              {cityIdx >= 0 && hasDistricts && (
                <div className="flex-1 min-w-[140px] max-w-xs">
                  <select
                    className="input text-xs py-1.5 w-full"
                    value={districtIdx}
                    onChange={(e) => setDistrictIdx(Number(e.target.value))}
                  >
                    <option value={-1}>— 仅查询该市 ({currentCity?.n}) —</option>
                    {districts.map((d, idx) => (
                      <option key={d.n} value={idx}>
                        {d.n}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                className="btn-primary text-xs py-1.5 px-4 inline-flex items-center justify-center gap-1.5 shadow-2xs min-w-[96px]"
                onClick={handleCascadeQuery}
                disabled={loading}
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                <span>{loading ? "正在查询..." : "查询天气"}</span>
              </button>
            </div>

            {/* 准备查询的目标提示 */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-500 gap-1.5 pt-0.5">
              <div className="inline-flex items-center gap-1.5">
                <span className="text-gray-400">准备查询：</span>
                <span className="rounded-md bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 font-semibold text-brand-600 dark:text-brand-300">
                  {targetInfo?.label || "未选择"}
                </span>
                <span className="text-gray-400 text-[10px]">
                  ({targetInfo?.level === "全省" ? "将查询省级中心宏观天气" : targetInfo?.level === "城市" ? "仅查询地级市气象" : "精确至区县气象"})
                </span>
              </div>
              <span className="text-[10px] text-gray-400 hidden sm:inline">
                支持单独查询省、市或具体区县，按需逐步展开
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3.5 flex gap-2">
            <input
              className="input flex-1 text-xs py-1.5"
              placeholder="输入中国省市区县名称，如：四川省巴中市恩阳区、杭州西湖区..."
              value={searchCityText}
              onChange={(e) => setSearchCityText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && loadWeatherByCity(searchCityText)}
              disabled={loading}
            />
            <button
              type="button"
              className="btn-primary text-xs py-1.5 px-4 inline-flex items-center justify-center gap-1.5 min-w-[90px]"
              onClick={() => loadWeatherByCity(searchCityText)}
              disabled={loading || !searchCityText.trim()}
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span>{loading ? "正在查询..." : "搜索"}</span>
            </button>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            className="underline font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 cursor-pointer text-xs"
            onClick={() => loadWeatherByCoords(104.0665, 30.5723, "四川省成都市")}
          >
            重置为默认城市 (成都)
          </button>
        </div>
      )}

      {loading && !weatherData && (
        <div className="card p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm">正在加载气象数据与万年历信息…</p>
        </div>
      )}

      {curr && (
        <section className="rounded-3xl bg-gradient-to-br from-brand-500 via-rose-500 to-amber-500 p-6 text-white shadow-xl relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl" />
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm opacity-90">
                <div className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-4 w-4" />
                  <span>{displayCity}</span>
                </div>
                <span className="text-xs opacity-75">
                  {curr.time} 气象 {lastUpdatedText ? `(${lastUpdatedText})` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (targetInfo?.node?.g) {
                      loadWeatherByCoords(targetInfo.node.g[0], targetInfo.node.g[1], targetInfo.label);
                    } else if (searchCityText) {
                      loadWeatherByCity(searchCityText);
                    } else {
                      loadWeatherByCoords(104.0665, 30.5723, "四川省成都市");
                    }
                  }}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 px-2.5 py-0.5 text-xs text-white transition cursor-pointer"
                  title="刷新当前地点实时天气"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  <span>刷新</span>
                </button>
              </div>

              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-mono text-5xl sm:text-6xl font-extrabold tracking-tight tabular-nums drop-shadow-md">
                  {Math.round(curr.temperature)}
                </span>
                <span className="text-2xl font-light opacity-90">°C</span>
                <div className="ml-2 flex items-center gap-1.5 text-xl font-medium">
                  {renderWeatherIcon(curr.weather_text, "h-7 w-7")}
                  <span>{curr.weather_text}</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-90">
                <span>体感 {Math.round(curr.feels_like)}°C</span>
                <span>·</span>
                <span>湿度 {curr.humidity}%</span>
                <span>·</span>
                <span>{curr.wind_direction_text} {curr.wind_speed} km/h</span>
                {aqiBadge && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${aqiBadge.color}`}>
                    AQI {aqiVal} {aqiBadge.label}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-3 w-full md:w-auto">
              <div className="rounded-2xl bg-white/15 backdrop-blur-md p-3 text-center">
                <div className="text-[11px] opacity-80 flex items-center justify-center gap-1">
                  <Wind className="h-3 w-3" /> 风力阵风
                </div>
                <div className="text-sm font-bold mt-1 font-mono">{curr.wind_gusts ? `${curr.wind_gusts} km/h` : "--"}</div>
              </div>

              <div className="rounded-2xl bg-white/15 backdrop-blur-md p-3 text-center">
                <div className="text-[11px] opacity-80 flex items-center justify-center gap-1">
                  <Gauge className="h-3 w-3" /> 大气气压
                </div>
                <div className="text-sm font-bold mt-1 font-mono">{curr.pressure ? `${curr.pressure} hPa` : "--"}</div>
              </div>

              <div className="rounded-2xl bg-white/15 backdrop-blur-md p-3 text-center">
                <div className="text-[11px] opacity-80 flex items-center justify-center gap-1">
                  <Droplets className="h-3 w-3" /> 空气 PM2.5
                </div>
                <div className="text-sm font-bold mt-1 font-mono">
                  {(weatherData?.air_quality?.pm2_5 ?? weatherData?.air_quality?.pm25) ? `${weatherData?.air_quality?.pm2_5 ?? weatherData?.air_quality?.pm25} μg` : "--"}
                </div>
              </div>

              <div className="rounded-2xl bg-white/15 backdrop-blur-md p-3 text-center">
                <div className="text-[11px] opacity-80 flex items-center justify-center gap-1">
                  <Sun className="h-3 w-3" /> 紫外线指数
                </div>
                <div className="text-sm font-bold mt-1 font-mono">
                  {weatherData?.daily[0]?.uv_index !== undefined ? `${weatherData.daily[0].uv_index}` : "--"}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {weatherData && (
        <section className="card p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-brand-500" />
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">15 天气温走势双折线图</h2>
            </div>
            <span className="text-[11px] text-gray-400">最高温走势（红）与 最低温走势（蓝）</span>
          </div>
          <div ref={chartRef} className="h-60 w-full" />
        </section>
      )}

      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-2xl bg-gray-100 p-1 dark:bg-gray-800">
          <button
            type="button"
            className={`rounded-xl px-5 py-2 text-xs font-semibold transition ${
              activeTab === "forecast"
                ? "bg-white text-brand-600 shadow-sm dark:bg-gray-700 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400"
            }`}
            onClick={() => setActiveTab("forecast")}
          >
            15 天预报卡片
          </button>
          <button
            type="button"
            className={`rounded-xl px-5 py-2 text-xs font-semibold transition ${
              activeTab === "almanac"
                ? "bg-white text-brand-600 shadow-sm dark:bg-gray-700 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400"
            }`}
            onClick={() => setActiveTab("almanac")}
          >
            气象万年历 (离线可用)
          </button>
        </div>
      </div>

      {activeTab === "forecast" && !weatherData && !loading && (
        <div className="card p-8 text-center text-gray-500">
          <CloudSun className="mx-auto mb-3 h-10 w-10 text-brand-400" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">当前处于离线万年历模式</h3>
          <p className="mt-1 text-xs text-gray-400 max-w-md mx-auto">
            默认未拉取外部天气数据，避免频繁消耗网络请求。如需查看 15 天实时气温与详细预报，请在上方选择地区后点击【查询天气】。
          </p>
          <div className="mt-4">
            <button
              type="button"
              className="btn-primary text-xs py-1.5 px-4 inline-flex items-center gap-1.5"
              onClick={searchMode === "cascade" ? handleCascadeQuery : () => loadWeatherByCity(searchCityText || "成都市")}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>立即拉取天气数据</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === "forecast" && weatherData && (
        <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {(weatherData?.daily || []).map((d, i) => {
            const isToday = i === 0;
            const parts = d.date.split("-").map(Number);
            const label = LunarUtils.getDayLabel(parts[0], parts[1], parts[2]);

            return (
              <div
                key={d.date}
                className={`rounded-2xl border p-3.5 text-center transition hover:-translate-y-0.5 hover:shadow-md ${
                  isToday
                    ? "border-brand-500 bg-brand-50/50 dark:border-brand-500/80 dark:bg-brand-950/20 shadow-sm"
                    : "border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-800/80"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span>{isToday ? "今天" : `${parts[1]}/${parts[2]}`}</span>
                  <span className={label.type === "festival" ? "text-rose-500 font-semibold" : ""}>
                    {label.text}
                  </span>
                </div>

                <div className="my-2 flex justify-center">
                  {renderWeatherIcon(d.weather_text, "h-8 w-8")}
                </div>

                <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{d.weather_text}</div>

                <div className="mt-1 font-mono text-sm font-bold text-gray-700 dark:text-gray-300">
                  <span className="text-rose-500">{Math.round(d.temp_max)}°</span> /{" "}
                  <span className="text-blue-500">{Math.round(d.temp_min)}°</span>
                </div>

                <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-gray-400">
                  <Umbrella className="h-3 w-3" />
                  <span>降水 {d.precip_prob}%</span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {activeTab === "almanac" && (
        <section className="space-y-4">
          <div className="card p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-brand-500 shrink-0" />
              <div className="flex items-center gap-2">
                <div className="relative inline-flex items-center">
                  <select
                    className="appearance-none rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 pl-3 pr-7 py-1.5 text-xs font-bold shadow-2xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400 min-w-[96px] cursor-pointer"
                    value={almanacYear}
                    onChange={(e) => setAlmanacYear(Number(e.target.value))}
                  >
                    {Array.from({ length: 201 }, (_, i) => 1900 + i).map((y) => (
                      <option key={y} value={y}>
                        {y} 年
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>

                <div className="relative inline-flex items-center">
                  <select
                    className="appearance-none rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 pl-3 pr-6 py-1.5 text-xs font-bold shadow-2xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400 min-w-[76px] cursor-pointer"
                    value={almanacMonth}
                    onChange={(e) => setAlmanacMonth(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>
                        {m + 1} 月
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"
                onClick={() => {
                  if (almanacMonth === 0) {
                    setAlmanacYear((y) => Math.max(1900, y - 1));
                    setAlmanacMonth(11);
                  } else {
                    setAlmanacMonth((m) => m - 1);
                  }
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 上月
              </button>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"
                onClick={() => {
                  setAlmanacYear(today.getFullYear());
                  setAlmanacMonth(today.getMonth());
                }}
              >
                回到今天
              </button>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"
                onClick={() => {
                  if (almanacMonth === 11) {
                    setAlmanacYear((y) => Math.min(2100, y + 1));
                    setAlmanacMonth(0);
                  } else {
                    setAlmanacMonth((m) => m + 1);
                  }
                }}
              >
                下月 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="card p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center font-medium text-xs text-gray-500 mb-2">
              {WEEK_NAMES.map((w, i) => (
                <div key={w} className={i >= 5 ? "text-rose-500 font-bold" : ""}>
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {almanacGrid.map((cell) => {
                const isSelected = selectedDate === cell.dateKey;

                return (
                  <div
                    key={cell.dateKey}
                    onClick={() => setSelectedDate(cell.dateKey === selectedDate ? null : cell.dateKey)}
                    className={`relative min-h-[72px] sm:min-h-[84px] rounded-xl border p-1 sm:p-1.5 text-center cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? "border-brand-500 ring-2 ring-brand-400/40 bg-brand-50/40 dark:bg-brand-950/40"
                        : cell.isToday
                        ? "border-blue-500 bg-blue-50/30 dark:border-blue-400 dark:bg-blue-950/20"
                        : cell.isCurrentMonth
                        ? "border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-800"
                        : "border-transparent bg-gray-50/50 opacity-40 dark:bg-gray-900/40"
                    }`}
                  >
                    {cell.holidayBadge && (
                      <span
                        className={`absolute left-1 top-1 rounded px-1 py-0.2 text-[9px] font-bold text-white leading-none ${
                          cell.holidayBadge.holiday ? "bg-rose-600" : "bg-gray-600"
                        }`}
                        title={cell.holidayBadge.name}
                      >
                        {cell.holidayBadge.holiday ? "休" : "班"}
                      </span>
                    )}

                    <div
                      className={`text-sm sm:text-base font-bold ${
                        cell.isToday
                          ? "text-brand-600 dark:text-brand-400 font-extrabold"
                          : cell.isCurrentMonth
                          ? "text-gray-800 dark:text-gray-100"
                          : "text-gray-400"
                      }`}
                    >
                      {cell.day}
                    </div>

                    <div
                      className={`text-[10px] leading-tight truncate px-0.5 ${
                        cell.dayLabel.type === "festival"
                          ? "text-rose-600 font-bold dark:text-rose-400"
                          : cell.dayLabel.type === "term"
                          ? "text-emerald-600 font-bold dark:text-emerald-400"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                      title={cell.dayLabel.text}
                    >
                      {cell.dayLabel.text}
                    </div>

                    {cell.weather ? (
                      <div className="flex items-center justify-center gap-0.5 pt-0.5 text-[10px] font-mono text-gray-600 dark:text-gray-300">
                        {renderWeatherIcon(cell.weather.weather_text, "h-3 w-3")}
                        <span className="truncate">
                          {Math.round(cell.weather.temp_max)}°/{Math.round(cell.weather.temp_min)}°
                        </span>
                      </div>
                    ) : (
                      <div className="h-3" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDetail && (
            <div className="card p-5 border-brand-200 dark:border-brand-900/60 bg-gradient-to-br from-cream to-white dark:from-gray-800 dark:to-gray-850 shadow-md">
              <div className="flex items-center justify-between border-b border-gray-200/60 dark:border-gray-700/60 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-brand-500" />
                  <span className="font-bold text-base text-gray-800 dark:text-gray-100">
                    {selectedDetail.year}年{selectedDetail.month}月{selectedDetail.day}日 详情
                  </span>
                  {selectedDetail.holidayBadge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${
                        selectedDetail.holidayBadge.holiday ? "bg-rose-600" : "bg-gray-600"
                      }`}
                    >
                      {selectedDetail.holidayBadge.holiday ? "法定休假" : "调休补班"}：
                      {selectedDetail.holidayBadge.name}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setSelectedDate(null)}
                  title="关闭详情"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedDetail.lunarInfo && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="text-gray-400">农历历法：</span>
                    <b>{selectedDetail.lunarInfo.lunarFull}</b>
                  </div>
                  <div>
                    <span className="text-gray-400">星期干支：</span>
                    <b>
                      {selectedDetail.lunarInfo.week} · {selectedDetail.lunarInfo.gz}年
                    </b>
                  </div>
                  {selectedDetail.lunarInfo.term && (
                    <div>
                      <span className="text-gray-400">节气：</span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 font-bold">
                        {selectedDetail.lunarInfo.term}
                      </span>
                    </div>
                  )}
                  {selectedDetail.lunarInfo.festivals.length > 0 && (
                    <div>
                      <span className="text-gray-400">今日节日：</span>
                      <span className="font-bold text-rose-600">
                        {selectedDetail.lunarInfo.festivals.join("、")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {selectedDetail.weather && (
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-xs font-bold text-gray-500 mb-2">气象指标参考</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-2 text-center">
                      <span className="text-gray-400">天气状况</span>
                      <div className="font-bold mt-0.5">{selectedDetail.weather.weather_text}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-2 text-center">
                      <span className="text-gray-400">最高/最低温</span>
                      <div className="font-bold mt-0.5 text-rose-500">
                        {selectedDetail.weather.temp_max}° / {selectedDetail.weather.temp_min}°
                      </div>
                    </div>
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-2 text-center">
                      <span className="text-gray-400">降水概率</span>
                      <div className="font-bold mt-0.5 text-blue-500">{selectedDetail.weather.precip_prob}%</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-2 text-center">
                      <span className="text-gray-400">日出 / 日落</span>
                      <div className="font-bold mt-0.5 font-mono text-[11px]">
                        {selectedDetail.weather.sunrise || "--"} / {selectedDetail.weather.sunset || "--"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
