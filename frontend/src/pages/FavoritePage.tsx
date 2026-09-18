import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, Heart, Loader2, Package, ShoppingBag, Star, Trash2 } from "lucide-react";
import api from "@/api/client";
import type { ApiResponse, FavoriteItem } from "@/types";

const TYPE_META: Record<string, { label: string; icon: typeof Heart; color: string; link: (id: number) => string }> = {
  product: { label: "商品", icon: Package, color: "bg-brand-50 text-brand-500", link: (id) => `/products/${id}` },
  timeline: { label: "时相", icon: Heart, color: "bg-pink-50 text-pink-500", link: (id) => `/timeline/${id}` },
  shopping_list: { label: "清单", icon: ShoppingBag, color: "bg-green-50 text-green-500", link: (id) => `/shopping-list/${id}` },
  comparison: { label: "对比", icon: Package, color: "bg-amber-50 text-amber-500", link: () => `/compare` },
};

export default function FavoritePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [toast, setToast] = useState("");
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

  const remove = async (id: number) => {
    // 乐观更新：立即从页面列表中移除，无需刷新或退出即可即时消失
    const prevList = [...favorites];
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    showToast("已取消收藏");
    try {
      await api.delete(`/favorites/${id}/`);
    } catch {
      setFavorites(prevList);
      showToast("取消收藏失败，请重试");
    }
  };


  const filtered = filter ? favorites.filter((f) => f.favorite_type === filter) : favorites;
  const types = Array.from(new Set(favorites.map((f) => f.favorite_type)));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-pink-400 to-orange-400 p-2.5 text-white">
          <Heart className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">我的收藏</h1>
          <p className="text-xs text-gray-400">商品库精选 • 科学育儿时相 • 智能清单</p>
        </div>
      </div>

      {/* 分类筛选 */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-xl px-3 py-1.5 text-sm transition ${
              !filter ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"
            }`}
            onClick={() => setFilter("")}
          >
            全部 ({favorites.length})
          </button>
          {types.map((t) => {
            const meta = TYPE_META[t] || { label: t, color: "bg-gray-100 text-gray-500" };
            return (
              <button
                key={t}
                className={`rounded-xl px-3 py-1.5 text-sm transition ${
                  filter === t ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"
                }`}
                onClick={() => setFilter(t)}
              >
                {meta.label} ({favorites.filter((f) => f.favorite_type === t).length})
              </button>
            );
          })}
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
            {favorites.length === 0 ? "暂无收藏任何内容，去商品库或孕期时间线逛逛吧" : "该分类下暂无收藏"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => {
            const meta = TYPE_META[f.favorite_type] || TYPE_META.product;
            const isProd = f.favorite_type === "product" && f.product;
            const prod = f.product;

            return (
              <div
                key={f.id}
                className="card group hover:shadow-md transition flex flex-col justify-between overflow-hidden cursor-pointer"
                onClick={() => navigate(meta.link(f.object_id))}
              >
                {isProd && prod ? (
                  /* 丰富的商品卡片布局 */
                  <div className="flex gap-3">
                    <img
                      src={prod.image_url || "https://picsum.photos/seed/fallback/200/200"}
                      alt={prod.name}
                      className="h-20 w-20 flex-shrink-0 rounded-xl object-cover bg-warm"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://picsum.photos/seed/fallback/200/200";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-600 font-medium">
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
                      <h3 className="mt-1 font-semibold text-gray-800 line-clamp-1 text-sm">{prod.name}</h3>
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
                  /* 普通类型卡片 */
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.color}`}>
                      <meta.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${meta.color}`}>{meta.label}</span>
                      <p className="mt-1.5 font-medium text-gray-700">{f.note || `${meta.label} #${f.object_id}`}</p>
                      <p className="mt-0.5 text-xs text-gray-300">收藏于 {f.created_at?.slice(0, 10)}</p>
                    </div>
                    <button
                      className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(f.id);
                      }}
                      title="取消收藏"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}