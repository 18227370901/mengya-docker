from django.db import models


class KidsEncyclopedia(models.Model):
    """幼儿百科问答"""

    CHAPTER_CHOICES = [
        ("origin", "我从哪里来"),
        ("body", "我的身体"),
        ("growth", "我的成长"),
        ("mystery", "身体的奥秘"),
    ]

    chapter = models.CharField(max_length=20, choices=CHAPTER_CHOICES, verbose_name="章节")
    question_number = models.IntegerField(verbose_name="问题编号")
    question = models.CharField(max_length=300, verbose_name="问题")
    option_a = models.CharField(max_length=300, verbose_name="选项A")
    option_b = models.CharField(max_length=300, verbose_name="选项B")
    option_c = models.CharField(max_length=300, blank=True, default="", verbose_name="选项C")
    answer = models.TextField(verbose_name="解答正文")
    comic_dialogue = models.TextField(blank=True, default="", verbose_name="漫画对话")
    cover_image = models.URLField(blank=True, null=True, verbose_name="配图URL")
    sort_order = models.IntegerField(default=0, verbose_name="排序权重")
    view_count = models.IntegerField(default=0, verbose_name="浏览次数")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        indexes = [
            models.Index(fields=["chapter"]),
            models.Index(fields=["question_number"]),
        ]
        ordering = ["chapter", "sort_order"]

    def __str__(self):
        return f"[{self.get_chapter_display()}] Q{self.question_number}: {self.question}"
