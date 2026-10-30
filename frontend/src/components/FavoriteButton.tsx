/**
 * v1.88.1 可复用收藏按钮组件（v1.88.4 改造为全局 store 模式）
 *
 * 供商品、时间轴、胎教故事、孕期食谱、幼儿百科等内容页统一使用。
 * v1.88.4 起收藏状态读取全局 favoriteStore（zustand）：
 * - 每类型只发 1 次 /api/favorites/map/ 请求（列表页 N 张卡片共享，不再各查各的）；
 * - 列表卡片与详情弹窗读同一份状态，任一处切换全局即时同步；
 * - 点击走 store.toggle 乐观更新，失败回滚并提示。
 * 后端按 favorite_create / favorite_delete 权限键管控（管理员始终放行）。
 */
import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";

export type FavoriteType =
  | "product"
  | "timeline"
  | "fetal_story"
  | "recipe"
  | "encyclopedia"
  | "shopping_list"
  | "comparison"
  | "platform";

interface FavoriteButtonProps {
  /** 收藏对象 ID */
  objectId: number;
  /** 收藏类型（对应后端 UserFavorite.favorite_type） */
  favoriteType: FavoriteType;
  /** 收藏备注（一般存对象标题，便于收藏中心展示） */
  note?: string;
  /** 尺寸：sm 用于列表/弹窗头部，md 用于详情页 */
  size?: "sm" | "md";
  /** 展示样式：icon 仅图标；pill 图标+文字 */
  variant?: "icon" | "pill";
  className?: string;
}

export default function FavoriteButton({
  objectId,
  favoriteType,
  note = "",
  size = "sm",
  variant = "icon",
  className = "",
}: FavoriteButtonProps) {
  // v1.88.4 从全局 store 读取状态：与列表页/其他弹窗天然同步
  const favorited = useFavoriteStore((s) => s.maps[favoriteType]?.has(objectId) === true);
  const isReady = useFavoriteStore((s) => s.loaded.has(favoriteType));
  const loading = useFavoriteStore((s) => s.loading.has(favoriteType));
  const ensureType = useFavoriteStore((s) => s.ensureType);
  const [toggling, setToggling] = useState(false);

  // 挂载时确保该类型收藏状态已加载（store 内部并发去重，只发 1 次请求）
  useEffect(() => {
    ensureType(favoriteType);
  }, [favoriteType, ensureType]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (toggling) return;
    setToggling(true);
    try {
      await useFavoriteStore.getState().toggle(objectId, favoriteType, note);
    } catch (err: any) {
      alert(err?.message || "收藏操作失败，请稍后重试");
    } finally {
      setToggling(false);
    }
  };

  // v1.88.4 类型级状态未就绪时显示检查中（一次性，整页 1 个请求全部就绪）
  if (!isReady) {
    return (
      <span
        className={`inline-flex items-center justify-center ${size === "sm" ? "h-8 w-8" : "h-10 w-10"} text-gray-300 ${className}`}
        title={loading ? "检查收藏状态..." : "收藏"}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    );
  }

  const iconSize = size === "sm" ? "h-[18px] w-[18px]" : "h-6 w-6";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleToggle}
        title={favorited ? "取消收藏" : "收藏"}
        // v1.88.3 视觉增强：未收藏=浅橙底+描边爱心（一眼可辨），已收藏=红底实心，尺寸加大一档
        className={`inline-flex items-center justify-center rounded-lg border transition ${
          size === "sm" ? "h-8 w-8" : "h-10 w-10"
        } ${
          favorited
            ? "border-rose-200 bg-rose-100 text-rose-500 hover:bg-rose-200"
            : "border-orange-200 bg-orange-50 text-orange-500 hover:border-orange-300 hover:bg-orange-100"
        } ${className}`}
      >
        <Heart className={`${iconSize} ${favorited ? "fill-current" : ""}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
        favorited
          ? "border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
          : "border-gray-200 bg-white text-gray-500 hover:border-rose-200 hover:text-rose-500"
      } ${className}`}
    >
      <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
      {favorited ? "已收藏" : "收藏"}
    </button>
  );
}
