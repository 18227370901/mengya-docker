"""
Django 配置 - 萌芽母婴平台
支持两种启动方式：
  1. docker compose（通过 .env 注入 DATABASE_URL / REDIS_URL）
  2. 本地开发（python manage.py runserver，未配置 DATABASE_URL 时回退 SQLite）
"""
import os
import socket
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "mengya-dev-insecure-secret-key-32bytes!")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() in ("1", "true", "yes")

_env_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "").strip()
if DEBUG or not _env_hosts or "*" in _env_hosts:
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = [h.strip() for h in _env_hosts.split(",") if h.strip()]
    for _h in ("localhost", "127.0.0.1", "0.0.0.0", "backend"):
        if _h not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_h)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "drf_spectacular",
    "corsheaders",
    "apps.core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ===== 数据库 =====
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# 判断是否显式使用 PostgreSQL（基于协议头 postgresql:// 或 postgres://）
is_pg_scheme = DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")

if is_pg_scheme:
    p = urlparse(DATABASE_URL)
    db_host = p.hostname or "localhost"
    db_port = p.port or 5432
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": p.path.lstrip("/"),
            "USER": p.username,
            "PASSWORD": p.password,
            "HOST": db_host,
            "PORT": db_port,
            "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        }
    }
else:
    # 动态获取当前项目的绝对路径，不假设任何外部固定路径
    # 在当前项目根路径下动态新建/获取 data 目录，规范存储 SQLite 数据
    sqlite_env = os.getenv("SQLITE_PATH", "").strip()
    if sqlite_env:
        p_obj = Path(sqlite_env)
        if not p_obj.is_absolute():
            sqlite_file = (BASE_DIR / p_obj).resolve()
        else:
            sqlite_file = p_obj.resolve()
        sqlite_file.parent.mkdir(parents=True, exist_ok=True)
    else:
        data_dir = BASE_DIR / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        sqlite_file = data_dir / "db.sqlite3"
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": sqlite_file,
        }
    }
# ===== 认证 / JWT =====
AUTH_USER_MODEL = "core.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.core.utils.single_session_auth.SingleSessionJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "apps.core.utils.renderer.CustomJSONRenderer",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.utils.exceptions.custom_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "SIGNING_KEY": (lambda k: k.ljust(32, "!") if len(k) < 32 else k)(os.getenv("JWT_SECRET_KEY", "") or SECRET_KEY),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "萌芽母婴平台 API",
    "DESCRIPTION": "生命最初 3000 天陪伴平台",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

# ===== 国际化 =====
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATIC_DIR = BASE_DIR / "static"
STATICFILES_DIRS = [STATIC_DIR] if STATIC_DIR.exists() else []
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# ===== WhiteNoise 高效静态资源托管与内核零拷贝强缓存 =====
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}
WHITENOISE_AUTOREFRESH = DEBUG
WHITENOISE_MAX_AGE = 31536000 if not DEBUG else 0
WHITENOISE_ROOT = STATIC_DIR if STATIC_DIR.exists() else None

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ===== Celery（无 Redis 时降级为 eager）=====
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", os.getenv("REDIS_URL", ""))
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_ALWAYS_EAGER = not CELERY_BROKER_URL

# ===== AI 配置（可选）=====
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")

# ===== 限流 =====
RATE_LIMIT_LOGIN_PER_MINUTE = int(os.getenv("RATE_LIMIT_LOGIN_PER_MINUTE", "5"))
RATE_LIMIT_GENERAL_PER_MINUTE = int(os.getenv("RATE_LIMIT_GENERAL_PER_MINUTE", "30"))
