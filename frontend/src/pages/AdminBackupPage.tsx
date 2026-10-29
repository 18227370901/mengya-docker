import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Cloud, ShieldCheck, Clock, Layers, UploadCloud,
  RotateCcw, Upload, CheckCircle2, AlertCircle, AlertTriangle, Loader2
} from "lucide-react";

import BackupConfigCard from "@/components/backup/BackupConfigCard";
import ManualBackupCard from "@/components/backup/ManualBackupCard";
import RemoteBackupListCard from "@/components/backup/RemoteBackupListCard";
import LocalRestoreCard from "@/components/backup/LocalRestoreCard";
import ScheduledTasksCard from "@/components/backup/ScheduledTasksCard";

import { backupApi } from "@/api/backup";
import type { WebdavConfig, WebdavBackupItem, ScheduledTaskItem, RollbackInfo } from "@/types/backup";

type TabKey = "webdav" | "manual" | "remote" | "local_restore" | "tasks";

export default function AdminBackupPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("webdav");

  // 数据状态
  const [config, setConfig] = useState<WebdavConfig | null>(null);
  const [backups, setBackups] = useState<WebdavBackupItem[]>([]);
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>([]);
  const [rollbackInfo, setRollbackInfo] = useState<RollbackInfo | null>(null);

  // 加载状态
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [reverting, setReverting] = useState(false);

  // 轻提示 (Toast)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (msg: string, ok = true) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  // 数据加载函数
  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const data = await backupApi.getConfig();
      setConfig(data);
    } catch (e: any) {
      showToast(e.message || "加载 WebDAV 配置失败", false);
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const data = await backupApi.listBackups();
      setBackups(data.backups || []);
    } catch (e: any) {
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  };

  const fetchTasks = async () => {
    setLoadingTasks(true);
    try {
      const data = await backupApi.getTasks();
      setTasks(data || []);
    } catch (e: any) {
      showToast(e.message || "加载定时任务失败", false);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchRollbacks = async () => {
    try {
      const data = await backupApi.getRollbacks();
      setRollbackInfo(data);
    } catch (e) {
      // 容错处理
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchBackups();
    fetchTasks();
    fetchRollbacks();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // 执行一键应急撤销回滚
  const handleEmergencyRevert = async () => {
    if (!rollbackInfo?.latest_revert_meta) return;
    const meta = rollbackInfo.latest_revert_meta;
    const confirmed = window.confirm(
      `【⚠️ 紧急撤销确认】\n\n即将将当前系统数据库秒级回退至本次数据覆盖前状态：\n` +
      `• 覆盖发生时间: ${meta.created_at}\n` +
      `• 操作人: ${meta.operator}\n` +
      `• 原库记录: ${meta.total_tables} 张表，共 ${meta.total_records} 条数据\n\n` +
      `确认立即撤销并恢复原库数据吗？`
    );
    if (!confirmed) return;

    setReverting(true);
    try {
      const res = await backupApi.revertLatest();
      showToast(res.message || "已成功恢复至覆盖前状态！", true);
      fetchConfig();
      fetchBackups();
      fetchRollbacks();
    } catch (e: any) {
      showToast(e.message || "一键撤销恢复失败", false);
    } finally {
      setReverting(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "webdav", label: "WebDAV 配置", icon: Cloud },
    { key: "manual", label: "即时手动备份", icon: UploadCloud },
    { key: "remote", label: `云端快照 (${backups.length})`, icon: RotateCcw },
    { key: "local_restore", label: "本地急救恢复", icon: Upload },
    { key: "tasks", label: `定时任务 (${tasks.length})`, icon: Clock },
  ];

  const dbProfile = config?.current_db_profile;

  return (
    <div className="space-y-6 pb-12">
      {/* 顶部居中轻提示 */}
      {toast && (
        <div className="fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all">
          <div
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-lg backdrop-blur-md ${
              toast.ok
                ? "bg-emerald-600/90 text-white shadow-emerald-600/20"
                : "bg-red-600/90 text-white shadow-red-600/20"
            }`}
          >
            {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* 顶部导航与标题 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition"
            onClick={() => navigate("/profile")}
            title="返回个人中心"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">WebDAV 与系统容灾备份</h1>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-600">
                v1.89 全数据库容灾
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              支持坚果云/群晖/Nextcloud/Alist 热原子备份、跨模式双向互导、AES-256 加密与安全回滚保护式还原
            </p>
          </div>
        </div>

        {/* 数据库运行模式动态自适应状态 Badge */}
        <div className="flex items-center gap-2 text-xs">
          {dbProfile ? (
            <span
              className={`rounded-full px-3 py-1 font-medium flex items-center gap-1.5 shadow-sm border ${
                dbProfile.db_mode === "pg_dedicated"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : dbProfile.db_mode === "pg_shared"
                  ? "bg-purple-50 text-purple-800 border-purple-200"
                  : "bg-sky-50 text-sky-800 border-sky-200"
              }`}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>{dbProfile.mode_label} | 跨引擎容灾已就绪</span>
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 font-medium flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>系统容灾与回滚镜像就绪</span>
            </span>
          )}
        </div>
      </div>

      {/* 【一键应急撤销横幅】：当检测到存在最近一次覆盖前留存的快照时醒目显示 */}
      {rollbackInfo?.latest_revert_available && rollbackInfo.latest_revert_meta && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500 p-2 text-white shadow-sm mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900">数据覆盖防线已激活（支持秒级一键回退）</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  原库已暂存
                </span>
              </div>
              <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                系统于 <span className="font-semibold">{rollbackInfo.latest_revert_meta.created_at}</span> 执行了数据覆盖导入（操作人：{rollbackInfo.latest_revert_meta.operator}）。覆盖前的原库完整保留为应急镜像（共 {rollbackInfo.latest_revert_meta.total_tables} 张表、{rollbackInfo.latest_revert_meta.total_records} 条数据）。
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={reverting}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-amber-700 hover:to-orange-700 transition disabled:opacity-50"
            onClick={handleEmergencyRevert}
          >
            {reverting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在一键撤销中...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                <span>一键撤销 / 恢复至本次覆盖前状态</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 分页标签栏 */}
      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-100"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 选项卡内容区 */}
      <div>
        {activeTab === "webdav" && (
          <BackupConfigCard
            config={config}
            onRefresh={() => {
              fetchConfig();
              fetchBackups();
              fetchRollbacks();
            }}
            showToast={showToast}
          />
        )}

        {activeTab === "manual" && (
          <ManualBackupCard
            config={config}
            onBackupSuccess={() => {
              fetchBackups();
              fetchConfig();
              fetchRollbacks();
            }}
            showToast={showToast}
          />
        )}

        {activeTab === "remote" && (
          <RemoteBackupListCard
            backups={backups}
            config={config}
            loading={loadingBackups}
            onRefresh={() => {
              fetchBackups();
              fetchRollbacks();
            }}
            showToast={showToast}
          />
        )}

        {activeTab === "local_restore" && (
          <LocalRestoreCard
            showToast={(msg, ok) => {
              showToast(msg, ok);
              fetchRollbacks();
              fetchConfig();
            }}
          />
        )}

        {activeTab === "tasks" && (
          <ScheduledTasksCard
            tasks={tasks}
            loading={loadingTasks}
            onRefresh={() => {
              fetchTasks();
              fetchRollbacks();
            }}
            showToast={showToast}
          />
        )}
      </div>
    </div>
  );
}
