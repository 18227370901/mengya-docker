"""导入幼儿十万个为什么：人体的奥秘 57个问题到 KidsEncyclopedia 模型"""
import os
import re

from django.core.management.base import BaseCommand
from apps.core.models import KidsEncyclopedia


class Command(BaseCommand):
    help = "从Markdown文件导入幼儿百科问答数据"

    CHAPTER_MAP = {
        "第1章 我从哪里来": "origin",
        "第2章 我的身体": "body",
        "第3章 我的成长": "growth",
        "第4章 身体的奥秘": "mystery",
    }

    def add_arguments(self, parser):
        parser.add_argument("--file", type=str, default="", help="Markdown文件路径")
        parser.add_argument("--clear", action="store_true", help="导入前清空旧数据")

    def handle(self, *args, **options):
        # 默认文件路径
        workspace = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
        file_path = options.get("file") or os.path.join(
            workspace, "..", "..",
            ".temp", "kids_100k_human_body.md"
        )
        file_path = os.path.normpath(file_path)

        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f"文件不存在: {file_path}"))
            return

        if options.get("clear"):
            count = KidsEncyclopedia.objects.count()
            KidsEncyclopedia.objects.all().delete()
            self.stdout.write(f"已清空 {count} 条旧数据")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 按章节分割
        chapter_pattern = r"^## (第\d+章 [^\n]+)"
        sections = re.split(chapter_pattern, content, flags=re.MULTILINE)

        created_count = 0
        sort_order = 0

        # sections: [before_ch1, ch1_title, ch1_content, ch2_title, ch2_content, ...]
        for i in range(1, len(sections), 2):
            ch_title = sections[i].strip()
            ch_content = sections[i + 1] if i + 1 < len(sections) else ""

            chapter_key = self.CHAPTER_MAP.get(ch_title)
            if not chapter_key:
                self.stdout.write(self.style.WARNING(f"未识别章节: {ch_title}"))
                continue

            # 按问题分割
            question_pattern = r"^### 问题(\d+)：(.+)"
            questions = re.split(question_pattern, ch_content, flags=re.MULTILINE)

            # questions: [before_q1, q1_num, q1_title, q1_content, q2_num, q2_title, q2_content, ...]
            for j in range(1, len(questions), 3):
                q_num_str = questions[j].strip()
                q_title = questions[j + 1].strip()
                q_content = questions[j + 2] if j + 2 < len(questions) else ""

                q_num = int(q_num_str)

                # 提取选项
                option_a = ""
                option_b = ""
                option_c = ""
                opt_match = re.search(r"\*\*选项：\*\*\s*\n(A[^\n]+)\n(B[^\n]+)\n(C[^\n]+)?", q_content)
                if opt_match:
                    option_a = opt_match.group(1).strip()[2:] if len(opt_match.group(1)) > 2 else opt_match.group(1).strip()
                    option_b = opt_match.group(2).strip()[2:] if len(opt_match.group(2)) > 2 else opt_match.group(2).strip()
                    if opt_match.group(3):
                        option_c = opt_match.group(3).strip()[2:] if len(opt_match.group(3)) > 2 else opt_match.group(3).strip()

                # 提取解答正文
                answer_match = re.search(r"\*\*解答正文：\*\*\s*\n((?:[^#\n][^\n]*\n?)+)", q_content)
                answer = answer_match.group(1).strip() if answer_match else ""
                # 去掉"原来是这样"这样的行首
                answer = re.sub(r"^原来是这样\s*\n", "", answer).strip()

                # 提取漫画对话
                dialogue = ""
                dialogue_match = re.search(r"\*\*漫画对话气泡文字：\*\*\s*\n((?:[-*][^\n]+\n?)+)", q_content)
                if dialogue_match:
                    lines = dialogue_match.group(1).strip().split("\n")
                    dialogue = "\n".join(l.lstrip("-* ").strip() for l in lines)

                # 如果没有漫画对话，试试漫画标注文字
                if not dialogue:
                    label_match = re.search(r"\*\*漫画标注文字：\*\*\s*\n([^\n]+)", q_content)
                    if label_match:
                        dialogue = label_match.group(1).strip()

                KidsEncyclopedia.objects.create(
                    chapter=chapter_key,
                    question_number=q_num,
                    question=q_title,
                    option_a=option_a,
                    option_b=option_b,
                    option_c=option_c,
                    answer=answer,
                    comic_dialogue=dialogue,
                    sort_order=sort_order,
                )
                created_count += 1
                sort_order += 1

        self.stdout.write(self.style.SUCCESS(f"成功导入 {created_count} 条幼儿百科问答"))
