import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChefHat, Leaf, Search, X } from "lucide-react";
import { recipeApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { Recipe } from "@/types";
import CopyButton from "@/components/CopyButton";

const PERIOD_TABS = [
  { key: "month_1_2", label: "孕1-2月", desc: "孕早期", short: "1-2月", weeks: "1-8周" },
  { key: "month_3_4", label: "孕3-4月", desc: "孕中期", short: "3-4月", weeks: "9-16周" },
  { key: "month_5_6", label: "孕5-6月", desc: "孕中期", short: "5-6月", weeks: "17-24周" },
  { key: "month_7_8", label: "孕7-8月", desc: "孕晚期", short: "7-8月", weeks: "25-32周" },
  { key: "month_9_10", label: "孕9-10月", desc: "孕晚期", short: "9-10月", weeks: "33-40周" },
];

// 营养标签颜色映射
const NUTRIENT_COLORS: Record<string, string> = {
  "叶酸": "bg-green-100 text-green-700",
  "维生素C": "bg-orange-100 text-orange-700",
  "维生素B₆": "bg-blue-100 text-blue-700",
  "维生素B₂": "bg-cyan-100 text-cyan-700",
  "维生素A": "bg-amber-100 text-amber-700",
  "维生素D": "bg-yellow-100 text-yellow-700",
  "钙": "bg-teal-100 text-teal-700",
  "铁": "bg-red-100 text-red-700",
  "锌": "bg-purple-100 text-purple-700",
  "镁": "bg-indigo-100 text-indigo-700",
  "膳食纤维": "bg-lime-100 text-lime-700",
  "碳水化合物": "bg-stone-100 text-stone-700",
  "脑黄金": "bg-pink-100 text-pink-700",
  "硫胺素": "bg-sky-100 text-sky-700",
};

function getNutrientColor(tag: string): string {
  return NUTRIENT_COLORS[tag] || "bg-gray-100 text-gray-600";
}

export default function PregnancyRecipePage() {
  const { stage } = useAuthStore();
  const [activeTab, setActiveTab] = useState("month_1_2");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [nutrientFilter, setNutrientFilter] = useState<string>("");
  const [nutrientTags, setNutrientTags] = useState<{ nutrient_tag: string; count: number }[]>([]);
  const [showNutrientFilter, setShowNutrientFilter] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖 300ms
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);

  // 切换 tab 时重置展开态
  useEffect(() => {
    setExpandedId(null);
  }, [activeTab]);

  // 根据用户孕周自动定位到对应月份组
  useEffect(() => {
    if (stage?.is_pregnant && stage.value) {
      const week = stage.value;
      let targetTab = "month_1_2";
      if (week >= 9 && week <= 16) targetTab = "month_3_4";
      else if (week >= 17 && week <= 24) targetTab = "month_5_6";
      else if (week >= 25 && week <= 32) targetTab = "month_7_8";
      else if (week >= 33) targetTab = "month_9_10";
      setActiveTab(targetTab);
    }
  }, [stage]);

  // 获取营养标签
  useEffect(() => {
    recipeApi.nutrients().then(setNutrientTags).catch(() => {});
  }, []);

  // 获取食谱列表
  useEffect(() => {
    setLoading(true);
    const params: { period_month: string; nutrient?: string; search?: string } = {
      period_month: activeTab,
    };
    if (nutrientFilter) params.nutrient = nutrientFilter;
    if (debouncedSearch) params.search = debouncedSearch;
    recipeApi
      .list(params)
      .then(setRecipes)
      .catch(() => setRecipes([]))
      .finally(() => setLoading(false));
  }, [activeTab, nutrientFilter, debouncedSearch]);

  const currentTabInfo = PERIOD_TABS.find((t) => t.key === activeTab);
  const filteredCount = recipes.length;

  // 按营养标签分组统计
  const nutrientStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const r of recipes) {
      if (r.nutrient_tag) {
        stats[r.nutrient_tag] = (stats[r.nutrient_tag] || 0) + 1;
      }
    }
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [recipes]);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">孕期食谱</h1>
          <p className="mt-1 text-sm text-gray-400">288道专属怀孕餐，养胎瘦身两不误</p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">
          共 {filteredCount} 道
        </span>
      </div>

      {/* 孕期月份标签 */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <div className="flex flex-col items-center">
                <span>{tab.label}</span>
                <span className={`text-xs ${activeTab === tab.key ? "text-white/80" : "text-gray-400"}`}>
                  {tab.weeks}
                </span>
              </div>
            </button>
          ))}
        </div>
        {stage?.is_pregnant && stage.value && (
          <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600">
            根据您当前的孕周（第{stage.value}周），已为您定位到「{currentTabInfo?.label}」食谱
          </div>
        )}
      </div>

      {/* 搜索 + 营养标签筛选 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索菜品名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-brand-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowNutrientFilter(!showNutrientFilter)}
          className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm transition ${
            nutrientFilter || showNutrientFilter
              ? "border-brand-400 bg-brand-50 text-brand-600"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Leaf className="h-4 w-4" />
          {nutrientFilter || "营养筛选"}
          {nutrientFilter && (
            <X
              className="h-3 w-3"
              onClick={(e) => {
                e.stopPropagation();
                setNutrientFilter("");
              }}
            />
          )}
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* 营养标签筛选面板 */}
      {showNutrientFilter && (
        <div className="card p-4">
          <div className="mb-2 text-xs font-medium text-gray-400">按营养素筛选</div>
          <div className="flex flex-wrap gap-2">
            {nutrientTags.map((tag) => (
              <button
                key={tag.nutrient_tag}
                onClick={() => {
                  setNutrientFilter(nutrientFilter === tag.nutrient_tag ? "" : tag.nutrient_tag);
                  setShowNutrientFilter(false);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  nutrientFilter === tag.nutrient_tag
                    ? "bg-brand-500 text-white"
                    : getNutrientColor(tag.nutrient_tag)
                }`}
              >
                {tag.nutrient_tag} ({tag.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 当前分组的营养标签统计 */}
      {!nutrientFilter && !searchTerm && nutrientStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nutrientStats.map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => setNutrientFilter(tag)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${getNutrientColor(tag)}`}
            >
              {tag} {count}道
            </button>
          ))}
        </div>
      )}

      {/* 食谱列表 */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">加载中...</div>
      ) : recipes.length === 0 ? (
        <div className="card py-12 text-center text-sm text-gray-400">
          {searchTerm || nutrientFilter ? "没有找到匹配的食谱" : "暂无食谱数据"}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="card overflow-hidden transition hover:shadow-md"
            >
              {/* 菜品标题行 */}
              <div
                className="flex cursor-pointer items-start justify-between p-4"
                onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-brand-500" />
                    <h3 className="font-semibold text-gray-800">{recipe.title}</h3>
                  </div>
                  {recipe.nutrient_tag && (
                    <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getNutrientColor(recipe.nutrient_tag)}`}>
                      {recipe.nutrient_tag}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-gray-400 transition ${
                    expandedId === recipe.id ? "rotate-180" : ""
                  }`}
                />
              </div>

              {/* 展开内容 */}
              {expandedId === recipe.id && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  {/* 材料 */}
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-500">材料</h4>
                      <CopyButton text={recipe.ingredients} />
                    </div>
                    <p className="text-sm leading-relaxed text-gray-700">{recipe.ingredients}</p>
                  </div>

                  {/* 做法 */}
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-500">做法</h4>
                      <CopyButton text={recipe.steps} label="复制做法" />
                    </div>
                    <div className="space-y-1">
                      {recipe.steps.split("\n").map((step, idx) => (
                        <p key={idx} className="text-sm leading-relaxed text-gray-700">
                          {step}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* 营养小叮咛 */}
                  {recipe.nutrition_tip && (
                    <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-amber-600">营养小叮咛</h4>
                        <CopyButton text={recipe.nutrition_tip} />
                      </div>
                      <p className="text-xs leading-relaxed text-amber-700">{recipe.nutrition_tip}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
