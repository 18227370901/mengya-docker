/** 运行时数据库环境摘要 */
export interface DbProfile {
  engine: "sqlite" | "postgresql";
  db_mode: "sqlite" | "pg_shared" | "pg_dedicated";
  mode_label: string;
  db_name: string;
  is_postgres: boolean;
  summary: string;
}

/** WebDAV 配置数据结构 */
export interface WebdavConfig {
  webdav_url: string;
  webdav_username: string;
  webdav_password?: string;
  backup_encrypt_password?: string;
  backup_path: string;
  backup_subdir: string;
  config_alias: string;
  has_webdav_password: boolean;
  has_encrypt_password: boolean;
  max_rollback_copies?: number;
  last_backup_time: string | null;
  last_status: string;
  has_pyzipper: boolean;
  current_db_profile?: DbProfile;
}

/** WebDAV 远端备份文件项 */
export interface WebdavBackupItem {
  filename: string;
  name: string;
  href: string;
  size: number;
  size_human: string;
  last_modified: string;
  modified_time: string;
  is_encrypted: boolean;
  is_full: boolean;
}

/** 定时备份任务项 */
export interface ScheduledTaskItem {
  id: number;
  name: string;
  cron_expr: string;
  is_enabled: boolean;
  encrypt_enabled: boolean;
  task_type: "full_backup" | "db_backup" | "custom";
  last_run_time: string | null;
  last_run_status: string;
  created_at: string;
}

/** 定时任务历史执行日志 */
export interface TaskExecutionLog {
  id: number;
  start_time: string;
  end_time: string;
  status: string;
  output_log: string;
  executed_by: string;
}

/** 恢复执行结果摘要 */
export interface RestoreSummary {
  restored_at: string;
  operator: string;
  rollback_snapshot: string;
  rollback_snapshot_path?: string;
  tables_restored: number;
  total_records_restored: number;
  current_runtime_engine?: string;
  current_runtime_mode?: string;
  manifest?: Record<string, any>;
  config_snapshot?: Record<string, any>;
}

/** 安全回滚快照单项 */
export interface RollbackSnapshotItem {
  filename: string;
  path: string;
  size: number;
  size_human: string;
  modified_time: string;
}

/** 最近一次覆盖前留存的应急元数据 */
export interface LatestRevertMeta {
  created_at: string;
  timestamp: number;
  operator: string;
  incoming_filename: string;
  db_mode: string;
  db_engine: string;
  snapshot_filename: string;
  latest_file: string;
  total_tables: number;
  total_records: number;
}

/** 安全回滚快照汇总 */
export interface RollbackInfo {
  count: number;
  total_size: number;
  total_size_human: string;
  max_copies: number;
  snapshots: RollbackSnapshotItem[];
  latest_revert_available?: boolean;
  latest_revert_meta?: LatestRevertMeta | null;
}
