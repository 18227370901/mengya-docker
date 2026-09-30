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


# 2. 依次动态载入 bin/ 目录下所有模块
for mod in env config db nginx data docker help; do
    mod_file="$SCRIPT_DIR/bin/${mod}.sh"
    if [ -f "$mod_file" ]; then
        # shellcheck disable=SC1090
        . "$mod_file"
    else
        echo -e "\033[1;31m[错误] 缺失核心组件: bin/${mod}.sh，请检查项目完整性！\033[0m" >&2
        exit 1
    fi
done

# 3. 初始化默认变量、解析命令行参数、持久化自定义配置与导出环境变量
init_default_configs
parse_cli_args "$@"
apply_and_save_configs
export_runtime_vars

# 4. 命令调度分发
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
        # shellcheck disable=SC2086
        logs_docker $EXTRA_ARGS
        ;;
    build)
        build_docker
        ;;
    clean|prune)
        clean_docker
        ;;
    add_nginx)
        gen_ssl_cert
        gen_nginx_config
        ;;
    exec)
        # shellcheck disable=SC2086
        exec_docker $EXTRA_ARGS
        ;;
    init_data|seed)
        # shellcheck disable=SC2086
        init_data_docker $EXTRA_ARGS
        ;;
    db_backup|backup)
        # shellcheck disable=SC2086
        db_backup $EXTRA_ARGS
        ;;
    db_restore|restore)
        # shellcheck disable=SC2086
        db_restore $EXTRA_ARGS
        ;;
    reconfig|reconfig_db)
        RECONFIG_DB=1
        setup_db_for_mode
        echo -e "\033[0;32m[完成] 数据库模式已重新配置并保存至 .env (当前模式: $DB_MODE)\033[0m"
        ;;
    help)
        show_cli_help
        ;;
    *)
        echo "未知命令: $CMD"
        echo "支持的子命令: start | stop | restart | status | logs | build | clean | add_nginx | exec | init_data | help"
        exit 1
        ;;
esac
