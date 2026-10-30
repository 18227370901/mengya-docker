import React, { useState } from "react";
import {
  ThirdPartyPlatform,
  ThirdPartyPlatformResource,
} from "@/types/platform";
import { platformApi } from "@/api/platform";
import { Plus, Trash2, Edit2, X, ExternalLink, ShieldAlert } from "lucide-react";
import { UserSelectPicker } from "./UserSelectPicker";

interface Props {
  platform: ThirdPartyPlatform;
  canEdit: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const ResourceManageModal: React.FC<Props> = ({
  platform,
  canEdit,
  onClose,
  onRefresh,
}) => {
  const [resources, setResources] = useState<ThirdPartyPlatformResource[]>(
    platform.resources || []
  );
  const [editingRes, setEditingRes] = useState<ThirdPartyPlatformResource | null>(
    null
  );
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [pathOrUrl, setPathOrUrl] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isEnabled, setIsEnabled] = useState(true);
  const [accessRule, setAccessRule] = useState<"inherit" | "restricted">("inherit");
  const [allowedUserIds, setAllowedUserIds] = useState<number[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingRes(null);
    setTitle("");
    setPathOrUrl("");
    setDescription("");
    setIcon("");
    setSortOrder(resources.length + 1);
    setIsEnabled(true);
    setAccessRule("inherit");
    setAllowedUserIds([]);
    setErrorMsg("");
  };

  const handleStartEdit = (res: ThirdPartyPlatformResource) => {
    setIsAdding(false);
    setEditingRes(res);
    setTitle(res.title);
    setPathOrUrl(res.path_or_url);
    setDescription(res.description || "");
    setIcon(res.icon || "");
    setSortOrder(res.sort_order);
    setIsEnabled(res.is_enabled);
    setAccessRule(res.access_rule);
    setAllowedUserIds(res.allowed_user_ids || []);
    setErrorMsg("");
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingRes(null);
    setErrorMsg("");
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !pathOrUrl.trim()) {
      setErrorMsg("子资源名称与路径不能为空");
      return;
    }

    const allowed_user_ids = accessRule === "restricted" ? allowedUserIds : [];

    setSaving(true);
    setErrorMsg("");
    try {
      const payload: Partial<ThirdPartyPlatformResource> = {
        title: title.trim(),
        path_or_url: pathOrUrl.trim(),
        description: description.trim(),
        icon: icon.trim(),
        sort_order: Number(sortOrder) || 0,
        is_enabled: isEnabled,
        access_rule: accessRule,
        allowed_user_ids,
      };

      if (editingRes) {
        await platformApi.updateResource(editingRes.id, payload);
      } else {
        await platformApi.createResource(platform.id, payload);
      }

      handleCancelForm();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || "保存子资源失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteResource = async (resId: number) => {
    if (!window.confirm("确定删除该子资源入口？")) return;
    try {
      await platformApi.deleteResource(resId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || "删除失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              平台子资源/多入口管理 · {platform.name}
            </h2>
            <p className="text-xs text-gray-400">
              为一个平台聚合多个深层页面或子服务地址（类似聚合工具箱）
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!canEdit && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-700">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>当前为只读浏览模式。只有系统超级管理员可以增删改子资源。</span>
          </div>
        )}

        {/* 子资源列表 */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">
              已有入口项 ({resources.length})
            </span>
            {canEdit && !isAdding && !editingRes && (
              <button
                onClick={handleStartAdd}
                className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
              >
                <Plus className="h-3.5 w-3.5" />
                新增子入口
              </button>
            )}
          </div>

          {resources.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-xs text-gray-400">
              暂无子入口，用户将只能直接打开平台主地址
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {resources.map((res) => (
                <div
                  key={res.id}
                  className="flex items-center justify-between p-3 text-xs hover:bg-gray-50/50"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{res.title}</span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] ${
                          res.is_enabled
                            ? "bg-green-50 text-green-600"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {res.is_enabled ? "启用" : "停用"}
                      </span>
                      {res.access_rule === "restricted" && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.2 text-[10px] text-rose-600">
                          白名单限制
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 font-mono text-[11px] truncate max-w-md">
                      {res.path_or_url}
                    </p>
                    {res.description && (
                      <p className="text-gray-500 text-[11px]">{res.description}</p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(res)}
                        className="rounded p-1 text-gray-400 hover:text-brand-500"
                        title="编辑"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteResource(res.id)}
                        className="rounded p-1 text-gray-400 hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新增或编辑表单 */}
        {canEdit && (isAdding || editingRes) && (
          <form
            onSubmit={handleSaveResource}
            className="mt-4 rounded-xl border border-brand-100 bg-brand-50/20 p-4 space-y-3"
          >
            <h4 className="text-xs font-semibold text-brand-700">
              {editingRes ? "编辑子入口项" : "新增子入口项"}
            </h4>

            {errorMsg && (
              <p className="text-xs text-red-600">{errorMsg}</p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  入口名称 *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：一年级数学、课程专区"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  子路径或完整 URL *
                </label>
                <input
                  type="text"
                  value={pathOrUrl}
                  onChange={(e) => setPathOrUrl(e.target.value)}
                  placeholder="/math/grade1 或 https://..."
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  描述
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话简要说明"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  图标标识 (可选)
                </label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="例如: BookOpen, Video"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  排序权重
                </label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                />
                <span>启用该子入口</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accessRule === "restricted"}
                  onChange={(e) =>
                    setAccessRule(e.target.checked ? "restricted" : "inherit")
                  }
                />
                <span>限制特定用户白名单</span>
              </label>
            </div>

            {accessRule === "restricted" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  选择授权访问该子资源的用户（支持单选、多选、全选或反选）：
                </label>
                <UserSelectPicker
                  selectedUserIds={allowedUserIds}
                  onChange={setAllowedUserIds}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelForm}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存子入口"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
