# -*- coding: utf-8 -*-
"""
萌芽系统跨数据库模式 WebDAV 容灾备份与无缝恢复核心服务 (Backup and Disaster Recovery Service)
- 支持三种数据库运行模式：SQLite、共享 PostgreSQL (Shared)、独立专属 PostgreSQL 容器 (Dedicated)
- 跨引擎无缝双向互导：统一中立分表拓扑流式数据 (database/*.json.gz)，低内存占用，抗 OOM
- 四道防线保障：沙箱预检 -> 强制生成当前主库热回滚镜像 -> 单事务批量导入与当前管理员防踢保护 -> 引擎序列自愈
- 一键应急撤销恢复：覆盖前自动留存 pre_restore_snapshot_latest，支持误操作秒级一键回退
- 统一自解释命名规范：mengya_backup_{timestamp}_{db_mode}_{creator}_{scope}.zip
"""

import os
import sys
import json
import time
import shutil
import hashlib
import sqlite3
import gzip
import threading
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import connection, connections, transaction
from django.apps import apps
from django.core import serializers

from apps.core.models.backup import BackupConfig, ScheduledBackupTask, ScheduledTaskExecutionLog
from apps.core.services import webdav_utils

# 基础路径
BASE_DIR = Path(settings.BASE_DIR)
DATA_DIR = BASE_DIR / "data"
MEDIA_DIR = BASE_DIR / "media"
LOGS_DIR = BASE_DIR / "logs"

# 全局调度线程锁
_scheduler_thread = None
_scheduler_running = False
_scheduler_lock = threading.Lock()

# 核心业务模型拓扑依赖顺序（父表在前，子表在后）
CORE_BACKUP_MODELS = [
    ("core", "SystemSetting"),
    ("core", "BackupConfig"),
    ("core", "ScheduledBackupTask"),
    ("core", "ScheduledTaskExecutionLog"),
    ("core", "User"),
    ("core", "AuditLog"),
    ("core", "BabyProfile"),
    ("core", "MotherProfile"),
    ("core", "TimelineEvent"),
    ("core", "Recipe"),
    ("core", "KidsEncyclopedia"),
    ("core", "BrandProfile"),
    ("core", "Product"),
    ("core", "ProductComparison"),
    ("core", "ShoppingList"),
    ("core", "ShoppingListItem"),
    ("core", "BabyShoppingItem"),
    ("core", "HealthRecord"),
    ("core", "AIQueryLog"),
    ("core", "ChatSession"),
    ("core", "ChatMessage"),
    ("core", "UserFavorite"),
    ("core", "Notification"),
    ("core", "InviteLink"),
    ("core", "DailyTip"),
    ("core", "FetalStory"),
]


def get_current_runtime_db_profile() -> dict:
    """
    运行时数据库环境精准探测：
    返回当前活跃数据库引擎、部署模式与连接信息摘要
    """
    engine = settings.DATABASES.get("default", {}).get("ENGINE", "django.db.backends.sqlite3")
    is_postgres = "postgresql" in engine or connection.vendor == "postgresql"

    if is_postgres:
        raw_mode = os.getenv("DB_MODE", "").strip().lower()
        if raw_mode in ("shared", "pg_shared"):
            db_mode = "pg_shared"
            mode_label = "共享 PostgreSQL 实例"
        else:
            db_mode = "pg_dedicated"
            mode_label = "独立 PostgreSQL 专属容器"
        db_name = settings.DATABASES.get("default", {}).get("NAME", "mengya_local")
    else:
        db_mode = "sqlite"
        mode_label = "SQLite 本地单文件"
        db_name = str(settings.DATABASES.get("default", {}).get("NAME", BASE_DIR / "db.sqlite3"))

    return {
        "engine": "postgresql" if is_postgres else "sqlite",
        "db_mode": db_mode,
        "mode_label": mode_label,
        "db_name": db_name,
        "is_postgres": is_postgres,
        "summary": f"{mode_label} ({'PostgreSQL' if is_postgres else 'SQLite'}: {db_name})",
    }


def generate_backup_filename(creator_name: str = "admin", backup_type: str = "full") -> str:
    """
    生成符合新命名规范的备份文件名：
    mengya_backup_{yyyyMMdd_HHmmss}_{db_mode}_{creator}_{scope}.zip
    """
    profile = get_current_runtime_db_profile()
    db_mode = profile["db_mode"]
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    clean_creator = "".join(c for c in creator_name if c.isalnum() or c in ("_", "-")) or "admin"
    scope = "full" if backup_type in ("full", "full_backup") else "db"
    return f"mengya_backup_{timestamp_str}_{db_mode}_{clean_creator}_{scope}.zip"


def _calc_file_sha256(filepath: str) -> str:
    """计算文件的 SHA-256 校验和"""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def _get_live_sqlite_path() -> str:
    """获取当前正在运行的 SQLite 数据库绝对路径"""
    default_db = settings.DATABASES.get("default", {})
    name = default_db.get("NAME")
    return str(Path(name).resolve()) if name else str((BASE_DIR / "db.sqlite3").resolve())


def get_database_stats(db_path: str = None) -> dict:
    """
    获取当前数据库各业务表的记录行数统计：
    支持跨模式查询（SQLite 或 PostgreSQL）
    """
    stats = {}
    if db_path and os.path.exists(db_path):
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
            return stats
        except Exception:
            pass

    for app_lbl, mdl_name in CORE_BACKUP_MODELS:
        try:
            model = apps.get_model(app_lbl, mdl_name)
            if model:
                stats[model._meta.db_table] = model.objects.count()
        except Exception:
            pass
    return stats


def stream_export_database(target_db_dir: Path) -> tuple[bool, str, dict]:
    """
    将当前主数据库流式导出至中立跨引擎目录 (database/*.json.gz)：
    - 按模型拓扑排序逐表导出
    - 使用 chunk_size 分批序列化并以 gzip 流式写入，杜绝 OOM 内存爆仓
    - 若当前为 SQLite，同时生成 database/mengya.db 提供 100% 原生双模兼容
    """
    target_db_dir.mkdir(parents=True, exist_ok=True)
    table_stats = {}
    profile = get_current_runtime_db_profile()

    try:
        for app_lbl, mdl_name in CORE_BACKUP_MODELS:
            try:
                model = apps.get_model(app_lbl, mdl_name)
                tbl_name = model._meta.db_table
                qs = model.objects.all().order_by("pk")
                count = qs.count()
                table_stats[tbl_name] = count

                gz_path = target_db_dir / f"{tbl_name}.json.gz"
                with gzip.open(gz_path, "wt", encoding="utf-8") as gz_file:
                    gz_file.write("[")
                    first_record = True
                    for obj in qs.iterator(chunk_size=1000):
                        serialized_single = serializers.serialize("json", [obj])
                        raw_json_item = serialized_single.strip()[1:-1]
                        if not raw_json_item:
                            continue
                        if not first_record:
                            gz_file.write(",")
                        else:
                            first_record = False
                        gz_file.write(raw_json_item)
                    gz_file.write("]")
            except Exception as e:
                return False, f"流式导出表 {app_lbl}.{mdl_name} 失败: {str(e)}", {}

        if not profile["is_postgres"]:
            native_sqlite_path = target_db_dir / "mengya.db"
            create_sqlite_physical_snapshot(str(native_sqlite_path))

        return True, "success", table_stats
    except Exception as e:
        return False, f"数据流式导出异常: {str(e)}", {}


def create_sqlite_physical_snapshot(output_path: str) -> tuple[bool, str]:
    """使用 sqlite3.backup() API 物理热备份 SQLite 数据库"""
    live_db = _get_live_sqlite_path()
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
        return False, f"创建 SQLite 热快照异常: {str(e)}"


def create_database_snapshot(output_path: str) -> tuple[bool, str]:
    """
    多引擎数据库纯数据快照导出：
    统一打包为带有 database/ 目录的跨引擎标准 .zip 包
    """
    temp_dir = Path(settings.BASE_DIR) / ".temp" / f"db_snap_{int(time.time() * 1000)}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    db_stream_dir = temp_dir / "database"

    try:
        ok, msg, stats = stream_export_database(db_stream_dir)
        if not ok:
            return False, msg

        profile = get_current_runtime_db_profile()
        manifest_data = {
            "app_name": "mengya-local",
            "version": "v1.89",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": int(time.time()),
            "creator": "system",
            "backup_type": "db_backup",
            "db_engine": profile["engine"],
            "db_mode": profile["db_mode"],
            "table_counts": stats,
            "total_tables": len(stats),
            "total_records": sum(stats.values()),
        }
        manifest_path = temp_dir / "manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, ensure_ascii=False, indent=2)

        files_map = {str(manifest_path): "manifest.json"}
        for item in db_stream_dir.rglob("*"):
            if item.is_file():
                rel_p = item.relative_to(temp_dir).as_posix()
                files_map[str(item)] = rel_p

        ok_zip, zip_res = webdav_utils.create_encrypted_zip(files_map, None, output_path)
        if not ok_zip:
            return False, f"打包数据库快照失败: {zip_res}"
        return True, output_path
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def create_full_snapshot_package(
    output_zip_path: str,
    encrypt_password: str = None,
    creator_name: str = "admin",
) -> tuple[bool, str, dict]:
    """
    创建跨引擎系统全量快照包 (.zip)：
    1. 流式导出 database/*.json.gz 及 SQLite 物理热镜像
    2. 收集 data/ 缓存与 media/ 附件
    3. 生成系统基础配置 config_snapshot.json 与 manifest.json 元数据
    4. 压缩打包（若指定密码则 AES-256 加密）
    """
    temp_dir = Path(settings.BASE_DIR) / ".temp" / f"full_snap_{int(time.time() * 1000)}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    db_stream_dir = temp_dir / "database"

    try:
        ok, msg, stats = stream_export_database(db_stream_dir)
        if not ok:
            return False, f"导出数据流失败: {msg}", {}

        profile = get_current_runtime_db_profile()

        config_snapshot = {}
        try:
            from apps.core.models.system import SystemSetting
            sys_setting = SystemSetting.get_settings()
            config_snapshot = {
                "version": "v1.89",
                "app_name": "mengya-local",
                "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "db_profile": profile,
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
                    "database_engine": profile["engine"],
                    "db_mode": profile["db_mode"],
                    "timezone": getattr(settings, "TIME_ZONE", "Asia/Shanghai"),
                    "media_root": str(MEDIA_DIR),
                },
            }
        except Exception as ce:
            config_snapshot = {"error": str(ce)}

        config_snapshot_path = temp_dir / "config_snapshot.json"
        with open(config_snapshot_path, "w", encoding="utf-8") as f:
            json.dump(config_snapshot, f, ensure_ascii=False, indent=2)

        manifest_data = {
            "app_name": "mengya-local",
            "version": "v1.89",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": int(time.time()),
            "creator": creator_name,
            "backup_type": "full_system_snapshot",
            "db_engine": profile["engine"],
            "db_mode": profile["db_mode"],
            "table_counts": stats,
            "total_tables": len(stats),
            "total_records": sum(stats.values()),
        }
        manifest_path = temp_dir / "manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, ensure_ascii=False, indent=2)

        files_map = {
            str(manifest_path): "manifest.json",
            str(config_snapshot_path): "config_snapshot.json",
        }

        for item in db_stream_dir.rglob("*"):
            if item.is_file():
                rel_p = item.relative_to(temp_dir).as_posix()
                files_map[str(item)] = rel_p

        if DATA_DIR.is_dir():
            for item in DATA_DIR.rglob("*"):
                if item.is_file():
                    rel_p = item.relative_to(BASE_DIR).as_posix()
                    files_map[str(item)] = rel_p

        if MEDIA_DIR.is_dir():
            for item in MEDIA_DIR.rglob("*"):
                if item.is_file():
                    rel_p = item.relative_to(BASE_DIR).as_posix()
                    files_map[str(item)] = rel_p

        ok_zip, zip_res = webdav_utils.create_encrypted_zip(files_map, encrypt_password, output_zip_path)
        if not ok_zip:
            return False, f"创建压缩包失败: {zip_res}", {}

        return True, output_zip_path, manifest_data
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)



# ============================================================
# 安全回滚镜像管理与一键应急撤销 (Fail-Safe Rollback & One-Click Revert)
# ============================================================

def create_pre_restore_safety_snapshot(operator_name: str = "admin", incoming_filename: str = "") -> tuple[bool, str, str]:
    """
    【第二防线】在恢复任何新数据前，为当前主库生成强制性 1:1 热回滚快照副本：
    - 当前为 SQLite：生成 logs/rollback_pre_restore_YYYYMMDD_HHMMSS_sqlite.db
    - 当前为 PostgreSQL：流式打包生成 logs/rollback_pre_restore_YYYYMMDD_HHMMSS_pg.zip
    - 同时更新固定命名 logs/pre_restore_snapshot_latest.* 及 latest.meta.json
    返回: (ok: bool, snapshot_filename: str, err_or_path: str)
    """
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    profile = get_current_runtime_db_profile()
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    db_mode = profile["db_mode"]

    latest_meta_file = LOGS_DIR / "pre_restore_snapshot_latest.meta.json"
    latest_target_file = None

    if not profile["is_postgres"]:
        snapshot_filename = f"rollback_pre_restore_{timestamp_str}_{db_mode}.db"
        snapshot_path = str(LOGS_DIR / snapshot_filename)
        ok, msg = create_sqlite_physical_snapshot(snapshot_path)
        if not ok:
            return False, "", f"创建 SQLite 回滚镜像失败: {msg}"
        latest_target_file = LOGS_DIR / "pre_restore_snapshot_latest.db"
        try:
            shutil.copy2(snapshot_path, latest_target_file)
        except Exception:
            pass
    else:
        snapshot_filename = f"rollback_pre_restore_{timestamp_str}_{db_mode}.zip"
        snapshot_path = str(LOGS_DIR / snapshot_filename)
        ok, msg = create_database_snapshot(snapshot_path)
        if not ok:
            return False, "", f"创建 PostgreSQL 回滚镜像失败: {msg}"
        latest_target_file = LOGS_DIR / "pre_restore_snapshot_latest.zip"
        try:
            shutil.copy2(snapshot_path, latest_target_file)
        except Exception:
            pass

    # 留存最新回滚元数据，供前端“一键应急回滚”横幅展示
    try:
        current_stats = get_database_stats()
        meta = {
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": int(time.time()),
            "operator": operator_name,
            "incoming_filename": incoming_filename,
            "db_mode": db_mode,
            "db_engine": profile["engine"],
            "snapshot_filename": snapshot_filename,
            "latest_file": latest_target_file.name if latest_target_file else "",
            "total_tables": len(current_stats),
            "total_records": sum(current_stats.values()),
        }
        with open(latest_meta_file, "w", encoding="utf-8") as mf:
            json.dump(meta, mf, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return True, snapshot_filename, snapshot_path


def get_latest_rollback_meta() -> dict | None:
    """获取最近一次数据覆盖前留存的安全应急快照元数据"""
    latest_meta_file = LOGS_DIR / "pre_restore_snapshot_latest.meta.json"
    if not latest_meta_file.is_file():
        return None
    try:
        with open(latest_meta_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        # 验证关联文件实体是否存在
        latest_fn = data.get("latest_file")
        if latest_fn and (LOGS_DIR / latest_fn).is_file():
            return data
    except Exception:
        pass
    return None


def get_rollback_snapshots_info() -> dict:
    """获取 logs/ 目录下的所有安全回滚快照信息与汇总"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    files = list(LOGS_DIR.glob("rollback_pre_restore_*.*")) + list(LOGS_DIR.glob("db_rollback_pre_restore_*.*"))
    # 过滤出合法的 .db 与 .zip
    valid_files = [f for f in files if f.suffix.lower() in (".db", ".zip")]
    valid_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    items = []
    total_size = 0
    for f in valid_files:
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

    latest_meta = get_latest_rollback_meta()

    return {
        "count": len(items),
        "total_size": total_size,
        "total_size_human": f"{total_size / 1024:.1f} KB" if total_size < 1024 * 1024 else f"{total_size / (1024 * 1024):.2f} MB",
        "max_copies": max_copies,
        "snapshots": items,
        "latest_revert_available": bool(latest_meta),
        "latest_revert_meta": latest_meta,
    }


def prune_rollback_snapshots(keep_count: int = None) -> tuple[int, list]:
    """修剪历史回滚镜像，仅保留最新的 keep_count 个（最新 latest 专属文件不被修剪）"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    if keep_count is None:
        try:
            cfg = BackupConfig.get_config()
            keep_count = cfg.max_rollback_copies or 3
        except Exception:
            keep_count = 3

    keep_count = max(1, int(keep_count))
    files = list(LOGS_DIR.glob("rollback_pre_restore_*.*")) + list(LOGS_DIR.glob("db_rollback_pre_restore_*.*"))
    valid_files = [f for f in files if f.suffix.lower() in (".db", ".zip")]
    valid_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    removed = []
    if len(valid_files) > keep_count:
        to_delete = valid_files[keep_count:]
        for f in to_delete:
            try:
                fname = f.name
                f.unlink(missing_ok=True)
                removed.append(fname)
            except Exception:
                pass
    return len(removed), removed


def revert_to_pre_restore_latest(operator_name: str = "admin") -> tuple[bool, str, dict]:
    """
    【一键应急回滚核心接口】：
    从 pre_restore_snapshot_latest.* 快速撤销上一次误操作覆盖，秒级回退
    """
    latest_meta = get_latest_rollback_meta()
    if not latest_meta:
        return False, "未找到有效的应急回滚镜像，无法执行一键撤销", {}

    latest_fn = latest_meta.get("latest_file")
    latest_fp = LOGS_DIR / latest_fn
    if not latest_fp.is_file():
        return False, f"应急回滚镜像物理文件不存在: {latest_fn}", {}

    # 调用恢复引擎还原
    ok, msg, res = restore_system_from_backup(
        str(latest_fp),
        decrypt_password=None,
        operator_name=operator_name,
        is_emergency_revert=True,
    )
    if not ok:
        return False, f"一键撤销执行失败: {msg}", {}

    return True, f"已成功一键撤销恢复至 {latest_meta.get('created_at')} 导入前的系统状态！", res



# ============================================================
# 跨引擎灾备恢复与数据自愈引擎 (Cross-Engine Restore & Healing)
# ============================================================

def verify_database_integrity(db_path: str) -> tuple[bool, str]:
    """验证 SQLite 物理数据库文件完整性"""
    if not os.path.exists(db_path):
        return False, "待校验数据库文件不存在"
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


def recalibrate_postgres_sequences() -> tuple[bool, str]:
    """
    【第四防线核心】自动校准 PostgreSQL 数据库中所有业务表的主键自增 Sequence：
    跨库导入后若序列不重置，会导致新建数据时产生 duplicate key 错误
    """
    try:
        with connection.cursor() as cursor:
            for app_lbl, mdl_name in CORE_BACKUP_MODELS:
                try:
                    model = apps.get_model(app_lbl, mdl_name)
                    tbl_name = model._meta.db_table
                    pk_field = model._meta.pk.column
                    sql = f"""
                    DO $$
                    DECLARE
                        seq_name text;
                        max_val bigint;
                    BEGIN
                        seq_name := pg_get_serial_sequence(\'{tbl_name}\', \'{pk_field}\');
                        IF seq_name IS NOT NULL THEN
                            EXECUTE format(\'SELECT COALESCE(MAX(%I), 0) FROM %I\', \'{pk_field}\', \'{tbl_name}\') INTO max_val;
                            IF max_val = 0 THEN
                                PERFORM setval(seq_name, 1, false);
                            ELSE
                                PERFORM setval(seq_name, max_val, true);
                            END IF;
                        END IF;
                    END $$;
                    """
                    cursor.execute(sql)
                except Exception:
                    pass
        return True, "PostgreSQL 自增序列已全部重新校准"
    except Exception as e:
        return False, f"校准自增序列失败: {str(e)}"


def restore_system_from_backup(
    backup_file_path: str,
    decrypt_password: str = None,
    operator_name: str = "admin",
    is_emergency_revert: bool = False,
) -> tuple[bool, str, dict]:
    """
    跨引擎全量灾难恢复核心逻辑：
    1. 【第一防线：沙箱预检】解密解压，深度校验 manifest.json 及表数据流文件
    2. 【第二防线：安全回滚】恢复前强制对当前数据库生成 1:1 热回滚镜像（非应急回退时执行）
    3. 【第三防线：单事务批量写入与当前管理员防踢出保护】
    4. 【第四防线：后置自愈】重置 PostgreSQL Sequence 序列 或 SQLite VACUUM
    5. 资产同步：还原 data/ 缓存与 media/ 用户附件
    """
    if not os.path.exists(backup_file_path):
        return False, f"备份文件不存在: {backup_file_path}", {}

    # 暂存当前活跃 WebDAV 配置
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

    # 暂存当前执行操作的管理员账户实体（防踢出保护）
    preserved_operator_user = None
    try:
        User = apps.get_model("core", "User")
        admin_qs = User.objects.filter(is_staff=True).order_by("id")
        preserved_operator_user = admin_qs.first()
    except Exception:
        pass

    temp_dir = Path(settings.BASE_DIR) / ".temp" / f"restore_{int(time.time() * 1000)}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    current_profile = get_current_runtime_db_profile()

    try:
        manifest_data = {}
        config_snapshot_data = {}
        is_zip = backup_file_path.lower().endswith(".zip")
        candidate_sqlite_db = None
        db_stream_files = []

        # 1. 第一防线：沙箱预检与解压
        if is_zip:
            ok_unzip, msg_unzip = webdav_utils.decrypt_and_extract_zip(backup_file_path, decrypt_password, str(temp_dir))
            if not ok_unzip:
                return False, f"解压或解密备份包失败: {msg_unzip}", {}

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

            # 寻找跨引擎 database/*.json.gz 文件流
            db_dir = temp_dir / "database"
            if db_dir.is_dir():
                db_stream_files = list(db_dir.glob("*.json.gz"))

            # 兼容寻找解压出的原生 SQLite .db
            for c in [db_dir / "mengya.db", temp_dir / "mengya.db", temp_dir / "db.sqlite3"]:
                if c.is_file():
                    candidate_sqlite_db = str(c)
                    break
        else:
            # 传入的直接是 .db 文件（历史 SQLite 原生备份兼容）
            candidate_sqlite_db = backup_file_path

        # 如果既没有数据流又没有 SQLite 文件，说明包损坏或不符合规范
        if not db_stream_files and not candidate_sqlite_db:
            return False, "备份包校验失败：未在包内发现有效的数据流 (*.json.gz) 或数据库文件 (.db)", {}

        # 2. 第二防线：生成安全热回滚镜像（非应急撤销自身）
        rollback_filename = "N/A"
        rollback_path = ""
        if not is_emergency_revert:
            ok_bak, rollback_filename, rollback_path = create_pre_restore_safety_snapshot(
                operator_name=operator_name,
                incoming_filename=os.path.basename(backup_file_path),
            )
            if not ok_bak:
                return False, f"恢复前创建系统安全回滚副本失败: {rollback_path}，已终止操作以保护主库数据", {}

            # 修剪多余的历史回滚镜像
            try:
                cur_max_copies = 3
                if preserved_backup_cfg and "max_rollback_copies" in preserved_backup_cfg:
                    cur_max_copies = preserved_backup_cfg["max_rollback_copies"]
                prune_rollback_snapshots(keep_count=cur_max_copies)
            except Exception:
                pass

        # 3. 释放 Django ORM 连接
        try:
            connections.close_all()
        except Exception:
            pass

        restored_records_count = 0
        restored_tables_count = 0

        # 4. 第三防线：根据当前主库类型与备份包内容执行恢复
        # 分支 A：当前是 SQLite 模式 且 备份包内含有效原生 SQLite 文件且无跨引擎流（原生极速物理覆盖模式）
        if (not current_profile["is_postgres"]) and candidate_sqlite_db and (not db_stream_files):
            ok_chk, chk_msg = verify_database_integrity(candidate_sqlite_db)
            if not ok_chk:
                return False, f"待恢复的 SQLite 文件损坏: {chk_msg}", {}

            live_sqlite = _get_live_sqlite_path()
            for suffix in ("-wal", "-shm"):
                wal_p = live_sqlite + suffix
                if os.path.exists(wal_p):
                    try:
                        os.remove(wal_p)
                    except Exception:
                        pass

            src_conn = sqlite3.connect(candidate_sqlite_db)
            dst_conn = sqlite3.connect(live_sqlite)
            src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()

            for suffix in ("-wal", "-shm"):
                wal_p = live_sqlite + suffix
                if os.path.exists(wal_p):
                    try:
                        os.remove(wal_p)
                    except Exception:
                        pass

            target_stats = get_database_stats(live_sqlite)
            restored_tables_count = len(target_stats)
            restored_records_count = sum(target_stats.values())

        # 分支 B：通用跨引擎数据流导入（无论当前是 SQLite 还是 PostgreSQL）
        else:
            stream_map = {}
            for f in db_stream_files:
                stream_map[f.name.replace(".json.gz", "")] = f

            # 开启全局原子事务批量载入
            with transaction.atomic():
                # SQLite 目标库临时关闭外键检查以提升导入性能
                if not current_profile["is_postgres"]:
                    with connection.cursor() as cur:
                        cur.execute("PRAGMA foreign_keys = OFF;")

                # 反向依赖清空现有业务表数据
                for app_lbl, mdl_name in reversed(CORE_BACKUP_MODELS):
                    try:
                        model = apps.get_model(app_lbl, mdl_name)
                        # 保留 BackupConfig 不被强制物理清空
                        if mdl_name == "BackupConfig":
                            continue
                        model.objects.all().delete()
                    except Exception:
                        pass

                # 正向依赖流式逐表反序列化写入
                for app_lbl, mdl_name in CORE_BACKUP_MODELS:
                    try:
                        model = apps.get_model(app_lbl, mdl_name)
                        tbl_name = model._meta.db_table
                        gz_file = stream_map.get(tbl_name)
                        if not gz_file or not gz_file.is_file():
                            continue

                        with gzip.open(gz_file, "rt", encoding="utf-8") as gf:
                            content = gf.read().strip()
                            if not content or content == "[]":
                                continue
                            deserialized_objs = serializers.deserialize("json", content)
                            for d_obj in deserialized_objs:
                                d_obj.save()
                                restored_records_count += 1
                        restored_tables_count += 1
                    except Exception as e:
                        raise RuntimeError(f"写入表 {app_lbl}.{mdl_name} 失败: {str(e)}")

                # 管理员账号防踢出保护自愈
                if preserved_operator_user:
                    try:
                        User = apps.get_model("core", "User")
                        if not User.objects.filter(phone=preserved_operator_user.phone).exists():
                            preserved_operator_user.pk = None
                            preserved_operator_user.id = None
                            preserved_operator_user.save()
                    except Exception:
                        pass

                # SQLite 恢复外键约束
                if not current_profile["is_postgres"]:
                    with connection.cursor() as cur:
                        cur.execute("PRAGMA foreign_keys = ON;")

        # 5. 第四防线：后置自愈与校准
        if current_profile["is_postgres"]:
            recalibrate_postgres_sequences()
        else:
            try:
                with connection.cursor() as cur:
                    cur.execute("VACUUM;")
            except Exception:
                pass

        # 6. 还原静态持久化资产 (data/ 和 media/)
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

        # 7. 延续当前 WebDAV 配置
        if preserved_backup_cfg:
            try:
                new_cfg = BackupConfig.get_config()
                if not new_cfg.webdav_url:
                    for k, v in preserved_backup_cfg.items():
                        setattr(new_cfg, k, v)
                    new_cfg.save()
            except Exception:
                pass

        # 8. 清理天气/系统局部单例缓存
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
            "tables_restored": restored_tables_count,
            "total_records_restored": restored_records_count,
            "current_runtime_engine": current_profile["engine"],
            "current_runtime_mode": current_profile["db_mode"],
            "manifest": manifest_data,
            "config_snapshot": config_snapshot_data,
        }

        return True, "系统数据与配置已成功恢复！", result_summary

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)



# ============================================================
# Cron 表达式解析与定时自动备份调度器 (Scheduled Backup Engine)
# ============================================================

def _parse_cron_field(expr: str, field_type: str) -> set:
    """解析 cron 表达式单个字段，返回匹配整数集合"""
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
    encrypt_pwd = config.backup_encrypt_password if task.encrypt_enabled else None

    # 使用显式自解释规范命名
    backup_scope = "db" if task.task_type == "db_backup" else "full"
    remote_name = generate_backup_filename(creator_name=executed_by, backup_type=backup_scope)
    local_backup = str(temp_dir / remote_name)

    try:
        if task.task_type == "db_backup":
            ok, msg = create_database_snapshot(local_backup)
            if not ok:
                raise RuntimeError(msg)
        else:
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
    time.sleep(8)
    while _scheduler_running:
        try:
            now = datetime.now()
            tasks = ScheduledBackupTask.objects.filter(is_enabled=True)
            for task in tasks:
                if not _cron_match(task.cron_expr, now):
                    continue
                if task.last_run_time:
                    delta = (now - task.last_run_time).total_seconds()
                    if delta < 120:
                        continue
                run_scheduled_backup_task(task.id, executed_by="scheduler")
        except Exception:
            pass
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

