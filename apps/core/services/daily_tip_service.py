from apps.core.models import DailyTip, SystemSetting

BUILTIN_TIPS = [
    # newborn (新生儿期 0-28天)
    {
        "stage_type": "newborn",
        "title": "黑白追焦与抚触交流",
        "content": "新生儿视力焦点约在20~25厘米。每天进行2~3分钟黑白卡追焦互动与腹部顺时针轻柔抚触，能有效激发大脑感知并排气舒缓。",
        "tag": "新生儿 · 感知与大动作",
        "sort_order": 1,
    },
    {
        "stage_type": "newborn",
        "title": "竖抱拍嗝防溢奶",
        "content": "每次喂哺后将宝宝竖抱靠于肩头，空心掌自下而上轻拍后背10~15分钟，待排出嗝气后再放下，可大幅减少呛奶与溢奶。",
        "tag": "新生儿 · 喂养与拍嗝",
        "sort_order": 2,
    },
    {
        "stage_type": "newborn",
        "title": "脐带残端干燥护理",
        "content": "脐带脱落前后保持干燥透气，洗澡后用消毒棉签吸干水分。穿纸尿裤时将腰部前沿稍作折叠，避开脐部创面摩擦。",
        "tag": "新生儿 · 日常护理",
        "sort_order": 3,
    },
    {
        "stage_type": "newborn",
        "title": "俯卧抬头练习",
        "content": "清醒且大人看护下，每天安排1~2次俯卧抬头练习，每次1~2分钟，有助于锻炼颈背肌群支撑力，预防偏头扁头。",
        "tag": "新生儿 · 发育锻炼",
        "sort_order": 4,
    },
    # infant (婴儿期 1-12个月)
    {
        "stage_type": "infant",
        "title": "手眼协调与翻身探索",
        "content": "宝宝3~4个月开始探索翻身与双手抓握。可准备彩色摇铃、抓握球与布书，引导左右侧身与视听跟随。",
        "tag": "婴儿期 · 动作发育",
        "sort_order": 10,
    },
    {
        "stage_type": "infant",
        "title": "满6月龄辅食黄金期",
        "content": "辅食添加遵循“由单一到多样、由细到粗、循序渐进”原则。首选富铁强化婴儿米粉，每次引入新食材观察2~3天排便反应。",
        "tag": "婴儿期 · 科学辅食",
        "sort_order": 11,
    },
    {
        "stage_type": "infant",
        "title": "萌芽出牙期口腔呵护",
        "content": "宝宝长乳牙常伴随流口水、爱咬硬物。可用干净冷藏牙胶或湿润纱布轻柔擦拭牙龈，既能缓解发痒也能保护乳牙萌出。",
        "tag": "婴儿期 · 出牙护理",
        "sort_order": 12,
    },
    {
        "stage_type": "infant",
        "title": "爬行是平衡与认知基石",
        "content": "7~9个月鼓励充分在地垫上自由爬行，爬行能有效刺激左右脑协调、前庭平衡发育，并锻炼双臂与核心支撑力。",
        "tag": "婴儿期 · 探索成长",
        "sort_order": 13,
    },
    # toddler (幼儿期 1岁以上)
    {
        "stage_type": "toddler",
        "title": "语言爆发期的亲子对话",
        "content": "1岁以后宝宝进入词汇飞跃期，多用丰富具象的语言进行情境互动，耐心倾听并鼓励宝宝用动作或词语表达内心需求。",
        "tag": "幼儿期 · 语言启蒙",
        "sort_order": 20,
    },
    {
        "stage_type": "toddler",
        "title": "自主进食与精细动作",
        "content": "允许宝宝用手抓或练习握勺，不怕弄脏餐桌。自主进食能极大增强自主意识、专注力以及手指精细动作熟练度。",
        "tag": "幼儿期 · 习惯养成",
        "sort_order": 21,
    },
    {
        "stage_type": "toddler",
        "title": "户外活动与视力阳光守护",
        "content": "每天保证1~2小时户外活动时间，自然光照射不仅促进体内维生素D自然合成与骨骼成长，也是预防近视的天然屏障。",
        "tag": "幼儿期 · 健康体魄",
        "sort_order": 22,
    },
    # pregnancy (孕期)
    {
        "stage_type": "pregnancy",
        "title": "温柔胎教与亲子连结",
        "content": "胎儿此时对外界轻柔温和的声音和光线已有灵敏感知，准爸妈每晚固定时间讲故事、轻唱儿歌，建立温暖的初始安全感。",
        "tag": "孕期 · 胎教互动",
        "sort_order": 30,
    },
    {
        "stage_type": "pregnancy",
        "title": "左侧卧位与安稳睡眠",
        "content": "孕中晚期建议尽量保持舒适的左侧卧睡姿，配合U型孕妇枕支撑腰腹与双腿，可有效减轻腹主动脉压迫并改善子宫胎盘血供。",
        "tag": "孕期 · 舒适休养",
        "sort_order": 31,
    },
    {
        "stage_type": "pregnancy",
        "title": "数胎动——守护宝宝安危的晴雨表",
        "content": "孕28周后建议每日早中晚在固定安静时间各数1小时胎动，胎动是宝宝传递健康信号的最佳方式，节奏平稳即代表安好。",
        "tag": "孕期 · 科学监护",
        "sort_order": 32,
    },
    {
        "stage_type": "pregnancy",
        "title": "清淡少食多餐与适度散步",
        "content": "保持均衡膳食，优质蛋白质与膳食纤维搭配，饭后半小时适度慢步走，既能舒缓下肢轻度浮肿，也为顺利分娩积蓄力量。",
        "tag": "孕期 · 营养活力",
        "sort_order": 33,
    },
    # general (通用/备孕)
    {
        "stage_type": "general",
        "title": "萌芽陪伴 · 每一步都算数",
        "content": "从第一次胎动到第一次背书包，萌芽陪伴您每一个温暖瞬间。点击左侧标签可随时设置或同步宝宝的真实月龄。",
        "tag": "科学育儿 · 全程相伴",
        "sort_order": 40,
    },
    {
        "stage_type": "general",
        "title": "规律作息与家庭关怀",
        "content": "育儿是一场温暖的家庭接力。科学的分工与理解、充足的睡眠，是守护新手爸妈好心情与宝宝健康生长的基石。",
        "tag": "萌芽锦囊 · 舒心生活",
        "sort_order": 41,
    },
]


class DailyTipService:
    @staticmethod
    def seed_builtin_tips(force_reset=False):
        """初始化或补充系统内置提示信息"""
        created_count = 0
        updated_count = 0
        for item in BUILTIN_TIPS:
            tip = DailyTip.objects.filter(
                stage_type=item["stage_type"],
                title=item["title"],
            ).first()

            if not tip:
                DailyTip.objects.create(
                    stage_type=item["stage_type"],
                    title=item["title"],
                    content=item["content"],
                    tag=item["tag"],
                    sort_order=item["sort_order"],
                    is_active=True,
                    is_builtin=True,
                )
                created_count += 1
            elif force_reset:
                tip.content = item["content"]
                tip.tag = item["tag"]
                tip.sort_order = item["sort_order"]
                tip.is_builtin = True
                tip.is_active = True
                tip.save()
                updated_count += 1

        return created_count, updated_count

    @staticmethod
    def get_tips_for_stage(stage_type="newborn"):
        """前台获取指定阶段启用的提示信息列表，受 display_count 限制"""
        if DailyTip.objects.count() == 0:
            DailyTipService.seed_builtin_tips()

        qs = DailyTip.objects.filter(stage_type=stage_type, is_active=True).order_by("sort_order", "id")
        if not qs.exists() and stage_type != "general":
            # 降级到通用
            qs = DailyTip.objects.filter(stage_type="general", is_active=True).order_by("sort_order", "id")

        settings = SystemSetting.get_settings()
        limit = settings.daily_tip_display_count

        if limit > 0:
            qs = qs[:limit]

        return [
            {
                "id": t.id,
                "title": t.title,
                "tip": t.content,
                "tag": t.tag,
                "stage_type": t.stage_type,
            }
            for t in qs
        ], limit
