import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Edit3, Plus, Trash2, Upload, X } from "lucide-react";
import { timelineApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import CsvImportResultModal from "@/components/CsvImportResultModal";
import FavoriteButton from "@/components/FavoriteButton";
import PermissionDeniedCard from "@/components/PermissionDeniedCard";
import LightPagination from "@/components/ui/LightPagination";
import TopProgressBar from "@/components/ui/TopProgressBar";
import { downloadBlob } from "@/utils/download";
import type { TimelineItem } from "@/types";

const STAGE_TABS = [
  { key: "", label: "全部" },
  { key: "pregnancy", label: "孕期" },
  { key: "baby", label: "0-1岁" },
  { key: "toddler", label: "1-3岁" },
  { key: "preschool", label: "3-6岁" },
];

const CATEGORIES = [
  { key: "", label: "全部" },
  { key: "food", label: "饮食" },
  { key: "clothing", label: "穿衣" },
  { key: "housing", label: "居家" },
  { key: "travel", label: "出行" },
  { key: "health", label: "健康" },
  { key: "shopping", label: "购物" },
  { key: "milestone", label: "里程碑" },
  { key: "emotion", label: "心理" },
  { key: "checkup", label: "产检" },
  { key: "education", label: "胎教" },
  { key: "exercise", label: "运动" },
];

const STAGE_TYPES = [
  { key: "pregnancy_week", label: "孕周" },
  { key: "baby_age_day", label: "宝宝天数" },
  { key: "baby_age_month", label: "宝宝月龄" },
  { key: "pregnancy_trimester", label: "孕早期/中期/晚期" },
];

const CATEGORY_OPTIONS = [
  { key: "food", label: "饮食" },
  { key: "clothing", label: "穿衣" },
  { key: "housing", label: "居家" },
  { key: "travel", label: "出行" },
  { key: "health", label: "健康" },
  { key: "shopping", label: "购物" },
  { key: "milestone", label: "里程碑" },
  { key: "emotion", label: "心理情绪" },
  { key: "exercise", label: "运动" },
  { key: "checkup", label: "产检" },
  { key: "education", label: "胎教" },
];

interface EditForm {
  id?: number;
  stage_type: string;
  stage_value: number;
  category: string;
  title: string;
  subtitle: string;
  content: string;
  tips: string;
  is_essential: boolean;
  sort_order: number;
}

const EMPTY_FORM: EditForm = {
  stage_type: "pregnancy_week",
  stage_value: 1,
  category: "health",
  title: "",
  subtitle: "",
  content: "",
  tips: "",
  is_essential: false,
  sort_order: 0,
};

const PAGE_SIZE_STORAGE_KEY = "mengya_timeline_page_size";
const TIMELINE_SIZE_OPTIONS = [
  { value: 12, label: "12 条/页" },
  { value: 24, label: "24 条/页" },
  { value: 48, label: "48 条/页" },
  { value: -1, label: "全部" },
];

export default function TimelinePage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [stage, setStage] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  /** v1.88.4 二次加载（筛选/翻页）：保留旧内容 + 顶部进度条，不整页闪白 */
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  /** v1.88.4 分页：默认 12 条/页（3列×0行），支持 12/24/48/全部，记忆用户选择 */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
      return TIMELINE_SIZE_OPTIONS.some((o) => o.value === saved) ? saved : 12;
    } catch {
      return 12;
    }
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [toast, setToast] = useState("");
  /** v1.88.5 页面访问被拒（菜单权限，code=4030）：显示无权限提示卡而非误导性空态 */
  const [permDenied, setPermDenied] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  /** v1.88.2 导入结果明细弹窗（v1.88.3 接口级错误也常驻弹窗） */
  const [importResult, setImportResult] = useState<{
    kind: "result" | "error";
    title?: string;
    created?: number;
    errors?: string[];
    message?: string;
  } | null>(null);

  // 编辑弹窗状态
  const [searchParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  /**
   * v1.88.4 服务端分页拉取：首次加载整页 loading，此后一切刷新保留旧内容 + 顶部进度条；
   * pageSize=-1 为后端约定的“全部”语义（不分页返回全量，响应结构一致）。
   */
  const fetchItems = useCallback(() => {
    if (hasLoadedRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    timelineApi
      .listPaged({
        stage: stage || undefined,
        category: category || undefined,
        page,
        page_size: pageSize,
      })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.total_pages);
        hasLoadedRef.current = true;
      })
      .catch((err: any) => {
        // v1.88.5 菜单权限被拒：展示整页提示卡，不再静默空态
        if (err?.code === 4030) {
          setPermDenied(err?.message || "管理员已关闭本页面访问，如有需要请联系管理员开启。"
          );
        }
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [stage, category, page, pageSize]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handlePageSizeChange = (s: number) => {
    setPageSizeState(s);
    try { localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(s)); } catch { /* ignore */ }
    setPage(1);
  };

  // 从详情页跳转过来时自动打开编辑弹窗
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && user?.is_staff) {
      timelineApi.detail(Number(editId)).then((item) => {
        openEdit(item);
      }).catch(() => {});
    }
  }, [searchParams]);

  const handleExport = async () => {
    try {
      // v1.88.1 导出接口改 POST + scope：快捷入口导出当前筛选结果全部（含管理员停用数据）
      const blob = await timelineApi.exportCsv({ scope: "filtered", with_inactive: 1 });
      downloadBlob(blob, "timeline_export.csv");
      showToast("导出成功");
    } catch { showToast("导出失败"); }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const res = await timelineApi.importCsv(file);
      // v1.88.2：有失败行时弹窗展示逐行原因（含真实文件行号），便于修正后重导
      const errs = res?.data?.errors || [];
      if (errs.length > 0) {
        setImportResult({ kind: "result", created: res?.data?.created ?? 0, errors: errs });
      } else {
        showToast(res?.message || `导入成功：${res?.data?.created ?? 0} 条`);
      }
      fetchItems();
    } catch (err) {
      // v1.88.3：接口级错误同样常驻弹窗，等待用户手动点击「知道了」关闭
      const msg = err instanceof Error ? err.message : "导入失败，请重试";
      setImportResult({ kind: "error", title: "导入失败", message: msg });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await timelineApi.importTemplate("cn");
      downloadBlob(blob, "timeline_import_template_cn.csv");
      showToast("模板已下载");
    } catch { showToast("下载失败"); }
  };

  const openCreate = () => {
    setEditForm(EMPTY_FORM);
    setEditing(true);
  };

  // Esc 关闭编辑弹窗
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing]);

  const openEdit = (item: TimelineItem) => {
    setEditForm({
      id: item.id,
      stage_type: item.stage_type,
      stage_value: item.stage_value,
      category: item.category,
      title: item.title,
      subtitle: item.subtitle || "",
      content: item.content,
      tips: item.tips || "",
      is_essential: item.is_essential,
      sort_order: 0,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editForm.title.trim()) { showToast("请输入标题"); return; }
    if (!editForm.content.trim()) { showToast("请输入内容"); return; }
    setSaving(true);
    try {
      const payload = {
        stage_type: editForm.stage_type,
        stage_value: editForm.stage_value,
        category: editForm.category,
        title: editForm.title,
        subtitle: editForm.subtitle,
        content: editForm.content,
        tips: editForm.tips,
        is_essential: editForm.is_essential,
        sort_order: editForm.sort_order,
      };
      if (editForm.id) {
        await timelineApi.update(editForm.id, payload);
        showToast("更新成功");
        // v1.88.4 乐观更新：编辑可能改变筛选归属字段，静默刷新当前页（保留旧内容不闪白）
        fetchItems();
      } else {
        await timelineApi.create(payload);
        showToast("创建成功");
        // 新条目排序位置不定：静默刷新当前页（保留旧内容）
        fetchItems();
      }
      setEditing(false);
    } catch {
      showToast("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: TimelineItem) => {
    if (!confirm(`确定删除「${item.title}」吗？此操作不可撤销。`)) return;
    try {
      await timelineApi.remove(item.id);
      showToast("删除成功");
      // v1.88.4 乐观更新：本地移除，不重拉全量
      const remaining = items.filter((i) => i.id !== item.id);
      const newTotal = Math.max(0, total - 1);
      if (remaining.length === 0 && page > 1) {
        // 当前页被删空：回退上一页拉取（保留旧内容中最后一屏前的进度条体验）
        setPage(page - 1);
        setTotal(newTotal);
        return;
      }
      setItems(remaining);
      setTotal(newTotal);
      if (pageSize > 0) {
        setTotalPages(Math.max(1, Math.ceil(newTotal / pageSize)));
      }
    } catch {
      showToast("删除失败");
    }
  };

  return (
    <div className="space-y-5">
      {/* v1.88.4 二次加载顶部细进度条（保留旧内容不闪白） */}
      {refreshing && <TopProgressBar />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">时间轴知识库</h1>
          <p className="mt-1 text-sm text-gray-400">按孕周/月龄精准推送的科学内容</p>
        </div>
        {user?.is_staff && (
          <button
            className="flex items-center gap-1 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" /> 新增事件
          </button>
        )}
      </div>

      {user?.is_staff && (
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-600 hover:bg-green-100"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" /> 导出
          </button>
          <button
            className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-100"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-3.5 w-3.5" /> {importing ? "导入中…" : "导入"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
          />
          <button
            className="flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            onClick={handleDownloadTemplate}
          >
            <Download className="h-3.5 w-3.5" /> 模板
          </button>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">阶段</label>
          <select className="input flex-1" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
            {STAGE_TABS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">分类</label>
          <select className="input flex-1" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* v1.88.5 菜单权限被拒：整页提示卡 */}
      {permDenied && <PermissionDeniedCard message={permDenied} />}

      {/* 卡片列表：首次整页 loading；此后筛选/翻页保留旧内容（顶部进度条提示） */}
      {!permDenied && (loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : (
        <div className="space-y-3">
          <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${refreshing ? "opacity-60" : ""}`}>
            {items.map((item) => (
            <div key={item.id} className="card relative hover:shadow-md transition">
              {/* v1.88.2 列表卡片直接提供收藏按钮，无需点进详情 */}
              <div className="absolute right-3 top-3 z-10">
                <FavoriteButton objectId={item.id} favoriteType="timeline" note={item.title} />
              </div>
              <Link to={`/timeline/${item.id}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="tag">{item.stage_label} {item.stage_value}</span>
                  <span className="tag">{item.category_label}</span>
                </div>
                <h3 className="font-medium text-gray-800">{item.title}</h3>
                {item.subtitle && <p className="mt-0.5 text-xs text-brand-400">{item.subtitle}</p>}
                <p className="mt-2 line-clamp-2 text-sm text-gray-500">{item.content}</p>
                {item.is_essential && (
                  <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">必读重点</span>
                )}
              </Link>
              {user?.is_staff && (
                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-2">
                  <button
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-blue-500 hover:bg-blue-50"
                    onClick={() => openEdit(item)}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> 编辑
                  </button>
                  <button
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    onClick={() => handleDelete(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                </div>
              )}
            </div>
          ))}
          {!loading && items.length === 0 && (
            <p className="col-span-full py-10 text-center text-gray-400">该阶段暂无内容</p>
          )}
          </div>
          {/* v1.88.4 分页条：页码 + 每页条数（12/24/48/全部，选择记忆在 localStorage） */}
          <LightPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            sizeOptions={TIMELINE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            unitLabel="条"
          />
        </div>
      ))}

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 dark:border dark:border-gray-800 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">{editForm.id ? "编辑事件" : "新增事件"}</h2>
              <button className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" onClick={() => setEditing(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">阶段类型</label>
                  <select
                    className="input"
                    value={editForm.stage_type}
                    onChange={(e) => setEditForm({ ...editForm, stage_type: e.target.value })}
                  >
                    {STAGE_TYPES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">阶段值</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.stage_value}
                    onChange={(e) => setEditForm({ ...editForm, stage_value: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">分类</label>
                  <select
                    className="input"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">排序权重</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.sort_order}
                    onChange={(e) => setEditForm({ ...editForm, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="label">标题</label>
                <input
                  className="input"
                  placeholder="如：孕10周：胎儿发育关键期"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div>
                <label className="label">副标题</label>
                <input
                  className="input"
                  placeholder="可选"
                  value={editForm.subtitle}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                />
              </div>

              <div>
                <label className="label">详细内容</label>
                <textarea
                  className="input min-h-[120px]"
                  placeholder="支持多行文本"
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                />
              </div>

              <div>
                <label className="label">小贴士</label>
                <textarea
                  className="input min-h-[60px]"
                  placeholder="可选"
                  value={editForm.tips}
                  onChange={(e) => setEditForm({ ...editForm, tips: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={editForm.is_essential}
                  onChange={(e) => setEditForm({ ...editForm, is_essential: e.target.checked })}
                />
                <span className="text-sm text-gray-600">标记为必读重点</span>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(false)}>取消</button>
              <button className="btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? "保存中…" : "保存"}
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
