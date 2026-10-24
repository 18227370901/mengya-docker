import React, { useState } from "react";
import {
  RotateCcw, RefreshCw, Trash2, Download, ShieldAlert,
  Lock, FileArchive, Database, CheckCircle2, AlertTriangle, Loader2, Eye, EyeOff
} from "lucide-react";
import { backupApi } from "@/api/backup";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { WebdavBackupItem, RestoreSummary, WebdavConfig } from "@/types/backup";

interface Props {
  backups: WebdavBackupItem[];
  loading: boolean;
  config: WebdavConfig | null;
  onRefresh: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

export default function RemoteBackupListCard({ backups, loading, config, onRefresh, showToast }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [targetToDelete, setTargetToDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // 恢复模态框状态
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [targetRestoreFile, setTargetRestoreFile] = useState<WebdavBackupItem | null>(null);
  const [decryptPwd, setDecryptPwd] = useState("");
  const [showDecryptPwd, setShowDecryptPwd] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);

  // 下载中状态 (key: filename)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // 全选/反选
  const handleToggleSelectAll = () => {
    if (selected.length === backups.length) {
      setSelected([]);
    } else {
      setSelected(backups.map((b) => b.filename));
    }
  };

  const handleToggleSelect = (fn: string) => {
    setSelected((prev) =>
      prev.includes(fn) ? prev.filter((x) => x !== fn) : [...prev, fn]
    );
  };

  // 触发删除单个或批量
  const requestDelete = (filenames: string[]) => {
    setTargetToDelete(filenames);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    if (targetToDelete.length === 0) return;
    setDeleting(true);
    try {
      const res = await backupApi.deleteBackups(targetToDelete);
      showToast(res.message || "删除操作完成", true);
      setSelected((prev) => prev.filter((x) => !targetToDelete.includes(x)));
      setDeleteConfirmOpen(false);
      onRefresh();
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "删除备份失败", false);
    } finally {
      setDeleting(false);
    }
  };

  // 下载远端备份至浏览器
  const handleDownloadRemote = async (item: WebdavBackupItem) => {
    setDownloadingFile(item.filename);
    try {
      const res = await backupApi.downloadRemoteBackupBlob(item.filename);
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast(`备份文件「${item.filename}」下载成功！`, true);
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "下载远端备份失败", false);
    } finally {
      setDownloadingFile(null);
    }
  };

  // 打开恢复弹窗
  const openRestoreModal = (item: WebdavBackupItem) => {
    setTargetRestoreFile(item);
    // 若属于加密备份包且系统已预设加密密码，自动带入
    setDecryptPwd(item.is_encrypted ? (config?.backup_encrypt_password || "") : "");
    setShowDecryptPwd(false);
    setRestoreSummary(null);
    setRestoreModalOpen(true);
  };

  // 执行恢复操作
  const handleExecuteRestore = async () => {
    if (!targetRestoreFile) return;
    setRestoring(true);
    try {
      const res = await backupApi.restoreBackup({
        filename: targetRestoreFile.filename,
        decrypt_password: decryptPwd || undefined,
      });
      showToast(res.message || "系统数据与配置已成功恢复！", true);
      setRestoreSummary(res.data);
    } catch (e: any) {
      const errMsg = e.response?.data?.message || e.message || "恢复失败，请核对解密密码或文件完整性";
      showToast(errMsg, false);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">WebDAV 云端快照与容灾还原</h3>
            <p className="text-xs text-gray-400">
              云端存储的系统备份，随时一键拉取并自动执行安全回滚保护式还原
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition"
              onClick={() => requestDelete(selected)}
            >
              <Trash2 className="h-3.5 w-3.5" /> 批量删除 ({selected.length})
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-indigo-500 ${loading ? "animate-spin" : ""}`} />
            {loading ? "同步中..." : "刷新列表"}
          </button>
        </div>
      </div>

      {/* 备份列表 */}
      {loading && backups.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-indigo-500" />
          正在连接 WebDAV 检索云端备份...
        </div>
      ) : backups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-xs text-gray-400">
          暂未在 WebDAV 网盘目录中发现任何备份快照文件。可在上方卡片手动创建，或等待自动定时任务执行。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-medium">
                <th className="py-2.5 px-2 w-8">
                  <input
                    type="checkbox"
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                    checked={selected.length === backups.length && backups.length > 0}
                    onChange={handleToggleSelectAll}
                  />
                </th>
                <th className="py-2.5 px-2">备份文件名 / 属性</th>
                <th className="py-2.5 px-2 w-28">类型</th>
                <th className="py-2.5 px-2 w-20">加密状态</th>
                <th className="py-2.5 px-2 w-24">文件大小</th>
                <th className="py-2.5 px-2 w-36">最后修改时间</th>
                <th className="py-2.5 px-2 text-right w-44">容灾操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {backups.map((b) => {
                const isSelected = selected.includes(b.filename);
                const isZip = b.filename.toLowerCase().endsWith(".zip");
                return (
                  <tr key={b.filename} className={`hover:bg-gray-50/60 transition ${isSelected ? "bg-indigo-50/20" : ""}`}>
                    <td className="py-3 px-2">
                      <input
                        type="checkbox"
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(b.filename)}
                      />
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-gray-800 break-all">
                      <div className="flex items-center gap-1.5">
                        {isZip ? (
                          <FileArchive className="h-4 w-4 shrink-0 text-indigo-500" />
                        ) : (
                          <Database className="h-4 w-4 shrink-0 text-sky-500" />
                        )}
                        <span>{b.filename}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      {isZip ? (
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          全量系统快照
                        </span>
                      ) : (
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          纯数据库
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {b.is_encrypted ? (
                        <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <Lock className="h-3 w-3" /> AES-256
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[10px]">未加密</span>
                      )}
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-gray-600">{b.size_human}</td>
                    <td className="py-3 px-2 text-gray-400 text-[11px]">{b.modified_time}</td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-100 transition"
                          title="从该快照恢复系统"
                          onClick={() => openRestoreModal(b)}
                        >
                          一键还原
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-gray-200 p-1 text-gray-500 hover:bg-gray-100 transition disabled:opacity-50"
                          title="下载至本地"
                          disabled={downloadingFile === b.filename}
                          onClick={() => handleDownloadRemote(b)}
                        >
                          {downloadingFile === b.filename ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-gray-200 p-1 text-red-500 hover:bg-red-50 transition"
                          title="从云端删除"
                          onClick={() => requestDelete([b.filename])}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 批量/单文件删除确认框 */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="确认删除 WebDAV 备份文件"
        message={`您确定要从云端彻底删除所选的 ${targetToDelete.length} 个备份文件吗？此操作无法撤销。`}
        danger
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* 恢复系统模态框 */}
      {restoreModalOpen && targetRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="card w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">确认执行系统容灾还原</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  目标备份：<code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono">{targetRestoreFile.filename}</code>
                </p>
              </div>
            </div>

            {restoreSummary ? (
              /* 恢复成功反馈区 */
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>系统数据与基础配置已成功恢复！</span>
                </div>
                <div className="text-[11px] text-emerald-700 space-y-1">
                  <p>• 恢复数据表总数: <b>{restoreSummary.tables_restored}</b> 张表</p>
                  <p>• 恢复业务记录总计: <b>{restoreSummary.total_records_restored}</b> 条</p>
                  <div className="text-gray-700 pt-1">
                    <span className="font-semibold">🛡️ 安全回滚快照副本已生成：</span>
                    <div className="mt-1 font-mono text-[10px] bg-white p-1.5 rounded border border-emerald-200 text-gray-800 break-all select-all">
                      {restoreSummary.rollback_snapshot_path || `logs/${restoreSummary.rollback_snapshot}`}
                    </div>
                  </div>
                </div>
                <div className="pt-2 text-right">
                  <button
                    type="button"
                    className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    onClick={() => {
                      setRestoreModalOpen(false);
                      window.location.reload();
                    }}
                  >
                    刷新页面以生效最新数据
                  </button>
                </div>
              </div>
            ) : (
              /* 恢复确认与密码输入区 */
              <div className="space-y-3.5">
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800 leading-relaxed space-y-1.5">
                  <p className="font-semibold flex items-center gap-1">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    安全自愈保障说明：
                  </p>
                  <p className="text-[11px] text-amber-700">
                    1. 系统在执行替换前，会自动将当前运行的主库无损热备份至 <code className="font-mono bg-white/60 px-1 rounded">logs/db_rollback_pre_restore_*.db</code> 作为安全回滚副本。
                  </p>
                  <p className="text-[11px] text-amber-700">
                    2. 若备份文件损坏或密码不正确，系统将阻断恢复流程，确保当前系统 100% 不受影响。
                  </p>
                </div>

                {targetRestoreFile.is_encrypted && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-700">
                        解密密码 <span className="text-red-500">* (该备份已启用 AES-256 加密)</span>
                      </label>
                      {config?.backup_encrypt_password && (
                        <span className="text-[11px] text-emerald-600">已自动带入系统预设加密密码</span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showDecryptPwd ? "text" : "password"}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-10 text-xs focus:border-indigo-500 focus:outline-none"
                        placeholder="请输入备份包解密密码"
                        value={decryptPwd}
                        onChange={(e) => setDecryptPwd(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowDecryptPwd(!showDecryptPwd)}
                        title={showDecryptPwd ? "隐藏明文" : "查看明文"}
                      >
                        {showDecryptPwd ? <EyeOff className="h-3.5 w-3.5 text-indigo-600" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    disabled={restoring}
                    onClick={() => setRestoreModalOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2 text-xs font-medium text-white hover:bg-amber-700 transition disabled:opacity-60 shadow-sm"
                    disabled={restoring}
                    onClick={handleExecuteRestore}
                  >
                    {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    {restoring ? "校验与恢复中..." : "确认恢复系统"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
