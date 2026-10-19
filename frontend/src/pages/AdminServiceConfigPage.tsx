import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowDown, ArrowUp, Check, CheckCircle2, XCircle, CloudSun, Globe2,
  Loader2, Plus, RefreshCcw, Save, Settings2, Trash2, FlaskConical, Wind, CalendarDays, Search, X, Pencil
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { serviceConfigApi } from "@/api/services";
import type { ServiceConfigData, ServiceConfigGroup, ServiceConfigPayload, ServiceTestResult } from "@/types/serviceConfig";

/** 分组图标映射 */
const GROUP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  geocoding: Search,
  forecast: CloudSun,
  air_quality: Wind,
  holiday: CalendarDays,
  search_pipeline: Globe2,
};

/** v1.73 外部接口服务配置：天气 / 节假日 / AI 公网搜索引擎管线统一管理 */
export default function AdminServiceConfigPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ServiceConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [testingGroup, setTestingGroup] = useState<string | null>(null);
  const [testingRows, setTestingRows] = useState<Record<string, boolean>>({});
  // 轻提示（顶部居中，2.6s 自动消失）
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null);
  // 组级测试结果区
  const [groupResults, setGroupResults] = useState<Record<string, { summary: string; ok: boolean; rows: { ok: boolean; msg: string }[] }>>({});
  // 行级测试结果（key: `${group}:${rowIdx}`）
  const [rowResults, setRowResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  // 行级编辑模式（key: `${group}:${rowIdx}`，仅处于编辑模式的行可修改，其余默认只读）
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});

  const showToast = (msg: string, ok = true) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const load = () => {
    setLoading(true);
    serviceConfigApi
      .get()
      .then((d) => setData(d))
      .catch((e) => showToast(e.response?.data?.message || "加载配置失败", false))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  /** 收集一组当前表单状态 */
  const collectGroup = (gname: string) => {
    const group = data?.groups[gname];
    if (!group) return null;
    const card = document.querySelector(`[data-group="${gname}"]`);
    const payload: ServiceConfigPayload = { group: gname, retries: parseInt((card?.querySelector(".retries-input") as HTMLInputElement)?.value || "0") || 0 };
    if (group.type === "engines") {
      const engines = Array.from((card as HTMLElement)?.querySelectorAll(".engine-row") || []).map((row) => ({
        key: (row.querySelector(".engine-key") as HTMLElement)?.dataset?.key || "",
        url: ((row.querySelector(".engine-url") as HTMLInputElement)?.value || "").trim(),
        timeout: parseFloat((row.querySelector(".engine-timeout") as HTMLInputElement)?.value || "1") || 1,
        enabled: (row.querySelector(".row-enabled") as HTMLInputElement)?.checked ?? true,
      }));
      payload.engines = engines;
    } else {
      payload.timeout = parseInt((card?.querySelector(".timeout-input") as HTMLInputElement)?.value || "8") || 8;
      const endpoints = Array.from((card as HTMLElement)?.querySelectorAll(".endpoint-row") || []).map((row) => ({
        url: ((row.querySelector(".endpoint-url") as HTMLInputElement)?.value || "").trim(),
        enabled: (row.querySelector(".row-enabled") as HTMLInputElement)?.checked ?? true,
      }));
      payload.endpoints = endpoints;
    }
    return payload;
  };

  /** 保存全部配置（全局保存按钮） */
  const saveAll = async () => {
    if (!data) return;
    setSaving(true);
    try {
      for (const gname of Object.keys(data.groups)) {
        const payload = collectGroup(gname);
        if (!payload) continue;
        await serviceConfigApi.update(payload);
      }
      showToast("全部配置已保存并即时生效");
      load();
    } catch (e: any) {
      showToast(e.response?.data?.message || "保存失败", false);
    } finally {
      setSaving(false);
    }
  };

  /** 保存单组（新增行保存 / 参数修改时也可调用） */
  const saveGroup = async (gname: string) => {
    const payload = collectGroup(gname);
    if (!payload) return;
    setSaving(true);
    try {
      await serviceConfigApi.update(payload);
      showToast("配置已保存并即时生效");
      load();
    } catch (e: any) {
      showToast(e.response?.data?.message || "保存失败", false);
    } finally {
      setSaving(false);
    }
  };

  /** 恢复默认值 */
  const doRestore = async () => {
    setRestoreOpen(false);
    try {
      await serviceConfigApi.restore();
      showToast("已恢复全部默认值");
      load();
    } catch (e: any) {
      showToast(e.response?.data?.message || "恢复失败", false);
    }
  };

  /** 单行测试（行级一键测试） */
  const testRow = (gname: string, rowIdx: number) => {
    const group = data?.groups[gname];
    if (!group) return;
    const card = document.querySelector(`[data-group="${gname}"]`);
    const rows = Array.from((card as HTMLElement).querySelectorAll(group.type === "engines" ? ".engine-row" : ".endpoint-row"));
    const row = rows[rowIdx] as HTMLElement;
    const url = ((row.querySelector(group.type === "engines" ? ".engine-url" : ".endpoint-url") as HTMLInputElement)?.value || "").trim();
    if (!url) {
      setRowResults((prev) => ({ ...prev, [`${gname}:${rowIdx}`]: { ok: false, msg: "地址为空" } }));
      return;
    }
    setTestingRows((prev) => ({ ...prev, [`${gname}:${rowIdx}`]: true }));
    const payload = collectGroup(gname);
    if (!payload) return;
    if (group.type === "engines") {
      payload.engines = [{ key: (row.querySelector(".engine-key") as HTMLElement).dataset?.key || "", url, enabled: true, timeout: parseFloat((row.querySelector(".engine-timeout") as HTMLInputElement)?.value || "1") || 1 }];
    } else {
      payload.endpoints = [{ url, enabled: true }];
    }
    serviceConfigApi
      .test(payload)
      .then((res) => {
        const r = res.results?.[0];
        setRowResults((prev) => ({ ...prev, [`${gname}:${rowIdx}`]: { ok: !!r?.ok, msg: r?.message || "测试失败" } }));
      })
      .catch(() => setRowResults((prev) => ({ ...prev, [`${gname}:${rowIdx}`]: { ok: false, msg: "请求失败" } })))
      .finally(() => setTestingRows((prev) => ({ ...prev, [`${gname}:${rowIdx}`]: false })));
  };

  /** 整组测试（模拟故障转移顺序） */
  const testGroup = (gname: string) => {
    const payload = collectGroup(gname);
    if (!payload) return;
    setTestingGroup(gname);
    setGroupResults((prev) => ({ ...prev, [gname]: { summary: "正在按顺序测试启用项...", ok: true, rows: [] } }));
    serviceConfigApi
      .test(payload)
      .then((res) => {
        const rs: ServiceTestResult[] = res.results || [];
        if (!rs.length) {
          setGroupResults((prev) => ({ ...prev, [gname]: { summary: "没有启用的项可测试", ok: false, rows: [] } }));
          return;
        }
        const firstOk = rs.findIndex((r) => r.ok);
        const summary = firstOk === -1 ? "全部不可用（将触发重试/降级）" : `第 ${firstOk + 1} 个可用，将优先使用`;
        setGroupResults((prev) => ({
          ...prev,
          [gname]: {
            summary,
            ok: firstOk !== -1,
            rows: rs.map((r) => ({ ok: r.ok, msg: `${r.url} — ${r.ok ? "✓" : "✗"} ${r.message}（${r.latency_ms}ms）` })),
          },
        }));
      })
      .catch(() => setGroupResults((prev) => ({ ...prev, [gname]: { summary: "测试请求失败", ok: false, rows: [] } })))
      .finally(() => setTestingGroup(null));
  };

  /** 清除指定组全部行级编辑模式（行移动/删除后索引变化，自动退出编辑） */
  const clearEditingForGroup = (gname: string) => {
    setEditingRows((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${gname}:`)) next[k] = true;
      }
      return next;
    });
  };

  /** 进入行级编辑模式（同一组仅一行可编辑，其余保持只读） */
  const startEditRow = (gname: string, rowIdx: number) => {
    setEditingRows((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${gname}:`)) next[k] = true;
      }
      next[`${gname}:${rowIdx}`] = true;
      return next;
    });
  };

  /** 取消行级编辑：未保存的新增行直接移除，已保存行恢复服务端值 */
  const cancelEditRow = (gname: string, rowIdx: number) => {
    if (!data) return;
    const group = data.groups[gname];
    if (!group) return;
    const key = group.type === "engines" ? "engines" : "endpoints";
    const rows = (group[key] as any[]) || [];
    const row = rows[rowIdx];
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[`${gname}:${rowIdx}`];
      return next;
    });
    if (row?._new) {
      delRow(gname, rowIdx);
    } else {
      load(); // 恢复服务端已保存值
    }
  };

  /** 保存行级编辑（整组保存并即时生效，退出编辑模式） */
  const saveEditRow = async (gname: string, rowIdx: number) => {
    await saveGroup(gname);
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[`${gname}:${rowIdx}`];
      return next;
    });
  };

  /** 上下移动（本地顺序，保存后生效） */
  const moveRow = (gname: string, rowIdx: number, dir: -1 | 1) => {
    if (!data) return;
    clearEditingForGroup(gname);
    setData((prev) => {
      if (!prev) return prev;
      const group = prev.groups[gname];
      if (!group) return prev;
      const key = group.type === "engines" ? "engines" : "endpoints";
      const list = group[key] ? [...(group[key] as any[])] : [];
      const target = rowIdx + dir;
      if (rowIdx < 0 || target < 0 || target >= list.length) return prev;
      [list[rowIdx], list[target]] = [list[target], list[rowIdx]];
      return { ...prev, groups: { ...prev.groups, [gname]: { ...group, [key]: list } } };
    });
  };

  /** 删除一行（本地） */
  const delRow = (gname: string, rowIdx: number) => {
    if (!data) return;
    clearEditingForGroup(gname);
    setData((prev) => {
      if (!prev) return prev;
      const group = prev.groups[gname];
      if (!group) return prev;
      const key = group.type === "engines" ? "engines" : "endpoints";
      const list = group[key] ? [...(group[key] as any[])] : [];
      list.splice(rowIdx, 1);
      return { ...prev, groups: { ...prev.groups, [gname]: { ...group, [key]: list } } };
    });
  };

  /** 添加新行（新增行显示保存/取消按钮，保存后转为已保存行） */
  const addRow = (gname: string) => {
    if (!data) return;
    setData((prev) => {
      if (!prev) return prev;
      const group = prev.groups[gname];
      if (!group) return prev;
      if (group.type === "engines") {
        const engines = group.engines ? [...group.engines] : [];
        const firstKey = group.defaults?.[0]?.key || "bing";
        engines.push({ key: firstKey, url: "", timeout: 2.0, enabled: true, _new: true } as any);
        return { ...prev, groups: { ...prev.groups, [gname]: { ...group, engines } } };
      }
      const endpoints = group.endpoints ? [...group.endpoints] : [];
      endpoints.push({ url: "", enabled: true, _new: true } as any);
      return { ...prev, groups: { ...prev.groups, [gname]: { ...group, endpoints } } };
    });
  };

  /** 单行字段更新 */
  const updateRow = (gname: string, rowIdx: number, field: string, value: any) => {
    if (!data) return;
    setData((prev) => {
      if (!prev) return prev;
      const group = prev.groups[gname];
      if (!group) return prev;
      const key = group.type === "engines" ? "engines" : "endpoints";
      const list = group[key] ? [...(group[key] as any[])] : [];
      if (!list[rowIdx]) return prev;
      list[rowIdx] = { ...list[rowIdx], [field]: value };
      return { ...prev, groups: { ...prev.groups, [gname]: { ...group, [key]: list } } };
    });
  };

  /** 组级参数更新 */
  const updateParam = (gname: string, field: "timeout" | "retries", value: number) => {
    if (!data) return;
    setData((prev) => {
      if (!prev) return prev;
      const group = prev.groups[gname];
      if (!group) return prev;
      return { ...prev, groups: { ...prev.groups, [gname]: { ...group, [field]: value } } };
    });
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在加载...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md dark:bg-gray-800" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-brand-500" />
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">外部接口配置</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary gap-1.5 text-xs" onClick={() => setRestoreOpen(true)}>
            <RefreshCcw className="h-3.5 w-3.5" /> 恢复默认值
          </button>
          <button className="btn-primary gap-1.5 text-xs" onClick={saveAll} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存配置
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div className="card rounded-2xl bg-brand-50/60 px-4 py-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
        统一管理各模块<b>内置默认的外部服务地址</b>。每组支持<b>多个端点</b>（按顺序依次尝试，启用中的端点不可用时自动向后切换）、
        行内<b>启用开关</b>、<b>上移/下移</b>排序、<b>重试次数</b>与<b>请求超时</b>；每行可<b>一键测试</b>（未保存也可测）。
        行默认<b>只读</b>，点击<b>编辑</b>后方可修改地址；<b>新增行</b>的启用开关可直接勾选，已保存行需编辑后调整。输入框占位提示为出厂默认值，保存后即时生效。
        SearXNG 私有实例的地址在「AI 助手配置 → 搜索引擎配置」弹窗维护，AI 助手检索时优先于本管线。
      </div>

      {/* 分组卡片 */}
      {data &&
        Object.entries(data.groups).map(([gname, group]) => {
          const Icon = GROUP_ICONS[gname] || Globe2;
          const isEngines = group.type === "engines";
          const rows = isEngines ? (group.engines || []) : (group.endpoints || []);
          const gres = groupResults[gname];
          return (
            <section key={gname} className="card" data-group={gname}>
              {/* 组头 */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-brand-500" />
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">{group.label}</h2>
                  {gname === "search_pipeline" && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">公网兜底引擎</span>
                  )}
                  {gname === "holiday" && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">年份自动补全</span>
                  )}
                </div>
                <button className="btn-secondary gap-1 text-xs" onClick={() => testGroup(gname)} disabled={testingGroup === gname}>
                  {testingGroup === gname ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} 测试全部启用
                </button>
              </div>

              {/* 行列表 */}
              <div className="space-y-2">
                {rows.map((row: any, idx: number) => {
                  const isFirst = idx === 0;
                  const isLast = idx === rows.length - 1;
                  const isNew = !!row._new;
                  const tkey = `${gname}:${idx}`;
                  const testing = testingRows[tkey];
                  const rres = rowResults[tkey];
                  const isEditing = !!editingRows[`${gname}:${idx}`];
                  // 启用开关：新增行（_new）默认即可直接勾选；已保存行仅在编辑模式下可操作
                  const enabledLocked = !isEditing && !isNew;
                  return (
                    <div key={`${gname}-${idx}-${isEngines ? row.key : row.url}`} className={"flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/60 p-2 dark:border-gray-700 dark:bg-gray-800/40" + (isEngines ? " engine-row" : " endpoint-row")}>
                      {isEngines && (
                        <span className="engine-key w-20 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400" data-key={row.key}>
                          {group.engine_labels?.[row.key] || row.key}
                        </span>
                      )}
                      <input
                        type="text"
                        className={`input flex-1 min-w-48 text-xs ${isEngines ? "engine-url" : "endpoint-url"} ${!isEditing ? "bg-gray-100 text-gray-400 dark:bg-gray-700/60" : ""}`}
                        value={row.url || ""}
                        placeholder={isEngines ? (group.defaults?.find((d) => d.key === row.key)?.url || "如：https://...") : (group.defaults?.[0]?.url || "如：https://...")}
                        onChange={(e) => updateRow(gname, idx, "url", e.target.value)}
                        disabled={!isEditing}
                      />
                      {isEngines && (
                        <input
                          type="number"
                          className={"engine-timeout w-16 shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800" + (!isEditing ? " bg-gray-100 text-gray-400 dark:bg-gray-700/40" : "")}
                          value={row.timeout ?? 1}
                          min={0.3}
                          max={30}
                          step={0.1}
                          title="行级请求超时（秒）"
                          onChange={(e) => updateRow(gname, idx, "timeout", parseFloat(e.target.value) || 1)}
                          disabled={!isEditing}
                        />
                      )}
                      <label className={"flex items-center gap-1 text-xs " + (enabledLocked ? "text-gray-300 dark:text-gray-600" : "text-gray-500")} title={row.enabled ? "停用（不参与故障转移）" : "启用该端点"}>
                        <input type="checkbox" className="row-enabled h-3.5 w-3.5 accent-brand-500" checked={row.enabled} onChange={(e) => updateRow(gname, idx, "enabled", e.target.checked)} disabled={enabledLocked} />
                        启用
                      </label>
                      {!isEditing ? (
                        <>
                          <button type="button" className="btn-primary gap-1 p-1.5 text-xs" title="编辑该行" onClick={() => startEditRow(gname, idx)}>
                            <Pencil className="h-3.5 w-3.5" /> 编辑
                          </button>
                          <button type="button" className="btn-secondary gap-1 p-1.5 text-xs" title="测试该行" onClick={() => testRow(gname, idx)} disabled={testing}>
                            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} 测试
                          </button>
                          <button type="button" className={"btn-secondary gap-1 p-1.5 text-xs" + (isFirst ? " opacity-40 cursor-not-allowed" : "")} title={isFirst ? "已是第一条，无法上移" : "上移"} onClick={() => moveRow(gname, idx, -1)} disabled={isFirst}>
                            <ArrowUp className="h-3.5 w-3.5" /> 上移
                          </button>
                          <button type="button" className={"btn-secondary gap-1 p-1.5 text-xs" + (isLast ? " opacity-40 cursor-not-allowed" : "")} title={isLast ? "已是最后一条，无法下移" : "下移"} onClick={() => moveRow(gname, idx, 1)} disabled={isLast}>
                            <ArrowDown className="h-3.5 w-3.5" /> 下移
                          </button>
                          <button type="button" className="btn-secondary gap-1 p-1.5 text-xs text-red-500" title="删除" onClick={() => delRow(gname, idx)}>
                            <Trash2 className="h-3.5 w-3.5" /> 删除
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn-primary gap-1 p-1.5 text-xs" title="保存该行（整组即时生效）" onClick={() => saveEditRow(gname, idx)}>
                            <Check className="h-3.5 w-3.5" /> 保存
                          </button>
                          <button type="button" className="btn-secondary gap-1 p-1.5 text-xs text-gray-500" title="取消编辑（恢复已保存值）" onClick={() => cancelEditRow(gname, idx)}>
                            <X className="h-3.5 w-3.5" /> 取消
                          </button>
                          <button type="button" className="btn-secondary gap-1 p-1.5 text-xs" title="测试该行" onClick={() => testRow(gname, idx)} disabled={testing}>
                            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} 测试
                          </button>
                        </>
                      )}
                      {rres && (
                        <span className={"w-full text-[11px] " + (rres.ok ? "text-emerald-600" : "text-red-500")}>
                          {rres.ok ? "✓ " : "✗ "} {rres.msg}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button type="button" className="btn-secondary mt-2 gap-1 text-xs" onClick={() => addRow(gname)}>
                <Plus className="h-3.5 w-3.5" /> 添加{isEngines ? "引擎" : "端点"}
              </button>

              {/* 组级参数 */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700">
                {!isEngines && (
                  <label className="inline-flex items-center gap-1.5">
                    请求超时（秒）
                    <input
                      type="number"
                      className="timeout-input input w-20 py-1 text-xs"
                      value={group.timeout ?? 8}
                      min={1}
                      max={60}
                      onChange={(e) => updateParam(gname, "timeout", parseInt(e.target.value) || 8)}
                    />
                  </label>
                )}
                <label className="inline-flex items-center gap-1.5">
                  重试次数（轮）
                  <input
                    type="number"
                    className="retries-input input w-20 py-1 text-xs"
                    value={group.retries ?? 0}
                    min={0}
                    max={10}
                    onChange={(e) => updateParam(gname, "retries", parseInt(e.target.value) || 0)}
                  />
                </label>
                <span className="text-gray-400">{isEngines ? "各引擎超时在行内配置" : "全部端点失败后按重试次数整轮重试；每次请求超时按上值。"}</span>
                {gname === "holiday" && (
                  <span className="text-emerald-600">地址末尾的 {`{年份}`} 由系统自动补全（输入到 .../year/ 即可）。</span>
                )}
              </div>

              {/* 组级测试结果 */}
              {gres && (
                <div className="mt-2 rounded-lg bg-gray-50 p-2 text-[11px] dark:bg-gray-800/60">
                  <div className={"mb-1 font-medium " + (gres.ok ? "text-emerald-600" : "text-red-500")}>{gres.summary}</div>
                  {gres.rows.map((r, i) => (
                    <div key={i} className={r.ok ? "text-emerald-600" : "text-red-500"}>
                      {r.ok ? "✓" : "✗"} {r.msg}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

      {/* 恢复默认确认 */}
      <ConfirmDialog
        isOpen={restoreOpen}
        title="恢复默认配置"
        message="确定将全部外部接口配置恢复为内置默认值吗？表单将重置，需点击「保存配置」后生效。"
        confirmText="确定恢复"
        onConfirm={doRestore}
        onCancel={() => setRestoreOpen(false)}
      />

      {/* 轻提示 */}
      {toast && (
        <div className="fixed left-1/2 top-4 z-[100] -translate-x-1/2">
          <div className={"flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white shadow-lg " + (toast.ok ? "bg-emerald-500" : "bg-red-500")}>
            {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}