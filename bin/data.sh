#!/usr/bin/env bash
# ============================================================
# 萌芽平台 (mengya-docker) - 种子数据与全量样例初始化模块
# ============================================================

init_data_docker() {
    check_docker_env
    local compose
    compose=$(compose_cmd)
    echo "==> 正在执行全量样例数据检查与补充初始化..."
    $compose exec -T backend python manage.py init_data "$@"
}
