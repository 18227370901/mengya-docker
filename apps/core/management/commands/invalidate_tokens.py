"""强制注销全部用户会话（重启强制下线）

用法：
  python manage.py invalidate_tokens
"""
import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "注销所有现有用户的活跃登录会话，强制用户重新登录"

    def handle(self, *args, **options):
        revoked_marker = f"revoked_restart_{uuid.uuid4().hex[:12]}"
        count = User.objects.all().update(active_token_jti=revoked_marker)
        self.stdout.write(
            self.style.SUCCESS(f"✅ 已成功强制注销 {count} 个用户的活跃登录会话 (marker={revoked_marker})")
        )
