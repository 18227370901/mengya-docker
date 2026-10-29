import React, { useState } from "react";
import {
  RotateCcw, Download, Trash2, ShieldAlert, CheckCircle2,
  Lock, Eye, EyeOff, Loader2, RefreshCw, FileArchive, Database, Layers, ArrowRightLeft
} from "lucide-react";

import { backupApi } from "@/api/backup";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { WebdavBackupItem, RestoreSummary, WebdavConfig } from "@/types/backup";

interface Props {
  backups: WebdavBackupItem[];
  config: WebdavConfig | null;
  loading: boolean;
  onRefresh: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

/** 解析备份文件名中的元数据信息 */
function parseBackupFileInfo(filename: string) {
  const lower = filename.toLowerCase();
  let mode: "sqlite" | "pg_shared" | "pg_dedicated" | "unknown" = "unknown";
  let modeLabel = "标准备份";
  let modeColor = "bg-gray-100 text-gray-700 border-gray-200";

  if (lower.includes("_pg_dedicated_")) {
    mode = "pg_dedicated";
    modeLabel = "独立PG";
    modeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (lower.includes("_pg_shared_")) {
    mode = "pg_shared";
    modeLabel = "共享PG";
    modeColor = "bg-purple-50 text-purple-700 border-purple-200";
  } else if (lower.includes("_sqlite_") || lower.endsWith(".db")) {
    mode = "sqlite";
    modeLabel = "SQLite";
    modeColor = "bg-sky-50 text-sky-700 border-sky-200";
  }

  const isFull = lower.includes("_full.") || (lower.endsWith(".zip") && !lower.includes("_db."));
  return { mode, modeLabel, modeColor, isFull };
}

export default function RemoteBackupListCard({ backups, loading, config, onRefresh, showToast }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // 恢复模态框状态
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [targetRestoreFile, setTargetRestoreFile] = useState<WebdavBackupItem | null>(null);
  const [decryptPwd, setDecryptPwd] = useState("");
  const [showDecryptPwd, setShowDecryptPwd] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);

  // 删除确认框状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [targetToDelete, setTargetToDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // 选择框联动
  const handleToggleSelect = (fn: string) => {
    setSelected((prev) => (prev.includes(fn) ? prev.filter((x) => x !== fn) : [...prev, fn]));
  };

  const handleToggleSelectAll = () => {
    if (selected.length === backups.length) {
      setSelected([]);
    } else {
      setSelected(backups.map((b) => b.filename));
    }
  };

  // 请求删除
  const requestDelete = (files: string[]) => {
    setTargetToDelete(files);
    setDeleteConfirmOpen(true);
  };

  // 执行批量/单文件删除
  const handleConfirmDelete = async () => {
    if (targetToDelete.length === 0) return;
    setDeleting(true);
    try {
      const res = await backupApi.deleteBackups(targetToDelete);
      showToast(res.message || `已成功删除 ${targetToDelete.length} 个快照文件`, true);
      setSelected((prev) => prev.filter((fn) => !targetToDelete.includes(fn)));
      setDeleteConfirmOpen(false);
      onRefresh();
    } catch (e: any) {
      showToast(e.message || "删除备份失败", false);
    } finally {
      setDeleting(false);
    }
  };

  // 下载远端备份文件至本地
  const handleDownloadRemote = async (item: WebdavBackupItem) => {
    setDownloadingFile(item.filename);
    try {
      const res = await backupApi.downloadRemoteBackupBlob(item.filename);
      const blob = new Blob([res.data], { type: (res.headers["content-type"] as string) || "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast(`备份文件【${item.filename}】已开始下载`, true);
    } catch (e: any) {
      showToast(e.message || "从 WebDAV 下载备份失败", false);
    } finally {
      setDownloadingFile(null);
    }
  };

  // 打开恢复确认模态框
  const openRestoreModal = (item: WebdavBackupItem) => {
    setTargetRestoreFile(item);
    setRestoreSummary(null);
    setDecryptPwd(item.is_encrypted ? (config?.backup_encrypt_password || "") : "");
    setShowDecryptPwd(false);
    setRestoreModalOpen(true);
  };

  // 执行从远端恢复
  const handleExecuteRestore = async () => {
    if (!targetRestoreFile) return;
    setRestoring(true);
    try {
      const res = await backupApi.restoreBackup({
        filename: targetRestoreFile.filename,
        decrypt_password: decryptPwd || undefined,
      });
      showToast(res.message || "系统数据与基础配置已成功恢复！", true);
      setRestoreSummary(res.data);
    } catch (e: any) {
      showToast(e.message || "灾难恢复执行失败", false);
    } finally {
      setRestoring(false);
    }
  };

  const currentDbProfile = config?.current_db_profile;
  const targetInfo = targetRestoreFile ? parseBackupFileInfo(targetRestoreFile.filename) : null;
  const isCrossEngine =
    targetInfo &&
    currentDbProfile &&
    targetInfo.mode !== "unknown" &&
    targetInfo.mode !== currentDbProfile.db_mode;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
      {/* 头部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-gray-900">云端快照文件管理</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            共 {backups.length} 份
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
              onClick={() => requestDelete(selected)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>批量删除 ({selected.length})</span>
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            <span>刷新列表</span>
          </button>
        </div>
      </div>

      {/* 备份列表展示 */}
      {loading && backups.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500 mb-2" />
          <span>正在从 WebDAV 服务器拉取备份列表...</span>
        </div>
      ) : backups.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-400">
          <span>暂无云端备份文件。可前往“即时手动备份”生成第一份系统容灾快照。</span>
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
                <th className="py-2.5 px-2 w-28">源数据库模式</th>
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
                const info = parseBackupFileInfo(b.filename);
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
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${info.modeColor}`}>
                        {info.modeLabel}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {info.isFull ? (
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          全量系统快照
                        </span>
                      ) : (
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          纯数据快照
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
        title="确认删除云端备份文件？"
        message={`该操作将从 WebDAV 云盘中永久物理删除以下 ${targetToDelete.length} 个快照文件，且不可撤销：\n${targetToDelete.join("\n")}`}
        confirmText="确认物理删除"
        danger
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* 灾难恢复模态框 */}
      {restoreModalOpen && targetRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-600">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">系统灾难恢复确认</h3>
                <p className="mt-1 text-xs text-gray-500 break-all font-mono">
                  目标备份：{targetRestoreFile.filename}
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
                  {restoreSummary.current_runtime_mode && (
                    <p>• 目标数据库模式: <b>{restoreSummary.current_runtime_mode}</b></p>
                  )}
                  <div className="text-gray-700 pt-1">
                    <span className="font-semibold">🛡️ 安全回滚快照副本已留存：</span>
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
                {/* 跨模式检测提示 */}
                {isCrossEngine && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-xs text-purple-900 leading-relaxed space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ArrowRightLeft className="h-4 w-4 text-purple-700 shrink-0" />
                      <span>检测到跨数据库架构数据恢复</span>
                    </div>
                    <p className="text-[11px] text-purple-800">
                      • 该备份文件来源于：<b>{targetInfo?.modeLabel}</b> 模式<br />
                      • 当前系统运行模式：<b>{currentDbProfile?.mode_label}</b> 模式<br />
                      系统已就绪跨库架构自动转换与主键自增序列校准机制，恢复前将自动为现有系统留存 1:1 安全回滚快照。
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800 leading-relaxed space-y-1.5">
                  <p className="font-semibold flex items-center gap-1">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    四道防线与安全回滚保障：
                  </p>
                  <p className="text-[11px] text-amber-700">
                    1. 系统在执行替换前，会自动对当前主库生成 1:1 热回滚副本，并保留“一键撤销”应急快照。<br />
                    2. 若备份文件损坏或密码不正确，系统将阻断恢复流程，确保当前主库数据 100% 完好无损。
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
                      >
                        {showDecryptPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
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
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
                    disabled={restoring || (targetRestoreFile.is_encrypted && !decryptPwd)}
                    onClick={handleExecuteRestore}
                  >
                    {restoring ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>正在执行恢复与序列自愈...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>确认执行灾备恢复</span>
                      </>
                    )}
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
