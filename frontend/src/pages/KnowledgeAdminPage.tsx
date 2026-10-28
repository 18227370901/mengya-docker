/**
 * v1.88 知识库管理中心 —— 单页多 Tab 管理五大知识库模块
 * 孕期周历/时间轴、胎教故事、孕期食谱、幼儿百科、待产包预置库
 * 能力：新增/编辑/删除、单选/多选（跨页保持）/全选、服务端分页、批量操作、CSV 导入导出、一键恢复出厂
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  FileText,
  Globe,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { knowledgeAdminApi, type KbExportPayload, type KbExportScope } from "@/api/catalog";
import type { KnowledgeResetStats } from "@/types";
import PaginationBar from "@/components/ui/PaginationBar";
import CsvImportResultModal from "@/components/CsvImportResultModal";
import { downloadBlob } from "@/utils/download";
import { KB_MODULES, type KbFormField, type KbModuleConfig, type KbStatusSwitch } from "./knowledge/kbModules";

/** 批量操作文案映射 */
const BATCH_ACTION_META: Record<string, { label: string; cls: string }> = {
  delete: { label: "批量删除", cls: "bg-rose-600 hover:bg-rose-700" },
  active: { label: "批量启用", cls: "bg-emerald-600 hover:bg-emerald-700" },
  inactive: { label: "批量停用", cls: "bg-gray-600 hover:bg-gray-700" },
  essential: { label: "批量标记必读", cls: "bg-rose-500 hover:bg-rose-600" },
  unessential: { label: "批量取消必读", cls: "bg-gray-600 hover:bg-gray-700" },
};

export default function KnowledgeAdminPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();

  /** 按权限过滤可见模块 Tab */
  const visibleModules = useMemo(
    () => KB_MODULES.filter((m) => user?.is_staff || hasPermission(m.permMenu)),
    [user, hasPermission]
  );

  const [activeKey, setActiveKey] = useState(visibleModules[0]?.key ?? "");
  const activeModule = useMemo(
    () => KB_MODULES.find((m) => m.key === activeKey) as KbModuleConfig | undefined,
    [activeKey]
  );
  const canManage = !!activeModule && (!!user?.is_staff || hasPermission(activeModule.permManage));

  /* ===== 列表状态 ===== */
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  /** 跨页保持的选择集合 */
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [toast, setToast] = useState("");

  /* ===== 弹窗状态 ===== */
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStats, setResetStats] = useState<KnowledgeResetStats | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  /** v1.88.1 导出中标记与导出范围下拉开关 */
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  /** v1.88.1 模板下拉菜单与模板说明弹窗 */
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateHelpOpen, setTemplateHelpOpen] = useState(false);
  /** v1.88.2 导入结果明细弹窗（有失败行时展示逐行原因；v1.88.3 接口级错误也常驻弹窗） */
  const [importResult, setImportResult] = useState<{
    kind: "result" | "error";
    title?: string;
    created?: number;
    errors?: string[];
    message?: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const errMessage = (err: any, fallback: string) =>
    err?.response?.data?.message || err?.message || fallback;

  /* ===== 数据加载 ===== */
  const load = useCallback(async () => {
    if (!activeModule) return;
    setLoading(true);
    try {
      // v1.88.1 管理页带 with_inactive=1：管理员可见含已停用条目，并可按状态筛选
      const params: Record<string, any> = { page, page_size: pageSize, with_inactive: 1, ...filterValues };
      if (search.trim()) {
        // 待产包预置库后端搜索参数为 keyword，其余模块为 search
        params[activeModule.key === "baby_shopping" ? "keyword" : "search"] = search.trim();
      }
      const res = await activeModule.listApi(params);
      if (Array.isArray(res)) {
        setItems(res);
        setTotalCount(res.length);
        setTotalPages(1);
      } else {
        setItems(res.items || []);
        setTotalCount(res.total || 0);
        setTotalPages(res.total_pages || 1);
        setStats(res.stats || {});
      }
    } catch (err: any) {
      showToast(errMessage(err, "加载列表失败"));
    } finally {
      setLoading(false);
    }
  }, [activeModule, page, pageSize, search, filterValues]);

  useEffect(() => {
    load();
  }, [load]);

  /** 切换模块 Tab：重置分页 / 筛选 / 选择 */
  const switchModule = (key: string) => {
    setActiveKey(key);
    setPage(1);
    setFilterValues({});
    setSearch("");
    setSelectedIds([]);
    setStats({});
  };

  /* ===== 选择逻辑（单选 / 多选跨页保持 / 全选当前页含半选态） ===== */
  const isAllCurrentSelected = useMemo(
    () => items.length > 0 && items.every((it) => selectedIds.includes(it.id)),
    [items, selectedIds]
  );
  const isSomeSelected = useMemo(
    () => {
      const count = items.filter((it) => selectedIds.includes(it.id)).length;
      return count > 0 && count < items.length;
    },
    [items, selectedIds]
  );

  const handleSelectAllToggle = () => {
    if (isAllCurrentSelected) {
      const currentIds = new Set(items.map((it) => it.id));
      setSelectedIds((prev) => prev.filter((id) => !currentIds.has(id)));
    } else {
      const currentIds = items.map((it) => it.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const handleToggleRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /* ===== 单条状态开关（v1.88.1 支持多开关列：必读 + 启用等） ===== */
  const handleToggleStatus = async (item: any, sw: KbStatusSwitch) => {
    try {
      const next = item[sw.field] === sw.onValue ? sw.offValue : sw.onValue;
      await sw.toggleApi(item.id, next);
      showToast(next === sw.onValue ? `已${sw.labels[0]}该条目` : `已${sw.labels[1]}该条目`);
      load();
    } catch (err: any) {
      showToast(errMessage(err, "操作失败"));
    }
  };

  /* ===== 批量操作 ===== */
  const handleBatch = async (action: string) => {
    if (!activeModule || selectedIds.length === 0) return;
    if (action === "delete") {
      setDeletingIds(selectedIds);
      setDeleteOpen(true);
      return;
    }
    try {
      const res = await activeModule.batchApi(selectedIds, action as any);
      showToast(`操作成功：${res?.data?.count ?? selectedIds.length} 条`);
      setSelectedIds([]);
      load();
    } catch (err: any) {
      showToast(errMessage(err, "批量操作失败"));
    }
  };

  /* ===== 单条删除 ===== */
  const handleTriggerDelete = (item: any) => {
    setDeletingIds([item.id]);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!activeModule || deletingIds.length === 0) return;
    try {
      if (deletingIds.length === 1) {
        await activeModule.removeApi(deletingIds[0]);
        showToast("删除成功");
      } else {
        const res = await activeModule.batchApi(deletingIds, "delete");
        showToast(`已批量删除 ${res?.data?.count ?? deletingIds.length} 条`);
      }
      setSelectedIds((prev) => prev.filter((id) => !deletingIds.includes(id)));
      setDeleteOpen(false);
      load();
    } catch (err: any) {
      showToast(errMessage(err, "删除失败"));
    }
  };

  /* ===== 新增 / 编辑 ===== */
  const openCreate = () => {
    if (!activeModule) return;
    setEditingItem(null);
    setForm({ ...activeModule.defaultForm });
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    if (!activeModule) return;
    setEditingItem(item);
    setForm(activeModule.toForm(item));
    setFormOpen(true);
  };

  const handleSaveForm = async () => {
    if (!activeModule) return;
    // 必填校验
    const missing = activeModule.formFields.filter(
      (f) => f.required && !String(form[f.key] ?? "").trim()
    );
    if (missing.length > 0) {
      showToast(`请填写：${missing.map((f) => f.label).join("、")}`);
      return;
    }
    setSaving(true);
    try {
      // number 类型字段转数字
      const payload: Record<string, any> = {};
      for (const f of activeModule.formFields) {
        let v = form[f.key];
        if (f.type === "number") v = v === "" || v === null || v === undefined ? null : Number(v);
        if (f.type === "checkbox") v = !!v;
        payload[f.key] = v;
      }
      await activeModule.saveApi(editingItem?.id ?? null, payload);
      showToast(editingItem ? "保存成功" : "新增成功");
      setFormOpen(false);
      load();
    } catch (err: any) {
      showToast(errMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  /* ===== CSV 导入导出 ===== */
  /** v1.88.1 构造导出载荷：scope 三选 + 当前筛选条件（管理页含停用数据） */
  const buildExportPayload = (scope: KbExportScope): KbExportPayload => {
    const payload: KbExportPayload = {
      scope,
      with_inactive: 1,
      ...filterValues,
    };
    if (search.trim()) {
      payload[activeModule!.key === "baby_shopping" ? "keyword" : "search"] = search.trim();
    }
    if (scope === "page") {
      payload.page = page;
      payload.page_size = pageSize;
    }
    if (scope === "selected") {
      payload.ids = selectedIds;
    }
    return payload;
  };

  const handleExportCsv = async (scope: KbExportScope) => {
    if (!activeModule?.csv) return;
    if (scope === "selected" && selectedIds.length === 0) {
      showToast("请先勾选要导出的条目");
      return;
    }
    setExportOpen(false);
    setExporting(true);
    try {
      downloadBlob(await activeModule.csv.exportCsv(buildExportPayload(scope)), `${activeModule.key}_export.csv`);
      showToast(
        scope === "page" ? `已导出当前页（第${page}页）数据` : scope === "filtered" ? `已导出筛选结果全部数据` : `已导出选中的 ${selectedIds.length} 条数据`
      );
    } catch (err: any) {
      showToast(errMessage(err, "导出失败"));
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async (lang: "cn" | "en") => {
    if (!activeModule?.csv) return;
    setTemplateOpen(false);
    try {
      downloadBlob(await activeModule.csv.importTemplate(lang), `${activeModule.key}_import_template_${lang}.csv`);
      showToast(lang === "cn" ? "中文模板已下载" : "英文模板已下载");
    } catch {
      showToast("下载失败");
    }
  };

  const handleImportCsv = async (file: File) => {
    if (!activeModule?.csv) return;
    setImporting(true);
    try {
      const res = await activeModule.csv.importCsv(file);
      // v1.88.2：有失败行时弹窗展示逐行原因（含真实文件行号），便于修正后重导
      const errs = res?.data?.errors || [];
      if (errs.length > 0) {
        setImportResult({ kind: "result", created: res?.data?.created ?? 0, errors: errs });
      } else {
        showToast(res?.message || `导入成功：${res?.data?.created ?? 0} 条`);
      }
      setPage(1);
      load();
    } catch (err: any) {
      // v1.88.3：接口级错误（网络/权限/服务器）同样常驻弹窗，等待用户手动点击「知道了」关闭
      setImportResult({ kind: "error", title: "导入失败", message: errMessage(err, "导入失败，请重试") });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  /* ===== 一键恢复出厂 ===== */
  const openReset = async () => {
    if (!activeModule) return;
    setResetOpen(true);
    setResetStats(null);
    try {
      const list = await knowledgeAdminApi.stats(activeModule.key);
      setResetStats(list?.[0] ?? null);
    } catch {
      setResetStats(null);
    }
  };

  const handleConfirmReset = async () => {
    if (!activeModule) return;
    setResetting(true);
    try {
      const res = await activeModule.resetApi();
      showToast(res?.message || "已恢复出厂");
      setResetOpen(false);
      setSelectedIds([]);
      setPage(1);
      load();
    } catch (err: any) {
      showToast(errMessage(err, "恢复出厂失败"));
    } finally {
      setResetting(false);
    }
  };

  /* ===== 表单分组渲染 ===== */
  const groupedFields = useMemo(() => {
    if (!activeModule) return [] as { group: string; fields: KbFormField[] }[];
    const groups: { group: string; fields: KbFormField[] }[] = [];
    for (const f of activeModule.formFields) {
      const g = f.group || "基本信息";
      const last = groups[groups.length - 1];
      if (last && last.group === g) last.fields.push(f);
      else groups.push({ group: g, fields: [f] });
    }
    return groups;
  }, [activeModule]);

  if (visibleModules.length === 0) {
    return (
      <div className="card mx-auto mt-10 max-w-xl py-12 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-gray-200" />
        <p className="mt-3 text-sm text-gray-400">您暂无知识库管理权限，请联系管理员授权</p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/profile")}>
          返回个人中心
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* 顶部 Toast（v1.88.3 右上角改为水平居中显示） */}
      {toast && (
        <div className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-gray-900/90 px-4 py-2.5 text-sm text-white shadow-xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* 顶部导航 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="rounded-xl border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title="返回个人中心"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-500" />
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">知识库管理中心</h1>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              孕期周历 · 胎教故事 · 孕期食谱 · 幼儿百科 · 待产包预置库 的题库维护与恢复出厂
            </p>
          </div>
        </div>
        {canManage && activeModule && (
          <div className="flex flex-wrap items-center gap-2">
            {activeModule.csv && (
              <>
                {/* v1.88.1 导出范围下拉三选：当前页 / 筛选结果 / 仅选中项 */}
                <div className="relative z-20">
                  <button
                    type="button"
                    onClick={() => { setExportOpen((v) => !v); setTemplateOpen(false); }}
                    disabled={exporting}
                    className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-600 transition hover:bg-green-100 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" /> {exporting ? "导出中…" : "导出 CSV"}
                    <span className="text-[9px] opacity-60">▾</span>
                  </button>
                  {exportOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                      <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <button type="button" onClick={() => handleExportCsv("page")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-green-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          当前页（第{page}页）
                        </button>
                        <button type="button" onClick={() => handleExportCsv("filtered")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-green-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          筛选结果全部（{totalCount} 条）
                        </button>
                        <button type="button" onClick={() => handleExportCsv("selected")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-green-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          仅选中项（{selectedIds.length} 条）
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 transition hover:bg-blue-100 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" /> {importing ? "导入中…" : "导入 CSV"}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportCsv(f);
                  }}
                />
                {/* v1.88.1 模板下拉：中文 / 英文 / 说明弹窗 */}
                <div className="relative z-20">
                  <button
                    type="button"
                    onClick={() => { setTemplateOpen((v) => !v); setExportOpen(false); }}
                    className="flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-100"
                  >
                    <FileText className="h-3.5 w-3.5" /> 模板
                    <span className="text-[9px] opacity-60">▾</span>
                  </button>
                  {templateOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setTemplateOpen(false)} />
                      <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <button type="button" onClick={() => handleDownloadTemplate("cn")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          <Globe className="mr-1.5 inline h-3 w-3" />中文模板
                        </button>
                        <button type="button" onClick={() => handleDownloadTemplate("en")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          <Globe className="mr-1.5 inline h-3 w-3" />英文模板 (EN)
                        </button>
                        <button type="button" onClick={() => { setTemplateOpen(false); setTemplateHelpOpen(true); }} className="block w-full px-3 py-2 text-left text-brand-600 transition hover:bg-brand-50">
                          <Info className="mr-1.5 inline h-3 w-3" />模板填写说明
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={openReset}
              className="flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
              title="清空该模块全部数据并恢复为系统初始内置数据"
            >
              <RotateCcw className="h-4 w-4" /> 恢复出厂
            </button>
            <button type="button" onClick={openCreate} className="btn-primary gap-1.5 py-2 text-xs">
              <Plus className="h-4 w-4" /> 新增
            </button>
          </div>
        )}
      </div>

      {/* 模块 Tab */}
      <div className="flex flex-wrap gap-2">
        {visibleModules.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => switchModule(m.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition ${
              m.key === activeKey
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-white text-gray-600 hover:bg-brand-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            <m.icon className="h-4 w-4" />
            <span>{m.title}</span>
          </button>
        ))}
      </div>

      {activeModule && (
        <>
          {/* 模块描述与统计卡 */}
          <p className="text-xs text-gray-500 dark:text-gray-400">{activeModule.desc}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {activeModule.statsCards.map((c) => (
              <div key={c.key} className="card flex items-center justify-between p-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{c.label}</div>
                  <div className={`mt-1 text-2xl font-bold ${c.color}`}>
                    {c.key === "total" ? totalCount : (stats?.[c.key] ?? "—")}
                  </div>
                </div>
                <activeModule.icon className="h-8 w-8 text-gray-200 opacity-70" />
              </div>
            ))}
          </div>

          {/* 搜索与筛选工具栏 */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPage(1);
                      load();
                    }
                  }}
                  placeholder={activeModule.searchPlaceholder}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-xs text-gray-700 outline-none transition focus:border-brand-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>
              {activeModule.filters.map((f) => (
                <select
                  key={f.key}
                  value={filterValues[f.key] ?? ""}
                  onChange={(e) => {
                    setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }));
                    setPage(1);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  load();
                }}
                className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
              >
                查询
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilterValues({});
                  setPage(1);
                }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                重置
              </button>
            </div>

            {/* 批量操作浮动条 */}
            {selectedIds.length > 0 && canManage && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2.5 text-xs text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200">
                <div className="flex items-center gap-2 font-medium">
                  <Check className="h-4 w-4 text-brand-600" />
                  <span>已勾选 {selectedIds.length} 项（跨页保持）</span>
                </div>
                <div className="flex items-center gap-2">
                  {activeModule.batchActions.map((act) => {
                    const meta = BATCH_ACTION_META[act];
                    return (
                      <button
                        key={act}
                        type="button"
                        onClick={() => handleBatch(act)}
                        className={`rounded-lg px-2.5 py-1 font-medium text-white transition ${meta.cls}`}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="px-2 py-1 text-xs text-gray-500 transition hover:text-gray-800"
                  >
                    取消勾选
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 数据表格 */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50/80 uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                  <tr>
                    <th className="w-10 p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isAllCurrentSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isSomeSelected;
                        }}
                        onChange={handleSelectAllToggle}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        title="全选 / 反选当前页"
                      />
                    </th>
                    {activeModule.columns.map((col) => (
                      <th key={col.label} className={`p-3.5 font-semibold ${col.className ?? ""}`}>
                        {col.label}
                      </th>
                    ))}
                    {activeModule.statusSwitches.map((sw) => (
                      <th key={sw.field} className="w-24 p-3.5 text-center font-semibold">{sw.header}</th>
                    ))}
                    {canManage && <th className="w-28 p-3.5 text-center font-semibold">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-400">
                        <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-brand-500" />
                        加载中...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-400">
                        暂无符合条件的{activeModule.unitLabel.replace(/^[一-龥]/, "")}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const isSelected = selectedIds.includes(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`transition hover:bg-gray-50/60 dark:hover:bg-gray-800/40 ${
                            isSelected ? "bg-brand-50/30 dark:bg-brand-950/20" : ""
                          }`}
                        >
                          <td className="p-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRow(item.id)}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          {activeModule.columns.map((col) => (
                            <td key={col.label} className={`p-3.5 ${col.className ?? ""}`}>
                              {col.render ? col.render(item) : (item as any)[col.key!]}
                            </td>
                          ))}
                          {activeModule.statusSwitches.map((sw) => {
                            const on = item[sw.field] === sw.onValue;
                            return (
                              <td key={sw.field} className="p-3.5">
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() => handleToggleStatus(item, sw)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                                    on ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                                  } ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                                  title={on ? `点击${sw.labels[1]}` : `点击${sw.labels[0]}`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${
                                      on ? "translate-x-4" : "translate-x-0"
                                    }`}
                                  />
                                </button>
                                <div className="mt-0.5 text-[10px] text-gray-400">{on ? sw.labels[0] : sw.labels[1]}</div>
                              </td>
                            );
                          })}
                          {canManage && (
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEdit(item)}
                                  className="cursor-pointer rounded-md p-1 text-brand-600 transition hover:bg-brand-50 dark:hover:bg-brand-950/30"
                                  title="编辑"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTriggerDelete(item)}
                                  className="cursor-pointer rounded-md p-1 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                  title="删除"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <div className="bg-gray-50/50 p-3 dark:bg-gray-800/30">
              <PaginationBar
                page={page}
                totalPages={totalPages}
                total={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                unitLabel={activeModule.unitLabel}
              />
            </div>
          </div>
        </>
      )}

      {/* 新增 / 编辑 Modal */}
      {formOpen && activeModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
                {activeModule.formTitle(!!editingItem)}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="cursor-pointer text-gray-400 transition hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveForm();
              }}
              className="space-y-4"
            >
              {groupedFields.map((g) => (
                <div key={g.group} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                  <p className="mb-2.5 text-xs font-semibold text-brand-600">{g.group}</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {g.fields.map((f) => (
                      <div
                        key={f.key}
                        className={f.type === "textarea" ? "md:col-span-2" : undefined}
                      >
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          {f.label}
                          {f.required && <span className="ml-0.5 text-rose-500">*</span>}
                        </label>
                        {f.type === "textarea" ? (
                          <textarea
                            rows={f.rows ?? 3}
                            required={f.required}
                            value={form[f.key] ?? ""}
                            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        ) : f.type === "select" ? (
                          <select
                            required={f.required}
                            value={form[f.key] ?? ""}
                            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          >
                            {f.options?.map((o) => (
                              <option key={String(o.value)} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : f.type === "checkbox" ? (
                          <label className="flex cursor-pointer items-center gap-2 pt-1.5">
                            <input
                              type="checkbox"
                              checked={!!form[f.key]}
                              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-300">{f.placeholder || "启用"}</span>
                          </label>
                        ) : (
                          <input
                            type={f.type === "number" ? "number" : "text"}
                            required={f.required}
                            value={form[f.key] ?? ""}
                            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="cursor-pointer rounded-xl bg-brand-500 px-5 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认 Modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center gap-3 text-rose-600">
              <Trash2 className="h-6 w-6" />
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">确认删除</h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              {deletingIds.length === 1
                ? "确定要删除此条数据吗？删除后前台将不再展示该内容，操作不可逆。"
                : `确定要批量删除已选择的 ${deletingIds.length} 条数据吗？此操作不可逆。`}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v1.88.1 模板填写说明 Modal */}
      {templateHelpOpen && activeModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-800 dark:text-gray-100">
                <Info className="h-5 w-5 text-brand-500" />
                CSV 导入模板填写说明 —— {activeModule.title}
              </h3>
              <button
                type="button"
                onClick={() => setTemplateHelpOpen(false)}
                className="cursor-pointer text-gray-400 transition hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              <p className="font-semibold text-gray-800 dark:text-gray-100">模板结构（三段式）：</p>
              <ul className="list-inside list-disc space-y-1 pl-1">
                <li><b>第 1 行：表头行</b> —— 字段名，中文/英文模板各一套表头，导入时均自动识别；</li>
                <li><b>第 2 行：说明行</b> —— 以 <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">#</code> 开头，逐列说明必填性、字段含义与可选值，导入时自动跳过；</li>
                <li><b>第 3 行：示例行</b> —— 一条完整示例数据，可直接仿照填写。</li>
              </ul>
              <p className="font-semibold text-gray-800 dark:text-gray-100">填写规则：</p>
              <ul className="list-inside list-disc space-y-1 pl-1">
                <li>必填字段为空时该行报错跳过，其余行正常导入；</li>
                <li>是/否类字段填「是 / 否」（英文模板 Yes / No）；</li>
                <li>多行文本（详细内容、做法步骤等）请使用换行，Excel 中按 <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">Alt+Enter</code>；</li>
                <li>文件为 UTF-8 编码（含 BOM），Excel / WPS 直接打开不乱码；</li>
                <li>导入为<b>新增</b>语义，不会覆盖或修改已有条目。</li>
              </ul>
              <p className="rounded-xl bg-brand-50 p-3 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                建议先下载中文模板，对照说明行填写少量数据试导入，确认无误后再批量导入。
              </p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button
                type="button"
                onClick={() => { setTemplateHelpOpen(false); handleDownloadTemplate("cn"); }}
                className="cursor-pointer rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
              >
                下载中文模板
              </button>
              <button
                type="button"
                onClick={() => setTemplateHelpOpen(false)}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一键恢复出厂 Modal */}
      {resetOpen && activeModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center gap-3 text-amber-600">
              <RotateCcw className="h-6 w-6" />
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
                恢复出厂 —— {activeModule.title}
              </h3>
            </div>

            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <p className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>高危操作，请仔细阅读：</span>
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>该模块<b>全部数据将被清空</b>，包括管理员后期新增、修改过的条目；</li>
                <li>随后按系统初始化内置数据<b>原样重灌</b>，恢复到最初状态；</li>
                <li>用户已收藏的相关内容将失效（保留收藏记录，前台会提示用户自行处理）；</li>
                <li>操作不可逆，建议先导出 CSV 备份当前数据。</li>
              </ul>
            </div>

            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <div className="flex items-center justify-between">
                <span>当前库数据</span>
                <span className="font-semibold text-rose-600">{resetStats ? `${resetStats.current} 条` : "加载中…"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>恢复后内置数据</span>
                <span className="font-semibold text-emerald-600">{resetStats ? `${resetStats.builtin} 条` : "—"}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleConfirmReset}
                className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {resetting ? "恢复中..." : "确认恢复出厂"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* v1.88.2 导入结果明细弹窗（v1.88.3 支持接口错误常驻模式） */}
      {importResult && (
        <CsvImportResultModal
          open={!!importResult}
          kind={importResult.kind}
          title={importResult.title}
          created={importResult.created}
          errors={importResult.errors}
          message={importResult.message}
          onClose={() => setImportResult(null)}
        />
      )}
    </div>
  );
}
