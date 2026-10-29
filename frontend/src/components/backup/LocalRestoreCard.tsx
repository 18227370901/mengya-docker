import React, { useState } from "react";
import { Upload, ShieldAlert, Lock, Loader2, CheckCircle2, Eye, EyeOff, Folder, Trash2, HardDrive, RefreshCw } from "lucide-react";
import type { RollbackInfo } from "@/types/backup";
import { backupApi } from "@/api/backup";
import type { RestoreSummary } from "@/types/backup";

interface Props {
  showToast: (msg: string, ok?: boolean) => void;
}

export default function LocalRestoreCard({ showToast }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decryptPwd, setDecryptPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [rollbackInfo, setRollbackInfo] = useState<RollbackInfo | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const loadRollbacks = async () => {
    try {
      const data = await backupApi.getRollbacks();
      setRollbackInfo(data);
    } catch {}
  };

  React.useEffect(() => {
    loadRollbacks();
  }, []);

  const handleCleanRollbacks = async () => {
    setCleaning(true);
    try {
      const res = await backupApi.cleanRollbacks();
      showToast(res.message || "历史快照清理完成", true);
      setRollbackInfo(res.data);
    } catch (e: any) {
      showToast(e.message || "清理失败", false);
    } finally {
      setCleaning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setSummary(null);
    }
  };

  const handleUploadAndRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast("请先选择待恢复的备份文件 (.zip 或 .db)", false);
      return;
    }

    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append("backup_file", selectedFile);
      if (decryptPwd.trim()) {
        formData.append("decrypt_password", decryptPwd.trim());
      }

      const res = await backupApi.uploadLocalBackup(formData);
      showToast(res.message || "本地备份文件恢复成功！", true);
      setSummary(res.data);
      loadRollbacks();
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || "恢复失败，请核对解密密码或文件是否损坏", false);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Upload className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800">本地备份文件离线急救恢复</h3>
          <p className="text-xs text-gray-400">
            当 WebDAV 网盘不可用或迁移至全新服务器环境时，可直接上传本地保存的 .zip 或 .db 备份文件执行还原
          </p>
        </div>
      </div>

      {summary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>本地快照文件验证通过，系统数据与基础配置已成功恢复！</span>
          </div>
          <div className="text-[11px] text-emerald-700 space-y-1">
            <p>• 恢复数据表总数: <b>{summary.tables_restored}</b> 张表</p>
            <p>• 恢复业务记录总计: <b>{summary.total_records_restored}</b> 条</p>
            <div className="text-gray-700 pt-1">
              <span className="font-semibold">🛡️ 安全回滚快照已保存至：</span>
              <div className="mt-1 font-mono text-[11px] bg-white p-2 rounded-lg border border-emerald-200 text-gray-800 break-all select-all">
                {summary.rollback_snapshot_path || `logs/${summary.rollback_snapshot}`}
              </div>
            </div>
            <p className="text-[10px] text-gray-500 pt-1">
              💡 提示：该副本是系统在替换前对当前主库生成的物理原子快照，可在系统根目录下的 <code>logs/</code> 目录随时查验。
            </p>
          </div>
          <div className="pt-2 text-right">
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              onClick={() => window.location.reload()}
            >
              刷新系统页面以加载恢复数据
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleUploadAndRestore} className="space-y-4">
          <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center hover:border-indigo-400 transition">
            <input
              type="file"
              id="localBackupInput"
              className="hidden"
              accept=".zip,.db,.sqlite,.sqlite3"
              onChange={handleFileChange}
            />
            <label htmlFor="localBackupInput" className="cursor-pointer block space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-xs text-gray-700 font-medium">
                {selectedFile ? (
                  <span className="text-indigo-600 font-bold">{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
                ) : (
                  <span>点击选择电脑中的系统备份文件 (.zip 或 .db)</span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">支持跨引擎全量/纯数据快照包 (.zip) 或历史 SQLite 原生文件 (.db)，系统自动执行格式转换与自增序列重校</p>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              解密密码 <span className="text-gray-400 font-normal">(若上传的备份包已加密请输入，未加密请留空)</span>
            </label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-10 text-xs focus:border-indigo-500 focus:outline-none"
                placeholder="请输入备份包解密密码（可选）"
                value={decryptPwd}
                onChange={(e) => setDecryptPwd(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPwd(!showPwd)}
              >
                {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* 实时安全快照状态与管理 */}
          {rollbackInfo && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-blue-900">
                <HardDrive className="h-4 w-4 text-blue-600 shrink-0" />
                <span>
                  当前安全回滚快照: <b>{rollbackInfo.count}</b> 份（总计 <b>{rollbackInfo.total_size_human}</b>，上限 <b>{rollbackInfo.max_copies}</b> 份）
                </span>
              </div>
              <div className="flex items-center gap-2">
                {rollbackInfo.count > rollbackInfo.max_copies && (
                  <span className="text-[10px] text-amber-600 font-bold">超出上限，系统将在下次恢复时自动修剪</span>
                )}
                <button
                  type="button"
                  className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 transition flex items-center gap-1 disabled:opacity-50"
                  disabled={cleaning || rollbackInfo.count <= 1}
                  onClick={handleCleanRollbacks}
                  title="自动淘汰超出上限的最旧副本"
                >
                  {cleaning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-blue-600" />}
                  <span>立即修剪冗余快照</span>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-800 space-y-1.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">安全防护机制：</span>
                系统在替换数据库前会自动生成安全回滚副本 <code className="bg-white/70 px-1 py-0.5 rounded font-mono">db_rollback_pre_restore_*.db</code>，若备份损坏或解密失败将即刻熔断中止，零数据丢失风险。
              </div>
            </div>
            <div className="pl-6 text-[10px] text-amber-700 leading-relaxed">
              📍 <b>存放位置说明</b>：副本文件保存在本项目根目录下的 <code className="bg-white/70 px-1 rounded font-mono">logs/</code> 文件夹中。
              若在 Windows 资源管理器中未看到，系因 <code className="bg-white/70 px-1 rounded font-mono">.local</code> 在 Windows 下默认是隐藏目录（请在资源管理器「查看」中勾选「隐藏的项目」），且在 VS Code 等编辑器中因 <code className="bg-white/70 px-1 rounded font-mono">.gitignore</code> 规则会被默认隐藏。
            </div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2 text-xs font-medium text-white hover:bg-amber-700 transition disabled:opacity-60 shadow-sm"
              disabled={restoring || !selectedFile}
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {restoring ? "校验并恢复中..." : "上传并开始恢复系统"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
