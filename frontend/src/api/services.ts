import api from "./client";
import type { ApiResponse, ChatSessionDetail, ChatSessionSummary, HealthRecord, ShoppingList, ShoppingListItem, AIChatResult, BabyShoppingListResponse, BabyShoppingCategories, AIRecommendResult } from "@/types";

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

export const healthApi = {
  list: (params?: { record_type?: string }) =>
    api.get<ApiResponse<HealthRecord[]>>("/health/records/", { params }).then((r) => r.data.data),

  create: (data: Partial<HealthRecord>) =>
    api.post<ApiResponse<HealthRecord>>("/health/records/", data).then((r) => r.data.data),

  update: (id: number, data: Partial<HealthRecord>) =>
    api.patch<ApiResponse<HealthRecord>>(`/health/records/${id}/`, data).then((r) => r.data.data),

  remove: (id: number) => api.delete<ApiResponse<null>>(`/health/records/${id}/`).then((r) => r.data.data),
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