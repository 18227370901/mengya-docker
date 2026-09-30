#!/usr/bin/env python
# ============================================================
# 萌芽平台 - 数据库服务就绪等待探针 (Wait for DB Probe)
# 作用：在执行 migrate 之前等待 PostgreSQL 端口可用，
#       平滑度过数据库容器启动初期的时序抖动，杜绝闪退与假死
# ============================================================
import os
import sys
import time
import socket
from urllib.parse import urlparse


def wait_for_database():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not (db_url.startswith("postgresql://") or db_url.startswith("postgres://")):
        # 非 PostgreSQL 模式（如 SQLite），直接放行
        return 0

    p = urlparse(db_url)
    host = p.hostname or "db"
    port = p.port or 5432
    max_retries = int(os.getenv("DB_WAIT_TIMEOUT", "30"))

    print(f"==> [DB 就绪等待] 正在探测 PostgreSQL 服务端口 ({host}:{port})...")
    for i in range(1, max_retries + 1):
        try:
            s = socket.create_connection((host, int(port)), timeout=2)
            s.close()
            print(f"  ✔ [DB 就绪] PostgreSQL 服务已可连通 (耗时 {i}s)！")
            return 0
        except Exception as e:
            if i % 5 == 0 or i == max_retries:
                print(f"  [等待中] 尝试连接 {host}:{port} ({i}/{max_retries}s): {e}")
            time.sleep(1)

    print(f"  ⚠ [DB 超时] 超过 {max_retries} 秒未能连接到 PostgreSQL ({host}:{port})，尝试继续执行启动流程...")
    return 1


if __name__ == "__main__":
    wait_for_database()
