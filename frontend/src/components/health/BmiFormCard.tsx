import React, { useState, useMemo, useEffect, useRef } from "react";
import { Activity, Sparkles, AlertCircle, Calendar, CheckCircle2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { computeGestation, type GestationAnchor } from "@/utils/gestation";
import type { BmiAnalysisInput, PregnancyStage } from "@/types/health";
import type { BabyProfile } from "@/types";

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
  babies?: BabyProfile[];
}

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

export default function BmiFormCard({ onSubmit, loading, initialHeight, initialPreWeight, gestationAnchor, stageType: externalStageType, onStageTypeChange, babies }: BmiFormCardProps) {
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

  const [recordDate, setRecordDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-brand-500" />
              <span>测量日期 (支持按天补录) *</span>
            </label>
            <input
              type="date"
              className="input font-medium"
              value={recordDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setRecordDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">阶段类型 *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStageType("pregnancy")}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
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
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
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
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                  stageType === "general"
                    ? "bg-brand-500 text-white shadow-xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                非孕期/备孕
              </button>
            </div>
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
    </div>
  );
}
