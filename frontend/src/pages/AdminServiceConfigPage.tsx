import React, { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  CloudSun,
  Globe2,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  Wind,
  CalendarDays,
  Search,
  BookOpen,
  Sparkles,
  Languages,
  Check,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { serviceConfigApi } from "@/api/services";
import type {
  ServiceConfigData,
  ServiceConfigGroup,
  ServiceConfigPayload,
  ServiceEndpoint,
  ServiceEngine,
  ServiceTestResult,
  ServiceEndpointPreset,
} from "@/types/serviceConfig";
import DocGuideModal from "@/components/serviceConfig/DocGuideModal";
import EndpointRow from "@/components/serviceConfig/EndpointRow";

const GROUP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  geocoding: Search,
  forecast: CloudSun,
  air_quality: Wind,
  holiday: CalendarDays,
  search_pipeline: Globe2,
  translation: Languages,
};

type CategoryTab = "all" | "weather" | "holiday" | "search" | "translation";

export default function AdminServiceConfigPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ServiceConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("all");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await serviceConfigApi.get();
      setData(res);
    } catch (e: any) {
      showToast(e.response?.data?.message || "加载配置失败", false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Update endpoint in state
  const handleUpdateEndpoint = (gname: string, index: number, updated: ServiceEndpoint) => {
    if (!data) return;
    const group = data.groups[gname];
    if (!group || !group.endpoints) return;
    const newEndpoints = [...group.endpoints];
    newEndpoints[index] = updated;
    setData({
      ...data,
      groups: {
        ...data.groups,
        [gname]: { ...group, endpoints: newEndpoints },
      },
    });
  };

  // Delete endpoint from state
  const handleDeleteEndpoint = (gname: string, index: number) => {
    if (!data) return;
    const group = data.groups[gname];
    if (!group || !group.endpoints) return;
    const newEndpoints = group.endpoints.filter((_, i) => i !== index);
    setData({
      ...data,
      groups: {
        ...data.groups,
        [gname]: { ...group, endpoints: newEndpoints },
      },
    });
  };

  // Add new empty endpoint
  const handleAddEndpoint = (gname: string) => {
    if (!data) return;
    const group = data.groups[gname];
    if (!group) return;
    const newEndpoints = [
      ...(group.endpoints || []),
      {
        url: "",
        enabled: true,
        name: "",
        adapter: "standard" as const,
        auth_type: "none" as const,
        auth_key: "",
        auth_value: "",
      },
    ];
    setData({
      ...data,
      groups: {
        ...data.groups,
        [gname]: { ...group, endpoints: newEndpoints },
      },
    });
  };

  // Add preset template
  const handleAddPreset = (gname: string, preset: ServiceEndpointPreset) => {
    if (!data) return;
    const group = data.groups[gname];
    if (!group) return;
    const newEndpoints = [
      ...(group.endpoints || []),
      {
        url: preset.url,
        enabled: true,
        name: preset.name,
        adapter: preset.adapter,
        auth_type: preset.auth_type,
        auth_key: preset.auth_key || "",
        auth_value: "",
      },
    ];
    setData({
      ...data,
      groups: {
        ...data.groups,
        [gname]: { ...group, endpoints: newEndpoints },
      },
    });
    showToast(`已添加【${preset.name}】预置端点`);
  };

  // Single row test
  const handleTestEndpoint = async (gname: string, endpoint: ServiceEndpoint): Promise<ServiceTestResult | null> => {
    try {
      const res = await serviceConfigApi.test({
        group: gname,
        endpoints: [endpoint],
        timeout: data?.groups[gname]?.timeout || 8,
      });
      return res.results?.[0] || null;
    } catch (e: any) {
      return {
        url: endpoint.url,
        ok: false,
        message: e.response?.data?.message || "连通性测试请求失败",
        latency_ms: 0,
      };
    }
  };

  // Save specific group
  const handleSaveGroup = async (gname: string) => {
    if (!data) return;
    const group = data.groups[gname];
    if (!group) return;
    setSaving(true);
    try {
      const payload: ServiceConfigPayload = {
        group: gname,
        timeout: group.timeout || 8,
        retries: group.retries || 0,
      };
      if (group.type === "engines") {
        payload.engines = group.engines;
      } else {
        payload.endpoints = group.endpoints;
      }
      await serviceConfigApi.update(payload);
      showToast(`【${group.label}】配置已保存并即时生效`);
      await load();
    } catch (e: any) {
      showToast(e.response?.data?.message || "保存失败", false);
    } finally {
      setSaving(false);
    }
  };

  // Save all groups
  const handleSaveAll = async () => {
    if (!data) return;
    setSaving(true);
    try {
      for (const gname of Object.keys(data.groups)) {
        const group = data.groups[gname];
        const payload: ServiceConfigPayload = {
          group: gname,
          timeout: group.timeout || 8,
          retries: group.retries || 0,
        };
        if (group.type === "engines") {
          payload.engines = group.engines;
        } else {
          payload.endpoints = group.endpoints;
        }
        await serviceConfigApi.update(payload);
      }
      showToast("全量外部接口配置已保存并即时生效");
      await load();
    } catch (e: any) {
      showToast(e.response?.data?.message || "部分配置保存失败", false);
    } finally {
      setSaving(false);
    }
  };

  // Restore defaults
  const handleRestore = async () => {
    setRestoreOpen(false);
    setSaving(true);
    try {
      await serviceConfigApi.restore();
      showToast("已成功恢复全部内置接口默认值");
      await load();
    } catch (e: any) {
      showToast(e.response?.data?.message || "恢复默认失败", false);
    } finally {
      setSaving(false);
    }
  };

  // Filter groups by category
  const filteredGroups = Object.entries(data?.groups || {}).filter(([gname]) => {
    if (activeCategory === "all") return true;
    if (activeCategory === "weather") return ["geocoding", "forecast", "air_quality"].includes(gname);
    if (activeCategory === "holiday") return gname === "holiday";
    if (activeCategory === "search") return gname === "search_pipeline";
    if (activeCategory === "translation") return gname === "translation";
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold animate-fade-in ${
            toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-500 hover:text-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>外部接口服务配置</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                v2.09 多源适配增强
              </span>
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              统一配置天气、历法、AI 搜索管线与翻译引擎。支持 API Key 凭据、多源协议适配与即时测试。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDocModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 transition shadow-sm"
          >
            <BookOpen className="h-4 w-4 text-brand-500" />
            <span>接入规范说明</span>
          </button>
          <button
            onClick={() => setRestoreOpen(true)}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4 text-gray-400" />
            <span>恢复默认</span>
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-98 transition shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>保存全部配置</span>
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { key: "all", label: "全部服务组" },
          { key: "weather", label: "气象服务集群 (定位/预报/空气)" },
          { key: "holiday", label: "法定节假日日历" },
          { key: "search", label: "AI 公网搜索管线" },
          { key: "translation", label: "双语翻译引擎" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key as CategoryTab)}
            className={`px-3.5 py-1.5 rounded-xl font-medium whitespace-nowrap transition ${
              activeCategory === tab.key
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Groups */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-brand-500" />
          <p className="text-xs">正在加载接口服务配置...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map(([gname, group]) => {
            const Icon = GROUP_ICONS[gname] || Globe2;
            const presets = (data?.presets || []).filter((p) => p.group === gname);

            return (
              <div
                key={gname}
                className="card p-5 space-y-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm rounded-2xl"
              >
                {/* Group Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <span>{group.label}</span>
                        <span className="font-mono text-[11px] font-normal text-gray-400">({gname})</span>
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {group.type === "endpoints"
                          ? `已配置 ${group.endpoints?.length || 0} 个端点 · 自动容灾轮询与故障转移`
                          : `已配置 ${group.engines?.length || 0} 个搜索引擎 · 依序逐级回退`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    {/* Timeout & Retries */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
                      {group.type === "endpoints" && (
                        <div className="flex items-center gap-1">
                          <span>超时:</span>
                          <input
                            type="number"
                            min="1"
                            max="60"
                            value={group.timeout || 8}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 8;
                              setData({
                                ...data!,
                                groups: {
                                  ...data!.groups,
                                  [gname]: { ...group, timeout: val },
                                },
                              });
                            }}
                            className="w-12 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center font-mono"
                          />
                          <span>秒</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-2">
                        <span>重试:</span>
                        <input
                          type="number"
                          min="0"
                          max="5"
                          value={group.retries || 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setData({
                              ...data!,
                              groups: {
                                ...data!.groups,
                                [gname]: { ...group, retries: val },
                              },
                            });
                          }}
                          className="w-10 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center font-mono"
                        />
                        <span>轮</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveGroup(gname)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-400 dark:hover:bg-brand-900/50 transition"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>保存此组</span>
                    </button>
                  </div>
                </div>

                {/* Presets Quick Picker (for endpoints groups) */}
                {group.type === "endpoints" && presets.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-xs bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30">
                    <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 shrink-0">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>快速预置:</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleAddPreset(gname, preset)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/50 hover:border-amber-400 text-gray-700 dark:text-gray-300 font-medium transition shadow-2xs hover:scale-102 flex items-center gap-1"
                          title={preset.desc}
                        >
                          <Plus className="h-3 w-3 text-amber-600" />
                          <span>{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content: Endpoints List or Engines List */}
                {group.type === "endpoints" ? (
                  <div className="space-y-3">
                    {(group.endpoints || []).map((ep, idx) => (
                      <EndpointRow
                        key={idx}
                        group={gname}
                        endpoint={ep}
                        index={idx}
                        isFirst={idx === 0}
                        isLast={idx === (group.endpoints?.length || 1) - 1}
                        onUpdate={(updated) => handleUpdateEndpoint(gname, idx, updated)}
                        onDelete={() => handleDeleteEndpoint(gname, idx)}
                        onTest={(endpoint) => handleTestEndpoint(gname, endpoint)}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={() => handleAddEndpoint(gname)}
                      className="w-full py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-500 rounded-xl text-xs font-semibold text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      <span>添加自定义端点地址</span>
                    </button>
                  </div>
                ) : (
                  /* Engines list (search_pipeline / translation) */
                  <div className="space-y-2.5">
                    {(group.engines || []).map((eng, idx) => (
                      <div
                        key={eng.key}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                          eng.enabled
                            ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                            : "border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-6 font-mono text-[11px] font-bold text-gray-400">#{idx + 1}</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200 w-28 shrink-0">
                            {group.engine_labels?.[eng.key] || eng.key}
                          </span>
                          <input
                            type="text"
                            value={eng.url}
                            onChange={(e) => {
                              const newEngines = [...(group.engines || [])];
                              newEngines[idx] = { ...eng, url: e.target.value };
                              setData({
                                ...data!,
                                groups: {
                                  ...data!.groups,
                                  [gname]: { ...group, engines: newEngines },
                                },
                              });
                            }}
                            className="flex-1 font-mono text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                            placeholder="引擎 URL"
                          />
                        </div>

                        <div className="flex items-center gap-3 justify-end shrink-0">
                          <div className="flex items-center gap-1 text-gray-500">
                            <span>超时:</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0.3"
                              max="30"
                              value={eng.timeout}
                              onChange={(e) => {
                                const newEngines = [...(group.engines || [])];
                                newEngines[idx] = { ...eng, timeout: parseFloat(e.target.value) || 1 };
                                setData({
                                  ...data!,
                                  groups: {
                                    ...data!.groups,
                                    [gname]: { ...group, engines: newEngines },
                                  },
                                });
                              }}
                              className="w-14 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center font-mono"
                            />
                            <span>s</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const newEngines = [...(group.engines || [])];
                              newEngines[idx] = { ...eng, enabled: !eng.enabled };
                              setData({
                                ...data!,
                                groups: {
                                  ...data!.groups,
                                  [gname]: { ...group, engines: newEngines },
                                },
                              });
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                              eng.enabled
                                ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                                : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
                            }`}
                            title={eng.enabled ? "点击切换为停用状态" : "点击切换为启用状态"}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                eng.enabled ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                              }`}
                            />
                            <span>{eng.enabled ? "已启用" : "已停用"}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restore Defaults Confirmation */}
      <ConfirmDialog
        isOpen={restoreOpen}
        title="恢复内置接口配置为默认值"
        message="确定要恢复全部外部接口配置为内置出厂默认值吗？此操作将清空当前自定义的所有端点、API Key 与排序参数。"
        confirmText="确认恢复出厂设置"
        danger={true}
        onConfirm={handleRestore}
        onCancel={() => setRestoreOpen(false)}
      />

      {/* Docs Guide Modal */}
      <DocGuideModal isOpen={docModalOpen} onClose={() => setDocModalOpen(false)} />
    </div>
  );
}
