#!/usr/bin/env bash
# ============================================================
# 萌芽平台 (mengya-docker) - 自定义变量与配置解析模块
# ============================================================

init_default_configs() {
    PROJECT_ROOT="${PROJECT_ROOT:-$SCRIPT_DIR}"

    PORT="${PORT:-${EXTERNAL_PORT:-443}}"
    EXTERNAL_PORT="$PORT"
    # Docker 版本默认运行在 5174 端口，避免与传统版本默认的 5173 端口冲突
    # 如果环境变量被继承为 5173（例如来自同终端中启动的传统版本环境），且 .env 中未显式锁定为 5173，则自动纠正为 5174
    if [ "$FRONTEND_PORT" = "5173" ] && ! grep -q "^FRONTEND_PORT=" .env 2>/dev/null; then
        FRONTEND_PORT="5174"
    fi
    FRONTEND_PORT="${FRONTEND_PORT:-5174}"
    SERVER_NAME=$(normalize_domains "${SERVER_NAME:-${DOMAIN:-mengya-docker.local}}")

    ADMIN_USERNAME="${ADMIN_USERNAME:-${ADMIN_PHONE:-admin}}"
    ADMIN_PHONE="${ADMIN_PHONE:-$ADMIN_USERNAME}"
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
    ADMIN_NICKNAME="${ADMIN_NICKNAME:-管理员}"

    NGINX_CONF_DIR=$(resolve_abs_path "${NGINX_CONF_DIR:-/opt/service/nginx/conf.d}")
    NGINX_CERT_DIR=$(resolve_abs_path "${NGINX_CERT_DIR:-$SCRIPT_DIR/ssl}")
    if [ ! -d "$NGINX_CERT_DIR" ]; then
        mkdir -p "$NGINX_CERT_DIR"
    fi
    NGINX_CONF="$NGINX_CONF_DIR/mengya_docker_ssl.conf"
    ENABLE_HTTP_REDIRECT="${ENABLE_HTTP_REDIRECT:-1}"

    ENABLE_WORKER="${ENABLE_WORKER:-auto}"

    # 自动探测后端代码目录
    BACKEND_DIR="$SCRIPT_DIR"
    if [ -d "$SCRIPT_DIR/backend" ] && [ -f "$SCRIPT_DIR/backend/manage.py" ]; then
        BACKEND_DIR="$SCRIPT_DIR/backend"
    fi

    # ============================================================
    # 数据库与存储相关全量自定义变量声明（统一集中收拢于此）
    # 优先级规则：CLI 命令行参数 > .env 持久化配置 > 此处代码级默认值
    # 用户可在此一站式定义所有数据库默认参数
    # ============================================================
    APP_NAME="${APP_NAME:-mengya_docker}"
    DB_MODE="${DB_MODE:-shared}"                        # 数据库模式: sqlite | shared | dedicated (Docker版默认推荐 shared)
    DEFAULT_PG_IMAGE="${DEFAULT_PG_IMAGE:-postgres:15-alpine}" # 内置默认 PG 镜像（本地无现存镜像时自动拉取）
    DB_IMAGE="${DB_IMAGE:-}"                           # 指定 PG 镜像（为空时智能探针优先复用本地已有镜像）
    DB_PULL_POLICY="${DB_PULL_POLICY:-if_not_present}" # 镜像拉取策略: never | if_not_present
    DB_DATA_DIR="${DB_DATA_DIR:-/var/lib/postgresql/data}" # 容器内数据挂载目录
    DB_CONTAINER_NAME="${DB_CONTAINER_NAME:-${APP_NAME}-pg}" # 独立 PG 模式下的容器名
    SHARED_PG_CONTAINER="${SHARED_PG_CONTAINER:-}"     # 共享 PG 模式下的目标容器名（为空时探针自适应发现）
    POSTGRES_USER="${POSTGRES_USER:-mengya_docker}"           # PostgreSQL 用户名
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-mengya_docker123}" # PostgreSQL 密码
    POSTGRES_DB="${POSTGRES_DB:-mengya_docker}"               # PostgreSQL 数据库名/实例名
    POSTGRES_PORT="${POSTGRES_PORT:-5432}"             # PostgreSQL 连接端口
    POSTGRES_HOST="${POSTGRES_HOST:-db}"               # PostgreSQL 主机地址（独立容器为 db，共享模式默认为共享容器名）
    DATABASE_URL="${DATABASE_URL:-}"                   # 完整数据库连接串（支持在此直接定义或留空由脚本自动拼装）
    SQLITE_PATH="${SQLITE_PATH:-./data/db.sqlite3}"    # SQLite 本地文件持久化路径

    CMD=""
    CUSTOM_PORT=""
    CUSTOM_ADMIN_USER=""
    CUSTOM_ADMIN_PASS=""
    CUSTOM_ADMIN_NICK=""
    CUSTOM_DOMAIN=""
    CUSTOM_DB_IMAGE=""
    CUSTOM_DB_MODE=""
    CUSTOM_SHARED_PG=""
    CUSTOM_DB_USER=""
    CUSTOM_DB_PASS=""
    CUSTOM_DB_NAME=""
    CUSTOM_DB_PORT=""
    CUSTOM_DB_HOST=""
    CUSTOM_DATABASE_URL=""
    RECONFIG_DB=0
    NON_INTERACTIVE=0
    DO_BUILD=0
    NO_CACHE=0
    EXTRA_ARGS=""
}

parse_cli_args() {
while [ $# -gt 0 ]; do
    case "$1" in
        start|stop|restart|status|logs|build|clean|prune|add_nginx|exec|init_data|seed|db_backup|backup|db_restore|restore|reconfig|reconfig_db|help)
            if [ -z "$CMD" ]; then
                CMD="$1"
            else
                EXTRA_ARGS="${EXTRA_ARGS:+$EXTRA_ARGS }$1"
            fi
            shift
            ;;
        -b|--build)
            DO_BUILD=1
            shift
            ;;
        --no-cache)
            NO_CACHE=1
            DO_BUILD=1
            shift
            ;;
        --image|--db-image)
            CUSTOM_DB_IMAGE="$2"
            shift 2
            ;;
        -m|--mode|--db-mode)
            CUSTOM_DB_MODE="$2"
            shift 2
            ;;
        --shared-pg|--shared-container)
            CUSTOM_SHARED_PG="$2"
            shift 2
            ;;
        --db-user|--db-username)
            CUSTOM_DB_USER="$2"
            shift 2
            ;;
        --db-pass|--db-password)
            CUSTOM_DB_PASS="$2"
            shift 2
            ;;
        --db-name|--db-database)
            CUSTOM_DB_NAME="$2"
            shift 2
            ;;
        --db-port)
            CUSTOM_DB_PORT="$2"
            shift 2
            ;;
        --db-host)
            CUSTOM_DB_HOST="$2"
            shift 2
            ;;
        --database-url)
            CUSTOM_DATABASE_URL="$2"
            shift 2
            ;;
        --reconfig|--reconfig-db)
            RECONFIG_DB=1
            shift
            ;;
        -y|--yes|--non-interactive)
            NON_INTERACTIVE=1
            shift
            ;;
        -p|--port)
            CUSTOM_PORT="$2"
            shift 2
            ;;
        -u|--admin|--user|--username)
            CUSTOM_ADMIN_USER="$2"
            shift 2
            ;;
        -P|--password|--pass)
            CUSTOM_ADMIN_PASS="$2"
            shift 2
            ;;
        -n|--nickname)
            CUSTOM_ADMIN_NICK="$2"
            shift 2
            ;;
        -d|--domain|--server-name)
            CUSTOM_DOMAIN="$2"
            shift 2
            ;;
        -h|--help)
            CMD="help"
            shift
            ;;
        --)
            shift
            while [ $# -gt 0 ]; do EXTRA_ARGS="${EXTRA_ARGS:+$EXTRA_ARGS }$1"; shift; done
            break
            ;;
        *)
            if [ "$CMD" = "exec" ] || [ "$CMD" = "logs" ]; then
                EXTRA_ARGS="${EXTRA_ARGS:+$EXTRA_ARGS }$1"
            else
                echo -e "\033[1;33m[警告] 未知选项: $1\033[0m"
            fi
            shift
            ;;
    esac
done

if [ -z "$CMD" ]; then
    if [ "$RECONFIG_DB" = "1" ]; then
        CMD="reconfig"
    else
        CMD="help"
    fi
fi
}

apply_and_save_configs() {
# 应用自定义参数并持久化至 .env
if [ -n "$CUSTOM_PORT" ]; then
    FRONTEND_PORT="$CUSTOM_PORT"
    update_env_var "FRONTEND_PORT" "$CUSTOM_PORT"
    echo -e "\033[0;32m[配置] 前端访问端口已设置为: $CUSTOM_PORT (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_ADMIN_USER" ]; then
    ADMIN_USERNAME="$CUSTOM_ADMIN_USER"
    ADMIN_PHONE="$CUSTOM_ADMIN_USER"
    update_env_var "ADMIN_USERNAME" "$CUSTOM_ADMIN_USER"
    update_env_var "ADMIN_PHONE" "$CUSTOM_ADMIN_USER"
    echo -e "\033[0;32m[配置] 管理员账号已设置为: $CUSTOM_ADMIN_USER (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_ADMIN_PASS" ]; then
    ADMIN_PASSWORD="$CUSTOM_ADMIN_PASS"
    update_env_var "ADMIN_PASSWORD" "$CUSTOM_ADMIN_PASS"
    echo -e "\033[0;32m[配置] 管理员密码已更新 (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_ADMIN_NICK" ]; then
    ADMIN_NICKNAME="$CUSTOM_ADMIN_NICK"
    update_env_var "ADMIN_NICKNAME" "$CUSTOM_ADMIN_NICK"
fi

if [ -n "$CUSTOM_DOMAIN" ]; then
    SERVER_NAME=$(normalize_domains "$CUSTOM_DOMAIN")
    update_env_var "SERVER_NAME" "$SERVER_NAME"
    echo -e "\033[0;32m[配置] SNI 匹配域名已设置为: $SERVER_NAME (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_IMAGE" ]; then
    DB_IMAGE="$CUSTOM_DB_IMAGE"
    update_env_var "DB_IMAGE" "$CUSTOM_DB_IMAGE"
    echo -e "\033[0;32m[配置] 数据库镜像已指定为: $CUSTOM_DB_IMAGE (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_MODE" ]; then
    DB_MODE="$CUSTOM_DB_MODE"
    update_env_var "DB_MODE" "$CUSTOM_DB_MODE"
    echo -e "\033[0;32m[配置] 数据库部署模式已设置为: $CUSTOM_DB_MODE (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_SHARED_PG" ]; then
    SHARED_PG_CONTAINER="$CUSTOM_SHARED_PG"
    update_env_var "SHARED_PG_CONTAINER" "$CUSTOM_SHARED_PG"
    echo -e "\033[0;32m[配置] 共享 PostgreSQL 容器已指定为: $CUSTOM_SHARED_PG (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_USER" ]; then
    POSTGRES_USER="$CUSTOM_DB_USER"
    update_env_var "POSTGRES_USER" "$CUSTOM_DB_USER"
    echo -e "\033[0;32m[配置] 数据库用户名已设置为: $CUSTOM_DB_USER (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_PASS" ]; then
    POSTGRES_PASSWORD="$CUSTOM_DB_PASS"
    update_env_var "POSTGRES_PASSWORD" "$CUSTOM_DB_PASS"
    echo -e "\033[0;32m[配置] 数据库连接密码已更新 (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_NAME" ]; then
    POSTGRES_DB="$CUSTOM_DB_NAME"
    update_env_var "POSTGRES_DB" "$CUSTOM_DB_NAME"
    echo -e "\033[0;32m[配置] 数据库名/实例名已设置为: $CUSTOM_DB_NAME (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_PORT" ]; then
    POSTGRES_PORT="$CUSTOM_DB_PORT"
    update_env_var "POSTGRES_PORT" "$CUSTOM_DB_PORT"
    echo -e "\033[0;32m[配置] 数据库连接端口已设置为: $CUSTOM_DB_PORT (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DB_HOST" ]; then
    POSTGRES_HOST="$CUSTOM_DB_HOST"
    update_env_var "POSTGRES_HOST" "$CUSTOM_DB_HOST"
    echo -e "\033[0;32m[配置] 数据库主机地址已设置为: $CUSTOM_DB_HOST (已同步至 .env)\033[0m"
fi

if [ -n "$CUSTOM_DATABASE_URL" ]; then
    DATABASE_URL="$CUSTOM_DATABASE_URL"
    update_env_var "DATABASE_URL" "$CUSTOM_DATABASE_URL"
    echo -e "\033[0;32m[配置] 数据库连接串 DATABASE_URL 已直接指定 (已同步至 .env)\033[0m"
fi
}

export_runtime_vars() {
    export FRONTEND_PORT
    export ADMIN_USERNAME
    export ADMIN_PHONE
    export ADMIN_PASSWORD
    export ADMIN_NICKNAME
    export SERVER_NAME
    export EXTERNAL_PORT

    # 数据库与存储全量运行时变量导出
    export APP_NAME
    export DB_MODE
    export DEFAULT_PG_IMAGE
    export DB_IMAGE
    export DB_PULL_POLICY
    export DB_DATA_DIR
    export DB_CONTAINER_NAME
    export SHARED_PG_CONTAINER
    export POSTGRES_USER
    export POSTGRES_PASSWORD
    export POSTGRES_DB
    export POSTGRES_PORT
    export POSTGRES_HOST
    export DATABASE_URL
    export SQLITE_PATH
    export RECONFIG_DB
    export NON_INTERACTIVE

    # CLI 自定义覆盖暂存变量
    export CUSTOM_DB_IMAGE
    export CUSTOM_DB_MODE
    export CUSTOM_SHARED_PG
    export CUSTOM_DB_USER
    export CUSTOM_DB_PASS
    export CUSTOM_DB_NAME
    export CUSTOM_DB_PORT
    export CUSTOM_DB_HOST
    export CUSTOM_DATABASE_URL

    export DO_BUILD
    export NO_CACHE
    export EXTRA_ARGS
    export CMD
}
