import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Cloud, ShieldCheck, Clock, Layers, UploadCloud,
  RotateCcw, Upload, CheckCircle2, XCircle, AlertCircle
} from "lucide-react";

import BackupConfigCard from "@/components/backup/BackupConfigCard";
import ManualBackupCard from "@/components/backup/ManualBackupCard";
import RemoteBackupListCard from "@/components/backup/RemoteBackupListCard";
import LocalRestoreCard from "@/components/backup/LocalRestoreCard";
import ScheduledTasksCard from "@/components/backup/ScheduledTasksCard";

import { backupApi } from "@/api/backup";
import type { WebdavConfig, WebdavBackupItem, ScheduledTaskItem } from "@/types/backup";

type TabKey = "webdav" | "manual" | "remote" | "local_restore" | "tasks";

export default function AdminBackupPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("webdav");

  // 数据状态
  const [config, setConfig] = useState<WebdavConfig | null>(null);
  const [backups, setBackups] = useState<WebdavBackupItem[]>([]);
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>([]);

  // 加载状态
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

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
      // 若尚未配置 WebDAV 则是正常提示
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

  useEffect(() => {
    fetchConfig();
    fetchBackups();
    fetchTasks();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "webdav", label: "WebDAV 配置", icon: Cloud },
    { key: "manual", label: "即时手动备份", icon: UploadCloud },
    { key: "remote", label: `云端快照 (${backups.length})`, icon: RotateCcw },
    { key: "local_restore", label: "本地急救恢复", icon: Upload },
    { key: "tasks", label: `定时任务 (${tasks.length})`, icon: Clock },
  ];

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
                v1.86 系统级容灾
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              支持坚果云/群晖/Nextcloud/Alist 热原子备份、全量37+表数据快照、AES-256 加密与安全回滚保护式还原
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 font-medium flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>SQLite 热原子备份 + 回滚镜像就绪</span>
          </span>
        </div>
      </div>

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
            }}
            showToast={showToast}
          />
        )}

        {activeTab === "remote" && (
          <RemoteBackupListCard
            backups={backups}
            config={config}
            loading={loadingBackups}
            onRefresh={fetchBackups}
            showToast={showToast}
          />
        )}

        {activeTab === "local_restore" && (
          <LocalRestoreCard showToast={showToast} />
        )}

        {activeTab === "tasks" && (
          <ScheduledTasksCard
            tasks={tasks}
            loading={loadingTasks}
            onRefresh={fetchTasks}
            showToast={showToast}
          />
        )}
      </div>
    </div>
  );
}
