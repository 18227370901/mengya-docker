import { useState } from "react";
import {
  Sparkles,
  Bot,
  Activity,
  HeartPulse,
  Droplet,
  Utensils,
  Moon,
  Info,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { VitalsAnalysisResult } from "@/types/health";

interface VitalsAiAdviceCardProps {
  analysisResult: VitalsAnalysisResult | null;
  loading?: boolean;
  onReanalyze?: () => void;
}

export default function VitalsAiAdviceCard({
  analysisResult,
  loading = false,
  onReanalyze,
}: VitalsAiAdviceCardProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  if (!analysisResult) return null;

  const { completeness, bp_evaluation, glucose_evaluation, lifestyle_diet, ai_analysis } = analysisResult;

  return (
    <div className="card space-y-4 border-rose-100 bg-gradient-to-br from-white via-rose-50/20 to-amber-50/20 p-5 shadow-sm dark:border-gray-800 dark:from-gray-800 dark:to-gray-800">
      {/* 头部标题与收起/刷新 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100/60 pb-3 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white shadow-rose-200 shadow-md">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              生命体征临床分析与 AI 专家建议
              {ai_analysis?.used_config_name && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                  {ai_analysis.used_config_name}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-gray-400">
              权威医学指南规则校验 + AI 深度智能归因分析
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onReanalyze && (
            <button
              type="button"
              disabled={loading}
              onClick={onReanalyze}
              className="btn btn-secondary flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold text-gray-600 hover:text-rose-600 dark:text-gray-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              重新分析
            </button>
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {collapsed ? "展开详情" : "收起"}
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 核心板块 1：已录入与未录入完备度说明（满足用户强调的透明说明需求） */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 dark:border-sky-950/40 dark:bg-sky-950/20">
        <div className="flex items-center justify-between border-b border-sky-100/60 pb-2.5 dark:border-gray-800">
          <span className="flex items-center gap-1.5 text-xs font-bold text-sky-900 dark:text-sky-200">
            <Info className="h-4 w-4 text-sky-500" />
            本次数据录入与完备度说明
          </span>
          <span className="text-[11px] text-sky-600 dark:text-sky-300">
            已录 {completeness.recorded_count} 项 · 未录 {completeness.unrecorded_count} 项
          </span>
        </div>

        <div className="mt-3 space-y-2.5 text-xs">
          {/* 已录入项标签 */}
          {completeness.recorded_items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 font-medium text-gray-500">✅ 本次已录入：</span>
              {completeness.recorded_items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 font-semibold text-gray-800 shadow-2xs border border-sky-100 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                >
                  <span className="text-sky-600 font-bold">{item.label}</span>
                  <span>{item.value}</span>
                  <span className="rounded bg-sky-100 px-1 py-0.2 text-[10px] text-sky-700 dark:bg-sky-900 dark:text-sky-200">
                    {item.status_label || "正常"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 未录入项说明与指引 */}
          {completeness.unrecorded_items.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="font-medium text-gray-500 block">ℹ️ 本次未录入指标说明：</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {completeness.unrecorded_items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start gap-2 rounded-xl bg-white/80 p-2 text-[11px] leading-relaxed text-gray-600 border border-gray-100 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-300"
                  >
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-bold text-gray-500 dark:bg-gray-700">
                      {item.label}未测
                    </span>
                    <span className="flex-1 text-gray-500">{item.hint}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400 italic pt-1">
            {completeness.summary_text}
          </p>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* 核心板块 2：AI 深度解读文本 */}
          {ai_analysis?.response && (
            <div className="rounded-2xl border border-rose-100 bg-white p-4.5 shadow-2xs dark:border-gray-800 dark:bg-gray-800/80">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5 dark:border-gray-700 text-xs font-bold text-gray-800 dark:text-gray-100">
                <Bot className="h-4 w-4 text-rose-500" />
                <span>AI 专家智能归因与多维健康报告</span>
              </div>
              <div className="prose prose-xs mt-3 max-w-none text-gray-700 dark:prose-invert dark:text-gray-200 space-y-2 leading-relaxed">
                {ai_analysis.response.split(/\r?\n/).map((line, idx) => {
                  if (line.startsWith("### ")) {
                    return (
                      <h4 key={idx} className="mt-3 text-sm font-bold text-rose-700 dark:text-rose-400">
                        {line.replace("### ", "")}
                      </h4>
                    );
                  }
                  if (line.startsWith("#### ")) {
                    return (
                      <h5 key={idx} className="mt-2 text-xs font-bold text-gray-800 dark:text-gray-200">
                        {line.replace("#### ", "")}
                      </h5>
                    );
                  }
                  if (line.startsWith("- ")) {
                    return (
                      <p key={idx} className="text-xs pl-3 border-l-2 border-rose-200 dark:border-rose-900 my-1">
                        {line.replace("- ", "")}
                      </p>
                    );
                  }
                  if (line.startsWith("> ")) {
                    return (
                      <blockquote key={idx} className="rounded-xl bg-amber-50/60 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 my-2">
                        {line.replace("> ", "")}
                      </blockquote>
                    );
                  }
                  return line.trim() ? (
                    <p key={idx} className="text-xs">
                      {line}
                    </p>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* 核心板块 3：膳食与生活方式指导 */}
          {lifestyle_diet && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 饮食调理 */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 dark:border-emerald-950/40 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 border-b border-emerald-100/60 pb-2 dark:border-gray-800">
                  <Utensils className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    临床膳食方案（低钠 DASH / 低 GI 控糖）
                  </h4>
                </div>
                <ul className="mt-3 space-y-2 text-xs text-emerald-950 dark:text-emerald-100">
                  {lifestyle_diet.diet.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-emerald-500 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 生活作息 */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 dark:border-indigo-950/40 dark:bg-indigo-950/20">
                <div className="flex items-center gap-2 border-b border-indigo-100/60 pb-2 dark:border-gray-800">
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    日常体位与作息调理
                  </h4>
                </div>
                <ul className="mt-3 space-y-2 text-xs text-indigo-950 dark:text-indigo-100">
                  {lifestyle_diet.lifestyle.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-indigo-500 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
