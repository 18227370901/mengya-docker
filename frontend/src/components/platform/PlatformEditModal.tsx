import React, { useState } from "react";
import {
  ThirdPartyPlatform,
  PlatformMetaFetchResult,
} from "@/types/platform";
import { platformApi } from "@/api/platform";
import { Sparkles, X } from "lucide-react";
import { UserSelectPicker } from "./UserSelectPicker";

interface Props {
  initialData?: ThirdPartyPlatform | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PlatformEditModal: React.FC<Props> = ({
  initialData,
  onClose,
  onSuccess,
}) => {
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name || "");
  const [url, setUrl] = useState(initialData?.url || "");
  const [logoUrl, setLogoUrl] = useState(initialData?.logo_url || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [category, setCategory] = useState(initialData?.category || "tools");
  const [ageGroup, setAgeGroup] = useState(initialData?.age_group || "all");
  const [tagsStr, setTagsStr] = useState((initialData?.tags || []).join(", "));
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order ?? 0);
  const [isEnabled, setIsEnabled] = useState(initialData?.is_enabled ?? true);
  const [visibilityType, setVisibilityType] = useState<"all" | "restricted">(
    initialData?.visibility_type || "all"
  );
  const [allowedUserIds, setAllowedUserIds] = useState<number[]>(
    initialData?.allowed_user_ids || []
  );

  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [metaFeedback, setMetaFeedback] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFetchMeta = async () => {
    if (!url.trim()) {
      setMetaFeedback({ success: false, msg: "请先输入访问地址 URL" });
      return;
    }
    setFetchingMeta(true);
    setMetaFeedback(null);
    try {
      const res = await platformApi.fetchMeta(url.trim());
      const data: PlatformMetaFetchResult = res.data.data;
      if (data.success) {
        if (data.name && !name) setName(data.name);
        if (data.description && !description) setDescription(data.description);
        if (data.logo_url) setLogoUrl(data.logo_url);
        setMetaFeedback({ success: true, msg: "一键获取配置成功，已自动回填" });
      } else {
        setMetaFeedback({
          success: false,
          msg: data.message || "获取失败，请手动填写",
        });
      }
    } catch (err: any) {
      setMetaFeedback({
        success: false,
        msg: err.message || "目标站点抓取失败，请手动填写",
      });
    } finally {
      setFetchingMeta(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setErrorMsg("平台名称和访问地址为必填项");
      return;
    }

    const tags = tagsStr
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const allowed_user_ids = visibilityType === "restricted" ? allowedUserIds : [];

    setSaving(true);
    setErrorMsg("");
    try {
      const payload: Partial<ThirdPartyPlatform> = {
        name: name.trim(),
        url: url.trim(),
        logo_url: logoUrl.trim(),
        description: description.trim(),
        category,
        age_group: ageGroup,
        tags,
        sort_order: Number(sortOrder) || 0,
        is_enabled: isEnabled,
        visibility_type: visibilityType,
        allowed_user_ids,
      };

      if (isEdit && initialData) {
        await platformApi.updatePlatform(initialData.id, payload);
      } else {
        await platformApi.createPlatform(payload);
      }
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-bold text-gray-800">
            {isEdit ? "编辑平台配置" : "新增三方平台接入"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">
              访问地址 (URL) *
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://d3nmsqi4n72idj.cloudfront.net/ 或 https://example.com"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={handleFetchMeta}
                disabled={fetchingMeta}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {fetchingMeta ? "抓取中..." : "一键获取配置"}
              </button>
            </div>
            {metaFeedback && (
              <p
                className={`mt-1.5 text-xs ${
                  metaFeedback.success ? "text-green-600" : "text-amber-600"
                }`}
              >
                {metaFeedback.msg}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                平台名称 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：聪聪课堂"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Logo 图标链接
              </label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://.../favicon.ico"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">
              平台描述
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要说明该平台的特色或用途..."
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="parenting">育儿早教</option>
                <option value="health">母婴健康</option>
                <option value="learning">课外学习</option>
                <option value="tools">实用工具</option>
                <option value="entertainment">益智娱乐</option>
                <option value="other">其他资源</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                适用年龄段
              </label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="all">全年龄段</option>
                <option value="prenatal">孕产阶段</option>
                <option value="infant">0-1岁婴儿</option>
                <option value="toddler">1-3岁幼儿</option>
                <option value="preschool">3-6岁学前</option>
                <option value="school_age">6岁以上学龄</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                排序权重
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                placeholder="越小越靠前"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">
              标签（多个标签用英文逗号或空格隔开）
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="科学启蒙, 益智, 在线课堂"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3.5 space-y-3">
            <h4 className="text-xs font-semibold text-gray-800">用户可见性授权</h4>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibilityType"
                  value="all"
                  checked={visibilityType === "all"}
                  onChange={() => setVisibilityType("all")}
                />
                <span>所有普通用户（需开启中转站模块权限）</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibilityType"
                  value="restricted"
                  checked={visibilityType === "restricted"}
                  onChange={() => setVisibilityType("restricted")}
                />
                <span>仅指定用户白名单</span>
              </label>
            </div>
            {visibilityType === "restricted" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  选择授权访问该平台的用户（支持单选、多选、全选或反选）：
                </label>
                <UserSelectPicker
                  selectedUserIds={allowedUserIds}
                  onChange={setAllowedUserIds}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isEnabledCheck"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="rounded text-brand-500 focus:ring-brand-400"
            />
            <label
              htmlFor="isEnabledCheck"
              className="text-xs font-medium text-gray-700 cursor-pointer"
            >
              启用该平台（若关闭，普通用户将无法在中转站查看）
            </label>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-500 px-5 py-2 text-xs font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
