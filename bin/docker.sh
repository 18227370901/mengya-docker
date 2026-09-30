#!/usr/bin/env bash
# ============================================================
# 萌芽平台 (mengya-docker) - Docker 引擎与 Compose 编排交互模块
# ============================================================

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

    # 动态载入数据库部署模式对应的 compose 文件配置
    local target_files="${COMPOSE_FILE:-docker-compose.yml:docker-compose.db.yml}"
    local old_ifs="$IFS"
    IFS=":"
    for cf in $target_files; do
        if [ -f "$SCRIPT_DIR/$cf" ]; then
            args="$args -f $cf"
        fi
    done
    IFS="$old_ifs"

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

image_exists() {
    local img="$1"
    [ -z "$img" ] && return 1
    docker image inspect "$img" >/dev/null 2>&1
}

build_docker() {
    check_docker_env
    choose_db_image
    local compose
    compose=$(compose_cmd)
    local extra_args
    extra_args=$(compose_extra_args "$compose")
    local build_opts=""
    if [ "$NO_CACHE" = "1" ]; then
        build_opts="--no-cache"
        echo "==> 手动无缓存全新构建 Docker 容器镜像 ($compose build --no-cache)..."
    else
        echo "==> 手动构建 Docker 容器镜像 ($compose build)..."
    fi
    # shellcheck disable=SC2086
    $compose $extra_args build $build_opts
    cleanup_docker_build_cache
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

clean_docker() {
    cleanup_cache
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        echo ""
        echo "==> 当前 Docker 资源使用概况："
        docker system df || true
    fi
}

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

    # 在共享 PG 模式下，二次确保目标容器已接入 Compose 专属网络以支持 DNS 寻址
    if [ "$DB_MODE" = "shared" ] && [ -n "$SHARED_PG_CONTAINER" ]; then
        local net_name="${COMPOSE_PROJECT_NAME:-mengya-docker}_net"
        docker network connect "$net_name" "$SHARED_PG_CONTAINER" 2>/dev/null || true
    fi

    # 探活检查数据库容器（仅在 dedicated 独立专属容器模式下执行）
    if [ "$DB_MODE" = "dedicated" ]; then
        sleep 2
        local db_target_container="${DB_CONTAINER_NAME:-${APP_NAME:-mengya_docker}-pg}"
        local db_status
        db_status=$(docker inspect --format='{{.State.Status}}' "$db_target_container" 2>/dev/null || echo "")
        if [ "$db_status" = "exited" ] || [ "$db_status" = "dead" ]; then
        echo ""
        echo -e "\033[1;31m============================================================\033[0m"
        echo -e "\033[1;31m[错误] 数据库容器 $db_target_container 启动后异常退出！\033[0m"
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

    # 探活检查后端一体化容器运行状态与初始化进度
    local backend_container="${APP_NAME:-mengya_docker}_backend"
    echo "  正在检测后端容器 $backend_container 启动状态..."
    local backend_ready=0
    for _ in $(seq 1 12); do
        sleep 1
        local b_status
        b_status=$(docker inspect --format='{{.State.Status}}' "$backend_container" 2>/dev/null || echo "")
        if [ "$b_status" = "running" ]; then
            backend_ready=1
            break
        elif [ "$b_status" = "exited" ] || [ "$b_status" = "dead" ]; then
            backend_ready=0
            break
        fi
    done

    local final_b_status
    final_b_status=$(docker inspect --format='{{.State.Status}}' "$backend_container" 2>/dev/null || echo "")
    if [ "$final_b_status" = "exited" ] || [ "$final_b_status" = "dead" ]; then
        echo ""
        echo -e "\033[1;31m============================================================\033[0m"
        echo -e "\033[1;31m[错误] 后端一体化容器 $backend_container 启动后异常退出！\033[0m"
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
        echo "  数据库模式:   [2] 共享 PostgreSQL 实例 (容器: $SHARED_PG_CONTAINER, 专属库: $POSTGRES_DB)"
    else
        echo "  数据库模式:   [3] 独立专属 PostgreSQL 容器 (${DB_CONTAINER_NAME:-${APP_NAME:-mengya_docker}-pg})"
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
        echo "  共享 PG 容器: $SHARED_PG_CONTAINER (专属库: $POSTGRES_DB, 用户: $POSTGRES_USER)"
    else
        echo "  独立 PG 容器: ${DB_CONTAINER_NAME:-${APP_NAME:-mengya_docker}-pg}"
        echo "  数据库镜像  : $DB_IMAGE (拉取策略: $DB_PULL_POLICY, 挂载目录: $DB_DATA_DIR)"
    fi
    echo "  Nginx 配置文件: $([ -f "$NGINX_CONF" ] && echo "已就绪 ($NGINX_CONF)" || echo "未生成 (可执行 ./run.sh add_nginx)")"
    if [ -f "$NGINX_CONF" ]; then
        print_access_urls "统一访问入口" "$EXTERNAL_PORT"
    fi
    echo "============================================"
}
