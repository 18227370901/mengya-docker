import { Fragment, useRef, useState } from "react";
import { FileDown, FileText, Loader2, Printer, X, Download } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type { BmiAnalysisResult, BmiTimeSeriesRecord } from "@/types/health";

interface HealthReportExportProps {
  /** 全量妈妈时序打卡记录（报告明细表数据源） */
  records: BmiTimeSeriesRecord[];
  /** 最近一次分析评估结果（可选，无分析时仅导出数据报告） */
  result: BmiAnalysisResult | null;
}

/** 报告头部标题区（A4 预览 DOM 内复用） */
function ReportHeader({ nickname, stageLabel, generatedAt }: { nickname: string; stageLabel: string; generatedAt: string }) {
  return (
    <div className="flex items-start justify-between border-b-2 border-orange-500 pb-3">
      <div>
        <h1 className="text-xl font-black text-gray-900">孕产健康评估报告</h1>
        <p className="mt-1 text-[11px] text-gray-500">评估标准：国家卫生健康委 WS/T 801-2022 · 中国成人 BMI 标准</p>
      </div>
      <div className="text-right text-[11px] leading-5 text-gray-500">
        <div className="font-semibold text-gray-700">萌芽母婴平台</div>
        <div>用户：{nickname}（{stageLabel}）</div>
        <div>生成时间：{generatedAt}</div>
      </div>
    </div>
  );
}

/**
 * v1.57 孕产健康评估报告导出（阶段三：临床实用赋能）
 * - 浏览器打印：隐藏 iframe 注入报告 DOM + 站点样式，A4 纸打印（亦可打印另存为 PDF）
 * - PDF 下载：动态 import html2canvas + jsPDF（构建自动独立分包，不影响首屏体积）
 */
export default function HealthReportExport({ records, result }: HealthReportExportProps) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);

  const sorted = [...records].sort((a, b) =>
    a.record_date === b.record_date ? a.id - b.id : a.record_date < b.record_date ? -1 : 1
  );
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const stageLabel =
    latest?.stage === "general"
      ? "非孕期/日常管理"
      : latest?.stage === "postpartum"
      ? latest.postpartum_months != null
        ? `产后 ${latest.postpartum_months} 个月`
        : "产后恢复期"
      : latest?.gestational_week
      ? `孕 ${latest.gestational_week} 周`
      : user?.is_pregnant
      ? "孕期"
      : "备孕/日常";
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const evalData = result?.evaluation;

  const currentBmi =
    latest && latest.height && latest.weight
      ? +(latest.weight / (latest.height / 100) ** 2).toFixed(1)
      : null;

  const handlePrint = () => {
    if (!reportRef.current) return;
    // 隐藏 iframe 注入报告 DOM + 站点全部样式（Tailwind 类在构建 CSS 中已包含报告 DOM 的类名）
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>孕产健康评估报告</title></head><body style="margin:0;background:#fff;"></body></html>`
    );
    doc.close();
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      try {
        doc.head.appendChild(node.cloneNode(true));
      } catch {
        /* 样式复制失败时浏览器默认样式兜底 */
      }
    });
    doc.body.innerHTML = reportRef.current.outerHTML;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current || pdfLoading) return;
    setPdfLoading(true);
    setError("");
    try {
      // 动态加载（vite 自动分包：仅点击导出时才下载 pdf 工具链 chunk）
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let offset = 0;
      let pageNum = 0;
      // 逐页切片：以负偏移方式将长图按 A4 页高切页（首尾页自动对齐）
      while (offset < imgH - 1) {
        if (pageNum > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, -offset, imgW, imgH);
        offset += pageH;
        pageNum += 1;
      }
      const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      pdf.save(`萌芽孕产健康评估报告_${dateStamp}.pdf`);
    } catch (e: any) {
      setError(e?.message || "PDF 生成失败，请尝试浏览器打印（选择另存为 PDF）");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      {/* 导出入口按钮（挂 BmiAnalysisView 模块头部） */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={records.length === 0}
        title={records.length === 0 ? "完成一次打卡后可导出报告" : "导出 A4 评估报告（打印 / PDF 下载）"}
        className="btn-secondary gap-1.5 text-xs shadow-2xs disabled:opacity-50"
      >
        <FileDown className="h-3.5 w-3.5" />
        导出评估报告
      </button>

      {/* 报告预览弹窗（预览容器即导出 DOM：所见即所得） */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative my-4 w-full max-w-[860px]">
            {/* 操作栏 */}
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-lg dark:bg-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                A4 评估报告预览 · 共 {sorted.length} 条时序打卡
                {error && <span className="ml-2 text-red-500">{error}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handlePrint} className="btn-secondary gap-1.5 text-xs">
                  <Printer className="h-3.5 w-3.5" />
                  打印
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="btn-primary gap-1.5 text-xs"
                >
                  {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {pdfLoading ? "正在生成 PDF…" : "下载 PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* A4 报告主体（导出源 DOM） */}
            <div ref={reportRef} className="mx-auto w-[794px] bg-white p-10 text-gray-900 shadow-2xl" style={{ fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif' }}>
              <ReportHeader nickname={user?.nickname || user?.username || "妈妈用户"} stageLabel={stageLabel} generatedAt={generatedAt} />

              {/* 一、基本信息 */}
              <h2 className="mt-5 border-l-4 border-orange-500 pl-2 text-sm font-bold">一、基本信息</h2>
              <table className="mt-2 w-full border-collapse text-xs">
                <tbody>
                  {[0, 1].map((row) => (
                    <tr key={row}>
                      {[
                        { label: "身高", value: latest?.height ? `${latest.height} cm` : "—" },
                        { label: "当前体重", value: latest ? `${latest.weight} kg` : "—" },
                        {
                          label: "当前测算 BMI",
                          value:
                            currentBmi != null
                              ? `${currentBmi}（${currentBmi < 18.5 ? "偏瘦" : currentBmi < 24 ? "正常" : currentBmi < 28 ? "超重" : "肥胖"}）`
                              : "—",
                        },
                        { label: "记录阶段", value: stageLabel },
                        { label: "打卡次数", value: `${sorted.length} 次` },
                        { label: "孕前 BMI 基线", value: latest?.bmi != null ? String(latest.bmi) : "—" },
                      ]
                        .slice(row * 3, row * 3 + 3)
                        .map((cell) => (
                          <Fragment key={cell.label}>
                            <td className="w-[16%] border border-gray-200 bg-gray-50 px-2 py-1.5 font-semibold text-gray-600">
                              {cell.label}
                            </td>
                            <td className="border border-gray-200 px-2 py-1.5">{cell.value}</td>
                          </Fragment>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 二、本次评估结论（最近一次分析） */}
              <h2 className="mt-5 border-l-4 border-orange-500 pl-2 text-sm font-bold">二、本次评估结论</h2>
              {evalData ? (
                <table className="mt-2 w-full border-collapse text-xs">
                  <tbody>
                    <tr>
                      <td className="w-[18%] border border-gray-200 bg-gray-50 px-2 py-1.5 font-semibold text-gray-600">孕前 BMI 分级</td>
                      <td className="border border-gray-200 px-2 py-1.5">
                        {evalData.bmi}（{evalData.category_label}）
                      </td>
                      <td className="w-[20%] border border-gray-200 bg-gray-50 px-2 py-1.5 font-semibold text-gray-600">全孕期适宜总增重</td>
                      <td className="border border-gray-200 px-2 py-1.5">
                        {evalData.recommended_total_gain_min ?? "—"} ~ {evalData.recommended_total_gain_max ?? "—"} kg
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 bg-gray-50 px-2 py-1.5 font-semibold text-gray-600">
                        {evalData.stage_type === "postpartum" ? "产后滞留体重" : "当期适宜增重"}
                      </td>
                      <td className="border border-gray-200 px-2 py-1.5">
                        {evalData.current_week_target_min ?? "—"} ~ {evalData.current_week_target_max ?? "—"} kg
                      </td>
                      <td className="border border-gray-200 bg-gray-50 px-2 py-1.5 font-semibold text-gray-600">实际增重与判定</td>
                      <td className="border border-gray-200 px-2 py-1.5">
                        {evalData.actual_gain > 0 ? "+" : ""}
                        {evalData.actual_gain} kg（{evalData.gain_status_label || "—"}）
                      </td>
                    </tr>
                    {result?.alerts && result.alerts.length > 0 && (
                      <tr>
                        <td className="border border-gray-200 bg-red-50 px-2 py-1.5 font-semibold text-red-600">医学风险预警</td>
                        <td colSpan={3} className="border border-gray-200 px-2 py-1.5 leading-relaxed">
                          {result.alerts.map((a) => `【${a.title}】${a.description} 建议：${a.action_advice}`).join("；")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 rounded border border-dashed border-gray-300 p-3 text-xs text-gray-400">
                  尚未进行「一键分析评估」，报告暂含时序数据明细；建议先在妈妈·孕产档案完成一次分析后再导出。
                </p>
              )}

              {/* 三、时序测量明细 */}
              <h2 className="mt-5 border-l-4 border-orange-500 pl-2 text-sm font-bold">三、时序测量打卡明细</h2>
              <table className="mt-2 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-orange-50 text-gray-600">
                    <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">测量日期</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">阶段</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-right font-semibold">体重 (kg)</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-right font-semibold">BMI</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-right font-semibold">增量 (kg)</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-center font-semibold">判定</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sorted].reverse().map((r) => {
                    const stage =
                      r.stage === "general"
                        ? "非孕期"
                        : r.stage === "postpartum"
                        ? r.postpartum_months != null
                          ? `产后${r.postpartum_months}月`
                          : "产后"
                        : r.gestational_week
                        ? `孕${r.gestational_week}周`
                        : "孕期";
                    const bmi = r.height && r.weight ? +((r.weight / (r.height / 100) ** 2)).toFixed(1) : "—";
                    return (
                      <tr key={r.id}>
                        <td className="border border-gray-200 px-2 py-1.5">{r.record_date}</td>
                        <td className="border border-gray-200 px-2 py-1.5">{stage}</td>
                        <td className="border border-gray-200 px-2 py-1.5 text-right">{r.weight}</td>
                        <td className="border border-gray-200 px-2 py-1.5 text-right">{bmi}</td>
                        <td className="border border-gray-200 px-2 py-1.5 text-right">
                          {r.delta_kg > 0 ? "+" : ""}
                          {r.delta_kg}
                        </td>
                        <td className="border border-gray-200 px-2 py-1.5 text-center">
                          {r.gain_status === "normal" ? "达标" : r.gain_status === "below" ? "偏低" : r.gain_status === "above" ? "超标" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* 免责声明 */}
              <div className="mt-6 rounded border border-gray-200 bg-gray-50 p-3 text-[10px] leading-relaxed text-gray-500">
                【医学免责声明】本报告依据国家卫生健康委《妊娠期妇女体重增长推荐值标准》(WS/T 801-2022)与《中国居民膳食指南》自动生成，
                仅供孕产期自我健康监测参考，不能替代临床医生的个体化诊疗处方。若合并严重高血压、蛋白尿、剧烈腹痛、剧吐脱水或胎动异常，
                请立即前往正规医院产科就诊。报告数据由用户自主录入，平台不对其测量准确性作出担保。
                <div className="mt-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> 萌芽母婴平台 · 孕产健康评估报告 v1.57
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
