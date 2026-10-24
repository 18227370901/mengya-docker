import React, { useState, useEffect } from "react";
import { Cloud, CheckCircle2, XCircle, Eye, EyeOff, Loader2, Save, Wifi, Lock } from "lucide-react";
import { backupApi } from "@/api/backup";
import type { WebdavConfig } from "@/types/backup";

interface Props {
  config: WebdavConfig | null;
  onRefresh: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

export default function BackupConfigCard({ config, onRefresh, showToast }: Props) {
  const [form, setForm] = useState({
    config_alias: config?.config_alias || "",
    webdav_url: config?.webdav_url || "",
    backup_path: config?.backup_path || "/mengya_backups/",
    backup_username: config?.webdav_username || "",
    backup_password: config?.webdav_password || "",
    encrypt_password: config?.backup_encrypt_password || "",
    max_rollback_copies: config?.max_rollback_copies ?? 3,
    clear_encrypt_password: false,
  });

  // 当外部 config 更新时完整同步包括密码在内的所有字段
  useEffect(() => {
    if (config) {
      setForm((prev) => ({
        ...prev,
        config_alias: config.config_alias || "",
        webdav_url: config.webdav_url || "",
        backup_path: config.backup_path || "/mengya_backups/",
        backup_username: config.webdav_username || "",
        backup_password: config.webdav_password || prev.backup_password || "",
        encrypt_password: config.backup_encrypt_password || prev.encrypt_password || "",
        max_rollback_copies: config.max_rollback_copies ?? 3,
        clear_encrypt_password: false,
      }));
    }
  }, [config]);

  const [showPwd, setShowPwd] = useState(false);
  const [showEncPwd, setShowEncPwd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    if (!form.webdav_url.trim()) {
      showToast("请输入 WebDAV 服务器地址", false);
      return;
    }
    if (!form.backup_username.trim()) {
      showToast("请输入用户名/账号", false);
      return;
    }
    setTesting(true);
    try {
      const res = await backupApi.testConnection({
        webdav_url: form.webdav_url,
        webdav_username: form.backup_username,
        webdav_password: form.backup_password || undefined,
        backup_path: form.backup_path,
      });
      showToast(res.message || "WebDAV 连接成功！", true);
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "WebDAV 连接测试失败", false);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.webdav_url.trim()) {
      showToast("WebDAV 服务器地址不能为空", false);
      return;
    }
    setSaving(true);
    try {
      const res = await backupApi.saveConfig({
        config_alias: form.config_alias,
        webdav_url: form.webdav_url,
        backup_path: form.backup_path,
        webdav_username: form.backup_username,
        webdav_password: form.backup_password,
        backup_encrypt_password: form.clear_encrypt_password ? "" : form.encrypt_password,
        max_rollback_copies: form.max_rollback_copies,
        clear_encrypt_password: form.clear_encrypt_password,
      });
      showToast(res.message || "配置已成功保存！", true);
      onRefresh();
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "保存配置失败", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">WebDAV 服务器配置</h3>
            <p className="text-xs text-gray-400">支持坚果云、群晖、Nextcloud、Alist 等标准 WebDAV 网盘</p>
          </div>
        </div>
        {config?.last_status && (
          <div className="text-right text-xs">
            <span className="text-gray-400">最近状态: </span>
            <span className="font-medium text-gray-700">{config.last_status}</span>
            {config.last_backup_time && (
              <span className="text-gray-400 ml-2">({config.last_backup_time})</span>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              配置别称 <span className="text-gray-400 font-normal">(用于标识管理)</span>
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="例如：坚果云家庭云盘 / 群晖NAS"
              value={form.config_alias}
              onChange={(e) => setForm({ ...form, config_alias: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              网盘存储目录 <span className="text-gray-400 font-normal">(默认: /mengya_backups/)</span>
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="/mengya_backups/"
              value={form.backup_path}
              onChange={(e) => setForm({ ...form, backup_path: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              WebDAV 服务器 URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="例如：https://dav.jianguoyun.com/dav/"
              value={form.webdav_url}
              onChange={(e) => setForm({ ...form, webdav_url: e.target.value })}
              required
            />
            <p className="mt-1 text-[11px] text-gray-400">
              坚果云：<code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">https://dav.jianguoyun.com/dav/</code> ；群晖/Alist 请填写对应挂载 URL。
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              用户名 / 账号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="username@example.com"
              value={form.backup_username}
              onChange={(e) => setForm({ ...form, backup_username: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              安全回滚快照保留上限 <span className="text-gray-400 font-normal">(份数，默认 3)</span>
            </label>
            <input
              type="number"
              min={1}
              max={20}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="默认 3 份"
              value={form.max_rollback_copies}
              onChange={(e) => setForm({ ...form, max_rollback_copies: Math.max(1, Math.min(20, parseInt(e.target.value) || 3)) })}
            />
            <p className="mt-1 text-[11px] text-gray-400">系统在替换还原前自动生成的安全回滚镜像最多保留份数，超出自动淘汰最久远副本。</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">
                密码 / 应用授权码 {config?.has_webdav_password ? <span className="text-emerald-600 font-semibold">(已保存，点击眼睛可直接查看)</span> : <span className="text-red-500">*</span>}
              </label>
            </div>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none"
                placeholder={config?.has_webdav_password ? "已设置授权码（点击眼睛可查看明文）" : "请输入密码或网盘应用授权码"}
                value={form.backup_password}
                onChange={(e) => setForm({ ...form, backup_password: e.target.value })}
              />
              <button
                type="button"
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPwd(!showPwd)}
                title={showPwd ? "隐藏明文" : "查看明文"}
              >
                {showPwd ? <EyeOff className="h-4 w-4 text-indigo-600" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              坚果云请在「账户信息 - 安全选项 - 第三方应用管理」中生成应用专属授权码。
            </p>
          </div>
        </div>

        {/* 预设 AES-256 加密密码 */}
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <Lock className="h-4 w-4 text-amber-500" />
              <span>自动备份预设 AES-256 加密密码 (可选)</span>
              {config?.has_encrypt_password ? (
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> 已保存（点击右侧眼睛可查看明文）
                </span>
              ) : (
                <span className="text-[10px] text-gray-400">未设置 (明文快照)</span>
              )}
            </div>
            {config?.has_encrypt_password && (
              <label className="flex items-center gap-1.5 text-xs text-red-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.clear_encrypt_password}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm({ ...form, clear_encrypt_password: checked, encrypt_password: checked ? "" : (config.backup_encrypt_password || "") });
                  }}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                <span>清除已存加密密码</span>
              </label>
            )}
          </div>

          <div className="relative">
            <input
              type={showEncPwd ? "text" : "password"}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-gray-100"
              placeholder={config?.has_encrypt_password ? "已设置预设加密密码（点击眼睛可查看明文）" : "预设备份加密密码（留空不加密）"}
              value={form.encrypt_password}
              disabled={form.clear_encrypt_password}
              onChange={(e) => setForm({ ...form, encrypt_password: e.target.value })}
            />
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              onClick={() => setShowEncPwd(!showEncPwd)}
              title={showEncPwd ? "隐藏明文" : "查看明文"}
            >
              {showEncPwd ? <EyeOff className="h-4 w-4 text-indigo-600" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            采用标准 AES-256 (pyzipper) 算法加密压缩包。若设置，定时任务自动执行时将使用此密码保护全量快照。
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
            disabled={testing || saving}
            onClick={handleTest}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : <Wifi className="h-4 w-4 text-indigo-500" />}
            {testing ? "测试中..." : "测试连接"}
          </button>

          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm"
            disabled={saving || testing}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </form>
    </div>
  );
}
