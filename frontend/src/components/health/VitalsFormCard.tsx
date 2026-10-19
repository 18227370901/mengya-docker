import { useState, useEffect, useMemo } from "react";
import {
  HeartPulse,
  Droplet,
  Activity,
  Calendar,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Check,
  Scale,
  CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { computeGestation, type GestationAnchor } from "@/utils/gestation";
import type { BabyProfile } from "@/types";
import type { PregnancyStage, VitalsAnalysisInput, SameDayConflictPayload } from "@/types/health";

/** 基于宝宝生日自动推算产后月龄 */
function autoPostpartumMonths(babyBirthday: string, recordDate: string): number | null {
  const birth = new Date(babyBirthday);
  const rec = new Date(recordDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(rec.getTime())) return null;
  return Math.max(0, Math.floor((rec.getTime() - birth.getTime()) / (30.44 * 86400000)));
}

interface VitalsFormCardProps {
  onSubmit: (input: VitalsAnalysisInput) => Promise<void>;
  loading: boolean;
  stageType?: PregnancyStage;
  onStageTypeChange?: (st: PregnancyStage) => void;
  motherId?: number | null;
  currentGestationalWeek?: number | null;
  currentGestationalDays?: number | null;
  conflictInfo?: SameDayConflictPayload | null;
  onResolveConflict?: (overwrite: boolean) => void;
  babies?: BabyProfile[];
  gestationAnchor?: GestationAnchor | null;
}

const COMMON_SYMPTOMS = [
  "无明显不适",
  "头晕乏力",
  "下肢轻微浮肿",
  "视物模糊/眼花",
  "胸闷心慌",
  "口渴多尿",
  "睡眠欠佳",
  "情绪焦虑",
];

const GLUCOSE_SCENES = [
  { key: "fasting", label: "空腹 (清晨未进食)", target: "孕期 3.1~5.1 mmol/L" },
  { key: "postprandial_1h", label: "餐后 1 小时 (第一口饭算起)", target: "孕期 ≤ 7.8 mmol/L" },
  { key: "postprandial_2h", label: "餐后 2 小时 (第一口饭算起)", target: "孕期 4.4~6.7 mmol/L" },
  { key: "bedtime", label: "睡前血糖", target: "孕期 4.4~6.7 mmol/L" },
  { key: "random", label: "随机血糖 (非定时)", target: "孕期 4.4~6.7 mmol/L" },
];

export default function VitalsFormCard({
  onSubmit,
  loading,
  stageType = "pregnancy",
  onStageTypeChange,
  motherId,
  currentGestationalWeek,
  currentGestationalDays,
  conflictInfo,
  onResolveConflict,
  babies,
  gestationAnchor,
}: VitalsFormCardProps) {
  const { user } = useAuthStore();
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [recordDate, setRecordDate] = useState<string>(todayStr);
  const [internalStage, setInternalStage] = useState<PregnancyStage>(stageType);
  const [week, setWeek] = useState<string>(() => (currentGestationalWeek ? String(currentGestationalWeek) : ""));
  const [days, setDays] = useState<string>(() => (currentGestationalDays != null ? String(currentGestationalDays) : "0"));
  const [postpartumMonths, setPostpartumMonths] = useState<string>("1");

  const [weekTouched, setWeekTouched] = useState(false);
  const [daysTouched, setDaysTouched] = useState(false);
  const [postpartumTouched, setPostpartumTouched] = useState(false);

  // 档案与宝宝基准对齐
  const pregnantBabies = useMemo(() => {
    return babies?.filter((b) => b.is_born === false || (b.birthday && new Date(b.birthday) > new Date())) || [];
  }, [babies]);

  const [selectedPregnantBabyId, setSelectedPregnantBabyId] = useState<number | null>(null);

  const activePregnantBaby = useMemo(() => {
    if (selectedPregnantBabyId != null) {
      const found = pregnantBabies.find((b) => b.id === selectedPregnantBabyId);
      if (found) return found;
    }
    return (
      pregnantBabies.find((b) => b.is_primary) ||
      pregnantBabies[0] ||
      (babies && babies.length > 0 ? babies.find((b) => b.is_born === false) || null : null)
    );
  }, [pregnantBabies, selectedPregnantBabyId, babies]);

  const pregnantBabyName =
    activePregnantBaby?.name ||
    (babies && babies.length > 0 ? babies[0].name : user?.nickname ? `${user.nickname}的宝宝` : "宝宝");

  const postpartumBabies = useMemo(() => {
    return (
      babies?.filter(
        (b) => b.is_born === true || (b.birthday && new Date(b.birthday) <= new Date())
      ) || []
    );
  }, [babies]);

  const [selectedPostpartumBabyId, setSelectedPostpartumBabyId] = useState<number | null>(null);

  const activePostpartumBaby = useMemo(() => {
    if (selectedPostpartumBabyId != null) {
      const found = postpartumBabies.find((b) => b.id === selectedPostpartumBabyId);
      if (found) return found;
    }
    return postpartumBabies.find((b) => b.is_primary) || postpartumBabies[0] || null;
  }, [postpartumBabies, selectedPostpartumBabyId]);

  const postpartumBabyName = activePostpartumBaby?.name || (user?.nickname ? `${user.nickname}的宝宝` : "宝宝");
  const effectiveBabyBirthday = activePostpartumBaby?.birthday || user?.baby_birthday;

  const effectiveDueDate = activePregnantBaby?.birthday || user?.due_date;
  const hasDueDate = Boolean(effectiveDueDate);
  const hasBabyBirthday = Boolean(effectiveBabyBirthday);
  const hasAutoBasis = Boolean(effectiveDueDate || gestationAnchor);

  // 动态孕周推算（随测量日期 recordDate 实时更新）
  const gestation = useMemo(() => {
    if (internalStage !== "pregnancy") return null;
    if (effectiveDueDate) return computeGestation({ date: effectiveDueDate, week: 40 }, recordDate);
    if (gestationAnchor) return computeGestation(gestationAnchor, recordDate);
    if (currentGestationalWeek) return { week: currentGestationalWeek, days: currentGestationalDays || 0 };
    return null;
  }, [internalStage, effectiveDueDate, gestationAnchor, recordDate, currentGestationalWeek, currentGestationalDays]);

  const autoPostpartum = useMemo(() => {
    if (internalStage !== "postpartum" || !effectiveBabyBirthday) return null;
    return autoPostpartumMonths(effectiveBabyBirthday, recordDate);
  }, [internalStage, effectiveBabyBirthday, recordDate]);

  useEffect(() => {
    setWeekTouched(false);
    setDaysTouched(false);
    setPostpartumTouched(false);
  }, [recordDate, internalStage]);

  const weekDisplay = useMemo(() => {
    if (weekTouched) return week;
    if (gestation) return String(gestation.week);
    return week;
  }, [weekTouched, week, gestation]);

  const daysDisplay = useMemo(() => {
    if (daysTouched) return days;
    if (gestation) return String(gestation.days);
    return days || "0";
  }, [daysTouched, days, gestation]);

  const postpartumMonthsDisplay = useMemo(() => {
    if (postpartumTouched) return postpartumMonths;
    if (autoPostpartum != null) return String(autoPostpartum);
    return postpartumMonths || "1";
  }, [postpartumTouched, postpartumMonths, autoPostpartum]);

  // 血压字段
  const [systolic, setSystolic] = useState<string>("");
  const [diastolic, setDiastolic] = useState<string>("");
  const [pulse, setPulse] = useState<string>("");

  // 血糖字段
  const [bloodSugar, setBloodSugar] = useState<string>("");
  const [glucoseType, setGlucoseType] = useState<string>("fasting");

  // 选填伴随记录（折叠）
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState<string>("");
  const [requestAi, setRequestAi] = useState<boolean>(true);
  const [clientError, setClientError] = useState<string>("");

  useEffect(() => {
    if (stageType !== internalStage) {
      setInternalStage(stageType);
    }
  }, [stageType]);

  useEffect(() => {
    if (currentGestationalWeek && !week) {
      setWeek(String(currentGestationalWeek));
    }
    if (currentGestationalDays != null && (!days || days === "0")) {
      setDays(String(currentGestationalDays));
    }
  }, [currentGestationalWeek, currentGestationalDays]);

  const handleStageChange = (newSt: PregnancyStage) => {
    setInternalStage(newSt);
    onStageTypeChange?.(newSt);
  };

  const toggleSymptom = (sym: string) => {
    setSelectedSymptoms((prev) => {
      if (sym === "无明显不适") {
        return prev.includes("无明显不适") ? [] : ["无明显不适"];
      }
      const filtered = prev.filter((s) => s !== "无明显不适");
      if (filtered.includes(sym)) {
        return filtered.filter((s) => s !== sym);
      }
      return [...filtered, sym];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError("");

    const sbp = systolic ? parseFloat(systolic) : undefined;
    const dbp = diastolic ? parseFloat(diastolic) : undefined;
    const p = pulse ? parseFloat(pulse) : undefined;
    const glu = bloodSugar ? parseFloat(bloodSugar) : undefined;
    const w = weight ? parseFloat(weight) : undefined;
    const h = height ? parseFloat(height) : undefined;

    // 校验：至少有一项测量数据
    const hasBp = sbp !== undefined && dbp !== undefined;
    const hasGlu = glu !== undefined;
    const hasW = w !== undefined;

    if (!hasBp && !hasGlu && !hasW) {
      setClientError("请至少录入血压（高压+低压）、血糖或体重中的一项有效数据");
      return;
    }

    if ((sbp !== undefined && dbp === undefined) || (sbp === undefined && dbp !== undefined)) {
      setClientError("录入血压时，收缩压（高压）与舒张压（低压）必须同时填写");
      return;
    }

    if (sbp !== undefined && dbp !== undefined && sbp <= dbp) {
      setClientError("收缩压（高压）数值必须大于舒张压（低压）");
      return;
    }

    if (internalStage === "pregnancy" && !weekDisplay) {
      setClientError("请填写当前孕周");
      return;
    }

    const wk = parseInt(weekDisplay, 10);
    const dy = parseInt(daysDisplay, 10);
    const pm = parseInt(postpartumMonthsDisplay, 10);

    const payload: VitalsAnalysisInput = {
      record_date: recordDate,
      stage_type: internalStage,
      mother_id: motherId || undefined,
      gestational_week: internalStage === "pregnancy" && !Number.isNaN(wk) ? wk : undefined,
      gestational_days: internalStage === "pregnancy" && !Number.isNaN(dy) ? dy : undefined,
      postpartum_months: internalStage === "postpartum" && !Number.isNaN(pm) ? pm : undefined,
      systolic_bp: sbp,
      diastolic_bp: dbp,
      pulse: p,
      blood_sugar: glu,
      glucose_type: glu ? (glucoseType as any) : undefined,
      current_weight_kg: w,
      height_cm: h,
      symptoms: selectedSymptoms,
      note: note.trim() || undefined,
      request_ai: requestAi,
    };

    try {
      await onSubmit(payload);
      // 清理表单部分可复选输入
      setSystolic("");
      setDiastolic("");
      setPulse("");
      setBloodSugar("");
      setNote("");
      setSelectedSymptoms([]);
    } catch {
      // 错误由外层捕获处理
    }
  };

  return (
    <div className="card border-rose-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-50 pb-4 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-rose-200 shadow-md">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              妈妈生命体征快速录入与智能评估
            </h3>
            <p className="text-xs text-gray-400">
              支持单录血压、单录血糖、单录体重或组合打卡 · 系统自动智能判读与 AI 解读
            </p>
          </div>
        </div>

        {/* 阶段选择标签 */}
        <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-700/60">
          <button
            type="button"
            onClick={() => handleStageChange("pregnancy")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              internalStage === "pregnancy"
                ? "bg-white text-rose-600 shadow-xs dark:bg-gray-800 dark:text-rose-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            怀孕中
          </button>
          <button
            type="button"
            onClick={() => handleStageChange("postpartum")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              internalStage === "postpartum"
                ? "bg-white text-rose-600 shadow-xs dark:bg-gray-800 dark:text-rose-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            产后恢复
          </button>
          <button
            type="button"
            onClick={() => handleStageChange("general")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              internalStage === "general"
                ? "bg-white text-rose-600 shadow-xs dark:bg-gray-800 dark:text-rose-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            备孕/日常
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* 日期与阶段行 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              测量日期
            </label>
            <input
              type="date"
              value={recordDate}
              max={todayStr}
              onChange={(e) => setRecordDate(e.target.value)}
              className="input text-xs"
              required
            />
          </div>

          {internalStage === "pregnancy" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  当前孕周 (周) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="42"
                  value={weekDisplay}
                  onChange={(e) => {
                    setWeek(e.target.value);
                    setWeekTouched(true);
                  }}
                  placeholder="如 24"
                  className="input text-xs"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  额外孕天 (天，0~6)
                </label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={daysDisplay}
                  onChange={(e) => {
                    setDays(e.target.value);
                    setDaysTouched(true);
                  }}
                  placeholder="0"
                  className="input text-xs"
                />
              </div>
            </>
          )}

          {internalStage === "postpartum" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                产后月数 (月)
              </label>
              <input
                type="number"
                min="0"
                max="36"
                value={postpartumMonthsDisplay}
                onChange={(e) => {
                  setPostpartumMonths(e.target.value);
                  setPostpartumTouched(true);
                }}
                placeholder="1"
                className="input text-xs"
              />
            </div>
          )}
        </div>

        {/* 档案推算基准来源说明与多宝快速切换 */}
        {internalStage === "pregnancy" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-100/70 bg-rose-50/40 px-3 py-2 text-[11px] text-gray-600 dark:border-rose-950/40 dark:bg-rose-950/20 dark:text-gray-300">
            <div className="flex items-center gap-1.5">
              {hasDueDate ? (
                <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  根据档案「{pregnantBabyName}」预产期 ({effectiveDueDate}) 随日期动态推算
                </span>
              ) : gestationAnchor ? (
                <span className="flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  根据首次打卡孕周锚点随日期动态推算
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  未设置预产期，请手动填写本次测量的孕周
                </span>
              )}
            </div>
            {pregnantBabies.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-gray-400">推算基准:</span>
                <select
                  value={selectedPregnantBabyId ?? activePregnantBaby?.id ?? ""}
                  onChange={(e) => setSelectedPregnantBabyId(Number(e.target.value))}
                  className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 shadow-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {pregnantBabies.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (预产期: {b.birthday || "未设置"})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {internalStage === "postpartum" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-100/70 bg-rose-50/40 px-3 py-2 text-[11px] text-gray-600 dark:border-rose-950/40 dark:bg-rose-950/20 dark:text-gray-300">
            <div className="flex items-center gap-1.5">
              {hasBabyBirthday ? (
                <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  根据宝宝「{postpartumBabyName}」出生日期 ({effectiveBabyBirthday}) 随日期动态推算产后月数
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  未绑定宝宝出生日期，请手动填写产后月数
                </span>
              )}
            </div>
            {postpartumBabies.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-gray-400">推算基准:</span>
                <select
                  value={selectedPostpartumBabyId ?? activePostpartumBaby?.id ?? ""}
                  onChange={(e) => setSelectedPostpartumBabyId(Number(e.target.value))}
                  className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 shadow-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {postpartumBabies.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (生日: {b.birthday})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* 核心录入双通道：血压区 + 血糖区 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 血压录入卡 */}
          <div className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4 transition-all hover:bg-rose-50/50 dark:border-rose-950/40 dark:bg-rose-950/10">
            <div className="flex items-center justify-between border-b border-rose-100/60 pb-2.5 dark:border-gray-800">
              <span className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300">
                <HeartPulse className="h-4 w-4 text-rose-500" />
                血压测量 (mmHg · 选填)
              </span>
              <span className="text-[11px] text-gray-400">标准参考：90~119 / 60~79</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">
                  收缩压 (高压)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="50"
                    max="260"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    placeholder="如 118"
                    className="input text-xs font-semibold pr-1"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">
                  舒张压 (低压)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="30"
                    max="180"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    placeholder="如 76"
                    className="input text-xs font-semibold pr-1"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">
                  脉搏 (次/分)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="30"
                    max="220"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    placeholder="如 75"
                    className="input text-xs pr-1"
                  />
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              提示：高压≥140 或 低压≥90 为妊娠高血压预警；≥160/110 为高危急症。
            </p>
          </div>

          {/* 血糖录入卡 */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4 transition-all hover:bg-amber-50/50 dark:border-amber-950/40 dark:bg-amber-950/10">
            <div className="flex items-center justify-between border-b border-amber-100/60 pb-2.5 dark:border-gray-800">
              <span className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                <Droplet className="h-4 w-4 text-amber-500" />
                血糖监测 (mmol/L · 选填)
              </span>
              <span className="text-[11px] text-gray-400">
                {GLUCOSE_SCENES.find((s) => s.key === glucoseType)?.target || "孕期空腹≤5.1"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">
                  血糖数值 (mmol/L)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max="35"
                  value={bloodSugar}
                  onChange={(e) => setBloodSugar(e.target.value)}
                  placeholder="如 5.20"
                  className="input text-xs font-semibold"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">
                  测定场景
                </label>
                <select
                  value={glucoseType}
                  onChange={(e) => setGlucoseType(e.target.value)}
                  className="input text-xs"
                >
                  {GLUCOSE_SCENES.map((scene) => (
                    <option key={scene.key} value={scene.key}>
                      {scene.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              提示：孕期 GDM 空腹需≤5.1 mmol/L，餐后2h需≤6.7 mmol/L。
            </p>
          </div>
        </div>

        {/* 选填折叠区：体重/身高（BMI联动）、伴随症状、备注 */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5 transition-all dark:border-gray-800 dark:bg-gray-800/40">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300"
          >
            <span className="flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-gray-400" />
              同时记录体重 / 伴随不适症状 / 备注（选填）
            </span>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <span>{showAdvanced ? "收起选填项" : "展开选填项"}</span>
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
          </button>

          {showAdvanced && (
            <div className="mt-3.5 space-y-3.5 border-t border-gray-200/60 pt-3 dark:border-gray-700">
              {/* 体重与身高 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-500">
                    体重 (kg，若录入将同步计算 BMI)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="30"
                    max="220"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="如 58.5"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-500">
                    身高 (cm，初次称重必填或自动继承)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="100"
                    max="230"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="如 165.0"
                    className="input text-xs"
                  />
                </div>
              </div>

              {/* 症状勾选 */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-gray-500">
                  伴随不适症状（点击选择，可帮助 AI 更精准识别潜在急症）
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_SYMPTOMS.map((sym) => {
                    const isSelected = selectedSymptoms.includes(sym);
                    const isDangerSym = ["视物模糊/眼花", "胸闷心慌"].includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleSymptom(sym)}
                        className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs transition-all ${
                          isSelected
                            ? isDangerSym
                              ? "bg-rose-100 font-bold text-rose-800 ring-1 ring-rose-400 dark:bg-rose-950 dark:text-rose-200"
                              : "bg-rose-50 font-bold text-rose-700 ring-1 ring-rose-300 dark:bg-rose-900/60 dark:text-rose-200"
                            : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                        {sym}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">
                  备忘笔记 / 用药饮食备注
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：晨起静息测量 / 餐后散步 20 分钟后测定"
                  className="input text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* 字段灵活性提示条 */}
        <div className="flex items-start gap-2 rounded-xl bg-sky-50/70 p-2.5 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
          <Info className="h-4 w-4 shrink-0 text-sky-500 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">字段选填说明：</span>
            本次记录无需填满所有项。单录血压、单录血糖或单录体重均可！
            系统在生成评估时会清晰列明已录入项与未录入项，确保记录透明清晰。
          </div>
        </div>

        {/* 客户端错误提示 */}
        {clientError && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{clientError}</span>
          </div>
        )}

        {/* 底部操作行 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={requestAi}
              onChange={(e) => setRequestAi(e.target.checked)}
              className="checkbox-primary h-4 w-4 rounded"
            />
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              同步生成 AI 专家深度健康解读与生活调理处方
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold shadow-md shadow-rose-200 transition-all hover:shadow-lg disabled:opacity-60 dark:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在评估并归档...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                一键分析评估并保存
              </>
            )}
          </button>
        </div>
      </form>

      {/* 同日冲突覆盖确认弹窗 */}
      {conflictInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
              <h4 className="text-base font-bold">当日已有健康打卡记录</h4>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              检测到您在 <strong>{conflictInfo.existing_date}</strong> 已经存在一条打卡记录。
              选择合并覆盖将保留已有数据（如体重/身高），并将本次录入的血压/血糖指标智能合并更新。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => onResolveConflict?.(false)}
                className="btn btn-secondary text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onResolveConflict?.(true)}
                className="btn btn-primary text-xs font-bold"
              >
                确认合并覆盖
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
