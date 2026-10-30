import React, { useEffect, useState } from "react";
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
  ListOrdered
} from "lucide-react";
import { platformApi } from "@/api/platform";
import { ThirdPartyPlatform } from "@/types/platform";
import { useAuthStore } from "@/store/authStore";
import PermissionDeniedCard from "@/components/PermissionDeniedCard";
import { PlatformEditModal } from "@/components/platform/PlatformEditModal";
import { ResourceManageModal } from "@/components/platform/ResourceManageModal";

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

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<ThirdPartyPlatform | null>(null);

  const [resourceModalPlatform, setResourceModalPlatform] = useState<ThirdPartyPlatform | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

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

  // 严格权限识别：
  // 1. 访问本页面：需要管理员或被授予 menu_admin_platforms 权限
  // 2. 增删改平台及子资源：只有管理员（is_staff）可以操作，被授权的普通用户只有只读查看权限！
  const canAccess = user?.is_staff || hasPermission("menu_admin_platforms");
  const canEdit = !!user?.is_staff;

  const loadPlatforms = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await platformApi.getPlatforms({ keyword: keyword || undefined });
      setPlatforms(res.data.data || []);
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

  const handleOpenAdd = () => {
    setEditingPlatform(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (p: ThirdPartyPlatform) => {
    setEditingPlatform(p);
    setIsEditModalOpen(true);
  };

  const handleDeletePlatform = async (p: ThirdPartyPlatform) => {
    if (!window.confirm(`确定要删除平台「${p.name}」吗？删除后相关子资源也将下线。`)) {
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
          message="该配置页面仅对系统管理员及获权用户开放。如需访问，请联系管理员为您配置权限。"
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
            统一维护外部工具平台、一键获取网站元数据、配置可见性白名单与子资源分级入口
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
              <span>只读模式（仅超级管理员可编辑）</span>
            </div>
          )}
        </div>
      </div>

      {/* 搜索过滤栏 */}
      <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm border border-gray-100">
        <div className="relative w-full max-w-xs">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadPlatforms()}
            placeholder="搜索平台名称或描述..."
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-purple-500 focus:outline-none"
          />
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
        </div>
        <button
          onClick={loadPlatforms}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          刷新
        </button>
      </div>

      {/* 平台列表 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl bg-red-50 p-4 text-xs text-red-600 text-center">
          {errorMsg}
        </div>
      ) : platforms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Globe className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">暂无接入的三方平台</p>
          {canEdit && (
            <button
              onClick={handleOpenAdd}
              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100"
            >
              <Plus className="h-3.5 w-3.5" />
              立即新增
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50/75 border-b border-gray-100 text-[11px] font-semibold text-gray-500">
              <tr>
                <th className="py-3 px-4">平台信息</th>
                <th className="py-3 px-3">分类与阶段</th>
                <th className="py-3 px-3">可见性范围</th>
                <th className="py-3 px-3">子资源数</th>
                <th className="py-3 px-3">排序</th>
                <th className="py-3 px-3">状态</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {platforms.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
<TablePlatformLogo name={p.name} logoUrl={p.logo_url} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800">{p.name}</span>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-purple-600"
                            title="打开外部链接"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <p className="text-[11px] text-gray-400 font-mono truncate max-w-xs">
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
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                        白名单 ({p.allowed_user_ids?.length || 0}人)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => setResourceModalPlatform(p)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
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
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-purple-600"
                        title="管理子资源"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                            title="编辑"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePlatform(p)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* 子资源管理弹窗 */}
      {resourceModalPlatform && (
        <ResourceManageModal
          platform={resourceModalPlatform}
          canEdit={canEdit}
          onClose={() => setResourceModalPlatform(null)}
          onRefresh={() => {
            loadPlatforms().then(() => {
              // 更新当前选中的平台实例
              const updated = platforms.find((x) => x.id === resourceModalPlatform.id);
              if (updated) setResourceModalPlatform(updated);
            });
          }}
        />
      )}
    </div>
  );
}
