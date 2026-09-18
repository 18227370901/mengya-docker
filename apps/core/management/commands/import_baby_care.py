"""导入新生儿婴儿护理百科全书数据到TimelineEvent模型"""
import os
import re

from django.core.management.base import BaseCommand
from apps.core.models import TimelineEvent


class Command(BaseCommand):
    help = "从extracted_text.md导入新生儿婴儿护理百科全书数据"

    def add_arguments(self, parser):
        parser.add_argument("--file", type=str, default="", help="Markdown文件路径")
        parser.add_argument("--clear", action="store_true", help="导入前清除旧的baby_age数据")

    def handle(self, *args, **options):
        file_path = options.get("file")
        if not file_path:
            # Try .temp directory in workspace root
            workspace = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
            file_path = os.path.join(workspace, ".temp", "extracted_text.md")
            file_path = os.path.normpath(file_path)

        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f"文件不存在: {file_path}"))
            return

        if options.get("clear"):
            deleted = TimelineEvent.objects.filter(
                stage_type__in=["baby_age_day", "baby_age_month"]
            ).delete()
            self.stdout.write(f"已清除 {deleted[0]} 条旧数据")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Part 到月龄的映射
        # Part 1 = 新生儿期 -> baby_age_day, value=0
        # Part 2 = 1-2月 -> baby_age_month, value=1 (covers 1-2)
        # Part 3 = 2-3月 -> baby_age_month, value=2 (covers 2-3)
        # ...Part 12 = 11-12月 -> baby_age_month, value=11 (covers 11-12)
        PART_MAP = {
            1: {"stage_type": "baby_age_day", "stage_value": 0, "label": "新生儿期"},
            2: {"stage_type": "baby_age_month", "stage_value": 1, "label": "1～2个月"},
            3: {"stage_type": "baby_age_month", "stage_value": 2, "label": "2～3个月"},
            4: {"stage_type": "baby_age_month", "stage_value": 3, "label": "3～4个月"},
            5: {"stage_type": "baby_age_month", "stage_value": 4, "label": "4～5个月"},
            6: {"stage_type": "baby_age_month", "stage_value": 5, "label": "5～6个月"},
            7: {"stage_type": "baby_age_month", "stage_value": 6, "label": "6～7个月"},
            8: {"stage_type": "baby_age_month", "stage_value": 7, "label": "7～8个月"},
            9: {"stage_type": "baby_age_month", "stage_value": 8, "label": "8～9个月"},
            10: {"stage_type": "baby_age_month", "stage_value": 9, "label": "9～10个月"},
            11: {"stage_type": "baby_age_month", "stage_value": 10, "label": "10～11个月"},
            12: {"stage_type": "baby_age_month", "stage_value": 11, "label": "11～12个月"},
        }

        # 节标题到分类的映射
        SECTION_CATEGORIES = [
            ("成长与发育进程", "milestone", "成长与发育"),
            ("孩子的常见疾病", "health", "常见疾病"),
            ("喂养的常识与方法", "food", "喂养指南"),
            ("喂养的常识与方法", "food", "喂养指南"),
            ("环境与异常情况", "housing", "环境与护理"),
            ("环境与异常情况", "housing", "环境与护理"),
            ("产后饮食营养", "food", "产后饮食"),
            ("产后运动", "exercise", "产后运动"),
            ("产后保养须知", "health", "产后保养"),
        ]

        # 按 ｜Part N｜ 分割内容
        parts = re.split(r"｜Part\s*(\d+)｜", content)

        created_count = 0
        sort_order = 0

        # parts[0] is the content before the first marker
        # parts[1] = part number, parts[2] = content
        # parts[3] = part number, parts[4] = content, etc.
        for i in range(1, len(parts), 2):
            part_num = int(parts[i].strip())
            part_content = parts[i + 1] if i + 1 < len(parts) else ""

            if part_num not in PART_MAP:
                continue

            stage_info = PART_MAP[part_num]
            self.stdout.write(f"处理 Part {part_num} ({stage_info['label']})...")

            # 将内容按已知节标题分段
            sections = self._split_sections(part_content)

            for sec_title, sec_content in sections:
                # 确定分类
                category = "health"
                cat_label = "日常护理"
                for keyword, cat, label in SECTION_CATEGORIES:
                    if keyword in sec_title:
                        category = cat
                        cat_label = label
                        break

                # 跳过空内容
                if not sec_content.strip():
                    continue

                # 清理内容
                clean_content = sec_content.strip()
                # 截取前2000字符避免过长
                if len(clean_content) > 2000:
                    clean_content = clean_content[:2000] + "..."

                TimelineEvent.objects.create(
                    stage_type=stage_info["stage_type"],
                    stage_value=stage_info["stage_value"],
                    category=category,
                    title=f"{stage_info['label']}：{sec_title}",
                    subtitle=cat_label,
                    content=clean_content,
                    tips="",
                    is_essential=part_num <= 4,  # 前4个月标记为重点
                    sort_order=sort_order,
                )
                sort_order += 1
                created_count += 1

            self.stdout.write(f"  创建 {len(sections)} 条记录")

        # 处理附录（产妇保健）
        appendix_content = ""
        for i in range(1, len(parts), 2):
            part_content = parts[i + 1] if i + 1 < len(parts) else ""
            if "附录" in part_content[:100] or "产后" in part_content[:100]:
                appendix_content = part_content
                break

        if appendix_content:
            self.stdout.write("处理附录（产妇保健）...")
            sections = self._split_sections(appendix_content)
            for sec_title, sec_content in sections:
                if not sec_content.strip():
                    continue
                category = "health"
                if "饮食" in sec_title or "营养" in sec_title or "膳食" in sec_title:
                    category = "food"
                elif "运动" in sec_title:
                    category = "exercise"

                clean_content = sec_content.strip()
                if len(clean_content) > 2000:
                    clean_content = clean_content[:2000] + "..."

                TimelineEvent.objects.create(
                    stage_type="baby_age_day",
                    stage_value=0,
                    category=category,
                    title=f"产妇保健：{sec_title}",
                    subtitle="产后护理",
                    content=clean_content,
                    tips="",
                    is_essential=False,
                    sort_order=sort_order,
                )
                sort_order += 1
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f"成功导入 {created_count} 条记录"))

    def _split_sections(self, content):
        """将内容按已知节标题分段"""
        # 已知的节标题模式
        SECTION_PATTERNS = [
            "成长与发育进程",
            "孩子的常见疾病",
            "喂养的常识与方法",
            "环境与异常情况",
            "产后饮食营养",
            "产后运动",
            "产后保养须知",
            "产褥期有哪些注意事项",
            "产后做好卫生保健",
            "剖宫产妈妈的注意事项",
            "产妇的膳食原则",
            "产后每日膳食营养素供给量",
            "坐月子吃得越多越好吗",
            "剖宫产新妈妈饮食要注意",
            "月子中的饮食禁忌",
            "注意催乳饮食",
            "产后运动的注意事项",
            "产褥保健体操这样做",
            "剖宫产妈妈的运动",
        ]

        lines = content.split("\n")
        sections = []
        current_title = None
        current_content = []

        for line in lines:
            stripped = line.strip()
            # 检查是否是节标题
            is_section = False
            for pattern in SECTION_PATTERNS:
                if stripped == pattern or stripped.startswith(pattern):
                    # 保存前一个节
                    if current_title and current_content:
                        sections.append((current_title, "\n".join(current_content)))
                    current_title = stripped
                    current_content = []
                    is_section = True
                    break

            if not is_section and current_title:
                current_content.append(line)

        # 保存最后一个节
        if current_title and current_content:
            sections.append((current_title, "\n".join(current_content)))

        return sections
