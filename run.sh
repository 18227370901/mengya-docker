#!/usr/bin/env bash
# ============================================================
# 萌芽（mengya）平台 - Docker 容器化模式管理脚本 (mengya-docker)
#
# 架构模型：
#   - 编排：Docker Compose 现代化微服务网络（db, backend, frontend, redis, worker）
#   - 宿主机暴露端口：仅前端 5174 端口（通过 FRONTEND_PORT 避开传统版 5173，支持双版本共存）
#   - 容器内部安全隔离：PostgreSQL(5432)、Redis(6379)、Django(8000) 均仅在容器内网互联，不对宿主机暴露
#   - 宿主机 Nginx 集成：支持 ./run.sh add_nginx 生成 /opt/service/nginx/conf.d/mengya_docker_ssl.conf，实现 443 SNI 多站点无冲突共存
#
# 支持命令：
#   ./run.sh start        启动 Docker 容器服务（启动前自动清理缓存与垃圾）
#   ./run.sh stop         停止并清理容器网络
#   ./run.sh restart      重启 Docker 容器服务（重启前自动清理缓存与垃圾）
#   ./run.sh status       查看各容器运行状态与健康指标
#   ./run.sh logs [svc]   查看容器实时运行日志（如 ./run.sh logs backend）
#   ./run.sh build        手动重新构建容器镜像
#   ./run.sh add_nginx    向宿主机 /opt/service/nginx/conf.d 写入独立 SSL 反代配置（与传统版零冲突）
#   ./run.sh exec <cmd>   在后端容器中执行任意 manage.py 或 shell 命令
#   ./run.sh help         查看帮助信息
# ============================================================

set -e

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" 2>/dev/null || echo ".")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

# 外部访问端口与域名设置（与传统版完全隔离）
PORT="${PORT:-${EXTERNAL_PORT:-443}}"
EXTERNAL_PORT="$PORT"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"
SERVER_NAME="${SERVER_NAME:-${DOMAIN:-mengya-docker.local}}"

NGINX_CONF_DIR="${NGINX_CONF_DIR:-/opt/service/nginx/conf.d}"
NGINX_CERT_DIR="${NGINX_CERT_DIR:-/opt/service/nginx/ssl}"
NGINX_CONF="$NGINX_CONF_DIR/mengya_docker_ssl.conf"
ENABLE_HTTP_REDIRECT="${ENABLE_HTTP_REDIRECT:-1}"

ENABLE_WORKER="${ENABLE_WORKER:-auto}"

# 自动探测后端代码目录
BACKEND_DIR="$SCRIPT_DIR"
if [ -d "$SCRIPT_DIR/backend" ] && [ -f "$SCRIPT_DIR/backend/manage.py" ]; then
    BACKEND_DIR="$SCRIPT_DIR/backend"
fi

compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

check_docker_env() {
    local compose
    compose=$(compose_cmd)
    if [ -z "$compose" ]; then
        echo "  [错误] 未找到 docker compose 或 docker-compose，请先安装 Docker 及 Compose 插件。"
        exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
        echo "  [错误] Docker 引擎未运行，请先启动 Docker Desktop 或 Docker 守护进程。"
        exit 1
    fi
}

cleanup_cache() {
    echo -e "\x1b[32m正在清理本地缓存与 .git 冗余垃圾...\x1b[0m"
    cd "$SCRIPT_DIR" || return
    if [ -d ".git" ] && command -v git > /dev/null 2>&1; then
        git reflog expire --expire=now --all 2>/dev/null || true
        git gc --prune=now 2>/dev/null || true
        echo -e "\x1b[32m✅ .git 冗余垃圾清理完成! 当前 .git 体积: $(du -sh .git 2>/dev/null | cut -f1)\x1b[0m"
    fi
    find "$SCRIPT_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find "$SCRIPT_DIR" -type f -name "*.pyc" -delete 2>/dev/null || true
    rm -rf /tmp/gift-backup 2>/dev/null || true
}

has_celery_tasks() {
    if [ -d "$BACKEND_DIR/apps" ] && grep -rqE "from celery|import celery|@shared_task" "$BACKEND_DIR/apps" 2>/dev/null; then
        return 0
    fi
    return 1
}

compose_supports_profiles() {
    local compose="$1"
    local help_out
    help_out=$($compose --help 2>&1 || true)
    echo "$help_out" | grep -q -- "--profile"
}

compose_extra_args() {
    local compose="$1"
    local args=""
    local supports_profiles=0
    if compose_supports_profiles "$compose"; then
        supports_profiles=1
    fi

    local need_worker=0
    if [ "$ENABLE_WORKER" = "1" ]; then
        need_worker=1
    elif [ "$ENABLE_WORKER" = "auto" ] && has_celery_tasks; then
        need_worker=1
    fi

    if [ "$need_worker" = "1" ]; then
        if [ "$supports_profiles" = "1" ]; then
            args="$args --profile celery"
        fi
    fi

    echo "$args"
}

start_docker() {
    cleanup_cache
    check_docker_env
    local compose
    compose=$(compose_cmd)

    echo "==> 启动 Docker 容器服务"
    local extra_args
    extra_args=$(compose_extra_args "$compose")

    echo "  正在启动容器 ($compose $extra_args up -d)..."
    # shellcheck disable=SC2086
    $compose $extra_args up -d

    echo ""
    echo "============================================"
    echo "  萌芽（mengya-docker）容器服务启动完成！"
    echo "  直连访问地址: http://localhost:$FRONTEND_PORT/ (已避开传统版 5173 端口)"
    local PRIMARY_DOMAIN
    PRIMARY_DOMAIN=$(echo "$SERVER_NAME" | awk '{print $1}')
    [ -z "$PRIMARY_DOMAIN" ] && PRIMARY_DOMAIN="mengya-docker.local"
    echo "  Nginx SNI 域名: $PRIMARY_DOMAIN"
    if [ -f "$NGINX_CONF" ]; then
        echo "  Nginx 反代状态: 已配置 ($NGINX_CONF -> 443 端口)"
        echo "  统一访问入口: https://$PRIMARY_DOMAIN/ (与传统版共存，零冲突)"
    else
        echo "  Nginx 反代状态: 尚未生成，可按需执行 ./run.sh add_nginx 生成"
    fi
    echo "  安全网络模型:"
    echo "    - 数据库 (PostgreSQL 5432): 内部互联，不对外暴露端口"
    echo "    - 缓存与队列 (Redis 6379):  内部互联，不对外暴露端口"
    echo "    - 后端 API (Django 8000):   内部互联，不对外暴露端口"
    echo "============================================"
}

stop_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)

    echo "==> 停止 Docker 容器服务"
    local extra_args
    extra_args=$(compose_extra_args "$compose")
    # shellcheck disable=SC2086
    $compose $extra_args down --remove-orphans
    echo "  容器已全部停止并释放网络资源"
}

restart_docker() {
    stop_docker
    sleep 1
    start_docker
}

status_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)

    echo "============================================"
    echo "  萌芽（mengya-docker）容器服务运行状态"
    echo "============================================"
    local extra_args
    extra_args=$(compose_extra_args "$compose")
    # shellcheck disable=SC2086
    $compose $extra_args ps -a
    echo "--------------------------------------------"
    echo "  前端映射端口: $FRONTEND_PORT"
    echo "  Nginx 配置文件: $([ -f "$NGINX_CONF" ] && echo "已就绪 ($NGINX_CONF)" || echo "未生成 (可执行 ./run.sh add_nginx)")"
    echo "============================================"
}

logs_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)
    local service="$1"

    local extra_args
    extra_args=$(compose_extra_args "$compose")
    if [ -n "$service" ]; then
        # shellcheck disable=SC2086
        $compose $extra_args logs -f "$service"
    else
        # shellcheck disable=SC2086
        $compose $extra_args logs -f
    fi
}

build_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)
    echo "==> 手动构建 Docker 容器镜像 ($compose build)..."
    local extra_args
    extra_args=$(compose_extra_args "$compose")
    # shellcheck disable=SC2086
    $compose $extra_args build
}

gen_nginx_config() {
    echo "==> 生成针对宿主机 Nginx 的独立 SSL 反向代理配置 (Docker版)"
    mkdir -p "$NGINX_CONF_DIR" "$NGINX_CERT_DIR"

    local PRIMARY_DOMAIN
    PRIMARY_DOMAIN=$(echo "$SERVER_NAME" | awk '{print $1}')
    [ -z "$PRIMARY_DOMAIN" ] && PRIMARY_DOMAIN="mengya-docker.local"

    local CERT_FILE="$NGINX_CERT_DIR/mengya_docker.crt"
    local KEY_FILE="$NGINX_CERT_DIR/mengya_docker.key"

    if [ ! -f "$CERT_FILE" ]; then
        echo "  生成独立自签名 SSL 证书（SNI 域名: $PRIMARY_DOMAIN）..."
        if command -v openssl >/dev/null 2>&1; then
            openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" \
                -out "$CERT_FILE" -days 365 -nodes \
                -subj "/C=CN/O=mengya-docker/CN=$PRIMARY_DOMAIN" \
                -addext "subjectAltName=DNS:$PRIMARY_DOMAIN,DNS:localhost,IP:127.0.0.1" 2>/dev/null || \
            openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" \
                -out "$CERT_FILE" -days 365 -nodes \
                -subj "/C=CN/O=mengya-docker/CN=$PRIMARY_DOMAIN" 2>/dev/null || true
            echo "  独立证书已生成: $CERT_FILE"
        else
            echo "  [警告] 未找到 openssl，跳过证书生成，请手动放置证书至 $NGINX_CERT_DIR/"
        fi
    else
        echo "  已存在独立 SSL 证书: $CERT_FILE（跳过重新生成）"
    fi

    local REDIRECT_BLOCK=""
    if [ "$ENABLE_HTTP_REDIRECT" = "1" ] && [ "$EXTERNAL_PORT" = "443" ]; then
        REDIRECT_BLOCK="
# HTTP 80 自动重定向到 HTTPS 443（仅匹配 $SERVER_NAME，不干扰其他站点）
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    return 301 https://\$host\$request_uri;
}
"
    fi

    cat > "$NGINX_CONF" << EOF
# ============================================================
# 萌芽平台 (Docker 版) - 宿主机 Nginx HTTPS (SNI 443) 反向代理配置
# 配置文件: $NGINX_CONF (独立命名，绝不覆盖传统版 mengya_ssl.conf)
# 访问端口: $EXTERNAL_PORT (HTTPS 标准端口，通过 SNI 域名识别)
# 匹配域名: $SERVER_NAME (与传统版域名隔离)
# 后端反代: http://127.0.0.1:$FRONTEND_PORT (Docker 映射端口)
# 自动生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================
${REDIRECT_BLOCK}
server {
    listen $EXTERNAL_PORT ssl;
    listen [::]:$EXTERNAL_PORT ssl;
    server_name $SERVER_NAME;

    # 独立 SSL 证书与私钥
    ssl_certificate     $CERT_FILE;
    ssl_certificate_key $KEY_FILE;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL_DOCKER:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # 安全响应头
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 文件上传限制
    client_max_body_size 20M;

    # 反向代理至 Docker 映射的前端服务（前端内部反代后端 API 与 Admin）
    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket 支持 (Vite HMR)
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }
}
EOF

    echo "  配置文件已生成: $NGINX_CONF"
    echo "  配置优势: 与传统版完全隔离，通过 SNI 域名 ($PRIMARY_DOMAIN) 共享 443 端口！"
    echo "  请执行 'nginx -t && nginx -s reload' 加载新配置。"
}

exec_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)
    if [ $# -eq 0 ]; then
        echo "用法: ./run.sh exec <command>"
        echo "示例: ./run.sh exec python manage.py showmigrations"
        exit 1
    fi
    $compose exec backend "$@"
}

CMD="${1:-}"
shift || true
case "$CMD" in
    start)
        start_docker
        ;;
    stop)
        stop_docker
        ;;
    restart)
        restart_docker
        ;;
    status)
        status_docker
        ;;
    logs)
        logs_docker "$@"
        ;;
    build)
        build_docker
        ;;
    add_nginx)
        gen_nginx_config
        ;;
    exec)
        exec_docker "$@"
        ;;
    help|--help|-h|"")
        echo ""
        echo "萌芽（mengya-docker）容器模式管理命令："
        echo "  ./run.sh start        启动 Docker 容器服务（启动前自动清理垃圾缓存）"
        echo "  ./run.sh stop         停止 Docker 容器服务并释放网络"
        echo "  ./run.sh restart      重启 Docker 容器服务（重启前自动清理垃圾缓存）"
        echo "  ./run.sh status       查看各容器运行状态与健康指标"
        echo "  ./run.sh logs [svc]   查看容器实时运行日志（如 ./run.sh logs backend）"
        echo "  ./run.sh build        手动重新构建容器镜像"
        echo "  ./run.sh add_nginx    生成宿主机 /opt/service/nginx/conf.d 独立反代配置（与传统版零冲突）"
        echo "  ./run.sh exec <cmd>   在 backend 容器中执行任意命令"
        echo "  ./run.sh help         查看帮助信息"
        echo ""
        echo "常用环境变量配置项（可在 .env 中定义或命令行前缀）："
        echo "  FRONTEND_PORT=5174    前端映射端口（默认 5174，避开传统版 5173）"
        echo "  SERVER_NAME=...       SNI 匹配域名（默认 mengya-docker.local）"
        echo "  PORT / EXTERNAL_PORT  外部 HTTPS 访问端口（默认 443）"
        echo ""
        ;;
    *)
        echo "未知命令: $CMD"
        echo "支持的子命令: start | stop | restart | status | logs | build | add_nginx | exec | help"
        exit 1
        ;;
esac
