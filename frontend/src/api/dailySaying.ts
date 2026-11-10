import api from "./client";

export interface DailySayingData {
  text: string;
  source?: string;
  provider?: string;
  can_refresh?: boolean;
}

export const dailySayingApi = {
  getSaying: async (refresh: boolean = false): Promise<DailySayingData | null> => {
    const res = await api.get<{ code: number; message: string; data: DailySayingData | null }>(
      "/daily-saying/",
      { params: refresh ? { refresh: 1, _t: Date.now() } : undefined }
    );
    return res.data.data;
  },
};
