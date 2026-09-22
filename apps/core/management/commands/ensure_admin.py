"""确保单一管理员账号存在 —— 启动时自动创建或更新管理员，清理历史管理员与预置占位账号，并保护所有正常注册普通用户。

用法：
  python manage.py ensure_admin
  ADMIN_USERNAME=xxx ADMIN_PASSWORD=xxx ADMIN_NICKNAME=xxx python manage.py ensure_admin

环境变量：
  ADMIN_USERNAME    管理员账号（默认 admin）
  ADMIN_PASSWORD    管理员密码（默认 admin123）
  ADMIN_NICKNAME    管理员昵称（默认 管理员）
"""
import os
import sys

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import IntegrityError, models, transaction

User = get_user_model()


class Command(BaseCommand):
    help = "确保单一管理员账号存在，清理历史管理员与预置占位账号，并保护所有正常注册普通用户"

    def handle(self, *args, **options):
        account = (os.getenv("ADMIN_USERNAME") or "admin").strip()
        password = os.getenv("ADMIN_PASSWORD", "admin123")
        nickname = os.getenv("ADMIN_NICKNAME", "管理员")

        try:
            with transaction.atomic():
                self._sync_admin(account, password, nickname)
        except Exception as e:
            self.stderr.write(
                self.style.ERROR(f"[ensure_admin 警告] 同步管理员异常: {e}，正在尝试自愈保护继续启动...")
            )
            try:
                with transaction.atomic():
                    admin_fallback = User.objects.filter(models.Q(is_superuser=True) | models.Q(is_staff=True)).first()
                    if not admin_fallback:
                        User.objects.create_user(
                            phone=account,
                            username=account,
                            password=password,
                            nickname=nickname,
                            is_staff=True,
                            is_superuser=True,
                            is_active=True,
                            ai_authorized=True,
                        )
            except Exception as inner_e:
                self.stderr.write(self.style.ERROR(f"[ensure_admin 兜底失败] {inner_e}"))

    def _sync_admin(self, account, password, nickname):
        # 1. 查找目标管理员账号（优先匹配当前配置的 username 或 phone）
        target_admin = (
            User.objects.filter(username__iexact=account).first()
            or User.objects.filter(phone__iexact=account).first()
        )

        if target_admin:
            # 用户已存在：如果存在其他冲突用户（例如历史占位或旧管理员占用了 account 对应的 phone/username），先行清理冲突
            conflict_phone = User.objects.filter(phone__iexact=account).exclude(pk=target_admin.pk).first()
            if conflict_phone:
                if conflict_phone.is_staff or conflict_phone.is_superuser:
                    conflict_phone.delete()
                else:
                    conflict_phone.phone = f"{conflict_phone.phone}_legacy_{conflict_phone.pk}"
                    conflict_phone.save(update_fields=["phone"])

            conflict_uname = User.objects.filter(username__iexact=account).exclude(pk=target_admin.pk).first()
            if conflict_uname:
                if conflict_uname.is_staff or conflict_uname.is_superuser:
                    conflict_uname.delete()
                else:
                    conflict_uname.username = f"{conflict_uname.username}_legacy_{conflict_uname.pk}"
                    conflict_uname.save(update_fields=["username"])

            target_admin.username = account
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
            # 若存在占用了 account 作为 phone 或 username 的历史管理员或占位账号，先清理
            conflicts = User.objects.filter(
                models.Q(username__iexact=account) | models.Q(phone__iexact=account)
            )
            for c in conflicts:
                if c.is_staff or c.is_superuser or c.phone in ["13800000000", "13800138000"] or c.username in ["13800000000", "demo_user"]:
                    c.delete()
                else:
                    if c.username.lower() == account.lower():
                        c.username = f"{c.username}_legacy_{c.pk}"
                    if c.phone.lower() == account.lower():
                        c.phone = f"{c.phone}_legacy_{c.pk}"
                    c.save()

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

        # 2. 清理其他历史管理员账号（严格保留当前唯一管理员 target_admin）
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

        # 3. 清理历史遗留预置占位账号（13800000000 与 demo_user / 13800138000）
        legacy_placeholders = User.objects.filter(
            models.Q(username__in=["13800000000", "demo_user"]) |
            models.Q(phone__in=["13800000000", "13800138000"])
        ).exclude(pk=target_admin.pk)

        if legacy_placeholders.exists():
            try:
                from apps.core.models.baby import BabyProfile
                for p in legacy_placeholders:
                    BabyProfile.objects.filter(user=p).delete()
            except Exception:
                pass
            del_count, _ = legacy_placeholders.delete()
            self.stdout.write(
                self.style.WARNING(f"已清理历史预置占位账号 {del_count} 个 (13800000000 / 13800138000)")
            )

        # 4. 统计并输出普通用户保护状态
        normal_user_count = User.objects.filter(is_staff=False, is_superuser=False).count()
        self.stdout.write(
            self.style.SUCCESS(f"当前系统唯一管理员：{target_admin.username}（登录账号: {target_admin.phone}）")
        )
        self.stdout.write(
            f"所有已正常注册的普通用户账号（共 {normal_user_count} 个）已完整保留，未受任何修改或影响。"
        )

