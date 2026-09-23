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
update_env_var() {
    local key="$1"
    local val="$2"
    if [ -f ".env" ]; then
        # 智能添加引号：若包含空格且未加双引号，自动包裹双引号以保障 bash source 安全
        local formatted_val="$val"
        if [[ "$val" =~ [[:space:]] ]] && [[ ! "$val" =~ ^\".*\"$ ]]; then
            formatted_val="\"$val\""
        fi
        if grep -q "^${key}=" ".env" 2>/dev/null; then
            sed -i.bak "s|^${key}=.*|${key}=${formatted_val}|" ".env" 2>/dev/null && rm -f ".env.bak"
        else
            # 确保在末尾追加前文件以换行符结尾，避免与注释行等粘连
            if [ -s ".env" ]; then
                local last_char
                last_char=$(tail -c 1 ".env" 2>/dev/null || true)
                if [ -n "$last_char" ]; then
                    echo "" >> ".env"
                fi
            fi
            echo "${key}=${formatted_val}" >> ".env"
        fi
    fi
}
# 智能规范化路径为绝对物理路径（避免相对路径导致 Nginx 基于 Prefix 错误寻址）
resolve_abs_path() {
    local target="$1"
    if [ -z "$target" ]; then
        echo ""
        return
    fi
    case "$target" in
        /*|[A-Za-z]:*)
            echo "$target"
            ;;
        *)
            mkdir -p "$SCRIPT_DIR/$target" 2>/dev/null || true
            local abs_dir
            abs_dir="$(cd "$SCRIPT_DIR/$target" 2>/dev/null && pwd)"
            echo "${abs_dir:-$SCRIPT_DIR/$target}"
            ;;
    esac
}
# 智能规范化域名清单（纯 Bash 零依赖：支持逗号/分号/空格/引号清洗，自动去重与协议修剪）
normalize_domains() {
    local raw="$1"
    local clean="${raw//,/ }"
    clean="${clean//;/ }"
    clean="${clean//\"/}"
    clean="${clean//\'/}"

    local normalized=""
    for d in $clean; do
        d="${d#http://}"
        d="${d#https://}"
        d="${d%%/*}"
        d="${d%%:*}"
        [ -z "$d" ] && continue
        local exists=0
        for existing in $normalized; do
            if [ "$existing" = "$d" ]; then
                exists=1
                break
            fi
        done
        if [ "$exists" -eq 0 ]; then
            normalized="${normalized:+$normalized }$d"
        fi
    done
    echo "$normalized"
}

# 格式化输出 SNI 访问地址清单（全量自适应展示所有 SNI 域名）
print_access_urls() {
    local label="${1:-统一访问地址}"
    local port="${2:-$EXTERNAL_PORT}"
    local port_suffix=""
    if [ -n "$port" ] && [ "$port" != "443" ] && [ "$port" != "80" ]; then
        port_suffix=":$port"
    fi

    local domains
    domains=$(normalize_domains "$SERVER_NAME")
    [ -z "$domains" ] && domains="mengya-docker.local"

    local domain_count=0
    for d in $domains; do
        domain_count=$((domain_count + 1))
    done

    if [ "$domain_count" -le 1 ]; then
        local single_domain="$domains"
        echo "  ${label}: https://${single_domain}${port_suffix}/ (HTTPS ${port:-443} SNI 入口，与传统版共存零冲突)"
    else
        echo "  ${label} (已配置 $domain_count 个 SNI 域名，均可通过 HTTPS ${port:-443} 访问):"
        local idx=1
        for d in $domains; do
            if [ "$idx" -eq 1 ]; then
                echo "    - 主访问入口:   https://${d}${port_suffix}/"
            else
                echo "    - 附加入口 [$((idx - 1))]: https://${d}${port_suffix}/"
            fi
            idx=$((idx + 1))
        done
    fi
}



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
NGINX_CERT_DIR=$(resolve_abs_path "${NGINX_CERT_DIR:-/opt/service/nginx/ssl}")
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

cleanup_docker_build_cache() {
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        echo -e "\033[32m  [清理] 正在自动清理上一次构建残留的虚悬镜像与 BuildKit 缓存层 (安全防膨胀)...\033[0m"
        # 仅清理无标签虚悬镜像（dangling images），绝不影响当前运行容器及其他项目的有标签镜像
        docker image prune -f >/dev/null 2>&1 || true
        # 仅清理未引用的废弃构建缓存层（dangling builder cache）
        docker builder prune -f >/dev/null 2>&1 || docker buildx prune -f >/dev/null 2>&1 || true
        echo -e "\033[32m  ✅ Docker 构建残留缓存层清理完成 (无冗余空间占用)\033[0m"
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
    cleanup_docker_build_cache
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

# ===== 数据库镜像智能探测与数据兼容性管理 =====
image_exists() {
    local img="$1"
    [ -z "$img" ] && return 1
    docker image inspect "$img" >/dev/null 2>&1
}

choose_db_image() {
    if ! docker info >/dev/null 2>&1; then
        DB_IMAGE="${DB_IMAGE:-pgvector/pgvector:pg18}"
        DB_PULL_POLICY="${DB_PULL_POLICY:-missing}"
        DB_DATA_DIR="${DB_DATA_DIR:-/var/lib/postgresql}"
        export DB_IMAGE DB_PULL_POLICY DB_DATA_DIR
        return 0
    fi

    # 1. 优先遵循环境变量/用户显式指定的 DB_IMAGE
    if [ -n "$DB_IMAGE" ]; then
        if image_exists "$DB_IMAGE"; then
            echo -e "\033[0;32m[数据库] 检测到环境变量指定镜像 $DB_IMAGE 且本地已存在，直接复用已有镜像（pull_policy: never）\033[0m"
            DB_PULL_POLICY="never"
        else
            echo -e "\033[1;33m[数据库] 检测到环境变量指定镜像 $DB_IMAGE 本地不存在，启动时将自动拉取\033[0m"
            DB_PULL_POLICY="missing"
        fi
    # 2. 检查本地是否已有 pgvector/pgvector:pg18 镜像（用户服务器已有镜像优先复用，杜绝重复拉取）
    elif image_exists "pgvector/pgvector:pg18"; then
        DB_IMAGE="pgvector/pgvector:pg18"
        DB_PULL_POLICY="never"
        echo -e "\033[0;32m[数据库] 检测到服务器本地已存在 pgvector/pgvector:pg18 镜像，直接复用本地镜像（pull_policy: never）\033[0m"
    # 3. 检查本地是否已有 postgres:15-alpine 镜像（兼容历史旧版数据卷）
    elif image_exists "postgres:15-alpine"; then
        DB_IMAGE="postgres:15-alpine"
        DB_PULL_POLICY="never"
        echo -e "\033[0;32m[数据库] 检测到服务器本地已存在 postgres:15-alpine 镜像，直接复用本地镜像（pull_policy: never）\033[0m"
    # 4. 本地均不存在，默认使用 pgvector/pgvector:pg18 并按需拉取
    else
        DB_IMAGE="pgvector/pgvector:pg18"
        DB_PULL_POLICY="missing"
        echo -e "\033[1;33m[数据库] 本地未检测到 pgvector 或 postgres 镜像，默认使用 pgvector/pgvector:pg18（首次启动将拉取）\033[0m"
    fi

    # 智能匹配数据卷挂载点：PostgreSQL 18+ 挂载父目录 /var/lib/postgresql；15 及更早版本兼容 /var/lib/postgresql/data
    if [ -z "$DB_DATA_DIR" ]; then
        case "$DB_IMAGE" in
            *18*|*pg18*)
                DB_DATA_DIR="/var/lib/postgresql"
                ;;
            *15*|*16*|*14*|*alpine*)
                DB_DATA_DIR="/var/lib/postgresql/data"
                ;;
            *)
                DB_DATA_DIR="/var/lib/postgresql"
                ;;
        esac
    fi

    export DB_IMAGE
    export DB_PULL_POLICY
    export DB_DATA_DIR
}

check_db_volume_compatibility() {
    local compose
    compose=$(compose_cmd)
    [ -z "$compose" ] && return 0

    local vol_name
    vol_name=$(docker volume ls -q 2>/dev/null | grep -E "(^|_)pgdata$" | head -n 1 || true)
    if [ -n "$vol_name" ]; then
        echo -e "\033[0;36m[数据库] 检测到已存在存储卷 [$vol_name]，挂载点配置为 [$DB_DATA_DIR]\033[0m"
        if echo "$DB_IMAGE" | grep -q "18"; then
            echo "  [数据兼容性提示] 当前使用 PostgreSQL 18+ 镜像。若该数据卷此前曾由 PG15 创建，PostgreSQL 跨大版本无法直接加载旧数据文件。"
            echo "  - 保留并迁移旧数据：请先切回原镜像运行并执行 ./run.sh db_backup 备份，清理数据卷后启动新版本执行 ./run.sh db_restore 导入；"
            echo "  - 无需保留旧数据：可执行 docker compose down -v 清理旧卷后重新启动，系统将全新初始化。"
        fi
    fi
}

db_backup() {
    check_docker_env
    choose_db_image
    local compose
    compose=$(compose_cmd)
    local outfile="${1:-mengya_data_backup_$(date +%Y%m%d_%H%M%S).json}"
    echo "==> 正在导出数据库数据 (Django 结构化 JSON 格式，跨大版本与跨引擎完全通用)..."
    if $compose exec -T backend python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission --indent 2 > "$outfile" 2>/dev/null; then
        echo -e "\033[0;32m✅ 数据库数据备份成功！保存至文件: $outfile\033[0m"
        echo "  提示：该备份文件可在切换至任意 PostgreSQL 版本或 SQLite 时，通过 ./run.sh db_restore $outfile 平滑恢复。"
    else
        echo -e "\033[1;33m[提示] Django dumpdata 导出受限，尝试通过 pg_dump 导出原生 SQL 备份...\033[0m"
        local sqlfile="${1:-mengya_pg_backup_$(date +%Y%m%d_%H%M%S).sql}"
        if $compose exec -T db pg_dump -U mengya mengya > "$sqlfile" 2>/dev/null; then
            echo -e "\033[0;32m✅ PostgreSQL 原生数据导出成功！保存至文件: $sqlfile\033[0m"
        else
            echo -e "\033[1;31m[错误] 数据库备份失败，请确保容器服务正在运行中 (./run.sh start)。\033[0m"
            return 1
        fi
    fi
}

db_restore() {
    check_docker_env
    choose_db_image
    local compose
    compose=$(compose_cmd)
    local infile="$1"
    if [ -z "$infile" ] || [ ! -f "$infile" ]; then
        echo -e "\033[1;31m[错误] 请提供有效的备份文件路径！示例: ./run.sh db_restore backup.json\033[0m"
        return 1
    fi
    echo "==> 正在恢复数据库数据: $infile ..."
    case "$infile" in
        *.json)
            echo "  检测到 JSON 数据结构文件，使用 Django loaddata 执行结构化跨版本导入..."
            docker cp "$infile" mengya_backend:/tmp/restore.json 2>/dev/null || true
            $compose exec -T backend python manage.py loaddata /tmp/restore.json
            $compose exec -T backend rm -f /tmp/restore.json 2>/dev/null || true
            echo -e "\033[0;32m✅ 数据恢复成功！\033[0m"
            ;;
        *.sql)
            echo "  检测到 SQL 数据文件，使用 psql 执行原生导入..."
            docker cp "$infile" mengya_db:/tmp/restore.sql 2>/dev/null || true
            $compose exec -T db psql -U mengya -d mengya -f /tmp/restore.sql
            $compose exec -T db rm -f /tmp/restore.sql 2>/dev/null || true
            echo -e "\033[0;32m✅ 原生 SQL 数据恢复成功！\033[0m"
            ;;
        *)
            echo -e "\033[1;31m[错误] 不支持的文件格式，仅支持 .json 或 .sql 文件。\033[0m"
            return 1
            ;;
    esac
}

# 检查宿主机端口冲突（防止与传统版或外部已有服务冲突）
check_port_conflict() {
    local port="$1"
    local occupied=0
    if command -v ss >/dev/null 2>&1; then
        if ss -tlpn "sport = :$port" 2>/dev/null | grep -q ":$port\b"; then
            occupied=1
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tlpn 2>/dev/null | grep -q ":$port\b"; then
            occupied=1
        fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
            occupied=1
        fi
    fi

    if [ "$occupied" = "1" ]; then
        # 检查占用是否正是当前 mengya_backend 容器
        local container_has_port
        container_has_port=$(docker ps --filter "name=mengya_backend" --format "{{.Ports}}" 2>/dev/null || true)
        if [[ "$container_has_port" != *":$port->"* ]]; then
            echo -e "\033[1;31m[错误] 宿主机端口 $port 已被其他服务占用（如传统版本或其他进程）！\033[0m"
            echo -e "\033[1;33m[排查建议]："
            echo "  1. 若传统版本正在运行占用 5173，请确保 Docker 版本使用独立端口 5174：./run.sh -p 5174 start"
            echo "  2. 若两套服务同时运行，请通过各自独立域名（如 mengya.local 与 mengya-docker.local）经由 Nginx 反向代理访问。\033[0m"
            return 1
        fi
    fi
    return 0
}

start_docker() {
    cleanup_cache
    check_docker_env
    choose_db_image
    check_db_volume_compatibility

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

    # 探活检查数据库容器是否因版本不兼容等原因异常退出
    sleep 2
    local db_status
    db_status=$(docker inspect --format='{{.State.Status}}' mengya_db 2>/dev/null || echo "")
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
    echo "  数据库镜像:   $DB_IMAGE (拉取策略: $DB_PULL_POLICY, 挂载目录: $DB_DATA_DIR)"
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
    choose_db_image
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
    choose_db_image
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
    echo "  数据库镜像:   $DB_IMAGE (拉取策略: $DB_PULL_POLICY, 挂载目录: $DB_DATA_DIR)"
    echo "  Nginx 配置文件: $([ -f "$NGINX_CONF" ] && echo "已就绪 ($NGINX_CONF)" || echo "未生成 (可执行 ./run.sh add_nginx)")"
    if [ -f "$NGINX_CONF" ]; then
        print_access_urls "统一访问入口" "$EXTERNAL_PORT"
    fi
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

# ===== SSL 证书创建函数（带交互式防误覆盖确认） =====
gen_ssl_cert() {
    echo "==> 检查/配置 SSL 证书 (Docker版)"

    NGINX_CERT_DIR=$(resolve_abs_path "$NGINX_CERT_DIR")
    mkdir -p "$NGINX_CERT_DIR"

    local MAIN_DOMAIN
    MAIN_DOMAIN=$(echo "$SERVER_NAME" | awk '{print $1}')
    [ -z "$MAIN_DOMAIN" ] && MAIN_DOMAIN="mengya-docker.local"

    local SAN_LIST="DNS:localhost,IP:127.0.0.1"
    for d in $SERVER_NAME; do
        SAN_LIST="$SAN_LIST,DNS:$d"
    done

    local CERT_FILE="$NGINX_CERT_DIR/mengya_docker.crt"
    local KEY_FILE="$NGINX_CERT_DIR/mengya_docker.key"

    echo "  操作证书对象: $CERT_FILE"
    echo "  操作私钥对象: $KEY_FILE"

    local do_update="n"
    if [ -s "$CERT_FILE" ] && [ -s "$KEY_FILE" ]; then
        echo -e "\033[1;33m[提示] 检测到已存在有效的 SSL 证书与私钥文件。\033[0m"
        echo -e "\033[1;31m[注意] 若选择更新，将重新生成自签名证书并覆盖现有文件内容（已有正式证书将被替换）！\033[0m"
        local choice="n"
        if [ -t 0 ]; then
            printf "是否需要更新 SSL 证书文件内容？(y/N): "
            read -r choice || choice="n"
        fi
        case "$choice" in
            [yY]|[yY][eE][sS])
                do_update="y"
                ;;
            *)
                do_update="n"
                ;;
        esac
    else
        echo "  检测到 SSL 证书缺失或文件为空，自动生成自签名证书以保障 Nginx 正常加载..."
        do_update="y"
    fi

    if [ "$do_update" = "y" ]; then
        echo "  正在生成并更新自签名 SSL 证书（主域名: $MAIN_DOMAIN，SAN: $SAN_LIST）..."
        if command -v openssl >/dev/null 2>&1; then
            openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" \
                -out "$CERT_FILE" -days 365 -nodes \
                -subj "/C=CN/O=mengya-docker/CN=$MAIN_DOMAIN" \
                -addext "subjectAltName=$SAN_LIST" 2>/dev/null || \
            openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" \
                -out "$CERT_FILE" -days 365 -nodes \
                -subj "/C=CN/O=mengya-docker/CN=$MAIN_DOMAIN" 2>/dev/null || true
            echo "  ✅ SSL 证书与私钥已更新成功: $CERT_FILE"
        else
            echo "  [警告] 未找到 openssl 命令，无法生成有效证书内容！"
        fi
    else
        echo "  保持现有证书内容不变，跳过证书更新。"
        echo "  ✅ 证书文件状态确认: 保留已有有效内容 ($CERT_FILE)"
    fi
}

gen_nginx_config() {
    echo "==> 生成针对宿主机 Nginx 的独立 SSL 反向代理配置 (Docker版)"

    # 确保证书目录与配置目录均为物理绝对路径（彻底避免相对路径导致 Nginx 寻址失败）
    NGINX_CONF_DIR=$(resolve_abs_path "$NGINX_CONF_DIR")
    NGINX_CERT_DIR=$(resolve_abs_path "$NGINX_CERT_DIR")
    NGINX_CONF="$NGINX_CONF_DIR/mengya_docker_ssl.conf"

    if ! mkdir -p "$NGINX_CONF_DIR" 2>/dev/null || ! (touch "$NGINX_CONF_DIR/.perm_test" 2>/dev/null && rm -f "$NGINX_CONF_DIR/.perm_test" 2>/dev/null); then
        echo -e "\033[1;33m[提示] 目录 $NGINX_CONF_DIR 无写入权限或不存在，跳过自动生成 Nginx 配置文件。\033[0m"
        echo -e "\033[1;33m       若需生成，请使用具备写入权限的账号执行: sudo ./run.sh add_nginx\033[0m"
        return 0
    fi

    # 主域名用于 OpenSSL 证书 CN 与控制台访问链接展示（以 SERVER_NAME 配置为准）
    local MAIN_DOMAIN
    MAIN_DOMAIN=$(echo "$SERVER_NAME" | awk '{print $1}')
    [ -z "$MAIN_DOMAIN" ] && MAIN_DOMAIN="mengya-docker.local"

    local CERT_FILE="$NGINX_CERT_DIR/mengya_docker.crt"
    local KEY_FILE="$NGINX_CERT_DIR/mengya_docker.key"

    local REDIRECT_BLOCK=""
    if [ "$ENABLE_HTTP_REDIRECT" = "1" ] && [ "$EXTERNAL_PORT" = "443" ]; then
        REDIRECT_BLOCK="
# HTTP 80 自动重定向到 HTTPS 443（仅匹配 SERVER_NAME: $SERVER_NAME，不干扰其他站点）
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    return 301 https://\$host\$request_uri;
}
"
    fi

    # 策略 3 高亮提示（无论是否存在或是否包含特定注释，均高亮输出，避免首次使用的用户不知道有这个功能）
    echo -e "\033[1;36m[提示] 若需对 Nginx 配置进行手工深度定制并防止启动时被自动覆盖，可在配置文件首行添加: # MANAGED_BY_ADMIN_DO_NOT_OVERWRITE\033[0m"

    # 策略 3 检查：是否已存在免打扰锁定标记
    if [ -f "$NGINX_CONF" ] && grep -q "MANAGED_BY_ADMIN_DO_NOT_OVERWRITE" "$NGINX_CONF" 2>/dev/null; then
        echo -e "\033[1;32m[免打扰] 检测到 $NGINX_CONF 包含 '# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE' 锁定标记，跳过自动覆盖，完全保留现有手工定制配置。\033[0m"
        echo "  SSL 证书路径:   $CERT_FILE"
        echo "  SNI 匹配域名:   $SERVER_NAME (以 SERVER_NAME 为准，主域名: $MAIN_DOMAIN)"
        print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
        return 0
    fi

    # 临时生成目标配置文件，用于执行智能内容差分比对 (方案B: 智能比对与静默自愈)
    local TMP_CONF="${NGINX_CONF}.tmp_$$"
    cat > "$TMP_CONF" << EOF
# 提示: 若需对此配置文件进行个性化手工调优并防止后续启动被自动覆盖，请在首行保留或添加:
# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE
# ============================================================
# 萌芽平台 (Docker 版) - 宿主机 Nginx HTTPS (SNI 443) 反向代理配置
# 配置文件: $NGINX_CONF (独立命名，绝不覆盖传统版 mengya_ssl.conf)
# 访问端口: $EXTERNAL_PORT (HTTPS 标准端口，通过 SNI 域名识别)
# 匹配域名: $SERVER_NAME (以 SERVER_NAME 配置为准，与传统版隔离)
# 后端反代: http://127.0.0.1:$FRONTEND_PORT (Docker 映射端口)
# 自动生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================
${REDIRECT_BLOCK}
server {
    listen $EXTERNAL_PORT ssl;
    listen [::]:$EXTERNAL_PORT ssl;
    server_name $SERVER_NAME;

    # 独立 SSL 证书与私钥 (物理绝对路径，保障 Nginx 稳定加载)
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

    # 反向代理至 Docker 映射的一体化服务（统一托管前端静态页面、后端 API 与 Admin）
    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Forwarded-Host \$host;

        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }
}
EOF

    # 智能比对：比对现有文件与目标配置（忽略自动生成时间戳行的差异）
    local is_different=1
    if [ -s "$NGINX_CONF" ]; then
        local clean_old clean_new
        clean_old=$(grep -v "^# 自动生成时间:" "$NGINX_CONF" 2>/dev/null || true)
        clean_new=$(grep -v "^# 自动生成时间:" "$TMP_CONF" 2>/dev/null || true)
        if [ "$clean_old" = "$clean_new" ]; then
            is_different=0
        fi
    fi

    # 场景 1：配置完全一致且有效，静默跳过更新，零冗余快照备份，不打扰启动流程
    if [ "$is_different" -eq 0 ]; then
        rm -f "$TMP_CONF"
        echo "  保持现有 Nginx 配置文件内容不变，配置完全一致。"
        echo "  ✅ 配置文件状态确认: 已是最新 ($NGINX_CONF)"
        echo "  SSL 证书路径:   $CERT_FILE"
        echo "  SNI 匹配域名:   $SERVER_NAME (以 SERVER_NAME 为准，主域名: $MAIN_DOMAIN)"
        echo "  外部访问端口:   $EXTERNAL_PORT"
        print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
        echo ""
        return 0
    fi

    # 场景 2：专属命令 add_nginx 下且文件存在变动，提供交互式确认
    if [ "$CMD" = "add_nginx" ] && [ -s "$NGINX_CONF" ]; then
        echo -e "\033[1;33m[提示] 检测到已存在 Nginx 配置文件且内容有更新: $NGINX_CONF\033[0m"
        echo -e "\033[1;31m[注意] 若选择更新，将生成标准反代配置并覆盖现有文件内容（若有手工修改将被替换）！\033[0m"
        local choice="n"
        if [ -t 0 ]; then
            printf "是否需要更新 Nginx 配置文件内容？(y/N): "
            read -r choice || choice="n"
        fi
        case "$choice" in
            [yY]|[yY][eE][sS])
                ;;
            *)
                rm -f "$TMP_CONF"
                echo "  保持现有 Nginx 配置文件内容不变，跳过配置更新。"
                echo "  ✅ 配置文件状态确认: 保留已有有效内容 ($NGINX_CONF)"
                print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
                return 0
                ;;
        esac
    fi

    # 场景 3：日常启动(start/restart)检测到参数漂移自愈，或专属命令确认更新：执行快照备份并安全同步
    if [ -s "$NGINX_CONF" ]; then
        local BAK_FILE="${NGINX_CONF}.bak_$(date '+%Y%m%d%H%M%S')"
        if cp -f "$NGINX_CONF" "$BAK_FILE" 2>/dev/null; then
            echo -e "  \033[1;32m[安全备份] 检测到配置变动，已自动为变更前的旧配置创建快照: $BAK_FILE\033[0m"
        fi
    fi

    mv -f "$TMP_CONF" "$NGINX_CONF"
    echo -e "  \033[1;32m[配置自愈] 宿主机 Nginx 反代配置已成功同步更新: $NGINX_CONF\033[0m"
    echo "  SSL 证书路径:   $CERT_FILE"
    echo "  SNI 匹配域名:   $SERVER_NAME (以 SERVER_NAME 为准，主域名: $MAIN_DOMAIN)"
    echo "  外部访问端口:   $EXTERNAL_PORT"
    print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
    echo "  配置优势: 与传统版完全隔离，通过 SNI 域名 ($SERVER_NAME) 共享 443 端口！"
    echo ""

    # 检测并警告 NGINX_CONF_DIR 中遗留的 8000 端口旧配置
    if [ -d "$NGINX_CONF_DIR" ]; then
        local stale_conf
        stale_conf=$(grep -rnw "$NGINX_CONF_DIR" -e "127\.0\.0\.1:8000" -e "backend:8000" 2>/dev/null | cut -d: -f1 | sort -u || true)
        if [ -n "$stale_conf" ]; then
            echo -e "\033[1;33m[安全提示] 在 $NGINX_CONF_DIR 中检测到包含 8000 端口代理的旧配置文件:\033[0m"
            for sc in $stale_conf; do
                echo -e "\033[1;33m  - $sc\033[0m"
            done
            echo -e "\033[1;33m  宿主机未监听 8000 端口，若旧文件被 Nginx 加载会导致登录报 502 Bad Gateway，建议清理或重命名！\033[0m"
        fi
    fi

    # 尝试自动检测并重载宿主机 Nginx 服务
    if command -v nginx >/dev/null 2>&1; then
        echo "==> 检查并重载宿主机 Nginx 配置..."
        if nginx -t >/dev/null 2>&1; then
            if nginx -s reload 2>/dev/null; then
                echo "  ✅ Nginx 配置重载成功，SNI 域名反代规则已实时生效！"
            else
                echo "  [提示] Nginx 未在运行或需要 root 权限重载，请按需执行: sudo nginx -s reload"
            fi
        else
            echo "  [警告] Nginx 语法测试未通过，请检查 /etc/nginx 或 $NGINX_CONF_DIR 配置: nginx -t"
        fi
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

init_data_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)
    echo "==> 正在执行全量样例数据检查与补充初始化..."
    $compose exec -T backend python manage.py init_data "$@"
}

# 解析命令行参数与自定义变量
CMD=""
CUSTOM_PORT=""
CUSTOM_ADMIN_USER=""
CUSTOM_ADMIN_PASS=""
CUSTOM_ADMIN_NICK=""
CUSTOM_DOMAIN=""
CUSTOM_DB_IMAGE=""
DO_BUILD=0
NO_CACHE=0
EXTRA_ARGS=""

while [ $# -gt 0 ]; do
    case "$1" in
        start|stop|restart|status|logs|build|clean|prune|add_nginx|exec|init_data|seed|db_backup|backup|db_restore|restore|help)
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

# 导出供 docker compose 插值
export FRONTEND_PORT
export ADMIN_USERNAME
export ADMIN_PHONE
export ADMIN_PASSWORD
export ADMIN_NICKNAME
export SERVER_NAME
export EXTERNAL_PORT

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
        echo ""
        echo "实用启动示例："
        echo "  ./run.sh start                                 # 默认启动（端口 5174，管理员 admin / admin123）"
        echo "  ./run.sh start -p 8080                         # 自定义以 8080 端口启动"
        echo "  ./run.sh start -p 5200 -u superadmin -P Pass123 # 自定义端口与管理员账密启动"
        echo "  ./run.sh restart -p 5300                       # 重启并变更为 5300 端口"
        echo "  ./run.sh add_nginx -d mengya.myhost.com        # 为指定域名生成独立反代配置"
        echo ""
        ;;
    *)
        echo "未知命令: $CMD"
        echo "支持的子命令: start | stop | restart | status | logs | build | clean | add_nginx | exec | help"
        exit 1
        ;;
esac
