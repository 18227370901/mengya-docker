import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, ShoppingBag, Check, CheckSquare, FileText } from "lucide-react";
import { shoppingApi, babyShoppingApi } from "@/api/services";
import type { AIRecommendResult } from "@/types";
import CopyButton from "@/components/CopyButton";

const SEASONS = [
  { key: "spring", label: "春季", desc: "3-5月 气候温和" },
  { key: "summer", label: "夏季", desc: "6-8月 炎热多汗" },
  { key: "autumn", label: "秋季", desc: "9-11月 凉爽干燥" },
  { key: "winter", label: "冬季", desc: "12-2月 寒冷干燥" },
];

const DELIVERY_METHODS = [
  { key: "vaginal", label: "顺产", desc: "住院3-4天" },
  { key: "cesarean", label: "剖宫产", desc: "住院5-7天" },
];

const SEASON_LABELS: Record<string, string> = {
  spring: "春季",
  summer: "夏季",
  autumn: "秋季",
  winter: "冬季",
};

const DELIVERY_LABELS: Record<string, string> = {
  vaginal: "顺产",
  cesarean: "剖宫产",
  both: "通用",
};

/**
 * 简易 Markdown 渲染器：解析标题、列表、加粗、段落，美化 AI 原始回复
 */
function renderRawContent(raw: string) {
  const lines = raw.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key++} className="space-y-1.5">
        {listItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-50 bg-white/60 p-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            <span className="flex-1 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: item }} />
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  // 将 **加粗** 转为 <strong>，其余 HTML 转义
  const inlineFormat = (text: string): string => {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-800 font-medium">$1</strong>');
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    // 标题：### / ## / #
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizeClass = level === 1 ? "text-lg font-bold text-gray-800" : level === 2 ? "text-base font-bold text-gray-800" : "text-sm font-semibold text-gray-700";
      blocks.push(
        <h4 key={key++} className={`${sizeClass} mt-1`}>
          {text.replace(/\*\*/g, "")}
        </h4>,
      );
      return;
    }

    // 无序列表：- / * / •
    const bulletMatch = trimmed.match(/^[\-\*•]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(inlineFormat(bulletMatch[1]));
      return;
    }

    // 有序列表：1. / 2. / (1) /
    const orderedMatch = trimmed.match(/^(?:\d+\.|\(\d+\))\s+(.+)$/);
    if (orderedMatch) {
      listItems.push(inlineFormat(orderedMatch[1]));
      return;
    }

    // 表格行跳过（| 开头）
    if (trimmed.startsWith("|")) {
      flushList();
      // 简单提取单元格文本
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length > 0 && !cells.every((c) => /^[\-: ]+$/.test(c))) {
        blocks.push(
          <div key={key++} className="flex flex-wrap gap-2">
            {cells.map((cell, i) => (
              <span key={i} className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-500" dangerouslySetInnerHTML={{ __html: inlineFormat(cell) }} />
            ))}
          </div>,
        );
      }
      return;
    }

    // 普通段落
    flushList();
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-gray-600" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />,
    );
  });

  flushList();
  return blocks;
}

export default function GenerateShoppingListPage() {
  const navigate = useNavigate();
  const [season, setSeason] = useState("");
  const [delivery, setDelivery] = useState("");
  const [budget, setBudget] = useState("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiResult, setAiResult] = useState<AIRecommendResult | null>(null);
  const [adopting, setAdopting] = useState(false);

  const aiAnalyze = async () => {
    if (!season || !delivery) {
      setError("请选择季节与分娩方式");
      return;
    }
    setError("");
    setLoading(true);
    setAiResult(null);
    try {
      const result = await babyShoppingApi.aiRecommend({
        season,
        delivery_method: delivery,
        budget: budget || undefined,
        extra: extra || undefined,
      });
      setAiResult(result);
    } catch (e) {
      setError((e as Error).message || "AI 分析失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const generateList = async () => {
    if (!season || !delivery) {
      setError("请选择季节与分娩方式");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await shoppingApi.generate({
        season,
        delivery_method: delivery,
        name: `${season}${delivery}待产包`,
      });
      navigate(`/shopping-list/${data.id}`);
    } catch (e) {
      setError((e as Error).message || "生成失败");
      setLoading(false);
    }
  };

  const adoptAi = async () => {
    if (!aiResult?.categories || aiResult.categories.length === 0) {
      setError("暂无可采纳的 AI 推荐内容，请先点击“AI 一键分析推荐”");
      return;
    }
    setAdopting(true);
    setError("");
    try {
      const data = await shoppingApi.adoptAI({
        name: `${SEASON_LABELS[season] || season}${DELIVERY_LABELS[delivery] || delivery} · AI推荐待产包`,
        season,
        delivery_method: delivery,
        categories: aiResult.categories.map((cat) => ({
          category: cat.category,
          owner: cat.owner,
          items: cat.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark,
            estimated_price: item.estimated_price,
          })),
        })),
      });
      navigate(`/shopping-list/${data.id}`);
    } catch (e) {
      setError((e as Error).message || "采纳失败，请稍后重试");
      setAdopting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        className={`flex items-center gap-1 text-sm ${loading ? "pointer-events-none text-gray-300" : "text-gray-400 hover:text-brand-500"}`}
        onClick={() => navigate("/shopping-list")}
      >
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-800">AI 智能待产包推荐</h1>
        <p className="mt-1 text-sm text-gray-400">
          根据季节、分娩方式与个人需求，AI 联网搜索最新数据，生成专属待产包建议
        </p>
      </div>

      {/* 季节选择 */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-gray-800">选择季节</h2>
        <div className="grid grid-cols-2 gap-3">
          {SEASONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSeason(s.key)}
              className={`rounded-xl border p-3 text-left transition ${
                season === s.key ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "border-gray-100 hover:border-brand-200"
              }`}
            >
              <p className="font-medium text-gray-700">{s.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{s.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 分娩方式 */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-gray-800">选择分娩方式</h2>
        <div className="grid grid-cols-2 gap-3">
          {DELIVERY_METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setDelivery(m.key)}
              className={`rounded-xl border p-3 text-left transition ${
                delivery === m.key ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "border-gray-100 hover:border-brand-200"
              }`}
            >
              <p className="font-medium text-gray-700">{m.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{m.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 预算与额外需求 */}
      <section className="card space-y-3">
        <div>
          <label className="label">预算（可选）</label>
          <input
            className="input"
            placeholder="例如：2000元"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <div>
          <label className="label">其他需求（可选）</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="例如：双胞胎、过敏体质、特定品牌偏好…"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
      </section>

      {/* 操作区：AI 智能推荐 */}
      <section className="card">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-500" />
          <h2 className="font-semibold text-gray-800">AI 智能推荐</h2>
        </div>
        <p className="mb-4 text-xs text-gray-400">
          AI 联网搜索最新数据，根据您的需求生成个性化待产包推荐
        </p>
        <button
          className="btn-primary w-full py-3 text-base"
          onClick={aiAnalyze}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          {loading ? "AI 分析中…" : "AI 一键分析推荐"}
        </button>
      </section>

      {/* 分隔线 */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="text-xs text-gray-300">或</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      {/* 操作区：快速生成清单 */}
      <section className="card">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-5 w-5 text-gray-400" />
          <h2 className="font-semibold text-gray-800">快速生成清单</h2>
        </div>
        <p className="mb-4 text-xs text-gray-400">
          不使用 AI，直接基于内置模板快速生成基础待产包清单
        </p>
        <button
          className="btn-secondary w-full py-3 text-base"
          onClick={generateList}
          disabled={loading}
        >
          <ShoppingBag className="h-5 w-5" />
          快速生成清单
        </button>
      </section>

      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      {/* AI 推荐结果 */}
      {aiResult && (
        <div className="space-y-4">
          {/* 总结 */}
          {aiResult.summary && (
            <div className="card bg-gradient-to-r from-brand-50 to-orange-50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">AI 分析总结</h3>
                <CopyButton text={aiResult.summary} label="复制" />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{aiResult.summary}</p>
            </div>
          )}

          {/* 分类推荐 */}
          {aiResult.categories && aiResult.categories.length > 0 ? (
            <>
              {aiResult.categories.map((cat, idx) => (
                <section key={idx} className="card">
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${cat.owner === "mom" ? "bg-brand-50 text-brand-600" : "bg-orange-50 text-orange-500"}`}>
                      {cat.owner === "mom" ? "妈妈" : "宝宝"}
                    </span>
                    <h3 className="font-semibold text-gray-800">{cat.category}</h3>
                    <span className="text-xs text-gray-400">{cat.items.length} 件</span>
                  </div>
                  <ul className="space-y-2">
                    {cat.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-50 p-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-700">
                            {item.name}
                            <span className="ml-2 text-xs text-gray-400">{item.quantity} {item.unit}</span>
                            {item.estimated_price && <span className="ml-2 text-xs text-brand-500">约¥{item.estimated_price}</span>}
                          </p>
                          {item.remark && <p className="mt-0.5 text-xs text-gray-400">{item.remark}</p>}
                        </div>
                        <CopyButton text={`${item.name} ${item.quantity}${item.unit}${item.remark ? " — " + item.remark : ""}`} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          ) : aiResult.raw_content && (
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">AI 推荐详情</h3>
                <CopyButton text={aiResult.raw_content} label="复制" />
              </div>
              <div className="mt-3 space-y-3">
                {renderRawContent(aiResult.raw_content)}
              </div>
            </div>
          )}

          {/* 额外建议 */}
          {aiResult.tips && (
            <div className="rounded-xl bg-cream p-3 text-sm text-gray-500">
              {aiResult.tips}
            </div>
          )}

          {/* 采纳为我的清单 */}
          {aiResult.categories && aiResult.categories.length > 0 && (
            <button
              className="btn-primary w-full py-3 text-base"
              onClick={adoptAi}
              disabled={adopting}
            >
              {adopting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckSquare className="h-5 w-5" />}
              {adopting ? "正在生成清单…" : "采纳为我的清单"}
            </button>
          )}

          <p className="text-center text-xs text-gray-300">
            AI 推荐基于联网搜索，仅供参考，具体以个人情况与医生建议为准
          </p>
        </div>
      )}

      {!aiResult && !loading && (
        <p className="text-center text-xs text-gray-300">
          生成逻辑基于母婴健康共识，供参考，具体以医生建议为准
        </p>
      )}
    </div>
  );
}
