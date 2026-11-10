import { clearSessionMediaCache } from "@/utils/sessionMediaCache";
import axios from "axios";
import { create } from "zustand";
import { authApi } from "@/api/auth";
import { useFavoriteStore } from "@/store/favoriteStore";
import type { Stage, User } from "@/types";

interface AuthState {
  user: User | null;
  stage: Stage | null;
  token: string | null;
  permissions: Record<string, boolean>;
  loading: boolean;
  setAuth: (user: User, access: string, refresh: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  init: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  setPermissions: (permissions: Record<string, boolean>) => void;
}

let fetchMeInFlight: Promise<void> | null = null;

function mergeMeResponse(
  data: { user: User; stage: Stage; permissions?: Record<string, boolean>; admin_session_timeout_minutes?: number },
  curUser: User | null,
  curStage: Stage | null,
  curPerms: Record<string, boolean>
) {
  const perms = (data as any).permissions || data.user.permissions || {};
  if ((data as any).admin_session_timeout_minutes !== undefined) {
    localStorage.setItem("mengya_admin_timeout", String((data as any).admin_session_timeout_minutes));
  }
  const newStage = data.stage;
  const isStageEqual =
    (!curStage && !newStage) ||
    (curStage &&
      newStage &&
      curStage.type === newStage.type &&
      curStage.is_pregnant === newStage.is_pregnant &&
      curStage.value === newStage.value &&
      curStage.label === newStage.label &&
      curStage.week_days_text === newStage.week_days_text &&
      curStage.days_to_due === newStage.days_to_due &&
      curStage.trimester === newStage.trimester &&
      curStage.period === newStage.period);
  const nextStage = isStageEqual ? curStage : newStage;

  const newUser = data.user;
  const isPermsEqual = JSON.stringify(curPerms) === JSON.stringify(perms);
  const nextPerms = isPermsEqual ? curPerms : perms;
  const isUserEqual =
    !!curUser &&
    !!newUser &&
    curUser.id === newUser.id &&
    curUser.phone === newUser.phone &&
    curUser.nickname === newUser.nickname &&
    curUser.role === newUser.role &&
    curUser.avatar === newUser.avatar &&
    curUser.due_date === newUser.due_date &&
    curUser.baby_birthday === newUser.baby_birthday &&
    curUser.is_pregnant === newUser.is_pregnant &&
    curUser.is_staff === newUser.is_staff &&
    curUser.is_active === newUser.is_active &&
    curUser.ai_authorized === newUser.ai_authorized &&
    isPermsEqual;
  const nextUser = isUserEqual ? curUser : { ...newUser, permissions: nextPerms };
  return { user: nextUser, stage: nextStage, permissions: nextPerms };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  stage: null,
  token: localStorage.getItem("mengya_access"),
  permissions: {},
  loading: true,

  hasPermission: (key: string) => {
    const { user, permissions } = get();
    if (!user) return false;
    // 管理员拥有全部权限
    if (user.is_staff) return true;
    const userPerms =
      user.permissions && Object.keys(user.permissions).length > 0
        ? user.permissions
        : permissions && Object.keys(permissions).length > 0
        ? permissions
        : null;
    if (userPerms && typeof userPerms === "object" && key in userPerms) {
      return Boolean(userPerms[key]);
    }
    return false;
  },

  setPermissions: (permissions: Record<string, boolean>) => {
    set({ permissions });
  },

  setAuth: async (user, access, refresh) => {
    localStorage.setItem("mengya_access", access);
    localStorage.setItem("mengya_refresh", refresh);
    // v1.88.4 账号切换时清空收藏缓存（新旧用户数据严格隔离）
    useFavoriteStore.getState().reset();
    const initialPerms = user && user.permissions && Object.keys(user.permissions).length > 0 ? user.permissions : {};
    set({ user: { ...user, permissions: initialPerms }, token: access, permissions: initialPerms, loading: true });
    try {
      const data = await authApi.me();
      const merged = mergeMeResponse(data as any, get().user, get().stage, get().permissions);
      set({ ...merged, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  logout: () => {
    clearSessionMediaCache();
    localStorage.removeItem("mengya_access");
    localStorage.removeItem("mengya_refresh");
    // v1.88.4 登出时清空收藏缓存
    useFavoriteStore.getState().reset();
    localStorage.removeItem("mengya_last_active");
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith("mengya_weather_")) {
          localStorage.removeItem(k);
        }
      }
      localStorage.removeItem("mengya_last_weather_city");
    } catch {
      /* ignore */
    }
    set({ user: null, stage: null, token: null, permissions: {} });
  },

  fetchMe: async () => {
    if (fetchMeInFlight) {
      return fetchMeInFlight;
    }
    fetchMeInFlight = (async () => {
      try {
        const data = await authApi.me();
        const merged = mergeMeResponse(data as any, get().user, get().stage, get().permissions);
        set({ ...merged, loading: false });
      } catch (err: any) {
        if (axios.isCancel(err) || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
          set({ loading: false });
          return;
        }
        const status = err?.response?.status;
        if (status === 401 || status === 403 || !get().user) {
          get().logout();
        }
        set({ loading: false });
      } finally {
        fetchMeInFlight = null;
      }
    })();
    return fetchMeInFlight;
  },

  init: async () => {
    const token = get().token || localStorage.getItem("mengya_access");
    if (!token) {
      set({ loading: false });
      return;
    }
    if (get().user) {
      set({ loading: false });
      return;
    }
    await get().fetchMe();
  },
}));
