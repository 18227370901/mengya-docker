import api from "./client";
import type { ApiResponse, FavoriteItem, BrandProfile, FetalStory, KidsEncyclopedia, Product, Recipe, TimelineItem } from "@/types";

export const timelineApi = {
  list: (params?: { stage?: string; category?: string; essential?: boolean; page?: number; page_size?: number }) =>
    api.get<ApiResponse<TimelineItem[]>>("/timeline/", { params }).then((r) => r.data.data),

  detail: (id: number) => api.get<ApiResponse<TimelineItem>>(`/timeline/${id}/`).then((r) => r.data.data),

  // 管理员 CRUD
  create: (data: Partial<TimelineItem>) =>
    api.post<ApiResponse<TimelineItem>>("/timeline/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<TimelineItem>) =>
    api.patch<ApiResponse<TimelineItem>>(`/timeline/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) =>
    api.delete<ApiResponse<null>>(`/timeline/${id}/`).then((r) => r.data.data),
  // 导入导出（仅管理员）
  exportCsv: () => api.get<Blob>("/timeline/export_csv/", { responseType: "blob" }).then((r) => r.data),
  importTemplate: () => api.get<Blob>("/timeline/import_template/", { responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/timeline/import_csv/", fd).then((r) => r.data);
  },
};

export const recipeApi = {
  list: (params?: { period?: string; period_month?: string; nutrient?: string; search?: string }) =>
    api.get<ApiResponse<Recipe[]>>("/recipes/", { params }).then((r) => r.data.data),
  detail: (id: number) => api.get<ApiResponse<Recipe>>(`/recipes/${id}/`).then((r) => r.data.data),
  nutrients: () => api.get<ApiResponse<{ nutrient_tag: string; count: number }[]>>("/recipes/nutrients/").then((r) => r.data.data),
};

export const kidsEncyclopediaApi = {
  list: (params?: { chapter?: string; search?: string }) =>
    api.get<ApiResponse<KidsEncyclopedia[]>>("/kids-encyclopedia/", { params }).then((r) => r.data.data),
  detail: (id: number) => api.get<ApiResponse<KidsEncyclopedia>>(`/kids-encyclopedia/${id}/`).then((r) => r.data.data),
  chapters: () => api.get<ApiResponse<{ chapter: string; count: number }[]>>("/kids-encyclopedia/chapters/").then((r) => r.data.data),
};

export const productApi = {
  list: (params?: Record<string, string | number | undefined> & { page?: number; page_size?: number }) =>
    api.get<ApiResponse<{ items: Product[]; total: number; page: number; page_size: number; total_pages: number }>>("/products/", { params }).then((r) => r.data.data),

  // 不分页列表（用于下拉选择等场景）
  listAll: (params?: Record<string, string | number | undefined>) =>
    api.get<ApiResponse<Product[]>>("/products/", { params: { ...params, no_page: 1 } }).then((r) => r.data.data),

  detail: (id: number) => api.get<ApiResponse<Product>>(`/products/${id}/`).then((r) => r.data.data),

  create: (data: Partial<Product>) =>
    api.post<ApiResponse<Product>>("/products/", data).then((r) => r.data.data),

  update: (id: number, data: Partial<Product>) =>
    api.patch<ApiResponse<Product>>(`/products/${id}/`, data).then((r) => r.data.data),

  remove: (id: number) =>
    api.delete<ApiResponse<null>>(`/products/${id}/`).then((r) => r.data),

  aiEvaluate: (id: number) =>
    api.post<ApiResponse<{ source: string; used_config_name: string; evaluation: string; product_id: number; product_name: string }>>(`/products/${id}/ai-evaluate/`).then((r) => r.data.data),

  // 导入导出（仅管理员）
  exportCsv: () => api.get<Blob>("/products/export_csv/", { responseType: "blob" }).then((r) => r.data),
  importTemplate: () => api.get<Blob>("/products/import_template/", { responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/products/import_csv/", fd).then((r) => r.data);
  },
};

export const brandApi = {
  list: () => api.get<ApiResponse<BrandProfile[]>>("/brands/").then((r) => r.data.data),
  detail: (id: number) => api.get<ApiResponse<BrandProfile>>(`/brands/${id}/`).then((r) => r.data.data),
};

export const fetalStoryApi = {
  list: (params?: { week?: number; narrator?: string }) =>
    api.get<ApiResponse<FetalStory[]>>("/fetal-stories/", { params }).then((r) => r.data.data),
  detail: (id: number) =>
    api.get<ApiResponse<FetalStory>>(`/fetal-stories/${id}/`).then((r) => r.data.data),
  weeks: () =>
    api.get<ApiResponse<number[]>>("/fetal-stories/weeks/").then((r) => r.data.data),
  incrementView: (id: number) =>
    api.post<ApiResponse<{ view_count: number }>>(`/fetal-stories/${id}/increment_view/`).then((r) => r.data.data),
};

export const favoriteApi = {
  list: (params?: { favorite_type?: string; object_id?: number }) =>
    api.get<ApiResponse<FavoriteItem[]>>("/favorites/", { params }).then((r) => r.data.data),
  add: (objectId: number, type = "product", note = "") =>
    api.post<ApiResponse<FavoriteItem>>("/favorites/", { favorite_type: type, object_id: objectId, note }).then((r) => r.data.data),
  remove: (id: number) =>
    api.delete<ApiResponse<null>>(`/favorites/${id}/`).then((r) => r.data),
  toggle: (objectId: number, type = "product", note = "") =>
    api.post<ApiResponse<{ favorited: boolean; object_id: number; id?: number }>>("/favorites/toggle/", { favorite_type: type, object_id: objectId, note }).then((r) => r.data),
};
