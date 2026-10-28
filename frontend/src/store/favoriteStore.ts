/**
 * v1.88.4 全局收藏状态 Store（zustand）
 *
 * 核心价值：
 * 1. 消除 N+1 查询：列表页 N 张卡片原本各发一次收藏状态查询（时间轴 204 次、
 *    胎教故事 245 次），收敛为每类型 1 次（GET /api/favorites/map/）；
 * 2. 状态天然同步：列表卡片与详情弹窗读同一份 store，任一处切换收藏，
 *    全部页面即时同步（解决"详情取消收藏但列表不刷新"问题）；
 * 3. 乐观更新：点击后先本地切换再调 API，失败自动回滚。
 *
 * 账号切换安全：登录/登出时调用 reset() 清空全部类型缓存。
 */
import { create } from "zustand";
import { favoriteApi } from "@/api/catalog";
import type { FavoriteType } from "@/components/FavoriteButton";

/** 各类型的收藏对象 ID 集合（key = favoriteType） */
type FavoriteMaps = Partial<Record<FavoriteType | string, Set<number>>>;

interface FavoriteState {
  /** 类型 → 已收藏 object_id 集合 */
  maps: FavoriteMaps;
  /** 已成功加载过的类型 */
  loaded: Set<string>;
  /** 加载中的类型（防止并发重复请求） */
  loading: Set<string>;
  /** 某次加载失败的类型（下次挂载重试） */
  failed: Set<string>;

  /** 确保某类型已加载（并发去重；失败可重试）。组件挂载时调用 */
  ensureType: (type: string) => void;
  /** 强制刷新某类型（收藏中心批量删除后调用，保持全局一致） */
  refreshType: (type: string) => Promise<void>;
  /** 同步查询：该 id 是否已收藏（类型未加载时返回 false，由 loading 态兜底展示） */
  isFavorited: (type: string, objectId: number) => boolean;
  /** 该类型是否加载完成（false 时按钮显示 loading） */
  isReady: (type: string) => boolean;
  /** 切换收藏：乐观更新 + API，失败回滚并抛出错误信息 */
  toggle: (objectId: number, type: string, note?: string) => Promise<boolean>;
  /** 收藏中心按记录删除后同步（按 (type, objectId) 移除） */
  removeIds: (pairs: Array<{ type: string; objectId: number }>) => void;
  /** 登录/切换账号时清空全部缓存 */
  reset: () => void;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  maps: {},
  loaded: new Set<string>(),
  loading: new Set<string>(),
  failed: new Set<string>(),

  ensureType: (type) => {
    const { loaded, loading, failed } = get();
    if (loaded.has(type) || loading.has(type)) return;
    void get().refreshType(type);
  },

  refreshType: async (type) => {
    const { loading } = get();
    if (loading.has(type)) return;
    set((s) => {
      const nextLoading = new Set(s.loading);
      nextLoading.add(type);
      const nextFailed = new Set(s.failed);
      nextFailed.delete(type);
      return { loading: nextLoading, failed: nextFailed };
    });
    try {
      const data = await favoriteApi.mapType(type);
      const ids = new Set<number>();
      if (data && typeof data === "object") {
        for (const k of Object.keys(data)) {
          const n = Number(k);
          if (!Number.isNaN(n)) ids.add(n);
        }
      }
      set((s) => {
        const nextLoading = new Set(s.loading);
        nextLoading.delete(type);
        const nextLoaded = new Set(s.loaded);
        nextLoaded.add(type);
        const nextFailed = new Set(s.failed);
        nextFailed.delete(type);
        return { maps: { ...s.maps, [type]: ids }, loading: nextLoading, loaded: nextLoaded, failed: nextFailed };
      });
    } catch {
      // 加载失败：标记失败允许重试，按钮按"未收藏"渲染（点击走 API 会得到真实状态）
      set((s) => {
        const nextLoading = new Set(s.loading);
        nextLoading.delete(type);
        const nextFailed = new Set(s.failed);
        nextFailed.add(type);
        const nextLoaded = new Set(s.loaded);
        nextLoaded.delete(type);
        return { loading: nextLoading, failed: nextFailed, loaded: nextLoaded };
      });
    }
  },

  isFavorited: (type, objectId) => {
    return get().maps[type]?.has(objectId) === true;
  },

  isReady: (type) => {
    return get().loaded.has(type);
  },

  toggle: async (objectId, type, note = "") => {
    const before = get().isFavorited(type, objectId);
    // 乐观更新：先切换本地态
    const applyLocal = (favorited: boolean) => {
      set((s) => {
        const prev = s.maps[type] ?? new Set<number>();
        const next = new Set(prev);
        if (favorited) next.add(objectId);
        else next.delete(objectId);
        return { maps: { ...s.maps, [type]: next } };
      });
    };
    applyLocal(!before);
    try {
      const res = await favoriteApi.toggle(objectId, type, note);
      const after = res?.data ? Boolean(res.data.favorited) : !before;
      // 以服务端结果为准（防止与其他端并发操作产生偏差）
      if (after !== !before) applyLocal(after);
      return after;
    } catch (err: any) {
      // 失败回滚到切换前状态
      applyLocal(before);
      const msg = err?.response?.data?.message || err?.data?.message || "收藏操作失败，请稍后重试";
      throw new Error(msg);
    }
  },

  removeIds: (pairs) => {
    set((s) => {
      const nextMaps = { ...s.maps };
      for (const { type, objectId } of pairs) {
        const prev = nextMaps[type];
        if (!prev || !prev.has(objectId)) continue;
        const next = new Set(prev);
        next.delete(objectId);
        nextMaps[type] = next;
      }
      return { maps: nextMaps };
    });
  },

  reset: () => {
    set({ maps: {}, loaded: new Set<string>(), loading: new Set<string>(), failed: new Set<string>() });
  },
}));
