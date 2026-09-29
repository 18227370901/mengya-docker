#!/usr/bin/env bash
# ============================================================
# 萌芽（mengya）平台 - Docker 容器化模式管理脚本 (mengya-docker)
#
# 架构模型：
#   - 编排：Docker Compose 现代化微服务网络（db, backend 一体化, redis, worker）
#   - 宿主机暴露端口：仅一体化服务 5174 端口（通过 FRONTEND_PORT 避开传统版 5173，支持双版本共存）
#   - 容器内部安全隔离：PostgreSQL(5432)、Redis(6379) 仅在容器内网互联，不对宿主机暴露；Django(8000) 映射至宿主机 FRONTEND_PORT(5174)
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
# 若当前通过 sh / dash 启动，且系统存在 bash，自动无缝重入为 bash
if [ -z "$BASH_VERSION" ]; then
    if command -v bash >/dev/null 2>&1; then
        exec bash "$0" "$@"
    fi
fi

SCRIPT_SOURCE="${BASH_SOURCE:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE" 2>/dev/null || echo ".")" && pwd)"
cd "$SCRIPT_DIR"

# 1. 自动环境自愈检查：若 .env 不存在，优先从 .env.example 复制初始化
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "\033[1;33m[提示] 未找到 .env 配置文件，自动从 .env.example 复制初始化...\033[0m"
        cp ".env.example" ".env"
    else
        touch ".env"
    fi
fi

if [ -f ".env" ]; then
    # 自动修复 .env 中带空格但未加引号的值（避免 bash source .env 时报 command not found）
    sed -i.bak -E 's/^([A-Za-z0-9_]+)=([^"#][^#]*[[:space:]][^#]*)$/\1="\2"/' ".env" 2>/dev/null && rm -f ".env.bak"
    set -a
    # shellcheck disable=SC1091
    . ./.env 2>/dev/null || true
    set +a
fi

# 更新/持久化变量到 .env 文件的辅助函数

# 2. 依次动态载入 bin/ 目录下独立功能组件模块
for mod in env docker db nginx data; do
    mod_file="$SCRIPT_DIR/bin/${mod}.sh"
    if [ -f "$mod_file" ]; then
        # shellcheck disable=SC1090
        . "$mod_file"
    else
        echo -e "\033[1;31m[错误] 缺失核心组件: bin/${mod}.sh，请检查项目完整性！\033[0m" >&2
        exit 1
    fi
done



# 外部访问端口与域名设置（与传统版完全隔离）
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
# 核心生命周期管理函数（仅保留基础启停与状态检测）
# ============================================================

start_docker() {
    cleanup_cache
    check_docker_env
    setup_db_for_mode

    # 启动前预检宿主机端口冲突
    if ! check_port_conflict "$FRONTEND_PORT"; then
        exit 1
    fi

    # 补全主流程中缺失的 SSL 证书与 Nginx 配置创建函数调用
    gen_ssl_cert
    gen_nginx_config

    # 静态资源自愈：确保宿主机 static/fetal-stories 存在，避免挂载遮蔽容器内产物
    if [ ! -d "$PROJECT_ROOT/static/fetal-stories" ] && [ -d "$PROJECT_ROOT/frontend/public/fetal-stories" ]; then
        echo "  [自愈] 自动同步胎教故事静态产物至 static/fetal-stories (保障容器卷挂载)..."
        mkdir -p "$PROJECT_ROOT/static"
        cp -r "$PROJECT_ROOT/frontend/public/fetal-stories" "$PROJECT_ROOT/static/"
    fi

    local compose
    compose=$(compose_cmd)

    echo "==> 启动 Docker 容器服务"
    local extra_args
    extra_args=$(compose_extra_args "$compose")

    local up_flags="up -d --remove-orphans"
    if [ "$DO_BUILD" = "1" ]; then
        up_flags="$up_flags --build"
    fi

    echo "  正在启动容器 ($compose $extra_args $up_flags)..."
    # shellcheck disable=SC2086
    $compose $extra_args $up_flags

    if [ "$DO_BUILD" = "1" ]; then
        # 重新构建后，旧镜像变为无标签虚悬镜像，立即清理释放
        cleanup_docker_build_cache
    fi

    # 探活检查数据库容器（仅在 dedicated 独立专属容器模式下执行）
    if [ "$DB_MODE" = "dedicated" ]; then
        sleep 2
        local db_target_container="${DB_CONTAINER_NAME:-${APP_NAME:-mengya}-pg}"
        local db_status
        db_status=$(docker inspect --format='{{.State.Status}}' "$db_target_container" 2>/dev/null || echo "")
        if [ "$db_status" = "exited" ] || [ "$db_status" = "dead" ]; then
        echo ""
        echo -e "\033[1;31m============================================================\033[0m"
        echo -e "\033[1;31m[错误] 数据库容器 mengya_db 启动后异常退出！\033[0m"
        echo "--- 数据库最近日志 ---"
        $compose logs --tail=25 db 2>/dev/null || true
        echo "---------------------"
        if $compose logs db 2>&1 | grep -qiE "incompatible|pg_ctlcluster|unused mount|PG_VERSION"; then
            echo -e "\033[1;31m[根本原因] 检测到 PostgreSQL 数据卷版本不兼容或挂载路径冲突！\033[0m"
            echo -e "\033[1;33m[解决方案]："
            echo "  1. 若需保留原有数据：请指定原数据库镜像启动（如 DB_IMAGE=postgres:15-alpine ./run.sh start），执行 ./run.sh db_backup 备份数据，再切换至新镜像导入；"
            echo "  2. 若无需保留旧数据：请执行 docker compose down -v 清空旧数据卷，然后重新执行 ./run.sh start 自动全新初始化全量数据。\033[0m"
        fi
        echo -e "\033[1;31m============================================================\033[0m"
        exit 1
        fi
    fi

    # 探活检查后端一体化容器 mengya_backend 运行状态与初始化进度
    echo "  正在检测后端容器 mengya_backend 启动状态..."
    local backend_ready=0
    for _ in $(seq 1 12); do
        sleep 1
        local b_status
        b_status=$(docker inspect --format='{{.State.Status}}' mengya_backend 2>/dev/null || echo "")
        if [ "$b_status" = "running" ]; then
            backend_ready=1
            break
        elif [ "$b_status" = "exited" ] || [ "$b_status" = "dead" ]; then
            backend_ready=0
            break
        fi
    done

    local final_b_status
    final_b_status=$(docker inspect --format='{{.State.Status}}' mengya_backend 2>/dev/null || echo "")
    if [ "$final_b_status" = "exited" ] || [ "$final_b_status" = "dead" ]; then
        echo ""
        echo -e "\033[1;31m============================================================\033[0m"
        echo -e "\033[1;31m[错误] 后端一体化容器 mengya_backend 启动后异常退出！\033[0m"
        echo "--- 后端容器最近日志 ---"
        $compose logs --tail=40 backend 2>/dev/null || true
        echo "------------------------"
        echo -e "\033[1;31m============================================================\033[0m"
        exit 1
    fi

    echo ""
    echo "============================================"
    echo "  萌芽（mengya-docker）容器服务启动完成！"
    echo "  统一访问地址: http://localhost:$FRONTEND_PORT/ (已映射宿主机端口)"
    echo "  管理员账号:   $ADMIN_USERNAME"
    echo "  管理员密码:   $ADMIN_PASSWORD (容器启动自动 ensure_admin 同步)"
    if [ "$DB_MODE" = "sqlite" ]; then
        echo "  数据库模式:   [1] SQLite 本地化单文件 (./data/db.sqlite3, 零额外 PG 容器)"
    elif [ "$DB_MODE" = "shared" ]; then
        echo "  数据库模式:   [2] 共享 PostgreSQL 实例 (容器: $SHARED_PG_CONTAINER, 专属库: ${POSTGRES_DB:-mengya})"
    else
        echo "  数据库模式:   [3] 独立专属 PostgreSQL 容器 (${DB_CONTAINER_NAME:-${APP_NAME:-mengya}-pg})"
        echo "  数据库镜像:   $DB_IMAGE (拉取策略: $DB_PULL_POLICY, 挂载目录: $DB_DATA_DIR)"
    fi
    local MAIN_DOMAIN
    MAIN_DOMAIN=$(echo "$SERVER_NAME" | awk '{print $1}')
    [ -z "$MAIN_DOMAIN" ] && MAIN_DOMAIN="mengya-docker.local"
    echo "  Nginx SNI 匹配域名: $SERVER_NAME"
    if [ -f "$NGINX_CONF" ]; then
        echo "  Nginx 反代状态: 已配置 ($NGINX_CONF -> 443 端口)"
        print_access_urls "统一访问入口" "$EXTERNAL_PORT"
    else
        echo "  Nginx 反代状态: 尚未生成，可按需执行 ./run.sh add_nginx 生成"
    fi
    echo "  安全网络模型:"
    echo "    - 数据库 (PostgreSQL 5432): 内部互联，不对外暴露端口"
    echo "    - 缓存与队列 (Redis 6379):  内部互联，不对外暴露端口"
    echo "    - 一体化服务 (Django 8000): 映射宿主机端口 $FRONTEND_PORT (统一托管 API 与前端 SPA 页面)"
    echo "============================================"
}

stop_docker() {
    check_docker_env
    setup_db_for_mode
    local compose
    compose=$(compose_cmd)

    echo "==> 停止 Docker 容器服务"
    local extra_args
    extra_args=$(compose_extra_args "$compose")
    # shellcheck disable=SC2086
    $compose $extra_args down --remove-orphans
    echo "  容器已全部停止并释放网络资源"
    cleanup_docker_build_cache
}

restart_docker() {
    stop_docker
    sleep 1
    start_docker
    echo "  [会话安全] 正在执行会话强制注销，所有在线用户下线重新登录..."
    local compose
    compose=$(compose_cmd)
    if [ -n "$compose" ]; then
        $compose exec -T backend python manage.py invalidate_tokens 2>/dev/null || true
    fi
    echo "  ✅ 服务重启完成，所有历史登录会话已成功强制失效！"
}

status_docker() {
    check_docker_env
    setup_db_for_mode
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
    echo "  服务映射端口: $FRONTEND_PORT (一体化托管前端与后端)"
    echo "  数据库部署模式: $DB_MODE"
    if [ "$DB_MODE" = "sqlite" ]; then
        echo "  数据存储位置: 宿主机本地挂载 ./data/db.sqlite3 (零额外 PG 容器，极简运行)"
    elif [ "$DB_MODE" = "shared" ]; then
        echo "  共享 PG 容器: $SHARED_PG_CONTAINER (专属库: ${POSTGRES_DB:-mengya}, 用户: ${POSTGRES_USER:-mengya})"
    else
        echo "  独立 PG 容器: ${DB_CONTAINER_NAME:-${APP_NAME:-mengya}-pg}"
        echo "  数据库镜像  : $DB_IMAGE (拉取策略: $DB_PULL_POLICY, 挂载目录: $DB_DATA_DIR)"
    fi
    echo "  Nginx 配置文件: $([ -f "$NGINX_CONF" ] && echo "已就绪 ($NGINX_CONF)" || echo "未生成 (可执行 ./run.sh add_nginx)")"
    if [ -f "$NGINX_CONF" ]; then
        print_access_urls "统一访问入口" "$EXTERNAL_PORT"
    fi
    echo "============================================"
}


# 解析命令行参数与自定义变量
CMD=""
CUSTOM_PORT=""
CUSTOM_ADMIN_USER=""
CUSTOM_ADMIN_PASS=""
CUSTOM_ADMIN_NICK=""
CUSTOM_DOMAIN=""
CUSTOM_DB_IMAGE=""
CUSTOM_DB_MODE=""
CUSTOM_SHARED_PG=""
RECONFIG_DB=0
NON_INTERACTIVE=0
DO_BUILD=0
NO_CACHE=0
EXTRA_ARGS=""

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

[ -z "$CMD" ] && CMD="help"

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

# 导出供 docker compose 插值
export FRONTEND_PORT
export ADMIN_USERNAME
export ADMIN_PHONE
export ADMIN_PASSWORD
export ADMIN_NICKNAME
export SERVER_NAME
export EXTERNAL_PORT
export DB_MODE
export APP_NAME
export DB_CONTAINER_NAME
export SHARED_PG_CONTAINER
export RECONFIG_DB
export NON_INTERACTIVE

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
        logs_docker $EXTRA_ARGS
        ;;
    build)
        build_docker
        ;;
    clean|prune)
        cleanup_cache
        if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
            echo ""
            echo "==> 当前 Docker 磁盘使用概况："
            docker system df || true
        fi
        ;;
    add_nginx)
        gen_ssl_cert
        gen_nginx_config
        ;;
    exec)
        exec_docker $EXTRA_ARGS
        ;;
    init_data|seed)
        init_data_docker $EXTRA_ARGS
        ;;
    db_backup|backup)
        db_backup $EXTRA_ARGS
        ;;
    db_restore|restore)
        db_restore $EXTRA_ARGS
        ;;
    reconfig|reconfig_db)
        RECONFIG_DB=1
        setup_db_for_mode
        echo -e "\033[0;32m[完成] 数据库模式已重新配置并保存至 .env (当前模式: $DB_MODE)\033[0m"
        ;;
    help)
        echo ""
        echo "萌芽（mengya-docker）容器模式管理命令："
        echo "  ./run.sh start [选项]        启动 Docker 容器服务（启动前自动清理垃圾与缓存）"
        echo "  ./run.sh stop                停止 Docker 容器服务并释放网络"
        echo "  ./run.sh restart [选项]      重启 Docker 容器服务（重启前自动清理垃圾与缓存）"
        echo "  ./run.sh status              查看各容器运行状态与健康指标"
        echo "  ./run.sh logs [svc]          查看容器实时运行日志（如 ./run.sh logs backend）"
        echo "  ./run.sh build               手动重新构建容器镜像（构建后自动清理旧残留层）"
        echo "  ./run.sh clean               一键清理残留构建缓存层、虚悬镜像与本地冗余垃圾"
        echo "  ./run.sh add_nginx [选项]    生成宿主机 /opt/service/nginx/conf.d 独立反代配置（与传统版零冲突）"
        echo "  ./run.sh exec <cmd>          在 backend 容器中执行任意命令"
        echo "  ./run.sh init_data [选项]    检查并补齐全量样例数据（食谱/胎教/百科/周历/清单/商品/品牌）"
        echo "  ./run.sh db_backup [文件]    导出数据库数据备份（跨版本通用 JSON 或 SQL）"
        echo "  ./run.sh db_restore <文件>   恢复导入数据库数据备份（支持 JSON 或 SQL）"
        echo "  ./run.sh reconfig            交互式重新配置数据库存储方式（并自动更新 .env）"
        echo "  ./run.sh help                查看帮助信息"
        echo ""
        echo "常用自定义选项（支持在 start / restart / add_nginx 时追加，自动持久化至 .env）："
        echo "  -p, --port <PORT>            自定义前端访问端口（默认 5174）"
        echo "  -u, --admin <USER>           自定义超级管理员账号/手机号（默认 admin）"
        echo "  -P, --password <PASS>        自定义超级管理员登录密码（默认 admin123）"
        echo "  -n, --nickname <NAME>        自定义管理员昵称（默认 管理员）"
        echo "  -d, --domain <DOMAIN>        自定义绑定的 SNI 域名（默认 mengya-docker.local）"
        echo "  -b, --build                  启动时强制重新构建容器镜像（构建后自动清理旧残留层）"
        echo "  --no-cache                   构建时禁用缓存并彻底重新编译镜像"
        echo "  --db-image <IMAGE>           指定数据库镜像（如 pgvector/pgvector:pg18 或 postgres:15-alpine）"
        echo "  -m, --mode <MODE>            显式指定数据库模式 (sqlite | shared | dedicated)"
        echo "  --reconfig, --reconfig-db    重新唤起数据库决策向导，交互式切换数据库存储模式"
        echo "  --shared-pg <CONTAINER>      指定共享模式下的宿主机 PostgreSQL 容器名称"
        echo "  -y, --yes                    非交互式模式，免去任何等待（Cron / 重启自动采用推荐值）"
        echo ""
        echo "实用启动示例："
        echo "  ./run.sh start                                 # 默认启动（端口 5174，管理员 admin / admin123）"
        echo "  ./run.sh start -p 8080                         # 自定义以 8080 端口启动"
        echo "  ./run.sh start --reconfig                      # 重新选择数据库模式（独立PG / 共享PG / SQLite）"
        echo "  ./run.sh start -m dedicated                    # 直接以独立专属 PG 模式启动并保存至 .env"
        echo "  ./run.sh start -m shared                       # 直接以共享宿主机已有 PG 模式启动并保存至 .env"
        echo "  ./run.sh start -p 5200 -u superadmin -P Pass123 # 自定义端口与管理员账密启动"
        echo "  ./run.sh restart -p 5300                       # 重启并变更为 5300 端口"
        echo "  ./run.sh add_nginx -d mengya.myhost.com        # 为指定域名生成独立反代配置"
        echo ""
        show_db_reconfig_guide
        ;;
    *)
        echo "未知命令: $CMD"
        echo "支持的子命令: start | stop | restart | status | logs | build | clean | add_nginx | exec | help"
        exit 1
        ;;
esac

