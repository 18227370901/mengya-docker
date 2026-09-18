from django.db import migrations, models
import django.db.models.deletion
import secrets


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_add_ai_authorized"),
    ]

    operations = [
        migrations.CreateModel(
            name="SystemSetting",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("registration_mode", models.CharField(
                    choices=[("open", "开放注册"), ("invitation_only", "仅限邀请注册")],
                    default="open", max_length=20, verbose_name="注册模式")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="更新时间")),
            ],
            options={"verbose_name": "系统设置", "verbose_name_plural": "系统设置"},
        ),
        migrations.CreateModel(
            name="InviteLink",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.CharField(max_length=64, unique=True, verbose_name="邀请令牌")),
                ("max_uses", models.IntegerField(default=1, verbose_name="最大使用次数")),
                ("used_count", models.IntegerField(default=0, verbose_name="已使用次数")),
                ("expires_at", models.DateTimeField(blank=True, null=True, verbose_name="过期时间")),
                ("is_active", models.BooleanField(default=True, verbose_name="是否有效")),
                ("note", models.CharField(blank=True, max_length=200, verbose_name="备注")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="创建时间")),
                ("created_by", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="created_invites",
                    to="core.user",
                    verbose_name="创建者")),
            ],
            options={"verbose_name": "邀请链接", "verbose_name_plural": "邀请链接", "ordering": ["-created_at"]},
        ),
    ]
