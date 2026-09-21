# ============================================================
# 第一阶段：前端编译构建阶段（临时 Node 环境，不进入最终镜像）
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ .
RUN npm run build

# ============================================================
# 第二阶段：Django 后端一体化生产镜像（纯 Python 运行时，零 Node / 零 Nginx）
# ============================================================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 从前端构建阶段复制静态文件产物至后端模板与静态目录
COPY --from=frontend-builder /build/dist/index.html /app/templates/index.html
COPY --from=frontend-builder /build/dist/assets /app/static/assets
COPY --from=frontend-builder /build/dist/ /app/static/

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate && python manage.py init_data --skip-if-exists && python manage.py ensure_admin && python manage.py invalidate_tokens && python manage.py runserver 0.0.0.0:8000"]
