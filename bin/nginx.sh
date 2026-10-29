#!/usr/bin/env bash
# ============================================================
# 萌芽平台 (mengya-docker) - Nginx SNI SSL 反向代理与证书生成模块
# ============================================================

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
        if [ "$FORCE_UPDATE_SSL" = "1" ]; then
            echo -e "  \033[1;32m[强制更新] 显式指定更新 SSL 证书 (--renew-ssl)，准备重新生成...\033[0m"
            do_update="y"
        elif [ "$IS_INTERACTIVE" = "1" ] && [ "$NON_INTERACTIVE" = "0" ] && [ -t 0 ]; then
            echo -e "\033[1;33m[提示] 检测到已存在有效的 SSL 证书与私钥文件。\033[0m"
            echo -e "\033[1;31m[注意] 若选择更新，将重新生成自签名证书并覆盖现有文件内容（已有正式证书将被替换）！\033[0m"
            local choice="n"
            printf "是否需要更新 SSL 证书文件内容？(y/N): "
            read -r choice || choice="n"
            case "$choice" in
                [yY]|[yY][eE][sS])
                    do_update="y"
                    ;;
                *)
                    do_update="n"
                    ;;
            esac
        else
            echo "  [定时任务/免交互模式] 检测到已有有效证书，默认安全保留现有证书不变。"
            do_update="n"
        fi
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

    local listen_addr="$EXTERNAL_PORT"
    local proxy_mode="公网暴露 (0.0.0.0)"
    if [ -n "$NGINX_BIND_IP" ] && [ "$NGINX_BIND_IP" != "0.0.0.0" ]; then
        listen_addr="${NGINX_BIND_IP}:${EXTERNAL_PORT}"
        proxy_mode="前置代理 (${NGINX_BIND_IP})"
    fi

    local REDIRECT_BLOCK=""
    if [ "$ENABLE_HTTP_REDIRECT" = "1" ] && [ "$EXTERNAL_PORT" = "443" ] && [ -z "$NGINX_BIND_IP" ]; then
        REDIRECT_BLOCK="
# HTTP 80 自动重定向到 HTTPS 443（精准匹配 SERVER_NAME: $SERVER_NAME，避免影响其他网站）
server {
    listen 80;
    server_name $SERVER_NAME;

    return 301 https://\$host\$request_uri;
}
"
    fi

    # 临时生成目标配置文件，用于智能内容差分比对 (Diff 校验)
    local TMP_CONF="${NGINX_CONF}.tmp_$$"
    cat > "$TMP_CONF" << EOF
# ============================================================
# 萌芽平台 (Docker 版) - 宿主机 Nginx HTTPS (SNI 443) 反向代理配置
# 配置文件: $NGINX_CONF (独立于传统版，避免覆盖传统版 mengya_ssl.conf)
# 监听地址: $listen_addr (模式: $proxy_mode)
# 匹配域名: $SERVER_NAME (以 SERVER_NAME 配置为准，可与传统版共存)
# 后端服务: http://127.0.0.1:$FRONTEND_PORT (Docker 映射端口)
# ============================================================
${REDIRECT_BLOCK}
server {
    listen $listen_addr ssl;
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
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Forwarded-Host \$host;

        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;

        # 生产级缓冲与平滑重试（彻底消除 502 Bad Gateway）
        proxy_next_upstream error timeout invalid_header http_502 http_503;
        proxy_next_upstream_tries 3;
        proxy_next_upstream_timeout 10s;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
}
EOF

    local is_same=0
    if [ -s "$NGINX_CONF" ]; then
        # 剥离注释行与首尾空白，提取有效 Nginx 指令进行内容比对
        local cur_effective
        local new_effective
        cur_effective=$(grep -v '^[[:space:]]*#' "$NGINX_CONF" 2>/dev/null | tr -s '[:space:]')
        new_effective=$(grep -v '^[[:space:]]*#' "$TMP_CONF" 2>/dev/null | tr -s '[:space:]')
        if [ -n "$cur_effective" ] && [ "$cur_effective" = "$new_effective" ]; then
            is_same=1
        fi
    fi

    local do_update="n"
    if [ ! -s "$NGINX_CONF" ]; then
        echo "  检测到 Nginx 反代配置缺失，自动生成初始配置以接入 443 SNI..."
        do_update="y"
    elif [ "$is_same" = "1" ]; then
        rm -f "$TMP_CONF"
        echo -e "  \033[1;32m✅ [配置一致] 宿主机 Nginx 反代配置与当前环境（域名: $SERVER_NAME，监听: $listen_addr，模式: $proxy_mode）完全匹配，无需更新。\033[0m"
        echo "  SSL 证书路径:         $CERT_FILE"
        echo "  SNI 匹配域名:         $SERVER_NAME (以 SERVER_NAME 为准，主域名: $MAIN_DOMAIN)"
        echo "  外部访问端口:         $EXTERNAL_PORT"
        print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
        echo "  配置优势: 与传统版完全隔离，通过 SNI 域名 ($SERVER_NAME) 共享 443 端口！"
        echo ""
    else
        echo -e "\033[1;33m[提示] 检测到已存在 Nginx 配置文件与当前环境配置（如域名/端口/规则）不一致:\033[0m"
        echo "       配置文件路径: $NGINX_CONF"
        echo "       当前目标域名: $SERVER_NAME (主域名: $MAIN_DOMAIN)"
        echo "       当前监听地址: $listen_addr (模式: $proxy_mode)"
        echo -e "\033[1;31m[注意] 若选择覆盖，将根据当前配置更新，原有旧配置将自动备份为 .bak_时间戳 快照！\033[0m"

        local choice="n"
        if [ "$FORCE_UPDATE_NGINX" = "1" ] || [ "$FORCE" = "1" ]; then
            echo "  [强制模式] 显式指定更新 Nginx 配置，执行安全覆盖更新..."
            do_update="y"
        elif [ "$IS_INTERACTIVE" = "1" ] && [ "$NON_INTERACTIVE" = "0" ] && [ -t 0 ]; then
            printf "是否需要覆盖/更新 Nginx 配置文件内容？(y/N): "
            read -r choice || choice="n"
            case "$choice" in
                [yY]|[yY][eE][sS])
                    do_update="y"
                    ;;
                *)
                    do_update="n"
                    ;;
            esac
        else
            echo "  [定时任务/免交互环境] 存在配置差异，默认安全保留现有 Nginx 配置文件不变。"
            do_update="n"
        fi
    fi

    if [ "$do_update" = "y" ]; then
        if [ -s "$NGINX_CONF" ]; then
            local BAK_FILE="${NGINX_CONF}.bak_$(date '+%Y%m%d%H%M%S')"
            if cp -f "$NGINX_CONF" "$BAK_FILE" 2>/dev/null; then
                echo -e "  \033[1;32m[安全备份] 已自动为变更前的旧配置创建快照: $BAK_FILE\033[0m"
            fi
        fi
        mv -f "$TMP_CONF" "$NGINX_CONF"
        echo -e "  \033[1;32m[配置生效] Nginx 反代配置已成功同步写入: $NGINX_CONF\033[0m"
        echo "  SSL 证书路径:         $CERT_FILE"
        echo "  SNI 匹配域名:         $SERVER_NAME (以 SERVER_NAME 为准，主域名: $MAIN_DOMAIN)"
        echo "  外部访问端口:         $EXTERNAL_PORT"
        print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
        echo "  配置优势: 与传统版完全隔离，通过 SNI 域名 ($SERVER_NAME) 共享 443 端口！"
        echo ""
    elif [ "$is_same" = "0" ]; then
        rm -f "$TMP_CONF"
        echo "  保持现有 Nginx 配置文件内容不变，跳过配置更新。"
        echo "  ✅ 配置文件状态确认: 保留已有有效内容 ($NGINX_CONF)"
        echo "  SSL 证书路径:         $CERT_FILE"
        echo "  SNI 匹配域名:         $SERVER_NAME (以 SERVER_NAME 为准，主域名: $MAIN_DOMAIN)"
        echo "  外部访问端口:         $EXTERNAL_PORT"
        print_access_urls "HTTPS 访问入口" "$EXTERNAL_PORT"
        echo "  配置优势: 与传统版完全隔离，通过 SNI 域名 ($SERVER_NAME) 共享 443 端口！"
        echo ""
    fi

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
        echo "==> 检查并重载宿主机 Nginx 服务..."
        if nginx -t >/dev/null 2>&1 || sudo -n nginx -t >/dev/null 2>&1; then
            if sudo -n systemctl reload nginx 2>/dev/null || sudo -n nginx -s reload 2>/dev/null || nginx -s reload 2>/dev/null; then
                echo "  ✅ Nginx 配置重载成功，SNI 域名反代规则已实时生效！"
            else
                echo "  [提示] Nginx 未在运行或需要 root 权限重载，请按需执行: sudo nginx -s reload"
            fi
        else
            echo "  [警告] Nginx 语法测试未通过，请检查 /etc/nginx 或 $NGINX_CONF_DIR 配置: nginx -t"
        fi
    fi
}
