import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Bot, CheckCircle, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Play, Plus, Settings, Trash2 } from "lucide-react";
import { authApi } from "@/api/auth";
import type { AIConfigItem } from "@/api/auth";

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
                                        <label className="label">模型名称</label>
                    <input
                      className="input"
                      placeholder="gpt-4o-mini"
                      value={cfg.model}
                      onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, model: e.target.value } : c))}
                    />
                  </div>
                </div>
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
    </div>
  );
}
