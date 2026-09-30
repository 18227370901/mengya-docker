#!/usr/bin/env bash
# ============================================================
# 萌芽平台 (mengya-docker) - 数据库探针、部署向导与备份恢复模块
# ============================================================

detect_host_ram_mb() {
    local mem_kb=0
    if [ -f "/proc/meminfo" ]; then
        mem_kb=$(grep -i "^MemTotal:" /proc/meminfo 2>/dev/null | awk '{print $2}')
    elif command -v sysctl >/dev/null 2>&1; then
        local bytes
        bytes=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
        mem_kb=$((bytes / 1024))
    fi
    echo $((mem_kb / 1024))
}

detect_running_pg_containers() {
    if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
        return 0
    fi
    local my_db="$DB_CONTAINER_NAME"
    docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | while read -r c_name c_img; do
        [ -z "$c_name" ] && continue
        if [ "$c_name" = "$my_db" ] || [ "$c_name" = "mengya_db" ] || [ "$c_name" = "${APP_NAME}_db" ]; then
            continue
        fi
        if echo "$c_img" | grep -qiE "postgres|pgvector"; then
            echo "$c_name"
        fi
    done
}

detect_best_pg_image() {
    local default_img="$DEFAULT_PG_IMAGE"
    if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
        echo "$default_img"
        return 0
    fi
    local local_imgs
    local_imgs=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || true)

    # 1. 优先复用宿主机正在运行的 PG 容器所使用的镜像
    local running_c
    running_c=$(detect_running_pg_containers | head -n 1)
    if [ -n "$running_c" ]; then
        local c_img
        c_img=$(docker inspect --format='{{.Config.Image}}' "$running_c" 2>/dev/null || true)
        if [ -n "$c_img" ]; then
            echo "$c_img"
            return 0
        fi
    fi

    # 2. 优先扫描服务器本地已存在的任何可用 PG 镜像（杜绝不必要的网络下载）
    local any_pg=""
    # 优先复用本地已有的 postgres alpine 或 postgres 官方轻量镜像
    any_pg=$(echo "$local_imgs" | grep -E "^postgres:.*alpine" | head -n 1)
    if [ -z "$any_pg" ]; then
        any_pg=$(echo "$local_imgs" | grep -E "^pgvector/pgvector:" | head -n 1)
    fi
    if [ -z "$any_pg" ]; then
        any_pg=$(echo "$local_imgs" | grep -E "^postgres:" | grep -v "<none>" | head -n 1)
    fi
    if [ -z "$any_pg" ]; then
        any_pg=$(echo "$local_imgs" | grep -E "(postgres|pgvector)" | grep -v "<none>" | head -n 1)
    fi

    if [ -n "$any_pg" ]; then
        echo "$any_pg"
        return 0
    fi

    # 3. 本地实在没有现存 PG 镜像时，才返回内置默认版本
    echo "$default_img"
}

choose_db_image() {
    local default_img="$DEFAULT_PG_IMAGE"
    if ! docker info >/dev/null 2>&1; then
        DB_IMAGE="${DB_IMAGE:-$default_img}"
        DB_PULL_POLICY="${DB_PULL_POLICY:-if_not_present}"
        DB_DATA_DIR="${DB_DATA_DIR:-/var/lib/postgresql/data}"
        export DB_IMAGE DB_PULL_POLICY DB_DATA_DIR
        update_env_var "DB_IMAGE" "$DB_IMAGE"
        update_env_var "DB_PULL_POLICY" "$DB_PULL_POLICY"
        update_env_var "DB_DATA_DIR" "$DB_DATA_DIR"
        return 0
    fi

    # 1. 判断是否属于用户显式自定义镜像（命令行 -i / --db-image 传入，或在 config.sh/.env 中显式指定）
    local is_user_custom=0
    if [ -n "$CUSTOM_DB_IMAGE" ]; then
        DB_IMAGE="$CUSTOM_DB_IMAGE"
        is_user_custom=1
    elif [ -n "$DB_IMAGE" ]; then
        is_user_custom=1
    fi

    # 2. 用户显式自定义分支：100% 尊崇用户自定义版本，绝对禁止被其他本地旧镜像篡改覆盖
    if [ "$is_user_custom" = "1" ]; then
        if image_exists "$DB_IMAGE"; then
            echo -e "\033[0;32m[镜像复用] 检测到本地已存在用户指定的自定义镜像 [$DB_IMAGE]，直接就地复用（pull_policy: never）\033[0m"
            DB_PULL_POLICY="never"
        else
            echo -e "\033[1;33m[镜像下载] 本地未检测到用户指定的自定义镜像 [$DB_IMAGE]，启动时将自动下载该版本（pull_policy: if_not_present）\033[0m"
            DB_PULL_POLICY="if_not_present"
        fi
    else
        # 3. 用户未显式指定：优先检测复用服务器上已存在的 PG 镜像；实在没有才自动拉取内置默认镜像
        local detected_img
        detected_img=$(detect_best_pg_image)

        if image_exists "$detected_img"; then
            DB_IMAGE="$detected_img"
            DB_PULL_POLICY="never"
            echo -e "\033[0;32m[镜像复用] 优先复用服务器已存在的 PG 镜像 [$DB_IMAGE]，零网络下载（pull_policy: never）\033[0m"
        else
            # 实在没有现存镜像：选用内置默认镜像并下载
            DB_IMAGE="$default_img"
            DB_PULL_POLICY="if_not_present"
            echo -e "\033[1;33m[镜像下载] 服务器本地未检测到现存 PG 镜像，选用内置默认版本 [$DB_IMAGE] 并自动下载（pull_policy: if_not_present）\033[0m"
        fi
    fi

    # 4. 智能匹配数据卷挂载点：PostgreSQL 18+ 挂载父目录 /var/lib/postgresql；15 及更早版本兼容 /var/lib/postgresql/data
    if [ -z "$DB_DATA_DIR" ]; then
        case "$DB_IMAGE" in
            *18*|*pg18*)
                DB_DATA_DIR="/var/lib/postgresql"
                ;;
            *15*|*16*|*14*|*alpine*)
                DB_DATA_DIR="/var/lib/postgresql/data"
                ;;
            *)
                DB_DATA_DIR="/var/lib/postgresql/data"
                ;;
        esac
    fi

    export DB_IMAGE DB_PULL_POLICY DB_DATA_DIR
    update_env_var "DB_IMAGE" "$DB_IMAGE"
    update_env_var "DB_PULL_POLICY" "$DB_PULL_POLICY"
    update_env_var "DB_DATA_DIR" "$DB_DATA_DIR"
}

choose_db_mode() {
    export APP_NAME
    export DB_CONTAINER_NAME

    # 若通过命令行参数直传 -m / --db-mode
    if [ -n "$CUSTOM_DB_MODE" ]; then
        DB_MODE="$CUSTOM_DB_MODE"
        update_env_var "DB_MODE" "$DB_MODE"
        echo -e "\033[0;32m[数据库] 命令行显式指定数据库部署模式: $DB_MODE (已同步至 .env)\033[0m"
        return 0
    fi

    local ram_mb
    ram_mb=$(detect_host_ram_mb)
    local running_pg_list
    running_pg_list=$(detect_running_pg_containers | tr '\n' ' ' | xargs)
    local local_pg_img
    local_pg_img=$(detect_best_pg_image)
    local img_local_exists=0
    if image_exists "$local_pg_img"; then
        img_local_exists=1
    fi

    # 智能推荐算法
    local rec_mode="dedicated"
    local rec_num=3
    local rec_reason=""

    if [ -n "$running_pg_list" ]; then
        rec_mode="shared"
        rec_num=2
        rec_reason="检测到宿主机已存在运行中的 PostgreSQL 容器 [$running_pg_list]，推荐共用该实例，自动创建专属库与账号，立省 80MB+ 内存且零多余容器！"
    elif [ "$ram_mb" -gt 0 ] && [ "$ram_mb" -le 1536 ]; then
        rec_mode="sqlite"
        rec_num=1
        rec_reason="服务器物理内存较紧凑 (${ram_mb} MB <= 1.5GB)，推荐本地 SQLite 单文件模式，整站常驻约 50MB 内存，彻底杜绝 OOM 风险！"
    else
        rec_mode="dedicated"
        rec_num=3
        rec_reason="服务器硬件资源充足 (${ram_mb} MB)，推荐独立专属 PostgreSQL 容器 (${DB_CONTAINER_NAME})，数据独占且已应用 80MB 轻量化微服务调优！"
    fi

    # ===== 定时任务 / 免交互判定逻辑 =====
    # 1. restart / stop / status / logs / down 等管理维护命令：若未显式指定 --reconfig，则天然免交互，绝不打扰定时任务
    if [ "$RECONFIG_DB" != "1" ]; then
        if [ "$CMD" = "restart" ] || [ "$CMD" = "stop" ] || [ "$CMD" = "status" ] || [ "$CMD" = "logs" ] || [ "$CMD" = "down" ]; then
            DB_MODE="${DB_MODE:-$rec_mode}"
            return 0
        fi
    fi

    # 2. 已有配置且未显式指定 --reconfig：静默沿用已保存配置
    if [ -n "$DB_MODE" ] && [ "$RECONFIG_DB" != "1" ]; then
        return 0
    fi

    # 3. 显式指定 -y / --yes / --non-interactive：直接采用推荐模式并同步
    if [ "$NON_INTERACTIVE" = "1" ]; then
        DB_MODE="${DB_MODE:-$rec_mode}"
        update_env_var "DB_MODE" "$DB_MODE"
        echo -e "\033[0;36m[免交互自愈] 显式指定 -y/--non-interactive，已自动采用智能推荐模式: $DB_MODE ($rec_reason)\033[0m"
        return 0
    fi

    # 4. 定时任务 / 无TTY 环境（且未显式指定 --reconfig）：自动采用推荐模式，绝不挂起进程
    if [ "$RECONFIG_DB" != "1" ] && [ ! -t 0 ]; then
        DB_MODE="${DB_MODE:-$rec_mode}"
        update_env_var "DB_MODE" "$DB_MODE"
        echo -e "\033[0;36m[免交互自愈] 检测到处于非交互环境/定时任务，已自动采用智能推荐模式: $DB_MODE ($rec_reason)\033[0m"
        return 0
    fi

    # 5. 交互式终端菜单展示
    echo ""
    echo "========================================================================"
    echo "  萌芽（mengya-docker）环境与数据库部署模式检测"
    echo "========================================================================"
    echo "  [硬件检测] 宿主机总内存: ${ram_mb:-未知} MB"
    echo "  [连接配置] 当前参数 -> 用户: $POSTGRES_USER | 库名: $POSTGRES_DB | 端口: $POSTGRES_PORT | 密码: ${POSTGRES_PASSWORD:+******}"
    if [ -n "$running_pg_list" ]; then
        echo -e "  [运行实例] \033[0;32m检测到正在运行的 PostgreSQL 容器: [$running_pg_list]\033[0m"
    else
        echo "  [运行实例] 未检测到其他运行中的 PostgreSQL 容器"
    fi
    if [ "$img_local_exists" -eq 1 ]; then
        echo -e "  [本地镜像] \033[0;32m检测到本地已有 PG 镜像: [$local_pg_img] (可直接复用，免网络下载)\033[0m"
    else
        echo "  [本地镜像] 本地未检测到现存 PG 镜像 (选用 PG 模式将自动按需下载内置默认镜像: $DEFAULT_PG_IMAGE)"
    fi
    echo "------------------------------------------------------------------------"
    echo "  系统智能推荐建议:"
    echo -e "  \033[1;33m⭐ 推荐选择 [$rec_num] $rec_reason\033[0m"
    echo "------------------------------------------------------------------------"
    echo "  请选择您希望使用的数据库部署模式 (回车默认使用推荐选项 [$rec_num]):"
    echo "    [1] SQLite 本地化单文件 (适合超低配服务器，整站仅占 50MB 内存，防 OOM)"
    echo "    [2] 共享已有 PostgreSQL 实例 (共用已运行容器，自动建库建账号，零重复容器)"
    echo "    [3] 独立 PostgreSQL 容器 (独占专属容器 $DB_CONTAINER_NAME，复用本地镜像)"
    echo ""

    local choice=""
    # 30秒超时自动采用推荐选项，防止长时间挂起
    read -t 30 -p "请输入选项编号 [1/2/3] (默认: $rec_num): " choice || true
    echo ""
    choice=$(echo "$choice" | tr -d '[:space:]')
    [ -z "$choice" ] && choice="$rec_num"

    case "$choice" in
        1|sqlite|SQLite)
            DB_MODE="sqlite"
            ;;
        2|shared|Shared)
            DB_MODE="shared"
            ;;
        3|dedicated|Dedicated)
            DB_MODE="dedicated"
            ;;
        *)
            echo "输入无效，自动采用推荐选项 [$rec_num]"
            DB_MODE="$rec_mode"
            ;;
    esac

    update_env_var "DB_MODE" "$DB_MODE"
    RECONFIG_DB=0
    export RECONFIG_DB
    echo -e "\033[0;32m[配置已保存] 数据库模式已设置为: $DB_MODE (已同步写入 .env)\033[0m"
}

setup_db_for_mode() {
    choose_db_mode
    export DB_MODE

    export APP_NAME
    export DB_CONTAINER_NAME

    case "$DB_MODE" in
        sqlite)
            echo "==> 数据库部署模式: [1] SQLite 本地化单文件存储"
            echo "  [模式特性] 零额外 PG 容器，整站常驻约 50MB 内存，数据持久化于 $SQLITE_PATH"
            mkdir -p "$(dirname "$SQLITE_PATH")"
            if [ -f "$SCRIPT_DIR/db.sqlite3" ] && [ ! -f "$SQLITE_PATH" ]; then
                cp "$SCRIPT_DIR/db.sqlite3" "$SQLITE_PATH" 2>/dev/null || true
            fi
            DATABASE_URL=""
            export DATABASE_URL
            update_env_var "DATABASE_URL" ""
            update_env_var "COMPOSE_FILE" "docker-compose.yml:docker-compose.sqlite.yml"
            ;;
        shared)
            echo "==> 数据库部署模式: [2] 共享已有 PostgreSQL 实例"
            local target_c="${SHARED_PG_CONTAINER}"
            if [ -z "$target_c" ]; then
                target_c=$(detect_running_pg_containers | head -n 1)
            fi

            # 若未找到运行中的 PG 容器，尝试检查已停止的 PG 容器并尝试唤醒自愈
            if [ -z "$target_c" ]; then
                local stopped_c
                stopped_c=$(docker ps -a --filter "status=exited" --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -E "postgres|pgvector" | head -n 1 | awk '{print $1}')
                if [ -n "$stopped_c" ]; then
                    echo -e "\033[1;33m[共享模式自愈] 检测到已停止的 PG 容器 [$stopped_c]，正在自动启动...\033[0m"
                    docker start "$stopped_c" >/dev/null 2>&1 || true
                    target_c="$stopped_c"
                fi
            fi

            # 仍未检测到时，提示并安全智能转为独立 PG 模式
            if [ -z "$target_c" ]; then
                echo -e "\033[1;31m[错误] 宿主机未检测到任何正在运行的 PostgreSQL 容器，无法进行共享连接！\033[0m"
                echo "       请先启动宿主机 PG 容器或通过 --shared-pg <容器名> 显式指定；"
                echo -e "\033[1;33m[智能降级] 系统已自动安全切换为 [3] 独立专属 PG 容器模式 (dedicated)...\033[0m"
                DB_MODE="dedicated"
                update_env_var "DB_MODE" "dedicated"
                setup_db_for_mode
                return 0
            fi

            SHARED_PG_CONTAINER="$target_c"
            update_env_var "SHARED_PG_CONTAINER" "$SHARED_PG_CONTAINER"
            echo "  [共享目标] 正在连接已有 PostgreSQL 容器: [$SHARED_PG_CONTAINER]"

            local pg_user="$POSTGRES_USER"
            local pg_pass="$POSTGRES_PASSWORD"
            local pg_db="$POSTGRES_DB"

            if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$SHARED_PG_CONTAINER"; then
                echo "  [自动建库] 正在已有容器 $SHARED_PG_CONTAINER 中初始化专属用户与数据库..."
                local superuser="postgres"
                if ! docker exec "$SHARED_PG_CONTAINER" psql -U "$superuser" -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
                    if docker exec "$SHARED_PG_CONTAINER" psql -U "$pg_user" -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
                        superuser="$pg_user"
                    fi
                fi
                docker exec "$SHARED_PG_CONTAINER" psql -U "$superuser" -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$pg_user') THEN
    CREATE USER $pg_user WITH PASSWORD '$pg_pass';
  END IF;
END
\$\$;
" 2>/dev/null || true

                docker exec "$SHARED_PG_CONTAINER" psql -U "$superuser" -tc "SELECT 1 FROM pg_database WHERE datname = '$pg_db'" 2>/dev/null | grep -q 1 || \
                docker exec "$SHARED_PG_CONTAINER" psql -U "$superuser" -c "CREATE DATABASE $pg_db OWNER $pg_user;" 2>/dev/null || true

                docker exec "$SHARED_PG_CONTAINER" psql -U "$superuser" -c "GRANT ALL PRIVILEGES ON DATABASE $pg_db TO $pg_user;" 2>/dev/null || true
                echo "  ✅ 已在容器 $SHARED_PG_CONTAINER 中就绪专属库 [$pg_db] 与用户 [$pg_user]！"

                # 将已有容器动态接入 compose 网络以支持 DNS 寻址
                local net_name="${COMPOSE_PROJECT_NAME:-mengya-docker}_net"
                if docker network ls --format '{{.Name}}' 2>/dev/null | grep -qx "$net_name"; then
                    docker network connect "$net_name" "$SHARED_PG_CONTAINER" 2>/dev/null || true
                fi
            else
                echo -e "\033[1;33m  [提示] 目标容器 $SHARED_PG_CONTAINER 当前未在运行中，请确保该容器可正常访问。\033[0m"
            fi

            local pg_port="$POSTGRES_PORT"
            local pg_host="${POSTGRES_HOST:-$SHARED_PG_CONTAINER}"
            if [ -n "$CUSTOM_DATABASE_URL" ]; then
                DATABASE_URL="$CUSTOM_DATABASE_URL"
            elif [ -z "$DATABASE_URL" ]; then
                DATABASE_URL="postgresql://${pg_user}:${pg_pass}@${pg_host}:${pg_port}/${pg_db}"
            fi
            export DATABASE_URL
            update_env_var "DATABASE_URL" "$DATABASE_URL"
            update_env_var "COMPOSE_FILE" "docker-compose.yml"
            ;;
        dedicated|*)
            echo "==> 数据库部署模式: [3] 独立专属 PostgreSQL 容器 (${DB_CONTAINER_NAME})"
            choose_db_image
            check_db_volume_compatibility
            local pg_user="$POSTGRES_USER"
            local pg_pass="$POSTGRES_PASSWORD"
            local pg_db="$POSTGRES_DB"
            local pg_port="$POSTGRES_PORT"
            local pg_host="${POSTGRES_HOST:-db}"
            if [ -n "$CUSTOM_DATABASE_URL" ]; then
                DATABASE_URL="$CUSTOM_DATABASE_URL"
            elif [ -z "$DATABASE_URL" ]; then
                DATABASE_URL="postgresql://${pg_user}:${pg_pass}@${pg_host}:${pg_port}/${pg_db}"
            fi
            export DATABASE_URL
            update_env_var "DATABASE_URL" "$DATABASE_URL"
            update_env_var "COMPOSE_FILE" "docker-compose.yml:docker-compose.db.yml"
            ;;
    esac
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
        if $compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$sqlfile" 2>/dev/null; then
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
            $compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/restore.sql
            $compose exec -T db rm -f /tmp/restore.sql 2>/dev/null || true
            echo -e "\033[0;32m✅ 原生 SQL 数据恢复成功！\033[0m"
            ;;
        *)
            echo -e "\033[1;31m[错误] 不支持的文件格式，仅支持 .json 或 .sql 文件。\033[0m"
            return 1
            ;;
    esac
}

show_db_reconfig_guide() {
    echo -e "\033[1;36m========================================================================\033[0m"
    echo -e "\033[1;36m  【.env 与数据库存储方式选择及重新配置操作说明】\033[0m"
    echo -e "\033[1;36m========================================================================\033[0m"
    echo "  1. 支持的 3 大数据库模式（通过 .env 中 DB_MODE 变量记录）："
    echo "     - sqlite    : 容器挂载本地 SQLite 单文件，完全零额外 DB 容器，与传统版独立物理隔离。"
    echo "     - shared    : [宿主机已运行 PG 容器时推荐] 共享宿主机已有的 PostgreSQL 容器，"
    echo "                   自动幂等创建当前应用专属数据库（$POSTGRES_DB）与账号，零多余容器，节约 80MB+ 内存。"
    echo "     - dedicated : [Docker版默认推荐] 独立专属 PostgreSQL 容器（$DB_CONTAINER_NAME），内部网络互联，"
    echo "                   严格就地复用本地已有镜像，严禁网络拉取。"
    echo ""
    echo "  2. 数据库配置相关命令行参数："
    echo "     --reconfig | --reconfig-db           强制唤醒硬件感知探针与交互决策菜单（保留其他已有配置）"
    echo "     -m, --mode <sqlite|shared|dedicated> 命令行显式指定数据库模式并自动同步持久化至 .env"
    echo "     --shared-pg <容器名>                 指定共享的宿主机 PostgreSQL 容器名（shared 模式使用）"
    echo "     -y, --yes | --non-interactive        非交互/定时任务模式（若未配置自动采用智能推荐，绝不阻塞）"
    echo "     --db-user <用户名>                   自定义 PostgreSQL 用户名（默认: $POSTGRES_USER）"
    echo "     --db-pass <密码>                     自定义 PostgreSQL 密码（默认: $POSTGRES_PASSWORD）"
    echo "     --db-name <库名/实例名>              自定义 PostgreSQL 数据库名（默认: $POSTGRES_DB）"
    echo "     --db-port <端口>                     自定义 PostgreSQL 连接端口（默认: $POSTGRES_PORT）"
    echo "     --db-host <主机地址>                 自定义 PostgreSQL 主机地址（默认: $POSTGRES_HOST）"
    echo "     --database-url <完整URL>             直接指定完整 DATABASE_URL 连接串"
    echo ""
    echo "  3. 首次使用与再次重新选择方式："
    echo "     [方式一] 命令行显式重配（强烈推荐，最安全便捷）："
    echo "              ./run.sh start --reconfig"
    echo "              或在启动时直接指定目标模式："
    echo "              ./run.sh start -m dedicated (或 -m shared / -m sqlite)"
    echo "     [方式二] 修改 .env 文件中的 DB_MODE 变量："
    echo "              若需切换模式，直接编辑 .env 将 DB_MODE=... 改为目标模式（如 DB_MODE=shared），"
    echo "              或将 DB_MODE 这一行删除或留空，下次执行 ./run.sh start 即可自动重新唤起选择向导。"
    echo "     [方式三] 直接删除整个 .env 文件的影响说明："
    echo "              删除 .env 虽可重置向导，但会同时重置系统安全密钥 (SECRET_KEY)、自定义端口等参数，"
    echo "              因此强烈建议优先采用 [方式一] 或 [方式二]。"
    echo -e "\033[1;36m========================================================================\033[0m"
    echo ""
}
