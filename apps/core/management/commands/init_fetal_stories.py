"""胎教故事种子数据 —— 从 epub 提取，按孕17-40周分配

用法：
  python manage.py init_fetal_stories
  python manage.py init_fetal_stories --skip-if-exists
"""
import json
import os

from django.core.management.base import BaseCommand
from apps.core.models import FetalStory


class Command(BaseCommand):
    help = "初始化胎教故事种子数据（从 epub 提取，孕17-40周）"

    def add_arguments(self, parser):
        parser.add_argument("--skip-if-exists", action="store_true", help="已有数据时跳过")

    def handle(self, *args, **options):
        if options["skip_if_exists"] and FetalStory.objects.exists():
            self.stdout.write(self.style.WARNING("胎教故事已存在，跳过初始化"))
            return

        if not options.get("skip_if_exists"):
            FetalStory.objects.all().delete()
            self.stdout.write("已清空旧数据")

        json_path = os.path.join(os.path.dirname(__file__), "fetal_stories_data.json")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        source_map = {
            "10min": "每天10分钟胎教故事（付娟娟）",
            "jingxuan": "精选睡前胎教故事（川川）",
            "mama": "听妈妈讲睡前胎教故事（菅波）",
            "baba": "听爸爸讲睡前胎教故事（菅波）",
        }

        stories = []
        for i, item in enumerate(data):
            stories.append(FetalStory(
                title=item["title"],
                subtitle=item.get("subtitle", ""),
                content=item["content"],
                tips=item.get("tips", ""),
                cover_image=item.get("cover_image", ""),
                week_start=item["week_start"],
                day_offset=item["day_offset"],
                day_index=item["day_index"],
                narrator=item["narrator"],
                source=source_map.get(item["source_book"], ""),
                sort_order=i,
            ))

        FetalStory.objects.bulk_create(stories)
        self.stdout.write(self.style.SUCCESS(
            f"\u2705 胎教故事初始化完成，共 {len(stories)} 篇"
        ))
