import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Globe2,
  KeyRound,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { authApi } from "@/api/auth";
import type { InviteLinkData } from "@/api/auth";

export default function RegistrationManagePage() {
  const navigate = useNavigate();
  const [regMode, setRegMode] = useState("open");
  const [invites, setInvites] = useState<InviteLinkData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [inviteForm, setInviteForm] = useState({ max_uses: 1, expire_hours: "", note: "" });
  const [newInviteUrl, setNewInviteUrl] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 2500);
  };

  const loadData = async () => {
    try {
      const data = await authApi.registrationManage();
      setRegMode(data.registration_mode);
      setInvites(data.invites || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSetMode = async (mode: "open" | "invitation_only") => {
    if (regMode === mode || regLoading) return;
    setRegLoading(true);
    try {
      await authApi.registrationManageAction({ action: "set_mode", mode });
      setRegMode(mode);
      showToast(mode === "open" ? "已切换为：开放注册模式" : "已切换为：仅限邀请注册模式");
    } catch {
      showToast("切换模式失败，请重试");
    } finally {
      setRegLoading(false);
    }
  };

  const handleCreateInvite = async () => {
    if (createLoading) return;
    setCreateLoading(true);
    try {
      const res = await authApi.registrationManageAction({
        action: "create_invite",
        max_uses: inviteForm.max_uses,
        expire_hours: inviteForm.expire_hours ? Number(inviteForm.expire_hours) : undefined,
        note: inviteForm.note,
      });
      const data = res.data as { register_url: string };
      const fullUrl = window.location.origin + data.register_url;
      setNewInviteUrl(fullUrl);
      navigator.clipboard?.writeText(fullUrl);
      showToast("邀请链接生成成功并已复制");
      setInviteForm({ max_uses: 1, expire_hours: "", note: "" });
      const manageData = await authApi.registrationManage();
      setInvites(manageData.invites || []);
    } catch {
      showToast("生成邀请链接失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const copyLink = (token: string) => {
    const url = window.location.origin + "/register?invite=" + token;
    navigator.clipboard?.writeText(url);
    showToast("邀请链接已复制到剪贴板");
  };

  const handleDeactivate = async (inviteId: number) => {
    try {
      await authApi.registrationManageAction({ action: "deactivate_invite", invite_id: inviteId });
      showToast("邀请链接已停用");
      const data = await authApi.registrationManage();
      setInvites(data.invites || []);
    } catch {
      showToast("停用失败");
    }
  };

  const handleDelete = async (inviteId: number) => {
    if (!window.confirm("确认删除此邀请链接？删除后该链接将立即无法用于注册。")) return;
    try {
      await authApi.registrationManageAction({ action: "delete_invite", invite_id: inviteId });
      showToast("邀请链接已删除");
      const data = await authApi.registrationManage();
      setInvites(data.invites || []);
    } catch {
      showToast("删除失败");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invites.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invites.map((it) => it.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确认批量删除选中的 ${selectedIds.size} 个邀请链接？删除后将立即无法使用。`)) return;
    try {
      await authApi.registrationManageAction({
        action: "batch_delete_invites",
        invite_ids: Array.from(selectedIds),
      });
      setSelectedIds(new Set());
      showToast(`已成功删除选中的 ${selectedIds.size} 个邀请链接`);
      const data = await authApi.registrationManage();
      setInvites(data.invites || []);
    } catch {
      showToast("批量删除失败，请重试");
    }
  };

  const handleClearAll = async () => {
    if (invites.length === 0) return;
    if (!window.confirm("警告：确认一键清空所有生成的邀请链接？此操作不可恢复。")) return;
    try {
      await authApi.registrationManageAction({ action: "clear_all_invites" });
      setSelectedIds(new Set());
      showToast("已清空全部邀请链接");
      const data = await authApi.registrationManage();
      setInvites(data.invites || []);
    } catch {
      showToast("清空失败，请重试");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-white p-2.5 shadow-xs transition hover:bg-gray-50 hover:shadow-sm"
            onClick={() => navigate("/profile")}
            title="返回个人中心"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-brand-500" />
              <h1 className="text-xl font-bold text-gray-800">注册管理</h1>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              独立管控系统注册策略与邀请注册链接
            </p>
          </div>
        </div>
      </div>

      {/* 模块一：注册模式控制 (独立模块) */}
      <section className="card space-y-4 border border-gray-100 shadow-xs">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">注册模式控制</h2>
              <p className="text-xs text-gray-400">设置系统的新用户注册准入策略</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              regMode === "open"
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${regMode === "open" ? "bg-green-500" : "bg-amber-500"}`} />
            当前：{regMode === "open" ? "开放注册模式" : "仅限邀请注册模式"}
          </span>
        </div>

        {/* 策略提示栏 */}
        <div
          className={`flex items-start gap-2.5 rounded-xl p-3.5 text-xs transition ${
            regMode === "open"
              ? "bg-green-50/70 text-green-800 border border-green-100"
              : "bg-amber-50/70 text-amber-800 border border-amber-100"
          }`}
        >
          <div className="mt-0.5">
            {regMode === "open" ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <KeyRound className="h-4 w-4 text-amber-600" />
            )}
          </div>
          <div className="space-y-0.5">
            <p className="font-semibold">
              {regMode === "open"
                ? "当前系统处于「开放注册」状态"
                : "当前系统处于「仅限邀请注册」状态"}
            </p>
            <p className="opacity-90">
              {regMode === "open"
                ? "任何新访客均可自由输入手机号注册账号，无需邀请码。此模式适合产品公开运营与获客阶段。"
                : "注册页面将强制校验邀请码或专属邀请链接，未持有有效邀请的用户无法注册。此模式适合封闭内测或定向受控准入。"}
            </p>
          </div>
        </div>

        {/* 模式切换卡片组 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* 模式卡片 1: 开放注册 */}
          <div
            onClick={() => handleSetMode("open")}
            className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
              regMode === "open"
                ? "border-green-400 bg-green-50/30 shadow-xs ring-1 ring-green-300"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${regMode === "open" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                    <Globe2 className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-gray-800 text-sm">开放注册</span>
                </div>
                {regMode === "open" && (
                  <span className="rounded-full bg-green-500 px-2 py-0.5 text-[11px] font-medium text-white">
                    当前生效
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                无需邀请码，新用户直接访问注册页填写手机号即可注册，无使用门槛。
              </p>
            </div>
            <button
              type="button"
              disabled={regLoading || regMode === "open"}
              className={`mt-3 w-full rounded-lg py-1.5 text-xs font-medium transition ${
                regMode === "open"
                  ? "bg-green-100 text-green-700 cursor-default"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
              }`}
            >
              {regMode === "open" ? "正在使用此模式" : "切换为开放注册"}
            </button>
          </div>

          {/* 模式卡片 2: 仅限邀请注册 */}
          <div
            onClick={() => handleSetMode("invitation_only")}
            className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
              regMode === "invitation_only"
                ? "border-amber-400 bg-amber-50/30 shadow-xs ring-1 ring-amber-300"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${regMode === "invitation_only" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"}`}>
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-gray-800 text-sm">仅限邀请注册</span>
                </div>
                {regMode === "invitation_only" && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">
                    当前生效
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                必须填写管理员下发的有效邀请码或专属链接，未被邀请的用户无法注册。
              </p>
            </div>
            <button
              type="button"
              disabled={regLoading || regMode === "invitation_only"}
              className={`mt-3 w-full rounded-lg py-1.5 text-xs font-medium transition ${
                regMode === "invitation_only"
                  ? "bg-amber-100 text-amber-700 cursor-default"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
              }`}
            >
              {regMode === "invitation_only" ? "正在使用此模式" : "切换为仅限邀请"}
            </button>
          </div>
        </div>
      </section>

      {/* 模块二：邀请链接管理与生成 (独立模块，支持常态化管理) */}
      <section className="card space-y-5 border border-gray-100 shadow-xs">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">邀请链接管理与生成</h2>
              <p className="text-xs text-gray-400">
                生成与管理带有专属邀请令牌的注册链接，支持按需预生成
              </p>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
            已创建 {invites.length} 个链接
          </span>
        </div>

        {/* 生成表单卡片 */}
        <div className="rounded-xl bg-gray-50/80 p-4 border border-gray-100 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
            <Plus className="h-3.5 w-3.5 text-brand-500" />
            <span>生成新邀请链接</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label text-xs">最大可用次数</label>
              <input
                type="number"
                min={1}
                className="input text-xs"
                value={inviteForm.max_uses}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, max_uses: Math.max(1, Number(e.target.value)) }))
                }
              />
              <div className="mt-1.5 flex gap-1.5">
                {[1, 5, 10, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setInviteForm((f) => ({ ...f, max_uses: num }))}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                      inviteForm.max_uses === num
                        ? "bg-brand-500 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    {num}次
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label text-xs">有效期限 (小时，留空或0表示永久有效)</label>
              <input
                type="number"
                min={0}
                placeholder="例如 72"
                className="input text-xs"
                value={inviteForm.expire_hours}
                onChange={(e) => setInviteForm((f) => ({ ...f, expire_hours: e.target.value }))}
              />
              <div className="mt-1.5 flex gap-1.5">
                {[
                  { label: "24小时", val: "24" },
                  { label: "72小时", val: "72" },
                  { label: "7天", val: "168" },
                  { label: "永久", val: "" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setInviteForm((f) => ({ ...f, expire_hours: item.val }))}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                      inviteForm.expire_hours === item.val
                        ? "bg-brand-500 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="label text-xs">用途备注（可选）</label>
            <input
              type="text"
              placeholder="如：首期内测用户、张三专享链接"
              className="input text-xs"
              value={inviteForm.note}
              onChange={(e) => setInviteForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>

          <button
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-1.5 py-2 text-xs"
            disabled={createLoading}
            onClick={handleCreateInvite}
          >
            <Plus className="h-4 w-4" />
            <span>{createLoading ? "生成中…" : "立即生成邀请链接"}</span>
          </button>

          {/* 最新生成链接反馈栏 */}
          {newInviteUrl && (
            <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-900">新链接已生成并复制：</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  onClick={() => {
                    navigator.clipboard?.writeText(newInviteUrl);
                    showToast("链接已复制到剪贴板");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>再次复制</span>
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 border border-indigo-100">
                <span className="flex-1 select-all truncate text-xs text-indigo-700 font-mono">
                  {newInviteUrl}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 邀请链接明细列表 */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={invites.length > 0 && selectedIds.size === invites.length}
                  onChange={toggleSelectAll}
                  disabled={invites.length === 0}
                  className="rounded border-gray-300 text-brand-500 focus:ring-brand-500 h-4 w-4"
                />
                <span>全选 ({selectedIds.size}/{invites.length})</span>
              </label>
              {selectedIds.size > 0 && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600">
                  已选 {selectedIds.size} 项
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleBatchDelete}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  selectedIds.size > 0
                    ? "bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 shadow-2xs"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
                title="批量删除选中的邀请链接"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>批量删除 ({selectedIds.size})</span>
              </button>
              <button
                type="button"
                disabled={invites.length === 0}
                onClick={handleClearAll}
                className={`inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium transition ${
                  invites.length > 0
                    ? "bg-white text-red-600 hover:bg-red-50 active:scale-95 shadow-2xs"
                    : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                }`}
                title="清空所有邀请链接"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>一键清空</span>
              </button>
            </div>
          </div>

          {invites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
              暂无已生成的邀请链接，请在上方配置并点击「立即生成邀请链接」
            </div>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-gray-100 bg-white p-3 shadow-2xs transition hover:border-gray-200"
                >
                  <div className="flex items-center gap-2.5 self-start sm:self-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleSelectOne(inv.id)}
                      className="rounded border-gray-300 text-brand-500 focus:ring-brand-500 h-4 w-4 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-gray-700">
                        {inv.token.slice(0, 16)}...
                      </span>
                      {inv.is_valid ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600">
                          有效
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400">
                          已失效
                        </span>
                      )}
                      {inv.note && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">
                          {inv.note}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                      <span>使用次数：{inv.used_count} / {inv.max_uses}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {inv.expires_at
                          ? `到期：${inv.expires_at.slice(0, 16).replace("T", " ")}`
                          : "永久有效"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 active:scale-95 transition"
                      title="复制完整邀请链接"
                      onClick={() => copyLink(inv.token)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>复制</span>
                    </button>
                    {inv.is_active && (
                      <button
                        type="button"
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 active:scale-95 transition"
                        onClick={() => handleDeactivate(inv.id)}
                      >
                        停用
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 active:scale-95 transition"
                      title="删除邀请链接"
                      onClick={() => handleDelete(inv.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 浮动 Toast 反馈 */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-gray-900/90 px-4 py-2.5 text-sm text-white shadow-lg backdrop-blur-sm transition animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
