"""初始化数据命令：填充品牌、商品、孕期周历、胎教故事、孕期食谱、幼儿百科、待产清单等全量样例数据

用法：
  python manage.py init_data                     # 按需补充缺失数据
  python manage.py init_data --skip-if-exists    # 已有数据模块跳过，缺失模块自动补齐
  python manage.py init_data --force             # 强制全量覆盖初始化
"""
import json
import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection, models, transaction

from apps.core.models import (
    BabyProfile,
    BabyShoppingItem,
    BrandProfile,
    FetalStory,
    KidsEncyclopedia,
    Product,
    Recipe,
    SystemSetting,
    TimelineEvent,
)

User = get_user_model()


class Command(BaseCommand):
    help = "初始化萌芽平台全量样例数据（品牌、商品、周历、食谱、胎教故事、幼儿百科、待产清单）"

    def add_arguments(self, parser):
        parser.add_argument("--skip-if-exists", action="store_true", default=True, help="已有完整数据时跳过（默认开启，按模块判断）")
        parser.add_argument("--force", action="store_true", help="强制覆盖并全量重建所有样例数据")

    def handle(self, *args, **options):
        force = options.get("force", False)

        # 1. 读取基础种子数据文件
        fixture_path = os.path.join(settings.BASE_DIR, "apps", "core", "fixtures", "initial_data.json")
        if not os.path.exists(fixture_path):
            fixture_path = os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "initial_data.json")
        fixture_path = os.path.normpath(fixture_path)

        if not os.path.exists(fixture_path):
            self.stdout.write(self.style.ERROR(f"未找到种子数据文件: {fixture_path}"))
            return

        with open(fixture_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        by_model = {}
        for item in raw_data:
            by_model.setdefault(item.get("model"), []).append(item)

        self.stdout.write(self.style.NOTICE("==> 开始检查并初始化萌芽平台全量样例数据..."))

        with transaction.atomic():
            # 1. 品牌档案 BrandProfile (41条)
            self._load_brand_profiles(by_model.get("core.brandprofile", []), force)

            # 2. 推荐商品 Product (63条)
            self._load_products(by_model.get("core.product", []), force)

            # 3. 孕期40周全量周历 TimelineEvent (204条)
            self._load_timeline(by_model.get("core.timelineevent", []), force)

            # 4. 睡前胎教故事 FetalStory (245条)
            self._load_fetal_stories(by_model.get("core.fetalstory", []), force)

            # 5. 孕期营养食谱 Recipe (288条)
            self._load_recipes(by_model.get("core.recipe", []), force)

            # 6. 幼儿百科与问答 KidsEncyclopedia (57条)
            self._load_kids_encyclopedia(by_model.get("core.kidsencyclopedia", []), force)

            # 7. 待产与母婴清单 BabyShoppingItem (69条)
            self._load_baby_shopping(by_model.get("core.babyshoppingitem", []), force)

            # 8. 系统全局设置 SystemSetting
            self._ensure_system_setting(by_model.get("core.systemsetting", []))

            # 9. 物理清理历史预置演示账号与测试宝宝档案（消除默认密码安全隐患）
            self._cleanup_legacy_demo_users()

        # 10. 重置 PostgreSQL 自增序列
        self._reset_db_sequences()

        self.stdout.write(self.style.SUCCESS("[OK] 全量样例数据检查与初始化全部完成！"))

    def _load_brand_profiles(self, items, force):
        count = BrandProfile.objects.count()
        if count >= len(items) and not force:
            self.stdout.write(f"  [跳过] 品牌档案已存在 ({count} 条)")
            return
        if force:
            BrandProfile.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            BrandProfile.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 品牌档案初始化完成 (共 {created} 条)"))

    def _load_products(self, items, force):
        count = Product.objects.count()
        if count >= len(items) and not force:
            self.stdout.write(f"  [跳过] 推荐商品已存在 ({count} 条)")
            return
        if force:
            Product.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            fields["brand_profile_id"] = fields.pop("brand_profile", None)
            Product.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 推荐商品初始化完成 (共 {created} 条)"))

    def _load_timeline(self, items, force):
        count = TimelineEvent.objects.count()
        # 若记录数少于 40，说明仅有旧脚本残存的几条样本，必须全量补充到 204 条
        if count >= 40 and not force:
            self.stdout.write(f"  [跳过] 孕期周历时间轴已存在 ({count} 条)")
            return
        if count > 0:
            TimelineEvent.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            fields.pop("products", None)
            TimelineEvent.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 孕期周历时间轴初始化完成 (共 {created} 条，涵盖40周全程)"))

    def _load_fetal_stories(self, items, force):
        count = FetalStory.objects.count()
        if count >= len(items) and not force:
            self.stdout.write(f"  [跳过] 胎教故事已存在 ({count} 条)")
            return
        if force:
            FetalStory.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            FetalStory.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 胎教故事初始化完成 (共 {created} 条，涵盖孕17-40周双语伴读)"))

    def _load_recipes(self, items, force):
        count = Recipe.objects.count()
        if count >= len(items) and not force:
            self.stdout.write(f"  [跳过] 孕期食谱已存在 ({count} 条)")
            return
        if force:
            Recipe.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            Recipe.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 孕期营养食谱初始化完成 (共 {created} 条，涵盖早/中/晚孕期)"))

    def _load_kids_encyclopedia(self, items, force):
        count = KidsEncyclopedia.objects.count()
        if count >= len(items) and not force:
            self.stdout.write(f"  [跳过] 幼儿百科已存在 ({count} 条)")
            return
        if force:
            KidsEncyclopedia.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            KidsEncyclopedia.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 幼儿百科问答初始化完成 (共 {created} 条，涵盖4大篇章)"))

    def _load_baby_shopping(self, items, force):
        count = BabyShoppingItem.objects.count()
        if count >= len(items) and not force:
            self.stdout.write(f"  [跳过] 待产清单已存在 ({count} 条)")
            return
        if force:
            BabyShoppingItem.objects.all().delete()
        created = 0
        for d in items:
            pk = d["pk"]
            fields = dict(d["fields"])
            BabyShoppingItem.objects.update_or_create(id=pk, defaults=fields)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"  [就绪] 待产母婴清单初始化完成 (共 {created} 条)"))

    def _ensure_system_setting(self, items):
        if not SystemSetting.objects.exists() and items:
            d = items[0]
            SystemSetting.objects.update_or_create(id=d["pk"], defaults=dict(d["fields"]))
            self.stdout.write(self.style.SUCCESS("  [就绪] 系统全局设置初始化完成"))
        elif not SystemSetting.objects.exists():
            SystemSetting.objects.create(registration_mode="open")
            self.stdout.write(self.style.SUCCESS("  [就绪] 系统全局默认设置创建完成"))

    def _cleanup_legacy_demo_users(self):
        legacy_demos = User.objects.filter(
            models.Q(username="demo_user") | models.Q(phone="13800138000")
        )
        if legacy_demos.exists():
            for demo in legacy_demos:
                BabyProfile.objects.filter(user=demo).delete()
            del_count, _ = legacy_demos.delete()
            self.stdout.write(self.style.WARNING(f"  [安全收敛] 已物理清除历史预置演示账号 {del_count} 个 (demo_user/13800138000)"))

    def _reset_db_sequences(self):
        try:
            from django.core.management.color import no_style
            models_to_reset = [
                BrandProfile,
                Product,
                TimelineEvent,
                FetalStory,
                Recipe,
                KidsEncyclopedia,
                BabyShoppingItem,
            ]
            sequence_sql = connection.ops.sequence_reset_sql(no_style(), models_to_reset)
            if sequence_sql:
                with connection.cursor() as cursor:
                    for sql in sequence_sql:
                        cursor.execute(sql)
        except Exception:
            pass
