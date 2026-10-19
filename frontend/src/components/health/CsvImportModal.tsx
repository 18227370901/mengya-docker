import { useEffect, useMemo, useState } from "react";
import {
  Scale,
  HeartPulse,
  Baby,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileUp,
  Info,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { healthApi } from "@/api/services";
import { useAuthStore } from "@/store/authStore";
import type { CsvImportResult } from "@/types/health";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功后回调，展示提示文案及可选的归档阶段类型 */
  onImported: (hint: string, importedStage?: "pregnancy" | "postpartum" | "general") => void;
  initialTarget?: ImportTarget;
  motherId?: number | null;
}

export type ImportTarget = "mom_bmi" | "mom_vitals" | "baby" | "mom";
type ConflictStrategy = "skip" | "overwrite";

interface ColumnSpec {
  key: string;
  en: string;
  cn: string;
  required: boolean;
  desc: string;
  example: string;
}

const MOM_BMI_COLUMNS: ColumnSpec[] = [
  { key: "date", en: "date", cn: "日期", required: true, desc: "格式 YYYY-MM-DD，不能晚于今天", example: "2026-09-01" },
  { key: "weight", en: "weight", cn: "体重", required: true, desc: "单位 kg，合理范围 25~250 kg", example: "58.20" },
  { key: "waist", en: "waist", cn: "腹围", required: false, desc: "单位 cm，腹围测量值（选填）", example: "86.0" },
  {
    key: "stage",
    en: "stage",
    cn: "阶段",
    required: false,
    desc: "pregnancy(孕期) | postpartum(产后) | general(非孕期/备孕)，留空默认按个人档案智能识别",
    example: "pregnancy",
  },
  {
    key: "week",
    en: "week",
    cn: "孕周",
    required: false,
    desc: "仅孕期有效。若档案已设置预产期，此列可留空由系统自动推算为 x周x天；亦可手填(如 20)",
    example: "20",
  },
  { key: "note", en: "note", cn: "备注", required: false, desc: "打卡说明与生活备忘（选填）", example: "早晨空腹体重" },
];

const MOM_VITALS_COLUMNS: ColumnSpec[] = [
  { key: "date", en: "date", cn: "日期", required: true, desc: "格式 YYYY-MM-DD，不能晚于今天", example: "2026-09-01" },
  { key: "systolic", en: "systolic", cn: "收缩压", required: false, desc: "单位 mmHg（高压，选填）", example: "118" },
  { key: "diastolic", en: "diastolic", cn: "舒张压", required: false, desc: "单位 mmHg（低压，选填）", example: "76" },
  { key: "pulse", en: "pulse", cn: "脉搏", required: false, desc: "单位 次/分（心率，选填）", example: "75" },
  { key: "blood_sugar", en: "blood_sugar", cn: "血糖", required: false, desc: "单位 mmol/L（血糖值，选填）", example: "5.20" },
  { key: "glucose_type", en: "glucose_type", cn: "测定场景", required: false, desc: "fasting(空腹) | postprandial_1h | postprandial_2h | bedtime | random", example: "fasting" },
  {
    key: "stage",
    en: "stage",
    cn: "阶段",
    required: false,
    desc: "pregnancy(孕期) | postpartum(产后) | general(非孕期/备孕)，留空默认按个人档案智能识别",
    example: "pregnancy",
  },
  { key: "note", en: "note", cn: "备注", required: false, desc: "测定说明与生活备忘（选填）", example: "晨起静息血压与空腹血糖" },
];

const MOM_COLUMNS = MOM_BMI_COLUMNS;

const BABY_COLUMNS: ColumnSpec[] = [
  { key: "date", en: "date", cn: "日期", required: true, desc: "格式 YYYY-MM-DD，不能晚于今天", example: "2026-09-01" },
  { key: "height", en: "height", cn: "身高", required: false, desc: "单位 cm，身长/身高（身高/体重/头围至少填一项）", example: "92.0" },
  { key: "weight", en: "weight", cn: "体重", required: false, desc: "单位 kg，宝宝实测体重", example: "13.8" },
  { key: "head", en: "head", cn: "头围", required: false, desc: "单位 cm，宝宝头围", example: "48.5" },
  { key: "note", en: "note", cn: "备注", required: false, desc: "测量说明与日常备忘（选填）", example: "满月体检" },
];

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "日期", "记录日期", "打卡日期", "时间"],
  weight: ["weight", "体重", "体重kg", "体重(kg)", "体重（kg）"],
  waist: ["waist", "腹围", "腹围cm", "腹围(cm)", "腹围（cm）"],
  stage: ["stage", "阶段", "孕育阶段", "状态", "类型", "期别"],
  week: ["week", "孕周", "周数", "周"],
  height: ["height", "身高", "身长", "身高cm", "身高(cm)", "身高（cm）"],
  head: ["head", "头围", "头围cm", "头围(cm)", "头围（cm）"],
  systolic: ["systolic", "systolic_bp", "收缩压", "高压", "sbp", "收缩压(mmhg)", "收缩压（mmhg）"],
  diastolic: ["diastolic", "diastolic_bp", "舒张压", "低压", "dbp", "舒张压(mmhg)", "舒张压（mmhg）"],
  pulse: ["pulse", "脉搏", "心率", "脉搏(次/分)", "heart_rate"],
  blood_sugar: ["blood_sugar", "sugar", "glucose", "血糖", "血糖值", "血糖(mmol/l)", "血糖（mmol/l）"],
  glucose_type: ["glucose_type", "scene", "测定场景", "场景", "血糖类型", "测定时间"],
  note: ["note", "备注", "说明", "记录说明"],
};

const STAGE_LABELS: Record<string, string> = {
  pregnancy: "全孕期阶段（怀孕中）",
  postpartum: "产后恢复期（宝宝已出生）",
  general: "非孕期/备孕（日常记录）",
};

function isStageKeyword(val: string): boolean {
  const s = (val || "").trim().toLowerCase();
  if (!s) return false;
  return (
    s === "pregnancy" ||
    s === "postpartum" ||
    s === "general" ||
    s.includes("孕") ||
    s.includes("产后") ||
    s.includes("恢复") ||
    s.includes("非") ||
    s.includes("备") ||
    s.includes("日常")
  );
}

function normalizeStage(stageStr: string): string {
  const s = (stageStr || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "pregnancy" || s.includes("孕")) return "pregnancy";
  if (s === "postpartum" || s.includes("产后") || s.includes("恢复")) return "postpartum";
  if (s === "general" || s.includes("非") || s.includes("备") || s.includes("日常")) return "general";
  return s;
}

function matchColumnKey(headerText: string, target: ImportTarget): string | null {
  const clean = headerText.trim().toLowerCase().replace(/[()（）\s_\-]/g, "");
  const cols = target === "baby" ? BABY_COLUMNS : target === "mom_vitals" ? MOM_VITALS_COLUMNS : MOM_BMI_COLUMNS;
  for (const c of cols) {
    const aliases = COLUMN_ALIASES[c.key] || [c.key, c.en, c.cn];
    for (const a of aliases) {
      const aClean = a.trim().toLowerCase().replace(/[()（）\s_\-]/g, "");
      if (clean === aClean || clean.includes(aClean) || aClean.includes(clean)) {
        return c.key;
      }
    }
  }
  return null;
}

export default function CsvImportModal({ isOpen, onClose, onImported, initialTarget, motherId }: CsvImportModalProps) {
  const { user } = useAuthStore();
  const defaultProfileStage = useMemo<"pregnancy" | "postpartum" | "general">(() => {
    if (user?.is_pregnant) return "pregnancy";
    if (user?.baby_birthday) return "postpartum";
    return "general";
  }, [user?.is_pregnant, user?.baby_birthday]);

  const [target, setTarget] = useState<ImportTarget>(() => (initialTarget === "mom" ? "mom_bmi" : initialTarget || "mom_bmi"));

  useEffect(() => {
    if (isOpen) {
      if (initialTarget) {
        setTarget(initialTarget === "mom" ? "mom_bmi" : initialTarget);
      }
      setResult(null);
      setError("");
      setStageMismatchConfirm(null);
    }
  }, [isOpen, initialTarget]);

  const [strategy, setStrategy] = useState<ConflictStrategy>("skip");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [showSpecTable, setShowSpecTable] = useState(false);
  // 阶段与当前宝宝档案不一致确认状态
  const [stageMismatchConfirm, setStageMismatchConfirm] = useState<{
    importedStages: string[];
    importedLabel: string;
    defaultProfileStage: "pregnancy" | "postpartum" | "general";
    defaultProfileLabel: string;
  } | null>(null);

  const columns = target === "baby" ? BABY_COLUMNS : target === "mom_vitals" ? MOM_VITALS_COLUMNS : MOM_BMI_COLUMNS;
  const isMom = target === "mom_bmi" || target === "mom_vitals" || target === "mom";

  /** 前端智能 CSV 解析：支持中英文表头识别、动态列映射与无表头纯数据自适应 */
  const parsedRows = useMemo(() => {
    if (!rawText.trim()) return [];
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const firstLineCols = lines[0].split(/[,，\t]/).map((c) => c.replace(/^["']|["']$/g, "").trim());

    // 判定首行是否为表头行（只要存在匹配关键词且非纯日期格式即判定为表头）
    const headerKeyMap: Array<string | null> = firstLineCols.map((c) => matchColumnKey(c, target));
    const hasHeader = headerKeyMap.some((k) => k !== null) && !/^\d{4}-\d{2}-\d{2}/.test(firstLineCols[0]);

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const records: Array<Record<string, string>> = [];

    for (const line of dataLines) {
      if (/^(date|日期)[,，\t]/i.test(line)) continue;
      const cols = line.split(/[,，\t]/).map((c) => c.replace(/^["']|["']$/g, "").trim());
      const row: Record<string, string> = {};

      if (hasHeader) {
        headerKeyMap.forEach((key, idx) => {
          if (key) row[key] = cols[idx] ?? "";
        });
      } else if (target === "mom_vitals") {
        const defaultKeys = ["date", "systolic", "diastolic", "pulse", "blood_sugar", "glucose_type", "stage", "note"];
        defaultKeys.forEach((key, idx) => {
          row[key] = cols[idx] ?? "";
        });
      } else if (target === "mom_bmi" || target === "mom") {
        row.date = cols[0] ?? "";
        row.weight = cols[1] ?? "";
        const rest = cols.slice(2);
        const stageColIdx = rest.findIndex((c) => isStageKeyword(c));
        if (stageColIdx !== -1) {
          row.stage = rest[stageColIdx];
          const remaining = rest.filter((_, i) => i !== stageColIdx);
          if (remaining.length === 1) {
            const num = parseFloat(remaining[0]);
            if (!Number.isNaN(num) && num > 0 && num <= 42 && (row.stage.includes("pregnancy") || row.stage.includes("孕"))) {
              row.week = remaining[0];
            } else if (!Number.isNaN(num) && num >= 30 && num <= 160) {
              row.waist = remaining[0];
            } else {
              row.note = remaining[0];
            }
          } else if (remaining.length >= 2) {
            row.waist = remaining[0];
            row.week = remaining[1];
            if (remaining[2]) row.note = remaining[2];
          }
        } else {
          const defaultKeys = ["date", "weight", "waist", "stage", "week", "note"];
          defaultKeys.forEach((key, idx) => {
            row[key] = cols[idx] ?? "";
          });
        }
      } else {
        const defaultKeys = ["date", "height", "weight", "head", "note"];
        defaultKeys.forEach((key, idx) => {
          row[key] = cols[idx] ?? "";
        });
      }

      if (row.stage) {
        row.stage = normalizeStage(row.stage);
      }

      records.push(row);
    }
    return records.slice(0, 500);
  }, [rawText, target]);

  /** 本地预检：日期格式与必填数值问题 */
  const previewIssues = useMemo(() => {
    const issues: string[] = [];
    if (parsedRows.length === 0) return issues;
    let badDate = 0;
    let missValue = 0;
    parsedRows.forEach((r) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) badDate += 1;
      if (target === "mom_bmi" && !r.weight) missValue += 1;
      if (target === "mom_vitals" && !r.systolic && !r.diastolic && !r.blood_sugar) missValue += 1;
      if (target === "mom" && !r.weight && !r.systolic && !r.diastolic && !r.blood_sugar) missValue += 1;
      if (target === "baby" && !r.height && !r.weight && !r.head) missValue += 1;
    });
    if (badDate) issues.push(`${badDate} 行日期格式异常（标准格式：YYYY-MM-DD）`);
    if (missValue) issues.push(`${missValue} 行缺少核心测量数值`);
    const dates = parsedRows.map((r) => r.date);
    if (new Set(dates).size !== dates.length) issues.push("本次导入存在重复日期，同日记录将按策略处理");
    return issues;
  }, [parsedRows, target]);

  if (!isOpen) return null;

  const handleFileRead = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result || ""));
    reader.onerror = () => setError("文件读取失败，请重试或直接粘贴文本");
    reader.readAsText(file, "utf-8");
  };

  /** 下载模板：支持中英文表头 */
  const downloadTemplate = (lang: "cn" | "en") => {
    let content = "";
    let filename = "";
    if (target === "mom_vitals") {
      if (lang === "cn") {
        filename = "妈妈血压血糖体征导入模板(中文表头).csv";
        content =
          "日期,收缩压,舒张压,脉搏,血糖,测定场景,阶段,备注\n" +
          "2026-09-01,118,76,75,5.20,空腹,孕期,晨起血压血糖\n" +
          "2026-09-08,122,80,78,,,孕期,单录血压(收缩压+舒张压)\n" +
          "2026-09-15,,,,6.40,餐后2小时,孕期,单录餐后血糖\n";
      } else {
        filename = "mom_vitals_import_template(en).csv";
        content =
          "date,systolic,diastolic,pulse,blood_sugar,glucose_type,stage,note\n" +
          "2026-09-01,118,76,75,5.20,fasting,pregnancy,morning bp and glucose\n" +
          "2026-09-08,122,80,78,,,pregnancy,bp only\n" +
          "2026-09-15,,,,6.40,postprandial_2h,pregnancy,postprandial glucose\n";
      }
    } else if (target === "mom_bmi" || target === "mom") {
      if (lang === "cn") {
        filename = "妈妈体重与BMI监测导入模板(中文表头).csv";
        content =
          "日期,体重,腹围,阶段,孕周,备注\n" +
          "2026-09-01,58.20,86.0,孕期,20,早晨空腹体重\n" +
          "2026-09-08,58.80,87.0,孕期,21,按周体重监测\n" +
          "2026-09-22,57.50,,产后,,产后体重恢复\n";
      } else {
        filename = "mom_bmi_import_template(en).csv";
        content =
          "date,weight,waist,stage,week,note\n" +
          "2026-09-01,58.20,86.0,pregnancy,20,morning fasting weight\n" +
          "2026-09-08,58.80,87.0,pregnancy,21,weekly weight monitoring\n" +
          "2026-09-22,57.50,,postpartum,,postpartum recovery\n";
      }
    } else {
      if (lang === "cn") {
        filename = "宝宝生长测量导入模板(中文表头).csv";
        content =
          "日期,身高,体重,头围,备注\n" +
          "2026-09-01,92.0,13.80,48.5,满月生长测量\n" +
          "2026-09-08,92.5,14.00,48.6,定期复测\n";
      } else {
        filename = "baby_growth_import_template(en).csv";
        content =
          "date,height,weight,head,note\n" +
          "2026-09-01,92.0,13.80,48.5,routine growth check\n" +
          "2026-09-08,92.5,14.00,48.6,follow-up test\n";
      }
    }

    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 执行导入 API 调用 */
  const executeImport = async (mode: "default_profile" | "imported_type") => {
    const currentMismatch = stageMismatchConfirm;
    setStageMismatchConfirm(null);
    setSubmitting(true);
    setError("");
    try {
      let rowsToSubmit = parsedRows;
      let targetStageResolved: "pregnancy" | "postpartum" | "general" = defaultProfileStage;

      if (isMom) {
        if (mode === "default_profile") {
          // 强制将所有记录阶段覆盖为用户当前档案默认阶段
          rowsToSubmit = parsedRows.map((r) => ({
            ...r,
            stage: defaultProfileStage,
          }));
          targetStageResolved = defaultProfileStage;
        } else {
          // 按照用户导入类型导入数据
          const firstStage = rowsToSubmit.find((r) => r.stage)?.stage as "pregnancy" | "postpartum" | "general" | undefined;
          targetStageResolved = firstStage || defaultProfileStage;
        }
      }

      const res = await healthApi.batchImport({
        target: (target === "baby" ? "baby" : "mom") as "mom" | "baby",
        conflict_strategy: strategy,
        records: rowsToSubmit,
        mother_id: isMom && motherId ? motherId : undefined,
      });
      setResult(res);
      if (res.errors.length === 0) {
        const modeText =
          mode === "default_profile"
            ? `已按照当前宝宝默认档案类型【${currentMismatch?.defaultProfileLabel || STAGE_LABELS[defaultProfileStage]}】转换并完成导入`
            : currentMismatch
            ? `已按照您指定的导入类型【${currentMismatch.importedLabel}】完成导入`
            : "CSV 导入完成";
        onImported(
          `${modeText}：新增 ${res.created} 条，覆盖 ${res.updated} 条，跳过 ${res.skipped} 条`,
          isMom ? targetStageResolved : undefined
        );
      }
    } catch (err: any) {
      setError(err?.message || "导入请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedRows.length === 0) {
      setError("未识别到有效数据行，请上传 CSV 文件或直接粘贴 CSV 内容");
      return;
    }

    // 检查阶段与当前宝宝默认档案是否不一致
    const distinctStages = Array.from(new Set(parsedRows.map((r) => r.stage).filter(Boolean)));
    const hasMismatch = isMom && distinctStages.length > 0 && distinctStages.some((st) => st !== defaultProfileStage);

    if (hasMismatch) {
      const importedLabel = distinctStages.map((st) => STAGE_LABELS[st] || st).join(" / ");
      setStageMismatchConfirm({
        importedStages: distinctStages,
        importedLabel,
        defaultProfileStage,
        defaultProfileLabel: STAGE_LABELS[defaultProfileStage] || defaultProfileStage,
      });
      return;
    }

    await executeImport("imported_type");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800 dark:text-gray-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          type="button"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-gray-100 pb-3.5 dark:border-gray-700">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <FileUp className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">健康数据 CSV 批量导入</h3>
            <p className="text-xs text-gray-400">
              支持中英文表头自由导入 · 专属模板一键下载 · 单次上限 500 条
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. 导入对象专属切换 */}
          <div>
            <label className="label">① 导入对象与业务场景</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "mom_bmi" as ImportTarget, label: "妈妈体重/BMI 历史", icon: Scale },
                  { key: "mom_vitals" as ImportTarget, label: "妈妈血压/血糖体征", icon: HeartPulse },
                  { key: "baby" as ImportTarget, label: "宝宝生长发育记录", icon: Baby },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setTarget(opt.key);
                    setResult(null);
                    setStageMismatchConfirm(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                    target === opt.key
                      ? "border-brand-500 bg-brand-500 text-white shadow-xs"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200"
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. 规范与专属模板下载 */}
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-3.5 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <Info className="h-4 w-4 text-brand-500" />
                <span>
                  {target === "mom_vitals"
                    ? "血压/血糖体征导入规范（至少包含血压或血糖）"
                    : target === "mom_bmi"
                    ? "体重/BMI 导入规范（体重必填，阶段与孕周自动推算）"
                    : "宝宝生长发育导入规范（身高、体重、头围至少一项）"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadTemplate("cn")}
                  className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs"
                  title="下载中文表头 CSV 模板"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>中文模板</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadTemplate("en")}
                  className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs"
                  title="下载英文表头 CSV 模板"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>英文模板</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSpecTable(!showSpecTable)}
                  className="flex items-center gap-0.5 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  <span>{showSpecTable ? "收起字段说明" : "字段说明"}</span>
                  {showSpecTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 字段提示小标签 */}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {columns.map((c: ColumnSpec) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  <span className="font-medium">{c.cn}</span>
                  <span className="text-[10px] text-gray-400">({c.en})</span>
                  {c.required && <span className="text-red-500 font-bold">*</span>}
                </span>
              ))}
            </div>

            {/* 展开的字段详细说明表 */}
            {showSpecTable && (
              <div className="mt-3 overflow-x-auto border-t border-orange-200/50 pt-2 dark:border-gray-700">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-orange-100 text-gray-400 dark:border-gray-700">
                      <th className="py-1">中文表头</th>
                      <th className="py-1">英文表头</th>
                      <th className="py-1">必填</th>
                      <th className="py-1">格式说明与规范</th>
                      <th className="py-1">示例</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-100/40 dark:divide-gray-700">
                    {columns.map((c: ColumnSpec) => (
                      <tr key={c.key}>
                        <td className="py-1.5 font-medium text-gray-800 dark:text-gray-200">{c.cn}</td>
                        <td className="py-1.5 font-mono text-gray-500 dark:text-gray-400">{c.en}</td>
                        <td className="py-1.5">
                          {c.required ? (
                            <span className="text-red-500 font-semibold">必填</span>
                          ) : (
                            <span className="text-gray-400">选填</span>
                          )}
                        </td>
                        <td className="py-1.5 text-gray-600 dark:text-gray-300">{c.desc}</td>
                        <td className="py-1.5 font-mono text-gray-500 dark:text-gray-400">{c.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. 上传或粘贴 CSV */}
          <div>
            <label className="label">② 上传文件或直接粘贴 CSV 内容</label>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-4 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:bg-gray-900/70">
                <Upload className="h-5 w-5 text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {fileName ? `已选文件：${fileName}（点击可重新选择）` : "点击选择本地 .csv 文件，或将文件拖曳至此"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileRead(f);
                  }}
                />
              </label>

              <div className="relative">
                <textarea
                  rows={4}
                  className="input font-mono text-xs"
                  placeholder="亦可直接将 CSV 纯文本复制粘贴到此处..."
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                    setFileName("");
                  }}
                />
                {rawText && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawText("");
                      setFileName("");
                    }}
                    className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4. 同日记录冲突策略 */}
          <div>
            <label className="label">③ 同日已有记录处理策略</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border p-2.5 transition ${
                  strategy === "skip"
                    ? "border-brand-500 bg-brand-50/60 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                    : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="conflict_strategy"
                  value="skip"
                  checked={strategy === "skip"}
                  onChange={() => setStrategy("skip")}
                  className="text-brand-500 focus:ring-brand-400"
                />
                <div>
                  <div className="font-semibold">跳过冲突（推荐）</div>
                  <div className="text-[11px] text-gray-400">若该日期已有记录则保持原有数据不变</div>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border p-2.5 transition ${
                  strategy === "overwrite"
                    ? "border-brand-500 bg-brand-50/60 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                    : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="conflict_strategy"
                  value="overwrite"
                  checked={strategy === "overwrite"}
                  onChange={() => setStrategy("overwrite")}
                  className="text-brand-500 focus:ring-brand-400"
                />
                <div>
                  <div className="font-semibold">覆盖已有</div>
                  <div className="text-[11px] text-gray-400">若该日期已有记录则以本次 CSV 记录更新覆盖</div>
                </div>
              </label>
            </div>
          </div>

          {/* 5. 解析预览 */}
          {parsedRows.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 text-xs dark:border-gray-700 dark:bg-gray-900/30">
              <div className="flex items-center justify-between font-semibold text-gray-700 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                  已识别 {parsedRows.length} 条数据
                </span>
                <span className="text-[11px] text-gray-400">首行示例：{parsedRows[0].date} ({parsedRows[0].weight || parsedRows[0].systolic || parsedRows[0].height || "已录"})</span>
              </div>
              {previewIssues.length > 0 && (
                <div className="mt-2 space-y-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {previewIssues.map((issue, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. 导入结果看板 */}
          {result && (
            <div className="rounded-2xl border border-gray-200 bg-white p-3.5 text-xs shadow-xs dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-1.5 font-bold text-gray-800 dark:text-gray-100">
                <Sparkles className="h-4 w-4 text-brand-500" />
                <span>导入执行结果</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <div className="font-bold text-base">{result.created}</div>
                  <div className="text-[10px]">成功新增</div>
                </div>
                <div className="rounded-xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <div className="font-bold text-base">{result.updated}</div>
                  <div className="text-[10px]">覆盖更新</div>
                </div>
                <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <div className="font-bold text-base">{result.skipped}</div>
                  <div className="text-[10px]">跳过重复</div>
                </div>
                <div className="rounded-xl bg-red-50 p-2 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  <div className="font-bold text-base">{result.errors.length}</div>
                  <div className="text-[10px]">异常条数</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-3 max-h-36 overflow-y-auto rounded-xl bg-red-50/60 p-2.5 text-[11px] text-red-600 dark:bg-red-950/20 dark:text-red-400">
                  <div className="font-semibold mb-1">部分行未成功导入：</div>
                  {result.errors.map((e, idx) => (
                    <div key={idx}>第 {e.row} 行: {e.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 阶段不一致弹窗提示确认 */}
          {stageMismatchConfirm && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>导入阶段类型与当前档案状态不一致</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed">
                当前系统默认档案为【<strong>{stageMismatchConfirm.defaultProfileLabel}</strong>】，
                而待导入 CSV 中包含【<strong>{stageMismatchConfirm.importedLabel}</strong>】阶段记录。请选择导入处理方式：
              </p>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => executeImport("default_profile")}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  转换并归档至【{stageMismatchConfirm.defaultProfileLabel}】
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => executeImport("imported_type")}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  保持 CSV 所填阶段直接导入
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-xs">
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || parsedRows.length === 0}
              className="btn-primary gap-1.5 px-5 py-2 text-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在批量校验导入...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>立即执行批量导入 ({parsedRows.length} 条)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
