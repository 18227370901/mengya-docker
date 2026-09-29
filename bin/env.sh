#!/usr/bin/env bash
# ============================================================
# 萌芽平台 (mengya-docker) - 基础环境与辅助函数模块
# ============================================================

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
