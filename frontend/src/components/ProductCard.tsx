import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, Star } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";
import type { Product } from "@/types";

export default function ProductCard({
  product,
  initialFavorited = false,
  onToggleFav,
}: {
  product: Product;
  /** v1.88.4 起弃用（保留兼容）：收藏状态改由全局 favoriteStore 管理 */
  initialFavorited?: boolean;
  /** 点击切换后的通知回调（父组件用于 toast 提示） */
  onToggleFav?: (favorited: boolean, product: Product) => void;
}) {
  // v1.88.4 改用全局收藏 store：商品列表/首页/详情页状态天然同步
  const favorited = useFavoriteStore((s) => s.maps["product"]?.has(product.id) === true);
  const ensureType = useFavoriteStore((s) => s.ensureType);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ensureType("product");
  }, [ensureType]);

  const handleFav = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      // store.toggle：乐观更新 + 失败回滚，全部商品页状态即时同步
      const next = await useFavoriteStore
        .getState()
        .toggle(product.id, "product", `${product.brand} ${product.name}`);
      onToggleFav?.(next, product);
    } catch {
      // 权限被禁或网络异常：store 已回滚，此处静默（提示由父组件/详情页负责）
    } finally {
      setLoading(false);
    }
  };

  return (
    <Link to={`/products/${product.id}`} className="card group relative hover:shadow-md transition">
      <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-warm dark:bg-gray-800">
        <img
          src={product.image_url || "https://picsum.photos/seed/fallback/400/300"}
          alt={product.name}
          className="h-full w-full object-cover transition group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (!img.src.includes("picsum.photos/seed/fallback")) {
              img.src = "https://picsum.photos/seed/fallback/400/300";
            }
          }}
        />
        {product.is_essential && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">必备</span>
        )}
        <button
          className={`absolute right-2 top-2 rounded-full p-1.5 backdrop-blur-xs transition active:scale-90 ${
            favorited
              ? "bg-white text-pink-500 shadow-sm"
              : "bg-black/20 text-white hover:bg-white hover:text-pink-500"
          }`}
          onClick={handleFav}
          title={favorited ? "取消收藏" : "加入收藏"}
        >
          <Heart className={`h-4 w-4 ${favorited ? "fill-pink-500" : ""}`} />
        </button>
      </div>
      <h3 className="line-clamp-1 font-medium text-gray-800 dark:text-gray-100">{product.name}</h3>
      <p className="mt-0.5 text-sm text-gray-400">{product.brand}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-brand-500">
          <Star className="h-4 w-4 fill-current" />
          {product.overall_rating?.toFixed(1) ?? "-"}
        </span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {product.price_info?.range ? `${product.price_info.range}元` : ""}
        </span>
      </div>
    </Link>
  );
}
