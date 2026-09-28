# ============================================================
# 萌芽（mengya）纯 Python 一体化生产镜像
# 零 Node / 零 npm 运行时依赖，直接使用仓库内预编译前端资产
# 云端服务器 git clone 即拉即跑，构建仅需 ~10 秒，彻底杜绝服务器 OOM
# ============================================================
FROM python:3.11-slim

# 生产级极致轻量化运行时配置：
# 1. PYTHONOPTIMIZE=1: 剔除文档字符串与断言，精简解释器底噪
# 2. MALLOC_ARENA_MAX=2: 压制 glibc 内存池膨胀，抑制多线程内存碎片并强制归还内核
# 3. DJANGO_DEBUG=False: 彻底根除 connection.queries 造成的 SQL 记录内存泄漏
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONOPTIMIZE=1 \
    MALLOC_ARENA_MAX=2 \
    DJANGO_DEBUG=False

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 将项目全量资产（包含预编译好的 templates/ 与 static/）同步写入镜像
COPY . .

EXPOSE 8000

# 生产级 WSGI 运行规范：单 Worker + 4 轻量线程 (gthread)，彻底废除 runserver 磁盘轮询，待机 CPU 直降至 0%
CMD ["sh", "-c", "python manage.py migrate && python manage.py init_data --skip-if-exists && python manage.py ensure_admin && python manage.py invalidate_tokens && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 1 --threads 4 --worker-class gthread --max-requests 1000 --max-requests-jitter 100 --timeout 60"]
