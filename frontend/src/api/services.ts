import api from "./client";
import type { ApiResponse, ChatSessionDetail, ChatSessionSummary, HealthRecord, ShoppingList, ShoppingListItem, AIChatResult, BabyShoppingListResponse, BabyShoppingCategories, AIRecommendResult } from "@/types";
import type { BmiAnalysisInput, BmiAnalysisResult, BmiTimeSeriesRecord, SearXNGConfig, SearXNGTestResult, CsvImportResult, VitalsAnalysisInput, VitalsAnalysisResult, VitalsTimeSeriesRecord, VitalsSummary, VitalsAiResult } from "@/types/health";
import type { ServiceConfigData, ServiceConfigPayload, ServiceTestResponse } from "@/types/serviceConfig";
export const shoppingApi = {
  list: () => api.get<ApiResponse<ShoppingList[]>>("/shopping-lists/").then((r) => r.data.data),

  detail: (id: number) => api.get<ApiResponse<ShoppingList>>(`/shopping-lists/${id}/`).then((r) => r.data.data),

  generate: (data: { season: string; delivery_method: string; name?: string }) =>
    api.post<ApiResponse<ShoppingList>>("/shopping-lists/generate/", data).then((r) => r.data.data),

  create: (data: Partial<ShoppingList>) => api.post<ApiResponse<ShoppingList>>("/shopping-lists/", data).then((r) => r.data.data),

  toggleCheck: (listId: number, itemId: number) =>
    api.post<ApiResponse<null>>(`/shopping-lists/${listId}/toggle_check/`, { item_id: itemId }).then((r) => r.data.data),

  remove: (id: number) => api.delete<ApiResponse<null>>(`/shopping-lists/${id}/`).then((r) => r.data.data),

  fromTemplate: (data: { name?: string; owner?: string; categories?: string[]; item_ids?: number[]; season?: string; delivery_method?: string }) =>
    api.post<ApiResponse<ShoppingList>>("/shopping-lists/from_template/", data).then((r) => r.data.data),

  adoptAI: (data: { name?: string; season: string; delivery_method: string; categories: Array<{ category: string; owner: string; items: Array<{ name: string; quantity: string; unit: string; remark: string; estimated_price?: string }> }> }) =>
    api.post<ApiResponse<ShoppingList>>("/shopping-lists/adopt_ai/", data).then((r) => r.data.data),

  updateItem: (listId: number, itemId: number, data: Partial<ShoppingListItem>) =>
    api.post<ApiResponse<ShoppingListItem>>(`/shopping-lists/${listId}/update_item/`, { item_id: itemId, ...data }).then((r) => r.data.data),
};

export const babyShoppingApi = {
  list: (params: { owner?: string; category?: string; keyword?: string; page?: number; page_size?: number }) =>
    api.get<ApiResponse<BabyShoppingListResponse>>("/baby-shopping/", { params }).then((r) => r.data.data),

  categories: () =>
    api.get<ApiResponse<BabyShoppingCategories>>("/baby-shopping/categories/").then((r) => r.data.data),

  aiRecommend: (data: { season: string; delivery_method: string; budget?: string; extra?: string }) =>
    api.post<ApiResponse<AIRecommendResult>>("/baby-shopping/ai_recommend/", data, { timeout: 90000 }).then((r) => r.data.data),
};

export const searxngConfigApi = {
  get: () => api.get<ApiResponse<SearXNGConfig>>("/admin/searxng-config/").then((r) => r.data.data),
  update: (data: Partial<SearXNGConfig>) =>
    api.put<ApiResponse<SearXNGConfig>>("/admin/searxng-config/", data).then((r) => r.data.data),
  test: (data?: Partial<SearXNGConfig>) =>
    api.post<ApiResponse<SearXNGTestResult>>("/admin/searxng-config/test/", data).then((r) => r.data.data),
};

// v1.73 外部接口服务配置（天气 / 节假日 / AI 公网搜索引擎管线）
export const serviceConfigApi = {
  get: () => api.get<ApiResponse<ServiceConfigData>>("/admin/service-config/").then((r) => r.data.data),
  update: (data: ServiceConfigPayload) =>
    api.put<ApiResponse<ServiceConfigData>>("/admin/service-config/", data).then((r) => r.data.data),
  test: (data: ServiceConfigPayload) =>
    api.post<ApiResponse<ServiceTestResponse>>("/admin/service-config/test/", data).then((r) => r.data.data),
  restore: () => api.post<ApiResponse<ServiceConfigData>>("/admin/service-config/restore/").then((r) => r.data.data),
};

export const healthApi = {
  list: (params?: { record_type?: string }) =>
    api.get<ApiResponse<HealthRecord[]>>("/health/records/", { params }).then((r) => r.data.data),

  create: (data: Partial<HealthRecord>) =>
    api.post<ApiResponse<HealthRecord>>("/health/records/", data).then((r) => r.data.data),

  update: (id: number, data: Partial<HealthRecord>) =>
    api.patch<ApiResponse<HealthRecord>>(`/health/records/${id}/`, data).then((r) => r.data.data),

  remove: (id: number) => api.delete<ApiResponse<null>>(`/health/records/${id}/`).then((r) => r.data.data),

  // v1.57：批量删除（单事务，仅删除本人记录）
  batchDelete: (ids: number[]) =>
    api.post<ApiResponse<{ deleted: number; skipped: number[] }>>("/health/records/batch-delete/", { ids }).then((r) => r.data.data),

  // v1.57：CSV 健康数据批量导入（mom 妈妈体重打卡 / baby 宝宝生长测量；冲突策略 skip|overwrite）
  batchImport: (data: {
    target: "mom" | "baby";
    conflict_strategy: "skip" | "overwrite";
    records: Array<Record<string, string | number | undefined>>;
    mother_id?: number | null;
    stage_mode?: "convert_to_profile" | "keep_csv";
    allow_cross_stage?: boolean;
  }) =>
    api.post<ApiResponse<CsvImportResult>>("/health/records/batch-import/", data).then((r) => r.data.data),

  // 获取用户全时序测量打卡历史（用于趋势/增量图表看板与历史数据表，支持按妈妈维度隔离）
  getBmiTimeseries: (params?: { mother_id?: number | null }) =>
    api.get<ApiResponse<{ timeseries: BmiTimeSeriesRecord[] }>>("/health/bmi-analysis/", { params }).then((r) => r.data.data),
  analyzeBmi: (data: BmiAnalysisInput & { mother_id?: number | null }) =>
    api.post<ApiResponse<BmiAnalysisResult>>("/health/bmi-analysis/", data).then((r) => r.data.data),

  // 妈妈生命体征（血压、血糖）全时序与统计看板
  getVitalsTimeseries: (params?: { mother_id?: number | null }) =>
    api.get<ApiResponse<{ timeseries: VitalsTimeSeriesRecord[]; summary: VitalsSummary }>>("/health/vitals-analysis/", { params }).then((r) => r.data.data),

  // 妈妈生命体征录入与评估
  analyzeVitals: (data: VitalsAnalysisInput) =>
    api.post<ApiResponse<VitalsAnalysisResult>>("/health/vitals-analysis/", data).then((r) => r.data.data),

  // 触发 AI 专家深度解读生命体征
  analyzeVitalsAi: (data: { record_id?: number }) =>
    api.post<ApiResponse<VitalsAiResult>>("/health/vitals-ai-analyze/", data).then((r) => r.data.data),
};

export const aiApi = {
  chat: (query: string, sessionId?: number) =>
    api.post<ApiResponse<AIChatResult>>("/ai/chat/", { query, session_id: sessionId }).then((r) => r.data.data),

  history: () =>
    api.get<ApiResponse<Array<{ id: number; query: string; response: string; created_at: string }>>>("/ai/history/").then((r) => r.data.data),

  suggestions: () => api.get<ApiResponse<string[]>>("/ai/suggestions/").then((r) => r.data.data),

  // 会话管理
  sessions: () =>
    api.get<ApiResponse<ChatSessionSummary[]>>("/ai/sessions/").then((r) => r.data.data),

  sessionDetail: (id: number) =>
    api.get<ApiResponse<ChatSessionDetail>>(`/ai/sessions/${id}/`).then((r) => r.data.data),

  sessionCreate: (title?: string) =>
    api.post<ApiResponse<{ id: number; title: string }>>("/ai/sessions/create/", { title }).then((r) => r.data.data),

  sessionRename: (id: number, title: string) =>
    api.patch<ApiResponse<{ id: number; title: string }>>(`/ai/sessions/${id}/rename/`, { title }).then((r) => r.data.data),

  sessionDelete: (id: number) =>
    api.delete<ApiResponse<null>>(`/ai/sessions/${id}/delete/`).then((r) => r.data.data),
};