import React, { useEffect, useState, useRef } from "react";
import { Sparkles, X } from "lucide-react";

export interface ProgressStage {
  threshold: number;
  text: string;
}

interface AiProgressModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  stages?: ProgressStage[];
  onCancel: () => void;
  cancelText?: string;
}

const DEFAULT_STAGES: ProgressStage[] = [
  { threshold: 0, text: "正在初始化 AI 大模型与分析引擎..." },
  { threshold: 25, text: "正在联网检索核心指标与参考数据..." },
  { threshold: 55, text: "母婴专业 AI 正在综合多维数据进行深度推理..." },
  { threshold: 82, text: "正在规整并校验生成建议与重点提示..." },
  { threshold: 95, text: "即将呈现分析结论，请稍候..." },
];

export default function AiProgressModal({
  isOpen,
  title = "AI 正在分析处理中...",
  description,
  stages = DEFAULT_STAGES,
  onCancel,
  cancelText = "取消操作",
}: AiProgressModalProps) {
  const [percent, setPercent] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // 保持 onCancel 引用解耦，绝不因父组件重渲染重跑计时器
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!isOpen) {
      setPercent(5);
      setSeconds(0);
      startTimeRef.current = 0;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    setPercent(5);
    setSeconds(0);

    // 基于真实物理时间戳（Wall-clock time）平滑递增，彻底免疫 Alt+Tab 标签页后台节流与重聚焦
    timerRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startTimeRef.current;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      setSeconds(elapsedSec);

      // 非线性平滑进度算法：前 3 秒快速到 30%，10 秒到 65%，20 秒到 85%，上限 94%
      let targetPercent = 5;
      if (elapsedMs < 3000) {
        targetPercent = 5 + (elapsedMs / 3000) * 25; // 5% -> 30%
      } else if (elapsedMs < 10000) {
        targetPercent = 30 + ((elapsedMs - 3000) / 7000) * 35; // 30% -> 65%
      } else if (elapsedMs < 25000) {
        targetPercent = 65 + ((elapsedMs - 10000) / 15000) * 20; // 65% -> 85%
      } else if (elapsedMs < 50000) {
        targetPercent = 85 + ((elapsedMs - 25000) / 25000) * 9; // 85% -> 94%
      } else {
        targetPercent = 94;
      }

      setPercent(Math.min(94, Math.max(5, Math.round(targetPercent))));
    }, 250);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancelRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // 根据当前进度查找匹配的阶段文案
  const sortedStages = [...stages].sort((a, b) => b.threshold - a.threshold);
  const currentStage = sortedStages.find((s) => percent >= s.threshold) || stages[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
        {/* 右上角关闭/取消按钮 */}
        <button
          type="button"
          onClick={() => onCancelRef.current()}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="点击取消 (Esc)"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 顶部图标与标题 */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500/10 via-purple-500/15 to-pink-500/10 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="h-7 w-7 animate-pulse text-indigo-500" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
            </span>
          </div>

          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          {description && (
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>

        {/* 进度百分比与进度条 */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
              {currentStage?.text}
            </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums text-sm">
              {percent}%
            </span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>已耗时：{seconds} 秒</span>
            <span>大模型思考与联网检索中</span>
          </div>
        </div>

        {/* 底部取消按钮 */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onCancelRef.current()}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2 text-xs font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
