import api from "./client";
import type { ApiResponse, CompareResult } from "@/types";

/** radar 接口返回的雷达图数据 */
export interface RadarData {
  indicator: Array<{ name: string; max: number }>;
  series: Array<{ name: string; value: number[] }>;
}

export const compareApi = {
  compare: (productIds: number[], title = "") =>
    api.post<ApiResponse<CompareResult>>("/products/compare/", { product_ids: productIds, title }).then((r) => r.data.data),

  radar: (productIds: number[]) =>
    api.post<ApiResponse<RadarData>>("/products/compare/radar/", { product_ids: productIds }).then((r) => r.data.data),

  aiCompare: (productIds: number[], query: string) =>
    api
      .post<ApiResponse<{ response: string; mode: string }>>("/ai/compare/", { product_ids: productIds, query })
      .then((r) => r.data.data),
};