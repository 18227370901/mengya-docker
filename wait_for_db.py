#!/usr/bin/env python
# ============================================================
# 萌芽平台 - 数据库服务就绪等待探针 (Wait for DB Probe)
# 作用：在执行 migrate 之前等待 PostgreSQL 端口可用并验证认证，
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

    print(f"==> [DB 就绪等待] 正在探测 PostgreSQL 服务端口与数据库连接 ({host}:{port})...")
    for i in range(1, max_retries + 1):
        try:
            s = socket.create_connection((host, int(port)), timeout=2)
            s.close()
            # 端口已可连通，尝试真实认证与查询
            try:
                import psycopg2
                conn = psycopg2.connect(db_url, connect_timeout=3)
                conn.close()
                print(f"  ✔ [DB 就绪] PostgreSQL 服务与数据库认证成功 (耗时 {i}s)！")
                return 0
            except ImportError:
                print(f"  ✔ [DB 就绪] PostgreSQL 端口已可连通 (耗时 {i}s)！")
                return 0
            except Exception as auth_err:
                err_msg = str(auth_err)
                if "starting up" in err_msg.lower():
                    if i % 3 == 0 or i == max_retries:
                        print(f"  [等待中] PostgreSQL 内核正在初始化完成中 ({i}/{max_retries}s)...")
                    time.sleep(1)
                    continue
                if "password authentication failed" in err_msg.lower() or "does not exist" in err_msg.lower():
                    print(f"  ❌ [DB 认证异常] 数据库凭证或库名不匹配: {err_msg.strip()}")
                    print(f"     提示: 若数据卷此前曾由其他密码创建，请执行 docker compose down -v 重新全新初始化，或使用 ./run.sh reconfig 修正密码！")
                    return 1
                if i % 5 == 0 or i == max_retries:
                    print(f"  [等待中] 尝试连接数据库 ({i}/{max_retries}s): {err_msg.strip()}")
                time.sleep(1)
        except Exception as e:
            if i % 5 == 0 or i == max_retries:
                print(f"  [等待中] 尝试连接 {host}:{port} ({i}/{max_retries}s): {e}")
            time.sleep(1)

    print(f"  ⚠ [DB 超时] 超过 {max_retries} 秒未能连接到 PostgreSQL ({host}:{port})")
    return 1


if __name__ == "__main__":
    ret = wait_for_database()
    sys.exit(ret)
