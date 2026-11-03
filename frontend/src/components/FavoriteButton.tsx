/**
 * v1.88.1 可复用收藏按钮组件（v1.88.4 改造为全局 store 模式，v2.07 强化淘宝风格直显大数与千分位气泡）
 *
 * 供商品、时间轴、胎教故事、孕期食谱、幼儿百科、第三方导航等全站内容统一使用。
 * v2.07 强化：
 * - 仿淘宝/小红书直接呈现累计收藏人次：未收藏 [♡ 收藏 1.2万] / 已收藏 [♥ 已收藏 1.2万]；
 * - 列表卡片 icon 模式下自动呈现微胶囊徽章 [♡ 1.2万] / [♥ 1.2万]，无需悬浮即可一眼洞察人气；
 * - 点击走乐观增减：收藏即时 +1，取消即时 -1，杜绝滞后感；
 * - 鼠标悬浮依然展示精准千分位人次提示气泡（如：全站累计 1,234 位妈妈收藏）。
 */
import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";
import { formatCompactCount, formatFullCount } from "@/utils/format";

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
  /** 累计收藏人次（可选） */
  count?: number;
  /** 是否在 pill 模式下显式呈现紧凑计数（默认 true） */
  showCount?: boolean;
  /** 自定义未收藏时的文案，默认为“收藏” */
  unfavoritedLabel?: string;
  /** 自定义已收藏时的文案，默认为“已收藏” */
  favoritedLabel?: string;
  /** 尺寸：sm 用于列表/弹窗头部，md 用于详情页 */
  size?: "sm" | "md";
  /** 展示样式：icon 仅图标/微胶囊；pill 图标+文字胶囊 */
  variant?: "icon" | "pill";
  onToggle?: (nextFav: boolean) => void;
  className?: string;
}

export default function FavoriteButton({
  objectId,
  favoriteType,
  note = "",
  count,
  showCount = true,
  unfavoritedLabel = "收藏",
  favoritedLabel = "已收藏",
  size = "sm",
  variant = "icon",
  onToggle,
  className = "",
}: FavoriteButtonProps) {
  const favorited = useFavoriteStore((s) => s.maps[favoriteType]?.has(objectId) === true);
  const isReady = useFavoriteStore((s) => s.loaded.has(favoriteType));
  const loading = useFavoriteStore((s) => s.loading.has(favoriteType));
  const ensureType = useFavoriteStore((s) => s.ensureType);
  const [toggling, setToggling] = useState(false);
  const [localDelta, setLocalDelta] = useState(0);

  useEffect(() => {
    ensureType(favoriteType);
  }, [favoriteType, ensureType]);

  useEffect(() => {
    setLocalDelta(0);
  }, [count, objectId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (toggling) return;
    setToggling(true);
    const wasFav = favorited;
    setLocalDelta((prev) => prev + (wasFav ? -1 : 1));
    try {
      const nextFav = await useFavoriteStore.getState().toggle(objectId, favoriteType, note);
      onToggle?.(nextFav);
    } catch (err: any) {
      setLocalDelta((prev) => prev + (wasFav ? 1 : -1));
      alert(err?.message || "收藏操作失败，请稍后重试");
    } finally {
      setToggling(false);
    }
  };

  const effectiveCount = count !== undefined ? Math.max(0, count + localDelta) : undefined;
  const compactCountStr = effectiveCount !== undefined && effectiveCount > 0 ? formatCompactCount(effectiveCount) : "";
  const fullCountStr = effectiveCount !== undefined && effectiveCount > 0 ? formatFullCount(effectiveCount) : "";
  const tooltipText = fullCountStr
    ? `${favorited ? "已收藏" : "点击加入收藏"} (全站累计 ${fullCountStr} 位妈妈收藏)`
    : favorited
    ? "已收藏，点击取消"
    : "点击加入收藏";

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

  const iconSize = size === "sm" ? "h-4 w-4" : "h-4.5 w-4.5";

  if (variant === "icon") {
    if (showCount && compactCountStr) {
      return (
        <button
          type="button"
          onClick={handleToggle}
          title={tooltipText}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition active:scale-95 shadow-2xs ${
            favorited
              ? "border-pink-200 bg-pink-50 text-pink-600 hover:bg-pink-100"
              : "border-gray-200 bg-white/95 text-gray-600 backdrop-blur-xs hover:border-pink-200 hover:text-pink-600 hover:bg-white"
          } ${className}`}
        >
          <Heart className={`h-3.5 w-3.5 shrink-0 ${favorited ? "fill-pink-500 text-pink-500" : "text-gray-400"}`} />
          <span className="text-[11px] font-semibold leading-none">{compactCountStr}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleToggle}
        title={tooltipText}
        className={`inline-flex items-center justify-center rounded-lg border transition active:scale-95 ${
          size === "sm" ? "h-8 w-8" : "h-10 w-10"
        } ${
          favorited
            ? "border-pink-200 bg-pink-50 text-pink-500 hover:bg-pink-100"
            : "border-gray-200 bg-white text-gray-400 hover:border-pink-200 hover:text-pink-500 hover:bg-pink-50/50"
        } ${className}`}
      >
        <Heart className={`${iconSize} ${favorited ? "fill-pink-500 text-pink-500" : ""}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={tooltipText}
      className={`inline-flex items-center gap-1.5 rounded-full border transition active:scale-95 shadow-2xs ${
        size === "sm" ? "px-3 py-1.5 text-xs font-medium" : "px-4 py-2 text-sm font-medium"
      } ${
        favorited
          ? "border-pink-300 bg-pink-50 text-pink-600 hover:bg-pink-100"
          : "border-gray-200 bg-white text-gray-700 hover:border-pink-200 hover:text-pink-600 hover:bg-pink-50/40"
      } ${className}`}
    >
      <Heart className={`${size === "sm" ? "h-4 w-4" : "h-4 w-4"} shrink-0 ${favorited ? "fill-pink-500 text-pink-500" : "text-gray-400"}`} />
      <span>{favorited ? favoritedLabel : unfavoritedLabel}</span>
      {showCount && compactCountStr ? (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-semibold ${
            favorited ? "bg-pink-200/80 text-pink-700" : "bg-gray-100 text-gray-600"
          }`}
          title={`全站累计 ${fullCountStr} 人收藏`}
        >
          {compactCountStr}
        </span>
      ) : null}
    </button>
  );
}
