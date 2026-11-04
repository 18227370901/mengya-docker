/** v2.09 外部接口服务配置类型定义 */

export type ServiceAdapterType = "standard" | "uapis" | "qweather" | "amap" | "custom_json";
export type ServiceAuthType = "none" | "bearer" | "header" | "query";

export interface ServiceEndpoint {
  url: string;
  enabled: boolean;
  name?: string;
  adapter?: ServiceAdapterType;
  auth_type?: ServiceAuthType;
  auth_key?: string;
  auth_value?: string;
  has_auth_value?: boolean;
}

export interface ServiceEngine {
  key: string;
  url: string;
  timeout: number;
  enabled: boolean;
  auth_type?: ServiceAuthType;
  auth_key?: string;
  auth_value?: string;
  has_auth_value?: boolean;
}

export interface ServiceEndpointPreset {
  id: string;
  group: string;
  name: string;
  url: string;
  adapter: ServiceAdapterType;
  auth_type: ServiceAuthType;
  auth_key?: string;
  desc?: string;
}

export interface ServiceConfigGroup {
  label: string;
  type: "endpoints" | "engines";
  timeout: number | null;
  retries: number;
  defaults: Array<{ url: string; enabled?: boolean; key?: string; timeout?: number }>;
  endpoints?: ServiceEndpoint[];
  engines?: ServiceEngine[];
  engine_labels?: Record<string, string>;
}

export interface ServiceConfigData {
  groups: Record<string, ServiceConfigGroup>;
  presets?: ServiceEndpointPreset[];
}

export interface ServiceTestResult {
  url: string;
  ok: boolean;
  message: string;
  latency_ms: number;
}

export interface ServiceTestResponse {
  results: ServiceTestResult[];
}

export interface ServiceConfigPayload {
  group: string;
  endpoints?: ServiceEndpoint[];
  engines?: ServiceEngine[];
  timeout?: number;
  retries?: number;
}
