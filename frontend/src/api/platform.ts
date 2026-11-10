import api from "./client";
import { ThirdPartyPlatform, ThirdPartyPlatformResource, PlatformMetaFetchResult } from "../types/platform";

import { PlatformUserOption } from "../types/platform";

export const platformApi = {
  getUserOptions: () =>
    api.get<{ code: number; message: string; data: PlatformUserOption[] }>("/platforms/user-options/"),
  fetchMeta: (url: string) =>
    api.post<{ code: number; message: string; data: PlatformMetaFetchResult }>("/platforms/fetch-meta/", { url }),

  getPlatforms: (params?: { category?: string; age_group?: string; keyword?: string; scope?: "hub" | "manage" }) =>
    api.get<{ code: number; message: string; data: ThirdPartyPlatform[] }>("/platforms/", { params }),

  getPlatformDetail: (id: number, scope?: "hub" | "manage") =>
    api.get<{ code: number; message: string; data: ThirdPartyPlatform }>(`/platforms/${id}/`, { params: scope ? { scope } : undefined }),

  createPlatform: (data: Partial<ThirdPartyPlatform>) =>
    api.post<{ code: number; message: string; data: ThirdPartyPlatform }>("/platforms/", data),

  updatePlatform: (id: number, data: Partial<ThirdPartyPlatform>) =>
    api.put<{ code: number; message: string; data: ThirdPartyPlatform }>(`/platforms/${id}/`, data),

  deletePlatform: (id: number) =>
    api.delete<{ code: number; message: string; data: null }>(`/platforms/${id}/`),

  createResource: (platformId: number, data: Partial<ThirdPartyPlatformResource>) =>
    api.post<{ code: number; message: string; data: ThirdPartyPlatformResource }>(`/platforms/${platformId}/resources/`, data),

  updateResource: (resourceId: number, data: Partial<ThirdPartyPlatformResource>) =>
    api.put<{ code: number; message: string; data: ThirdPartyPlatformResource }>(`/platforms/resources/${resourceId}/`, data),

  deleteResource: (resourceId: number) =>
    api.delete<{ code: number; message: string; data: null }>(`/platforms/resources/${resourceId}/`),

  checkUrl: (url: string, excludeId?: number) =>
    api.get<{ code: number; message: string; data: { exists: boolean; duplicate?: { id: number; name: string; url: string } } }>("/platforms/check-url/", {
      params: { url, exclude_id: excludeId },
    }),
  batchAction: (action: "enable" | "disable" | "delete", ids: number[]) =>
    api.post<{ code: number; message: string; data: null }>("/platforms/batch/", { action, ids }),
  logAccess: (platformId: number, resourceId?: number) =>
    api.post<{ code: number; message: string; data: null }>(`/platforms/${platformId}/access/`, { resource_id: resourceId }),
  exportPlatforms: (format: "json" | "csv" = "json") => {
    return api.get(`/platforms/export/?export_type=${format}`, {
      responseType: "blob",
    });
  },
  importPlatforms: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ code: number; message: string; data: { imported_count: number; updated_count: number; errors: string[] } }>(
      "/platforms/import/",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  downloadTemplate: (lang: "zh" | "en" = "zh") => {
    return api.get(`/platforms/template/?lang=${lang}`, {
      responseType: "blob",
    });
  },
};
