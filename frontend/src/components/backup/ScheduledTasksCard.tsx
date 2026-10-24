import React, { useState } from "react";
import {
  Clock, Plus, Play, ListFilter, Trash2, Edit2, CheckCircle2,
  XCircle, Loader2, FileText, ToggleLeft, ToggleRight, AlertCircle, Shield
} from "lucide-react";
import { backupApi } from "@/api/backup";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { ScheduledTaskItem, TaskExecutionLog } from "@/types/backup";

interface Props {
  tasks: ScheduledTaskItem[];
  loading: boolean;
  onRefresh: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

const CRON_PRESETS = [
  { label: "每日凌晨 02:00", expr: "0 2 * * *" },
  { label: "每日中午 12:00", expr: "0 12 * * *" },
  { label: "每周日凌晨 03:00", expr: "0 3 * * 0" },
  { label: "每 6 小时一次", expr: "0 */6 * * *" },
];

export default function ScheduledTasksCard({ tasks, loading, onRefresh, showToast }: Props) {
  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTaskItem | null>(null);
  const [form, setForm] = useState({
    name: "每日凌晨全量备份",
    cron_expr: "0 2 * * *",
    task_type: "full_backup" as "full_backup" | "db_backup",
    encrypt_enabled: false,
    is_enabled: true,
  });
  const [saving, setSaving] = useState(false);

  // 删除确认
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 运行中状态
  const [runningId, setRunningId] = useState<number | null>(null);

  // 日志模态框
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logTaskName, setLogTaskName] = useState("");
  const [logs, setLogs] = useState<TaskExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const openCreateModal = () => {
    setEditingTask(null);
    setForm({
      name: "每日系统全量备份",
      cron_expr: "0 2 * * *",
      task_type: "full_backup",
      encrypt_enabled: false,
      is_enabled: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (task: ScheduledTaskItem) => {
    setEditingTask(task);
    setForm({
      name: task.name,
      cron_expr: task.cron_expr,
      task_type: task.task_type === "db_backup" ? "db_backup" : "full_backup",
      encrypt_enabled: task.encrypt_enabled,
      is_enabled: task.is_enabled,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast("任务名称不能为空", false);
      return;
    }
    if (!form.cron_expr.trim() || form.cron_expr.trim().split(/\s+/).length !== 5) {
      showToast("请输入标准的 5 位 Cron 表达式 (分 时 日 月 周)", false);
      return;
    }

    setSaving(true);
    try {
      if (editingTask) {
        await backupApi.updateTask(editingTask.id, form);
        showToast("定时任务修改成功！", true);
      } else {
        await backupApi.createTask(form);
        showToast("定时任务创建成功！", true);
      }
      setModalOpen(false);
      onRefresh();
    } catch (e: any) {
      showToast(e.message || "保存定时任务失败", false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (task: ScheduledTaskItem) => {
    try {
      const res = await backupApi.toggleTask(task.id);
      showToast(res.message || "任务状态已更新", true);
      onRefresh();
    } catch (e: any) {
      showToast(e.message || "更新状态失败", false);
    }
  };

  const handleRun = async (task: ScheduledTaskItem) => {
    setRunningId(task.id);
    try {
      const res = await backupApi.runTask(task.id);
      showToast(res.message || "任务执行完毕", true);
      onRefresh();
    } catch (e: any) {
      showToast(e.message || "执行定时任务失败", false);
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await backupApi.deleteTask(deleteId);
      showToast(res.message || "任务已删除", true);
      setDeleteId(null);
      onRefresh();
    } catch (e: any) {
      showToast(e.message || "删除任务失败", false);
    } finally {
      setDeleting(false);
    }
  };

  const handleViewLogs = async (task: ScheduledTaskItem) => {
    setLogTaskName(task.name);
    setLogModalOpen(true);
    setLogsLoading(true);
    try {
      const data = await backupApi.getTaskLogs(task.id);
      setLogs(data);
    } catch (e: any) {
      showToast(e.message || "加载历史日志失败", false);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">定时自动备份调度器</h3>
            <p className="text-xs text-gray-400">基于纯轻量守护线程运行，按周期自动生成全量快照并同步云盘</p>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition shadow-sm"
          onClick={openCreateModal}
        >
          <Plus className="h-3.5 w-3.5" /> 新建定时备份
        </button>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="py-8 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-teal-500" />
          正在加载定时任务列表...
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-xs text-gray-400">
          暂无定时备份任务。点击右上角「新建定时备份」以创建每日自动灾备计划。
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {tasks.map((t) => (
            <div key={t.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800">{t.name}</span>
                  <span className="font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                    {t.cron_expr}
                  </span>
                  {t.task_type === "full_backup" ? (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">全量快照</span>
                  ) : (
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">纯数据库</span>
                  )}
                  {t.encrypt_enabled && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">AES-256</span>
                  )}
                </div>

                <div className="text-[11px] text-gray-400 flex items-center gap-2">
                  <span>上次执行: {t.last_run_time || "尚未执行"}</span>
                  {t.last_run_status && (
                    <span className={t.last_run_status.includes("成功") ? "text-emerald-600 font-medium" : "text-red-500"}>
                      • {t.last_run_status}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    t.is_enabled
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  onClick={() => handleToggle(t)}
                >
                  {t.is_enabled ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                  <span>{t.is_enabled ? "已启用" : "已禁用"}</span>
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-1 disabled:opacity-50"
                  disabled={runningId === t.id}
                  onClick={() => handleRun(t)}
                >
                  {runningId === t.id ? <Loader2 className="h-3 w-3 animate-spin text-teal-600" /> : <Play className="h-3 w-3 text-teal-600" />}
                  <span>立即执行</span>
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 transition"
                  title="查看执行历史"
                  onClick={() => handleViewLogs(t)}
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 transition"
                  title="编辑任务"
                  onClick={() => openEditModal(t)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-gray-200 p-1.5 text-red-500 hover:bg-red-50 transition"
                  title="删除任务"
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建 / 编辑任务弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="card w-full max-w-md space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2.5">
              {editingTask ? "编辑定时备份任务" : "新建定时备份任务"}
            </h3>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">任务名称</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">备份数据范围</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-xl border p-2 text-center transition ${
                      form.task_type === "full_backup" ? "border-teal-500 bg-teal-50/50 text-teal-800 font-bold" : "border-gray-200 text-gray-600"
                    }`}
                    onClick={() => setForm({ ...form, task_type: "full_backup" })}
                  >
                    全量系统快照 (.zip)
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border p-2 text-center transition ${
                      form.task_type === "db_backup" ? "border-teal-500 bg-teal-50/50 text-teal-800 font-bold" : "border-gray-200 text-gray-600"
                    }`}
                    onClick={() => setForm({ ...form, task_type: "db_backup" })}
                  >
                    纯数据库 (.db)
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-gray-700">Cron 调度表达式 (分 时 日 月 周)</label>
                </div>
                <input
                  type="text"
                  className="w-full font-mono rounded-xl border border-gray-200 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
                  placeholder="0 2 * * *"
                  value={form.cron_expr}
                  onChange={(e) => setForm({ ...form, cron_expr: e.target.value })}
                  required
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.expr}
                      type="button"
                      className="rounded bg-gray-100 hover:bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600 transition"
                      onClick={() => setForm({ ...form, cron_expr: p.expr })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-teal-600 focus:ring-teal-500"
                    checked={form.encrypt_enabled}
                    onChange={(e) => setForm({ ...form, encrypt_enabled: e.target.checked })}
                  />
                  <span>启用 AES-256 加密</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-teal-600 focus:ring-teal-500"
                    checked={form.is_enabled}
                    onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                  />
                  <span>创建后立即启用</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 px-3.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  onClick={() => setModalOpen(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-xl bg-teal-600 px-4 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  <span>保存任务</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除任务确认框 */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        title="确认删除定时任务"
        message="您确定要删除该定时备份任务吗？删除后该调度计划将彻底停止。"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* 历史执行日志模态框 */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="card w-full max-w-2xl space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="font-bold text-gray-800 text-xs">
                「{logTaskName}」最近执行历史日志
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 text-xs"
                onClick={() => setLogModalOpen(false)}
              >
                关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 text-xs">
              {logsLoading ? (
                <div className="py-8 text-center text-gray-400">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-teal-500" />
                  加载日志中...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-8 text-center text-gray-400">暂无该任务的执行历史记录</div>
              ) : (
                <div className="space-y-2.5">
                  {logs.map((l) => (
                    <div key={l.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 font-bold ${
                              l.status === "success"
                                ? "bg-emerald-100 text-emerald-800"
                                : l.status === "running"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {l.status}
                          </span>
                          <span className="text-gray-600">执行者: {l.executed_by}</span>
                        </div>
                        <span className="text-gray-400">{l.start_time}</span>
                      </div>
                      <p className="font-mono text-[11px] text-gray-700 bg-white p-2 rounded border border-gray-100 break-all">
                        {l.output_log || "无详细日志输出"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
