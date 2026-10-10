import { useState } from "react";
import { Utensils, ShieldCheck, ExternalLink, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import type { RecipeRecommendationItem } from "@/types/health";

interface DietPlanCardProps {
  meals: RecipeRecommendationItem[];
  calorieBudget?: string;
  disclaimer?: string;
}

export default function DietPlanCard({
  meals,
  calorieBudget,
  disclaimer,
}: DietPlanCardProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100/60 pb-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <Utensils className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              个性化一日五餐方案 (双通道食谱)
            </h3>
            <p className="text-xs text-gray-400">
              平台营养库优先匹配 · 权威健康搜索降级 · 严谨孕产禁忌食材过滤
            </p>
          </div>
        </div>

        {calorieBudget && (
          <div className="rounded-xl bg-orange-50/70 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
            推荐能量预算：{calorieBudget}
          </div>
        )}
      </div>

      {/* 安全合规绿盾横幅 */}
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3.5 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          <b>孕产安全审查通过：</b>
          所有餐品已通过黑名单过滤，杜绝生食刺身、未经巴氏灭菌奶类、高汞深海鱼、过量山楂及甲鱼等活血刺激物。
        </span>
      </div>

      {/* 一日五餐卡片列表 */}
      <div className="grid grid-cols-1 gap-3.5">
        {meals.map((meal, idx) => {
          const isPlatform = meal.source_type === "platform";
          const isExpanded = expandedIndex === idx;

          return (
            <div
              key={idx}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-2xs transition hover:border-brand-200 dark:border-gray-800 dark:bg-gray-900/70 dark:hover:border-gray-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {meal.meal_type === "breakfast"
                        ? "早餐"
                        : meal.meal_type === "morning_snack"
                        ? "上午加餐"
                        : meal.meal_type === "lunch"
                        ? "午餐"
                        : meal.meal_type === "afternoon_snack"
                        ? "下午加餐"
                        : "晚餐"}
                    </span>

                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                      {meal.meal_name}
                    </h4>

                    {/* 双通道徽章 */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isPlatform
                          ? "bg-orange-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {meal.source_badge}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">营养亮点：</span>
                    {meal.benefits}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {meal.source_url && (
                    <a
                      href={meal.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <span>原文链接</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}

                  {meal.ingredients && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(idx)}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-500"
                    >
                      <span>{isExpanded ? "收起明细" : "食材做法"}</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* 展开的食材与制作步骤 */}
              {isExpanded && (
                <div className="mt-3 space-y-2 rounded-xl bg-orange-50/40 p-3 text-xs text-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
                  <div>
                    <span className="font-bold text-brand-600 dark:text-brand-400">【推荐食材】：</span>
                    {meal.ingredients}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 权威医学免责声明 */}
      {disclaimer && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs leading-relaxed text-amber-900/90 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300/90">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{disclaimer}</span>
        </div>
      )}
    </div>
  );
}
