import { Dumbbell, HeartHandshake } from "lucide-react";
import type { LifestyleAdvice } from "@/types/health";

interface LifestyleCareCardProps {
  advice?: LifestyleAdvice;
}

export default function LifestyleCareCard({ advice }: LifestyleCareCardProps) {
  if (!advice || (!advice.exercise?.length && !advice.psychological_care?.length)) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 运动处方 */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 border-b border-orange-100/60 pb-2 dark:border-gray-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
            <Dumbbell className="h-4 w-4" />
          </div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">
            阶段适宜运动处方
          </h4>
        </div>

        <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
          {advice.exercise.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-500" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 情绪与心理关怀 */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 border-b border-orange-100/60 pb-2 dark:border-gray-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <HeartHandshake className="h-4 w-4" />
          </div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">
            孕产情绪与心理关怀
          </h4>
        </div>

        <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
          {advice.psychological_care.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
