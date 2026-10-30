import React, { useEffect, useState, useMemo } from "react";
import {
  Share2,
  Plus,
  ExternalLink,
  Edit,
  Trash2,
  Layers,
  Search,
  ShieldCheck,
  ShieldAlert,
  Globe,
  Settings,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Square,
  MinusSquare,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { platformApi } from "@/api/platform";
import { ThirdPartyPlatform } from "@/types/platform";
import { useAuthStore } from "@/store/authStore";
import PermissionDeniedCard from "@/components/PermissionDeniedCard";
import { PlatformEditModal } from "@/components/platform/PlatformEditModal";
import { ResourceManageModal } from "@/components/platform/ResourceManageModal";
import LightPagination, { PageSizeOption } from "@/components/ui/LightPagination";

const PAGE_SIZE_OPTIONS: PageSizeOption[] = [
  { value: 5, label: "5 条/页" },
  { value: 10, label: "10 条/页" },
  { value: 20, label: "20 条/页" },
  { value: -1, label: "全部" },
];

const STORAGE_KEY = "mengya_platform_manage_page_size";

export type SortField =
  | "sort_order_asc"
  | "sort_order_desc"
  | "created_at_desc"
  | "created_at_asc"
  | "name_asc"
  | "name_desc"
  | "resources_desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "sort_order_asc", label: "权重升序 (默认)" },
  { value: "sort_order_desc", label: "权重降序 (大到小)" },
  { value: "created_at_desc", label: "创建时间 (最新优先)" },
  { value: "created_at_asc", label: "创建时间 (最早优先)" },
  { value: "name_asc", label: "名称升序 (A-Z)" },
  { value: "name_desc", label: "名称降序 (Z-A)" },
  { value: "resources_desc", label: "子资源数量最多" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "全部分类" },
  { value: "parenting", label: "育儿早教" },
  { value: "health", label: "母婴健康" },
  { value: "learning", label: "启蒙学习" },
  { value: "tools", label: "实用工具" },
  { value: "entertainment", label: "影音娱乐" },
  { value: "other", label: "其他资源" },
];

const AGE_GROUP_OPTIONS = [
  { value: "", label: "全部年龄段" },
  { value: "prenatal", label: "孕产阶段" },
  { value: "infant", label: "0-1岁婴儿" },
  { value: "toddler", label: "1-3岁幼儿" },
  { value: "preschool", label: "3-6岁学前" },
  { value: "school_age", label: "6岁以上学龄" },
];

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "enabled", label: "仅已启用" },
  { value: "disabled", label: "仅已停用" },
];

const VISIBILITY_OPTIONS = [
  { value: "", label: "全部可见范围" },
  { value: "all", label: "全员普通用户" },
  { value: "restricted", label: "指定白名单" },
];


function TablePlatformLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className="h-8 w-8 rounded-lg object-contain border border-gray-100 bg-gray-50 p-0.5"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 font-bold border border-purple-100">
      {name ? name.slice(0, 1) : "?"}
    </div>
  );
}

export default function PlatformManagePage() {
  const { user, hasPermission } = useAuthStore();
  const [platforms, setPlatforms] = useState<ThirdPartyPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [keyword, setKeyword] = useState("");

  // 常规快速筛选与排序状态
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [ageGroupFilter, setAgeGroupFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("sort_order_asc");

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? parseInt(saved, 10) : 10;
      return [5, 10, 20, -1].includes(parsed) ? parsed : 10;
    } catch {
      return 10;
    }
  });

  // 单选/多选/全选状态
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchOperating, setBatchOperating] = useState(false);

  // 弹窗状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<ThirdPartyPlatform | null>(null);
  const [resourceModalPlatform, setResourceModalPlatform] = useState<ThirdPartyPlatform | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const canAccess = user?.is_staff || hasPermission("menu_admin_platforms");
  const canEdit = !!user?.is_staff;

  const loadPlatforms = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await platformApi.getPlatforms({ keyword: keyword || undefined });
      const list = res.data.data || [];
      setPlatforms(list);
      setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
      setPage(1);
    } catch (err: any) {
      setErrorMsg(err.message || "加载平台列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) {
      loadPlatforms();
    }
  }, [canAccess]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    try {
      localStorage.setItem(STORAGE_KEY, String(size));
    } catch {}
  };

  // 常规快速筛选与多维排序联动计算
  const filteredPlatforms = useMemo(() => {
    let list = platforms;

    if (statusFilter === "enabled") {
      list = list.filter((p) => p.is_enabled);
    } else if (statusFilter === "disabled") {
      list = list.filter((p) => !p.is_enabled);
    }

    if (categoryFilter) {
      list = list.filter((p) => p.category === categoryFilter);
    }

    if (ageGroupFilter) {
      list = list.filter((p) => p.age_group === ageGroupFilter || p.age_group === "all");
    }

    if (visibilityFilter) {
      list = list.filter((p) => p.visibility_type === visibilityFilter);
    }

    const kw = keyword.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(kw) ||
          (p.description || "").toLowerCase().includes(kw) ||
          (p.url || "").toLowerCase().includes(kw)
      );
    }

    return [...list].sort((a, b) => {
      switch (sortField) {
        case "sort_order_asc":
          return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
        case "sort_order_desc":
          return (b.sort_order ?? 0) - (a.sort_order ?? 0) || b.id - a.id;
        case "created_at_desc":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "created_at_asc":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case "name_asc":
          return (a.name || "").localeCompare(b.name || "", "zh-CN");
        case "name_desc":
          return (b.name || "").localeCompare(a.name || "", "zh-CN");
        case "resources_desc":
          return (b.resources?.length || 0) - (a.resources?.length || 0) || a.id - b.id;
        default:
          return 0;
      }
    });
  }, [platforms, keyword, statusFilter, categoryFilter, ageGroupFilter, visibilityFilter, sortField]);

  const hasActiveFilters = Boolean(
    statusFilter || categoryFilter || ageGroupFilter || visibilityFilter || keyword.trim() || sortField !== "sort_order_asc"
  );

  const handleResetFilters = () => {
    setStatusFilter("");
    setCategoryFilter("");
    setAgeGroupFilter("");
    setVisibilityFilter("");
    setKeyword("");
    setSortField("sort_order_asc");
    setPage(1);
  };

  // 计算当前分页数据
  const total = filteredPlatforms.length;
  const isAll = pageSize === -1;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedPlatforms = useMemo(() => {
    if (isAll) return filteredPlatforms;
    const start = (currentPage - 1) * pageSize;
    return filteredPlatforms.slice(start, start + pageSize);
  }, [filteredPlatforms, currentPage, pageSize, isAll]);

  // 全选/反选计算
  const pagedIds = useMemo(() => pagedPlatforms.map((p) => p.id), [pagedPlatforms]);
  const isCurrentPageAllSelected = pagedIds.length > 0 && pagedIds.every((id) => selectedIds.includes(id));
  const isCurrentPagePartiallySelected =
    pagedIds.some((id) => selectedIds.includes(id)) && !isCurrentPageAllSelected;

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectCurrentPage = () => {
    if (isCurrentPageAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pagedIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pagedIds])));
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(filteredPlatforms.map((p) => p.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  // 批量操作
  const handleBatchAction = async (action: "enable" | "disable" | "delete") => {
    if (!canEdit || selectedIds.length === 0) return;
    const actionLabel = action === "enable" ? "批量启用" : action === "disable" ? "批量停用" : "批量删除";
    if (action === "delete") {
      if (!window.confirm(`确定要彻底删除选中的 ${selectedIds.length} 个第三方平台吗？
删除后其关联的全部子资源也将同步下线！`)) {
        return;
      }
    }
    try {
      setBatchOperating(true);
      const res = await platformApi.batchAction(action, selectedIds);
      alert(res.data.message || `${actionLabel}成功`);
      clearSelection();
      loadPlatforms();
    } catch (err: any) {
      alert(err.message || `${actionLabel}失败`);
    } finally {
      setBatchOperating(false);
    }
  };

  // 快捷开关切换单个状态
  const handleToggleEnable = async (p: ThirdPartyPlatform) => {
    if (!canEdit) return;
    const nextStatus = !p.is_enabled;
    setPlatforms((prev) =>
      prev.map((item) => (item.id === p.id ? { ...item, is_enabled: nextStatus } : item))
    );
    setTogglingId(p.id);
    try {
      await platformApi.updatePlatform(p.id, { is_enabled: nextStatus });
    } catch (err: any) {
      setPlatforms((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, is_enabled: p.is_enabled } : item))
      );
      alert(err.message || "切换状态失败");
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenAdd = () => {
    setEditingPlatform(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (p: ThirdPartyPlatform) => {
    setEditingPlatform(p);
    setIsEditModalOpen(true);
  };

  const handleDeletePlatform = async (p: ThirdPartyPlatform) => {
    if (!window.confirm(`确定要删除平台「${p.name}」吗？删除后其子资源也会下线。`)) {
      return;
    }
    try {
      await platformApi.deletePlatform(p.id);
      loadPlatforms();
    } catch (err: any) {
      alert(err.message || "删除失败");
    }
  };

  if (!canAccess) {
    return (
      <div className="py-12">
        <PermissionDeniedCard
          message="访问此页面需要系统管理员或授权用户权限。如需访问，请联系管理员为您分配权限。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 顶部标题区 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Share2 className="h-6 w-6 text-purple-600" />
            <h1 className="text-xl font-bold text-gray-800">三方平台接入与中转管理</h1>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            统一维护外部合作平台，支持智能一键元数据抓取、防重复录入、每页展示条数调节与批量管控
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit ? (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-purple-700"
            >
              <Plus className="h-4 w-4" />
              新增平台配置
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>只读模式（仅管理员可编辑）</span>
            </div>
          )}
        </div>
      </div>

      {/* 快速筛选与多维排序工具栏 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm space-y-3">
        {/* 第一行：搜索框 + 排序下拉 + 状态总数与重置 */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              onKeyDown={(e) => e.key === "Enter" && loadPlatforms()}
              placeholder="搜索平台名称、描述或访问地址..."
              className="w-full rounded-xl border border-gray-200 py-2 pl-8 pr-8 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-200"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            {keyword && (
              <button
                onClick={() => {
                  setKeyword("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                title="清空搜索词"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 多维排序下拉 */}
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/60 px-2 py-1 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
              <select
                value={sortField}
                onChange={(e) => {
                  setSortField(e.target.value as SortField);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-gray-700 outline-none cursor-pointer"
                title="选择列表排序方式"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 一键重置全部筛选与排序 */}
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 rounded-xl bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100 transition"
                title="重置所有筛选与排序条件"
              >
                <RotateCcw className="h-3 w-3" />
                重置
              </button>
            )}

            <button
              onClick={loadPlatforms}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition"
            >
              刷新
            </button>
          </div>
        </div>

        {/* 第二行：分类、年龄段、状态、可见性下拉快速筛选条 */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-1 text-gray-400 font-medium">
            <Filter className="h-3 w-3" />
            <span>筛选:</span>
          </div>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={`rounded-lg border px-2 py-1 outline-none transition cursor-pointer text-xs ${
              statusFilter ? "border-purple-400 bg-purple-50/50 text-purple-700 font-medium" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* 分类筛选 */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className={`rounded-lg border px-2 py-1 outline-none transition cursor-pointer text-xs ${
              categoryFilter ? "border-purple-400 bg-purple-50/50 text-purple-700 font-medium" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* 年龄段筛选 */}
          <select
            value={ageGroupFilter}
            onChange={(e) => {
              setAgeGroupFilter(e.target.value);
              setPage(1);
            }}
            className={`rounded-lg border px-2 py-1 outline-none transition cursor-pointer text-xs ${
              ageGroupFilter ? "border-purple-400 bg-purple-50/50 text-purple-700 font-medium" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            {AGE_GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* 可见性范围筛选 */}
          <select
            value={visibilityFilter}
            onChange={(e) => {
              setVisibilityFilter(e.target.value);
              setPage(1);
            }}
            className={`rounded-lg border px-2 py-1 outline-none transition cursor-pointer text-xs ${
              visibilityFilter ? "border-purple-400 bg-purple-50/50 text-purple-700 font-medium" : "border-gray-200 text-gray-600 bg-white"
            }`}
          >
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* 结果统计标签 */}
          <span className="ml-auto text-[11px] text-gray-400">
            共 <strong className="text-gray-700">{total}</strong> 条匹配平台
            {platforms.length !== total && ` (总计 ${platforms.length} 条)`}
          </span>
        </div>
      </div>

      {/* 批量操作控制条（当有选中项时显示） */}
      {selectedIds.length > 0 && canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-xs text-purple-900 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-semibold">已选中 {selectedIds.length} 项</span>
            <span className="text-gray-300">|</span>
            <button
              onClick={selectAllFiltered}
              className="text-purple-700 underline hover:text-purple-900"
            >
              全选全部匹配项 ({filteredPlatforms.length})
            </button>
            <button
              onClick={clearSelection}
              className="text-gray-500 hover:text-gray-700"
            >
              清空选择
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={batchOperating}
              onClick={() => handleBatchAction("enable")}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              批量启用
            </button>
            <button
              disabled={batchOperating}
              onClick={() => handleBatchAction("disable")}
              className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              批量停用
            </button>
            <button
              disabled={batchOperating}
              onClick={() => handleBatchAction("delete")}
              className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量删除
            </button>
          </div>
        </div>
      )}

      {/* 平台列表表格 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl bg-red-50 p-4 text-xs text-red-600 text-center">
          {errorMsg}
        </div>
      ) : filteredPlatforms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Globe className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">暂无匹配的第三方平台</p>
          {canEdit && (
            <button
              onClick={handleOpenAdd}
              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100"
            >
              <Plus className="h-3.5 w-3.5" />
              点击新增
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50/75 border-b border-gray-100 text-[11px] font-semibold text-gray-500 select-none">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isCurrentPageAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isCurrentPagePartiallySelected;
                      }}
                      onChange={toggleSelectCurrentPage}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      title={isCurrentPageAllSelected ? "取消全选当前页" : "全选当前页"}
                    />
                  </th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:text-purple-600 transition"
                    onClick={() => {
                      setSortField((prev) => (prev === "name_asc" ? "name_desc" : "name_asc"));
                      setPage(1);
                    }}
                    title="点击按平台名称 (A-Z / Z-A) 快速排序"
                  >
                    <div className="flex items-center gap-1">
                      <span>平台信息</span>
                      {sortField === "name_asc" ? (
                        <ArrowUp className="h-3 w-3 text-purple-600" />
                      ) : sortField === "name_desc" ? (
                        <ArrowDown className="h-3 w-3 text-purple-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-gray-300" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-3">分类与阶段</th>
                  <th className="py-3 px-3">可见性范围</th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:text-purple-600 transition"
                    onClick={() => {
                      setSortField((prev) => (prev === "resources_desc" ? "sort_order_asc" : "resources_desc"));
                      setPage(1);
                    }}
                    title="点击按子资源入口数量多到少排序"
                  >
                    <div className="flex items-center gap-1">
                      <span>子资源数</span>
                      {sortField === "resources_desc" ? (
                        <ArrowDown className="h-3 w-3 text-purple-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-gray-300" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:text-purple-600 transition"
                    onClick={() => {
                      setSortField((prev) => (prev === "sort_order_asc" ? "sort_order_desc" : "sort_order_asc"));
                      setPage(1);
                    }}
                    title="点击切换排序权重升序/降序"
                  >
                    <div className="flex items-center gap-1">
                      <span>排序</span>
                      {sortField === "sort_order_asc" ? (
                        <ArrowUp className="h-3 w-3 text-purple-600" />
                      ) : sortField === "sort_order_desc" ? (
                        <ArrowDown className="h-3 w-3 text-purple-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-gray-300" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-3">状态</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedPlatforms.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-gray-50/50 transition-colors ${
                        isSelected ? "bg-purple-50/40" : ""
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(p.id)}
                          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <TablePlatformLogo name={p.name} logoUrl={p.logo_url} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-800 truncate max-w-[160px] sm:max-w-xs">{p.name}</span>
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-purple-600"
                                title="新标签页打开外部访问"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <p className="text-[11px] text-gray-400 font-mono truncate max-w-xs sm:max-w-md">
                              {p.url}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="inline-block rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                            {p.category_display || p.category}
                          </span>
                          {p.age_group_display && p.age_group !== "all" && (
                            <div className="text-[10px] text-gray-400">
                              {p.age_group_display}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {p.visibility_type === "all" ? (
                          <span className="text-gray-600">全员普通用户</span>
                        ) : (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 font-medium">
                            白名单 ({p.allowed_user_ids?.length || 0}人)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => setResourceModalPlatform(p)}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200 transition"
                        >
                          <Layers className="h-3 w-3 text-gray-500" />
                          <span>{p.resources?.length || 0} 个入口</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono text-gray-500">
                        {p.sort_order}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canEdit || togglingId === p.id}
                            onClick={() => handleToggleEnable(p)}
                            className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                              p.is_enabled ? "bg-green-500" : "bg-gray-300"
                            }`}
                            title={canEdit ? (p.is_enabled ? "点击快捷停用" : "点击快捷启用") : "只读模式不可操作"}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                p.is_enabled ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                          <span className={`text-[10px] font-medium ${p.is_enabled ? "text-green-600" : "text-gray-400"}`}>
                            {p.is_enabled ? "启用" : "停用"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setResourceModalPlatform(p)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-purple-600 transition"
                            title="管理子资源入口"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(p)}
                                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition"
                                title="编辑配置"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePlatform(p)}
                                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 transition"
                                title="删除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页控制区 */}
          <div className="p-3 border-t border-gray-100">
            <LightPagination
              page={currentPage}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              sizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={handlePageSizeChange}
              unitLabel="个平台"
            />
          </div>
        </div>
      )}

      {/* 平台编辑弹窗 */}
      {isEditModalOpen && (
        <PlatformEditModal
          initialData={editingPlatform}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => {
            setIsEditModalOpen(false);
            loadPlatforms();
          }}
        />
      )}

      {/* 子资源配置抽屉/弹窗 */}
      {resourceModalPlatform && (
        <ResourceManageModal
          platform={resourceModalPlatform}
          canEdit={canEdit}
          onClose={() => setResourceModalPlatform(null)}
          onRefresh={() => {
            loadPlatforms().then(() => {
              const updated = platforms.find((x) => x.id === resourceModalPlatform.id);
              if (updated) setResourceModalPlatform(updated);
            });
          }}
        />
      )}
    </div>
  );
}
