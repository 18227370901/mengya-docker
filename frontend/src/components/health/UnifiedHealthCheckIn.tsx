import { useEffect, useMemo, useState } from "react";
import {
  Scale,
  HeartPulse,
  Baby,
  PersonStanding,
  Activity,
  Calendar,
  Loader2,
  CheckCircle2,
  X,
  Info,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { healthApi } from "@/api/services";
import { authApi } from "@/api/auth";
import { computeGestation, gestationLabel, type GestationAnchor } from "@/utils/gestation";
import type { BmiAnalysisInput, HealthRecord, BabyProfile } from "@/types";
import type { BmiAnalysisResult, SameDayConflictPayload } from "@/types/health";

/**
 * 统一健康打卡弹窗（v1.55 健康中心唯一录入入口）
 * 按"记录对象"分流：我·孕期产检 / 我·产后恢复 / 宝宝·生长测量，
 * 档案智能默认 + 孕周/月龄自动推算，数据自动归档至孕产记录/BMI时序/生长曲线/日历。
 */

type CheckInMode = "mom_pregnancy" | "mom_postpartum" | "mom_general" | "baby";

interface UnifiedHealthCheckInProps {
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功后回调，参数为归档去向提示文案 */
  onSaved: (archiveHint: string, analysisResult?: BmiAnalysisResult | null) => void;
  /** v1.56：预填测量日期（健康时间轴点击日期补录入口） */
  initialDate?: string;
  /** 初始记录类型（由外层页面根据子页面上下文联动传入） */
  initialMode?: CheckInMode;
  /** 允许展示的打卡模式（用于子页面严格隔离，避免模式混淆） */
  allowedModes?: CheckInMode[];
  /** 历史打卡基线身高（自动继承；无历史时首次必填） */
  initialHeight?: number | null;
  /** v1.58：孕周锚点（首次孕期打卡的 日期+孕周；无预产期时自动推算 孕x周x天） */
  gestationAnchor?: GestationAnchor | null;
  onModeChange?: (mode: CheckInMode) => void;
  motherId?: number | null;
  initialBabyId?: number | null;
  babies?: BabyProfile[];
  initialRecord?: HealthRecord | null;
  /** 打卡模块侧重模式：bmi 突出体重BMI（血压血糖折叠） vs vitals 突出血压血糖（体重折叠） */
  initialFocusModule?: "bmi" | "vitals";
  allRecords?: HealthRecord[];
}

/** 依据宝宝生日自动推算天数差 */
function daysBetween(fromDate: string, toDate: string): number | null {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

export default function UnifiedHealthCheckIn({
  isOpen,
  onClose,
  onSaved,
  initialDate,
  initialMode,
  allowedModes,
  initialHeight,
  gestationAnchor,
  onModeChange,
  motherId,
  initialBabyId,
  babies,
  initialRecord,
  allRecords,
  initialFocusModule,
}: UnifiedHealthCheckInProps) {
  const effectiveAllowedModes = useMemo(() => {
    if (allowedModes && allowedModes.length > 0) return allowedModes;
    return ['mom_pregnancy', 'mom_postpartum', 'mom_general', 'baby'] as CheckInMode[];
  }, [allowedModes]);
  const [babyList, setBabyList] = useState<BabyProfile[]>(() => babies || []);
  const [selectedBabyId, setSelectedBabyId] = useState<number | null>(() => (initialBabyId != null ? Number(initialBabyId) : null));

  useEffect(() => {
    if (babies && babies.length > 0) {
      setBabyList(babies);
    } else if (isOpen) {
      authApi.babies().then(setBabyList).catch(() => {});
    }
  }, [isOpen, babies]);

  useEffect(() => {
    if (isOpen) {
      if (initialRecord?.baby != null) {
        setSelectedBabyId(Number(initialRecord.baby));
      } else if (initialBabyId != null) {
        setSelectedBabyId(Number(initialBabyId));
      } else if (initialRecord?.baby_name && babyList.length > 0) {
        const found = babyList.find((b) => b.name === initialRecord.baby_name);
        if (found) setSelectedBabyId(Number(found.id));
      } else if (babyList.length > 0) {
        const def = babyList.find((b) => b.is_primary) || babyList[0];
        setSelectedBabyId(Number(def?.id || null));
      }
    }
  }, [isOpen, initialBabyId, initialRecord, babyList]);

  const activeBaby = useMemo(() => {
    if (selectedBabyId != null) {
      const found = babyList.find((b) => Number(b.id) === Number(selectedBabyId));
      if (found) return found;
    }
    return babyList.find((b) => b.is_primary) || babyList[0] || null;
  }, [babyList, selectedBabyId]);
  const { user } = useAuthStore();
  const pregnantBaby = useMemo(() => {
    return babyList.find((b) => b.is_born === false || (b.birthday && new Date(b.birthday) > new Date())) || null;
  }, [babyList]);

  const bornBabies = useMemo(() => {
    return babyList.filter((b) => b.is_born !== false && (!b.birthday || new Date(b.birthday) <= new Date()));
  }, [babyList]);

  const effectiveDueDate = pregnantBaby?.birthday || user?.due_date;
  const hasDueDate = Boolean(effectiveDueDate);
  const hasBabyBirthday = Boolean(bornBabies.length > 0 || user?.baby_birthday);
  // v1.58：孕期宝宝预产期/用户预产期或首次打卡锚点自动推算
  const hasAutoBasis = Boolean(effectiveDueDate || gestationAnchor);

  const [mode, setInternalMode] = useState<CheckInMode>("mom_pregnancy");

  const setMode = (m: CheckInMode) => {
    setInternalMode(m);
    onModeChange?.(m);
  };
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [height, setHeight] = useState(() => (initialHeight ? String(initialHeight) : ""));
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [bloodSugar, setBloodSugar] = useState("");
  const [glucoseType, setGlucoseType] = useState<"fasting" | "postprandial_1h" | "postprandial_2h" | "bedtime" | "random">("fasting");
  const [focusModule, setFocusModule] = useState<"bmi" | "vitals">(() => initialFocusModule || "bmi");
  const [showVitalsSection, setShowVitalsSection] = useState(() => initialFocusModule === "vitals");
  const [showBmiSection, setShowBmiSection] = useState(() => initialFocusModule !== "vitals");

  useEffect(() => {
    if (initialFocusModule) {
      setFocusModule(initialFocusModule);
      if (initialFocusModule === "vitals") {
        setShowVitalsSection(true);
        setShowBmiSection(false);
      } else {
        setShowVitalsSection(false);
        setShowBmiSection(true);
      }
    }
  }, [initialFocusModule, isOpen]);
  const [manualWeek, setManualWeek] = useState("");
  const [manualDays, setManualDays] = useState("");
  // v1.58：touched 标记——用户手动改过孕周/天数后尊重用户值；日期/模式变化时重置回自动推算
  const [weekTouched, setWeekTouched] = useState(false);
  const [daysTouched, setDaysTouched] = useState(false);
  const [babyHeight, setBabyHeight] = useState("");
  const [babyWeight, setBabyWeight] = useState("");
  const [babyHead, setBabyHead] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // v1.57：同日重复打卡 409 冲突（含待覆盖重发的原始 payload 引用）
  const [conflict, setConflict] = useState<null | {
    mode: "mom" | "baby";
    info: SameDayConflictPayload;
    momPayload?: BmiAnalysisInput;
    babyPayload?: Partial<HealthRecord>;
  }>(null);
  const todayStr = new Date().toISOString().slice(0, 10);

  // 打开/关闭/切换关键维度时重置冲突覆盖态，确保绝不无故预先展示覆盖确认框
  useEffect(() => {
    if (!isOpen) {
      setConflict(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setConflict(null);
  }, [recordDate, mode, selectedBabyId]);

  // 1. 打开弹窗或传入 initialRecord 时，解析初始打卡模式与初始日期
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg("");
    setConflict(null);

    if (initialRecord) {
      const recItems = (initialRecord.exam_items && typeof initialRecord.exam_items === "object" ? initialRecord.exam_items : {}) as Record<string, unknown>;
      const recStage = (recItems.stage as string) || initialRecord.stage_type;
      let resolvedMode: CheckInMode = "mom_general";

      if (
        initialRecord.record_type === "growth_measurement" ||
        initialRecord.record_type === "vaccination" ||
        initialRecord.record_type === "vaccine"
      ) {
        resolvedMode = "baby";
      } else if (initialRecord.record_type === "postpartum_recovery" || recStage === "postpartum") {
        resolvedMode = "mom_postpartum";
      } else if (initialRecord.record_type === "prenatal_exam" || initialRecord.record_type === "checkup" || recStage === "pregnancy" || initialRecord.gestational_week) {
        resolvedMode = "mom_pregnancy";
      } else if (recStage === "general") {
        resolvedMode = "mom_general";
      } else if (initialMode && effectiveAllowedModes.includes(initialMode)) {
        resolvedMode = initialMode;
      }
      setMode(resolvedMode);
      setRecordDate(initialRecord.record_date || new Date().toISOString().slice(0, 10));

      if (initialRecord.baby != null) {
        setSelectedBabyId(Number(initialRecord.baby));
      } else if (initialRecord.baby_name && babyList.length > 0) {
        const found = babyList.find((b) => b.name === initialRecord.baby_name);
        if (found) setSelectedBabyId(Number(found.id));
      }
    } else {
      if (initialMode && effectiveAllowedModes.includes(initialMode)) {
        setMode(initialMode);
      } else if (effectiveAllowedModes.includes("mom_pregnancy") && user?.is_pregnant) {
        setMode("mom_pregnancy");
      } else if (effectiveAllowedModes.includes("baby") && (user?.baby_birthday || babyList.length > 0)) {
        setMode("baby");
      } else {
        setMode(effectiveAllowedModes[0] || "mom_general");
      }
      setRecordDate(initialDate || new Date().toISOString().slice(0, 10));
    }
  }, [
    isOpen,
    initialRecord,
    initialMode,
    initialDate,
    effectiveAllowedModes,
    user?.is_pregnant,
    user?.baby_birthday,
  ]);

  // 2. 当日期、打卡对象（宝宝/妈妈）或打卡模式切换时，自动回显对应记录数据至输入框（多宝宝/妈妈数据隔离）
  useEffect(() => {
    if (!isOpen) return;

    let targetRec: HealthRecord | null = null;
    const isBaby = mode === "baby";

    // 优先采用直接传入的 initialRecord（若与当前日期、模式、宝宝匹配）
    if (initialRecord && initialRecord.record_date === recordDate) {
      const isInitialBaby = initialRecord.record_type === "growth_measurement" || initialRecord.record_type === "vaccination" || initialRecord.record_type === "vaccine";
      if (isBaby && isInitialBaby) {
        if (!initialRecord.baby || Number(initialRecord.baby) === Number(activeBaby?.id) || initialRecord.baby_name === activeBaby?.name) {
          targetRec = initialRecord;
        }
      } else if (!isBaby && !isInitialBaby) {
        targetRec = initialRecord;
      }
    }

    // 若未匹配 initialRecord，则在全局 records 中按日期 + 目标宝宝/妈妈检索
    if (!targetRec && allRecords && allRecords.length > 0) {
      if (isBaby && activeBaby) {
        targetRec = allRecords.find((r) =>
          r.record_date === recordDate &&
          (r.record_type === "growth_measurement" || r.record_type === "vaccination" || r.record_type === "vaccine") &&
          (Number(r.baby) === Number(activeBaby.id) || r.baby_name === activeBaby.name)
        ) || null;
      } else if (!isBaby) {
        targetRec = allRecords.find((r) =>
          r.record_date === recordDate &&
          r.record_type === "prenatal_exam"
        ) || null;
      }
    }

    if (targetRec) {
      const items = (targetRec.exam_items && typeof targetRec.exam_items === "object" ? targetRec.exam_items : {}) as Record<string, unknown>;
      if (isBaby) {
        const h = targetRec.height != null ? String(targetRec.height) : (items.height != null ? String(items.height) : "");
        const w = targetRec.weight != null ? String(targetRec.weight) : (items.weight != null ? String(items.weight) : "");
        const head = targetRec.head_circumference != null ? String(targetRec.head_circumference) : (items.head_circumference != null ? String(items.head_circumference) : "");
        setBabyHeight(h);
        setBabyWeight(w);
        setBabyHead(head);
      } else {
        const h = targetRec.height != null ? String(targetRec.height) : (items.height != null ? String(items.height) : (initialHeight ? String(initialHeight) : ""));
        const w = targetRec.weight != null ? String(targetRec.weight) : (items.weight != null ? String(items.weight) : "");
        const waistVal = targetRec.waist_circumference != null ? String(targetRec.waist_circumference) : (items.waist_circumference != null ? String(items.waist_circumference) : "");
        setHeight(h);
        setWeight(w);
        setWaist(waistVal);

        const gw = targetRec.gestational_week != null ? targetRec.gestational_week : (items.gestational_week as number | undefined);
        if (gw != null) {
          setManualWeek(String(gw));
          setWeekTouched(true);
        }
        const gd = targetRec.gestational_day != null ? targetRec.gestational_day : (items.gestational_days as number | undefined);
        if (gd != null) {
          setManualDays(String(gd));
          setDaysTouched(true);
        }
      }
      setNote(targetRec.note || targetRec.notes || (items.note as string) || "");
    } else {
      if (isBaby) {
        setBabyHeight("");
        setBabyWeight("");
        setBabyHead("");
      } else {
        setHeight(initialHeight ? String(initialHeight) : "");
        setWeight("");
        setWaist("");
        setManualWeek("");
        setManualDays("");
        setWeekTouched(false);
        setDaysTouched(false);
      }
      setNote("");
    }
  }, [
    isOpen,
    recordDate,
    mode,
    activeBaby?.id,
    initialRecord,
    allRecords,
    initialHeight,
  ]);

  useEffect(() => {
    if (isOpen && initialHeight && (!height || height === "")) {
      setHeight(String(initialHeight));
    }
  }, [isOpen, initialHeight]);

  // v1.58 孕周多基准自动推算（与后端一致）：孕期宝宝预产期 > 档案预产期 > 首次打卡锚点线性外推；
  const gestation = useMemo(() => {
    if (mode !== "mom_pregnancy") return null;
    if (effectiveDueDate) {
      return computeGestation({ date: effectiveDueDate, week: 40 }, recordDate);
    }
    if (gestationAnchor) {
      return computeGestation(gestationAnchor, recordDate);
    }
    return null;
  }, [mode, effectiveDueDate, gestationAnchor, recordDate]);

  // 日期/模式变化时解除手动编辑态 → 回到自动推算展示（v1.58 派生显示值方案，无 effect 填充竞态）
  useEffect(() => {
    setWeekTouched(false);
    setDaysTouched(false);
  }, [recordDate, mode]);

  // v1.58：派生显示值——未手动编辑时直接展示推算值（自动填充绝对可靠）；编辑后展示用户值
  const weekDisplay = !weekTouched && gestation ? String(gestation.week) : manualWeek;
  const daysDisplay = !daysTouched && gestation ? String(gestation.days) : manualDays;

  // 产后天数 / 宝宝天数 / 孕期自动推算（修复怀孕中宝宝显示0天的缺陷）
  const effectiveBabyBirthday = activeBaby?.birthday || user?.baby_birthday;
  const isBabyUnborn =
    activeBaby?.is_born === false ||
    (activeBaby?.is_born == null && effectiveBabyBirthday && new Date(effectiveBabyBirthday) > new Date(recordDate));

  const babyDays = useMemo(() => {
    if (!effectiveBabyBirthday) return null;
    return daysBetween(effectiveBabyBirthday, recordDate);
  }, [effectiveBabyBirthday, recordDate]);

  const babyAgeText = useMemo(() => {
    if (!effectiveBabyBirthday) return null;
    if (isBabyUnborn) {
      // 预产期 280 天医学模型推算孕周天数
      const gest = computeGestation({ date: effectiveBabyBirthday, week: 40 }, recordDate);
      if (gest) {
        return `${gest.week}周${gest.days}天`;
      }
      return "怀孕中";
    }
    if (babyDays == null) return null;
    if (babyDays < 30) return `${babyDays} 天`;
    const months = Math.floor(babyDays / 30.44);
    return `${months} 个月（${babyDays} 天）`;
  }, [effectiveBabyBirthday, isBabyUnborn, recordDate, babyDays]);

  // v1.57 宝宝数值软提示（仅黄色警示不阻断提交，用户明确要求不限制录入）
  const babyRangeHints = useMemo(() => {
    if (mode !== "baby") return [];
    const hints: string[] = [];
    const h = parseFloat(babyHeight);
    const w = parseFloat(babyWeight);
    const head = parseFloat(babyHead);
    if (babyHeight && !Number.isNaN(h) && (h < 30 || h > 140)) {
      hints.push(`身高 ${h}cm 超出常见宝宝身高范围 (30~140cm)，请确认录入无误`);
    }
    if (babyWeight && !Number.isNaN(w) && (w < 0.5 || w > 40)) {
      hints.push(`体重 ${w}kg 超出常见宝宝体重范围 (0.5~40kg)，请确认录入无误`);
    }
    if (babyHead && !Number.isNaN(head) && (head < 25 || head > 60)) {
      hints.push(`头围 ${head}cm 超出常见宝宝头围范围 (25~60cm)，请确认录入无误`);
    }
    return hints;
  }, [mode, babyHeight, babyWeight, babyHead]);

  const isBabyMode = mode === "baby";
  const isPostpartumMode = mode === "mom_postpartum";
  const isGeneralMode = mode === "mom_general";
  const momMode = mode === "mom_pregnancy";

  const primaryBornBaby = bornBabies.find((b) => b.is_primary) || bornBabies[0] || null;

  const MODE_OPTIONS: Array<{
    key: CheckInMode;
    label: string;
    desc: string;
    icon: typeof HeartPulse;
  }> = [
    {
      key: "mom_pregnancy",
      label: "我 · 孕期产检",
      desc: pregnantBaby
        ? `孕周按「${pregnantBaby.name}」预产期自动推算（孕x周x天）`
        : hasDueDate
        ? "孕周按预产期自动推算（孕x周x天）"
        : gestationAnchor
        ? `孕周按首次打卡 ${gestationAnchor.date} 孕${gestationAnchor.week}周自动推算`
        : "需手填孕周，建议先设置预产期",
      icon: PersonStanding,
    },
    {
      key: "mom_postpartum",
      label: "我 · 产后恢复",
      desc: primaryBornBaby
        ? `产后天数按「${primaryBornBaby.name}」生日自动推算`
        : hasBabyBirthday
        ? "产后天数按宝宝生日自动推算"
        : "记录产后体重恢复走势",
      icon: HeartPulse,
    },
    {
      key: "mom_general",
      label: "我 · 非孕期/备孕",
      desc: "备孕与日常体重管理，BMI 按标准区间评估",
      icon: Activity,
    },
    {
      key: "baby",
      label: "宝宝 · 生长测量",
      desc: hasBabyBirthday ? "月龄按宝宝生日自动推算" : "身高/体重/头围生长曲线",
      icon: Baby,
    },
  ];

  const filteredModeOptions = useMemo(() => {
    return MODE_OPTIONS.filter((o) => effectiveAllowedModes.includes(o.key));
  }, [MODE_OPTIONS, effectiveAllowedModes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const w = Number(weight);
    const hasWeightInput = Boolean(weight && !Number.isNaN(w) && w > 0);
    const hasBpInput = Boolean(systolic || diastolic);
    const hasSugarInput = Boolean(bloodSugar);
    const hasVitalsInput = hasBpInput || hasSugarInput;

    // ===== 前端轻量校验 =====
    if (recordDate > todayStr) {
      setErrorMsg("测量日期不能晚于今天，请重新选择");
      return;
    }
    if (!isBabyMode) {
      if (!hasWeightInput && !hasVitalsInput) {
        if (focusModule === "vitals") {
          setErrorMsg("请至少录入一项血压或血糖数据（如需记录体重可展开下方体重卡片）");
        } else {
          setErrorMsg("请填写当前实测体重（如需记录血压血糖可展开下方体征卡片）");
        }
        return;
      }
      if (hasBpInput && (!systolic || !diastolic)) {
        setErrorMsg("请同时填写收缩压和舒张压，或者两者均不填写");
        return;
      }
      if (hasWeightInput) {
        const effectiveHeight = height || (initialHeight ? String(initialHeight) : "");
        const h = parseFloat(effectiveHeight);
        if (!effectiveHeight || Number.isNaN(h) || h < 100 || h > 220) {
          setErrorMsg("录入体重时请填写身高（100~220 cm，首次打卡录入一次，之后自动继承）");
          return;
        }
      }
      if (momMode && !hasAutoBasis && !manualWeek) {
        setErrorMsg("孕期未设置预产期，请手动填写本次打卡的孕周");
        return;
      }
      // v1.58：按显示值（自动推算或用户指定）校验为有效孕周（1~42）
      if (momMode) {
        const wk = parseInt(weekDisplay, 10);
        if (Number.isNaN(wk) || wk < 1 || wk > 42) {
          setErrorMsg("请填写有效孕周（1 ~ 42 周）");
          return;
        }
      }
    } else {
      const hasAnyMeasure = babyHeight || babyWeight || babyHead;
      if (!hasAnyMeasure) {
        setErrorMsg("宝宝成长记录请至少填写身高、体重、头围中的一项");
        return;
      }
    }

    setSaving(true);
    try {
      if (isBabyMode) {
        // ===== 宝宝生长记录 → growth_measurement（生长曲线 / 日历等）=====
        const babyPayload: Partial<HealthRecord> = {
          record_type: "growth_measurement",
          record_date: recordDate,
          baby: activeBaby?.id || undefined,
          baby_age_days: babyDays ?? undefined,
          height: babyHeight ? Number(babyHeight) : undefined,
          weight: babyWeight ? Number(babyWeight) : undefined,
          head_circumference: babyHead ? Number(babyHead) : undefined,
          note: note || undefined,
        };
        await healthApi.create(babyPayload);
        onSaved(`宝宝「${activeBaby?.name || "小萌宝"}」测量已归档：生长曲线 · 日历总览`);
      } else {
        // ===== 妈妈打卡（孕期/产后/非孕期）→ BMI 分析接口（自动孕周校验 + 基线继承 + 评估）=====
        if (hasWeightInput) {
          const payload: BmiAnalysisInput = {
            stage_type: isPostpartumMode ? "postpartum" : isGeneralMode ? "general" : "pregnancy",
            record_date: recordDate,
            current_weight_kg: w,
            height_cm: parseFloat(height || (initialHeight ? String(initialHeight) : "")),
            waist_circumference_cm: waist ? Number(waist) : undefined,
            systolic_bp: systolic ? parseFloat(systolic) : undefined,
            diastolic_bp: diastolic ? parseFloat(diastolic) : undefined,
            pulse: pulse ? parseFloat(pulse) : undefined,
            blood_sugar: bloodSugar ? parseFloat(bloodSugar) : undefined,
            glucose_type: bloodSugar ? glucoseType : undefined,
            medical_history: [],
            is_twins: false,
            mother_id: motherId || undefined,
          };
          if (momMode) {
            // v1.58：周+天双输入——提交显示值（未手动编辑时为推算值，手动编辑后为用户值）；后端双基准校验周偏差
            payload.gestational_week = parseInt(weekDisplay, 10);
            const gd = parseInt(daysDisplay, 10);
            if (!Number.isNaN(gd)) payload.gestational_days = Math.max(0, Math.min(6, gd));
          } else if (isPostpartumMode) {
            payload.postpartum_months = babyDays != null ? Math.max(0, Math.floor(babyDays / 30.44)) : 1;
          }
          const res = await healthApi.analyzeBmi(payload);
          onSaved(
            isPostpartumMode
              ? "产后打卡已归档：孕产记录 · BMI 时序 · 日历"
              : isGeneralMode
              ? "非孕期打卡已归档：孕产记录 · BMI 时序 · 日历"
              : "孕期打卡已归档：孕产记录 · BMI 时序与医学评估 · 日历",
            res
          );
        } else {
          // 单录血压或血糖（未录入体重）
          const vitalsPayload: any = {
            stage_type: isPostpartumMode ? "postpartum" : isGeneralMode ? "general" : "pregnancy",
            record_date: recordDate,
            systolic_bp: systolic ? parseFloat(systolic) : undefined,
            diastolic_bp: diastolic ? parseFloat(diastolic) : undefined,
            pulse: pulse ? parseFloat(pulse) : undefined,
            blood_sugar: bloodSugar ? parseFloat(bloodSugar) : undefined,
            glucose_type: bloodSugar ? glucoseType : undefined,
            mother_id: motherId || undefined,
          };
          if (momMode) {
            vitalsPayload.gestational_week = parseInt(weekDisplay, 10);
            const gd = parseInt(daysDisplay, 10);
            if (!Number.isNaN(gd)) vitalsPayload.gestational_days = Math.max(0, Math.min(6, gd));
          } else if (isPostpartumMode) {
            vitalsPayload.postpartum_months = babyDays != null ? Math.max(0, Math.floor(babyDays / 30.44)) : 1;
          }
          await healthApi.analyzeVitals(vitalsPayload);
          onSaved("体征数据已归档：血压/血糖时序与产检记录已同步更新", null);
        }
      }
      onClose();
    } catch (err: any) {
      // v1.57：同日重复 409 → 弹出覆盖确认内联确认条（保留本次录入数据，确认后覆盖重发）
      const conflictData = err?.data as SameDayConflictPayload | undefined;
      if (conflictData?.conflict && conflictData?.overwrite_supported) {
        if (isBabyMode) {
          setConflict({
            mode: "baby",
            info: conflictData,
            babyPayload: {
              record_type: "growth_measurement",
              record_date: recordDate,
              baby: activeBaby?.id || undefined,
              baby_age_days: babyDays ?? undefined,
              height: babyHeight ? Number(babyHeight) : undefined,
              weight: babyWeight ? Number(babyWeight) : undefined,
              head_circumference: babyHead ? Number(babyHead) : undefined,
              note: note || undefined,
            },
          });
        } else {
          const payload: BmiAnalysisInput = {
            stage_type: isPostpartumMode ? "postpartum" : isGeneralMode ? "general" : "pregnancy",
            record_date: recordDate,
            current_weight_kg: hasWeightInput ? w : undefined,
            height_cm: hasWeightInput ? parseFloat(height || (initialHeight ? String(initialHeight) : "")) : undefined,
            waist_circumference_cm: waist ? Number(waist) : undefined,
            systolic_bp: systolic ? parseFloat(systolic) : undefined,
            diastolic_bp: diastolic ? parseFloat(diastolic) : undefined,
            pulse: pulse ? parseFloat(pulse) : undefined,
            blood_sugar: bloodSugar ? parseFloat(bloodSugar) : undefined,
            glucose_type: bloodSugar ? glucoseType : undefined,
            medical_history: [],
            is_twins: false,
            mother_id: motherId || undefined,
          };
          if (momMode) {
            // v1.58：周+天双输入——提交显示值同理
            payload.gestational_week = parseInt(weekDisplay, 10);
            const gd = parseInt(daysDisplay, 10);
            if (!Number.isNaN(gd)) payload.gestational_days = Math.max(0, Math.min(6, gd));
          } else if (isPostpartumMode) {
            payload.postpartum_months = babyDays != null ? Math.max(0, Math.floor(babyDays / 30.44)) : 1;
          }
          setConflict({ mode: "mom", info: conflictData, momPayload: payload });
        }
      } else {
        // 透传后端校验、阶段阻断等业务错误信息
        const data = err?.response?.data;
        setErrorMsg(data?.message || err?.message || "保存失败，请稍后重试");
      }
    } finally {
      setSaving(false);
    }
  };

  /** v1.57：确认覆盖当日已有记录，重新走路径携带 overwrite 重发原接口，避免单路 update 原样覆写 */
  const handleOverwrite = async () => {
    if (!conflict) return;
    setSaving(true);
    setErrorMsg("");
    try {
      if (conflict.mode === "mom" && conflict.momPayload) {
        if (conflict.momPayload.current_weight_kg != null) {
          const res = await healthApi.analyzeBmi({ ...conflict.momPayload, overwrite: true });
          onSaved("已覆盖当日打卡记录，孕产档案与 BMI 时序已同步更新", res);
        } else {
          await healthApi.analyzeVitals({ ...conflict.momPayload, overwrite: true });
          onSaved("已覆盖当日打卡记录，生命体征时序已同步更新", null);
        }
      } else if (conflict.mode === "baby" && conflict.babyPayload) {
        await healthApi.update(conflict.info.existing_id, conflict.babyPayload);
        onSaved("已覆盖当日宝宝测量记录，生长曲线已同步更新");
      }
      setConflict(null);
      onClose();
    } catch (err: any) {
      setConflict(null);
      const data = err?.response?.data;
      setErrorMsg(data?.message || err?.message || "覆盖更新失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl transition-all dark:bg-gray-800 dark:text-gray-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          type="button"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3 dark:border-gray-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">健康打卡</h3>
            <p className="text-xs text-gray-400">
              一次录入，自动同步孕产记录 · BMI 时序 · 生长曲线 · 日历总览
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* v1.57：同日重复打卡覆盖确认（内联确认条：展示当日已有数据 + 覆盖/取消） */}
          {conflict && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {conflict.info.existing_date} 当日已有
                  {conflict.mode === "mom"
                    ? `妈妈打卡记录（体重 ${conflict.info.existing_weight ?? "—"} kg）`
                    : `宝宝测量记录（身高 ${conflict.info.existing_height ?? "—"} cm / 体重 ${conflict.info.existing_weight ?? "—"} kg）`}
                  。是否用本次测量数据覆盖更新当日记录？
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConflict(null)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleOverwrite}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  覆盖当日记录
                </button>
              </div>
            </div>
          )}

          {initialRecord && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  已调出【{initialRecord.baby_name ? `${initialRecord.baby_name}宝宝` : initialRecord.record_type === "prenatal_exam" ? "孕期产检" : "健康档案"}】当日记录数据并已自动回显至下方输入框，可直接查看或修改后保存覆盖。
                </span>
              </div>
            </div>
          )}

                    {/* 分区 1：记录对象（根据所在页面与权限严格隔离记录模式，杜绝混淆） */}
          <div>
            <label className="label">① 我要记录</label>
            {filteredModeOptions.length === 1 ? (
              <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-3 dark:border-brand-900/60 dark:bg-brand-950/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-xs">
                  {(() => {
                    const Icon = filteredModeOptions[0].icon;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-brand-800 dark:text-brand-200">
                    {filteredModeOptions[0].label}
                  </span>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {filteredModeOptions[0].desc}
                  </p>
                </div>
              </div>
            ) : (
              <div className={`grid gap-2 ${
                filteredModeOptions.length === 3
                  ? "grid-cols-1 sm:grid-cols-3"
                  : filteredModeOptions.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-4"
              }`}>
                {filteredModeOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setMode(opt.key);
                      setErrorMsg("");
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition cursor-pointer ${
                      mode === opt.key
                        ? "border-brand-400 bg-brand-50 shadow-xs dark:border-brand-600 dark:bg-brand-950/50"
                        : "border-gray-100 bg-white hover:border-brand-200 dark:border-gray-700 dark:bg-gray-800"
                    }`}
                  >
                    <opt.icon
                      className={`h-5 w-5 ${mode === opt.key ? "text-brand-600 dark:text-brand-400" : "text-gray-400"}`}
                    />
                    <span
                      className={`text-xs font-semibold ${
                        mode === opt.key ? "text-brand-700 dark:text-brand-300" : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {filteredModeOptions.length > 1 && (
              <p className="mt-1.5 text-[11px] text-gray-400">
                {filteredModeOptions.find((o) => o.key === mode)?.desc}
              </p>
            )}
          </div>

          {/* 分区 2：日期（默认今天，支持补录；自动回显孕周/产后天数/宝宝月龄） */}
          <div>
            <label className="label flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              ② 测量日期（支持补录历史）
            </label>
            <input
              type="date"
              className="input"
              value={recordDate}
              max={todayStr}
              onChange={(e) => setRecordDate(e.target.value)}
              required
            />
            {/* v1.58：孕周自动推算提示（双基准：预产期 / 首次打卡锚点；与下方周+天输入框联动） */}
            {momMode && gestation && user?.due_date && (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                按档案预产期推算：{gestation.label}（已自动填充，可修改，后端同步校验）
              </p>
            )}
            {momMode && gestation && !user?.due_date && gestationAnchor && (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                按首次打卡 {gestationAnchor.date} 孕{gestationAnchor.week}周推算：{gestation.label}
                （后端同步校验，允许 ±1 周微调）
              </p>
            )}
            {isPostpartumMode && babyDays != null && (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                产后 {babyAgeText}，将自动归档为产后恢复打卡
              </p>
            )}
            {isBabyMode && babyAgeText && (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                宝宝月龄自动推算：{babyAgeText}
              </p>
            )}
          </div>

          {/* 分区 3：动态指标 */}
          <div>
            <label className="label">③ 测量指标</label>

            {!isBabyMode ? (
              <div className="space-y-3">
                {/* v1.58：孕周 周+天 双输入框——自动推算填充（未手动编辑时显示推算值），支持用户修改周与天 */}
                {momMode && (
                  <div>
                    <label className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        孕周 * {hasAutoBasis && <span className="text-emerald-600 dark:text-emerald-400">（{gestation ? gestation.label : "推算中"}，可修改）</span>}
                      </span>
                      {!hasAutoBasis && <span className="text-[11px] text-gray-400">首次打卡需手填</span>}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={42}
                        className="input"
                        placeholder={hasAutoBasis ? "自动推算" : "周"}
                        value={weekDisplay}
                        onChange={(e) => {
                          setManualWeek(e.target.value);
                          setWeekTouched(true);
                        }}
                        required
                      />
                      <span className="shrink-0 text-xs text-gray-400">周</span>
                      <input
                        type="number"
                        min={0}
                        max={6}
                        className="input"
                        placeholder="天"
                        value={daysDisplay}
                        onChange={(e) => {
                          setManualDays(e.target.value);
                          setDaysTouched(true);
                        }}
                      />
                      <span className="shrink-0 text-xs text-gray-400">天</span>
                    </div>
                    {hasAutoBasis && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        已按{user?.due_date ? "档案预产期" : `首次打卡 ${gestationAnchor?.date} 孕${gestationAnchor?.week}周`}自动推算，可修改周数（±1 周内）与天数
                      </p>
                    )}
                  </div>
                )}
                {/* 妈妈打卡模块聚焦切换条 */}
                <div className="flex rounded-xl bg-gray-100/80 p-1 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setFocusModule("bmi");
                      setShowBmiSection(true);
                      setShowVitalsSection(false);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      focusModule === "bmi"
                        ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-300"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    <Scale className="h-3.5 w-3.5" />
                    体重与 BMI 监测打卡
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusModule("vitals");
                      setShowVitalsSection(true);
                      setShowBmiSection(false);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      focusModule === "vitals"
                        ? "bg-white text-rose-600 shadow-xs dark:bg-gray-700 dark:text-rose-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    <HeartPulse className="h-3.5 w-3.5" />
                    血压与血糖监测打卡
                  </button>
                </div>

                {focusModule === "bmi" ? (
                  <>
                    {/* BMI 模式：核心录入体重与身高 */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            身高 (cm) {!initialHeight && !height ? <span className="font-bold text-red-500">*</span> : null}
                          </span>
                          {height || initialHeight ? (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">已带入历史值</span>
                          ) : (
                            <span className="text-[10px] text-amber-500">首次必填</span>
                          )}
                        </label>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            min={100}
                            max={220}
                            className="input font-medium"
                            placeholder={height || initialHeight ? `已录入: ${height || initialHeight} cm` : "例如 165"}
                            value={height}
                            onChange={(e) => setHeight(e.target.value)}
                            required={!initialHeight && !height && focusModule === "bmi"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">本次实测体重 (kg) *</label>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            min={30}
                            max={220}
                            className="input"
                            placeholder={weight ? `已录入: ${weight} kg` : "例如 58.2"}
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            required={focusModule === "bmi"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">腹围 (cm, 选填)</label>
                        <input
                          type="number"
                          step="0.1"
                          min={30}
                          max={200}
                          className="input"
                          placeholder="例如 86.0"
                          value={waist}
                          onChange={(e) => setWaist(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 辅助折叠卡：选填血压与血糖 */}
                    <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-3 dark:border-rose-950/40 dark:bg-rose-950/10">
                      <button
                        type="button"
                        onClick={() => setShowVitalsSection(!showVitalsSection)}
                        className="flex w-full items-center justify-between text-xs font-semibold text-rose-800 dark:text-rose-300"
                      >
                        <span className="flex items-center gap-1.5">
                          <HeartPulse className="h-4 w-4 text-rose-500" />
                          同时记录血压与血糖（选填，未测可收起留空）
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {showVitalsSection ? "收起" : "展开录入"}
                        </span>
                      </button>

                      {showVitalsSection && (
                        <div className="mt-3 space-y-3 border-t border-rose-100/60 pt-2.5 dark:border-gray-800">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">高压 (mmHg)</label>
                              <input
                                type="number"
                                min="50"
                                max="260"
                                placeholder="如 118"
                                value={systolic}
                                onChange={(e) => setSystolic(e.target.value)}
                                className="input text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">低压 (mmHg)</label>
                              <input
                                type="number"
                                min="30"
                                max="180"
                                placeholder="如 76"
                                value={diastolic}
                                onChange={(e) => setDiastolic(e.target.value)}
                                className="input text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">脉搏 (bpm)</label>
                              <input
                                type="number"
                                min="30"
                                max="220"
                                placeholder="如 75"
                                value={pulse}
                                onChange={(e) => setPulse(e.target.value)}
                                className="input text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">血糖 (mmol/L)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="1"
                                max="35"
                                placeholder="如 5.20"
                                value={bloodSugar}
                                onChange={(e) => setBloodSugar(e.target.value)}
                                className="input text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">测定场景</label>
                              <select
                                value={glucoseType}
                                onChange={(e) => setGlucoseType(e.target.value as any)}
                                className="input text-xs"
                              >
                                <option value="fasting">空腹</option>
                                <option value="postprandial_1h">餐后1小时</option>
                                <option value="postprandial_2h">餐后2小时</option>
                                <option value="bedtime">睡前</option>
                                <option value="random">随机</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Vitals 模式：核心录入血压与血糖 */}
                    <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-3.5 space-y-3 dark:border-rose-950/40 dark:bg-rose-950/10">
                      <div className="text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                        <HeartPulse className="h-4 w-4 text-rose-500" />
                        血压与血糖测量（核心录入项）
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">收缩压/高压 (mmHg)</label>
                          <input
                            type="number"
                            min="50"
                            max="260"
                            placeholder="如 118"
                            value={systolic}
                            onChange={(e) => setSystolic(e.target.value)}
                            className="input text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">舒张压/低压 (mmHg)</label>
                          <input
                            type="number"
                            min="30"
                            max="180"
                            placeholder="如 76"
                            value={diastolic}
                            onChange={(e) => setDiastolic(e.target.value)}
                            className="input text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">脉搏/心率 (bpm)</label>
                          <input
                            type="number"
                            min="30"
                            max="220"
                            placeholder="如 75"
                            value={pulse}
                            onChange={(e) => setPulse(e.target.value)}
                            className="input text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-t border-rose-100/60 pt-2.5 dark:border-gray-800">
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">血糖读数 (mmol/L)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            max="35"
                            placeholder="如 5.20"
                            value={bloodSugar}
                            onChange={(e) => setBloodSugar(e.target.value)}
                            className="input text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">测定场景</label>
                          <select
                            value={glucoseType}
                            onChange={(e) => setGlucoseType(e.target.value as any)}
                            className="input text-xs"
                          >
                            <option value="fasting">空腹</option>
                            <option value="postprandial_1h">餐后1小时</option>
                            <option value="postprandial_2h">餐后2小时</option>
                            <option value="bedtime">睡前</option>
                            <option value="random">随机</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* 辅助折叠卡：选填体重与腹围 */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/40">
                      <button
                        type="button"
                        onClick={() => setShowBmiSection(!showBmiSection)}
                        className="flex w-full items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300"
                      >
                        <span className="flex items-center gap-1.5">
                          <Scale className="h-4 w-4 text-brand-500" />
                          同时记录体重与腹围（选填，未测可收起留空）
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {showBmiSection ? "收起" : "展开录入"}
                        </span>
                      </button>

                      {showBmiSection && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-gray-200/60 pt-2.5 dark:border-gray-700">
                          <div>
                            <label className="text-[11px] text-gray-500 block mb-1">身高 (cm)</label>
                            <input
                              type="number"
                              step="0.1"
                              min={100}
                              max={220}
                              className="input text-xs"
                              placeholder={height || initialHeight ? `${height || initialHeight} cm` : "例如 165"}
                              value={height}
                              onChange={(e) => setHeight(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 block mb-1">本次体重 (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              min={30}
                              max={220}
                              className="input text-xs"
                              placeholder="例如 58.2"
                              value={weight}
                              onChange={(e) => setWeight(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 block mb-1">腹围 (cm)</label>
                            <input
                              type="number"
                              step="0.1"
                              min={30}
                              max={200}
                              className="input text-xs"
                              placeholder="例如 86.0"
                              value={waist}
                              onChange={(e) => setWaist(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <p className="text-[11px] text-gray-400">
                  {height || initialHeight
                    ? `已带入历史身高（${height || initialHeight} cm），支持校准修改；后续打卡自动继承`
                    : "首次打卡需录入一次身高（用于计算 BMI 与合理增重），之后将自动继承"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 目标已有宝宝选择栏 */}
                <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                      <Baby className="h-4 w-4 text-orange-500" />
                      打卡目标宝宝 <span className="text-red-500">*</span>
                    </label>
                    {activeBaby && (
                      <span className="text-[11px] text-gray-400">
                        {activeBaby.is_born === false
                          ? `预产期 ${activeBaby.birthday}`
                          : `出生 ${activeBaby.birthday}`}
                      </span>
                    )}
                  </div>
                  {babyList.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {babyList.map((b) => {
                          const isSelected = Number(b.id) === Number(activeBaby?.id ?? selectedBabyId);
                          const genderIcon = b.gender === "girl" ? "👧" : b.gender === "boy" ? "👦" : "👶";
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedBabyId(Number(b.id))}
                              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                                isSelected
                                  ? "bg-orange-500 text-white shadow-2xs"
                                  : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                              }`}
                            >
                              <span>{genderIcon}</span>
                              <span className="font-semibold">{b.name}</span>
                              {b.is_primary && (
                                <span className={`text-[10px] px-1 rounded ${isSelected ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"}`}>
                                  默认
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {babyAgeText && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 inline" />
                          已关联「{activeBaby?.name}」档案，当前月龄/天数：{babyAgeText}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      暂无宝宝档案，打卡将保存至默认档案「{user?.nickname ? `${user.nickname}的宝宝` : "小萌宝"}」
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">身高 (cm)</label>
                    <div>
                      <input
                        type="number"
                        step="0.1"
                        className="input"
                        placeholder={babyHeight ? `已录入: ${babyHeight} cm` : "身高"}
                        value={babyHeight}
                        onChange={(e) => setBabyHeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">体重 (kg)</label>
                    <div>
                      <input
                        type="number"
                        step="0.1"
                        className="input"
                        placeholder={babyWeight ? `已录入: ${babyWeight} kg` : "体重"}
                        value={babyWeight}
                        onChange={(e) => setBabyWeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">头围 (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      placeholder={babyHead ? `已录入: ${babyHead} cm` : "头围"}
                      value={babyHead}
                      onChange={(e) => setBabyHead(e.target.value)}
                    />
                  </div>
                </div>
                {/* v1.57 宝宝数值软提示：仅警示不限制录入（用户可录入特殊医学场景数据） */}
                {babyRangeHints.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="space-y-0.5">
                      {babyRangeHints.map((h) => (
                        <p key={h}>{h}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label">备注 (选填)</label>
            <input
              className="input"
              placeholder={initialRecord?.notes ? `已录入: ${initialRecord.notes}` : "如：胎心正常 / 医生建议 / 本次测量感受"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary text-xs" disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn-primary gap-1.5 text-xs shadow-md shadow-brand-500/20" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              保存打卡
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
