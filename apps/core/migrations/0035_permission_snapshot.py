"""v1.88.6 权限模板「快照固化」模式数据迁移。

背景：v1.88.6 起，系统全局默认权限模板不再实时套用于所有用户，
仅作为快照源在新用户注册、管理员点击「重置为系统默认」时固化写入用户。

本迁移将存量 custom_permissions 为空（未固化快照）的普通用户，
按「代码基线 + 最新全局默认模板 + 宝宝阶段自适应」固化为当前实际生效权限，
保证升级前后这些用户权限感知零变化（升级后模板改动不再自动波及他们）。
"""

from django.db import migrations


def snapshot_empty_custom_permissions(apps, schema_editor):
    """固化存量空权限快照普通用户的当前生效权限。"""
    from apps.core.utils.permissions import build_initial_permissions

    User = apps.get_model("core", "User")
    users = list(User.objects.filter(is_staff=False, is_superuser=False))
    updated = 0
    for u in users:
        if (u.custom_permissions or {}):
            continue
        snapshot = build_initial_permissions(
            due_date=u.due_date,
            baby_birthday=u.baby_birthday,
            is_pregnant=u.is_pregnant,
        )
        if not snapshot:
            continue
        u.custom_permissions = snapshot
        u.save(update_fields=["custom_permissions"])
        updated += 1
    if updated:
        print(f"  权限快照迁移：已为 {updated} 个存量普通用户固化默认权限快照")


class Migration(migrations.Migration):
    """权限模板快照固化：存量空快照用户权限固化迁移"""

    dependencies = [
        ("core", "0034_timelineevent_is_active_and_more"),
    ]

    operations = [
        migrations.RunPython(snapshot_empty_custom_permissions, migrations.RunPython.noop),
    ]