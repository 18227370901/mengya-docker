import React, { useState } from "react";
import {
  Check,
  X,
  Play,
  Trash2,
  Key,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import type {
  ServiceEndpoint,
  ServiceAdapterType,
  ServiceAuthType,
  ServiceTestResult,
} from "@/types/serviceConfig";

interface EndpointRowProps {
  group: string;
  endpoint: ServiceEndpoint;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updated: ServiceEndpoint) => void;
  onDelete: () => void;
  onTest: (endpoint: ServiceEndpoint) => Promise<ServiceTestResult | null>;
}

export default function EndpointRow({
  group,
  endpoint,
  index,
  onUpdate,
  onDelete,
  onTest,
}: EndpointRowProps) {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ServiceTestResult | null>(null);

  const isWeatherGroup = group === "forecast" || group === "geocoding";
  const authType = endpoint.auth_type || "none";

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await onTest(endpoint);
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        endpoint.enabled
          ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/80 shadow-sm"
          : "border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900/40 opacity-75"
      }`}
    >
      <div className="flex flex-col gap-3">
        {/* Row 1: Number + URL Input + Remarks + Right Action Buttons (Test, Status Toggle, Delete) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              #{index + 1}
            </span>
            <input
              type="text"
              className="flex-1 min-w-0 font-mono text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              placeholder="https://api.example.com/v1/..."
              value={endpoint.url}
              onChange={(e) => onUpdate({ ...endpoint, url: e.target.value })}
            />
            <input
              type="text"
              className="w-32 sm:w-40 shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              placeholder="备注名称 (可选)"
              value={endpoint.name || ""}
              onChange={(e) => onUpdate({ ...endpoint, name: e.target.value })}
            />
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 justify-end">
            {/* Single Row Test Button */}
            <button
              type="button"
              disabled={testing || !endpoint.url.trim()}
              onClick={handleTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
              title="测试此端点单点连通性"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
              ) : (
                <Play className="h-3.5 w-3.5 text-brand-500" />
              )}
              <span>测试连接</span>
            </button>

            {/* Status Toggle Button */}
            <button
              type="button"
              onClick={() => onUpdate({ ...endpoint, enabled: !endpoint.enabled })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                endpoint.enabled
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
              }`}
              title={endpoint.enabled ? "点击切换为停用状态" : "点击切换为启用状态"}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  endpoint.enabled ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                }`}
              />
              <span>{endpoint.enabled ? "已启用" : "已停用"}</span>
            </button>

            {/* Delete Button */}
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              title="删除此端点"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Row 2: Adapter Protocol & Authentication Settings */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs pt-1 border-t border-gray-100/70 dark:border-gray-700/50">
          {/* Adapter Type */}
          {isWeatherGroup && (
            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">协议类型:</span>
              <select
                value={endpoint.adapter || "standard"}
                onChange={(e) => onUpdate({ ...endpoint, adapter: e.target.value as ServiceAdapterType })}
                className="bg-transparent text-xs text-gray-800 dark:text-gray-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="standard">Open-Meteo 标准 (含15天多日预报/免Key)</option>
                <option value="uapis">UAPIS 极简实况 (国内直连/自适应实况看板)</option>
                <option value="qweather">和风天气 QWeather (商业多日预报)</option>
                <option value="amap">高德开放平台天气 (需API Key)</option>
                <option value="custom_json">通用标准 JSON 接口</option>
              </select>
            </div>
          )}

          {/* Auth Type */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
            <Shield className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">鉴权模式:</span>
            <select
              value={authType}
              onChange={(e) => onUpdate({ ...endpoint, auth_type: e.target.value as ServiceAuthType })}
              className="bg-transparent text-xs text-gray-800 dark:text-gray-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value="none">无需凭据 (None)</option>
              <option value="query">URL 查询参数 (Query 如 ?key=...)</option>
              <option value="header">请求头认证 (Header 如 X-API-Key)</option>
              <option value="bearer">Bearer Token (Authorization 头)</option>
            </select>
          </div>

          {/* Auth Parameter Name */}
          {(authType === "query" || authType === "header") && (
            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">参数名:</span>
              <input
                type="text"
                placeholder={authType === "query" ? "key" : "X-API-Key"}
                value={endpoint.auth_key || ""}
                onChange={(e) => onUpdate({ ...endpoint, auth_key: e.target.value })}
                className="w-24 bg-transparent text-xs text-gray-800 dark:text-gray-200 focus:outline-none font-mono"
              />
            </div>
          )}

          {/* Auth Value Input */}
          {authType !== "none" && (
            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <Key className="h-3.5 w-3.5 text-amber-500" />
              <input
                type={showKey ? "text" : "password"}
                placeholder={endpoint.has_auth_value ? "已保存密文 (输入新Key覆盖)" : "输入 API Key / Token"}
                value={endpoint.auth_value || ""}
                onChange={(e) => onUpdate({ ...endpoint, auth_value: e.target.value })}
                className="w-36 sm:w-52 bg-transparent text-xs text-gray-800 dark:text-gray-200 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
                title={showKey ? "隐藏密文" : "显示明文"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Test Result Feedback */}
      {testResult && (
        <div
          className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 border animate-fade-in ${
            testResult.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-300"
              : "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span className="truncate font-medium">{testResult.message}</span>
          </div>
          <span className="font-mono text-[11px] font-bold shrink-0 bg-white/60 dark:bg-black/30 px-2 py-0.5 rounded">
            {testResult.latency_ms} ms
          </span>
        </div>
      )}
    </div>
  );
}
