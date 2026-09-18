import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ClipboardList,
  Eye,
  FileText,
  Filter,
  Heart,
  Info,
  Package,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import CopyButton from "@/components/CopyButton";
import { auditApi, type AuditLogItem } from "@/api/auth";

const PAGE_SIZE = 15;

interface CategoryMeta {
  label: string;
  badgeColor: string;
  icon: typeof Shield;
  actions: string[];
}

const CATEGORIES: Record<string, CategoryMeta> = {
  auth: {
    label: "认证安全",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    icon: ShieldCheck,
    actions: [
      "login",
      "login_fail",
      "logout",
      "register",
      "change_password",
      "delete_account",
      "security_question",
      "forgot_password_attempt",
      "forgot_password_reset",
      "forgot_password_locked",
    ],
  },
  user: {
    label: "用户管控",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    icon: UserCheck,
    actions: [
      "user_update",
      "user_reset_password",
      "user_freeze",
      "user_unfreeze",
      "user_delete",
      "user_security",
      "security_config",
      "reg_mode",
      "invite_create",
      "invite_delete",
    ],
  },
  profile: {
    label: "孕育档案",
    badgeColor: "bg-pink-50 text-pink-700 border-pink-200",
    icon: Heart,
    actions: [
      "profile_update",
      "stage_update",
      "baby_create",
      "baby_update",
      "baby_delete",
      "baby_switch",
    ],
  },
  product: {
    label: "商品中心",
    badgeColor: "bg-orange-50 text-orange-700 border-orange-200",
    icon: Package,
    actions: [
      "product_create",
      "product_update",
      "product_delete",
      "product_import",
      "product_export",
      "product_admin",
      "brand_update",
      "favorite_add",
      "favorite_remove",
    ],
  },
  health: {
    label: "健康医疗",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: Activity,
    actions: ["health_record_create", "health_record_delete"],
  },
  shopping: {
    label: "待产清单",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
    icon: ShoppingBag,
    actions: [
      "shopping_list_create",
      "shopping_list_generate",
      "shopping_item_update",
      "shopping_item_delete",
    ],
  },
  ai: {
    label: "AI 助手",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: Bot,
    actions: ["ai_chat", "ai_compare", "ai_evaluate", "ai_config", "ai_config_test"],
  },
  system: {
    label: "系统运维",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    icon: Shield,
    actions: ["audit_delete", "audit_retention"],
  },
};

function getActionCategory(action: string): { key: string; meta: CategoryMeta } {
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    if (meta.actions.includes(action)) {
      return { key, meta };
    }
  }
  return { key: "system", meta: CATEGORIES.system };
}

export default function AuditLogPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [overview, setOverview] = useState<{ total: number; today: number; auth: number; business: number }>({
    total: 0,
    today: 0,
    auth: 0,
    business: 0,
  });
  const [actionLabels, setActionLabels] = useState<Array<[string, string]>>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // 筛选与搜索
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [timeSpanFilter, setTimeSpanFilter] = useState<"all" | "today" | "7days" | "30days">("all");

  // 勾选批量
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 分页
  const [page, setPage] = useState(1);

  // 审计保留设置
  const [retentionDays, setRetentionDays] = useState(90);
  const [showRetention, setShowRetention] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);

  // 详情弹窗
  const [activeDetailLog, setActiveDetailLog] = useState<AuditLogItem | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await auditApi.list();
      setLogs(data.logs);
      setStats(data.stats);
      setActionLabels(data.action_labels || []);
      setRetentionDays(data.audit_retention_days);
      if (data.overview) {
        setOverview(data.overview);
      } else {
        const total = data.logs.length;
        const today = data.logs.filter((l) => (l.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
        const auth = data.logs.filter((l) => getActionCategory(l.action).key === "auth").length;
        setOverview({ total, today, auth, business: total - auth });
      }
      setPage(1);
    } catch {
      showToast("加载审计日志失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 过滤数据
  const filtered = useMemo(() => {
    let list = logs;
    if (activeCategory !== "all") {
      const catActions = CATEGORIES[activeCategory]?.actions || [];
      list = list.filter((l) => catActions.includes(l.action));
    }
    if (actionFilter) {
      list = list.filter((l) => l.action === actionFilter);
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (l) =>
          (l.username || "").toLowerCase().includes(kw) ||
          (l.target_name || "").toLowerCase().includes(kw) ||
          (l.detail || "").toLowerCase().includes(kw) ||
          (l.action_label || "").toLowerCase().includes(kw) ||
          (l.ip || "").toLowerCase().includes(kw)
      );
    }
    if (timeSpanFilter !== "all") {
      const now = new Date();
      if (timeSpanFilter === "today") {
        const todayStr = now.toISOString().slice(0, 10);
        list = list.filter((l) => (l.created_at || "").slice(0, 10) === todayStr);
      } else if (timeSpanFilter === "7days") {
        const threshold = Date.now() - 7 * 24 * 3600 * 1000;
        list = list.filter((l) => new Date(l.created_at).getTime() >= threshold);
      } else if (timeSpanFilter === "30days") {
        const threshold = Date.now() - 30 * 24 * 3600 * 1000;
        list = list.filter((l) => new Date(l.created_at).getTime() >= threshold);
      }
    }
    if (dateFilter) {
      list = list.filter((l) => (l.created_at || "").slice(0, 10) === dateFilter);
    }
    return list;
  }, [logs, activeCategory, actionFilter, timeSpanFilter, keyword, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLogs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 全选控制
  const allSelected = pageLogs.length > 0 && pageLogs.every((l) => selected.has(l.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      pageLogs.forEach((l) => next.delete(l.id));
    } else {
      pageLogs.forEach((l) => next.add(l.id));
    }
    setSelected(next);
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selected.size} 条日志？此操作不可撤销。`)) return;
    try {
      const res = await auditApi.deleteIds([...selected]);
      showToast(`已删除 ${res.data?.deleted ?? selected.size} 条日志`);
      setSelected(new Set());
      await load();
    } catch {
      showToast("删除失败");
    }
  };

  const deleteAll = async () => {
    if (!window.confirm("确定清空全部审计日志？此操作不可撤销！")) return;
    try {
      await auditApi.deleteAll();
      showToast("已清空全部审计日志");
      await load();
    } catch {
      showToast("清空失败");
    }
  };

  const saveRetention = async () => {
    if (retentionDays < 0 || retentionDays > 3650) {
      showToast("保留天数范围为 0-3650 天");
      return;
    }
    setRetentionSaving(true);
    try {
      const res = await auditApi.setRetention(retentionDays);
      setRetentionDays(res.data?.audit_retention_days ?? retentionDays);
      setShowRetention(false);
      showToast("保留期限已更新");
    } catch {
      showToast("更新失败");
    } finally {
      setRetentionSaving(false);
    }
  };


  const handleExportCSV = () => {
    if (filtered.length === 0) {
      showToast("当前无符合条件的日志可导出");
      return;
    }
    const headers = ["ID", "记录时间", "操作账号", "操作动作", "动作标识", "目标类型", "目标名称", "详情说明", "IP地址"];
    const rows = filtered.map((l) => [
      l.id,
      `"${l.created_at || ""}"`,
      `"${l.username || "系统"}"`,
      `"${l.action_label || l.action}"`,
      `"${l.action}"`,
      `"${l.target_type || "-"}"`,
      `"${(l.target_name || "").replace(/"/g, String.fromCharCode(34, 34))}"`,
      `"${(l.detail || "").replace(/"/g, String.fromCharCode(34, 34))}"`,
      `"${l.ip || "-"}"`,
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.setAttribute("href", url);
    link.setAttribute("download", `audit_logs_${nowStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`已成功导出 ${filtered.length} 条审计日志为 CSV`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 头部标题与控制按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-white p-2.5 shadow-xs transition hover:shadow-md active:scale-95"
            onClick={() => navigate("/profile")}
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-brand-500" />
              <h1 className="text-xl font-bold text-gray-800">系统审计日志中心</h1>
            </div>
            <p className="text-xs text-gray-400">
              全站关键操作闭环追踪 • 保留 {retentionDays === 0 ? "永久" : `${retentionDays}天`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-xs transition hover:bg-gray-50 active:scale-95 cursor-pointer"
            onClick={handleExportCSV}
            title="导出当前筛选条件下的审计日志为 CSV 表格"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            <span>导出 CSV</span>
          </button>
          <button
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-xs transition hover:bg-gray-50"
            onClick={() => setShowRetention((v) => !v)}
          >
            <CalendarClock className="h-3.5 w-3.5 text-brand-500" />
            <span>设置保留天数</span>
          </button>
          <button
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-xs transition hover:bg-gray-50"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 统计指标卡片组 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400">总审计日志数</p>
            <p className="text-xl font-bold text-gray-800">{overview.total}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400">今日记录日志</p>
            <p className="text-xl font-bold text-gray-800">{overview.today}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400">安全风控事件</p>
            <p className="text-xl font-bold text-gray-800">{overview.auth}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400">业务数据变更</p>
            <p className="text-xl font-bold text-gray-800">{overview.business}</p>
          </div>
        </div>
      </div>

      {/* 保留天数设置展开面板 */}
      {showRetention && (
        <div className="card border-brand-200 bg-orange-50/40 p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">审计日志自动清理策略</h3>
            <button onClick={() => setShowRetention(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            设置历史日志的保留期限，超过该天数的日志将在日常巡检时自动清除（设为 0 则表示永久保留不清理）。
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={3650}
              className="input w-36 text-sm"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
            />
            <span className="text-xs text-gray-500">天</span>
            <button className="btn-primary py-2 px-4 text-xs" onClick={saveRetention} disabled={retentionSaving}>
              {retentionSaving ? "保存中..." : "保存设置"}
            </button>
          </div>
        </div>
      )}

      {/* 分类快捷筛选标签条 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            activeCategory === "all"
              ? "bg-brand-500 text-white shadow-xs"
              : "bg-white text-gray-600 hover:bg-brand-50 border border-gray-100"
          }`}
          onClick={() => {
            setActiveCategory("all");
            setActionFilter("");
            setPage(1);
          }}
        >
          全部分类 ({logs.length})
        </button>
        {Object.entries(CATEGORIES).map(([key, meta]) => {
          const count = logs.filter((l) => meta.actions.includes(l.action)).length;
          return (
            <button
              key={key}
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                activeCategory === key
                  ? "bg-brand-500 text-white shadow-xs"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-100"
              }`}
              onClick={() => {
                setActiveCategory(key);
                setActionFilter("");
                setPage(1);
              }}
            >
              <meta.icon className="h-3.5 w-3.5 opacity-80" />
              <span>{meta.label}</span>
              <span className="opacity-70 text-[10px]">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 快捷时间筛选 */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-medium text-gray-500">时间快捷筛选：</span>
        {[
          { key: "all", label: "全部时间" },
          { key: "today", label: "今天" },
          { key: "7days", label: "近 7 天" },
          { key: "30days", label: "近 30 天" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
              timeSpanFilter === t.key
                ? "bg-brand-500 text-white shadow-xs"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => {
              setTimeSpanFilter(t.key as any);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索与高级过滤栏 */}
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-12 items-center">
        <div className="relative sm:col-span-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="input pl-9 text-xs"
            placeholder="搜索操作账号、目标名称或详情关键词..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sm:col-span-4">
          <select
            className="input text-xs"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部具体操作类型</option>
            {actionLabels.map(([act, label]) => (
              <option key={act} value={act}>
                {label} ({stats[act] || 0})
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <input
            type="date"
            className="input text-xs"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sm:col-span-1 flex justify-end">
          <button
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 w-full"
            onClick={() => {
              setActiveCategory("all");
              setActionFilter("");
              setKeyword("");
              setDateFilter("");
              setTimeSpanFilter("all");
              setPage(1);
            }}
            title="重置全部筛选"
          >
            重置
          </button>
        </div>
      </div>

      {/* 批量操作工具条 */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>找到 {filtered.length} 条符合条件的日志</span>
            {selected.size > 0 && (
              <span className="font-semibold text-brand-600">（已勾选 {selected.size} 项）</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-100"
                onClick={deleteSelected}
              >
                <Trash2 className="h-3.5 w-3.5" /> 批量删除所选
              </button>
            )}
            <button
              className="flex items-center gap-1 rounded-lg bg-red-50/80 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-100"
              onClick={deleteAll}
            >
              <Trash2 className="h-3.5 w-3.5" /> 清空全部日志
            </button>
          </div>
        </div>
      )}

      {/* 审计日志列表 / 表格排版 */}
      {loading ? (
        <div className="card py-16 text-center text-gray-400">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-brand-400" />
          <p className="mt-3 text-sm">正在检索审计日志...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-3 text-sm text-gray-400">没有找到匹配的审计日志记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 表头 */}
          <div className="hidden items-center gap-3 rounded-xl bg-gray-100/70 px-4 py-2 text-xs font-semibold text-gray-500 md:flex">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-gray-300 text-brand-500"
            />
            <span className="w-36 flex-shrink-0">操作时间</span>
            <span className="w-24 flex-shrink-0">操作账号</span>
            <span className="w-28 flex-shrink-0">分类 / 操作</span>
            <span className="flex-1">详细操作与目标说明</span>
            <span className="w-24 flex-shrink-0 text-right">来源 IP</span>
            <span className="w-16 flex-shrink-0 text-right">详情</span>
          </div>

          {/* 逐行卡片 */}
          {pageLogs.map((log) => {
            const { meta } = getActionCategory(log.action);
            const Icon = meta.icon;

            return (
              <div
                key={log.id}
                className={`card flex items-start gap-3 px-4 py-3 transition hover:shadow-md ${
                  selected.has(log.id) ? "ring-2 ring-brand-300" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(log.id)}
                  onChange={() => toggleOne(log.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-xs text-gray-400">
                      {log.created_at?.slice(0, 19).replace("T", " ")}
                    </span>
                    <span className="font-semibold text-gray-700 text-sm">
                      {log.username || "系统后台"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.badgeColor}`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{log.action_label || log.action}</span>
                    </span>
                    {log.target_name && (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {log.target_name}
                      </span>
                    )}
                  </div>
                  {log.detail && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                      {log.detail}
                    </p>
                  )}
                </div>

                <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400 font-mono">{log.ip || "127.0.0.1"}</span>
                  <button
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline"
                    onClick={() => setActiveDetailLog(log)}
                  >
                    <Eye className="h-3.5 w-3.5" /> 查看
                  </button>
                </div>
              </div>
            );
          })}

          {/* 分页控制 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 px-1">
              <span className="text-xs text-gray-400">
                第 {page} / {totalPages} 页，共 {filtered.length} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs text-gray-600 shadow-xs transition hover:bg-gray-50 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> 上一页
                </button>
                <button
                  className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs text-gray-600 shadow-xs transition hover:bg-gray-50 disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 日志详情弹窗 */}
      {activeDetailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-brand-50 p-2 text-brand-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">审计日志详细信息</h3>
                  <p className="text-xs text-gray-400">日志编号 #{activeDetailLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveDetailLog(null)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">操作类型：</span>
                <span className="font-semibold text-gray-700">
                  {activeDetailLog.action_label || activeDetailLog.action} ({activeDetailLog.action})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">操作账号：</span>
                <span className="font-semibold text-gray-700">{activeDetailLog.username || "系统"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">操作时间：</span>
                <span className="text-gray-600 font-mono">
                  {activeDetailLog.created_at?.slice(0, 19).replace("T", " ")}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">客户端 IP：</span>
                <span className="text-gray-600 font-mono">{activeDetailLog.ip || "127.0.0.1"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">目标分类 / ID：</span>
                <span className="text-gray-600">
                  {activeDetailLog.target_type || "无"} / {activeDetailLog.target_id || "无"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">目标名称：</span>
                <span className="text-gray-600 font-medium">{activeDetailLog.target_name || "无"}</span>
              </div>
              <div>
                <span className="text-gray-400 block mb-1">完整详细记录：</span>
                <div className="rounded-xl bg-gray-50 p-3 text-gray-700 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed border border-gray-100">
                  {activeDetailLog.detail || "无附加内容"}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <CopyButton text={activeDetailLog.detail || ""} label="复制内容" />
              <button
                className="btn-secondary py-1.5 px-4 text-xs"
                onClick={() => setActiveDetailLog(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}