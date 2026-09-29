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
