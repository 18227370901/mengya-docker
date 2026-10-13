import { create } from "zustand";
import api from "@/api/client";
import { authApi } from "@/api/auth";
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
    const initialPerms = user && user.permissions && Object.keys(user.permissions).length > 0 ? user.permissions : {};
    set({ user: { ...user, permissions: initialPerms }, token: access, permissions: initialPerms, loading: true });
    try {
      const data = await authApi.me();
      const perms = (data as any).permissions || data.user.permissions || {};
      if ((data as any).admin_session_timeout_minutes !== undefined) {
        localStorage.setItem("mengya_admin_timeout", String((data as any).admin_session_timeout_minutes));
      }
      set({ user: { ...data.user, permissions: perms }, stage: data.stage, permissions: perms, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem("mengya_access");
    localStorage.removeItem("mengya_refresh");
    localStorage.removeItem("mengya_last_active");
    set({ user: null, stage: null, token: null, permissions: {} });
  },

  fetchMe: async () => {
    try {
      const data = await authApi.me();
      const perms = (data as any).permissions || data.user.permissions || {};
      if ((data as any).admin_session_timeout_minutes !== undefined) {
        localStorage.setItem("mengya_admin_timeout", String((data as any).admin_session_timeout_minutes));
      }
      const curStage = get().stage;
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
      const curUser = get().user;
      const newUser = data.user;
      const curPerms = get().permissions;
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
      set({ user: nextUser, stage: nextStage, permissions: nextPerms, loading: false });
    } catch {
      const refreshToken = localStorage.getItem("mengya_refresh");
      if (refreshToken) {
        try {
          const refreshResp = await api.post("/auth/refresh/", { refresh: refreshToken });
          const newAccess = refreshResp.data?.data?.access;
          if (newAccess) {
            localStorage.setItem("mengya_access", newAccess);
            set({ token: newAccess });
            const data = await authApi.me();
            const perms = (data as any).permissions || data.user.permissions || {};
            const curStage = get().stage;
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
      const curUser = get().user;
      const newUser = data.user;
      const curPerms = get().permissions;
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
      set({ user: nextUser, stage: nextStage, permissions: nextPerms, loading: false });
            return;
          }
        } catch {
          // refresh failed
        }
      }
      get().logout();
      set({ loading: false });
    }
  },

  init: async () => {
    const token = get().token;
    if (!token) {
      set({ loading: false });
      return;
    }
    await get().fetchMe();
  },
}));
