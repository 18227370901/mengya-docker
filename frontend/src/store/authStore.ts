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
    const userPerms = user.permissions || permissions;
    if (key in userPerms) {
      return Boolean(userPerms[key]);
    }
    return true;
  },

  setPermissions: (permissions: Record<string, boolean>) => {
    set({ permissions });
  },

  setAuth: async (user, access, refresh) => {
    localStorage.setItem("mengya_access", access);
    localStorage.setItem("mengya_refresh", refresh);
    set({ user, token: access, permissions: user.permissions || {}, loading: true });
    try {
      const data = await authApi.me();
      const perms = (data as any).permissions || data.user.permissions || {};
      set({ user: data.user, stage: data.stage, permissions: perms, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem("mengya_access");
    localStorage.removeItem("mengya_refresh");
    set({ user: null, stage: null, token: null, permissions: {} });
  },

  fetchMe: async () => {
    try {
      const data = await authApi.me();
      const perms = (data as any).permissions || data.user.permissions || {};
      set({ user: data.user, stage: data.stage, permissions: perms, loading: false });
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
            set({ user: data.user, stage: data.stage, permissions: perms, loading: false });
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
