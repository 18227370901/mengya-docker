# -*- coding: utf-8 -*-
"""
萌芽系统备份与灾难恢复核心服务 (Backup & Disaster Recovery Service)
- 提供 SQLite 在线热热原子备份 (通过 sqlite3.backup API，零锁冲突、零 WAL 损坏风险)
- 提供全量系统快照打包 (含全部25+数据表、系统基础配置、data/ 缓存、media/ 附件及 manifest.json 校验元数据)
- 提供灾备一键恢复与安全回滚保障 (恢复前强制生成 logs/db_rollback_pre_restore_*.db 回滚快照)
- 提供纯标准库轻量 Cron 表达式解析与定时自动备份调度器
"""

import os
import sys
import json
import time
import shutil
import hashlib
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import connections

from apps.core.models.backup import BackupConfig, ScheduledBackupTask, ScheduledTaskExecutionLog
from apps.core.services import webdav_utils

# 基础路径定义
BASE_DIR = Path(settings.BASE_DIR)
DATA_DIR = BASE_DIR / "data"
MEDIA_DIR = BASE_DIR / "media"
LOGS_DIR = BASE_DIR / "logs"

# 全局守护线程状态与锁
_scheduler_thread = None
_scheduler_running = False
_scheduler_lock = threading.Lock()


def _get_live_db_path() -> str:
    """获取当前正在运行的 SQLite 数据库绝对路径"""
    default_db = settings.DATABASES.get("default", {})
    name = default_db.get("NAME")
    return str(Path(name).resolve())


def _calc_file_sha256(filepath: str) -> str:
    """计算文件的 SHA-256 校验和"""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def create_database_snapshot(output_path: str) -> tuple[bool, str]:
    """
    使用 sqlite3.backup() API 在线热备份数据库。
    不直接拷贝文件，彻底杜绝 WAL 缓存未落盘导致的数据不一致或数据库锁死。
    """
    live_db = _get_live_db_path()
    if not os.path.exists(live_db):
        return False, f"主数据库文件不存在: {live_db}"

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    try:
        src_conn = sqlite3.connect(live_db, timeout=20)
        dst_conn = sqlite3.connect(output_path)
        src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()
        return True, output_path
    except Exception as e:
        return False, f"创建数据库热快照异常: {str(e)}"


def get_database_stats(db_path: str) -> dict:
    """读取指定 SQLite 数据库各表行数统计"""
    stats = {}
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [r[0] for r in cur.fetchall()]
        for t in tables:
            try:
                cur.execute(f"SELECT COUNT(1) FROM [{t}]")
                stats[t] = cur.fetchone()[0]
            except Exception:
                pass
        conn.close()
    except Exception:
        pass
    return stats


def create_full_snapshot_package(
    output_zip_path: str,
    encrypt_password: str = None,
    creator_name: str = "admin",
) -> tuple[bool, str, dict]:
    """
    创建系统全量系统快照打包 (.zip)：
    1. 生成 SQLite 数据库热原子快照 (database/mengya.db)
    2. 收集 data/ (如 holiday_cache.json) 与 media/ 静态持久化文件
    3. 生成包含版本、表行数、哈希校验的 manifest.json 元数据清单
    4. 压缩打包（若指定密码则使用 AES-256 加密）
    返回: (success: bool, zip_path_or_err: str, metadata: dict)
    """
    temp_dir = Path(settings.BASE_DIR) / ".temp" / f"pkg_{int(time.time() * 1000)}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_db_path = temp_dir / "mengya.db"

    try:
        # 1. 抓取数据库原子快照
        ok, msg = create_database_snapshot(str(temp_db_path))
        if not ok:
            return False, f"导出数据库快照失败: {msg}", {}

        # 2. 统计数据表
        stats = get_database_stats(str(temp_db_path))
        db_sha256 = _calc_file_sha256(str(temp_db_path))

        # 3. 准备系统基础配置快照导出 config_snapshot.json (涵盖 SystemSetting 与服务参数)
        config_snapshot = {}
        try:
            from apps.core.models.system import SystemSetting
            sys_setting = SystemSetting.get_settings()
            config_snapshot = {
                "version": "v1.86",
                "app_name": "mengya-local",
                "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "system_settings": {
                    "registration_mode": sys_setting.registration_mode,
                    "login_captcha_threshold": sys_setting.login_captcha_threshold,
                    "login_freeze_threshold": sys_setting.login_freeze_threshold,
                    "login_lock_seconds": sys_setting.login_lock_seconds,
                    "login_lock_minutes": sys_setting.login_lock_minutes,
                    "forgot_password_max_attempts": sys_setting.forgot_password_max_attempts,
                    "admin_session_timeout_minutes": sys_setting.admin_session_timeout_minutes,
                    "audit_retention_days": sys_setting.audit_retention_days,
                    "daily_tip_display_count": sys_setting.daily_tip_display_count,
                    "default_user_permissions": sys_setting.default_user_permissions,
                    "external_api_config": sys_setting.external_api_config,
                },
                "environment_summary": {
                    "database_engine": settings.DATABASES.get("default", {}).get("ENGINE", "django.db.backends.sqlite3"),
                    "timezone": getattr(settings, "TIME_ZONE", "Asia/Shanghai"),
                    "media_root": str(MEDIA_DIR),
                }
            }
        except Exception as ce:
            config_snapshot = {"error": str(ce)}

        config_snapshot_path = temp_dir / "config_snapshot.json"
        with open(config_snapshot_path, "w", encoding="utf-8") as f:
            json.dump(config_snapshot, f, ensure_ascii=False, indent=2)

        # 准备 manifest.json 元数据
        manifest_data = {
            "app_name": "mengya-local",
            "version": "v1.86",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": int(time.time()),
            "creator": creator_name,
            "backup_type": "full_system_snapshot",
            "db_sha256": db_sha256,
            "table_counts": stats,
            "total_tables": len(stats),
            "total_records": sum(stats.values()),
        }
        manifest_path = temp_dir / "manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, ensure_ascii=False, indent=2)

        # 4. 构建待打包文件映射表 {abs_path: arcname}
        files_map = {
            str(temp_db_path): "database/mengya.db",
            str(manifest_path): "manifest.json",
            str(config_snapshot_path): "config_snapshot.json",
        }

        # 收集 data 目录
        if DATA_DIR.is_dir():
            for item in DATA_DIR.rglob("*"):
                if item.is_file():
                    rel_p = item.relative_to(BASE_DIR).as_posix()
                    files_map[str(item)] = rel_p

        # 收集 media 目录
        if MEDIA_DIR.is_dir():
            for item in MEDIA_DIR.rglob("*"):
                if item.is_file():
                    rel_p = item.relative_to(BASE_DIR).as_posix()
                    files_map[str(item)] = rel_p

        # 5. 打包为 zip（AES-256 或普通压缩）
        ok, res = webdav_utils.create_encrypted_zip(files_map, encrypt_password, output_zip_path)
        if not ok:
            return False, f"创建压缩包失败: {res}", {}

        return True, output_zip_path, manifest_data
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)




def get_rollback_snapshots_info() -> dict:
    """获取 logs/ 目录下的所有安全回滚快照信息与汇总"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    files = list(LOGS_DIR.glob("db_rollback_pre_restore_*.db"))
    files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    items = []
    total_size = 0
    for f in files:
        try:
            st = f.stat()
            size = st.st_size
            total_size += size
            items.append({
                "filename": f.name,
                "path": str(f.resolve()),
                "size": size,
                "size_human": f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / (1024 * 1024):.2f} MB",
                "modified_time": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            })
        except Exception:
            pass

    max_copies = 3
    try:
        cfg = BackupConfig.get_config()
        max_copies = cfg.max_rollback_copies or 3
    except Exception:
        pass

    return {
        "count": len(items),
        "total_size": total_size,
        "total_size_human": f"{total_size / 1024:.1f} KB" if total_size < 1024 * 1024 else f"{total_size / (1024 * 1024):.2f} MB",
        "max_copies": max_copies,
        "snapshots": items,
    }


def prune_rollback_snapshots(keep_count: int = None) -> tuple[int, list]:
    """
    自动修剪 logs/ 目录下的回滚快照，仅保留最新的 keep_count 个。
    返回: (removed_count, removed_filenames)
    """
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    if keep_count is None:
        try:
            cfg = BackupConfig.get_config()
            keep_count = cfg.max_rollback_copies or 3
        except Exception:
            keep_count = 3

    keep_count = max(1, int(keep_count))
    files = list(LOGS_DIR.glob("db_rollback_pre_restore_*.db"))
    files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    removed = []
    if len(files) > keep_count:
        to_delete = files[keep_count:]
        for f in to_delete:
            try:
                fname = f.name
                f.unlink(missing_ok=True)
                removed.append(fname)
            except Exception:
                pass
    return len(removed), removed


def verify_database_integrity(db_path: str) -> tuple[bool, str]:
    """验证 SQLite 数据库完整性"""
    if not os.path.exists(db_path):
        return False, "待检验数据库文件不存在"
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        res = cur.fetchone()
        conn.close()
        if res and res[0] == "ok":
            return True, "完整性检验通过 (ok)"
        return False, f"完整性检查异常: {res}"
    except Exception as e:
        return False, f"无法读取数据库: {str(e)}"


def restore_system_from_backup(
    backup_file_path: str,
    decrypt_password: str = None,
    operator_name: str = "admin",
) -> tuple[bool, str, dict]:
    """
    全量灾难恢复核心逻辑：
    1. 解密/解压或识别 .db / .zip 备份包；
    2. 深度验证待恢复数据库完整性 (PRAGMA integrity_check)；
    3. 【安全自愈保障】自动将当前运行的数据库备份到 logs/db_rollback_pre_restore_*.db；
    4. 关闭 Django 现有数据库连接池；
    5. 使用 sqlite3.backup() 原子覆盖当前主库；
    6. 清理残留的 -wal 与 -shm 缓存；
    7. 若备份包内含 data/、media/ 则同步放回复位；
    8. 重载 ORM 缓存。
    """
    if not os.path.exists(backup_file_path):
        return False, f"备份文件不存在: {backup_file_path}", {}

    # 预先暂存当前 WebDAV 配置，以便恢复后若备份库无配置时自动延续
    preserved_backup_cfg = None
    try:
        cur_cfg = BackupConfig.get_config()
        if cur_cfg.webdav_url:
            preserved_backup_cfg = {
                "webdav_url": cur_cfg.webdav_url,
                "webdav_username": cur_cfg.webdav_username,
                "webdav_password": cur_cfg.webdav_password,
                "backup_path": cur_cfg.backup_path,
                "backup_subdir": cur_cfg.backup_subdir,
                "config_alias": cur_cfg.config_alias,
                "backup_encrypt_password": cur_cfg.backup_encrypt_password,
                "max_rollback_copies": cur_cfg.max_rollback_copies,
            }
    except Exception:
        pass

    temp_dir = Path(settings.BASE_DIR) / ".temp" / f"restore_{int(time.time() * 1000)}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    live_db = _get_live_db_path()

    try:
        candidate_db = None
        manifest_data = {}
        config_snapshot_data = {}
        is_zip = backup_file_path.lower().endswith(".zip")

        if is_zip:
            # 解压
            ok, msg = webdav_utils.decrypt_and_extract_zip(backup_file_path, decrypt_password, str(temp_dir))
            if not ok:
                return False, f"解压备份包失败: {msg}", {}

            # 读取 manifest.json（如有）
            m_path = temp_dir / "manifest.json"
            if m_path.is_file():
                try:
                    with open(m_path, "r", encoding="utf-8") as f:
                        manifest_data = json.load(f)
                except Exception:
                    pass
            cfg_p = temp_dir / "config_snapshot.json"
            if cfg_p.is_file():
                try:
                    with open(cfg_p, "r", encoding="utf-8") as f:
                        config_snapshot_data = json.load(f)
                except Exception:
                    pass

            # 寻找解压出的数据库文件
            db_candidates = [
                temp_dir / "database" / "mengya.db",
                temp_dir / "mengya.db",
                temp_dir / "db.sqlite3",
            ]
            for c in db_candidates:
                if c.is_file():
                    candidate_db = str(c)
                    break
            if not candidate_db:
                # 遍历所有 .db / .sqlite 文件
                found = list(temp_dir.glob("**/*.db")) + list(temp_dir.glob("**/*.sqlite*"))
                if found:
                    candidate_db = str(found[0])
            if not candidate_db:
                return False, "备份包内未发现有效的数据库文件 (.db)", {}
        else:
            candidate_db = backup_file_path

        # 2. 完整性检查
        ok, check_msg = verify_database_integrity(candidate_db)
        if not ok:
            return False, f"恢复失败：{check_msg}，该备份可能损坏，已阻断替换", {}

        # 3. 统计即将恢复的数据表
        target_stats = get_database_stats(candidate_db)

        # 4. 【极关键安全保障】为当前主库生成回滚快照副本
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        rollback_filename = f"db_rollback_pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        rollback_path = str(LOGS_DIR / rollback_filename)
        ok_bak, msg_bak = create_database_snapshot(rollback_path)
        if not ok_bak:
            return False, f"恢复前创建系统安全回滚副本失败: {msg_bak}，已终止恢复操作以保护现有数据", {}

        # 触发自动修剪：超出最大保留份数时安全移除最久远历史副本
        try:
            cur_max_copies = 3
            if preserved_backup_cfg and "max_rollback_copies" in preserved_backup_cfg:
                cur_max_copies = preserved_backup_cfg["max_rollback_copies"]
            else:
                cur_max_copies = BackupConfig.get_config().max_rollback_copies or 3
            prune_rollback_snapshots(keep_count=cur_max_copies)
        except Exception:
            pass

        # 5. 释放 Django 所有数据库连接
        try:
            connections.close_all()
        except Exception:
            pass

        # 6. 使用 sqlite3.backup() 原子覆盖主库
        try:
            # 清理 WAL 与 SHM
            for suffix in ("-wal", "-shm"):
                wal_p = live_db + suffix
                if os.path.exists(wal_p):
                    try:
                        os.remove(wal_p)
                    except Exception:
                        pass

            src_conn = sqlite3.connect(candidate_db)
            dst_conn = sqlite3.connect(live_db)
            src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()

            # 再次清理 WAL/SHM 确保干净启动
            for suffix in ("-wal", "-shm"):
                wal_p = live_db + suffix
                if os.path.exists(wal_p):
                    try:
                        os.remove(wal_p)
                    except Exception:
                        pass
        except Exception as e:
            return False, f"原子复制数据库失败: {str(e)} (已保留安全回滚镜像: {rollback_filename})", {}

        # 7. 若备份包内含 data/、media/ 资源，同步还原
        if is_zip:
            extracted_data = temp_dir / "data"
            if extracted_data.is_dir():
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                for item in extracted_data.rglob("*"):
                    if item.is_file():
                        rel = item.relative_to(extracted_data)
                        dest = DATA_DIR / rel
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(item, dest)

            extracted_media = temp_dir / "media"
            if extracted_media.is_dir():
                MEDIA_DIR.mkdir(parents=True, exist_ok=True)
                for item in extracted_media.rglob("*"):
                    if item.is_file():
                        rel = item.relative_to(extracted_media)
                        dest = MEDIA_DIR / rel
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(item, dest)

        # 8. 自动执行数据库迁移补全（针对跨版本旧备份自愈）
        try:
            from django.core.management import call_command
            call_command("migrate", interactive=False)
        except Exception:
            pass

        # 9. 延续当前 WebDAV 配置（若恢复后的库未配置 WebDAV）
        if preserved_backup_cfg:
            try:
                new_cfg = BackupConfig.get_config()
                if not new_cfg.webdav_url:
                    for k, v in preserved_backup_cfg.items():
                        setattr(new_cfg, k, v)
                    new_cfg.save()
            except Exception:
                pass

        # 10. 清理服务缓存
        try:
            from apps.core.views import _HOME_WEATHER_CACHE
            _HOME_WEATHER_CACHE.clear()
        except Exception:
            pass

        result_summary = {
            "restored_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "operator": operator_name,
            "rollback_snapshot": rollback_filename,
            "rollback_snapshot_path": rollback_path,
            "tables_restored": len(target_stats),
            "total_records_restored": sum(target_stats.values()),
            "manifest": manifest_data,
            "config_snapshot": config_snapshot_data,
        }

        return True, "系统数据与配置已成功恢复！", result_summary

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================
# Cron 表达式解析与定时自动备份调度器
# ============================================================

def _parse_cron_field(expr: str, field_type: str) -> set:
    """
    解析 cron 表达式单个字段，返回匹配整数集合。
    支持：* / 数字 / 逗号列表 / 范围- / 步长/
    field_type: 'minute' | 'hour' | 'day' | 'month' | 'weekday'
    """
    ranges = {
        "minute": (0, 59),
        "hour": (0, 23),
        "day": (1, 31),
        "month": (1, 12),
        "weekday": (0, 6),  # 0=周日, 6=周六
    }
    min_val, max_val = ranges.get(field_type, (0, 59))
    expr = expr.strip()
    result = set()

    if "/" in expr:
        parts = expr.split("/", 1)
        base = parts[0].strip()
        step = int(parts[1].strip())
        if base == "*":
            for i in range(min_val, max_val + 1, step):
                result.add(i)
            return result
        elif "-" in base:
            lo, hi = base.split("-", 1)
            for i in range(int(lo), int(hi) + 1, step):
                result.add(i)
            return result

    if expr == "*":
        for i in range(min_val, max_val + 1):
            result.add(i)
        return result

    if "," in expr:
        for part in expr.split(","):
            part = part.strip()
            if "-" in part:
                lo, hi = part.split("-", 1)
                for i in range(int(lo), int(hi) + 1):
                    result.add(i)
            elif part.isdigit():
                result.add(int(part))
        return result

    if "-" in expr:
        lo, hi = expr.split("-", 1)
        for i in range(int(lo), int(hi) + 1):
            result.add(i)
        return result

    if expr.isdigit():
        result.add(int(expr))
        return result

    return result


def _cron_match(cron_expr: str, dt: datetime) -> bool:
    """检查当前时间 dt 是否满足 cron 表达式"""
    try:
        parts = cron_expr.strip().split()
        if len(parts) != 5:
            return False
        minute_set = _parse_cron_field(parts[0], "minute")
        hour_set = _parse_cron_field(parts[1], "hour")
        day_set = _parse_cron_field(parts[2], "day")
        month_set = _parse_cron_field(parts[3], "month")
        weekday_set = _parse_cron_field(parts[4], "weekday")

        # Python weekday: 0=Monday ... 6=Sunday
        # Cron weekday: 0=Sunday ... 6=Saturday
        cron_wday = (dt.weekday() + 1) % 7

        return (
            dt.minute in minute_set
            and dt.hour in hour_set
            and dt.day in day_set
            and dt.month in month_set
            and cron_wday in weekday_set
        )
    except Exception:
        return False


def run_scheduled_backup_task(task_id: int, executed_by: str = "system") -> tuple[bool, str]:
    """执行单个定时备份任务"""
    try:
        task = ScheduledBackupTask.objects.get(pk=task_id)
    except ScheduledBackupTask.DoesNotExist:
        return False, "定时任务不存在"

    now = datetime.now()
    log = ScheduledTaskExecutionLog.objects.create(
        task=task,
        status="running",
        executed_by=executed_by,
    )

    config = BackupConfig.get_config()
    if not config.webdav_url or not config.webdav_username:
        task.last_run_time = now
        task.last_run_status = "失败: WebDAV 未配置服务器地址或账号"
        task.save(update_fields=["last_run_time", "last_run_status"])
        log.status = "failed"
        log.end_time = datetime.now()
        log.output_log = task.last_run_status
        log.save(update_fields=["status", "end_time", "output_log"])
        return False, task.last_run_status

    temp_dir = Path(settings.BASE_DIR) / ".temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")
    encrypt_pwd = config.backup_encrypt_password if task.encrypt_enabled else None

    try:
        if task.task_type == "db_backup":
            remote_name = f"mengya_backup_{timestamp_str}_db.db"
            local_backup = str(temp_dir / remote_name)
            ok, msg = create_database_snapshot(local_backup)
            if not ok:
                raise RuntimeError(msg)
        else:
            # full_backup（默认）
            remote_name = f"mengya_backup_{timestamp_str}_full.zip"
            local_backup = str(temp_dir / remote_name)
            ok, msg, _ = create_full_snapshot_package(local_backup, encrypt_password=encrypt_pwd, creator_name=executed_by)
            if not ok:
                raise RuntimeError(msg)

        # 上传 WebDAV
        upload_ok, upload_msg = webdav_utils.upload_backup(
            config,
            local_file_path=local_backup,
            remote_filename=remote_name,
        )

        try:
            if os.path.exists(local_backup):
                os.remove(local_backup)
        except Exception:
            pass

        if not upload_ok:
            raise RuntimeError(f"WebDAV 上传失败: {upload_msg}")

        task.last_run_time = now
        task.last_run_status = f"成功: 已上传 {remote_name}"
        task.save(update_fields=["last_run_time", "last_run_status"])

        config.last_backup_time = now
        config.last_status = f"定时备份成功: {remote_name}"
        config.save(update_fields=["last_backup_time", "last_status"])

        log.status = "success"
        log.end_time = datetime.now()
        log.output_log = f"任务执行成功，生成并上传云端快照: {remote_name}"
        log.save(update_fields=["status", "end_time", "output_log"])

        return True, log.output_log

    except Exception as e:
        err = str(e)
        task.last_run_time = now
        task.last_run_status = f"失败: {err}"
        task.save(update_fields=["last_run_time", "last_run_status"])

        log.status = "failed"
        log.end_time = datetime.now()
        log.output_log = f"执行异常: {err}"
        log.save(update_fields=["status", "end_time", "output_log"])
        return False, err


def _backup_scheduler_worker():
    """后台定时备份调度器常驻工作线程"""
    global _scheduler_running
    time.sleep(8)  # 等待 Django 与数据库就绪
    while _scheduler_running:
        try:
            now = datetime.now()
            tasks = ScheduledBackupTask.objects.filter(is_enabled=True)
            for task in tasks:
                if not _cron_match(task.cron_expr, now):
                    continue
                # 防止同分钟重复执行
                if task.last_run_time:
                    delta = (now - task.last_run_time).total_seconds()
                    if delta < 120:
                        continue
                run_scheduled_backup_task(task.id, executed_by="scheduler")
        except Exception:
            pass
        # 轮询休眠 30 秒
        for _ in range(30):
            if not _scheduler_running:
                break
            time.sleep(1)


def start_backup_scheduler():
    """启动后台定时备份调度线程"""
    global _scheduler_thread, _scheduler_running
    with _scheduler_lock:
        if _scheduler_thread and _scheduler_thread.is_alive():
            return
        _scheduler_running = True
        _scheduler_thread = threading.Thread(target=_backup_scheduler_worker, daemon=True, name="MengyaBackupScheduler")
        _scheduler_thread.start()
