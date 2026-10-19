/** v1.73 外部接口服务配置类型（对应后端 service_config.py） */

export interface ServiceEndpoint {
  url: string;
  enabled: boolean;
}

export interface ServiceEngine {
  key: string;
  url: string;
  timeout: number;
  enabled: boolean;
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