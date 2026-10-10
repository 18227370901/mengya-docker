import { useEffect, useMemo, useState } from "react";
import {
  HeartPulse,
  Baby,
  PersonStanding,
  Activity,
  Calendar,
  Scale,
  Ruler,
  Loader2,
  CheckCircle2,
  X,
  Info,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { healthApi } from "@/api/services";
import { computeGestation, gestationLabel, type GestationAnchor } from "@/utils/gestation";
import type { BmiAnalysisInput, HealthRecord } from "@/types";
import type { SameDayConflictPayload } from "@/types/health";

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
  onSaved: (archiveHint: string) => void;
  /** v1.56：预填测量日期（健康时间轴点击日期补录入口） */
  initialDate?: string;
  /** v1.58：孕周锚点（首次孕期打卡的 日期+孕周；无预产期时自动推算 孕x周x天） */
  gestationAnchor?: GestationAnchor | null;
}

/** 依据宝宝生日自动推算天数差 */
function daysBetween(fromDate: string, toDate: string): number | null {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

export default function UnifiedHealthCheckIn({ isOpen, onClose, onSaved, initialDate, gestationAnchor }: UnifiedHealthCheckInProps) {
  const { user } = useAuthStore();
  const hasDueDate = !!user?.due_date;
  const hasBabyBirthday = !!user?.baby_birthday;
  // v1.58：无预产期但有首次打卡锚点时，孕周同样自动推算（不强制手填）
  const hasAutoBasis = hasDueDate || !!gestationAnchor;

  const [mode, setMode] = useState<CheckInMode>("mom_pregnancy");
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
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

  // 档案智能默认：孕期用户默认孕期打卡；已出生宝宝档案默认宝宝测量；其余（备孕/日常）默认非孕期
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg("");
    if (user?.is_pregnant) {
      setMode("mom_pregnancy");
    } else if (user?.baby_birthday) {
      setMode("baby");
    } else {
      setMode("mom_general");
    }
    setRecordDate(initialDate || new Date().toISOString().slice(0, 10));
    setWeight("");
    setWaist("");
    setManualWeek("");
    setManualDays("");
    setWeekTouched(false);
    setDaysTouched(false);
    setBabyHeight("");
    setBabyWeight("");
    setBabyHead("");
    setNote("");
  }, [isOpen, user?.is_pregnant, user?.baby_birthday, initialDate]);

  // v1.58 孕周双基准自动推算（与后端一致）：预产期 280 天模型 > 首次打卡锚点线性外推；
  const gestation = useMemo(() => {
    if (mode !== "mom_pregnancy") return null;
    if (user?.due_date) {
      return computeGestation({ date: user.due_date, week: 40 }, recordDate);
    }
    if (gestationAnchor) {
      return computeGestation(gestationAnchor, recordDate);
    }
    return null;
  }, [mode, user?.due_date, gestationAnchor, recordDate]);

  // 日期/模式变化时解除手动编辑态 → 回到自动推算展示（v1.58 派生显示值方案，无 effect 填充竞态）
  useEffect(() => {
    setWeekTouched(false);
    setDaysTouched(false);
  }, [recordDate, mode]);

  // v1.58：派生显示值——未手动编辑时直接展示推算值（自动填充绝对可靠）；编辑后展示用户值
  const weekDisplay = !weekTouched && gestation ? String(gestation.week) : manualWeek;
  const daysDisplay = !daysTouched && gestation ? String(gestation.days) : manualDays;

  // 产后天数 / 宝宝天数自动推算
  const babyDays = useMemo(() => {
    if (!user?.baby_birthday) return null;
    return daysBetween(user.baby_birthday, recordDate);
  }, [user?.baby_birthday, recordDate]);

  const babyAgeText = useMemo(() => {
    if (babyDays == null) return null;
    if (babyDays < 30) return `${babyDays} 天`;
    const months = Math.floor(babyDays / 30.44);
    return `${months} 个月（${babyDays} 天）`;
  }, [babyDays]);

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

  if (!isOpen) return null;

  const isBabyMode = mode === "baby";
  const isPostpartumMode = mode === "mom_postpartum";
  const isGeneralMode = mode === "mom_general";
  const momMode = mode === "mom_pregnancy";

  const MODE_OPTIONS: Array<{
    key: CheckInMode;
    label: string;
    desc: string;
    icon: typeof HeartPulse;
  }> = [
    {
      key: "mom_pregnancy",
      label: "我 · 孕期产检",
      desc: hasDueDate
        ? "孕周按预产期自动推算（孕x周x天）"
        : gestationAnchor
        ? `孕周按首次打卡 ${gestationAnchor.date} 孕${gestationAnchor.week}周自动推算`
        : "需手填孕周，建议先设置预产期",
      icon: PersonStanding,
    },
    {
      key: "mom_postpartum",
      label: "我 · 产后恢复",
      desc: hasBabyBirthday ? "产后天数按宝宝生日自动推算" : "记录产后体重恢复走势",
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const w = Number(weight);

    // ===== 前端轻量校验 =====
    if (recordDate > todayStr) {
      setErrorMsg("测量日期不能晚于今天，请重新选择");
      return;
    }
    if (!isBabyMode) {
      if (!weight || Number.isNaN(w) || w <= 0) {
        setErrorMsg("请填写本次实测体重 (kg)");
        return;
      }
      if (momMode && !hasAutoBasis && !manualWeek) {
        setErrorMsg("您还未设置预产期，请手动填写本次打卡的孕周");
        return;
      }
      // v1.58：孕周显示值（自动推算或用户手改）必须为有效整数（1~42）
      if (momMode) {
        const wk = parseInt(weekDisplay, 10);
        if (Number.isNaN(wk) || wk < 1 || wk > 42) {
          setErrorMsg("请填写有效的孕周（1 ~ 42 周）");
          return;
        }
      }
    } else {
      const hasAnyMeasure = babyHeight || babyWeight || babyHead;
      if (!hasAnyMeasure) {
        setErrorMsg("宝宝测量至少填写身高、体重、头围中的一项");
        return;
      }
    }

    setSaving(true);
    try {
      if (isBabyMode) {
        // ===== 宝宝生长测量 → growth_measurement（生长曲线/日历）=====
        const babyPayload: Partial<HealthRecord> = {
          record_type: "growth_measurement",
          record_date: recordDate,
          baby_age_days: babyDays ?? undefined,
          height: babyHeight ? Number(babyHeight) : undefined,
          weight: babyWeight ? Number(babyWeight) : undefined,
          head_circumference: babyHead ? Number(babyHead) : undefined,
          note: note || undefined,
        };
        await healthApi.create(babyPayload);
        onSaved("宝宝测量已归档：生长曲线 · 日历总览");
      } else {
        // ===== 妈妈打卡（孕期/产后/非孕期）→ BMI 分析接口（自动孕周校验 + 基线继承 + 评估）=====
        const payload: BmiAnalysisInput = {
          stage_type: isPostpartumMode ? "postpartum" : isGeneralMode ? "general" : "pregnancy",
          record_date: recordDate,
          current_weight_kg: w,
          waist_circumference_cm: waist ? Number(waist) : undefined,
          medical_history: [],
          is_twins: false,
        };
        if (momMode) {
          // v1.58：周+天双输入——提交显示值（未手动编辑时为推算值，手动编辑后为用户值）；后端双基准校验周偏差
          payload.gestational_week = parseInt(weekDisplay, 10);
          const gd = parseInt(daysDisplay, 10);
          if (!Number.isNaN(gd)) payload.gestational_days = Math.max(0, Math.min(6, gd));
        } else if (isPostpartumMode) {
          payload.postpartum_months = babyDays != null ? Math.max(0, Math.floor(babyDays / 30.44)) : 1;
        }
        await healthApi.analyzeBmi(payload);
        onSaved(
          isPostpartumMode
            ? "产后打卡已归档：孕产记录 · BMI 时序 · 日历"
            : isGeneralMode
            ? "非孕期打卡已归档：孕产记录 · BMI 时序 · 日历"
            : "孕期打卡已归档：孕产记录 · BMI 时序与医学评估 · 日历"
        );
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
            current_weight_kg: w,
            waist_circumference_cm: waist ? Number(waist) : undefined,
            medical_history: [],
            is_twins: false,
          };
          if (momMode) {
            // v1.58：周+天双输入（与首次提交同口径：显示值为准）
            payload.gestational_week = parseInt(weekDisplay, 10);
            const gd = parseInt(daysDisplay, 10);
            if (!Number.isNaN(gd)) payload.gestational_days = Math.max(0, Math.min(6, gd));
          } else if (isPostpartumMode) {
            payload.postpartum_months = babyDays != null ? Math.max(0, Math.floor(babyDays / 30.44)) : 1;
          }
          setConflict({ mode: "mom", info: conflictData, momPayload: payload });
        }
      } else {
        // 透传后端孕周校验拦截等业务错误信息
        const data = err?.response?.data;
        setErrorMsg(data?.message || err?.message || "保存失败，请稍后重试");
      }
    } finally {
      setSaving(false);
    }
  };

  /** v1.57：确认覆盖当日已有记录——妈妈链路携 overwrite 重发分析接口，宝宝链路调 update 原地更新 */
  const handleOverwrite = async () => {
    if (!conflict) return;
    setSaving(true);
    setErrorMsg("");
    try {
      if (conflict.mode === "mom" && conflict.momPayload) {
        await healthApi.analyzeBmi({ ...conflict.momPayload, overwrite: true });
        onSaved("已覆盖当日打卡记录，孕产档案与 BMI 时序已同步更新");
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

          {/* 分区 1：记录对象（按档案智能默认，可自由切换覆盖补录场景；v1.57 四模式四列布局） */}
          <div>
            <label className="label">① 我要记录</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setMode(opt.key);
                    setErrorMsg("");
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition ${
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
            <p className="mt-1.5 text-[11px] text-gray-400">
              {MODE_OPTIONS.find((o) => o.key === mode)?.desc}
            </p>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">本次体重 (kg) *</label>
                    <div className="relative">
                      <Scale className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.1"
                        min={30}
                        max={220}
                        className="input pl-9"
                        placeholder="例如 58.2"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        required
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
                <p className="text-[11px] text-gray-400">
                  身高与孕前体重将自动继承上次打卡基线，无需重复填写
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">身高 (cm)</label>
                    <div className="relative">
                      <Ruler className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.1"
                        className="input pl-9"
                        placeholder="身高"
                        value={babyHeight}
                        onChange={(e) => setBabyHeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">体重 (kg)</label>
                    <div className="relative">
                      <Scale className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.1"
                        className="input pl-9"
                        placeholder="体重"
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
                      placeholder="头围"
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
              placeholder="如：胎心正常 / 医生建议 / 本次测量感受"
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
