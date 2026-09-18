import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronLeft, Filter, Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { productApi } from "@/api/catalog";
import { compareApi } from "@/api/compare";
import type { CompareResult, Product } from "@/types";
import ComparisonRadar from "@/components/ComparisonRadar";

const MAX_COMPARE = 4;

const CATEGORIES = [
  { key: "", label: "全部分类" },
  { key: "food", label: "食品类" },
  { key: "feeding", label: "食具类" },
  { key: "clothing", label: "服装及布类" },
  { key: "diaper", label: "尿裤类" },
  { key: "bedding", label: "寝具类" },
  { key: "furniture", label: "家具类" },
  { key: "bath", label: "洗护日用品类" },
  { key: "health_tool", label: "护理工具类" },
  { key: "travel", label: "出行类" },
  { key: "toy", label: "启智早教类" },
  { key: "mama_pregnancy", label: "妈妈用品-孕期" },
  { key: "mama_postpartum", label: "妈妈用品-产后" },
  { key: "mama_nursing", label: "妈妈用品-哺乳" },
  { key: "appliance", label: "电子电器类" },
];

const PRICE_RANGES = [
  { key: "", label: "全部价格", min: 0, max: Infinity },
  { key: "lt100", label: "100元以下", min: 0, max: 100 },
  { key: "100to500", label: "100-500元", min: 100, max: 500 },
  { key: "500to1000", label: "500-1000元", min: 500, max: 1000 },
  { key: "gt1000", label: "1000元以上", min: 1000, max: Infinity },
];

const AGE_RANGES = [
  { key: "", label: "全部年龄" },
  { key: "0-6m", label: "0-6个月" },
  { key: "6-12m", label: "6-12个月" },
  { key: "1-3y", label: "1-3岁" },
  { key: "3-6y", label: "3-6岁" },
];

export default function ComparePage() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [error, setError] = useState("");
  const [showResult, setShowResult] = useState(false);

  // 筛选
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPrice, setFilterPrice] = useState("");
  const [filterAge, setFilterAge] = useState("");

  useEffect(() => {
    productApi.listAll({ sort: "rating" }).then(setAllProducts).catch(() => {});
  }, []);

  // 筛选后的商品列表
  const filteredProducts = allProducts.filter((p) => {
    if (filterCategory && p.first_category !== filterCategory) return false;
    if (filterPrice) {
      const range = PRICE_RANGES.find((r) => r.key === filterPrice);
      if (range) {
        const avg = p.price_info?.avg || 0;
        if (avg < range.min || avg >= range.max) return false;
      }
    }
    if (filterAge) {
      const ageStart = p.applicable_age_start ?? 0;
      const ageEnd = p.applicable_age_end ?? 72;
      const monthMap: Record<string, [number, number]> = {
        "0-6m": [0, 6],
        "6-12m": [6, 12],
        "1-3y": [12, 36],
        "3-6y": [36, 72],
      };
      const [min, max] = monthMap[filterAge] || [0, 72];
      if (ageEnd < min || ageStart > max) return false;
    }
    return true;
  });

  const toggle = (id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) {
        setError(`最多同时对比 ${MAX_COMPARE} 款商品`);
        return prev;
      }
      setError("");
      return [...prev, id];
    });
  };

  const runCompare = async () => {
    if (selected.length < 2) {
      setError("请至少选择 2 款商品进行对比");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await compareApi.compare(selected);
      setResult(data);
      setShowResult(true);
    } catch (err) {
      console.error("[Compare] 对比失败:", err);
      setError(err instanceof Error ? err.message : "对比失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const runAiCompare = async () => {
    if (!result) return;
    setAiLoading(true);
    try {
      const data = await compareApi.aiCompare(selected, aiQuery || "请从安全、功能、性价比三个维度给出购买建议");
      setAiAnswer(data.response);
    } catch {
      setAiAnswer("AI 分析暂时不可用，请稍后再试");
    } finally {
      setAiLoading(false);
    }
  };

  // ===== 对比详情页 =====
  if (showResult && result) {
    return (
      <div className="space-y-6">
        {/* 返回选品 */}
        <button
          className="flex items-center gap-1.5 text-sm text-brand-500 hover:underline"
          onClick={() => setShowResult(false)}
        >
          <ChevronLeft className="h-4 w-4" /> 返回选品
        </button>

        <div>
          <h1 className="text-2xl font-bold text-gray-800">对比详情</h1>
          <p className="mt-1 text-sm text-gray-400">五维评分雷达图 + 全渠道比价 + AI 推荐</p>
        </div>

        {/* 已选商品概览 */}
        <section className="card">
          <h2 className="mb-3 font-semibold text-gray-800">对比商品（{selected.length}）</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {selected.map((id) => {
              const p = allProducts.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                  <img src={p.image_url} alt={p.name} className="h-16 w-full rounded-lg object-cover" />
                  <p className="mt-2 line-clamp-1 text-sm font-medium text-gray-700">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.brand}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 五维评分雷达图 */}
        <section className="card">
          <h2 className="mb-3 font-semibold text-gray-800">五维评分雷达图</h2>
          <ComparisonRadar data={result.radar} />
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(result.dimensions || {}).map(([k, v]) => (
              <span key={k} className="tag">{v}</span>
            ))}
          </div>
        </section>

        {/* 价格对比 */}
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold text-gray-800">价格对比</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-400">
                <th className="py-2 pr-3">商品</th>
                {(result.price_comparison?.platforms || []).map((p) => (
                  <th key={p} className="py-2 pr-3">
                    {(result.price_comparison?.platform_labels || {})[p] || p}
                  </th>
                ))}
                <th className="py-2">均价</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(result.price_comparison?.products || {}).map((pc) => (
                <tr key={pc.name} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-medium text-gray-700">{pc.name}</td>
                  {(result.price_comparison?.platforms || []).map((pl) => (
                    <td key={pl} className="py-2 pr-3 text-gray-500">
                      {pc.prices[pl] ? `¥${pc.prices[pl]}` : "-"}
                    </td>
                  ))}
                  <td className="py-2 font-semibold text-brand-600">
                    ¥{pc.avg}
                    {pc.range && <span className="ml-1 text-xs font-normal text-gray-400">（{pc.range}）</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* AI 推荐 */}
        <section className="card">
          <h2 className="mb-3 font-semibold text-gray-800">AI 购买建议</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {result.recommendation?.labels?.map((r) => (
              <span key={r.product_id} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-600">
                {r.label}：{r.desc}
              </span>
            ))}
          </div>
          {result.recommendation?.alerts?.length > 0 && (
            <div className="mb-3 space-y-1">
              {result.recommendation.alerts.map((a) => (
                <p key={a.product_id} className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {a.product_name}：{a.alert}
                </p>
              ))}
            </div>
          )}
          <input
            className="input"
            placeholder="输入你的问题，例如：哪款更适合新生儿？"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
          />
          <button className="btn-secondary mt-2 w-full" onClick={runAiCompare} disabled={aiLoading}>
            {aiLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {aiLoading ? "AI 思考中…" : "让 AI 给建议"}
          </button>
          {aiAnswer && (
            <div className="mt-3 whitespace-pre-wrap rounded-xl bg-cream p-4 text-sm leading-relaxed text-gray-700">
              {aiAnswer}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ===== 选品页面 =====
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">产品对比</h1>
        <p className="mt-1 text-sm text-gray-400">选择 2-4 款商品，五维评分雷达图 + 全渠道比价 + AI 推荐</p>
      </div>

      {/* 已选商品 */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">已选商品（{selected.length}/{MAX_COMPARE}）</h2>
          {selected.length > 0 && (
            <button className="text-sm text-brand-500 hover:underline" onClick={() => setSelected([])}>
              清空
            </button>
          )}
        </div>
        {selected.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">请从下方商品库中选择商品加入对比</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {selected.map((id) => {
              const p = allProducts.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="relative rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                  <button
                    className="absolute right-2 top-2 rounded-full bg-white p-1 text-gray-400 hover:text-red-500"
                    onClick={() => toggle(id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <img src={p.image_url} alt={p.name} className="h-16 w-full rounded-lg object-cover" />
                  <p className="mt-2 line-clamp-1 text-sm font-medium text-gray-700">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.brand}</p>
                </div>
              );
            })}
          </div>
        )}
        <button className="btn-primary mt-4 w-full" onClick={runCompare} disabled={loading || selected.length < 2}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          开始对比
        </button>
        {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
      </section>

      {/* 筛选区 */}
      <section className="card space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <Filter className="h-4 w-4" /> 筛选商品
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {/* 分类筛选 */}
          <div>
            <label className="label">商品分类</label>
            <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          {/* 价格筛选 */}
          <div>
            <label className="label">价格范围</label>
            <select className="input" value={filterPrice} onChange={(e) => setFilterPrice(e.target.value)}>
              {PRICE_RANGES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          {/* 年龄筛选 */}
          <div>
            <label className="label">适用年龄</label>
            <select className="input" value={filterAge} onChange={(e) => setFilterAge(e.target.value)}>
              {AGE_RANGES.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 商品库选择 */}
      <section>
        <h2 className="mb-3 font-semibold text-gray-800">选择商品（{filteredProducts.length} 款）</h2>
        {filteredProducts.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">没有符合条件的商品</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`card p-3 text-left transition hover:shadow-md ${
                  selected.includes(p.id) ? "ring-2 ring-brand-400" : ""
                }`}
              >
                <img src={p.image_url} alt={p.name} className="h-20 w-full rounded-lg object-cover" />
                <p className="mt-2 line-clamp-1 text-sm font-medium text-gray-700">{p.name}</p>
                <p className="text-xs text-gray-400">{p.brand}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-0.5 text-xs text-brand-500">
                    <Star className="h-3 w-3 fill-current" />
                    {p.overall_rating?.toFixed(1) ?? "-"}
                  </span>
                  <span className="text-xs text-gray-500">{p.price_info?.avg ? `¥${p.price_info.avg}` : ""}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
