import api from "./client";
import type { WebdavConfig, WebdavBackupItem, ScheduledTaskItem, TaskExecutionLog, RollbackInfo } from "@/types/backup";

export const backupApi = {
  /** 获取 WebDAV 配置与当前系统数据库运行模式 */
  getConfig: () => api.get<{ code: number; message: string; data: WebdavConfig }>("/admin/backups/config/").then((r) => r.data.data),

  /** 保存 WebDAV 配置 */
  saveConfig: (payload: Partial<WebdavConfig> & { webdav_password?: string; clear_encrypt_password?: boolean; backup_encrypt_password?: string }) =>
    api.post<{ code: number; message: string; data: WebdavConfig }>("/admin/backups/config/", payload).then((r) => r.data),

  /** 测试连接 */
  testConnection: (payload: { webdav_url: string; webdav_username: string; webdav_password?: string; backup_path?: string }) =>
    api.post<{ code: number; message: string; data: { connected: boolean } }>("/admin/backups/test/", payload).then((r) => r.data),

  /** 获取远端 WebDAV 备份列表 */
  listBackups: () =>
    api.get<{ code: number; message: string; data: { configured: boolean; backups: WebdavBackupItem[] } }>("/admin/backups/list/").then((r) => r.data.data),

  /** 手动触发即时备份并上传 WebDAV */
  uploadBackup: (payload: { backup_type: "full_backup" | "db_backup"; use_encrypt: boolean; manual_encrypt_password?: string }) =>
    api.post<{ code: number; message: string; data: any }>("/admin/backups/upload/", payload).then((r) => r.data),

  /** 从 WebDAV 远端备份还原系统 */
  restoreBackup: (payload: { filename: string; decrypt_password?: string }) =>
    api.post<{ code: number; message: string; data: any }>("/admin/backups/restore/", payload).then((r) => r.data),

  /** 删除远端备份文件（支持批量） */
  deleteBackups: (filenames: string[]) =>
    api.post<{ code: number; message: string; data: { all_success: boolean; results: any[] } }>("/admin/backups/delete/", { filenames }).then((r) => r.data),

  /** 获取离线备份下载直链 */
  getDownloadUrl: (type: "full" | "db", password?: string) => {
    let url = `/api/admin/backups/download-local/?type=${type}`;
    if (password) url += `&password=${encodeURIComponent(password)}`;
    return url;
  },

  /** 从 WebDAV 远端下载指定备份文件至本地（Blob 方式，携带 JWT） */
  downloadRemoteBackupBlob: (filename: string) => {
    const url = `/admin/backups/download-remote/?filename=${encodeURIComponent(filename)}`;
    return api.get(url, { responseType: "blob", timeout: 180000 });
  },

  /** 下载本地快照包（Blob 方式，携带 JWT） */
  downloadLocalBackupBlob: (type: "full" | "db", password?: string) => {
    let url = `/admin/backups/download-local/?type=${type}`;
    if (password) url += `&password=${encodeURIComponent(password)}`;
    return api.get(url, { responseType: "blob", timeout: 180000 });
  },

  /** 上传本地备份文件并执行安全恢复 */
  uploadLocalBackup: (formData: FormData) =>
    api.post<{ code: number; message: string; data: any }>("/admin/backups/upload-local/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180000,
    }).then((r) => r.data),

  /** 定时任务列表 */
  getTasks: () => api.get<{ code: number; message: string; data: ScheduledTaskItem[] }>("/admin/backups/tasks/").then((r) => r.data.data),

  /** 创建定时任务 */
  createTask: (payload: { name: string; cron_expr: string; task_type: string; encrypt_enabled: boolean; is_enabled: boolean }) =>
    api.post<{ code: number; message: string; data: ScheduledTaskItem }>("/admin/backups/tasks/", payload).then((r) => r.data),

  /** 修改定时任务 */
  updateTask: (id: number, payload: Partial<ScheduledTaskItem>) =>
    api.put<{ code: number; message: string; data: any }>(`/admin/backups/tasks/${id}/`, payload).then((r) => r.data),

  /** 删除定时任务 */
  deleteTask: (id: number) => api.delete<{ code: number; message: string; data: any }>(`/admin/backups/tasks/${id}/`).then((r) => r.data),

  /** 启停定时任务 */
  toggleTask: (id: number) => api.post<{ code: number; message: string; data: { id: number; is_enabled: boolean } }>(`/admin/backups/tasks/${id}/toggle/`).then((r) => r.data),

  /** 立即运行定时任务 */
  runTask: (id: number) => api.post<{ code: number; message: string; data: any }>(`/admin/backups/tasks/${id}/run/`).then((r) => r.data),

  /** 获取任务执行历史日志 */
  getTaskLogs: (id: number) => api.get<{ code: number; message: string; data: TaskExecutionLog[] }>(`/admin/backups/tasks/${id}/logs/`).then((r) => r.data.data),

  /** 获取 logs/ 目录下的安全回滚快照列表与汇总统计 */
  getRollbacks: () =>
    api.get<{ code: number; message: string; data: RollbackInfo }>("/admin/backups/rollbacks/").then((r) => r.data.data),

  /** 手动修剪或清理历史回滚快照（保留最新 N 份） */
  cleanRollbacks: (keepCount?: number) =>
    api.post<{ code: number; message: string; data: RollbackInfo }>("/admin/backups/rollbacks/clean/", { keep_count: keepCount }).then((r) => r.data),

  /** 一键应急撤销回退接口：快速回退至最近一次覆盖导入前的状态 */
  revertLatest: () =>
    api.post<{ code: number; message: string; data: any }>("/admin/backups/rollbacks/revert-latest/").then((r) => r.data),
};
