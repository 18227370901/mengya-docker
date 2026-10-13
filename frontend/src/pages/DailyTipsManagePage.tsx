import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Edit2,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  HelpCircle,
} from "lucide-react";
import {
  dailyTipsApi,
  type DailyTipItem,
  type DailyTipListResponse,
} from "@/api/dailyTips";
import PaginationBar from "@/components/ui/PaginationBar";

const STAGE_OPTIONS = [
  { value: "all", label: "全部阶段", color: "bg-gray-100 text-gray-700" },
  { value: "newborn", label: "新生儿期 (0-28天)", color: "bg-blue-100 text-blue-700" },
  { value: "infant", label: "婴儿期 (1-12个月)", color: "bg-emerald-100 text-emerald-700" },
  { value: "toddler", label: "幼儿期 (1-3岁)", color: "bg-amber-100 text-amber-700" },
  { value: "pregnancy", label: "孕期呵护", color: "bg-purple-100 text-purple-700" },
  { value: "general", label: "通用科普", color: "bg-rose-100 text-rose-700" },
];

export default function DailyTipsManagePage() {
  const navigate = useNavigate();

  const [tips, setTips] = useState<DailyTipItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, active_count: 0, builtin_count: 0 });

  const [stageFilter, setStageFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [displayCount, setDisplayCount] = useState(5);
  const [savingConfig, setSavingConfig] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DailyTipItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTag, setFormTag] = useState("");
  const [formStage, setFormStage] = useState("newborn");
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [forceReset, setForceReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res: DailyTipListResponse = await dailyTipsApi.getAdminTips({
        page,
        page_size: pageSize,
        stage_type: stageFilter === "all" ? undefined : stageFilter,
        is_active: activeFilter === "all" ? undefined : activeFilter === "true" ? "1" : "0",
        search: searchKeyword.trim() || undefined,
      });
      setTips(res.items);
      setTotalCount(res.total);
      setTotalPages(res.total_pages);
      setDisplayCount(res.display_count);
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || "加载关怀锦囊列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSelectedIds([]);
  }, [page, pageSize, stageFilter, activeFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSelectedIds([]);
    loadData();
  };

  const isAllCurrentSelected = useMemo(() => {
    if (tips.length === 0) return false;
    return tips.every((item) => selectedIds.includes(item.id));
  }, [tips, selectedIds]);

  const isSomeSelected = useMemo(() => {
    if (tips.length === 0) return false;
    const count = tips.filter((item) => selectedIds.includes(item.id)).length;
    return count > 0 && count < tips.length;
  }, [tips, selectedIds]);

  const handleSelectAllToggle = () => {
    if (isAllCurrentSelected) {
      const currentIds = new Set(tips.map((t) => t.id));
      setSelectedIds((prev) => prev.filter((id) => !currentIds.has(id)));
    } else {
      const currentIds = tips.map((t) => t.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const handleToggleSelectRow = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleActive = async (item: DailyTipItem) => {
    try {
      await dailyTipsApi.updateTip(item.id, { is_active: !item.is_active });
      showToast(`已${!item.is_active ? "启用" : "停用"}该贴士`);
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "操作失败");
    }
  };

  const handleBatchStatus = async (isActive: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await dailyTipsApi.batchStatus(selectedIds, isActive);
      showToast(`已成功${isActive ? "启用" : "停用"} ${res.count} 条贴士`);
      setSelectedIds([]);
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "批量修改失败");
    }
  };

  const handleTriggerBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setDeletingIds(selectedIds);
    setDeleteModalOpen(true);
  };

  const handleTriggerSingleDelete = (item: DailyTipItem) => {
    setDeletingIds([item.id]);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      if (deletingIds.length === 1) {
        await dailyTipsApi.deleteTip(deletingIds[0]);
        showToast("提示已删除");
      } else {
        const res = await dailyTipsApi.batchDelete(deletingIds);
        showToast(`已批量删除 ${res.count} 条提示`);
      }
      setSelectedIds((prev) => prev.filter((id) => !deletingIds.includes(id)));
      setDeleteModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "删除失败");
    }
  };

  const handleSaveDisplayCount = async () => {
    setSavingConfig(true);
    try {
      await dailyTipsApi.updateConfig(displayCount);
      showToast("前台展示条数设置已保存");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "保存配置失败");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormTitle("");
    setFormContent("");
    setFormTag("");
    setFormStage(stageFilter !== "all" ? stageFilter : "newborn");
    setFormOrder(0);
    setFormActive(true);
    setEditModalOpen(true);
  };

  const handleOpenEditModal = (item: DailyTipItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormTag(item.tag);
    setFormStage(item.stage_type);
    setFormOrder(item.sort_order);
    setFormActive(item.is_active);
    setEditModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      showToast("请填写标题和详细内容");
      return;
    }
    setSubmitting(true);
    try {
      if (editingItem) {
        await dailyTipsApi.updateTip(editingItem.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          tag: formTag.trim(),
          stage_type: formStage,
          sort_order: formOrder,
          is_active: formActive,
        });
        showToast("贴士更新成功");
      } else {
        await dailyTipsApi.createTip({
          title: formTitle.trim(),
          content: formContent.trim(),
          tag: formTag.trim(),
          stage_type: formStage,
          sort_order: formOrder,
          is_active: formActive,
        });
        showToast("新贴士已创建");
      }
      setEditModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetBuiltin = async () => {
    setResetting(true);
    try {
      const res = await dailyTipsApi.resetBuiltin(forceReset);
      showToast(`恢复内置完成：新增 ${res.created} 条，更新 ${res.updated} 条`);
      setResetModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "恢复内置失败");
    } finally {
      setResetting(false);
    }
  };

  const getStageBadge = (stage: string, label: string) => {
    const opt = STAGE_OPTIONS.find((o) => o.value === stage);
    const color = opt ? opt.color : "bg-gray-100 text-gray-700";
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
        {label || stage}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 顶部提示 Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 rounded-xl bg-gray-900/90 text-white px-4 py-2.5 text-sm shadow-xl backdrop-blur-md flex items-center gap-2 transition animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 顶部导航与操作 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer"
            title="返回个人中心"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                今日关怀小锦囊 · 专属贴士管理
              </h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              自定义首页关怀锦囊展示内容、分类阶段、显示条数及启用状态
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setForceReset(false);
              setResetModalOpen(true);
            }}
            className="btn-secondary gap-1.5 text-xs py-2"
            title="恢复或补齐官方预设的17条科普锦囊"
          >
            <RotateCcw className="h-4 w-4 text-brand-500" />
            <span>恢复内置提示</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="btn-primary gap-1.5 text-xs py-2"
          >
            <Plus className="h-4 w-4" />
            <span>新增专属贴士</span>
          </button>
        </div>
      </div>

      {/* 统计与全局设置面板 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card flex items-center justify-between p-4 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/20 dark:to-gray-800">
          <div>
            <div className="text-xs text-gray-500 font-medium">总提示数</div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-1">
              {stats.total}
            </div>
          </div>
          <Layers className="h-8 w-8 text-brand-400 opacity-60" />
        </div>

        <div className="card flex items-center justify-between p-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-gray-800">
          <div>
            <div className="text-xs text-gray-500 font-medium">前台已启用</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {stats.active_count}
            </div>
          </div>
          <CheckCircle2 className="h-8 w-8 text-emerald-400 opacity-60" />
        </div>

        <div className="card flex items-center justify-between p-4 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-gray-800">
          <div>
            <div className="text-xs text-gray-500 font-medium">系统内置</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {stats.builtin_count}
            </div>
          </div>
          <Sparkles className="h-8 w-8 text-purple-400 opacity-60" />
        </div>

        {/* 管理员设置前台展示几条信息 */}
        <div className="card p-4 flex flex-col justify-between border-brand-200 dark:border-brand-800/50 bg-amber-50/40 dark:bg-amber-950/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <span>首页轮播显示条数</span>
              <span title="控制前台每个阶段最多展示前几条启用的锦囊贴士" className="cursor-help">
                <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
              </span>
            </div>
            <span className="text-xs font-bold text-amber-600">{displayCount} 条</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={displayCount}
              onChange={(e) => setDisplayCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-center text-sm font-semibold outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSaveDisplayCount}
              disabled={savingConfig}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 px-3 py-1 text-xs font-semibold text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{savingConfig ? "保存中..." : "保存设置"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 搜索与阶段分类工具栏 */}
      <div className="card p-4 space-y-3">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索贴士标题、内容或标签关键字..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-9 pr-3 py-2 text-xs text-gray-700 outline-none transition focus:border-brand-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="all">全部状态</option>
              <option value="true">仅显示已启用</option>
              <option value="false">仅显示已停用</option>
            </select>

            <button
              type="submit"
              className="rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
            >
              查询
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchKeyword("");
                setStageFilter("all");
                setActiveFilter("all");
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 transition dark:border-gray-700 dark:hover:bg-gray-800"
              title="重置筛选"
            >
              重置
            </button>
          </div>
        </form>

        {/* 批量操作浮动工具条 */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 border border-brand-200 dark:bg-brand-950/40 dark:border-brand-800 dark:text-brand-200 animate-in fade-in">
            <div className="flex items-center gap-2 font-medium">
              <Check className="h-4 w-4 text-brand-600" />
              <span>已勾选 {selectedIds.length} 项贴士</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleBatchStatus(true)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-white font-medium transition cursor-pointer"
              >
                批量启用
              </button>
              <button
                type="button"
                onClick={() => handleBatchStatus(false)}
                className="rounded-lg bg-gray-600 hover:bg-gray-700 px-2.5 py-1 text-white font-medium transition cursor-pointer"
              >
                批量停用
              </button>
              <button
                type="button"
                onClick={handleTriggerBatchDelete}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-white font-medium transition cursor-pointer"
              >
                批量删除
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-gray-500 hover:text-gray-800 px-2 py-1 text-xs"
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
            <thead className="bg-gray-50/80 text-gray-500 uppercase border-b border-gray-100 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-400">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllCurrentSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={handleSelectAllToggle}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    title="全选 / 反选当前页"
                  />
                </th>
                <th className="p-3.5 w-16 text-center font-semibold">ID / 排序</th>
                <th className="p-3.5 w-28 font-semibold">适用阶段</th>
                <th className="p-3.5 w-52 font-semibold">标题与标签</th>
                <th className="p-3.5 font-semibold">贴士核心内容</th>
                <th className="p-3.5 w-24 text-center font-semibold">前台展示</th>
                <th className="p-3.5 w-28 text-center font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-brand-500" />
                    加载中...
                  </td>
                </tr>
              ) : tips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    暂无符合条件的关怀提示
                  </td>
                </tr>
              ) : (
                tips.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition ${
                        isSelected ? "bg-brand-50/30 dark:bg-brand-950/20" : ""
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>

                      <td className="p-3.5 text-center font-mono text-gray-500">
                        <span className="text-gray-400 text-[10px]">#{item.id}</span>
                        <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                          序 {item.sort_order}
                        </div>
                      </td>

                      <td className="p-3.5">
                        {getStageBadge(item.stage_type, item.stage_type_label)}
                        {item.is_builtin && (
                          <span className="block mt-1 text-[10px] text-gray-400">
                            内置预设
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
                          {item.title}
                        </div>
                        {item.tag && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-gray-400">
                            <Tag className="h-2.5 w-2.5" />
                            <span>{item.tag}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-3.5">
                        <p className="text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                          {item.content}
                        </p>
                      </td>

                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            item.is_active ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                          }`}
                          title={item.is_active ? "点击停用" : "点击启用"}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              item.is_active ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {item.is_active ? "已启用" : "已停用"}
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1 rounded-md text-brand-600 hover:bg-brand-50 transition dark:hover:bg-brand-950/30 cursor-pointer"
                            title="编辑"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerSingleDelete(item)}
                            className="p-1 rounded-md text-rose-500 hover:bg-rose-50 transition dark:hover:bg-rose-950/30 cursor-pointer"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页组件 */}
        <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30">
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
            unitLabel="条贴士"
          />
        </div>
      </div>

      {/* 新增 / 编辑 Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="card max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base">
                {editingItem ? "编辑关怀贴士" : "新增关怀贴士"}
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  贴士标题 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="例如：黑白追焦与抚触交流"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    适用阶段 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {STAGE_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    标签分类
                  </label>
                  <input
                    type="text"
                    value={formTag}
                    onChange={(e) => setFormTag(e.target.value)}
                    placeholder="如：新生儿 · 感知与大动作"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  关怀贴士详细内容 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="输入科学育儿、孕期指导或温馨贴士的具体说明..."
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white leading-relaxed resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    排序权重 (数字越小越靠前)
                  </label>
                  <input
                    type="number"
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="pt-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="formActive"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <label htmlFor="formActive" className="font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                    立即在首页启用展示
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "保存中..." : "保存贴士"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认 Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="card max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <Trash2 className="h-6 w-6" />
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base">
                确认删除
              </h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {deletingIds.length === 1
                ? "您确定要删除此条关怀贴士吗？删除后前台将不再展示该条内容。"
                : `您确定要批量删除已选择的 ${deletingIds.length} 条关怀贴士吗？此操作不可逆。`}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 恢复系统内置提示 Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="card max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-brand-600">
              <RotateCcw className="h-6 w-6" />
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base">
                恢复系统内置关怀贴士
              </h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              萌芽系统内置了 17 条覆盖新生儿、婴儿期、幼儿期、孕期与通用的科学育儿贴士。
            </p>

            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="forceReset"
                  checked={forceReset}
                  onChange={(e) => setForceReset(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="forceReset" className="font-medium cursor-pointer">
                  强制重置并覆盖已被修改的内置提示
                </label>
              </div>
              <p className="text-[11px] text-amber-600/90 dark:text-amber-300/80">
                未勾选时仅补全缺失的内置提示；勾选后将把所有内置条目的标题与内容重置回系统初始版本。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetBuiltin}
                className="rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-50 cursor-pointer"
              >
                {resetting ? "恢复中..." : "开始恢复"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
