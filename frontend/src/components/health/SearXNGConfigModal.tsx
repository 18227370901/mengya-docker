import React, { useEffect, useState } from "react";
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Save,
  X,
  Server,
  Shield,
  Clock,
} from "lucide-react";
import { searxngConfigApi } from "@/api/services";
import type { SearXNGConfig, SearXNGTestResult } from "@/types/health";

interface SearXNGConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SearXNGConfigModal({
  isOpen,
  onClose,
  onSaved,
}: SearXNGConfigModalProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<SearXNGTestResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [form, setForm] = useState<SearXNGConfig>({
    base_url: "http://127.0.0.1:8888",
    timeout: 4.0,
    format: "json",
    engines: "",
    health_domains:
      "nhc.gov.cn,cndiet.cn,chinanutri.cn,dxy.com,haodf.com,familydoctor.com.cn,cdc.gov.cn",
    is_available: false,
    ai_fallback_enabled: false,
  });

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setTestResult(null);
      setSavedSuccess(false);
      setErrorMessage("");
      searxngConfigApi
        .get()
        .then((res) => {
          if (res) {
            setForm({
              base_url: res.base_url || "http://127.0.0.1:8888",
              timeout: res.timeout || 4.0,
              format: res.format || "json",
              engines: res.engines || "",
              health_domains:
                res.health_domains ||
                "nhc.gov.cn,cndiet.cn,chinanutri.cn,dxy.com,haodf.com,familydoctor.com.cn,cdc.gov.cn",
              is_available: !!res.is_available,
              can_manage: res.can_manage,
              ai_fallback_enabled: !!res.ai_fallback_enabled,
            });
          }
        })
        .catch((err: any) => {
          setErrorMessage(err.message || "获取 SearXNG 配置失败");
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMessage("");
    try {
      const res = await searxngConfigApi.test({
        base_url: form.base_url,
        timeout: Number(form.timeout),
        engines: form.engines,
        health_domains: form.health_domains,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        status: "failed",
        message: err.message || "连通性测试请求失败，请检查网络或后端权限",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage("");
    try {
      await searxngConfigApi.update({
        base_url: form.base_url,
        timeout: Number(form.timeout),
        engines: form.engines,
        health_domains: form.health_domains,
        ai_fallback_enabled: !!form.ai_fallback_enabled,
      });
      setSavedSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || "保存配置失败，请确认管理员权限");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl transition-all dark:bg-gray-800 dark:text-gray-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          type="button"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3 dark:border-gray-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              SearXNG 搜索引擎配置管理
            </h3>
            <p className="text-xs text-gray-400">
              管理员在线调整私有化实例地址、超时限制与权威域名白名单，自动同步写回 .env 配置文件
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {savedSuccess && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>配置已成功更新并持久化写入 .env，服务运行配置已热刷新！</span>
              </div>
            )}

            <div>
              <label className="label flex items-center justify-between">
                <span>私有 SearXNG 实例基础地址 (SEARXNG_BASE_URL) *</span>
                <span className="text-[11px] text-gray-400">必须以 http:// 或 https:// 开头</span>
              </label>
              <div className="relative">
                <Server className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  className="input pl-9"
                  placeholder="例如 http://127.0.0.1:8888 或 http://192.168.1.100:8888"
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span>超时熔断 (SEARXNG_TIMEOUT, 秒) *</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="30"
                  className="input"
                  value={form.timeout}
                  onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })}
                  required
                />
              </div>

              <div>
                <label className="label flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-gray-400" />
                  <span>响应格式 (SEARXNG_FORMAT)</span>
                </label>
                <input
                  type="text"
                  className="input cursor-not-allowed bg-gray-50 text-gray-400 dark:bg-gray-900"
                  value="json (系统强制标准)"
                  disabled
                />
              </div>
            </div>

            <div>
              <label className="label flex items-center justify-between">
                <span>指定检索源引擎 (SEARXNG_ENGINES, 可选)</span>
                <span className="text-[11px] text-gray-400">逗号分隔，留空使用实例默认引擎</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="例如 bing,sogou,google 或留空"
                value={form.engines}
                onChange={(e) => setForm({ ...form, engines: e.target.value })}
              />
              {/* v1.57 推荐引擎一键应用预设：国内网络优化源免手输，点击即填入 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-gray-400">推荐预设：</span>
                {[
                  { label: "国内优选 (bing+sogou)", value: "bing,sogou", desc: "国内网络连通性最佳的组合，推荐首选" },
                  { label: "仅 bing", value: "bing", desc: "微软必应，国内可直连" },
                  { label: "国际组合 (google+bing)", value: "google,bing", desc: "需实例具备国际网络出口" },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.desc}
                    onClick={() => setForm({ ...form, engines: preset.value })}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      form.engines === preset.value
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-brand-950/50"
                    }`}
                  >
                    {form.engines === preset.value ? "✓ " : ""}
                    {preset.label}
                  </button>
                ))}
                {form.engines && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, engines: "" })}
                    className="text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
                  >
                    清空
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                实例上游引擎若被限流/验证码封禁，可在「连通测试」结果中查看具体失效引擎；预设已按国内网络可用性排序
              </p>
            </div>

            <div>
              <label className="label flex items-center justify-between">
                <span>权威健康机构白名单 (SEARXNG_HEALTH_DOMAINS) *</span>
                <span className="text-[11px] text-gray-400">仅从权威来源抓取食谱与实时答案</span>
              </label>
              <textarea
                rows={3}
                className="input text-xs leading-relaxed"
                placeholder="nhc.gov.cn,cndiet.cn,chinanutri.cn,dxy.com,haodf.com,familydoctor.com.cn,cdc.gov.cn"
                value={form.health_domains}
                onChange={(e) => setForm({ ...form, health_domains: e.target.value })}
                required
              />
            </div>

            {/* AI 助手公网引擎兜底开关（v1.55 管理员可控，默认关闭） */}
            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="pr-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  AI 助手公网引擎兜底 (AI_SEARCH_FALLBACK_ENABLED)
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                  SearXNG 不可用时：关闭（默认）直接由 AI 知识库回答；开启后回退多公网引擎检索（可能受网络环境波动）
                </p>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={!!form.ai_fallback_enabled}
                  onChange={(e) => setForm({ ...form, ai_fallback_enabled: e.target.checked })}
                  className="peer sr-only"
                />
                <div className="peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-500 peer-checked:after:translate-x-full dark:bg-gray-600" />
              </label>
            </div>

            {testResult && (
              <div
                className={`rounded-xl border p-3.5 text-xs transition-all ${
                  testResult.status === "success"
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
                    : testResult.status === "warning"
                    ? "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
                    : "border-red-200 bg-red-50/70 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : testResult.status === "warning" ? (
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                  <span>
                    {testResult.status === "success" ? "测试成功" : testResult.status === "warning" ? "连通但引擎异常" : "测试未通过"}：
                    {testResult.message}
                  </span>
                </div>
                {testResult.status !== "failed" && (
                  <div className="mt-2 space-y-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <div>
                      响应耗时：<b>{testResult.latency_ms} ms</b> · 通用检索样本：
                      <b>{testResult.sample_count} 条</b>
                      {typeof testResult.health_count === "number" && (
                        <>
                          {" "}· 权威健康通道：
                          <b>{testResult.health_count} 条</b>
                        </>
                      )}
                    </div>
                    {testResult.sample_titles && testResult.sample_titles.length > 0 && (
                      <div className="border-t border-emerald-200/50 pt-1 dark:border-emerald-900/40">
                        <span className="font-medium">样本示例：</span>
                        {testResult.sample_titles.slice(0, 3).map((t, idx) => (
                          <div key={idx} className="truncate">
                            • {t}
                          </div>
                        ))}
                      </div>
                    )}
                    {testResult.unresponsive_engines && testResult.unresponsive_engines.length > 0 && (
                      <div className="border-t border-amber-200/60 pt-1 text-amber-700 dark:border-amber-900/40 dark:text-amber-400">
                        <span className="font-medium">暂不可用引擎：</span>
                        {testResult.unresponsive_engines.slice(0, 8).join("、")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || saving || !form.base_url}
                className="btn-secondary gap-1.5 text-xs"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                ) : (
                  <Play className="h-3.5 w-3.5 text-brand-600" />
                )}
                测试连通性
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary text-xs"
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.base_url}
                  className="btn-primary gap-1.5 text-xs shadow-md shadow-brand-500/20"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  保存并同步至 .env
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
