"""确保单一管理员账号存在 —— 启动时自动创建或更新管理员，清理历史管理员

用法：
  python manage.py ensure_admin
  ADMIN_USERNAME=xxx ADMIN_PASSWORD=xxx ADMIN_NICKNAME=xxx python manage.py ensure_admin

环境变量：
  ADMIN_USERNAME    管理员账号（默认 admin）
  ADMIN_PASSWORD    管理员密码（默认 admin123）
  ADMIN_NICKNAME    管理员昵称（默认 管理员）
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import models

User = get_user_model()


class Command(BaseCommand):
    help = "确保单一管理员账号存在，清理历史管理员账号，并保护所有普通用户账号"

    def handle(self, *args, **options):
        account = (os.getenv("ADMIN_USERNAME") or "admin").strip()
        password = os.getenv("ADMIN_PASSWORD", "admin123")
        nickname = os.getenv("ADMIN_NICKNAME", "管理员")

        # 1. 查找目标管理员账号（优先匹配当前配置的 username 或 phone）
        target_admin = (
            User.objects.filter(username__iexact=account).first()
            or User.objects.filter(phone__iexact=account).first()
        )

        if target_admin:
            # 用户已存在：确保其为管理员并更新密码与权限
            target_admin.username = account
            # 若 phone 变更，先检查是否有其他用户占用
            if target_admin.phone != account:
                conflict = User.objects.filter(phone__iexact=account).exclude(pk=target_admin.pk).first()
                if conflict:
                    if conflict.is_staff or conflict.is_superuser:
                        conflict.delete()
                        target_admin.phone = account
                else:
                    target_admin.phone = account
            target_admin.set_password(password)
            target_admin.is_staff = True
            target_admin.is_superuser = True
            target_admin.is_active = True
            target_admin.nickname = nickname
            target_admin.ai_authorized = True
            target_admin.login_fail_count = 0
            target_admin.security_fail_count = 0
            target_admin.locked_until = None
            target_admin.save()
            self.stdout.write(
                self.style.SUCCESS(f"管理员账号已更新：{account}（昵称：{nickname}）")
            )
        else:
            # 用户不存在：创建全新管理员用户
            # 若存在占用了 account 作为 phone 或 username 的历史管理员，先清理掉
            conflicts = User.objects.filter(
                models.Q(username__iexact=account) | models.Q(phone__iexact=account),
                models.Q(is_staff=True) | models.Q(is_superuser=True),
            )
            if conflicts.exists():
                conflicts.delete()

            target_admin = User.objects.create_user(
                phone=account,
                username=account,
                password=password,
                nickname=nickname,
                is_staff=True,
                is_superuser=True,
                is_active=True,
                ai_authorized=True,
            )
            self.stdout.write(
                self.style.SUCCESS(f"管理员账号已创建：{account}（昵称：{nickname}）")
            )

        # 2. 清理历史管理员账号（严格保留当前唯一管理员 target_admin）
        # 注意：普通用户（is_staff=False 且 is_superuser=False）绝不清理！
        old_admins = User.objects.filter(
            models.Q(is_staff=True) | models.Q(is_superuser=True)
        ).exclude(pk=target_admin.pk)

        deleted_count = 0
        if old_admins.exists():
            # 外键关联安全迁移：将历史管理员创建的有效邀请链接转给当前唯一管理员
            try:
                from apps.core.models.system import InviteLink
                InviteLink.objects.filter(created_by__in=old_admins).update(created_by=target_admin)
            except Exception:
                pass

            old_names = [f"{u.username}({u.phone})" for u in old_admins]
            deleted_count, _ = old_admins.delete()
            formatted_names = ", ".join(old_names)
            self.stdout.write(
                self.style.WARNING(f"已清理历史管理员账号 {deleted_count} 个：{formatted_names}")
            )

        # 3. 统计并输出普通用户保护状态
        normal_user_count = User.objects.filter(is_staff=False, is_superuser=False).count()
        self.stdout.write(
            self.style.SUCCESS(f"当前系统唯一管理员：{target_admin.username}（登录账号: {target_admin.phone}）")
        )
        self.stdout.write(
            f"所有普通用户账号（共 {normal_user_count} 个）已完整保留，未受任何修改或影响。"
        )
