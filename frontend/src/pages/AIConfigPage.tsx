import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Bot, CheckCircle, ChevronDown, ChevronUp, Eye, EyeOff, Globe, Loader2, Play, Plus, Settings, Trash2, X } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { ListFilter, Sparkles } from "lucide-react";
import type { AIConfigItem } from "@/api/auth";
import { searxngConfigApi } from "@/api/services";
import type { SearXNGConfig } from "@/types/health";
import SearXNGConfigModal from "@/components/health/SearXNGConfigModal";

export default function AIConfigPage() {
  const navigate = useNavigate();
  const [aiConfigs, setAIConfigs] = useState<AIConfigItem[]>([]);
  const [aiHasGlobalKey, setAIHasGlobalKey] = useState(false);
  const [aiCanManage, setAICanManage] = useState(false);
  const [aiSaving, setAISaving] = useState(false);
  const [aiSaved, setAISaved] = useState(false);
  const [authUsers, setAuthUsers] = useState<Array<{ id: number; phone: string; nickname: string; is_staff: boolean; ai_authorized: boolean }>>([]);
  const [showKeys, setShowKeys] = useState<Record<number, boolean>>({});
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { status: "success" | "failed"; message: string; latency_ms?: number }>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  // v1.56：搜索引擎配置（入口由健康中心 BMI 页迁移至 AI 助手配置页）
  const [searxngModalOpen, setSearxngModalOpen] = useState(false);
  const [searchCfg, setSearchCfg] = useState<SearXNGConfig | null>(null);
  const { user, hasPermission } = useAuthStore();
  const canFetchModels = user?.is_staff || hasPermission("ai_fetch_models");
  const [fetchingModelsIdx, setFetchingModelsIdx] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<number, string[]>>({});
  const [expandedModels, setExpandedModels] = useState<Record<number, boolean>>({});
  const [modelSearchKeywords, setModelSearchKeywords] = useState<Record<number, string>>({});
  const [modelFetchMsg, setModelFetchMsg] = useState<Record<number, { type: "success" | "error" | "warn"; text: string }>>({});

  const handleFetchModels = async (idx: number, silent = false) => {
    const cfg = aiConfigs[idx];
    if (!cfg || !cfg.api_key.trim()) {
      if (!silent) {
        setModelFetchMsg((prev) => ({ ...prev, [idx]: { type: "warn", text: "请先填写 API Key" } }));
      }
      return;
    }
    setFetchingModelsIdx(idx);
    try {
      const res = await authApi.fetchAIModels({
        config_index: idx,
        api_key: cfg.api_key.trim(),
        base_url: (cfg.base_url || "").trim(),
      });
      const data = res.data;
      if (data?.success && data.models && data.models.length > 0) {
        setAvailableModels((prev) => ({ ...prev, [idx]: data.models }));
        setExpandedModels((prev) => ({ ...prev, [idx]: true }));
        setModelFetchMsg((prev) => ({
          ...prev,
          [idx]: { type: "success", text: `成功获取 ${data.models.length} 个可用模型（选择可自动填入）` },
        }));
      } else {
        if (!silent) {
          setModelFetchMsg((prev) => ({
            ...prev,
            [idx]: { type: "error", text: data?.message || "获取模型列表失败" },
          }));
        }
      }
    } catch (err: any) {
      if (!silent) {
        const msg = err.response?.data?.message || err.message || "请求模型列表异常";
        setModelFetchMsg((prev) => ({ ...prev, [idx]: { type: "error", text: msg } }));
      }
    } finally {
      setFetchingModelsIdx(null);
    }
  };

  useEffect(() => {
    if (!accessDenied) {
      searxngConfigApi
        .get()
        .then((cfg) => setSearchCfg(cfg))
        .catch(() => {});
    }
  }, [accessDenied]);

  useEffect(() => {
    authApi.aiConfig().then((data) => {
      setAIConfigs(data.ai_configs || []);
      setAIHasGlobalKey(data.has_global_key);
      setAICanManage(data.can_manage);
      if (data.can_manage) {
        authApi.aiAuthList().then(setAuthUsers).catch(() => setAuthUsers([]));
      }
    }).catch(() => {
      // 非管理员访问被拒绝
      setAccessDenied(true);
    });
  }, []);

  if (accessDenied) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand-500" />
            <h1 className="text-lg font-bold text-gray-800">AI 助手配置</h1>
          </div>
        </div>
        <div className="card py-12 text-center">
          <Bot className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">此页面仅管理员可访问</p>
          <p className="mt-2 text-sm text-gray-400">如需使用 AI 助手，请联系管理员授权</p>
          <button className="btn-secondary mt-4" onClick={() => navigate("/profile")}>
            返回个人中心
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md" onClick={() => navigate("/profile")}>
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-brand-500" />
          <h1 className="text-lg font-bold text-gray-800">AI 助手配置</h1>
        </div>
      </div>

      <section className="card">
        <p className="mb-4 text-sm text-gray-400">
          支持配置多个 AI，按顺序尝试调用——如果第一个配置失败会自动尝试下一个，全部失败后回退本地知识模式。
          {aiHasGlobalKey && <span className="ml-1 text-brand-500">（当前已有全局配置可用）</span>}
        </p>

        {/* 多配置列表 */}
        <div className="space-y-4">
          {aiConfigs.map((cfg, idx) => (
            <div key={idx} className={`rounded-xl border p-4 ${cfg.enabled ? "border-brand-200 bg-cream" : "border-gray-200 bg-gray-50 opacity-70"}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{idx + 1}</span>
                  <input
                    className="input flex-1 text-sm font-medium"
                    placeholder="配置名称"
                    value={cfg.name}
                    onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500 disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => setAIConfigs((prev) => {
                      const arr = [...prev];
                      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                      return arr;
                    })}
                    title="上移"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500 disabled:opacity-30"
                    disabled={idx === aiConfigs.length - 1}
                    onClick={() => setAIConfigs((prev) => {
                      const arr = [...prev];
                      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                      return arr;
                    })}
                    title="下移"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      cfg.enabled ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"
                    }`}
                    onClick={() => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c))}
                  >
                    {cfg.enabled ? "已启用" : "已禁用"}
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-red-400 hover:bg-red-50"
                    onClick={() => setAIConfigs((prev) => prev.filter((_, i) => i !== idx))}
                    title="删除此配置"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="label">API Key</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showKeys[idx] ? "text" : "password"}
                      placeholder="sk-..."
                      value={cfg.api_key}
                      onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, api_key: e.target.value } : c))}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-brand-500"
                      onClick={() => setShowKeys((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                      title={showKeys[idx] ? "隐藏" : "显示"}
                    >
                      {showKeys[idx] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Base URL</label>
                    <input
                      className="input"
                      placeholder="https://api.openai.com/v1"
                      value={cfg.base_url}
                      onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, base_url: e.target.value } : c))}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">模型名称</label>
                      {canFetchModels && (
                        <button
                          type="button"
                          onClick={() => handleFetchModels(idx)}
                          disabled={fetchingModelsIdx === idx}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                          title="从远端服务拉取可用模型列表"
                        >
                          {fetchingModelsIdx === idx ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>获取中...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              <span>获取模型列表</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <input
                      className="input"
                      placeholder="gpt-4o-mini"
                      value={cfg.model}
                      onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, model: e.target.value } : c))}
                    />
                  </div>
                </div>

                {/* 模型拉取反馈提示 */}
                {modelFetchMsg[idx] && (
                  <div className={`mt-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                    modelFetchMsg[idx].type === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : modelFetchMsg[idx].type === "warn"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-600 border border-red-200"
                  }`}>
                    <span className="truncate">{modelFetchMsg[idx].text}</span>
                    <button
                      type="button"
                      onClick={() => setModelFetchMsg((prev) => { const n = { ...prev }; delete n[idx]; return n; })}
                      className="ml-2 text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* 候选模型选择面板（支持折叠/展开与选中后自动折叠） */}
                {availableModels[idx] && availableModels[idx].length > 0 && (
                  (() => {
                    const allModels = availableModels[idx];
                    const kw = (modelSearchKeywords[idx] || "").trim().toLowerCase();
                    const filteredList = kw
                      ? allModels.filter((m) => m.toLowerCase().includes(kw))
                      : allModels;
                    const isExpanded = !!expandedModels[idx];

                    return !isExpanded ? (
                      /* 收起状态精简条：显示已选模型与展开按钮，避免页面数据铺满 */
                      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-gray-50/90 px-3 py-1.5 text-xs border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-600 min-w-0">
                          <ListFilter className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                          <span className="truncate">已拉取 <b>{allModels.length}</b> 个可用模型</span>
                          {cfg.model && (
                            <span className="text-gray-400 truncate hidden sm:inline">
                              · 已选：<span className="font-mono text-brand-600 font-semibold">{cfg.model}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedModels((prev) => ({ ...prev, [idx]: true }))}
                            className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-gray-200 shadow-2xs cursor-pointer"
                            title="展开模型列表以更换模型"
                          >
                            <span>展开列表</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAvailableModels((prev) => { const n = { ...prev }; delete n[idx]; return n; });
                              setExpandedModels((prev) => { const n = { ...prev }; delete n[idx]; return n; });
                            }}
                            className="text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                            title="清除此模型候选缓存"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 展开状态：支持过滤筛选，选中指定模型后立即自动折叠收起 */
                      <div className="mt-2.5 rounded-xl bg-gray-50/90 p-3 border border-brand-200/80 shadow-2xs">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200/60 text-xs">
                          <span className="font-semibold flex items-center gap-1.5 text-gray-700">
                            <ListFilter className="h-3.5 w-3.5 text-brand-500" />
                            <span>候选模型列表 ({filteredList.length}/{allModels.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedModels((prev) => ({ ...prev, [idx]: false }))}
                            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-white px-2.5 py-0.5 rounded-md border border-gray-200 shadow-2xs cursor-pointer"
                            title="折叠收起列表"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                            <span>折叠收起</span>
                          </button>
                        </div>

                        {allModels.length > 6 && (
                          <div className="mb-2">
                            <input
                              className="input text-xs py-1 px-2.5 bg-white w-full"
                              placeholder="输入关键词快速筛选模型 (如 gpt, claude, deepseek)..."
                              value={modelSearchKeywords[idx] || ""}
                              onChange={(e) => setModelSearchKeywords((prev) => ({ ...prev, [idx]: e.target.value }))}
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {filteredList.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, model: m } : c));
                                // 核心优化：选中指定模型后立即自动折叠收起列表，防止页面膨胀
                                setExpandedModels((prev) => ({ ...prev, [idx]: false }));
                              }}
                              className={`rounded-lg px-2.5 py-1 text-xs transition font-mono cursor-pointer ${
                                cfg.model === m
                                  ? "bg-brand-500 text-white font-medium shadow-sm"
                                  : "bg-white text-gray-700 hover:bg-brand-50 hover:text-brand-600 border border-gray-200"
                              }`}
                              title="点击选用此模型并自动折叠收起"
                            >
                              {m}
                            </button>
                          ))}
                          {filteredList.length === 0 && (
                            <span className="text-xs text-gray-400 py-1">未匹配到相关模型</span>
                          )}
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-gray-200/50 flex items-center justify-between text-[11px] text-gray-400">
                          <span>💡 点击任意模型即可自动填入并折叠收起</span>
                          <button
                            type="button"
                            onClick={() => setExpandedModels((prev) => ({ ...prev, [idx]: false }))}
                            className="text-brand-600 hover:underline font-medium cursor-pointer"
                          >
                            收起
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}
                {/* 一键测试与状态提示 */}
                <div className="mt-3 flex items-center justify-between border-t border-gray-200/60 pt-2.5">
                  <div className="flex-1 min-w-0 pr-2">
                    {testResults[idx] ? (
                      testResults[idx].status === "success" ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-green-100/80 px-2.5 py-1 text-xs text-green-700 font-medium">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          <span>连接可用 (响应耗时 {testResults[idx].latency_ms}ms)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-red-100/80 px-2.5 py-1 text-xs text-red-600 font-medium" title={testResults[idx].message}>
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                          <span className="line-clamp-1">{testResults[idx].message}</span>
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] text-gray-400">输入 API Key 后点击右侧按钮测试连通性</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 active:scale-95 disabled:opacity-40"
                    disabled={testingIdx === idx || !cfg.api_key.trim()}
                    onClick={async () => {
                      setTestingIdx(idx);
                      try {
                        const res = await authApi.testAIConfig({
                          api_key: cfg.api_key,
                          base_url: cfg.base_url,
                          model: cfg.model,
                        });
                        setTestResults((prev) => ({
                          ...prev,
                          [idx]: {
                            status: "success",
                            message: res.message || "连接成功",
                            latency_ms: res.data?.latency_ms,
                          },
                        }));
                      } catch (err: any) {
                        const msg = err.response?.data?.message || err.message || "测试连接失败";
                        setTestResults((prev) => ({
                          ...prev,
                          [idx]: {
                            status: "failed",
                            message: msg,
                          },
                        }));
                      } finally {
                        setTestingIdx(null);
                      }
                    }}
                  >
                    {testingIdx === idx ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    <span>一键测试</span>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 添加新配置按钮 */}
          <button
            className="w-full rounded-xl border-2 border-dashed border-brand-200 py-3 text-sm text-brand-500 hover:bg-brand-50"
            onClick={() => setAIConfigs((prev) => [...prev, { name: `配置 ${prev.length + 1}`, api_key: "", base_url: "", model: "", enabled: true }])}
          >
            <Plus className="mr-1 inline h-4 w-4" /> 添加 AI 配置
          </button>

          {/* 保存按钮 */}
          <button
            className="btn-primary w-full"
            disabled={aiSaving}
            onClick={async () => {
              setAISaving(true);
              setAISaved(false);
              try {
                const data = await authApi.updateAIConfig({ ai_configs: aiConfigs });
                setAIConfigs(data.ai_configs || []);
                setAISaved(true);
                setTimeout(() => setAISaved(false), 2000);
              } catch {
                /* ignore */
              } finally {
                setAISaving(false);
              }
            }}
          >
            {aiSaving ? "保存中…" : "保存 AI 配置"}
          </button>
          {aiSaved && (
            <p className="rounded-xl bg-green-50 p-2 text-center text-sm text-green-600">AI 配置已保存</p>
          )}
        </div>
      </section>

      {/* 管理员授权管理面板 */}
      {aiCanManage && authUsers.length > 0 && (
        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-gray-800">AI 授权管理</h2>
          </div>
          <p className="mb-3 text-xs text-gray-400">
            勾选允许使用 AI 的用户。被授权用户在未配置自己的 API Key 时，可共享管理员的 AI 配置。
          </p>
          <div className="space-y-2">
            {authUsers.map((au) => (
              <div key={au.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-700">{au.nickname || au.phone}</span>
                  {au.is_staff && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-600">管理员</span>}
                </div>
                <button
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    au.ai_authorized || au.is_staff
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                  disabled={au.is_staff}
                  onClick={async () => {
                    try {
                      await authApi.aiAuthToggle(au.id, !au.ai_authorized);
                      setAuthUsers((prev) => prev.map((u) => u.id === au.id ? { ...u, ai_authorized: !u.ai_authorized } : u));
                    } catch { /* ignore */ }
                  }}
                >
                  {au.is_staff ? "默认可用" : au.ai_authorized ? "已授权" : "未授权"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* v1.56：搜索引擎配置区块（原健康中心 BMI 页入口迁移至此） */}
      {aiCanManage && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-brand-500" />
              <h2 className="font-semibold text-gray-800">搜索引擎配置</h2>
            </div>
            <button
              type="button"
              className="btn-secondary gap-1.5 text-xs shadow-2xs"
              onClick={() => setSearxngModalOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" /> 配置面板
            </button>
          </div>
          <p className="text-xs leading-relaxed text-gray-400">
            管理私有 SearXNG 实例地址、权威健康白名单与 AI 助手公网兜底开关。AI 助手实时检索不可用时自动降级，不影响用户提问。
          </p>
          {searchCfg && (
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
                实例地址：<b className="text-gray-800 dark:text-gray-200">{searchCfg.base_url}</b>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
                连通状态：
                <b className={searchCfg.is_available ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                  {searchCfg.is_available ? "可达" : "不可达"}
                </b>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
                公网兜底：
                <b className={searchCfg.ai_fallback_enabled ? "text-blue-600 dark:text-blue-400" : "text-gray-500"}>
                  {searchCfg.ai_fallback_enabled ? "已开启" : "已关闭"}
                </b>
              </div>
            </div>
          )}
          <SearXNGConfigModal
            isOpen={searxngModalOpen}
            onClose={() => setSearxngModalOpen(false)}
            onSaved={() => {
              searxngConfigApi
                .get()
                .then(setSearchCfg)
                .catch(() => {});
            }}
          />
        </section>
      )}
    </div>
  );
}
