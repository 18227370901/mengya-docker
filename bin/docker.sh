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
