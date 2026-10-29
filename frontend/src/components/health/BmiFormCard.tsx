import React, { useState, useMemo, useEffect, useRef } from "react";
import { Activity, Sparkles, AlertCircle, Calendar, CheckCircle2, HeartPulse, ChevronDown, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { computeGestation, type GestationAnchor } from "@/utils/gestation";
import type { BmiAnalysisInput, PregnancyStage } from "@/types/health";
import type { BabyProfile } from "@/types";

const getLocalDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getPastLocalDateStr = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return getLocalDateStr(d);
};

const formatDateFriendlyCN = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return dateStr;
  const [y, m, d] = parts;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  let rel = "";
  if (diffDays === 0) rel = " (今天)";
  else if (diffDays === 1) rel = " (昨天)";
  else if (diffDays === 2) rel = " (前天)";
  else if (diffDays > 2) rel = ` (${diffDays}天前)`;
  else if (diffDays < 0) rel = " (未来)";
  return `${y}年${m}月${d}日${rel}`;
};

interface BmiFormCardProps {
  onSubmit: (data: BmiAnalysisInput) => void;
  loading: boolean;
  /** v1.56：最近一次打卡基线预填（身高/孕前体重连续预填，减少重复录入） */
  initialHeight?: number | null;
  initialPreWeight?: number | null;
  /** v1.58：孕周锚点（首次孕期打卡 日期+孕周；无预产期时自动推算 孕x周x天） */
  gestationAnchor?: GestationAnchor | null;
  stageType?: PregnancyStage;
  onStageTypeChange?: (st: PregnancyStage) => void;
  stageFilter?: "all" | PregnancyStage;
  onStageFilterChange?: (st: "all" | PregnancyStage) => void;
  babies?: BabyProfile[];
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
const MEDICAL_HISTORY_OPTIONS = [
  { key: "gdm", label: "妊娠糖尿病 (GDM)" },
  { key: "hypertension", label: "妊娠高血压 / 浮肿" },
  { key: "emesis", label: "剧烈早孕呕吐" },
  { key: "anemia", label: "孕期贫血 / 缺铁" },
  { key: "thyroid", label: "甲状腺功能异常" },
];

/** 基于宝宝生日自动推算产后月龄 */
function autoPostpartumMonths(babyBirthday: string, recordDate: string): number | null {
  const birth = new Date(babyBirthday);
  const rec = new Date(recordDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(rec.getTime())) return null;
  return Math.max(0, Math.floor((rec.getTime() - birth.getTime()) / (30.44 * 86400000)));
}

export default function BmiFormCard({ onSubmit, loading, initialHeight, initialPreWeight, gestationAnchor, stageType: externalStageType, onStageTypeChange, stageFilter = "all", onStageFilterChange, babies }: BmiFormCardProps) {
  const { user } = useAuthStore();
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

  const pregnantBaby = activePregnantBaby;
  const pregnantBabyName =
    activePregnantBaby?.name ||
    (babies && babies.length > 0 ? babies[0].name : user?.nickname ? `${user.nickname}的宝宝` : "待产宝宝");

  const bornBabies = useMemo(() => {
    return babies?.filter((b) => b.is_born !== false && (!b.birthday || new Date(b.birthday) <= new Date())) || [];
  }, [babies]);

  const [selectedPostpartumBabyId, setSelectedPostpartumBabyId] = useState<number | null>(null);

  const activePostpartumBaby = useMemo(() => {
    if (selectedPostpartumBabyId != null) {
      const found = bornBabies.find((b) => b.id === selectedPostpartumBabyId);
      if (found) return found;
    }
    return bornBabies.find((b) => b.is_primary) || bornBabies[0] || (babies && babies.length > 0 ? babies[0] : null);
  }, [bornBabies, selectedPostpartumBabyId, babies]);

  const postpartumBabyName = activePostpartumBaby?.name || (user?.nickname ? `${user.nickname}的宝宝` : "宝宝");
  const effectiveBabyBirthday = activePostpartumBaby?.birthday || user?.baby_birthday;

  const effectiveDueDate = activePregnantBaby?.birthday || user?.due_date;
  const hasDueDate = Boolean(effectiveDueDate);
  const hasBabyBirthday = Boolean(effectiveBabyBirthday);
  const hasAutoBasis = Boolean(effectiveDueDate || gestationAnchor);

  const todayStr = useMemo(() => getLocalDateStr(), []);
  const yesterdayStr = useMemo(() => getPastLocalDateStr(1), []);
  const beforeYesterdayStr = useMemo(() => getPastLocalDateStr(2), []);

  const [recordDate, setRecordDate] = useState<string>(() => getLocalDateStr());
  const [showDatePickerDialog, setShowDatePickerDialog] = useState(false);
  const [tempPickerDate, setTempPickerDate] = useState<string>(() => getLocalDateStr());

  const quickDateChips = useMemo(
    () => [
      { label: "今天", date: todayStr },
      { label: "昨天", date: yesterdayStr },
      { label: "前天", date: beforeYesterdayStr },
    ],
    [todayStr, yesterdayStr, beforeYesterdayStr]
  );

  const openDatePickerDialog = () => {
    setTempPickerDate(recordDate || todayStr);
    setShowDatePickerDialog(true);
  };

  const confirmPickerDate = () => {
    if (tempPickerDate && tempPickerDate <= todayStr) {
      setRecordDate(tempPickerDate);
      setShowDatePickerDialog(false);
    }
  };

  const cancelPickerDate = () => {
    setTempPickerDate(recordDate || todayStr);
    setShowDatePickerDialog(false);
  };
  // v1.56：基线连续预填——最近一次打卡的身高/孕前体重自动带入（仍可修改）
  const [height, setHeight] = useState<string>(initialHeight ? String(initialHeight) : "");
  const [preWeight, setPreWeight] = useState<string>(initialPreWeight ? String(initialPreWeight) : "");

  const lastInitialHeightRef = useRef<number | null>(initialHeight ?? null);
  const lastInitialPreWeightRef = useRef<number | null>(initialPreWeight ?? null);

  useEffect(() => {
    if (initialHeight && (initialHeight !== lastInitialHeightRef.current || !height)) {
      lastInitialHeightRef.current = initialHeight;
      setHeight(String(initialHeight));
    }
  }, [initialHeight]);

  useEffect(() => {
    if (initialPreWeight && (initialPreWeight !== lastInitialPreWeightRef.current || !preWeight)) {
      lastInitialPreWeightRef.current = initialPreWeight;
      setPreWeight(String(initialPreWeight));
    }
  }, [initialPreWeight]);

  const [curWeight, setCurWeight] = useState<string>("");
  const [waistCircumference, setWaistCircumference] = useState<string>("");
  // v1.55/1.56 档案联动：孕期用户默认孕期；已出生宝宝档案默认产后；其余默认非孕期
  const [stageType, setInternalStageType] = useState<PregnancyStage>(() =>
    externalStageType ||
    (user && !user.is_pregnant && user.baby_birthday
      ? "postpartum"
      : user && !user.is_pregnant && !user.baby_birthday
      ? "general"
      : "pregnancy")
  );

  useEffect(() => {
    if (externalStageType && externalStageType !== stageType) {
      setInternalStageType(externalStageType);
    }
  }, [externalStageType]);

  useEffect(() => {
    if (stageFilter && stageFilter !== "all" && stageFilter !== stageType) {
      setInternalStageType(stageFilter);
      onStageTypeChange?.(stageFilter);
    }
  }, [stageFilter]);

  const setStageType = (newStage: PregnancyStage) => {
    setInternalStageType(newStage);
    onStageTypeChange?.(newStage);
  };
  const [gestationalWeek, setGestationalWeek] = useState<string>("");
  const [gestationalDays, setGestationalDays] = useState<string>("");
  // v1.58：touched 标记——用户手动改过周/天后尊重用户值；日期/阶段变化时重置回自动推算
  const [weekTouched, setWeekTouched] = useState(false);
  const [daysTouched, setDaysTouched] = useState(false);
  const [postpartumMonths, setPostpartumMonths] = useState<string>("");
  const [isTwins, setIsTwins] = useState<boolean>(false);
  const [medicalHistory, setMedicalHistory] = useState<string[]>([]);
  // 选填同时记录血压血糖折叠卡
  const [showVitalsSection, setShowVitalsSection] = useState(false);
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [bloodSugar, setBloodSugar] = useState("");
  const [glucoseType, setGlucoseType] = useState("fasting");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // v1.58 孕周双基准自动推算（与后端一致）：预产期 280 天模型 > 首次打卡锚点线性外推
  const gestation = useMemo(() => {
    if (stageType !== "pregnancy") return null;
    if (effectiveDueDate) return computeGestation({ date: effectiveDueDate, week: 40 }, recordDate);
    if (gestationAnchor) return computeGestation(gestationAnchor, recordDate);
    return null;
  }, [stageType, effectiveDueDate, gestationAnchor, recordDate]);

  // 日期/阶段变化时解除手动编辑态 → 回到自动推算展示（v1.58 派生显示值方案，无 effect 填充竞态）
  useEffect(() => {
    setWeekTouched(false);
    setDaysTouched(false);
  }, [recordDate, stageType]);

  // v1.58：派生显示值——未手动编辑时直接展示推算值（自动填充绝对可靠）；编辑后展示用户值
  const weekDisplay = !weekTouched && gestation ? String(gestation.week) : gestationalWeek;
  const daysDisplay = !daysTouched && gestation ? String(gestation.days) : gestationalDays;

  // v1.58 产后月龄双基准：未手动编辑时直接展示推算值（自动填充可靠）
  const postpartumMonthsDisplay =
    stageType === "postpartum" && effectiveBabyBirthday
      ? String(autoPostpartumMonths(effectiveBabyBirthday, recordDate) ?? 1)
      : postpartumMonths;

  const instantBmi = useMemo(() => {
    const h = parseFloat(height);
    const pw = parseFloat(preWeight);
    if (h > 90 && h < 230 && pw > 30 && pw < 200) {
      const meter = h / 100;
      return +(pw / (meter * meter)).toFixed(2);
    }
    return null;
  }, [height, preWeight]);

  const bmiCategoryLabel = useMemo(() => {
    if (instantBmi === null) return "";
    if (instantBmi < 18.5) return "低体重 (BMI < 18.5)";
    if (instantBmi < 24.0) return "正常体重 (18.5 ~ 23.9)";
    if (instantBmi < 28.0) return "超重 (24.0 ~ 27.9)";
    return "肥胖 (BMI ≥ 28.0)";
  }, [instantBmi]);

  const toggleHistory = (key: string) => {
    setMedicalHistory((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // v1.55：身高与孕前体重支持留空自动继承上次打卡基线（首次打卡后端自动初始化）
    const hNum = height ? parseFloat(height) : NaN;
    const pwNum = preWeight ? parseFloat(preWeight) : NaN;
    const cwNum = parseFloat(curWeight);

    if (!isNaN(hNum) && (hNum < 100 || hNum > 230)) {
      setErrorMsg("请输入合理的身高 (100 ~ 230 cm)");
      return;
    }
    if (!isNaN(pwNum) && (pwNum < 30 || pwNum > 200)) {
      setErrorMsg("请输入合理的孕前体重 (30 ~ 200 kg)");
      return;
    }
    if (isNaN(cwNum) || cwNum < 30 || cwNum > 220) {
      setErrorMsg("请输入合理的当前体重 (30 ~ 220 kg)");
      return;
    }

    const payload: BmiAnalysisInput = {
      record_date: recordDate || undefined,
      current_weight_kg: cwNum,
      stage_type: stageType,
      is_twins: isTwins,
      medical_history: medicalHistory,
      save_record: true,
    };
    if (!isNaN(hNum)) payload.height_cm = hNum;
    if (!isNaN(pwNum)) payload.pre_pregnancy_weight_kg = pwNum;

    if (waistCircumference) {
      const wcNum = parseFloat(waistCircumference);
      if (!isNaN(wcNum) && wcNum >= 30 && wcNum <= 200) {
        payload.waist_circumference_cm = wcNum;
      }
    }

    if (stageType === "pregnancy") {
      // v1.58：周+天双输入——提交显示值（未手动编辑时为推算值，手动编辑后为用户值）
      const gwNum = parseInt(weekDisplay, 10);
      if (isNaN(gwNum) || gwNum < 1 || gwNum > 42) {
        setErrorMsg(
          hasAutoBasis
            ? "孕周自动推算失败，请核对档案预产期或首次打卡记录"
            : "您还未设置预产期，请手动填写当前孕周 (1 ~ 42周)"
        );
        return;
      }
      payload.gestational_week = gwNum;
      const gdNum = parseInt(daysDisplay, 10);
      if (!isNaN(gdNum)) {
        payload.gestational_days = Math.max(0, Math.min(6, gdNum));
      }
    } else if (stageType === "postpartum") {
      // v1.58：产后月龄同样采用显示值（推算优先，可手改）
      const pmNum = parseInt(postpartumMonthsDisplay, 10);
      payload.postpartum_months = isNaN(pmNum) ? 1 : pmNum;
    }
    // v1.56：general 非孕期阶段无需孕周/产后月龄

    // 选填：同时记录血压与血糖体征
    if (systolic && !isNaN(parseInt(systolic, 10))) {
      payload.systolic_bp = parseInt(systolic, 10);
    }
    if (diastolic && !isNaN(parseInt(diastolic, 10))) {
      payload.diastolic_bp = parseInt(diastolic, 10);
    }
    if (pulse && !isNaN(parseInt(pulse, 10))) {
      payload.pulse = parseInt(pulse, 10);
    }
    if (bloodSugar && !isNaN(parseFloat(bloodSugar))) {
      payload.blood_sugar = parseFloat(bloodSugar);
      payload.glucose_type = glucoseType as any;
    }
    if (symptoms.length > 0) {
      payload.symptoms = symptoms;
    }
    if (note && note.trim()) {
      payload.note = note.trim();
    }

    onSubmit(payload);
  };

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 pb-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              深度体重/BMI分析与打卡 (WS/T 801-2022)
            </h3>
            <p className="text-xs text-gray-400">
              完整医学评估入口 · 快速打卡可使用页头「健康打卡」· 身高与孕前体重已自动带入历史值（支持校准修改）
            </p>
          </div>
        </div>
        {instantBmi !== null && (
          <div className="flex items-center gap-2 rounded-xl bg-orange-50/70 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
            <span>孕前 BMI：{instantBmi}</span>
            <span className="rounded-full bg-brand-200/60 px-2 py-0.5 text-[11px] text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
              {bmiCategoryLabel}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 测量日期区域：快捷芯片 + 可视化确认卡片 + 移动端专属确定/取消弹窗 */}
        <div className="rounded-2xl border border-orange-100/80 bg-orange-50/30 p-3.5 dark:border-gray-800 dark:bg-gray-800/40 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200">
              <Calendar className="h-4 w-4 text-brand-500" />
              <span>测量日期 (支持按天补录) <span className="text-rose-500 font-bold">*</span></span>
            </label>

            {/* 快捷日期芯片 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 mr-1 hidden sm:inline">快捷选择:</span>
              {quickDateChips.map((chip) => (
                <button
                  type="button"
                  key={chip.date}
                  onClick={() => {
                    setRecordDate(chip.date);
                    setTempPickerDate(chip.date);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    recordDate === chip.date
                      ? "bg-brand-500 text-white shadow-xs"
                      : "border border-gray-200 bg-white text-gray-600 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* 选定日期卡片与操作按钮 */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-white/90 p-2.5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-gray-700 dark:text-brand-300">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-sm font-bold text-gray-800 dark:text-gray-100">
                    {recordDate}
                  </span>
                  <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-gray-700 dark:text-brand-300">
                    {recordDate === todayStr
                      ? "今日打卡"
                      : recordDate === yesterdayStr
                      ? "昨日补录"
                      : recordDate === beforeYesterdayStr
                      ? "前天补录"
                      : "历史补录"}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {formatDateFriendlyCN(recordDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openDatePickerDialog}
                className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-gray-700"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>选择/修改日期</span>
              </button>
              {/* 桌面端隐藏/备用原生输入框，保持无感双向同步 */}
              <input
                type="date"
                aria-label="测量日期"
                className="hidden sm:inline-block w-32 rounded-xl border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200"
                value={recordDate}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) {
                    setRecordDate(e.target.value);
                    setTempPickerDate(e.target.value);
                  }
                }}
                required
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            {stageFilter && stageFilter !== "all" ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">阶段类型 *</label>
                  <button
                    type="button"
                    onClick={() => onStageFilterChange?.("all")}
                    className="text-[11px] text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium cursor-pointer"
                  >
                    切换为全部阶段可自由选择 ➔
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-2.5 text-xs font-bold text-brand-800 dark:border-brand-900/40 dark:bg-brand-950/40 dark:text-brand-300">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    <span>
                      已锁定阶段：
                      {stageFilter === "pregnancy" ? "全孕期阶段" : stageFilter === "postpartum" ? "产后恢复期" : "非孕期/备孕"}
                    </span>
                  </div>
                  <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-normal text-brand-900 shadow-2xs dark:bg-gray-800 dark:text-brand-200">
                    已与生命周期视图切片同步
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">阶段类型 *</label>
                  <span className="text-[10px] text-gray-400">（全部阶段视角下选择打卡阶段，并决定导入模板类型）</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStageType("pregnancy")}
                    className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${
                      stageType === "pregnancy"
                        ? "bg-brand-500 text-white shadow-xs"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    全孕期阶段
                  </button>
                  <button
                    type="button"
                    onClick={() => setStageType("postpartum")}
                    className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${
                      stageType === "postpartum"
                        ? "bg-brand-500 text-white shadow-xs"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    产后恢复期
                  </button>
                  <button
                    type="button"
                    onClick={() => setStageType("general")}
                    className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${
                      stageType === "general"
                        ? "bg-brand-500 text-white shadow-xs"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    非孕期/备孕
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            {stageType === "pregnancy" ? (
              <>
                {pregnantBabies.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] text-gray-400">参考宝宝：</span>
                    {pregnantBabies.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedPregnantBabyId(b.id)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                          activePregnantBaby?.id === b.id
                            ? "bg-brand-500 text-white shadow-xs"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
                <label className="label">
                  当前孕周 {hasAutoBasis ? `· 已自动推算（可修改周与天） · 参考宝宝：${pregnantBabyName}` : "(1 ~ 42 周) *"}
                </label>
                {/* v1.58：周+天双输入框——自动推算填充（未编辑时显示推算值），支持手改 */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="42"
                    className="input"
                    placeholder={hasAutoBasis ? "自动推算" : "如 24"}
                    value={weekDisplay}
                    onChange={(e) => {
                      setGestationalWeek(e.target.value);
                      setWeekTouched(true);
                    }}
                    required
                  />
                  <span className="shrink-0 text-xs text-gray-400">周</span>
                  <input
                    type="number"
                    min="0"
                    max="6"
                    className="input"
                    placeholder="天"
                    value={daysDisplay}
                    onChange={(e) => {
                      setGestationalDays(e.target.value);
                      setDaysTouched(true);
                    }}
                  />
                  <span className="shrink-0 text-xs text-gray-400">天</span>
                </div>
                {gestation && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    本日期推算为 {gestation.label}
                    {activePregnantBaby
                      ? `（按孕期宝宝「${pregnantBabyName}」预产期自动填入，允许 ±1 周微调）`
                      : hasDueDate
                      ? `（按档案预产期自动填入 · 参考宝宝：${pregnantBabyName}，允许 ±1 周微调）`
                      : `（按首次打卡 ${gestationAnchor!.date} 孕${gestationAnchor!.week}周，允许 ±1 周微调）`}
                  </p>
                )}
              </>
            ) : stageType === "postpartum" ? (
              <>
                {bornBabies.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] text-gray-400">参考宝宝：</span>
                    {bornBabies.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedPostpartumBabyId(b.id)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                          activePostpartumBaby?.id === b.id
                            ? "bg-brand-500 text-white shadow-xs"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
                <label className="label">
                  产后月龄 (0 ~ 36 个月) {effectiveBabyBirthday ? `· 按${postpartumBabyName}宝宝生日自动` : "*"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="36"
                    className="input"
                    placeholder={effectiveBabyBirthday ? `按${postpartumBabyName}宝宝生日自动` : "例如 2"}
                    value={postpartumMonthsDisplay}
                    onChange={(e) => setPostpartumMonths(e.target.value)}
                    required
                  />
                  <span className="text-xs text-gray-400">个月</span>
                </div>
                {effectiveBabyBirthday && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    按「${postpartumBabyName}」宝宝生日（${effectiveBabyBirthday}）自动推算为 ${postpartumMonthsDisplay} 个月
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-brand-50/60 p-3 text-[11px] leading-relaxed text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                非孕期（备孕/日常）体重管理：无需孕周与产后月龄，评估按标准 BMI 区间
                (18.5 ~ 23.9) 进行，走势看板自动切换为非孕期视图。
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">
              身高 (cm{height ? "" : "，首次必填"})
              {height ? <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400">已带入历史值</span> : null}
            </label>
            <input
              type="number"
              className="input font-medium"
              placeholder="例如 165"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>

          <div>
            <label className="label">
              孕前体重 (kg，选填)
              {preWeight ? <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400">已带入基线值</span> : null}
            </label>
            <input
              type="number"
              step="0.1"
              className="input font-medium"
              placeholder="例如 52.0"
              value={preWeight}
              onChange={(e) => setPreWeight(e.target.value)}
            />
          </div>

          <div>
            <label className="label">本次实测体重 (kg) *</label>
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="例如 57.2"
              value={curWeight}
              onChange={(e) => setCurWeight(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">腹围 (cm, 选填)</label>
            <input
              type="number"
              step="0.5"
              className="input"
              placeholder="例如 85.0"
              value={waistCircumference}
              onChange={(e) => setWaistCircumference(e.target.value)}
            />
          </div>
        </div>

        {stageType === "pregnancy" && (
          <div className="flex items-center gap-3 pt-1">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isTwins}
                onChange={(e) => setIsTwins(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-500 peer-checked:after:translate-x-full dark:bg-gray-700" />
              <span className="ml-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                双胎妊娠 (WS/T 801-2022 双胎标准，总推荐增重 16.8~24.5 kg)
              </span>
            </label>
          </div>
        )}

        <div>
          <label className="label">合并情况 / 代谢特征 (用于个性化膳食控糖控盐与禁忌食材定向筛查)</label>
          <div className="flex flex-wrap gap-2 pt-1">
            {MEDICAL_HISTORY_OPTIONS.map((item) => {
              const active = medicalHistory.includes(item.key);
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => toggleHistory(item.key)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700 shadow-2xs dark:border-brand-500 dark:bg-brand-950/60 dark:text-brand-300"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ❤️ 选填：同时记录血压与血糖 */}
        <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-3.5 dark:border-rose-950/40 dark:bg-rose-950/10">
          <button
            type="button"
            onClick={() => setShowVitalsSection(!showVitalsSection)}
            className="flex w-full items-center justify-between text-xs font-semibold text-rose-800 dark:text-rose-300"
          >
            <span className="flex items-center gap-1.5">
              <HeartPulse className="h-4 w-4 text-rose-500" />
              同时记录血压与血糖（选填，未测可收起留空）
            </span>
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              {showVitalsSection ? "收起" : "展开录入"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showVitalsSection ? "rotate-180" : ""}`} />
            </span>
          </button>

          {showVitalsSection && (
            <div className="mt-3 space-y-3 border-t border-rose-100/60 pt-3 dark:border-gray-800">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                    收缩压 (高压, mmHg)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={260}
                    placeholder="如 118"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                    舒张压 (低压, mmHg)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={180}
                    placeholder="如 76"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                    脉搏 (心率, bpm)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={220}
                    placeholder="如 75"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                    血糖读数 (mmol/L)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    max={35}
                    placeholder="如 5.20"
                    value={bloodSugar}
                    onChange={(e) => setBloodSugar(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                    测定场景
                  </label>
                  <select
                    value={glucoseType}
                    onChange={(e) => setGlucoseType(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="fasting">空腹 (清晨未进食)</option>
                    <option value="postprandial_1h">餐后 1 小时 (第一口饭算起)</option>
                    <option value="postprandial_2h">餐后 2 小时 (第一口饭算起)</option>
                    <option value="bedtime">睡前</option>
                    <option value="random">随机 (非定时)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  伴随身体不适症状（可多选）
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SYMPTOMS.map((symptom) => {
                    const active = symptoms.includes(symptom);
                    return (
                      <button
                        key={symptom}
                        type="button"
                        onClick={() =>
                          setSymptoms((prev) =>
                            prev.includes(symptom)
                              ? prev.filter((s) => s !== symptom)
                              : [...prev, symptom]
                          )
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? "bg-rose-500 text-white font-medium"
                            : "bg-white text-gray-600 border border-gray-200 hover:border-rose-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {symptom}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  备注 / 生活备忘 (选填)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="如：测前有散步，睡眠良好"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-orange-100/60 pt-3 dark:border-gray-800">
          <p className="text-xs text-gray-400">
            ✓ 测量数据默认自动持久化保存至孕产记录时序库，孕周按预产期自动校准
          </p>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary gap-1.5 px-6 py-2.5 text-sm font-semibold shadow-md shadow-brand-500/20"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "正在综合分析与推荐食谱…" : "一键分析评估 & 归档至时序档案"}
          </button>
        </div>
      </form>

      {/* 移动端专属日期选择确认对话框（带明确的 取消 / 确定 按钮） */}
      {showDatePickerDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-gray-700 dark:text-brand-300">
                  <Calendar className="h-4 w-4" />
                </div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">选择测量打卡日期</h4>
              </div>
              <button
                type="button"
                onClick={cancelPickerDate}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* 快捷选择标签 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1.5">最近日期快捷选择</label>
                <div className="grid grid-cols-3 gap-2">
                  {quickDateChips.map((chip) => (
                    <button
                      key={chip.date}
                      type="button"
                      onClick={() => setTempPickerDate(chip.date)}
                      className={`rounded-xl py-2 text-xs font-semibold transition ${
                        tempPickerDate === chip.date
                          ? "bg-brand-500 text-white shadow-xs"
                          : "border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-700/60 dark:text-gray-300"
                      }`}
                    >
                      <div>{chip.label}</div>
                      <div className="text-[10px] opacity-80">{chip.date.slice(5)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 显式日期输入控件 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1.5">自定义测量日期</label>
                <input
                  type="date"
                  className="input w-full text-center text-base font-bold py-2.5 rounded-2xl"
                  value={tempPickerDate}
                  max={todayStr}
                  onChange={(e) => setTempPickerDate(e.target.value)}
                />
              </div>

              {/* 选定状态描述 */}
              <div className="rounded-xl bg-gray-50 p-2.5 text-center text-xs dark:bg-gray-900/40">
                <span className="text-gray-500 dark:text-gray-400">选定日期：</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">
                  {formatDateFriendlyCN(tempPickerDate)}
                </span>
                {tempPickerDate > todayStr && (
                  <p className="mt-1 text-[11px] text-red-500 font-semibold">⚠️ 测量日期不能晚于今天，请重新选择</p>
                )}
              </div>
            </div>

            {/* 明确的 取消 / 确定 操作按钮 */}
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              <button
                type="button"
                onClick={cancelPickerDate}
                className="btn-secondary w-full py-2 text-xs font-semibold"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!tempPickerDate || tempPickerDate > todayStr}
                onClick={confirmPickerDate}
                className="btn-primary w-full py-2 text-xs font-semibold disabled:opacity-50"
              >
                确定选择
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
