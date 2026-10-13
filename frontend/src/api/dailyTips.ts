import api from "./client";

export interface DailyTipItem {
  id: number;
  title: string;
  content: string;
  tag: string;
  stage_type: "newborn" | "infant" | "toddler" | "pregnancy" | "general" | string;
  stage_type_label: string;
  is_active: boolean;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PublicDailyTipsData {
  tips: Array<{
    id: number;
    title: string;
    tip: string;
    tag: string;
    stage_type: string;
  }>;
  display_count: number;
}

export interface DailyTipListParams {
  page?: number;
  page_size?: number;
  stage_type?: string;
  is_active?: string;
  search?: string;
}

export interface DailyTipListResponse {
  items: DailyTipItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  display_count: number;
  stats: {
    total: number;
    active_count: number;
    builtin_count: number;
  };
}

export const dailyTipsApi = {
  // 前台获取指定阶段的启用锦囊
  getPublicTips: async (stageType: string = "newborn"): Promise<PublicDailyTipsData> => {
    const res = await api.get<{ code: number; message: string; data: PublicDailyTipsData }>(
      "/daily-tips/",
      { params: { stage_type: stageType } }
    );
    return res.data.data;
  },

  // 管理员：分页查询锦囊列表
  getAdminTips: async (params: DailyTipListParams = {}): Promise<DailyTipListResponse> => {
    const res = await api.get<{ code: number; message: string; data: DailyTipListResponse }>(
      "/admin/daily-tips/",
      { params }
    );
    return res.data.data;
  },

  // 管理员：新增锦囊
  createTip: async (data: {
    title: string;
    content: string;
    tag?: string;
    stage_type?: string;
    is_active?: boolean;
    sort_order?: number;
  }): Promise<DailyTipItem> => {
    const res = await api.post<{ code: number; message: string; data: DailyTipItem }>(
      "/admin/daily-tips/",
      data
    );
    return res.data.data;
  },

  // 管理员：编辑锦囊
  updateTip: async (
    id: number,
    data: Partial<{
      title: string;
      content: string;
      tag: string;
      stage_type: string;
      is_active: boolean;
      sort_order: number;
    }>
  ): Promise<DailyTipItem> => {
    const res = await api.put<{ code: number; message: string; data: DailyTipItem }>(
      `/admin/daily-tips/${id}/`,
      data
    );
    return res.data.data;
  },

  // 管理员：删除锦囊
  deleteTip: async (id: number): Promise<{ id: number }> => {
    const res = await api.delete<{ code: number; message: string; data: { id: number } }>(
      `/admin/daily-tips/${id}/`
    );
    return res.data.data;
  },

  // 管理员：批量修改启用/停用状态
  batchStatus: async (ids: number[], is_active: boolean): Promise<{ count: number; is_active: boolean }> => {
    const res = await api.post<{ code: number; message: string; data: { count: number; is_active: boolean } }>(
      "/admin/daily-tips/batch-status/",
      { ids, is_active }
    );
    return res.data.data;
  },

  // 管理员：批量删除
  batchDelete: async (ids: number[]): Promise<{ count: number }> => {
    const res = await api.post<{ code: number; message: string; data: { count: number } }>(
      "/admin/daily-tips/batch-delete/",
      { ids }
    );
    return res.data.data;
  },

  // 管理员：设置前台展示条数限制
  updateConfig: async (display_count: number): Promise<{ display_count: number }> => {
    const res = await api.post<{ code: number; message: string; data: { display_count: number } }>(
      "/admin/daily-tips/config/",
      { display_count }
    );
    return res.data.data;
  },

  // 管理员：重置/补充系统内置提示
  resetBuiltin: async (force_reset: boolean = false): Promise<{ created: number; updated: number }> => {
    const res = await api.post<{ code: number; message: string; data: { created: number; updated: number } }>(
      "/admin/daily-tips/reset-builtin/",
      { force_reset }
    );
    return res.data.data;
  },
};