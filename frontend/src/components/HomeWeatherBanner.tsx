import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Baby,
  Calendar,
  CloudRain,
  CloudSun,
  Edit3,
  Heart,
  Moon,
  RefreshCw,
  Sparkles,
  Sprout,
  Sun,
  SunMedium,
  Settings,
  Info,
} from "lucide-react";
import { dailyTipsApi } from "@/api/dailyTips";
import { weatherApi, type HomeWeatherResponse } from "@/api/weather";
import { resolveRegionFromText } from "@/lib/chinaRegions";
import { LunarUtils } from "@/utils/lunar";
import { useAuthStore } from "@/store/authStore";

const WEEK_CN = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

interface StageTip {
  title: string;
  tip: string;
  tag: string;
}

// 分阶段科学育儿与孕期健康指导锦囊库
const STAGE_TIPS: Record<string, StageTip[]> = {
  // 新生儿期 (0-28天)
  newborn: [
    {
      title: "黑白追焦与抚触交流",
      tip: "新生儿视力焦点约在20~25厘米。每天进行2~3分钟黑白卡追焦互动与腹部顺时针轻柔抚触，能有效激发大脑感知并排气舒缓。",
      tag: "新生儿 · 感知与大动作",
    },
    {
      title: "竖抱拍嗝防溢奶",
      tip: "每次喂哺后将宝宝竖抱靠于肩头，空心掌自下而上轻拍后背10~15分钟，待排出嗝气后再放下，可大幅减少呛奶与溢奶。",
      tag: "新生儿 · 喂养与拍嗝",
    },
    {
      title: "脐带残端干燥护理",
      tip: "脐带脱落前后保持干燥透气，洗澡后用消毒棉签吸干水分。穿纸尿裤时将腰部前沿稍作折叠，避开脐部创面摩擦。",
      tag: "新生儿 · 日常护理",
    },
    {
      title: "俯卧抬头练习",
      tip: "清醒且大人看护下，每天安排1~2次俯卧抬头练习，每次1~2分钟，有助于锻炼颈背肌群支撑力，预防偏头扁头。",
      tag: "新生儿 · 发育锻炼",
    },
  ],
  // 婴儿期 (1-12个月)
  infant: [
    {
      title: "手眼协调与翻身探索",
      tip: "宝宝3~4个月开始探索翻身与双手抓握。可准备彩色摇铃、抓握球与布书，引导左右侧身与视听跟随。",
      tag: "婴儿期 · 动作发育",
    },
    {
      title: "满6月龄辅食黄金期",
      tip: "辅食添加遵循“由单一到多样、由细到粗、循序渐进”原则。首选富铁强化婴儿米粉，每次引入新食材观察2~3天排便反应。",
      tag: "婴儿期 · 科学辅食",
    },
    {
      title: "萌芽出牙期口腔呵护",
      tip: "宝宝长乳牙常伴随流口水、爱咬硬物。可用干净冷藏牙胶或湿润纱布轻柔擦拭牙龈，既能缓解发痒也能保护乳牙萌出。",
      tag: "婴儿期 · 出牙护理",
    },
    {
      title: "爬行是平衡与认知基石",
      tip: "7~9个月鼓励充分在地垫上自由爬行，爬行能有效刺激左右脑协调、前庭平衡发育，并锻炼双臂与核心支撑力。",
      tag: "婴儿期 · 探索成长",
    },
  ],
  // 幼儿期 (1岁以上)
  toddler: [
    {
      title: "语言爆发期的亲子对话",
      tip: "1岁以后宝宝进入词汇飞跃期，多用丰富具象的语言进行情境互动，耐心倾听并鼓励宝宝用动作或词语表达内心需求。",
      tag: "幼儿期 · 语言启蒙",
    },
    {
      title: "自主进食与精细动作",
      tip: "允许宝宝用手抓或练习握勺，不怕弄脏餐桌。自主进食能极大增强自主意识、专注力以及手指精细动作熟练度。",
      tag: "幼儿期 · 习惯养成",
    },
    {
      title: "户外活动与视力阳光守护",
      tip: "每天保证1~2小时户外活动时间，自然光照射不仅促进体内维生素D自然合成与骨骼成长，也是预防近视的天然屏障。",
      tag: "幼儿期 · 健康体魄",
    },
  ],
  // 孕期 (孕早期/孕中期/孕晚期)
  pregnancy: [
    {
      title: "温柔胎教与亲子连结",
      tip: "胎儿此时对外界轻柔温和的声音和光线已有灵敏感知，准爸妈每晚固定时间讲故事、轻唱儿歌，建立温暖的初始安全感。",
      tag: "孕期 · 胎教互动",
    },
    {
      title: "左侧卧位与安稳睡眠",
      tip: "孕中晚期建议尽量保持舒适的左侧卧睡姿，配合U型孕妇枕支撑腰腹与双腿，可有效减轻腹主动脉压迫并改善子宫胎盘血供。",
      tag: "孕期 · 舒适休养",
    },
    {
      title: "数胎动——守护宝宝安危的晴雨表",
      tip: "孕28周后建议每日早中晚在固定安静时间各数1小时胎动，胎动是宝宝传递健康信号的最佳方式，节奏平稳即代表安好。",
      tag: "孕期 · 科学监护",
    },
    {
      title: "清淡少食多餐与适度散步",
      tip: "保持均衡膳食，优质蛋白质与膳食纤维搭配，饭后半小时适度慢步走，既能舒缓下肢轻度浮肿，也为顺利分娩积蓄力量。",
      tag: "孕期 · 营养活力",
    },
  ],
  // 通用/备孕/未设置
  general: [
    {
      title: "萌芽陪伴 · 每一步都算数",
      tip: "从第一次胎动到第一次背书包，萌芽陪伴您每一个温暖瞬间。点击左侧标签可随时设置或同步宝宝的真实月龄。",
      tag: "科学育儿 · 全程相伴",
    },
    {
      title: "规律作息与家庭关怀",
      tip: "育儿是一场温暖的家庭接力。科学的分工与理解、充足的睡眠，是守护新手爸妈好心情与宝宝健康生长的基石。",
      tag: "萌芽锦囊 · 舒心生活",
    },
  ],
};

interface HomeWeatherBannerProps {
  stage?: {
    type?: string;
    label?: string;
    trimester?: string;
    period?: string;
    week_days_text?: string;
    is_pregnant?: boolean;
    days?: number;
    total_months?: number;
  } | null;
  onEditStage?: () => void;
}

export default function HomeWeatherBanner({ stage, onEditStage }: HomeWeatherBannerProps) {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const hasWeatherPerm = user?.is_staff || hasPermission("menu_weather");

  const [timeStr, setTimeStr] = useState("--:--:--");
  const [dateStr, setDateStr] = useState("");
  const [lunarStr, setLunarStr] = useState("");
  const [term, setTerm] = useState<string | null>(null);
  const [festivals, setFestivals] = useState<string[]>([]);
  const [weatherData, setWeatherData] = useState<HomeWeatherResponse | null>(() => {
    try {
      const uid = user?.id || 0;
      const cached = localStorage.getItem(`mengya_weather_home_${uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // 科学关怀贴士状态与切换动画
  const [tipIndex, setTipIndex] = useState(0);


  const [isRotating, setIsRotating] = useState(false);

  // 走秒时钟与公历/农历信息
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setTimeStr(`${h}:${m}:${s}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth() + 1;
    const d = now.getDate();
    const week = WEEK_CN[now.getDay()];
    setDateStr(`${y}年${mo}月${d}日 ${week}`);

    try {
      const info = LunarUtils.getFullInfo(y, mo, d);
      if (info) {
        setLunarStr(info.lunarFull || "");
        setTerm(info.term || null);
        setFestivals(info.festivals || []);
      }
    } catch {
      /* ignore */
    }

    return () => clearInterval(timer);
  }, []);

  // 动态锦囊列表状态
  const [dynamicTips, setDynamicTips] = useState<StageTip[] | null>(null);

  // 计算当前阶段 key（全面兼容 pregnancy/baby/pregnant/parenting 及 user 自身孕周/生日）
  const targetStageKey = useMemo(() => {
    // 1. 优先判断孕期阶段
    if (
      stage?.type === "pregnancy" ||
      stage?.type === "pregnant" ||
      stage?.is_pregnant === true ||
      (user?.is_pregnant && !user?.baby_birthday)
    ) {
      return "pregnancy";
    }

    // 2. 判断宝宝成长阶段
    if (stage?.type === "baby" || stage?.type === "parenting" || user?.baby_birthday) {
      const days = (stage as any)?.days;
      const totalMonths = (stage as any)?.total_months;
      const periodStr = stage?.period || "";
      const labelStr = stage?.label || "";

      let calcDays: number | null = typeof days === "number" ? days : null;
      let calcMonths: number | null = typeof totalMonths === "number" ? totalMonths : null;
      if (calcDays === null && user?.baby_birthday) {
        const b = new Date(user.baby_birthday);
        const now = new Date();
        calcDays = Math.max(0, Math.floor((now.getTime() - b.getTime()) / 86400000));
        calcMonths = Math.floor(calcDays / 30.44);
      }

      const years = (stage as any)?.years;

      // 幼儿期 (1岁以上 / >12个月 / 包含"岁" / period包含"幼儿"或"学龄前")
      // 关键：必须优先判定幼儿期，避免 "2岁8个月8天（32个月）" 中含有 "个月" 被婴儿期错误拦截！
      const isToddler =
        (calcMonths !== null && calcMonths > 12) ||
        (typeof years === "number" && years > 0) ||
        labelStr.includes("岁") ||
        periodStr.includes("幼儿") ||
        periodStr.includes("学龄前") ||
        (calcDays !== null && calcDays >= 365);

      if (isToddler) {
        return "toddler";
      }

      // 新生儿期：<=28天
      const isNewborn =
        (calcDays !== null && calcDays >= 0 && calcDays <= 28) ||
        periodStr.includes("新生儿") ||
        labelStr.includes("新生儿") ||
        (labelStr.includes("0个月") && !labelStr.includes("1岁"));

      if (isNewborn) {
        return "newborn";
      }

      // 婴儿期：1~12个月（已排除幼儿期与新生儿期）
      const isInfant =
        (calcMonths !== null && calcMonths >= 1 && calcMonths <= 12) ||
        (calcDays !== null && calcDays > 28 && calcDays < 365) ||
        periodStr.includes("婴儿") ||
        labelStr.includes("个月") ||
        labelStr.includes("百天");

      if (isInfant) {
        return "infant";
      }

      return "general";
    }

    return "general";
  }, [stage, user?.is_pregnant, user?.baby_birthday]);

  // 阶段发生变化时，贴士重置回第一条
  useEffect(() => {
    setTipIndex(0);
  }, [targetStageKey]);

  // 从后端动态拉取管理员配置的锦囊列表（启用状态与限制条数）
  useEffect(() => {
    let isMounted = true;
    dailyTipsApi
      .getPublicTips(targetStageKey)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.tips && res.tips.length > 0) {
          const mapped: StageTip[] = res.tips.map((t) => ({
            title: t.title,
            tip: t.tip,
            tag: t.tag,
          }));
          setDynamicTips(mapped);
        } else {
          setDynamicTips(null);
        }
      })
      .catch(() => {
        if (isMounted) setDynamicTips(null);
      });
    return () => {
      isMounted = false;
    };
  }, [targetStageKey]);

  // 确定当前适用的贴士列表（优先采用后端动态启用配置，降级使用内置科普库）
  const tipsList = useMemo(() => {
    if (dynamicTips && dynamicTips.length > 0) {
      return dynamicTips;
    }
    return STAGE_TIPS[targetStageKey] || STAGE_TIPS.general;
  }, [dynamicTips, targetStageKey]);

  const currentTip = tipsList[tipIndex % tipsList.length] || STAGE_TIPS.general[0];

  const handleNextTip = () => {
    setIsRotating(true);
    setTimeout(() => setIsRotating(false), 500);
    setTipIndex((prev) => (prev + 1) % tipsList.length);
  };

  // 加载天气数据（优先拉取用户最后一次查询的城市，无权限时自动获取管理员配置与友好提示）
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const [isLocationSyncing, setIsLocationSyncing] = useState(() => {
    try {
      return localStorage.getItem("mengya_weather_location_updated") === "true";
    } catch {
      return false;
    }
  });
  const [syncTargetCity, setSyncTargetCity] = useState(() => {
    try {
      return localStorage.getItem("mengya_weather_sync_target_city") || "";
    } catch {
      return "";
    }
  });
  const [isLoadingWeather, setIsLoadingWeather] = useState(() => !weatherData);

  const fetchWeather = (isCityChange = false, newCity?: string, lat?: number | string, lon?: number | string) => {
    let savedCity = newCity || "";
    let targetLat = lat;
    let targetLon = lon;
    const uid = user?.id || 0;

    if (!savedCity) {
      try {
        savedCity =
          localStorage.getItem("mengya_last_weather_city") ||
          localStorage.getItem(`mengya_weather_city_${uid}`) ||
          "";
        if (savedCity === "[object Object]") savedCity = "";
      } catch {
        /* ignore */
      }
    }

    if (!targetLat || !targetLon) {
      try {
        const coordsRaw = localStorage.getItem(`mengya_weather_coords_${uid}`);
        if (coordsRaw) {
          const coords = JSON.parse(coordsRaw);
          if (Array.isArray(coords) && coords.length === 2) {
            targetLon = coords[0];
            targetLat = coords[1];
          }
        }
        if (!targetLat && savedCity) {
          const region = resolveRegionFromText(savedCity);
          if (region && region.coords) {
            targetLon = region.coords[0];
            targetLat = region.coords[1];
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (isCityChange) {
      setIsLocationSyncing(true);
      if (savedCity) setSyncTargetCity(savedCity);
    }

    weatherApi
      .homeWeather({ city: savedCity || undefined, lat: targetLat, lon: targetLon })
      .then((data) => {
        setWeatherData(data);
        try {
          localStorage.setItem(`mengya_weather_home_${uid}`, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        // 优雅降级
      })
      .finally(() => {
        if (isCityChange) {
          setTimeout(() => {
            setIsLocationSyncing(false);
            try {
              localStorage.removeItem("mengya_weather_location_updated");
              localStorage.removeItem("mengya_weather_sync_target_city");
            } catch {
              /* ignore */
            }
          }, 450);
        }
        setIsLoadingWeather(false);
      });
  };

  useEffect(() => {
    const hasUpdated = localStorage.getItem("mengya_weather_location_updated") === "true";
    const targetCity = localStorage.getItem("mengya_weather_sync_target_city") || "";
    if (hasUpdated) {
      fetchWeather(true, targetCity);
    } else {
      fetchWeather(false);
    }

    const handleCityChanged = (e: any) => {
      const updatedCity = e?.detail?.city || "";
      const lat = e?.detail?.lat;
      const lon = e?.detail?.lon;
      fetchWeather(true, updatedCity, lat, lon);
    };

    window.addEventListener("mengya_weather_city_changed", handleCityChanged);
    return () => {
      window.removeEventListener("mengya_weather_city_changed", handleCityChanged);
    };
  }, [user?.id]);

  // 根据当前小时计算问候语
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 5) return { text: "夜深了", icon: Moon };
    if (h < 9) return { text: "早上好", icon: Sun };
    if (h < 12) return { text: "上午好", icon: SunMedium };
    if (h < 14) return { text: "中午好", icon: SunMedium };
    if (h < 18) return { text: "下午好", icon: Sun };
    if (h < 22) return { text: "晚上好", icon: Moon };
    return { text: "夜深了", icon: Moon };
  };

  const greeting = getGreeting();
  const GIcon = greeting.icon;

  const w = weatherData?.weather;
  const badge = weatherData?.badge;

  const userRoleTitle =
    user?.nickname ||
    (user?.role === "father"
      ? "准爸爸"
      : user?.role === "grandma"
      ? "长辈"
      : user?.role === "caregiver"
      ? "照料者"
      : "准妈妈");

  const tipHeader = useMemo(() => {
    if (targetStageKey === "pregnancy") return "今日孕期科学锦囊";
    if (targetStageKey === "newborn") return "今日新生儿关怀锦囊";
    if (targetStageKey === "infant") return "今日婴儿期育儿锦囊";
    if (targetStageKey === "toddler") return "今日幼儿期成长锦囊";
    return "今日萌芽温暖锦囊";
  }, [targetStageKey]);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-500 via-rose-500 to-amber-500 p-5 sm:p-6 text-white shadow-xl">
      {/* 装饰背景光斑 */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-amber-300/15 blur-xl" />

      {/* 主体内容网格：宽屏采用 3 栏响应式布局，中间填充专属关怀锦囊，消除留白 */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* 左侧：问候、阶段身份、时光走秒与传统历法 (占 5 列) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
          {/* 上层：问候语 + 阶段徽章胶囊 */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-sm sm:text-base font-semibold opacity-95">
                <GIcon className="h-4 w-4" />
                <span>
                  {greeting.text}，{userRoleTitle}
                </span>
              </div>

              {onEditStage && (
                <button
                  type="button"
                  onClick={onEditStage}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md px-3 py-1 text-xs font-semibold text-white transition cursor-pointer shadow-xs active:scale-95"
                  title="点击修改宝宝状态或预产期"
                >
                  <Sprout className="h-3.5 w-3.5 text-emerald-200" />
                  <span>{stage?.label || "设置宝宝状态"}</span>
                  <Edit3 className="h-2.5 w-2.5 opacity-80" />
                </button>
              )}
            </div>

            {/* 中层阶段说明提示 */}
            <p className="mt-1 text-xs sm:text-sm text-white/90 font-medium">
              {stage?.period ||
                stage?.trimester ||
                "从第一次胎动到第一次背书包，我们陪您每一步"}
            </p>
          </div>

          {/* 下层：走秒时钟与农历节气徽章 */}
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <div className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-white tabular-nums drop-shadow-sm">
                {timeStr}
              </div>
              <div className="text-xs sm:text-sm font-medium opacity-90">{dateStr}</div>
            </div>

            {lunarStr && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs opacity-90">
                <span className="font-medium">{lunarStr}</span>
                {term && (
                  <span className="rounded-full bg-emerald-600/90 px-2 py-0.2 text-[10px] text-white font-semibold">
                    {term}
                  </span>
                )}
                {festivals.map((f, i) => (
                  <span key={i} className="rounded-full bg-rose-700/90 px-2 py-0.2 text-[10px] text-white font-semibold">
                    {f}
                  </span>
                ))}
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.2 text-[10px] font-bold text-white ${
                      badge.holiday ? "bg-red-600" : "bg-gray-600"
                    }`}
                    title={badge.name}
                  >
                    {badge.holiday ? "休" : "班"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 中间：今日关怀小锦囊 · 毛玻璃质感卡片 (占 4 列) */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 p-4 shadow-sm hover:bg-white/20 transition group min-h-[140px]">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/15">
            <div className="flex items-center gap-1.5 font-semibold text-white/95">
              <Sparkles className="h-4 w-4 text-amber-200 animate-pulse" />
              <span>{tipHeader}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleNextTip}
                className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 px-2.5 py-0.5 text-[11px] font-medium text-white transition cursor-pointer"
                title="点击切换下一条关怀贴士"
              >
                <RefreshCw className={`h-3 w-3 ${isRotating ? "animate-spin" : "group-hover:rotate-45 transition-transform"}`} />
                <span>换一条</span>
              </button>
              {user?.is_staff && (
                <button
                  type="button"
                  onClick={() => navigate("/admin/daily-tips")}
                  className="rounded-full bg-white/15 hover:bg-white/30 p-1 text-white/90 hover:text-white transition cursor-pointer"
                  title="管理员配置关怀小锦囊"
                >
                  <Settings className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="my-2.5 text-xs sm:text-[13px] leading-relaxed text-white/95 line-clamp-3 font-normal">
            {currentTip.tip}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] text-white/80">
            <span className="rounded-full bg-white/20 px-2 py-0.5 font-medium text-[10px]">
              {currentTip.tag}
            </span>
            <span className="text-[10px] opacity-75 hidden sm:inline">科学育儿伴成长</span>
          </div>
        </div>

        {/* 右侧：实况天气卡片 (占 3 列) */}
        <div className="lg:col-span-3 flex flex-col justify-center">
          {isLocationSyncing ? (
            <div
              className="group rounded-2xl bg-white/15 backdrop-blur-md p-4 text-center border border-white/20 shadow-md h-full flex flex-col justify-center items-center gap-2 min-h-[140px] animate-pulse"
              title="正在获取最新设置定位地点的天气情况"
            >
              <div className="relative flex items-center justify-center my-0.5">
                <RefreshCw className="h-6 w-6 text-white animate-spin" />
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-300 animate-ping" />
                <span>正在同步定位天气…</span>
              </div>
              <div className="text-[11px] text-white/95 font-medium line-clamp-1 max-w-[170px]" title={syncTargetCity}>
                获取「{syncTargetCity || "新定位地点"}」气象中
              </div>
              <div className="text-[10px] text-white/70">
                定位已更新 · 自动校准中
              </div>
            </div>
          ) : isLoadingWeather && !w ? (
            <div
              className="group rounded-2xl bg-white/15 backdrop-blur-md p-4 text-center border border-white/20 shadow-md h-full flex flex-col justify-center items-center gap-2 min-h-[140px]"
              title="气象数据正在获取中"
            >
              <div className="relative flex items-center justify-center my-0.5">
                <RefreshCw className="h-6 w-6 text-white/90 animate-spin" />
              </div>
              <div className="text-xs font-semibold text-white">气象数据加载中…</div>
              <div className="text-[10px] text-white/75">正在获取今日实况预报</div>
            </div>
          ) : w ? (
            <div
              onClick={() => {
                if (hasWeatherPerm) {
                  navigate("/weather");
                } else {
                  showToast(weatherData?.notice || "当前展示管理员配置天气，如需独立查询请联系管理员开通权限");
                }
              }}
              className="group rounded-2xl bg-white/15 backdrop-blur-md hover:bg-white/25 active:scale-98 p-4 text-right transition cursor-pointer border border-white/20 shadow-md h-full flex flex-col justify-between min-h-[140px]"
              title={hasWeatherPerm ? "点击查看 15 天预报与万年历" : weatherData?.notice || "当前展示管理员配置天气"}
            >
              <div className="flex items-center justify-end gap-1.5 text-xs opacity-90">
                <span className="font-medium">{weatherData?.city || "成都"}</span>
                {weatherData?.source === "user" ? (
                  <span className="rounded-full bg-white/25 px-1.5 py-0.2 text-[10px] font-medium">我的城市</span>
                ) : weatherData?.source === "admin" ? (
                  <span className="rounded-full bg-amber-400/30 px-1.5 py-0.2 text-[10px] font-medium text-amber-100" title={weatherData?.notice}>管理员配置</span>
                ) : null}
              </div>

              <div className="my-1 flex items-baseline justify-end gap-2">
                <span className="font-mono text-3xl sm:text-4xl font-extrabold tabular-nums drop-shadow-sm">
                  {w.temp !== null ? Math.round(w.temp) : "--"}
                </span>
                <span className="text-sm font-medium opacity-90">°C</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium ml-1">
                  {w.desc?.includes("雨") ? (
                    <CloudRain className="h-4 w-4" />
                  ) : w.desc?.includes("云") || w.desc?.includes("阴") ? (
                    <CloudSun className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                  <span>{w.desc || "晴"}</span>
                </span>
              </div>

              <div>
                {w.today_max !== null && w.today_min !== null && (
                  <div className="text-[11px] opacity-90 flex items-center justify-end gap-1 font-mono">
                    <span>今 {Math.round(w.today_max)}°/{Math.round(w.today_min)}°</span>
                    {w.tomorrow_max !== null && w.tomorrow_min !== null && (
                      <span>· 明 {Math.round(w.tomorrow_max)}°/{Math.round(w.tomorrow_min)}°</span>
                    )}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-white/75 group-hover:text-white transition flex items-center justify-end gap-1">
                  <span>{hasWeatherPerm ? "点击进入气象万年历" : "系统共享天气 · 点击查看说明"}</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                if (hasWeatherPerm) {
                  navigate("/weather");
                } else {
                  showToast("您暂无天气与万年历模块访问权限");
                }
              }}
              className="group rounded-2xl bg-white/15 backdrop-blur-md hover:bg-white/25 active:scale-98 p-4 text-center transition cursor-pointer border border-white/20 shadow-md h-full flex flex-col justify-center items-center gap-1.5 min-h-[140px]"
              title={hasWeatherPerm ? "点击进入气象万年历" : "暂无权限"}
            >
              <Calendar className="h-6 w-6 text-white/90" />
              <div className="text-xs font-semibold">气象万年历</div>
              <div className="text-[10px] text-white/75">{hasWeatherPerm ? "点击查看吉日与节气预报 →" : "今日吉日与节气预报"}</div>
            </div>
          )}
        </div>
      </div>

      {/* 底部精简特色标签栏 */}
      <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 backdrop-blur-xs px-2.5 py-0.5 text-[11px]">全周期科学指导</span>
          <span className="rounded-full bg-white/15 backdrop-blur-xs px-2.5 py-0.5 text-[11px]">智能对比</span>
          <span className="rounded-full bg-white/15 backdrop-blur-xs px-2.5 py-0.5 text-[11px]">动态清单</span>
          <span className="rounded-full bg-white/15 backdrop-blur-xs px-2.5 py-0.5 text-[11px]">AI 7×24</span>
        </div>
        <div className="text-[11px] text-white/80 hidden sm:block">
          从第一次胎动到第一次背书包 · 全程关怀
        </div>
      </div>

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900/90 backdrop-blur-md px-4 py-2.5 text-xs text-white shadow-2xl border border-white/20 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Info className="h-4 w-4 text-amber-300" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}