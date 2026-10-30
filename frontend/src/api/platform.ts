import api from "./client";
import { ThirdPartyPlatform, ThirdPartyPlatformResource, PlatformMetaFetchResult } from "../types/platform";

import { PlatformUserOption } from "../types/platform";

export const platformApi = {
  getUserOptions: () =>
    api.get<{ code: number; message: string; data: PlatformUserOption[] }>("/platforms/user-options/"),
  fetchMeta: (url: string) =>
    api.post<{ code: number; message: string; data: PlatformMetaFetchResult }>("/platforms/fetch-meta/", { url }),

  getPlatforms: (params?: { category?: string; age_group?: string; keyword?: string }) =>
    api.get<{ code: number; message: string; data: ThirdPartyPlatform[] }>("/platforms/", { params }),

  getPlatformDetail: (id: number) =>
    api.get<{ code: number; message: string; data: ThirdPartyPlatform }>(`/platforms/${id}/`),

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

  logAccess: (platformId: number, resourceId?: number) =>
    api.post<{ code: number; message: string; data: null }>(`/platforms/${platformId}/access/`, { resource_id: resourceId }),
};
