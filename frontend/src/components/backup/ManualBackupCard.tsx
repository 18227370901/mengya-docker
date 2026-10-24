import React, { useState, useEffect } from "react";
import { UploadCloud, Download, ShieldCheck, Database, Layers, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { backupApi } from "@/api/backup";
import type { WebdavConfig } from "@/types/backup";

interface Props {
  config: WebdavConfig | null;
  onBackupSuccess: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

export default function ManualBackupCard({ config, onBackupSuccess, showToast }: Props) {
  const [backupType, setBackupType] = useState<"full_backup" | "db_backup">("full_backup");
  const [useEncrypt, setUseEncrypt] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState(config?.backup_encrypt_password || "");
  const [showPwd, setShowPwd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (config?.backup_encrypt_password && !encryptPassword) {
      setEncryptPassword(config.backup_encrypt_password);
    }
  }, [config]);

  // 触发上传 WebDAV
  const handleUploadWebDAV = async () => {
    if (!config?.webdav_url) {
      showToast("请先在上方配置并保存 WebDAV 服务器地址与凭据", false);
      return;
    }
    setUploading(true);
    try {
      const res = await backupApi.uploadBackup({
        backup_type: backupType,
        use_encrypt: useEncrypt,
        manual_encrypt_password: encryptPassword || undefined,
      });
      showToast(res.message || "备份已成功上传至 WebDAV 云盘！", true);
      onBackupSuccess();
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "上传备份至 WebDAV 失败", false);
    } finally {
      setUploading(false);
    }
  };

  // 触发离线下载至本地电脑
  const handleDownloadOffline = async () => {
    setDownloading(true);
    try {
      const type = backupType === "full_backup" ? "full" : "db";
      const pwd = useEncrypt ? encryptPassword || undefined : undefined;
      const res = await backupApi.downloadLocalBackupBlob(type, pwd);

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const ext = backupType === "full_backup" ? "zip" : "db";
      a.download = `mengya_backup_${ts}_${ext === "zip" ? "full.zip" : "db.db"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast("已生成系统备份并触发浏览器下载！", true);
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "生成本地离线备份失败", false);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800">即时手动备份与离线导出</h3>
          <p className="text-xs text-gray-400">随时随地创建系统全量快照，支持直接上云或下载至本机离线保存</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* 备份类型选择 */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">选择备份数据范围：</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                backupType === "full_backup"
                  ? "border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setBackupType("full_backup")}
            >
              <div className="mt-0.5 rounded-lg bg-indigo-100 p-2 text-indigo-600">
                <Layers className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-800">全量系统快照备份</span>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">推荐 (一键容灾)</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
                  打包全部 37+ 张数据表、SystemSetting 核心系统基础配置、data/ 缓存数据、media/ 上传附件及 manifest.json 校验清单 (.zip)
                </p>
              </div>
            </button>

            <button
              type="button"
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                backupType === "db_backup"
                  ? "border-sky-500 bg-sky-50/40 ring-1 ring-sky-500"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setBackupType("db_backup")}
            >
              <div className="mt-0.5 rounded-lg bg-sky-100 p-2 text-sky-600">
                <Database className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-800">纯数据库原子快照</span>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">精简</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
                  使用 SQLite 原生在线原子热备 API，完整导出所有关系表数据与历史记录 (.db)
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 加密选项（针对全量快照） */}
        {backupType === "full_backup" && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                  checked={useEncrypt}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseEncrypt(checked);
                    if (checked && !encryptPassword && config?.backup_encrypt_password) {
                      setEncryptPassword(config.backup_encrypt_password);
                    }
                  }}
                />
                <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5 text-amber-500" /> 启用 AES-256 高强度加密
                </span>
              </label>
              {config?.backup_encrypt_password && (
                <span className="text-[11px] text-emerald-600 font-medium">已自动带入预设密码（可修改）</span>
              )}
            </div>

            {useEncrypt && (
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-xs focus:border-indigo-500 focus:outline-none"
                  placeholder="请输入压缩包 AES-256 加密密码（点击右侧眼睛可查看明文）"
                  value={encryptPassword}
                  onChange={(e) => setEncryptPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPwd(!showPwd)}
                  title={showPwd ? "隐藏明文" : "查看明文"}
                >
                  {showPwd ? <EyeOff className="h-3.5 w-3.5 text-indigo-600" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 触发操作按钮 */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
            disabled={downloading || uploading}
            onClick={handleDownloadOffline}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin text-sky-500" /> : <Download className="h-4 w-4 text-sky-500" />}
            {downloading ? "生成并导出中..." : "生成并下载离线快照"}
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm"
            disabled={uploading || downloading}
            onClick={handleUploadWebDAV}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? "备份与上传中..." : "立即备份并上传至 WebDAV"}
          </button>
        </div>
      </div>
    </div>
  );
}
