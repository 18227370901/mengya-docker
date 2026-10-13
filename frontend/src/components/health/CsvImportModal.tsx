import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileUp, Info, Loader2, Sparkles, Upload, X } from "lucide-react";
import { healthApi } from "@/api/services";
import { useAuthStore } from "@/store/authStore";
import type { CsvImportResult } from "@/types/health";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功后回调，展示提示文案及可选的归档阶段类型 */
  onImported: (hint: string, importedStage?: "pregnancy" | "postpartum" | "general") => void;
  initialTarget?: ImportTarget;
}

type ImportTarget = "mom" | "baby";
type ConflictStrategy = "skip" | "overwrite";

interface ColumnSpec {
  key: string;
  en: string;
  cn: string;
  required: boolean;
  desc: string;
  example: string;
}

const MOM_COLUMNS: ColumnSpec[] = [
  { key: "date", en: "date", cn: "日期", required: true, desc: "格式 YYYY-MM-DD，不能晚于今天", example: "2026-09-01" },
  { key: "weight", en: "weight", cn: "体重", required: true, desc: "单位 kg，合理防呆范围 25~250 kg", example: "58.20" },
  { key: "waist", en: "waist", cn: "腹围", required: false, desc: "单位 cm，腹围测量值（选填）", example: "86.0" },
  {
    key: "stage",
    en: "stage",
    cn: "阶段",
    required: false,
    desc: "pregnancy(孕期) | postpartum(产后) | general(非孕期/备孕)，支持输入中英文，留空默认按个人档案智能识别",
    example: "pregnancy",
  },
  {
    key: "week",
    en: "week",
    cn: "孕周",
    required: false,
    desc: "仅孕期有效。若档案已设置预产期，此列可留空由系统自动推算为 x周x天；亦可手填(如 20 或 20.5)",
    example: "20",
  },
  { key: "note", en: "note", cn: "备注", required: false, desc: "打卡说明与生活备忘（选填）", example: "孕检打卡" },
];

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
  const clean = headerText.trim().toLowerCase().replace(/[\(\)\（\）\s_\-]/g, "");
  const cols = target === "mom" ? MOM_COLUMNS : BABY_COLUMNS;
  for (const c of cols) {
    const aliases = COLUMN_ALIASES[c.key] || [c.key, c.en, c.cn];
    for (const a of aliases) {
      const aClean = a.trim().toLowerCase().replace(/[\(\)\（\）\s_\-]/g, "");
      if (clean === aClean || clean.includes(aClean) || aClean.includes(clean)) {
        return c.key;
      }
    }
  }
  return null;
}

export default function CsvImportModal({ isOpen, onClose, onImported, initialTarget }: CsvImportModalProps) {
  const { user } = useAuthStore();
  const defaultProfileStage = useMemo<"pregnancy" | "postpartum" | "general">(() => {
    if (user?.is_pregnant) return "pregnancy";
    if (user?.baby_birthday) return "postpartum";
    return "general";
  }, [user?.is_pregnant, user?.baby_birthday]);

  const [target, setTarget] = useState<ImportTarget>(() => initialTarget || "mom");

  useEffect(() => {
    if (isOpen) {
      if (initialTarget) {
        setTarget(initialTarget);
      }
      setRawText("");
      setFileName("");
      setError("");
      setResult(null);
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

  const columns = target === "mom" ? MOM_COLUMNS : BABY_COLUMNS;

  /** 前端智能 CSV 解析：支持中英文表头识别、动态列映射与无表头纯数据自适应 */
  const parsedRows = useMemo(() => {
    if (!rawText.trim()) return [];
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const firstLineCols = lines[0].split(/[,，\t]/).map((c) => c.replace(/^["\']|["\']$/g, "").trim());

    // 判定首行是否为表头行（只要存在匹配关键词且非纯日期格式即判定为表头）
    const headerKeyMap: Array<string | null> = firstLineCols.map((c) => matchColumnKey(c, target));
    const hasHeader = headerKeyMap.some((k) => k !== null) && !/^\d{4}-\d{2}-\d{2}/.test(firstLineCols[0]);

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const records: Array<Record<string, string>> = [];

    for (const line of dataLines) {
      if (/^(date|日期)[,，\t]/i.test(line)) continue;
      const cols = line.split(/[,，\t]/).map((c) => c.replace(/^["\']|["\']$/g, "").trim());
      const row: Record<string, string> = {};

      if (hasHeader) {
        headerKeyMap.forEach((key, idx) => {
          if (key) row[key] = cols[idx] ?? "";
        });
      } else if (target === "mom") {
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
      if (target === "mom" && !r.weight) missValue += 1;
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
    if (target === "mom") {
      if (lang === "cn") {
        filename = "妈妈体重打卡导入模板(中文表头).csv";
        content =
          "日期,体重,腹围,阶段,孕周,备注\n" +
          "2026-09-01,58.20,86.0,孕期,20,孕中期打卡(孕周可手填)\n" +
          "2026-09-08,58.60,87.0,孕期,,孕周留空将按预产期自动推算\n" +
          "2026-09-15,59.00,,产后,,产后恢复期打卡\n" +
          "2026-09-22,57.50,,非孕期,,备孕或日常记录\n";
      } else {
        filename = "mom_weight_import_template(en).csv";
        content =
          "date,weight,waist,stage,week,note\n" +
          "2026-09-01,58.20,86.0,pregnancy,20,prenatal exam\n" +
          "2026-09-08,58.60,87.0,pregnancy,,auto calculate gestation\n" +
          "2026-09-15,59.00,,postpartum,,postpartum recovery\n" +
          "2026-09-22,57.50,,general,,general routine\n";
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

  const executeImport = async (mode: "imported_type" | "default_profile" = "imported_type") => {
    setSubmitting(true);
    setError("");
    setResult(null);
    const currentMismatch = stageMismatchConfirm;
    setStageMismatchConfirm(null);
    try {
      let rowsToSubmit = parsedRows;
      let targetStageResolved: "pregnancy" | "postpartum" | "general" = defaultProfileStage;

      if (target === "mom") {
        if (mode === "default_profile") {
          // 按照宝宝默认档案类型导入数据
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
        target,
        conflict_strategy: strategy,
        records: rowsToSubmit,
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
          target === "mom" ? targetStageResolved : undefined
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
    setError("");
    setResult(null);
    if (parsedRows.length === 0) {
      setError("未解析到有效数据行，请检查 CSV 内容或下载模板对照格式");
      return;
    }

    // 检查阶段与当前宝宝默认档案是否不一致
    const distinctStages = Array.from(new Set(parsedRows.map((r) => r.stage).filter(Boolean)));
    const hasMismatch = target === "mom" && distinctStages.length > 0 && distinctStages.some((st) => st !== defaultProfileStage);

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
              支持中英文表头自由导入 · 孕周自动推算免手算 · 单次上限 500 条
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

          {/* 1. 导入对象 */}
          <div>
            <label className="label">① 导入对象</label>
            <div className="flex gap-2">
              {(
                [
                  { key: "mom" as ImportTarget, label: "妈妈体重打卡" },
                  { key: "baby" as ImportTarget, label: "宝宝生长测量" },
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
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                    target === opt.key
                      ? "bg-brand-500 text-white shadow-xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 字段规范与中英文对照 */}
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-3.5 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300">
                <FileSpreadsheet className="h-4 w-4 text-brand-500" />
                <span>字段规范与中英文对照说明</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadTemplate("cn")}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-brand-600 shadow-xs hover:bg-orange-50 dark:bg-gray-700 dark:text-brand-300"
                  title="下载中文表头 CSV 示例模板"
                >
                  <Download className="h-3 w-3" />
                  <span>下载中文模板</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadTemplate("en")}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-brand-600 shadow-xs hover:bg-orange-50 dark:bg-gray-700 dark:text-brand-300"
                  title="下载英文表头 CSV 示例模板"
                >
                  <Download className="h-3 w-3" />
                  <span>下载英文模板</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSpecTable((v) => !v)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-white/80 hover:text-gray-600 dark:hover:bg-gray-700"
                  title={showSpecTable ? "收起字段详情" : "展开字段详情"}
                >
                  {showSpecTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 字段提示小标签 */}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {columns.map((c) => (
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
                    {columns.map((c) => (
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
                        <td className="py-1.5 font-mono text-gray-500">{c.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 特色贴心说明 */}
            <div className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div>
                <b>智能推算功能：</b>
                {target === "mom"
                  ? "stage 阶段支持 pregnancy(孕期) | postpartum(产后) | general(非孕期/备孕)。当为孕期时，若您已设置预产期档案，week（孕周）列可留空，系统将根据打卡日期全自动推算为精准的 x周x天，无需手动繁琐换算！"
                  : "宝宝生长测量支持导入历史身高、体重与头围。三项指标中至少填写一项即可，系统将自动关联生长发育曲线。"}
              </div>
            </div>
          </div>

          {/* 3. CSV 内容输入 */}
          <div>
            <label className="label">③ 选择 CSV 文件或直接粘贴数据</label>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 py-3 text-xs text-brand-600 transition hover:bg-brand-50 dark:border-brand-900 dark:hover:bg-brand-950/30">
                <Upload className="h-4 w-4" />
                {fileName || "点击选择 .csv / .txt 文件（支持 UTF-8 编码）"}
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileRead(f);
                  }}
                />
              </label>
              <textarea
                rows={5}
                className="input text-[11px] leading-relaxed font-mono"
                placeholder={
                  target === "mom"
                    ? "可直接粘贴数据（首行中文或英文表头均可自动识别）：\n日期,体重,腹围,阶段,孕周,备注\n2026-09-01,58.2,86,孕期,20,定期产检\n2026-09-08,58.6,87,pregnancy,,孕周留空自动推算"
                    : "可直接粘贴数据（首行中文或英文表头均可自动识别）：\n日期,身高,体重,头围,备注\n2026-09-01,92.0,13.8,48.5,满月体检\n2026-09-08,92.5,14.0,48.6,日常测量"
                }
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setResult(null);
                  setStageMismatchConfirm(null);
                }}
              />
            </div>
          </div>

          {/* 预览 */}
          {parsedRows.length > 0 && (
            <div className="space-y-1.5 rounded-2xl bg-gray-50 p-3.5 text-[11px] text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
              <p>
                已解析 <b className="text-gray-700 dark:text-gray-200">{parsedRows.length}</b> 行数据
                {parsedRows.length >= 500 && "（已达单次 500 条上限，超出部分将被忽略）"}
                ，首行解析预览：
                <span className="ml-1 font-mono text-brand-600 dark:text-brand-400">
                  {parsedRows[0].date} · {target === "mom" ? `体重 ${parsedRows[0].weight || "—"}kg · 阶段: ${parsedRows[0].stage || "默认按档案"}${parsedRows[0].week ? ` (孕${parsedRows[0].week}周)` : ""}` : `身高 ${parsedRows[0].height || "—"}cm · 体重 ${parsedRows[0].weight || "—"}kg`}
                </span>
              </p>
              {previewIssues.length > 0 && (
                <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>预检提示：{previewIssues.join("；")}</span>
                </div>
              )}
            </div>
          )}

          {/* 4. 冲突策略 */}
          <div>
            <label className="label">④ 同日已有打卡记录时的处理策略</label>
            <div className="flex gap-2">
              {(
                [
                  { key: "skip" as ConflictStrategy, label: "跳过冲突（推荐）", desc: "当日已有记录则跳过该行，保留原数据" },
                  { key: "overwrite" as ConflictStrategy, label: "覆盖当日", desc: "以导入数据覆盖当日已有记录" },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStrategy(opt.key)}
                  title={opt.desc}
                  className={`flex-1 rounded-2xl border px-3 py-2 text-xs font-medium transition-all ${
                    strategy === opt.key
                      ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-950/50 dark:text-brand-300"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 导入结果 */}
          {result && (
            <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-[11px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
              <p className="text-xs font-semibold">
                导入完成：新增 {result.created} 条 · 覆盖 {result.updated} 条 · 跳过 {result.skipped} 条 · 失败 {result.errors.length} 条
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-28 space-y-0.5 overflow-y-auto border-t border-emerald-200/60 pt-1.5 dark:border-emerald-900/40">
                  {result.errors.map((e, i) => (
                    <p key={i}>
                      第 {e.row} 行（{e.date || "—"}）：{e.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 阶段与宝宝默认档案不一致确认提醒条 */}
          {stageMismatchConfirm && (
            <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50/95 p-4 text-xs shadow-lg dark:border-amber-700 dark:bg-amber-950/60">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    阶段类型与当前宝宝默认档案不一致提醒
                  </h4>
                  <p className="leading-relaxed text-amber-800 dark:text-amber-200">
                    检测到您在导入数据中填写的阶段为
                    <span className="mx-1 font-semibold text-brand-600 dark:text-brand-400">
                      【{stageMismatchConfirm.importedLabel}】
                    </span>
                    ，而系统当前设置的默认宝宝档案阶段为
                    <span className="mx-1 font-semibold text-purple-600 dark:text-purple-400">
                      【{stageMismatchConfirm.defaultProfileLabel}】
                    </span>
                    。
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    是否需要按照您填写的导入类型进行导入？请选择：
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-amber-200/80 pt-2 dark:border-amber-800/60">
                <button
                  type="button"
                  onClick={() => setStageMismatchConfirm(null)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => executeImport("default_profile")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                  disabled={submitting}
                >
                  否：按宝宝默认档案类型（{stageMismatchConfirm.defaultProfileLabel}）导入
                </button>
                <button
                  type="button"
                  onClick={() => executeImport("imported_type")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-600"
                  disabled={submitting}
                >
                  是：按导入类型（{stageMismatchConfirm.importedLabel}）导入
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary text-xs" disabled={submitting}>
              关闭
            </button>
            <button
              type="submit"
              className="btn-primary gap-1.5 text-xs shadow-md shadow-brand-500/20"
              disabled={submitting || parsedRows.length === 0}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {submitting ? "导入中…" : `导入 ${parsedRows.length} 条`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
