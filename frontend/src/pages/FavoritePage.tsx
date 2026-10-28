/**
 * v1.88.1 我的收藏中心 —— 全类型收藏统一管理
 * 能力：分类 Tab（7 类收藏）、搜索、有效性筛选、客户端分页、
 *       单选/多选/全选、单条取消与批量取消、失效内容警示保留
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChefHat,
  ExternalLink,
  Heart,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  Package,
  Search,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from "lucide-react";
import api from "@/api/client";
import { favoriteApi } from "@/api/catalog";
import { useFavoriteStore } from "@/store/favoriteStore";
import type { ApiResponse, FavoriteItem } from "@/types";

/** 收藏类型元数据：分类 Tab 顺序、图标、跳转 */
const TYPE_ORDER: { key: string; label: string; icon: typeof Heart; color: string; link: (id: number) => string }[] = [
  { key: "product", label: "商品", icon: Package, color: "bg-brand-50 text-brand-500", link: (id) => `/products/${id}` },
  { key: "timeline", label: "孕育知识", icon: Heart, color: "bg-pink-50 text-pink-500", link: (id) => `/timeline/${id}` },
  { key: "fetal_story", label: "胎教故事", icon: BookOpen, color: "bg-rose-50 text-rose-500", link: () => `/fetal-stories` },
  { key: "recipe", label: "孕期食谱", icon: ChefHat, color: "bg-emerald-50 text-emerald-600", link: () => `/recipes` },
  { key: "encyclopedia", label: "幼儿百科", icon: MessageCircleQuestion, color: "bg-violet-50 text-violet-500", link: () => `/kids-encyclopedia` },
  { key: "shopping_list", label: "清单", icon: ShoppingBag, color: "bg-green-50 text-green-500", link: (id) => `/shopping-list/${id}` },
  { key: "comparison", label: "对比", icon: ListChecks, color: "bg-amber-50 text-amber-500", link: () => `/compare` },
];

const TYPE_META: Record<string, (typeof TYPE_ORDER)[number]> = Object.fromEntries(
  TYPE_ORDER.map((t) => [t.key, t])
);

const PAGE_SIZE = 8;

export default function FavoritePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  /** 分类 Tab：空串 = 全部 */
  const [activeType, setActiveType] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  /** 有效性筛选：all / valid / invalid */
  const [validityFilter, setValidityFilter] = useState<"all" | "valid" | "invalid">("all");
  /** 客户端分页 */
  const [page, setPage] = useState(1);
  /** 多选（当前筛选范围跨页保持） */
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  /** 批量删除中 */
  const [batchDeleting, setBatchDeleting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api
      .get<ApiResponse<FavoriteItem[]>>("/favorites/")
      .then((r) => setFavorites(r.data.data || []))
      .catch(() => setFavorites([]))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const handleFocus = () => load(true);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [location.key]);

  /* ===== 筛选管线：类型 → 关键字 → 有效性 ===== */
  const filtered = useMemo(() => {
    let list = favorites;
    if (activeType) list = list.filter((f) => f.favorite_type === activeType);
    const kw = searchTerm.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (f) =>
          (f.title || "").toLowerCase().includes(kw) ||
          (f.note || "").toLowerCase().includes(kw) ||
          (f.type_label || "").includes(kw)
      );
    }
    if (validityFilter === "valid") list = list.filter((f) => f.valid !== false);
    if (validityFilter === "invalid") list = list.filter((f) => f.valid === false);
    return list;
  }, [favorites, activeType, searchTerm, validityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  // 切换筛选条件时回到第 1 页并清空勾选
  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [activeType, searchTerm, validityFilter]);

  /** 各分类计数（含全部） */
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { "": favorites.length };
    for (const t of TYPE_ORDER) counts[t.key] = 0;
    for (const f of favorites) {
      counts[f.favorite_type] = (counts[f.favorite_type] || 0) + 1;
    }
    return counts;
  }, [favorites]);

  /* ===== 选择逻辑 ===== */
  const isAllCurrentSelected = pagedItems.length > 0 && pagedItems.every((f) => selectedIds.includes(f.id));
  const isSomeSelected = useMemo(() => {
    const count = pagedItems.filter((f) => selectedIds.includes(f.id)).length;
    return count > 0 && count < pagedItems.length;
  }, [pagedItems, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllCurrentSelected) {
      const ids = new Set(pagedItems.map((f) => f.id));
      setSelectedIds((prev) => prev.filter((id) => !ids.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pagedItems.map((f) => f.id)])));
    }
  };

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /* ===== 单条取消（乐观更新；v1.88.4 同步全局 favoriteStore） ===== */
  const remove = async (id: number) => {
    const target = favorites.find((f) => f.id === id);
    const prevList = [...favorites];
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    showToast("已取消收藏");
    try {
      await api.delete(`/favorites/${id}/`);
      // v1.88.4 同步全局 store：各列表页/详情弹窗的爱心状态即时更新
      if (target) {
        useFavoriteStore.getState().removeIds([{ type: target.favorite_type, objectId: target.object_id }]);
      }
    } catch {
      setFavorites(prevList);
      showToast("取消收藏失败，请重试");
    }
  };

  /* ===== v1.88.1 批量取消收藏（v1.88.4 同步全局 favoriteStore） ===== */
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0 || batchDeleting) return;
    if (!window.confirm(`确认批量取消已勾选的 ${selectedIds.length} 条收藏？此操作可在原页面重新收藏。`)) return;
    setBatchDeleting(true);
    const prevList = [...favorites];
    const targets = favorites.filter((f) => selectedIds.includes(f.id));
    // 乐观移除
    setFavorites((prev) => prev.filter((f) => !selectedIds.includes(f.id)));
    try {
      const res = await favoriteApi.batchDelete(selectedIds);
      showToast(res?.message || `已取消 ${selectedIds.length} 条收藏`);
      setSelectedIds([]);
      // v1.88.4 同步全局 store：各列表页/详情弹窗的爱心状态即时更新
      useFavoriteStore.getState().removeIds(
        targets.map((t) => ({ type: t.favorite_type, objectId: t.object_id }))
      );
    } catch {
      setFavorites(prevList);
      showToast("批量取消失败，请重试");
    } finally {
      setBatchDeleting(false);
    }
  };

  /** 行标题：优先后端反查的真实标题，其次备注，最后类型+ID */
  const itemTitle = (f: FavoriteItem) =>
    f.title || f.note || `${TYPE_META[f.favorite_type]?.label ?? f.type_label ?? "内容"} #${f.object_id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-pink-400 to-orange-400 p-2.5 text-white">
            <Heart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">我的收藏</h1>
            <p className="text-xs text-gray-400">商品 · 孕育知识 · 胎教故事 · 食谱 · 百科 · 清单 · 对比</p>
          </div>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">
          共 {favorites.length} 条
        </span>
      </div>

      {/* 分类 Tab（仅展示已有收藏的类型 + 全部） */}
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-xl px-3 py-1.5 text-sm transition ${
            !activeType ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"
          }`}
          onClick={() => setActiveType("")}
        >
          全部 ({typeCounts[""] || 0})
        </button>
        {TYPE_ORDER.filter((t) => (typeCounts[t.key] || 0) > 0).map((t) => (
          <button
            key={t.key}
            className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm transition ${
              activeType === t.key ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"
            }`}
            onClick={() => setActiveType(t.key)}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label} ({typeCounts[t.key] || 0})
          </button>
        ))}
      </div>

      {/* 搜索 + 有效性筛选 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索收藏标题 / 备注..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-8 text-sm outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
        <select
          value={validityFilter}
          onChange={(e) => setValidityFilter(e.target.value as "all" | "valid" | "invalid")}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="all">全部状态</option>
          <option value="valid">仅有效</option>
          <option value="invalid">仅已失效</option>
        </select>
      </div>

      {/* 批量操作条 */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2.5 text-xs text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200">
          <div className="flex items-center gap-2 font-medium">
            <Check className="h-4 w-4 text-brand-600" />
            <span>已勾选 {selectedIds.length} 条收藏</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="rounded-lg bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {batchDeleting ? "取消中…" : "批量取消收藏"}
            </button>
            <button className="px-2 py-1 text-gray-500 hover:text-gray-800" onClick={() => setSelectedIds([])}>
              取消勾选
            </button>
          </div>
        </div>
      )}

      {/* 收藏列表 */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Heart className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-3 text-sm text-gray-400">
            {favorites.length === 0
              ? "暂无收藏任何内容，去商品库、时间轴、胎教故事或食谱页逛逛吧"
              : activeType || searchTerm || validityFilter !== "all"
              ? "当前筛选条件下暂无收藏"
              : "暂无收藏"}
          </p>
        </div>
      ) : (
        <>
          {/* 全选行 */}
          <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={isAllCurrentSelected}
              ref={(el) => {
                if (el) el.indeterminate = isSomeSelected;
              }}
              onChange={toggleSelectAll}
              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              title="全选 / 反选当前页"
            />
            <span>
              全选当前页（{pagedItems.length} 条）· 筛选结果共 {filtered.length} 条
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {pagedItems.map((f) => {
              const meta = TYPE_META[f.favorite_type] || TYPE_META.product;
              const isProd = f.favorite_type === "product" && f.product;
              const prod = f.product;
              /** v1.88 收藏对象已被管理员删除/恢复出厂清除：保留记录并提示用户自行处理 */
              const invalid = f.valid === false;

              return (
                <div
                  key={f.id}
                  className={`card group flex flex-col justify-between overflow-hidden transition ${
                    invalid
                      ? "border-dashed border-amber-200 bg-amber-50/40"
                      : selectedIds.includes(f.id)
                      ? "border-brand-300 bg-brand-50/40"
                      : "hover:shadow-md"
                  }`}
                >
                  {invalid ? (
                    /* 收藏对象已失效：警示卡片（可勾选批量清理） */
                    <div className="flex items-start gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(f.id)}
                        onChange={() => toggleRow(f.id)}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${meta.color}`}>
                          {f.type_label || meta.label}
                        </span>
                        <p className="mt-1.5 text-sm font-medium text-gray-500 line-clamp-1">{itemTitle(f)}</p>
                        <p className="mt-1 text-xs text-amber-600">该内容已被管理员清除，可取消收藏或联系管理员恢复</p>
                        <p className="mt-0.5 text-xs text-gray-400">收藏于 {f.created_at?.slice(0, 10)}</p>
                      </div>
                      <button
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                        onClick={() => remove(f.id)}
                        title="取消收藏"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : isProd && prod ? (
                    /* 商品卡片：丰富布局 */
                    <div
                      className="flex cursor-pointer gap-3"
                      onClick={() => navigate(meta.link(f.object_id))}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(f.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleRow(f.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <img
                        src={prod.image_url || "https://picsum.photos/seed/fallback/200/200"}
                        alt={prod.name}
                        className="h-20 w-20 flex-shrink-0 rounded-xl bg-warm object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://picsum.photos/seed/fallback/200/200";
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                            {prod.first_category_label || prod.first_category}
                          </span>
                          <button
                            className="rounded-lg p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(f.id);
                            }}
                            title="取消收藏"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-gray-800">{prod.name}</h3>
                        <p className="text-xs text-gray-400">{prod.brand}</p>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-0.5 font-bold text-brand-500">
                            <Star className="h-3 w-3 fill-current" />
                            {prod.overall_rating ? prod.overall_rating.toFixed(1) : "-"}
                          </span>
                          <span className="font-semibold text-gray-700">
                            {prod.price_info?.range ? `${prod.price_info.range}元` : prod.price_info?.avg ? `约${prod.price_info.avg}元` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 通用类型卡片：封面图 + 真实标题 */
                    <div
                      className="flex cursor-pointer items-start gap-3 p-1"
                      onClick={() => navigate(meta.link(f.object_id))}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(f.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleRow(f.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      {f.cover_image ? (
                        <img
                          src={f.cover_image}
                          alt={itemTitle(f)}
                          className="h-12 w-12 flex-shrink-0 rounded-xl bg-warm object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${meta.color}`}>
                          <meta.icon className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${meta.color}`}>
                          {f.type_label || meta.label}
                        </span>
                        <p className="mt-1.5 line-clamp-1 font-medium text-gray-700">{itemTitle(f)}</p>
                        <p className="mt-0.5 text-xs text-gray-300">收藏于 {f.created_at?.slice(0, 10)}</p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <button
                          className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(f.id);
                          }}
                          title="取消收藏"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ExternalLink className="h-3 w-3 text-gray-200" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs text-gray-400">
              <span>
                第 {currentPage}/{totalPages} 页 · 每页 {PAGE_SIZE} 条
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-gray-500 transition hover:bg-gray-50 disabled:opacity-30"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  上一页
                </button>
                <button
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-gray-500 transition hover:bg-gray-50 disabled:opacity-30"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
