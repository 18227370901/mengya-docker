# -*- coding: utf-8 -*-
"""
WebDAV 备份与容灾恢复管理 API 视图模块 (views_backup.py)
包含：
1. WebDAV 配置查看与更新 (密码脱敏)
2. 连通性在线测试
3. 远端网盘备份列表拉取
4. 手动触发即时备份并上传 WebDAV
5. 从 WebDAV 远端备份一键还原系统
6. 批量删除远端备份
7. 本地离线备份一键下载
8. 本地备份文件上传并恢复
9. 定时自动备份任务与日志管理
"""

import os
import time
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models.backup import BackupConfig, ScheduledBackupTask, ScheduledTaskExecutionLog
from apps.core.services import backup_service, webdav_utils
from apps.core.utils.audit import audit
from apps.core.views import _is_admin


def _check_admin_permission(request):
    """权限阻断：仅限超级管理员与拥有管理权限的账号"""
    if not _is_admin(request.user):
        return Response(
            {"code": 4003, "message": "权限不足：只有系统管理员有权操作系统备份与容灾管理", "data": None},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class AdminBackupConfigView(APIView):
    """WebDAV 配置获取与保存"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        cfg = BackupConfig.get_config()
        db_profile = backup_service.get_current_runtime_db_profile()
        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "webdav_url": cfg.webdav_url,
                "webdav_username": cfg.webdav_username,
                "backup_path": cfg.backup_path or "/mengya_backups/",
                "backup_subdir": cfg.backup_subdir or "mengya_backups",
                "config_alias": cfg.config_alias or "坚果云/WebDAV备份",
                "webdav_password": cfg.webdav_password or "",
                "backup_encrypt_password": cfg.backup_encrypt_password or "",
                "max_rollback_copies": cfg.max_rollback_copies or 3,
                "has_webdav_password": bool(cfg.webdav_password),
                "has_encrypt_password": bool(cfg.backup_encrypt_password),
                "last_backup_time": cfg.last_backup_time.strftime("%Y-%m-%d %H:%M:%S") if cfg.last_backup_time else None,
                "last_status": cfg.last_status,
                "has_pyzipper": True,
                "current_db_profile": db_profile,
            },
        })

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = request.data or {}
        cfg = BackupConfig.get_config()

        if "webdav_url" in data:
            cfg.webdav_url = (data.get("webdav_url") or "").strip()
        if "webdav_username" in data:
            cfg.webdav_username = (data.get("webdav_username") or "").strip()
        if "webdav_password" in data and data.get("webdav_password"):
            cfg.webdav_password = str(data.get("webdav_password")).strip()
        if "backup_path" in data:
            cfg.backup_path = (data.get("backup_path") or "/mengya_backups/").strip()
        if "backup_subdir" in data:
            cfg.backup_subdir = (data.get("backup_subdir") or "mengya_backups").strip()
        if "config_alias" in data:
            cfg.config_alias = (data.get("config_alias") or "").strip()
        if "max_rollback_copies" in data:
            try:
                cfg.max_rollback_copies = max(1, int(data.get("max_rollback_copies")))
            except Exception:
                cfg.max_rollback_copies = 3

        # 加密密码更新或清除
        if data.get("clear_encrypt_password"):
            cfg.backup_encrypt_password = ""
        elif data.get("backup_encrypt_password"):
            cfg.backup_encrypt_password = str(data.get("backup_encrypt_password")).strip()

        cfg.save()

        audit(
            request,
            action="backup_config",
            action_label="更新WebDAV配置",
            target_type="system",
            target_id=str(cfg.id),
            target_name=cfg.config_alias or "WebDAV配置",
            detail=f"更新 WebDAV 服务器地址: {cfg.webdav_url}, 账号: {cfg.webdav_username}",
        )

        return Response({
            "code": 0,
            "message": "WebDAV 配置已成功保存！",
            "data": {
                "webdav_url": cfg.webdav_url,
                "webdav_username": cfg.webdav_username,
                "backup_path": cfg.backup_path,
                "backup_subdir": cfg.backup_subdir,
                "config_alias": cfg.config_alias,
                "webdav_password": cfg.webdav_password or "",
                "backup_encrypt_password": cfg.backup_encrypt_password or "",
                "max_rollback_copies": cfg.max_rollback_copies or 3,
                "has_webdav_password": bool(cfg.webdav_password),
                "has_encrypt_password": bool(cfg.backup_encrypt_password),
                "last_backup_time": cfg.last_backup_time.strftime("%Y-%m-%d %H:%M:%S") if cfg.last_backup_time else None,
                "last_status": cfg.last_status,
                "has_pyzipper": True,
                "current_db_profile": db_profile,
            },
        })


class AdminBackupTestView(APIView):
    """测试 WebDAV 服务连通性"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = request.data or {}
        cfg = BackupConfig.get_config()

        url = (data.get("webdav_url") or cfg.webdav_url or "").strip()
        user = (data.get("webdav_username") or cfg.webdav_username or "").strip()
        pwd = (data.get("webdav_password") or cfg.webdav_password or "").strip()
        path = (data.get("backup_path") or cfg.backup_path or "/mengya_backups/").strip()

        if not url:
            return Response({"code": 4001, "message": "请输入 WebDAV 服务器地址", "data": None}, status=status.HTTP_400_BAD_REQUEST)
        if not user or not pwd:
            return Response({"code": 4001, "message": "请输入 WebDAV 账号与密码/应用授权码", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        ok, msg = webdav_utils.test_connection(url, user, pwd, backup_path=path)
        if ok:
            return Response({"code": 0, "message": msg, "data": {"connected": True}})
        return Response({"code": 5001, "message": msg, "data": {"connected": False}}, status=status.HTTP_400_BAD_REQUEST)


class AdminBackupListView(APIView):
    """异步拉取远端 WebDAV 备份文件列表"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        cfg = BackupConfig.get_config()
        if not cfg.webdav_url or not cfg.webdav_username:
            return Response({
                "code": 0,
                "message": "尚未配置 WebDAV",
                "data": {"configured": False, "backups": []},
            })

        ok, res = webdav_utils.list_backups(cfg)
        if ok:
            return Response({
                "code": 0,
                "message": "success",
                "data": {"configured": True, "backups": res},
            })
        return Response({"code": 5002, "message": f"拉取云端列表失败: {res}", "data": {"configured": True, "backups": []}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminBackupUploadView(APIView):
    """手动立即触发备份并上传至 WebDAV"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        cfg = BackupConfig.get_config()
        if not cfg.webdav_url or not cfg.webdav_username:
            return Response({"code": 4002, "message": "请先配置并保存 WebDAV 服务器地址与账号", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        data = request.data or {}
        backup_type = data.get("backup_type", "full_backup")  # 'full_backup' | 'db_backup'
        use_encrypt = bool(data.get("use_encrypt", False))
        manual_pwd = (data.get("manual_encrypt_password") or "").strip()
        encrypt_pwd = manual_pwd or (cfg.backup_encrypt_password if use_encrypt else None)

        temp_dir = Path(settings.BASE_DIR) / ".temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        creator = getattr(request.user, "nickname", None) or getattr(request.user, "phone", "admin")

        try:
            scope = "db" if backup_type == "db_backup" else "full"
            remote_name = backup_service.generate_backup_filename(creator_name=creator, backup_type=scope)
            local_file = str(temp_dir / remote_name)

            if backup_type == "db_backup":
                ok, msg = backup_service.create_database_snapshot(local_file)
                meta = {}
            else:
                ok, msg, meta = backup_service.create_full_snapshot_package(
                    local_file,
                    encrypt_password=encrypt_pwd,
                    creator_name=creator,
                )

            if not ok:
                return Response({"code": 5003, "message": f"生成本地快照失败: {msg}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # 上传 WebDAV
            upload_ok, upload_msg = webdav_utils.upload_backup(cfg, local_file_path=local_file, remote_filename=remote_name)

            try:
                if os.path.exists(local_file):
                    os.remove(local_file)
            except Exception:
                pass

            if not upload_ok:
                return Response({"code": 5004, "message": f"WebDAV 上传失败: {upload_msg}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            cfg.last_backup_time = datetime.now()
            cfg.last_status = f"手动备份成功: {remote_name}"
            cfg.save(update_fields=["last_backup_time", "last_status"])

            audit(
                request,
                action="backup_trigger",
                action_label="手动创建WebDAV备份",
                target_type="backup",
                target_id=remote_name,
                target_name=remote_name,
                detail=f"成功创建并上传系统备份: {remote_name} (类型: {backup_type}, 加密: {'是' if encrypt_pwd else '否'})",
            )

            return Response({
                "code": 0,
                "message": f"系统备份「{remote_name}」已成功上传至 WebDAV 云盘！",
                "data": {
                    "filename": remote_name,
                    "backup_type": backup_type,
                    "is_encrypted": bool(encrypt_pwd),
                    "metadata": meta,
                },
            })

        except Exception as e:
            return Response({"code": 5005, "message": f"备份过程发生异常: {str(e)}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminBackupRestoreView(APIView):
    """从 WebDAV 远端备份一键还原系统"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = request.data or {}
        filename = (data.get("filename") or "").strip()
        decrypt_pwd = (data.get("decrypt_password") or "").strip()

        if not filename:
            return Response({"code": 4001, "message": "未指定要恢复的备份文件名", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        cfg = BackupConfig.get_config()
        if not cfg.webdav_url:
            return Response({"code": 4002, "message": "未配置 WebDAV", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        clean_name = os.path.basename(filename.replace("\\", "/"))
        temp_dir = Path(settings.BASE_DIR) / ".temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        local_download_path = str(temp_dir / f"restore_src_{clean_name}")

        try:
            # 1. 从 WebDAV 下载备份文件 (以 clean_name 下载)
            ok, msg = webdav_utils.download_backup(cfg, remote_filename=clean_name, save_path=local_download_path)
            if not ok:
                # 尝试用原始 filename 回退下载
                ok, msg = webdav_utils.download_backup(cfg, remote_filename=filename, save_path=local_download_path)
            if not ok:
                return Response({"code": 5006, "message": f"从 WebDAV 下载备份失败: {msg}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # 2. 调用核心恢复函数
            operator = getattr(request.user, "nickname", None) or getattr(request.user, "phone", "admin")
            restore_ok, restore_msg, result_summary = backup_service.restore_system_from_backup(
                local_download_path,
                decrypt_password=decrypt_pwd,
                operator_name=operator,
            )

            if not restore_ok:
                return Response({"code": 5007, "message": restore_msg, "data": None}, status=status.HTTP_400_BAD_REQUEST)

            audit(
                request,
                action="backup_restore",
                action_label="恢复系统备份",
                target_type="backup",
                target_id=filename,
                target_name=filename,
                detail=f"从 WebDAV 恢复备份 {filename} 成功。安全回滚副本已留存: {result_summary.get('rollback_snapshot')}",
            )

            return Response({
                "code": 0,
                "message": f"系统数据与配置已成功恢复！安全回滚快照已自动保留在 logs/{result_summary.get('rollback_snapshot')}。",
                "data": result_summary,
            })
        except Exception as e:
            return Response({"code": 5008, "message": f"还原处理异常: {str(e)}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if os.path.exists(local_download_path):
                try:
                    os.remove(local_download_path)
                except Exception:
                    pass


class AdminBackupDeleteView(APIView):
    """批量删除 WebDAV 远端备份文件"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = request.data or {}
        filenames = data.get("filenames") or []
        if isinstance(filenames, str):
            filenames = [f.strip() for f in filenames.split(",") if f.strip()]

        if not filenames:
            return Response({"code": 4001, "message": "未选择要删除的文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        cfg = BackupConfig.get_config()
        results = []
        all_ok = True

        for fn in filenames:
            ok, msg = webdav_utils.delete_webdav_backup(cfg, remote_filename=fn)
            results.append({"filename": fn, "success": ok, "message": msg})
            if not ok:
                all_ok = False

        audit(
            request,
            action="backup_delete",
            action_label="删除WebDAV备份",
            target_type="backup",
            target_id=",".join(filenames[:3]),
            target_name=f"删除备份({len(filenames)}个)",
            detail=f"删除文件: {', '.join(filenames)}, 结果: {'全部成功' if all_ok else '部分失败'}",
        )

        return Response({
            "code": 0,
            "message": "删除操作执行完毕",
            "data": {"all_success": all_ok, "results": results},
        })


class AdminBackupDownloadLocalView(APIView):
    """一键下载当前系统本地离线备份文件 (.zip 或 .db)"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        backup_type = request.query_params.get("type", "full")  # 'full' | 'db'
        pwd = (request.query_params.get("password") or "").strip() or None
        creator = getattr(request.user, "nickname", None) or getattr(request.user, "phone", "admin")
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")

        temp_dir = Path(settings.BASE_DIR) / ".temp"
        temp_dir.mkdir(parents=True, exist_ok=True)

        scope = "db" if backup_type == "db" else "full"
        filename = backup_service.generate_backup_filename(creator_name=creator, backup_type=scope)
        filepath = str(temp_dir / filename)
        content_type = "application/zip"

        if backup_type == "db":
            ok, msg = backup_service.create_database_snapshot(filepath)
        else:
            ok, msg, _ = backup_service.create_full_snapshot_package(filepath, encrypt_password=pwd, creator_name=creator)

        if not ok:
            return Response({"code": 5008, "message": f"生成本地备份失败: {msg}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        audit(
            request,
            action="backup_trigger",
            action_label="下载本地备份",
            target_type="backup",
            target_id=filename,
            target_name=filename,
            detail=f"下载离线系统备份包: {filename}",
        )

        resp = FileResponse(open(filepath, "rb"), as_attachment=True, filename=filename, content_type=content_type)
        resp["Access-Control-Expose-Headers"] = "Content-Disposition"
        return resp


class AdminBackupDownloadRemoteView(APIView):
    """从 WebDAV 远端下载指定备份文件至本地浏览器"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        filename = (request.query_params.get("filename") or "").strip()
        if not filename:
            return Response({"code": 4001, "message": "未指定要下载的文件名", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        cfg = BackupConfig.get_config()
        if not cfg.webdav_url or not cfg.webdav_username:
            return Response({"code": 4002, "message": "尚未配置 WebDAV", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        clean_name = os.path.basename(filename.replace("\\", "/"))
        temp_dir = Path(settings.BASE_DIR) / ".temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        local_path = str(temp_dir / f"dl_{clean_name}")

        try:
            ok, msg = webdav_utils.download_backup(cfg, remote_filename=clean_name, save_path=local_path)
            if not ok:
                return Response({"code": 5011, "message": f"从 WebDAV 下载失败: {msg}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            content_type = "application/zip" if clean_name.lower().endswith(".zip") else "application/x-sqlite3"
            audit(
                request,
                action="backup_trigger",
                action_label="下载远端备份",
                target_type="backup",
                target_id=clean_name,
                target_name=clean_name,
                detail=f"从 WebDAV 远端下载备份文件: {clean_name}",
            )
            resp = FileResponse(open(local_path, "rb"), as_attachment=True, filename=clean_name, content_type=content_type)
            resp["Access-Control-Expose-Headers"] = "Content-Disposition"
            return resp
        except Exception as e:
            if os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass
            return Response({"code": 5012, "message": f"下载异常: {str(e)}", "data": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminBackupUploadLocalView(APIView):
    """上传本地备份文件 (.db 或 .zip) 并恢复"""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        uploaded_file = request.FILES.get("backup_file")
        if not uploaded_file:
            return Response({"code": 4001, "message": "请选择需要上传恢复的备份文件", "data": None}, status=status.HTTP_400_BAD_REQUEST)

        decrypt_pwd = (request.data.get("decrypt_password") or "").strip()
        temp_dir = Path(settings.BASE_DIR) / ".temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        clean_name = os.path.basename(uploaded_file.name.replace("\\", "/"))
        local_saved_path = str(temp_dir / f"uploaded_{int(time.time())}_{clean_name}")

        try:
            with open(local_saved_path, "wb") as f:
                for chunk in uploaded_file.chunks():
                    f.write(chunk)

            operator = getattr(request.user, "nickname", None) or getattr(request.user, "phone", "admin")
            restore_ok, restore_msg, result_summary = backup_service.restore_system_from_backup(
                local_saved_path,
                decrypt_password=decrypt_pwd,
                operator_name=operator,
            )

            if not restore_ok:
                return Response({"code": 5009, "message": restore_msg, "data": None}, status=status.HTTP_400_BAD_REQUEST)

            audit(
                request,
                action="backup_restore",
                action_label="上传并恢复备份",
                target_type="backup",
                target_id=uploaded_file.name,
                target_name=uploaded_file.name,
                detail=f"上传本地备份 {uploaded_file.name} 并恢复成功。安全回滚镜像: {result_summary.get('rollback_snapshot')}",
            )

            return Response({
                "code": 0,
                "message": f"系统已成功恢复！安全回滚快照已自动保留在 logs/{result_summary.get('rollback_snapshot')}。",
                "data": result_summary,
            })

        finally:
            if os.path.exists(local_saved_path):
                try:
                    os.remove(local_saved_path)
                except Exception:
                    pass


# ============================================================
# 定时备份任务管理 API
# ============================================================

class AdminScheduledTaskListView(APIView):
    """定时备份任务列表与创建"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        tasks = ScheduledBackupTask.objects.all().order_by("-created_at")
        task_list = []
        for t in tasks:
            task_list.append({
                "id": t.id,
                "name": t.name,
                "cron_expr": t.cron_expr,
                "is_enabled": t.is_enabled,
                "encrypt_enabled": t.encrypt_enabled,
                "task_type": t.task_type,
                "last_run_time": t.last_run_time.strftime("%Y-%m-%d %H:%M:%S") if t.last_run_time else None,
                "last_run_status": t.last_run_status,
                "created_at": t.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            })
        return Response({"code": 0, "message": "success", "data": task_list})

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = request.data or {}
        name = (data.get("name") or "定时全量备份").strip()
        cron_expr = (data.get("cron_expr") or "0 2 * * *").strip()
        task_type = data.get("task_type", "full_backup")
        encrypt_enabled = bool(data.get("encrypt_enabled", False))
        is_enabled = bool(data.get("is_enabled", True))

        task = ScheduledBackupTask.objects.create(
            name=name,
            cron_expr=cron_expr,
            task_type=task_type,
            encrypt_enabled=encrypt_enabled,
            is_enabled=is_enabled,
            created_by=request.user,
        )

        return Response({
            "code": 0,
            "message": "定时任务已成功创建！",
            "data": {
                "id": task.id,
                "name": task.name,
                "cron_expr": task.cron_expr,
                "is_enabled": task.is_enabled,
                "encrypt_enabled": task.encrypt_enabled,
                "task_type": task.task_type,
            },
        })


class AdminScheduledTaskDetailView(APIView):
    """定时备份任务更新与删除"""

    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        try:
            task = ScheduledBackupTask.objects.get(pk=pk)
        except ScheduledBackupTask.DoesNotExist:
            return Response({"code": 4004, "message": "任务不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)

        data = request.data or {}
        if "name" in data:
            task.name = (data.get("name") or task.name).strip()
        if "cron_expr" in data:
            task.cron_expr = (data.get("cron_expr") or task.cron_expr).strip()
        if "task_type" in data:
            task.task_type = data.get("task_type") or task.task_type
        if "encrypt_enabled" in data:
            task.encrypt_enabled = bool(data.get("encrypt_enabled"))
        if "is_enabled" in data:
            task.is_enabled = bool(data.get("is_enabled"))

        task.save()
        return Response({"code": 0, "message": "任务修改成功", "data": {"id": task.id, "name": task.name}})

    def delete(self, request, pk):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        try:
            task = ScheduledBackupTask.objects.get(pk=pk)
            name = task.name
            task.delete()
            return Response({"code": 0, "message": f"任务「{name}」已删除", "data": None})
        except ScheduledBackupTask.DoesNotExist:
            return Response({"code": 4004, "message": "任务不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)


class AdminScheduledTaskToggleView(APIView):
    """切换定时任务启用/禁用状态"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        try:
            task = ScheduledBackupTask.objects.get(pk=pk)
            task.is_enabled = not task.is_enabled
            task.save(update_fields=["is_enabled"])
            return Response({
                "code": 0,
                "message": f"任务已{'启用' if task.is_enabled else '禁用'}",
                "data": {"id": task.id, "is_enabled": task.is_enabled},
            })
        except ScheduledBackupTask.DoesNotExist:
            return Response({"code": 4004, "message": "任务不存在", "data": None}, status=status.HTTP_404_NOT_FOUND)


class AdminScheduledTaskRunView(APIView):
    """立即手动执行一次定时任务"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        operator = getattr(request.user, "nickname", None) or getattr(request.user, "phone", "admin")
        ok, msg = backup_service.run_scheduled_backup_task(pk, executed_by=operator)
        if ok:
            return Response({"code": 0, "message": msg, "data": {"success": True}})
        return Response({"code": 5010, "message": msg, "data": {"success": False}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminScheduledTaskLogsView(APIView):
    """查看定时任务最近执行日志"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        logs = ScheduledTaskExecutionLog.objects.filter(task_id=pk).order_by("-start_time")[:30]
        data = []
        for l in logs:
            data.append({
                "id": l.id,
                "start_time": l.start_time.strftime("%Y-%m-%d %H:%M:%S") if l.start_time else "",
                "end_time": l.end_time.strftime("%Y-%m-%d %H:%M:%S") if l.end_time else "",
                "status": l.status,
                "output_log": l.output_log,
                "executed_by": l.executed_by,
            })
        return Response({"code": 0, "message": "success", "data": data})


class AdminBackupRollbackListView(APIView):
    """获取 logs/ 目录下的所有安全回滚快照列表与磁盘统计"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = backup_service.get_rollback_snapshots_info()
        return Response({"code": 0, "message": "success", "data": data})


class AdminBackupRollbackCleanView(APIView):
    """手动一键修剪或清理 logs/ 目录下的历史回滚快照"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        data = request.data or {}
        keep_count = data.get("keep_count")
        if keep_count is not None:
            try:
                keep_count = max(1, int(keep_count))
            except Exception:
                keep_count = None

        removed_count, removed_files = backup_service.prune_rollback_snapshots(keep_count=keep_count)
        new_info = backup_service.get_rollback_snapshots_info()

        audit(
            request,
            action="rollback_prune",
            action_label="清理安全回滚快照",
            target_type="system",
            target_id="logs_rollback",
            target_name="回滚快照清理",
            detail=f"清理历史快照 {removed_count} 份: {', '.join(removed_files[:5])}",
        )

        return Response({
            "code": 0,
            "message": f"成功清理 {removed_count} 份历史快照，当前保留最新 {new_info['count']} 份！",
            "data": new_info,
        })


class AdminBackupRevertLatestView(APIView):
    """一键应急撤销恢复接口：快速回退至最近一次数据覆盖导入前的状态"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _check_admin_permission(request)
        if denied:
            return denied

        operator = getattr(request.user, "nickname", None) or getattr(request.user, "phone", "admin")
        ok, msg, summary = backup_service.revert_to_pre_restore_latest(operator_name=operator)
        if not ok:
            return Response({"code": 5009, "message": msg, "data": None}, status=status.HTTP_400_BAD_REQUEST)

        audit(
            request,
            action="backup_restore",
            action_label="一键撤销恢复",
            target_type="backup",
            target_id="pre_restore_snapshot_latest",
            target_name="应急回退",
            detail=f"{operator} 触发了一键紧急撤销，数据库已成功秒级回滚至导入前状态",
        )

        return Response({"code": 0, "message": msg, "data": summary})
