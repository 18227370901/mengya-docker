#!/usr/bin/env python
"""Django 管理脚本入口（支持 .venv 自动探测与无缝委托）"""
import os
import sys
from pathlib import Path

# 自动自愈：若当前 Python 解释器非本工程 .venv，且工程内存在 .venv，自动透明委托执行
_base_dir = Path(__file__).resolve().parent
_venv_python = (
    _base_dir / ".venv" / "Scripts" / "python.exe"
    if os.name == "nt"
    else _base_dir / ".venv" / "bin" / "python"
)
if _venv_python.is_file() and Path(sys.executable).resolve() != _venv_python.resolve():
    import subprocess
    _res = subprocess.run([str(_venv_python), str(Path(__file__).resolve())] + sys.argv[1:])
    sys.exit(_res.returncode)

try:
    import certifi
    _ca_bundle = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", _ca_bundle)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _ca_bundle)
    os.environ.setdefault("CURL_CA_BUNDLE", _ca_bundle)
except Exception:
    pass


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
