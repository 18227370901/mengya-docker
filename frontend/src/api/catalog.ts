import api from "./client";
import type {
  ApiResponse,
  BabyShoppingItem,
  BrandProfile,
  FavoriteItem,
  FetalStory,
  KidsEncyclopedia,
  KnowledgePagedResponse,
  KnowledgeResetStats,
  Product,
  Recipe,
  TimelineItem,
} from "@/types";

/** v1.88.1 知识库 CSV 导出范围：page=当前页 / filtered=筛选结果全部 / selected=仅选中项 */
export type KbExportScope = "page" | "filtered" | "selected";

/** v1.88.1 知识库导出 POST 载荷：scope + 当前筛选条件 + 分页/选中集 */
export interface KbExportPayload {
  scope: KbExportScope;
  page?: number;
  page_size?: number;
  /** scope=selected 时必传 */
  ids?: number[];
  /** 管理页可见停用数据（后端 with_inactive=1 时导出含停用条目） */
  with_inactive?: number;
  /** 其余列表筛选条件（stage/category/search/status 等） */
  [key: string]: unknown;
}

export const timelineApi = {
  /** 展示页全量列表（不带 page 参数，后端返回数组） */
  list: (params?: { stage?: string; category?: string; essential?: boolean; search?: string; essential_filter?: string }) =>
    api.get<ApiResponse<TimelineItem[]>>("/timeline/", { params }).then((r) => r.data.data as TimelineItem[]),
  /** 管理页服务端分页列表（v1.88） */
  listPaged: (params?: { stage?: string; category?: string; essential_filter?: string; search?: string; page?: number; page_size?: number }) =>
    api.get<ApiResponse<KnowledgePagedResponse<TimelineItem>>>("/timeline/", { params }).then((r) => r.data.data as KnowledgePagedResponse<TimelineItem>),

  detail: (id: number) => api.get<ApiResponse<TimelineItem>>(`/timeline/${id}/`).then((r) => r.data.data),

  // 管理员 CRUD
  create: (data: Partial<TimelineItem>) =>
    api.post<ApiResponse<TimelineItem>>("/timeline/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<TimelineItem>) =>
    api.patch<ApiResponse<TimelineItem>>(`/timeline/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) =>
    api.delete<ApiResponse<null>>(`/timeline/${id}/`).then((r) => r.data.data),
  batch: (ids: number[], action: "delete" | "essential" | "unessential") =>
    api.post<ApiResponse<{ count: number; action: string }>>("/timeline/batch/", { ids, action }).then((r) => r.data),
  // 导入导出（仅管理员）；v1.88.1 导出改 POST + scope 三选，模板双语（lang=cn|en）
  exportCsv: (payload: KbExportPayload) =>
    api.post<Blob>("/timeline/export_csv/", payload, { responseType: "blob" }).then((r) => r.data),
  importTemplate: (lang: "cn" | "en" = "cn") =>
    api.get<Blob>("/timeline/import_template/", { params: { lang }, responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/timeline/import_csv/", fd).then((r) => r.data);
  },
};

export const recipeApi = {
  /** 展示页全量列表（不带 page 参数，后端返回数组） */
  list: (params?: { period?: string; period_month?: string; nutrient?: string; search?: string }) =>
    api.get<ApiResponse<Recipe[]>>("/recipes/", { params }).then((r) => r.data.data as Recipe[]),
  /** 管理页服务端分页列表（v1.88） */
  listPaged: (params?: { period?: string; search?: string; status?: string; page?: number; page_size?: number }) =>
    api.get<ApiResponse<KnowledgePagedResponse<Recipe>>>("/recipes/", { params }).then((r) => r.data.data as KnowledgePagedResponse<Recipe>),
  detail: (id: number) => api.get<ApiResponse<Recipe>>(`/recipes/${id}/`).then((r) => r.data.data),
  nutrients: () => api.get<ApiResponse<{ nutrient_tag: string; count: number }[]>>("/recipes/nutrients/").then((r) => r.data.data),
  // v1.88 管理员 CRUD + 批量 + 导入导出
  create: (data: Partial<Recipe>) => api.post<ApiResponse<Recipe>>("/recipes/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<Recipe>) => api.patch<ApiResponse<Recipe>>(`/recipes/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) => api.delete<ApiResponse<null>>(`/recipes/${id}/`).then((r) => r.data.data),
  batch: (ids: number[], action: "delete" | "active" | "inactive") =>
    api.post<ApiResponse<{ count: number; action: string }>>("/recipes/batch/", { ids, action }).then((r) => r.data),
  exportCsv: (payload: KbExportPayload) =>
    api.post<Blob>("/recipes/export_csv/", payload, { responseType: "blob" }).then((r) => r.data),
  importTemplate: (lang: "cn" | "en" = "cn") =>
    api.get<Blob>("/recipes/import_template/", { params: { lang }, responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/recipes/import_csv/", fd).then((r) => r.data);
  },
};

export const kidsEncyclopediaApi = {
  /** 展示页全量列表（不带 page 参数，后端返回数组） */
  list: (params?: { chapter?: string; search?: string }) =>
    api.get<ApiResponse<KidsEncyclopedia[]>>("/kids-encyclopedia/", { params }).then((r) => r.data.data as KidsEncyclopedia[]),
  /** 管理页服务端分页列表（v1.88） */
  listPaged: (params?: { chapter?: string; search?: string; status?: string; page?: number; page_size?: number }) =>
    api.get<ApiResponse<KnowledgePagedResponse<KidsEncyclopedia>>>("/kids-encyclopedia/", { params }).then((r) => r.data.data as KnowledgePagedResponse<KidsEncyclopedia>),
  detail: (id: number) => api.get<ApiResponse<KidsEncyclopedia>>(`/kids-encyclopedia/${id}/`).then((r) => r.data.data),
  chapters: () => api.get<ApiResponse<{ chapter: string; count: number }[]>>("/kids-encyclopedia/chapters/").then((r) => r.data.data),
  // v1.88 管理员 CRUD + 批量 + 导入导出
  create: (data: Partial<KidsEncyclopedia>) => api.post<ApiResponse<KidsEncyclopedia>>("/kids-encyclopedia/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<KidsEncyclopedia>) => api.patch<ApiResponse<KidsEncyclopedia>>(`/kids-encyclopedia/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) => api.delete<ApiResponse<null>>(`/kids-encyclopedia/${id}/`).then((r) => r.data.data),
  batch: (ids: number[], action: "delete" | "active" | "inactive") =>
    api.post<ApiResponse<{ count: number; action: string }>>("/kids-encyclopedia/batch/", { ids, action }).then((r) => r.data),
  exportCsv: (payload: KbExportPayload) =>
    api.post<Blob>("/kids-encyclopedia/export_csv/", payload, { responseType: "blob" }).then((r) => r.data),
  importTemplate: (lang: "cn" | "en" = "cn") =>
    api.get<Blob>("/kids-encyclopedia/import_template/", { params: { lang }, responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/kids-encyclopedia/import_csv/", fd).then((r) => r.data);
  },
};

export const productApi = {
  list: (params?: Record<string, string | number | undefined> & { page?: number; page_size?: number; q?: string; status?: string }) =>
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

  // v1.88 商品批量操作：delete / active（上架）/ inactive（暂存）
  batch: (ids: number[], action: "delete" | "active" | "inactive") =>
    api.post<ApiResponse<{ count: number; action: string }>>("/products/batch/", { ids, action }).then((r) => r.data),

  aiEvaluate: (id: number) =>
    api.post<ApiResponse<{ source: string; used_config_name: string; evaluation: string; product_id: number; product_name: string }>>(`/products/${id}/ai-evaluate/`).then((r) => r.data.data),

  // 导入导出（仅管理员）；v1.88.1 导出改 POST + scope 三选，含品牌档案标签列
  exportCsv: (payload: KbExportPayload) =>
    api.post<Blob>("/products/export_csv/", payload, { responseType: "blob" }).then((r) => r.data),
  importTemplate: (lang: "cn" | "en" = "cn") =>
    api.get<Blob>("/products/import_template/", { params: { lang }, responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/products/import_csv/", fd).then((r) => r.data);
  },
};

export const brandApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<ApiResponse<BrandProfile[]>>("/brands/", { params }).then((r) => r.data.data),
  detail: (id: number) => api.get<ApiResponse<BrandProfile>>(`/brands/${id}/`).then((r) => r.data.data),
  // v1.88 管理员 CRUD（后端已收口仅管理员可写）
  create: (data: Partial<BrandProfile>) => api.post<ApiResponse<BrandProfile>>("/brands/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<BrandProfile>) => api.patch<ApiResponse<BrandProfile>>(`/brands/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) => api.delete<ApiResponse<null>>(`/brands/${id}/`).then((r) => r.data),
};

export const fetalStoryApi = {
  /** 展示页全量列表（不带 page 参数，后端返回数组） */
  list: (params?: { week?: number; narrator?: string }) =>
    api.get<ApiResponse<FetalStory[]>>("/fetal-stories/", { params }).then((r) => r.data.data as FetalStory[]),
  /** 管理页服务端分页列表（v1.88） */
  listPaged: (params?: { week?: number; narrator?: string; search?: string; status?: string; page?: number; page_size?: number }) =>
    api.get<ApiResponse<KnowledgePagedResponse<FetalStory>>>("/fetal-stories/", { params }).then((r) => r.data.data as KnowledgePagedResponse<FetalStory>),
  detail: (id: number) =>
    api.get<ApiResponse<FetalStory>>(`/fetal-stories/${id}/`).then((r) => r.data.data),
  weeks: () =>
    api.get<ApiResponse<number[]>>("/fetal-stories/weeks/").then((r) => r.data.data),
  incrementView: (id: number) =>
    api.post<ApiResponse<{ view_count: number }>>(`/fetal-stories/${id}/increment_view/`).then((r) => r.data.data),
  // v1.88 管理员 CRUD + 批量 + 导入导出
  create: (data: Partial<FetalStory>) => api.post<ApiResponse<FetalStory>>("/fetal-stories/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<FetalStory>) => api.patch<ApiResponse<FetalStory>>(`/fetal-stories/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) => api.delete<ApiResponse<null>>(`/fetal-stories/${id}/`).then((r) => r.data.data),
  batch: (ids: number[], action: "delete" | "active" | "inactive") =>
    api.post<ApiResponse<{ count: number; action: string }>>("/fetal-stories/batch/", { ids, action }).then((r) => r.data),
  exportCsv: (payload: KbExportPayload) =>
    api.post<Blob>("/fetal-stories/export_csv/", payload, { responseType: "blob" }).then((r) => r.data),
  importTemplate: (lang: "cn" | "en" = "cn") =>
    api.get<Blob>("/fetal-stories/import_template/", { params: { lang }, responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/fetal-stories/import_csv/", fd).then((r) => r.data);
  },
};

export const babyShoppingApi = {
  list: (params?: { owner?: string; category?: string; keyword?: string; page?: number; page_size?: number; status?: string; with_inactive?: number }) =>
    api.get<ApiResponse<{ items: BabyShoppingItem[]; total: number; page: number; page_size: number; total_pages: number; stats?: Record<string, string | number> }>>("/baby-shopping/", { params }).then((r) => r.data.data),
  detail: (id: number) => api.get<ApiResponse<BabyShoppingItem>>(`/baby-shopping/${id}/`).then((r) => r.data.data),
  categories: () => api.get<ApiResponse<Record<string, string[]>>>("/baby-shopping/categories/").then((r) => r.data.data),
  // v1.88 管理员 CRUD + 批量
  create: (data: Partial<BabyShoppingItem>) => api.post<ApiResponse<BabyShoppingItem>>("/baby-shopping/", data).then((r) => r.data.data),
  update: (id: number, data: Partial<BabyShoppingItem>) => api.patch<ApiResponse<BabyShoppingItem>>(`/baby-shopping/${id}/`, data).then((r) => r.data.data),
  remove: (id: number) => api.delete<ApiResponse<null>>(`/baby-shopping/${id}/`).then((r) => r.data.data),
  batch: (ids: number[], action: "delete" | "active" | "inactive") =>
    api.post<ApiResponse<{ count: number; action: string }>>("/baby-shopping/batch/", { ids, action }).then((r) => r.data),
  // v1.88.4 导入导出 + 模板
  exportCsv: (payload: KbExportPayload) =>
    api.post<Blob>("/baby-shopping/export_csv/", payload, { responseType: "blob" }).then((r) => r.data),
  importTemplate: (lang: "cn" | "en" = "cn") =>
    api.get<Blob>("/baby-shopping/import_template/", { params: { lang }, responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/baby-shopping/import_csv/", fd).then((r) => r.data);
  },
};

export const knowledgeAdminApi = {
  /** v1.88 知识库恢复出厂：获取模块统计（当前条数/内置条数） */
  stats: (module: string) =>
    api.get<ApiResponse<KnowledgeResetStats[]>>("/admin/knowledge/reset/", { params: { module } }).then((r) => r.data.data),
  /** v1.88 知识库恢复出厂：清空模块全部数据并重灌初始内置数据 */
  reset: (module: string) =>
    api.post<ApiResponse<{ module: string; deleted: number; created: number }>>("/admin/knowledge/reset/", { module }).then((r) => r.data),
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
  /** v1.88.1 批量取消收藏（收藏中心多选删除） */
  batchDelete: (ids: number[]) =>
    api.post<ApiResponse<{ count: number }>>("/favorites/batch-delete/", { ids }).then((r) => r.data),
  /** v1.88.4 类型级收藏状态查询（一次返回该类型全部收藏的 object_id map，配合全局 favoriteStore 收敛 N+1 请求） */
  mapType: (type: string) =>
    api.get<ApiResponse<Record<string, boolean>>>(`/favorites/map/`, { params: { favorite_type: type } })
      .then((r) => r.data.data as Record<string, boolean>),
};
