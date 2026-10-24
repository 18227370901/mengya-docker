from django.conf import settings
from django.db import models


class BackupConfig(models.Model):
    """WebDAV 远端备份与灾难恢复配置（系统全局单例，id=1）"""

    webdav_url = models.CharField(max_length=255, blank=True, default="", verbose_name="WebDAV服务器地址")
    webdav_username = models.CharField(max_length=100, blank=True, default="", verbose_name="用户名")
    webdav_password = models.CharField(max_length=255, blank=True, default="", verbose_name="密码或授权码")
    backup_path = models.CharField(max_length=255, default="/mengya_backups/", verbose_name="网盘备份路径")
    backup_subdir = models.CharField(max_length=100, default="mengya_backups", verbose_name="备份子目录")
    config_alias = models.CharField(max_length=100, blank=True, default="坚果云/WebDAV备份", verbose_name="配置别称")
    backup_encrypt_password = models.CharField(max_length=255, blank=True, default="", verbose_name="预设加密密码")
    max_rollback_copies = models.PositiveIntegerField(default=3, verbose_name="回滚快照最多保留份数")
    last_backup_time = models.DateTimeField(null=True, blank=True, verbose_name="最后备份时间")
    last_status = models.CharField(max_length=255, blank=True, default="", verbose_name="最后备份状态")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        verbose_name = "WebDAV备份配置"
        verbose_name_plural = "WebDAV备份配置"

    @classmethod
    def get_config(cls):
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                "backup_path": "/mengya_backups/",
                "backup_subdir": "mengya_backups",
                "config_alias": "WebDAV云端备份",
            },
        )
        return obj

    @property
    def server_url(self):
        return self.webdav_url

    @server_url.setter
    def server_url(self, val):
        self.webdav_url = val

    @property
    def username(self):
        return self.webdav_username

    @username.setter
    def username(self, val):
        self.webdav_username = val

    @property
    def password(self):
        return self.webdav_password

    @password.setter
    def password(self, val):
        self.webdav_password = val

    def __str__(self):
        return f"BackupConfig({self.config_alias or self.webdav_url or '未配置'})"


class ScheduledBackupTask(models.Model):
    """定时自动备份任务"""

    TASK_TYPE_CHOICES = [
        ("full_backup", "全量系统快照备份（含全部数据与配置）"),
        ("db_backup", "纯数据库备份"),
        ("custom", "自定义运维脚本"),
    ]

    name = models.CharField(max_length=100, default="每日凌晨全量备份", verbose_name="任务名称")
    cron_expr = models.CharField(max_length=50, default="0 2 * * *", verbose_name="Cron 表达式")
    is_enabled = models.BooleanField(default=True, verbose_name="是否启用")
    encrypt_enabled = models.BooleanField(default=False, verbose_name="是否启用加密")
    task_type = models.CharField(max_length=20, choices=TASK_TYPE_CHOICES, default="full_backup", verbose_name="任务类型")
    custom_script = models.TextField(blank=True, default="", verbose_name="自定义脚本内容")
    last_run_time = models.DateTimeField(null=True, blank=True, verbose_name="上次执行时间")
    last_run_status = models.CharField(max_length=255, blank=True, default="", verbose_name="上次执行状态")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_backup_tasks",
        verbose_name="创建者",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "定时备份任务"
        verbose_name_plural = "定时备份任务"

    def __str__(self):
        return f"{self.name} ({self.cron_expr}) - {'启用' if self.is_enabled else '禁用'}"


class ScheduledTaskExecutionLog(models.Model):
    """定时任务执行日志"""

    task = models.ForeignKey(
        ScheduledBackupTask,
        on_delete=models.CASCADE,
        related_name="execution_logs",
        verbose_name="所属任务",
    )
    start_time = models.DateTimeField(auto_now_add=True, verbose_name="开始时间")
    end_time = models.DateTimeField(null=True, blank=True, verbose_name="结束时间")
    status = models.CharField(max_length=20, default="running", verbose_name="执行状态")
    output_log = models.TextField(blank=True, default="", verbose_name="执行日志详情")
    executed_by = models.CharField(max_length=100, default="system", verbose_name="执行人")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")

    class Meta:
        ordering = ["-start_time"]
        verbose_name = "任务执行日志"
        verbose_name_plural = "任务执行日志"

    def __str__(self):
        return f"[{self.start_time:%Y-%m-%d %H:%M:%S}] {self.task.name} ({self.status})"
