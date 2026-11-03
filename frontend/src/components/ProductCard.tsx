import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import FavoriteButton from "@/components/FavoriteButton";
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
        {/* v2.07 统一使用全站 FavoriteButton，支持淘宝风格直接呈现累计收藏微胶囊与乐观增减 */}
        <div className="absolute right-2 top-2 z-10" onClick={(e) => { e.stopPropagation(); }}>
          <FavoriteButton
            objectId={product.id}
            favoriteType="product"
            note={`${product.brand} ${product.name}`}
            count={product.fav_count}
            variant="icon"
            onToggle={(next) => onToggleFav?.(next, product)}
          />
        </div>
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
