"""导入288道怀孕餐数据到Recipe模型"""
import os
import re

from django.core.management.base import BaseCommand
from apps.core.models import Recipe


class Command(BaseCommand):
    help = "从Markdown文件导入288道怀孕餐数据"

    def add_arguments(self, parser):
        parser.add_argument("--file", type=str, default="", help="Markdown文件路径")
        parser.add_argument("--clear", action="store_true", help="导入前清空旧数据")

    def handle(self, *args, **options):
        file_path = options.get("file") or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
            "..", "..",
            "288道怀孕餐_养胎瘦身两不误_完整提取.md"
        )
        file_path = os.path.normpath(file_path)

        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f"文件不存在: {file_path}"))
            # Try workspace root
            workspace = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
            file_path = os.path.join(workspace, "288道怀孕餐_养胎瘦身两不误_完整提取.md")
            file_path = os.path.normpath(file_path)
            if not os.path.exists(file_path):
                self.stdout.write(self.style.ERROR(f"文件不存在: {file_path}"))
                return

        if options.get("clear"):
            count = Recipe.objects.count()
            Recipe.objects.all().delete()
            self.stdout.write(f"已清空 {count} 条旧数据")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Part 到孕期月份的映射
        PART_MONTH_MAP = {
            "Part 2": ("month_1_2", "early", "孕期一、二月"),
            "Part 3": ("month_3_4", "mid", "孕期三、四月"),
            "Part 4": ("month_5_6", "mid", "孕期五、六月"),
            "Part 5": ("month_7_8", "late", "孕期七、八月"),
            "Part 6": ("month_9_10", "late", "孕期九、十月"),
        }

        # 按 Part 分割内容
        parts = re.split(r"^# (Part \d+)", content, flags=re.MULTILINE)

        created_count = 0
        sort_order = 0

        for i in range(1, len(parts), 2):
            part_key = parts[i].strip()
            part_content = parts[i + 1] if i + 1 < len(parts) else ""

            if part_key not in PART_MONTH_MAP:
                continue

            period_month, period, period_label = PART_MONTH_MAP[part_key]
            self.stdout.write(f"处理 {part_key} ({period_label})...")

            # 解析食谱
            recipes = self._parse_recipes(part_content)
            self.stdout.write(f"  找到 {len(recipes)} 道菜")

            for recipe_data in recipes:
                Recipe.objects.create(
                    title=recipe_data["title"],
                    nutrient_tag=recipe_data["nutrient_tag"],
                    period=period,
                    period_month=period_month,
                    ingredients=recipe_data["ingredients"],
                    steps=recipe_data["steps"],
                    nutrition_tip=recipe_data.get("nutrition_tip", ""),
                    sort_order=sort_order,
                )
                sort_order += 1
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f"成功导入 {created_count} 道食谱"))

    def _parse_recipes(self, content):
        """解析Markdown中的食谱"""
        recipes = []
        lines = content.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # 匹配 ### 菜名（营养标签）
            match = re.match(r"^###\s+(.+?)（(.+?)）", line)
            if not match:
                i += 1
                continue

            title = match.group(1).strip()
            nutrient_tag = match.group(2).strip()

            # 跳过运动类条目
            if any(kw in title for kw in ["运动", "孕.动", "活动"]):
                i += 1
                continue

            # 收集后续行直到下一个 ### 或 #
            body_lines = []
            i += 1
            while i < len(lines):
                l = lines[i].strip()
                if l.startswith("### ") or l.startswith("## ") or l.startswith("# "):
                    break
                if l:
                    body_lines.append(l)
                i += 1

            # 解析材料、做法、营养小叮咛
            ingredients = ""
            steps = ""
            nutrition_tip = ""

            # 提取材料
            for j, bl in enumerate(body_lines):
                if bl.startswith("**材料") or bl.startswith("＊＊材料"):
                    ingredients = re.sub(r"^\*\*材料[^:]*：\*\*\s*", "", bl).strip()
                    ingredients = ingredients.replace("**", "")
                    break

            # 提取做法步骤
            in_steps = False
            step_lines = []
            for bl in body_lines:
                if "**做法" in bl or "＊＊做法" in bl:
                    in_steps = True
                    continue
                if "**营养小叮咛" in bl or "＊＊营养小叮咛" in bl:
                    nutrition_tip = re.sub(r"^\*\*营养小叮咛：\*\*\s*", "", bl).strip()
                    nutrition_tip = nutrition_tip.replace("**", "")
                    in_steps = False
                    continue
                if in_steps and re.match(r"^\d+\.", bl):
                    step_lines.append(bl)

            steps = "\n".join(step_lines)

            if title and ingredients:
                recipes.append({
                    "title": title,
                    "nutrient_tag": nutrient_tag,
                    "ingredients": ingredients,
                    "steps": steps,
                    "nutrition_tip": nutrition_tip,
                })

        return recipes
