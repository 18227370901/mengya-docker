# -*- coding: utf-8 -*-
import os
import sys
from pathlib import Path

# 确保项目根目录在 sys.path 中
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from apps.core.models import User

admin = User.objects.filter(username="admin").first()
if admin:
    print(f"admin: id={admin.id}, is_active={admin.is_active}, is_staff={admin.is_staff}, is_superuser={admin.is_superuser}, login_fail={admin.login_fail_count}, sec_fail={admin.security_fail_count}, locked_until={admin.locked_until}")
else:
    print("admin not found!")
