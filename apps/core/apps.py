from django.apps import AppConfig
from django.db.backends.signals import connection_created


def _enable_sqlite_wal(sender, connection, **kwargs):
    if connection.vendor == "sqlite":
        try:
            cursor = connection.cursor()
            cursor.execute("PRAGMA journal_mode = WAL;")
            cursor.execute("PRAGMA synchronous = NORMAL;")
        except Exception:
            pass


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "萌芽核心业务"

    def ready(self):
        connection_created.connect(_enable_sqlite_wal)
