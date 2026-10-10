import { useMemo, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Upload, X } from "lucide-react";
import { healthApi } from "@/api/services";
import type { CsvImportResult } from "@/types/health";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 导入成功后回调（提示文案） */
  onImported: (hint: string) => void;
}

type ImportTarget = "mom" | "baby";
type ConflictStrategy = "skip" | "overwrite";

/** CSV 表头模板（列序即解析序，表头行可选） */
const TEMPLATES: Record<ImportTarget, string[]> = {
  mom: ["date", "weight", "waist", "stage", "week", "note"],
  baby: ["date", "height", "weight", "head", "note"],
};

const TEMPLATE_HINTS: Record<ImportTarget, string> = {
  mom: "date 日期(YYYY-MM-DD)· weight 体重kg · waist 腹围cm(选填) · stage 阶段 pregnancy|postpartum|general(选填，默认按档案) · week 孕周(孕期必填) · note 备注(选填)",
  baby: "date 日期(YYYY-MM-DD) · height 身高cm · weight 体重kg · head 头围cm · note 备注(选填)",
};

/**
 * v1.57 CSV 健康数据批量导入弹窗（阶段三：临床实用赋能）
 * 面向蓝牙健康秤 / Apple Health 导出的历史体重数据（转 CSV 后导入），
 * 前端解析 + 预览校验 + 冲突策略选择，后端逐行校验入库（同日冲突支持跳过/覆盖）。
 */
export default function CsvImportModal({ isOpen, onClose, onImported }: CsvImportModalProps) {
  const [target, setTarget] = useState<ImportTarget>("mom");
  const [strategy, setStrategy] = useState<ConflictStrategy>("skip");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);

  /** 前端轻量 CSV 解析：按行拆分 + 逗号分列（支持无表头直接数据行；必须位于 isOpen 提前返回之前，hooks 数量恒定） */
  const parsedRows = useMemo(() => {
    if (!rawText.trim()) return [];
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const records: Array<Record<string, string>> = [];
    for (const line of lines) {
      // 表头行跳过
      if (/^date\s*[,，]/i.test(line)) continue;
      const cols = line.split(/[,，]/).map((c) => c.trim());
      const row: Record<string, string> = {};
      TEMPLATES[target].forEach((key, idx) => {
        row[key] = cols[idx] ?? "";
      });
      records.push(row);
    }
    return records.slice(0, 500);
  }, [rawText, target]);

  /** 本地预检：日期格式与必填数值的明显问题（不阻断提交，后端做最终校验） */
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
    if (badDate) issues.push(`${badDate} 行日期格式异常（应为 YYYY-MM-DD）`);
    if (missValue) issues.push(`${missValue} 行缺少必填数值`);
    const dates = parsedRows.map((r) => r.date);
    if (new Set(dates).size !== dates.length) issues.push("本次导入存在重复日期，同日仅保留/覆盖一条");
    return issues;
  }, [parsedRows, target]);

  // 性能优化注意：提前 return 必须位于全部 hooks（useState/useMemo/useEffect）之后，
  // 否则 isOpen 变化时 hooks 数量不一致触发 React #310 崩溃白屏
  if (!isOpen) return null;

  const templateLine = TEMPLATES[target].join(",");

  const handleFileRead = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result || ""));
    reader.onerror = () => setError("文件读取失败，请重试或直接粘贴文本");
    reader.readAsText(file, "utf-8");
  };

  const downloadTemplate = () => {
    const sample =
      target === "mom"
        ? `date,weight,waist,stage,week,note\n2026-09-01,58.2,86,,general,\n2026-09-08,58.6,,,general,\n`
        : `date,height,weight,head,note\n2026-09-01,92,13.8,48.5,\n2026-09-08,92.5,14.0,48.6,\n`;
    const blob = new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = target === "mom" ? "妈妈体重打卡导入模板.csv" : "宝宝生长测量导入模板.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (parsedRows.length === 0) {
      setError("未解析到有效数据行，请检查 CSV 内容或下载模板对照格式");
      return;
    }
    setSubmitting(true);
    try {
      const res = await healthApi.batchImport({
        target,
        conflict_strategy: strategy,
        records: parsedRows,
      });
      setResult(res);
      if (res.errors.length === 0) {
        onImported(`CSV 导入完成：新增 ${res.created} 条，覆盖 ${res.updated} 条，跳过 ${res.skipped} 条`);
      }
    } catch (err: any) {
      setError(err?.message || "导入请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800 dark:text-gray-100">
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
            <FileUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">健康数据 CSV 批量导入</h3>
            <p className="text-xs text-gray-400">
              蓝牙健康秤 / Apple Health 历史体重导出为 CSV 后导入 · 单次上限 500 条 · 同日冲突可跳过或覆盖
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 导入对象 */}
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
                  }}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                    target === opt.key
                      ? "bg-brand-500 text-white shadow-xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">列格式：{TEMPLATE_HINTS[target]}</p>
          </div>

          {/* CSV 内容输入 */}
          <div>
            <label className="label flex items-center justify-between">
              <span>② 选择 CSV 文件或粘贴内容</span>
              <button type="button" onClick={downloadTemplate} className="text-[11px] text-brand-500 hover:underline">
                下载导入模板
              </button>
            </label>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-200 py-3 text-xs text-brand-500 transition hover:bg-brand-50 dark:border-brand-900 dark:hover:bg-brand-950/30">
                <Upload className="h-4 w-4" />
                {fileName || "点击选择 .csv / .txt 文件（UTF-8）"}
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
                className="input text-[11px] leading-relaxed"
                placeholder={`也可直接粘贴 CSV 文本，首行表头可省略：\n${templateLine}\n2026-09-01,58.2,86,,general,`}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setResult(null);
                }}
              />
            </div>
          </div>

          {/* 预览 */}
          {parsedRows.length > 0 && (
            <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-[11px] text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
              <p>
                已解析 <b className="text-gray-700 dark:text-gray-200">{parsedRows.length}</b> 行数据
                {parsedRows.length >= 500 && "（已达单次 500 条上限，超出部分将被忽略）"}
                ，首行示例：{parsedRows[0].date} · {target === "mom" ? `体重 ${parsedRows[0].weight || "—"}kg` : `身高 ${parsedRows[0].height || "—"}cm`}
              </p>
              {previewIssues.length > 0 && (
                <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>预检提示：{previewIssues.join("；")}</span>
                </div>
              )}
            </div>
          )}

          {/* 冲突策略 */}
          <div>
            <label className="label">③ 同日已有记录时的处理策略</label>
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
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
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
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
              <p className="text-xs font-semibold">
                导入完成：新增 {result.created} 条 · 覆盖 {result.updated} 条 · 跳过 {result.skipped} 条 · 失败 {result.errors.length} 条
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-28 space-y-0.5 overflow-y-auto border-t border-emerald-200/60 pt-1 dark:border-emerald-900/40">
                  {result.errors.map((e, i) => (
                    <p key={i}>
                      第 {e.row} 行（{e.date || "—"}）：{e.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary text-xs" disabled={submitting}>
              关闭
            </button>
            <button type="submit" className="btn-primary gap-1.5 text-xs shadow-md shadow-brand-500/20" disabled={submitting || parsedRows.length === 0}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {submitting ? "导入中…" : `导入 ${parsedRows.length} 条`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
