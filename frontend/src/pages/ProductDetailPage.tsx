import { useAuthStore } from "@/store/authStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Heart,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  ShoppingBag,
} from "lucide-react";
import CopyButton from "@/components/CopyButton";
import FavoriteButton from "@/components/FavoriteButton";
import AiProgressModal from "@/components/ui/AiProgressModal";
import axios from "axios";
import { productApi } from "@/api/catalog";
import type { Product } from "@/types";

interface AIEvalResult {
  source: string;
  used_config_name: string;
  evaluation: string;
  product_id: number;
  product_name: string;
}

const PRODUCT_AI_STAGES = [
  { threshold: 0, text: "正在解析商品核心规格、CCC认证及安全合规标准..." },
  { threshold: 25, text: "正在联网检索多平台价格走势与质检抽检舆情..." },
  { threshold: 60, text: "母婴 AI 专家正在综合性能优缺点与适用月龄..." },
  { threshold: 85, text: "正在组织排版深度评测结论与选购防坑贴士..." },
  { threshold: 95, text: "评测生成完毕，即将呈现..." },
];

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "notfound" | "ok">("loading");

  // v1.88.4 收藏状态改由全局 favoriteStore 管理（与商品列表/首页/收藏中心同步）
  const isFavorited = useFavoriteStore((s) => s.maps["product"]?.has(Number(id)) === true);
  const ensureProductFavorites = useFavoriteStore((s) => s.ensureType);
  const [favLoading, setFavLoading] = useState(false);

  // AI 评测状态
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEval, setAiEval] = useState<AIEvalResult | null>(null);

  // Toast
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 2500);
  };

  // 组件卸载时安全中断在途评测请求，防止切页后后台空跑与重入竞态
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const prevIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (prevIdRef.current === id && product) {
      return;
    }
    prevIdRef.current = id;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAiLoading(false);

    setLoadState("loading");
    setProduct(null);

    if (id) {
      const prodId = Number(id);
      useFavoriteStore.getState().ensureType("product");
      try {
        const cached = sessionStorage.getItem(`ai_product_eval_${prodId}`);
        if (cached) {
          setAiEval(JSON.parse(cached));
        } else {
          setAiEval(null);
        }
      } catch {
        setAiEval(null);
      }
      productApi
        .detail(prodId)
        .then((p) => {
          setProduct(p);
          setLoadState("ok");
        })
        .catch(() => setLoadState("error"));
    } else {
      setLoadState("notfound");
    }
  }, [id]);

  const toggleFavorite = async () => {
    if (!product || favLoading) return;
    setFavLoading(true);
    try {
      // v1.88.4 走全局 store：乐观更新 + 与商品列表/首页/收藏中心实时同步
      const nextFav = await useFavoriteStore
        .getState()
        .toggle(product.id, "product", `${product.brand} ${product.name}`);
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              fav_count: Math.max(0, (prev.fav_count || 0) + (nextFav ? 1 : -1)),
            }
          : null
      );
      showToast(nextFav ? "已添加到收藏夹" : "已取消收藏");
    } catch (err: any) {
      showToast(err?.message || "操作失败，请重试");
    } finally {
      setFavLoading(false);
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelAiEvaluate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAiLoading(false);
    showToast("已取消 AI 评测");
  }, []);

  const handleAiEvaluate = async () => {
    if (!product || aiLoading) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setAiLoading(true);
    try {
      const res = await productApi.aiEvaluate(product.id, { signal: controller.signal });
      setAiEval(res);
      try {
        sessionStorage.setItem(`ai_product_eval_${product.id}`, JSON.stringify(res));
      } catch {}
    } catch (err: any) {
      if (axios.isCancel(err) || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
        return;
      }
      showToast(err?.message || "评测生成失败，请重试");
    } finally {
      setAiLoading(false);
      abortControllerRef.current = null;
    }
  };

  if (loadState === "loading" || (loadState === "ok" && !product)) {
    return <div className="py-20 text-center text-gray-400">加载中...</div>;
  }

  if (loadState === "error") {
    return (
      <div className="space-y-4 py-20 text-center">
        <p className="text-gray-500">加载失败，请稍后重试</p>
        <Link to="/products" className="inline-flex items-center text-sm text-brand-500 hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回商品库
        </Link>
      </div>
    );
  }

  if (loadState === "notfound" || !product) {
    return (
      <div className="space-y-4 py-20 text-center">
        <p className="text-gray-500">商品不存在或已下架</p>
        <Link to="/products" className="inline-flex items-center text-sm text-brand-500 hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回商品库
        </Link>
      </div>
    );
  }

  const ratings = product.ratings ?? {};
  const dims = [
    { key: "safety", label: "安全性" },
    { key: "comfort", label: "舒适度" },
    { key: "functionality", label: "功能性" },
    { key: "usability", label: "易用性" },
    { key: "appearance", label: "颜值" },
  ] as const;

  // 过滤掉不相关的 ISOFIX 和 接口 类规格
  const filteredSpecs = Object.entries(product.specifications || {}).filter(
    ([k, v]) => !k.includes("接口") && !String(v).toUpperCase().includes("ISOFIX") && !k.toUpperCase().includes("ISOFIX")
  );

  const purchaseLinks = product.purchase_links || {};
  const platforms = [
    {
      key: "taobao",
      name: "淘宝",
      color: "bg-orange-500 text-white hover:bg-orange-600",
      url: purchaseLinks.taobao || `https://s.taobao.com/search?q=${encodeURIComponent(product.brand + " " + product.name)}`,
      hasDirect: Boolean(purchaseLinks.taobao),
    },
    {
      key: "jd",
      name: "京东",
      color: "bg-red-500 text-white hover:bg-red-600",
      url: purchaseLinks.jd || `https://search.jd.com/Search?keyword=${encodeURIComponent(product.brand + " " + product.name)}`,
      hasDirect: Boolean(purchaseLinks.jd),
    },
    {
      key: "pdd",
      name: "拼多多",
      color: "bg-amber-600 text-white hover:bg-amber-700",
      url: purchaseLinks.pdd || `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(product.brand + " " + product.name)}`,
      hasDirect: Boolean(purchaseLinks.pdd),
    },
    ...(purchaseLinks.other
      ? [
          {
            key: "other",
            name: "官方/其他",
            color: "bg-brand-500 text-white hover:bg-brand-600",
            url: purchaseLinks.other,
            hasDirect: true,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/products" className="flex items-center text-sm text-brand-500 hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回商品库
        </Link>
        <div className="flex items-center gap-3">
          {/* AI 一键评测按钮 */}
          <button
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95"
            onClick={handleAiEvaluate}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span>AI 一键评测</span>
          </button>
          {/* 统一规范收藏按钮：支持大数紧凑单位自适应（如 1.5万、10万+）与悬浮提示 */}
          <FavoriteButton
            objectId={product.id}
            favoriteType="product"
            note={`${product.brand} ${product.name}`}
            count={product.fav_count}
            size="md"
            variant="pill"
            unfavoritedLabel="加入收藏"
            favoritedLabel="已收藏"
            onToggle={(nextFav) => {
              setProduct((prev) =>
                prev
                  ? {
                      ...prev,
                      fav_count: Math.max(0, (prev.fav_count || 0) + (nextFav ? 1 : -1)),
                    }
                  : null
              );
              showToast(nextFav ? "已添加到收藏夹" : "已取消收藏");
            }}
          />
        </div>
      </div>

      {/* 主卡片 */}
      <div className="card grid gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-warm">
          <img
            src={product.image_url || "https://picsum.photos/seed/fallback/600/400"}
            alt={product.name}
            className="h-64 w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://picsum.photos/seed/fallback/600/400";
            }}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="tag">{product.first_category_label || product.first_category}</span>
            <span className="tag">{product.second_category}</span>
            {product.has_ccc_certification && (
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                <ShieldCheck className="h-3 w-3" /> CCC认证
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
          <p className="mt-1 text-gray-500">{product.brand}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex items-center gap-1 text-lg font-bold text-brand-500">
              <Star className="h-5 w-5 fill-current" />
              {product.overall_rating?.toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">综合推荐指数</span>
          </div>
          {product.price_info?.range && (
            <p className="mt-2 text-xl font-semibold text-gray-800">
              参考价：{product.price_info.range} 元
              <span className="ml-2 text-sm font-normal text-gray-400">
                {product.price_info.taobao ? `淘宝 ${product.price_info.taobao} / ` : ""}
                {product.price_info.jd ? `京东 ${product.price_info.jd} / ` : ""}
                {product.price_info.pdd ? `拼多多 ${product.price_info.pdd}` : ""}
              </span>
            </p>
          )}

          {/* 推荐购买链接模块 */}
          <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <ShoppingBag className="h-3.5 w-3.5 text-brand-500" /> 推荐购买渠道
              </span>
              <span className="text-[11px] text-gray-400">常见主流平台比价</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <a
                  key={p.key}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium shadow-xs transition ${p.color}`}
                  title={p.hasDirect ? `${p.name}直达购买链接` : `${p.name}平台搜索`}
                >
                  <span>{p.name}</span>
                  {p.hasDirect ? (
                    <span className="rounded-full bg-white/25 px-1 py-0.2 text-[10px]">直达</span>
                  ) : (
                    <span className="rounded-full bg-white/15 px-1 py-0.2 text-[10px]">比价</span>
                  )}
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>
              ))}
            </div>
          </div>

          {/* 多维评分 */}
          <div className="mt-4 space-y-2">
            {dims.map((d) => (
              <div key={d.key} className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">{d.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-400"
                    style={{ width: `${(ratings[d.key] ?? 0) * 10}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-600">{(ratings[d.key] ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 安全预警 */}
      {product.safety_alert && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          <strong>安全合规提示：</strong>
          {product.safety_alert}
          {product.test_report_source && (
            <span className="mt-1 block text-xs text-red-400">来源：{product.test_report_source}</span>
          )}
          <div className="mt-2 flex justify-end">
            <CopyButton text={product.safety_alert} label="复制" />
          </div>
        </div>
      )}

      {/* 规格参数（已过滤掉接口/ISOFIX无关内容） */}
      {filteredSpecs.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-lg font-bold text-gray-800">规格参数</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {filteredSpecs.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-400">{k}</p>
                <p className="mt-0.5 text-sm text-gray-700">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI 评测卡片（若已评测） */}
      {aiEval && (
        <div className="card space-y-4 border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-purple-50/20">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 p-2 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-gray-800">AI 一键深度评测结论</h2>
                <p className="text-xs text-gray-400">
                  评测引擎：{aiEval.used_config_name || "智能大模型"} • 涵盖价格、性能、多平台比价与使用功能
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={aiEval.evaluation} label="复制评测" />
              <button
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                onClick={handleAiEvaluate}
                disabled={aiLoading}
              >
                <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} /> 重新评测
              </button>
            </div>
          </div>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-gray-700">
            {aiEval.evaluation}
          </div>
        </div>
      )}

      {/* 商品描述与选购指南 */}
      {product.description && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold text-gray-800">商品描述</h2>
          <p className="whitespace-pre-wrap text-gray-600">{product.description}</p>
          <div className="mt-2 flex justify-end">
            <CopyButton text={product.description} label="复制" />
          </div>
        </div>
      )}
      {product.purchase_guide && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold text-gray-800">选购指南</h2>
          <p className="whitespace-pre-wrap text-gray-600">{product.purchase_guide}</p>
          <div className="mt-2 flex justify-end">
            <CopyButton text={product.purchase_guide} label="复制" />
          </div>
        </div>
      )}

      {/* AI 一键评测动态百分比进度与可取消模态弹窗 */}
      <AiProgressModal
        isOpen={aiLoading}
        title="AI 正在一键深度评测中..."
        description={`正在综合分析【${product.brand} ${product.name}】的价格走势、参数规格、CCC认证、主流电商平台政策与实际使用要点，请稍候。`}
        stages={PRODUCT_AI_STAGES}
        onCancel={handleCancelAiEvaluate}
        cancelText="取消评测"
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}