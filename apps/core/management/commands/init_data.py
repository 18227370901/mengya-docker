"""初始化数据命令：填充品牌、商品、时间轴、系统管理员

用法：
  python manage.py init_data            # 全量初始化
  python manage.py init_data --skip-if-exists   # 已有数据则跳过
"""
import random
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.core.models import (
    BabyProfile,
    BrandProfile,
    Product,
    ShoppingList,
    ShoppingListItem,
    TimelineEvent,
)

User = get_user_model()


class Command(BaseCommand):
    help = "初始化萌芽平台种子数据"

    def add_arguments(self, parser):
        parser.add_argument("--skip-if-exists", action="store_true", help="已有数据时跳过")

    def handle(self, *args, **options):
        if options["skip_if_exists"] and (Product.objects.exists() or BrandProfile.objects.exists()):
            self.stdout.write(self.style.WARNING("检测到已有数据，跳过初始化"))
            return

        self.create_brands()
        self.create_products()
        self.create_timeline()
        self.create_demo_user()
        self.stdout.write(self.style.SUCCESS("✅ 数据初始化完成"))

    # ---------- 品牌 ----------
    def create_brands(self):
        brands = [
            {"name": "丸丫", "name_en": "Wanya", "positioning": "mid_high", "positioning_desc": "中高端，增长迅猛", "market_rank": "推车第1名", "market_share": "14.0%", "brand_story": "丸丫凭借高性价比与过硬质量快速崛起，2025年电商销售额位居儿童推车第一。"},
            {"name": "DearMom", "name_en": "DearMom", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "推车第2名", "market_share": "-", "brand_story": "DearMom 专注高景观婴儿推车。"},
            {"name": "elittle", "name_en": "elittle", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "推车第3名", "market_share": "-", "brand_story": "elittle 主打轻便可折叠婴儿推车。"},
            {"name": "BeBeBus", "name_en": "BeBeBus", "positioning": "premium", "positioning_desc": "高端", "market_rank": "推车第4名", "market_share": "-", "brand_story": "BeBeBus 定位高端母婴，产品设计前卫，安全座椅与推车均获市场认可。"},
            {"name": "好孩子", "name_en": "GoodBaby", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "推车第5名", "market_share": "-", "brand_story": "好孩子集团是全球领先的母婴用品制造商。"},
            {"name": "虎贝尔", "name_en": "Huber", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "安全座椅第2名", "market_share": "-", "brand_story": "虎贝尔 E360pro 系列热销。"},
            {"name": "RECARO", "name_en": "RECARO", "positioning": "premium", "positioning_desc": "高端", "market_rank": "安全座椅第13名", "market_share": "-", "brand_story": "源自德国的 RECARO，以赛车座椅起家，安全座椅技术标杆。"},
            {"name": "贝亲", "name_en": "Pigeon", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "贝亲是日本知名母婴用品品牌，奶瓶奶嘴广受信赖。"},
            {"name": "Hegen", "name_en": "Hegen", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "Hegen 以创新宽口奶瓶闻名，颜值与功能性兼备。"},
            {"name": "NUK", "name_en": "NUK", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "德国 NUK 专注口腔健康，奶嘴设计贴合生理需求。"},
            {"name": "babycare", "name_en": "babycare", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "babycare 全品类母婴品牌，颜值与品质兼顾。"},
            {"name": "花王", "name_en": "Kao", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "花王纸尿裤以吸收性、透气性著称。"},
            {"name": "帮宝适", "name_en": "Pampers", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "宝洁旗下帮宝适，全球知名纸尿裤品牌。"},
            {"name": "好奇", "name_en": "Huggies", "positioning": "mid", "positioning_desc": "中端", "market_rank": "-", "market_share": "-", "brand_story": "金佰利旗下好奇，性价比之选。"},
            {"name": "全棉时代", "name_en": "PurCotton", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "全棉时代专注全棉产品，棉柔巾、浴巾品质优良。"},
            {"name": "英氏", "name_en": "YeehoO", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "英氏专注婴儿高端服饰。"},
            {"name": "十月结晶", "name_en": "October Crystal", "positioning": "value", "positioning_desc": "性价比", "market_rank": "-", "market_share": "-", "brand_story": "十月结晶专注产妇用品，性价比高。"},
            {"name": "子初", "name_en": "Zichu", "positioning": "value", "positioning_desc": "性价比", "market_rank": "-", "market_share": "-", "brand_story": "子初专注孕产护理用品。"},
            {"name": "美德乐", "name_en": "Medela", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "瑞士美德乐，吸奶器领域标杆。"},
            {"name": "小白熊", "name_en": "Little White Bear", "positioning": "value", "positioning_desc": "性价比", "market_rank": "-", "market_share": "-", "brand_story": "小白熊专注母婴小电器，性价比高。"},
            {"name": "飞鹤", "name_en": "Feihe", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "飞鹤，中国婴幼儿奶粉头部品牌。"},
            {"name": "伊利", "name_en": "Yili", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "伊利，中国乳业龙头。"},
            {"name": "爱他美", "name_en": "Aptamil", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "达能旗下爱他美，欧洲奶粉代表。"},
            {"name": "君乐宝", "name_en": "Junlebao", "positioning": "value", "positioning_desc": "性价比", "market_rank": "-", "market_share": "-", "brand_story": "君乐宝，国产奶粉性价比之选。"},
            {"name": "小皮", "name_en": "Little Freddie", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "小皮专注有机辅食。"},
            {"name": "嘉宝", "name_en": "Gerber", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "嘉宝是雀巢旗下辅食品牌。"},
            {"name": "亨氏", "name_en": "Heinz", "positioning": "mid", "positioning_desc": "中端", "market_rank": "-", "market_share": "-", "brand_story": "亨氏专注婴幼儿辅食百年品牌。"},
            {"name": "嫚熙", "name_en": "EMXEE", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "嫚熙专注孕期服饰。"},
            {"name": "爱乐维", "name_en": "Elevit", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "爱乐维，孕产妇复合维生素标杆。"},
            {"name": "斯利安", "name_en": "Silian", "positioning": "value", "positioning_desc": "性价比", "market_rank": "-", "market_share": "-", "brand_story": "斯利安专注叶酸补充。"},
            {"name": "润本", "name_en": "Runben", "positioning": "value", "positioning_desc": "性价比", "market_rank": "-", "market_share": "-", "brand_story": "润本专注儿童洗护。"},
            {"name": "红色小象", "name_en": "Little Elephant", "positioning": "mid", "positioning_desc": "中端", "market_rank": "-", "market_share": "-", "brand_story": "红色小象，国货儿童护肤品牌。"},
            {"name": "妙思乐", "name_en": "Mustela", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "法国妙思乐专注母婴护肤。"},
            {"name": "维蕾德", "name_en": "Weleda", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "维蕾德是德国天然护肤品牌。"},
            {"name": "欧姆龙", "name_en": "Omron", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "欧姆龙医疗电子品牌。"},
            {"name": "费雪", "name_en": "Fisher-Price", "positioning": "mid", "positioning_desc": "中端", "market_rank": "-", "market_share": "-", "brand_story": "费雪是全球玩具品牌。"},
            {"name": "伟易达", "name_en": "VTech", "positioning": "mid", "positioning_desc": "中端", "market_rank": "-", "market_share": "-", "brand_story": "伟易达专注电子益智玩具。"},
            {"name": "乐高", "name_en": "LEGO", "positioning": "premium", "positioning_desc": "高端", "market_rank": "-", "market_share": "-", "brand_story": "乐高积木全球知名。"},
            {"name": "宜家", "name_en": "IKEA", "positioning": "mid", "positioning_desc": "中端", "market_rank": "-", "market_share": "-", "brand_story": "宜家儿童家具简洁实用。"},
            {"name": "Pouch", "name_en": "Pouch", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "Pouch 专注儿童餐椅。"},
            {"name": "博朗", "name_en": "Braun", "positioning": "mid_high", "positioning_desc": "中高端", "market_rank": "-", "market_share": "-", "brand_story": "博朗耳温枪广受家庭信赖。"},
        ]
        for b in brands:
            BrandProfile.objects.update_or_create(name=b["name"], defaults=b)
        self.stdout.write(f"  ✅ 品牌 {len(brands)} 个")

    # ===== 商品 =====
    def create_products(self):
        brands = {b.name: b for b in BrandProfile.objects.all()}
        products = [
            # ---- 食品类 ----
            {"name": "飞鹤星飞帆 一段婴幼儿配方奶粉", "brand": "飞鹤", "second_category": "奶粉", "third_category": "一段", "price": 328, "ratings": {"safety": 9.0, "comfort": 8.5, "functionality": 9.0, "usability": 8.8, "appearance": 8.5}, "overall": 8.8, "specifications": {"规格": "900g", "适用月龄": "0-6月"}, "purchase_guide": "注意看罐底生产日期，认准国食注字。"},
            {"name": "爱他美卓萃 1段奶粉", "brand": "爱他美", "second_category": "奶粉", "third_category": "一段", "price": 458, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 9.2, "usability": 8.6, "appearance": 8.8}, "overall": 8.9, "specifications": {"规格": "800g", "适用月龄": "0-6月"}, "purchase_guide": "关注是否正品，注意防伪标识。"},
            {"name": "君乐宝乐纯 1段奶粉", "brand": "君乐宝", "second_category": "奶粉", "third_category": "一段", "price": 218, "ratings": {"safety": 8.8, "comfort": 8.2, "functionality": 8.6, "usability": 8.5, "appearance": 8.0}, "overall": 8.4, "specifications": {"规格": "800g", "适用月龄": "0-6月"}, "purchase_guide": "性价比之选，注意转奶过渡。"},
            {"name": "伊利金领冠 2段奶粉", "brand": "伊利", "second_category": "奶粉", "third_category": "二段", "price": 268, "ratings": {"safety": 8.9, "comfort": 8.4, "functionality": 8.8, "usability": 8.6, "appearance": 8.2}, "overall": 8.6, "specifications": {"规格": "800g", "适用月龄": "6-12月"}, "purchase_guide": "国产大品牌，渠道正规。"},
            {"name": "小皮 高铁米粉 原味", "brand": "小皮", "second_category": "辅食", "third_category": "米粉", "price": 89, "ratings": {"safety": 9.2, "comfort": 8.8, "functionality": 9.0, "usability": 9.0, "appearance": 8.8}, "overall": 9.0, "specifications": {"规格": "160g*2", "适用月龄": "6月+"}, "purchase_guide": "辅食首选，含铁量高，建议按说明冲泡。"},
            {"name": "嘉宝 燕麦米粉", "brand": "嘉宝", "second_category": "辅食", "third_category": "米粉", "price": 79, "ratings": {"safety": 8.8, "comfort": 8.5, "functionality": 8.8, "usability": 8.8, "appearance": 8.2}, "overall": 8.6, "specifications": {"规格": "227g", "适用月龄": "6月+"}, "purchase_guide": "含燕麦蛋白，注意过敏原。"},
            {"name": "亨氏 鸡肉蔬菜泥", "brand": "亨氏", "second_category": "辅食", "third_category": "果泥", "price": 15, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.2, "usability": 8.8, "appearance": 8.0}, "overall": 8.4, "specifications": {"规格": "120g", "适用月龄": "6月+"}, "purchase_guide": "袋装泥，方便外出携带。"},
            {"name": "维生素D3滴剂", "brand": "纽曼思", "second_category": "营养品", "third_category": "维生素D", "price": 128, "ratings": {"safety": 9.0, "comfort": 8.6, "functionality": 9.0, "usability": 8.8, "appearance": 8.2}, "overall": 8.8, "specifications": {"规格": "10ml", "适用": "新生儿+"}, "purchase_guide": "出生后2周起每日400IU，遵医嘱。"},
            {"name": "DHA藻油", "brand": "纽曼思", "second_category": "营养品", "third_category": "DHA", "price": 258, "ratings": {"safety": 8.8, "comfort": 8.4, "functionality": 8.8, "usability": 8.5, "appearance": 8.2}, "overall": 8.5, "specifications": {"规格": "60粒", "适用": "孕期/婴幼儿"}, "purchase_guide": "选择藻油来源更安全。"},
            # ---- 食具类 ----
            {"name": "贝亲 PPSU宽口径奶瓶 240ml", "brand": "贝亲", "second_category": "奶瓶", "third_category": "PPSU", "price": 129, "ratings": {"safety": 9.2, "comfort": 8.8, "functionality": 9.0, "usability": 9.0, "appearance": 8.8}, "overall": 9.0, "specifications": {"材质": "PPSU", "容量": "240ml", "奶嘴": "M号"}, "purchase_guide": "宽口好冲奶，PPSU轻便耐摔。"},
            {"name": "Hegen 奶瓶 150ml", "brand": "Hegen", "second_category": "奶瓶", "third_category": "PPSU", "price": 238, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 8.8, "usability": 8.9, "appearance": 9.5}, "overall": 9.1, "specifications": {"材质": "PPSU", "容量": "150ml"}, "purchase_guide": "颜值高、防胀气，注意卡扣对位。"},
            {"name": "NUK 玻璃奶瓶 240ml", "brand": "NUK", "second_category": "奶瓶", "third_category": "玻璃", "price": 119, "ratings": {"safety": 9.0, "comfort": 8.5, "functionality": 8.6, "usability": 8.5, "appearance": 8.3}, "overall": 8.7, "specifications": {"材质": "玻璃", "容量": "240ml", "奶嘴": "M号"}, "purchase_guide": "玻璃更安全，但重，建议家长手持。"},
            {"name": "贝亲 奶嘴 M号 2个装", "brand": "贝亲", "second_category": "奶嘴", "price": 39, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 8.8, "usability": 8.8, "appearance": 8.2}, "overall": 8.7, "specifications": {"型号": "M号", "材质": "硅胶"}, "purchase_guide": "建议按月龄更换。"},
            {"name": "满趣健 吸盘碗", "brand": "满趣健", "second_category": "餐具", "third_category": "碗", "price": 49, "ratings": {"safety": 8.8, "comfort": 8.5, "functionality": 8.8, "usability": 8.8, "appearance": 8.5}, "overall": 8.7, "specifications": {"材质": "食品级硅胶", "适用": "6月+"}, "purchase_guide": "吸盘底座防打翻。"},
            {"name": "b.box 吸管杯", "brand": "b.box", "second_category": "餐具", "third_category": "学饮杯", "price": 99, "ratings": {"safety": 8.9, "comfort": 8.6, "functionality": 8.9, "usability": 8.8, "appearance": 8.6}, "overall": 8.8, "specifications": {"材质": "PP", "容量": "240ml"}, "purchase_guide": "防漏设计，帮助宝宝学喝水。"},
            # ---- 服装及布类 ----
            {"name": "英氏 新生儿和尚服 52码", "brand": "英氏", "second_category": "内衣", "third_category": "和尚服", "price": 139, "ratings": {"safety": 9.2, "comfort": 9.0, "functionality": 8.8, "usability": 8.9, "appearance": 8.8}, "overall": 9.0, "specifications": {"面料": "A类纯棉", "尺码": "52"}, "purchase_guide": "新生儿选A类纯棉，系带设计方便穿脱。"},
            {"name": "巴拉巴拉 儿童连体衣", "brand": "巴拉巴拉", "second_category": "外衣", "third_category": "连体衣", "price": 89, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.5, "usability": 8.8, "appearance": 8.6}, "overall": 8.7, "specifications": {"面料": "棉", "尺码": "66码"}, "purchase_guide": "选择按扣连体衣方便换尿布。"},
            {"name": "全棉时代 纱布包被", "brand": "全棉时代", "second_category": "包被", "third_category": "薄款", "price": 99, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 8.6, "usability": 8.8, "appearance": 8.4}, "overall": 8.7, "specifications": {"材质": "纯棉纱布", "尺寸": "100*100"}, "purchase_guide": "夏季用薄款，冬季加厚。"},
            {"name": "全棉时代 纱布口水巾 5条装", "brand": "全棉时代", "second_category": "围兜", "price": 29, "ratings": {"safety": 8.8, "comfort": 8.8, "functionality": 8.4, "usability": 8.8, "appearance": 8.0}, "overall": 8.5, "specifications": {"材质": "纱布", "数量": "5条"}, "purchase_guide": "纱布材质吸水好，勤换。"},
            # ---- 尿裤类 ----
            {"name": "花王 妙而舒 NB码 纸尿裤", "brand": "花王", "second_category": "纸尿裤", "third_category": "NB", "price": 79, "ratings": {"safety": 9.2, "comfort": 9.0, "functionality": 9.2, "usability": 9.0, "appearance": 8.8}, "overall": 9.1, "specifications": {"尺码": "NB", "片数": "90片"}, "purchase_guide": "新生宝宝推荐NB，透气性好。"},
            {"name": "帮宝适 一级帮 NB", "brand": "帮宝适", "second_category": "纸尿裤", "third_category": "NB", "price": 89, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 9.0, "usability": 8.9, "appearance": 8.6}, "overall": 8.9, "specifications": {"尺码": "NB", "片数": "84片"}, "purchase_guide": "超薄透气，适合新生宝宝。"},
            {"name": "好奇 金装 纸尿裤 S码", "brand": "好奇", "second_category": "纸尿裤", "third_category": "S", "price": 69, "ratings": {"safety": 8.8, "comfort": 8.5, "functionality": 8.8, "usability": 8.7, "appearance": 8.2}, "overall": 8.6, "specifications": {"尺码": "S", "片数": "108片"}, "purchase_guide": "性价比高，注意过敏情况。"},
            {"name": "十月结晶 一次性隔尿垫 20片", "brand": "十月结晶", "second_category": "隔尿垫", "price": 19, "ratings": {"safety": 8.5, "comfort": 8.2, "functionality": 8.4, "usability": 8.8, "appearance": 7.8}, "overall": 8.3, "specifications": {"材质": "无纺布", "数量": "20片"}, "purchase_guide": "一次性使用卫生便捷。"},
            # ---- 寝具家具类 ----
            {"name": "好孩子 实木婴儿床", "brand": "好孩子", "second_category": "婴儿床", "price": 899, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 8.8, "usability": 8.6, "appearance": 8.5}, "overall": 8.8, "specifications": {"材质": "实木", "尺寸": "120*65cm"}, "purchase_guide": "选择圆角设计，床栏间距适中。"},
            {"name": "英氏 婴儿床垫", "brand": "英氏", "second_category": "床品", "price": 299, "ratings": {"safety": 8.8, "comfort": 8.8, "functionality": 8.4, "usability": 8.5, "appearance": 8.2}, "overall": 8.5, "specifications": {"材质": "椰棕+乳胶", "尺寸": "120*60"}, "purchase_guide": "软硬适中，护脊柱。"},
            {"name": "全棉时代 空调被", "brand": "全棉时代", "second_category": "床品", "price": 199, "ratings": {"safety": 8.8, "comfort": 8.8, "functionality": 8.4, "usability": 8.5, "appearance": 8.4}, "overall": 8.6, "specifications": {"材质": "纯棉", "适用": "夏季"}, "purchase_guide": "空调房使用，注意厚度。"},
            # ---- 家具类（推车/餐椅/学步车）----
            {"name": "丸丫 Y2 婴儿推车 高景观", "brand": "丸丫", "second_category": "推车", "price": 1980, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 9.0, "usability": 8.8, "appearance": 9.0}, "overall": 8.9, "specifications": {"类型": "高景观", "适用": "0-36月"}, "purchase_guide": "减震好，高景观适合新生儿，但体积大。"},
            {"name": "好孩子 轻便伞车", "brand": "好孩子", "second_category": "推车", "price": 699, "ratings": {"safety": 8.8, "comfort": 8.4, "functionality": 8.5, "usability": 8.8, "appearance": 8.0}, "overall": 8.5, "specifications": {"类型": "伞车", "适用": "6月+"}, "purchase_guide": "轻便收车，出行方便。"},
            {"name": "BeBeBus 高景观推车 6T", "brand": "BeBeBus", "second_category": "推车", "price": 3299, "ratings": {"safety": 9.4, "comfort": 9.2, "functionality": 9.2, "usability": 9.0, "appearance": 9.5}, "overall": 9.3, "specifications": {"类型": "高端高景观", "适用": "0-3岁"}, "purchase_guide": "高端之选，全路况减震。"},
            {"name": "宜家 ANTILOP 餐椅", "brand": "宜家", "second_category": "餐椅", "price": 99, "ratings": {"safety": 8.6, "comfort": 8.2, "functionality": 8.4, "usability": 8.6, "appearance": 8.2}, "overall": 8.4, "specifications": {"材质": "塑料+金属", "适用": "6月+"}, "purchase_guide": "结构简单，性价比高。"},
            {"name": "Pouch K05 多功能餐椅", "brand": "Pouch", "second_category": "餐椅", "price": 599, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.9, "usability": 8.6, "appearance": 8.4}, "overall": 8.7, "specifications": {"功能": "可躺可坐", "适用": "6月+"}, "purchase_guide": "多档调节，舒适性佳。"},
            # ---- 洗护日用品类 ----
            {"name": "润本 婴儿沐浴露 500ml", "brand": "润本", "second_category": "洗浴", "price": 39, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.4, "usability": 8.8, "appearance": 8.0}, "overall": 8.4, "specifications": {"容量": "500ml", "适用": "新生儿+"}, "purchase_guide": "温和无刺激配方。"},
            {"name": "红色小象 婴儿洗发沐浴露", "brand": "红色小象", "second_category": "洗浴", "price": 59, "ratings": {"safety": 8.5, "comfort": 8.4, "functionality": 8.5, "usability": 8.6, "appearance": 8.2}, "overall": 8.4, "specifications": {"容量": "350ml"}, "purchase_guide": "二合一，方便。"},
            {"name": "妙思乐 婴儿润肤霜", "brand": "妙思乐", "second_category": "护肤", "price": 119, "ratings": {"safety": 8.9, "comfort": 8.8, "functionality": 8.6, "usability": 8.6, "appearance": 8.4}, "overall": 8.7, "specifications": {"容量": "200ml"}, "purchase_guide": "保湿效果好，敏感肌适用。"},
            {"name": "维蕾德 金盏花护臀膏", "brand": "维蕾德", "second_category": "护肤", "price": 69, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.6, "usability": 8.5, "appearance": 8.2}, "overall": 8.5, "specifications": {"容量": "75ml"}, "purchase_guide": "含金盏花提取物，舒缓红屁屁。"},
            {"name": "全棉时代 棉柔巾 100抽", "brand": "全棉时代", "second_category": "清洁", "price": 29, "ratings": {"safety": 9.0, "comfort": 8.8, "functionality": 8.6, "usability": 8.8, "appearance": 8.0}, "overall": 8.7, "specifications": {"材质": "全棉", "数量": "100抽"}, "purchase_guide": "干湿两用。"},
            {"name": "babycare 手口湿巾 80抽", "brand": "babycare", "second_category": "清洁", "price": 19, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.4, "usability": 8.8, "appearance": 8.0}, "overall": 8.5, "specifications": {"无添加": "酒精香精"}, "purchase_guide": "无酒精无香精。"},
            # ---- 护理工具类 ----
            {"name": "博朗 IRT6520 耳温枪", "brand": "博朗", "second_category": "检测", "price": 299, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.8, "usability": 8.6, "appearance": 8.2}, "overall": 8.6, "specifications": {"品牌": "博朗", "类型": "耳温枪"}, "purchase_guide": "测温快，测耳道温度更准确。"},
            {"name": "欧姆龙 电子体温计", "brand": "欧姆龙", "second_category": "检测", "price": 59, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.4, "usability": 8.6, "appearance": 8.0}, "overall": 8.4, "specifications": {"类型": "腋下电子"}, "purchase_guide": "操作简单，适合家庭常备。"},
            {"name": "贝亲 婴儿指甲剪", "brand": "贝亲", "second_category": "护理", "price": 39, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.6, "usability": 8.8, "appearance": 8.2}, "overall": 8.6, "specifications": {"材质": "不锈钢"}, "purchase_guide": "圆头设计，防误伤。"},
            # ---- 出行类 ----
            {"name": "BeBeBus 儿童安全座椅 0-4岁", "brand": "BeBeBus", "second_category": "安全座椅", "price": 3299, "ratings": {"safety": 9.5, "comfort": 9.2, "functionality": 9.2, "usability": 8.8, "appearance": 9.0}, "overall": 9.3, "specifications": {"组别": "0-4岁", "接口": "ISOFIX"}, "purchase_guide": "智能通风、360°旋转，安全测评优秀。"},
            {"name": "虎贝尔 E360pro 安全座椅", "brand": "虎贝尔", "second_category": "安全座椅", "price": 2699, "ratings": {"safety": 9.3, "comfort": 9.0, "functionality": 9.0, "usability": 8.8, "appearance": 8.8}, "overall": 9.0, "specifications": {"组别": "0-7岁", "接口": "ISOFIX"}, "purchase_guide": "热销款，性价比高。"},
            {"name": "RECARO 儿童安全座椅 0-4岁", "brand": "RECARO", "second_category": "安全座椅", "price": 3999, "ratings": {"safety": 9.4, "comfort": 9.0, "functionality": 9.0, "usability": 8.6, "appearance": 8.8}, "overall": 9.1, "specifications": {"组别": "0-4岁", "接口": "ISOFIX"}, "purchase_guide": "德系品质，技术标杆。"},
            {"name": "二狗 婴儿背带 腰凳", "brand": "二狗", "second_category": "背带", "price": 199, "ratings": {"safety": 8.5, "comfort": 8.4, "functionality": 8.6, "usability": 8.5, "appearance": 8.0}, "overall": 8.4, "specifications": {"类型": "腰凳", "适用": "3月+"}, "purchase_guide": "解放双手，注意承重。"},
            {"name": "科巢 妈咪包 大容量", "brand": "科巢", "second_category": "妈咪包", "price": 89, "ratings": {"safety": 8.2, "comfort": 8.2, "functionality": 8.8, "usability": 8.8, "appearance": 8.0}, "overall": 8.4, "specifications": {"容量": "20L", "用途": "收纳母婴用品"}, "purchase_guide": "多隔层设计，方便分类。"},
            # ---- 启智早教类 ----
            {"name": "趣威 黑白视觉卡 套装", "brand": "趣威", "second_category": "视觉", "price": 49, "ratings": {"safety": 8.8, "comfort": 8.4, "functionality": 8.6, "usability": 8.8, "appearance": 8.4}, "overall": 8.6, "specifications": {"适用": "0-6月", "材质": "硬卡纸"}, "purchase_guide": "刺激视觉发育。"},
            {"name": "费雪 婴儿手摇铃", "brand": "费雪", "second_category": "听觉", "price": 69, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.4, "usability": 8.8, "appearance": 8.6}, "overall": 8.6, "specifications": {"适用": "0-12月"}, "purchase_guide": "刺激听觉与抓握。"},
            {"name": "伟易达 积木套装", "brand": "伟易达", "second_category": "益智", "price": 159, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.8, "usability": 8.6, "appearance": 8.4}, "overall": 8.6, "specifications": {"适用": "12月+"}, "purchase_guide": "培养动手能力。"},
            {"name": "乐高 得宝大颗粒积木", "brand": "乐高", "second_category": "益智", "price": 299, "ratings": {"safety": 8.8, "comfort": 8.4, "functionality": 8.8, "usability": 8.6, "appearance": 8.8}, "overall": 8.7, "specifications": {"适用": "18月+"}, "purchase_guide": "大颗粒防吞咽。"},
            # ---- 妈妈用品-孕期 ----
            {"name": "嫚熙 孕妇装 托腹裤", "brand": "嫚熙", "second_category": "孕妇装", "price": 129, "ratings": {"safety": 8.6, "comfort": 8.8, "functionality": 8.6, "usability": 8.6, "appearance": 8.4}, "overall": 8.6, "specifications": {"材质": "棉", "适用": "孕期"}, "purchase_guide": "托腹设计舒适。"},
            {"name": "十月结晶 孕妇托腹带", "brand": "十月结晶", "second_category": "孕妇装", "price": 79, "ratings": {"safety": 8.4, "comfort": 8.4, "functionality": 8.6, "usability": 8.5, "appearance": 8.0}, "overall": 8.4, "specifications": {"类型": "托腹带"}, "purchase_guide": "减轻腹部压力。"},
            {"name": "爱乐维 孕妇复合维生素", "brand": "爱乐维", "second_category": "营养", "price": 299, "ratings": {"safety": 8.8, "comfort": 8.6, "functionality": 8.8, "usability": 8.5, "appearance": 8.0}, "overall": 8.7, "specifications": {"类型": "复合维生素", "适用": "孕期"}, "purchase_guide": "含叶酸，遵医嘱服用。"},
            {"name": "斯利安 叶酸片", "brand": "斯利安", "second_category": "营养", "price": 39, "ratings": {"safety": 8.8, "comfort": 8.4, "functionality": 8.8, "usability": 8.6, "appearance": 8.0}, "overall": 8.6, "specifications": {"类型": "叶酸", "规格": "0.4mg*93"}, "purchase_guide": "备孕及孕早期必备。"},
            # ---- 妈妈用品-产后 ----
            {"name": "美德乐 电动吸奶器 双边", "brand": "美德乐", "second_category": "哺乳", "price": 1299, "ratings": {"safety": 8.8, "comfort": 8.8, "functionality": 9.0, "usability": 8.8, "appearance": 8.4}, "overall": 8.9, "specifications": {"类型": "电动双边"}, "purchase_guide": "专业吸奶器，效率高。"},
            {"name": "新安怡 手动吸奶器", "brand": "新安怡", "second_category": "哺乳", "price": 199, "ratings": {"safety": 8.5, "comfort": 8.4, "functionality": 8.2, "usability": 8.5, "appearance": 8.2}, "overall": 8.4, "specifications": {"类型": "手动"}, "purchase_guide": "便携，适合偶尔使用。"},
            {"name": "子初 收腹带", "brand": "子初", "second_category": "护理", "price": 49, "ratings": {"safety": 8.4, "comfort": 8.2, "functionality": 8.4, "usability": 8.5, "appearance": 8.0}, "overall": 8.3, "specifications": {"类型": "收腹带", "适用": "产后"}, "purchase_guide": "剖腹产下床时使用，减轻牵拉。"},
            {"name": "十月结晶 产褥垫 10片", "brand": "十月结晶", "second_category": "护理", "price": 29, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.6, "usability": 8.8, "appearance": 7.8}, "overall": 8.4, "specifications": {"尺寸": "60*90cm", "数量": "10片"}, "purchase_guide": "产妇入院必备，夏季多备。"},
            # ---- 电子电器类 ----
            {"name": "小白熊 奶瓶消毒锅", "brand": "小白熊", "second_category": "消毒", "price": 199, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.8, "usability": 8.6, "appearance": 8.2}, "overall": 8.6, "specifications": {"类型": "蒸汽消毒"}, "purchase_guide": "消毒烘干一体，方便。"},
            {"name": "Bololo 温奶器", "brand": "Bololo", "second_category": "温奶", "price": 99, "ratings": {"safety": 8.5, "comfort": 8.4, "functionality": 8.6, "usability": 8.6, "appearance": 8.2}, "overall": 8.5, "specifications": {"类型": "恒温温奶"}, "purchase_guide": "恒温设计，适合夜奶。"},
            {"name": "小白熊 调奶器", "brand": "小白熊", "second_category": "调奶", "price": 199, "ratings": {"safety": 8.6, "comfort": 8.4, "functionality": 8.8, "usability": 8.6, "appearance": 8.2}, "overall": 8.6, "specifications": {"类型": "恒温调奶"}, "purchase_guide": "冲奶温度恒定。"},
        ]

        # 简化：使用统一字段结构创建
        first_cat_map = {
            "食品类": "food", "食具类": "feeding", "服装及布类": "clothing",
            "尿裤类": "diaper", "寝具类": "bedding", "家具类": "furniture",
            "洗护日用品类": "bath", "护理工具类": "health_tool", "出行类": "travel",
            "启智早教类": "toy", "妈妈用品-孕期": "mama_pregnancy",
            "妈妈用品-产后": "mama_postpartum", "妈妈用品-哺乳": "mama_nursing", "电子电器类": "appliance",
        }
        # 简化：直接按二级分类归属
        second_to_first = {
            "奶粉": "food", "辅食": "food", "营养品": "food",
            "奶瓶": "feeding", "奶嘴": "feeding", "餐具": "feeding",
            "内衣": "clothing", "外衣": "clothing", "包被": "clothing", "围兜": "clothing",
            "纸尿裤": "diaper", "隔尿垫": "diaper",
            "婴儿床": "bedding", "床品": "bedding",
            "推车": "furniture", "餐椅": "furniture", "学步车": "furniture",
            "洗浴": "bath", "护肤": "bath", "清洁": "bath",
            "检测": "health_tool", "护理": "health_tool",
            "安全座椅": "travel", "背带": "travel", "妈咪包": "travel",
            "视觉": "toy", "听觉": "toy", "益智": "toy",
            "孕妇装": "mama_pregnancy", "营养": "mama_pregnancy",
            "哺乳": "mama_nursing", "护理": "mama_postpartum",
            "消毒": "appliance", "温奶": "appliance", "调奶": "appliance",
        }

        count = 0
        for p in products:
            fc = p.pop("second_category", "")
            first = second_to_first.get(fc, "食品")
            # 部分商品未定义 image_url，用占位图
            p.setdefault("image_url", f"https://picsum.photos/seed/{p['brand']}{p['name']}/400/300")
            p.setdefault("price_info", {"range": f"{p['price']}", "avg": p["price"], "taobao": p["price"], "jd": int(p["price"] * 1.05), "pdd": int(p["price"] * 0.92)})
            p.setdefault("is_essential", True)
            p["first_category"] = first
            # overall → overall_rating
            if "overall" in p:
                p["overall_rating"] = p.pop("overall")
            # specs → specifications（个别条目用了缩写）
            if "specs" in p:
                p["specifications"] = p.pop("specs")
            p.pop("price", None)
            # 加入品牌关联
            p["brand_profile"] = brands.get(p["brand"])
            Product.objects.get_or_create(name=p["name"], defaults=p)
            count += 1
        self.stdout.write(f"  ✅ 商品 {count} 条")

    # ===== 时间轴 =====
    def create_timeline(self):
        items = [
            {"stage_type": "pregnancy_week", "stage_value": 8, "category": "health", "title": "孕早期建档攻略 + 叶酸补充指南", "subtitle": "孕8周重点", "content": "孕8周是建档关键期，请尽快完成初次产检建档。叶酸每日400μg，预防胎儿神经管畸形。注意避免剧烈运动与烟酒。", "tips": "建档一般带身份证+户口本，不同医院要求不同，提前电话确认。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 12, "category": "health", "title": "NT检查全面解读", "subtitle": "孕12周", "content": "NT（颈项透明层）检查在孕11-13周+6进行，正常值 < 2.5mm。NT值偏厚需进一步羊穿或无创DNA检查。", "tips": "NT检查需提前预约，建议带上建档资料。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 16, "category": "health", "title": "唐氏筛查 vs 无创DNA怎么选", "subtitle": "孕16周", "content": "唐氏筛查（抽血）检出率约70-80%，无创DNA（NIPT）检出率>99%。年龄35岁以上或高危建议直接做无创。", "tips": "无创DNA价格约1500-3000元，部分地区有补贴。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 20, "category": "milestone", "title": "大排畸筛查+胎教方法", "subtitle": "孕20周", "content": "大排畸（系统超声）在孕20-24周进行，可发现结构异常。开始胎教：轻音乐、阅读、与宝宝互动。", "tips": "大排畸耗时较长，可适当走动。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 24, "category": "health", "title": "糖耐量检查（OGTT）注意事项", "subtitle": "孕24周", "content": "空腹抽血后口服75g葡萄糖，1小时、2小时分别抽血。正常范围：空腹<5.1，1小时<10.0，2小时<8.5。", "tips": "检查前3天正常饮食，前夜10点后禁食。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 28, "category": "health", "title": "孕晚期管理：数胎动+预防早产", "subtitle": "孕28周", "content": "每天早中晚各数1小时胎动，正常≥3-5次/小时。注意宫缩频率，若规律宫缩需立即就医。", "tips": "孕28周后建议每周产检。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 32, "category": "health", "title": "胎位不正怎么办？", "subtitle": "孕32周", "content": "臀位/横位可尝试膝胸卧位纠正，或咨询医生评估是否需要外倒转术。定期B超监测。", "tips": "孕36周前胎位仍可能自行纠正。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 36, "category": "shopping", "title": "分娩方式选择：顺产vs剖腹产", "subtitle": "孕36周", "content": "顺产恢复快、利于下奶；剖腹产适合有指征者。具体以产科医生评估为准。", "tips": "无论哪种方式，提前准备好待产包。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 37, "category": "shopping", "title": "待产包清单全攻略（含季节差异）", "subtitle": "孕37周", "content": "产褥垫、一次性内裤、哺乳睡衣、NB纸尿裤等必备，季节不同有差异。可用平台的「智能待产包」一键生成。", "tips": "建议孕37周前准备好待产包。", "is_essential": True},
            {"stage_type": "pregnancy_week", "stage_value": 38, "category": "health", "title": "临产征兆识别：见红、破水、宫缩", "subtitle": "孕38周", "content": "见红→多数24-48小时内临产；破水→立即平卧就医；规律宫缩（5-6分钟一次）→准备入院。", "tips": "破水后禁止洗澡，避免感染。", "is_essential": True},
            {"stage_type": "baby_age_day", "stage_value": 3, "category": "health", "title": "新生儿黄疸护理", "subtitle": "出生3天", "content": "生理性黄疸一般在出生2-3天出现，7-14天消退。观察精神、吃奶，重者需照蓝光。", "tips": "黄疸值偏高请遵医嘱，不可自行用药。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 1, "category": "health", "title": "新生儿抚触+睡眠安全+疫苗", "subtitle": "宝宝1月龄", "content": "每天抚触10-15分钟促进发育；睡眠采用仰卧，床上不放软玩具；按计划接种乙肝第2针。", "tips": "夜间喂奶建议开小夜灯。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 2, "category": "health", "title": "肠绞痛/二月闹应对+维生素D", "subtitle": "宝宝2月龄", "content": "肠绞痛多发生在傍晚，可飞机抱、顺时针揉腹、白噪音安抚。每日补充维生素D400IU。", "tips": "肠绞痛通常在3-4月龄自行缓解。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 3, "category": "milestone", "title": "抬头训练+视觉追踪", "subtitle": "宝宝3月龄", "content": "俯卧抬头训练每日2-3次，每次3-5分钟。用黑白卡/彩色玩具练习视觉追踪。", "tips": "俯卧需在清醒、监护下进行。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 4, "category": "milestone", "title": "口欲期+牙胶选择+翻身练习", "subtitle": "宝宝4月龄", "content": "宝宝进入口欲期，提供安全的牙胶满足需求；开始翻身练习，注意床边防护。", "tips": "牙胶选择食品级硅胶。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 5, "category": "milestone", "title": "靠坐练习+双手协作", "subtitle": "宝宝5月龄", "content": "靠坐练习注意托腰，双手协作可玩传递玩具的游戏。", "tips": "每次靠坐不超过10分钟。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 6, "category": "food", "title": "第一口辅食：高铁米粉添加全攻略", "subtitle": "宝宝6月龄", "content": "从含铁米粉开始，由稀到稠、由少到多、由单一到混合。第一周每次半勺，观察过敏情况。", "tips": "铁元素对6月龄宝宝至关重要。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 7, "category": "food", "title": "辅食进阶：泥糊→颗粒→手指食物", "subtitle": "宝宝7月龄", "content": "从泥糊过渡到稠泥、颗粒，逐步引入手指食物（蒸软的胡萝卜条等），锻炼抓握和咀嚼。", "tips": "手指食物需软硬适中。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 8, "category": "milestone", "title": "爬行训练+安全围栏+语言启蒙", "subtitle": "宝宝8月龄", "content": "每天多次爬行训练，客厅铺爬行垫+安全围栏；多与宝宝对话、哼唱。", "tips": "注意家中尖角防护。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 9, "category": "food", "title": "断夜奶方法+自主入睡训练", "subtitle": "宝宝9月龄", "content": "逐步减少夜奶次数，建立固定的睡前流程（洗澡-绘本-哄睡），帮助自主入睡。", "tips": "断夜奶需循序渐进。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 10, "category": "milestone", "title": "站立扶走+拇食指对捏", "subtitle": "宝宝10月龄", "content": "宝宝尝试站立扶走，拇食指对捏练习（小饼干等），锻炼精细动作。", "tips": "学习扶走注意安全环境。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 11, "category": "milestone", "title": "如厕训练预备+独立进食", "subtitle": "宝宝11月龄", "content": "准备小马桶，培养如厕意识；鼓励宝宝自己用勺吃饭，接受脏乱。", "tips": "如厕训练从白天开始。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 12, "category": "travel", "title": "学步鞋选购指南+独立行走", "subtitle": "宝宝12月龄", "content": "选择轻便、防滑、鞋头宽松的学步鞋，尺码每2-3个月检查；鼓励宝宝独立行走。", "tips": "光脚在家走路对足弓发育更好。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 15, "category": "milestone", "title": "语言爆发期+情绪认知", "subtitle": "宝宝15月龄", "content": "宝宝开始快速积累词汇，多进行指物命名游戏；教认识情绪（开心/难过）。", "tips": "多讲故事、多对话。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 18, "category": "emotion", "title": "叛逆期应对+安全感建立", "subtitle": "宝宝18月龄", "content": "会频繁说“不”，用选择式提问（A还是B）减少对抗；建立规律作息提供安全感。", "tips": "温柔而坚定地设立界限。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 24, "category": "milestone", "title": "如厕训练完成+入园准备第一步", "subtitle": "宝宝2岁", "content": "白天可完成如厕，夜间的逐步过渡。入园准备：规律作息、表达需求练习。", "tips": "入园前建议先参观幼儿园。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 30, "category": "milestone", "title": "社交能力培养+规则意识", "subtitle": "宝宝2.5岁", "content": "增加同伴游戏机会，学习轮流、分享；建立简单家庭规则（如睡觉时间）。", "tips": "示范比说教更有效。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 36, "category": "milestone", "title": "幼儿园入园准备（心理+物品+能力）", "subtitle": "宝宝3岁", "content": "心理：读入园绘本、参观幼儿园；物品：姓名贴、备用衣裤；能力：自主吃饭穿衣。", "tips": "分离焦虑是正常的，家长稳住。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 48, "category": "milestone", "title": "数学启蒙+艺术启蒙", "subtitle": "宝宝4岁", "content": "生活化数学启蒙：数楼梯、分餐具；艺术启蒙：自由涂鸦、音乐节奏游戏。", "tips": "重在兴趣与过程。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 60, "category": "milestone", "title": "幼小衔接：习惯+能力+知识", "subtitle": "宝宝5岁", "content": "习惯：作息规律、整理书包；能力：专注力、社交；知识：字母、简单数学不抢跑。", "tips": "保护学习兴趣比提前学更重要。", "is_essential": True},
            {"stage_type": "baby_age_month", "stage_value": 72, "category": "milestone", "title": "入学准备+独立能力培养", "subtitle": "宝宝6岁", "content": "入学准备：文具、作息、路线；独立能力：自己收拾、自己洗漱。", "tips": "多鼓励，少比较。", "is_essential": True},
        ]
        count = 0
        for item in items:
            tips = item.pop("tips", "")
            TimelineEvent.objects.get_or_create(title=item["title"], defaults={**item, "tips": tips})
            count += 1
        self.stdout.write(f"  ✅ 时间轴 {count} 条")

    # ===== 演示账号 =====
    def create_demo_user(self):
        if User.objects.filter(phone="13800000000").exists():
            return
        user = User.objects.create_user(
            username="13800000000",
            phone="13800000000",
            password="mengya123",
            nickname="演示妈妈",
            role="mother",
            due_date=date.today() + timedelta(days=90),
            is_pregnant=True,
        )
        BabyProfile.objects.create(
            user=user,
            name="小萌芽",
            gender="unknown",
            birthday=date.today() - timedelta(days=200),
            is_primary=True,
        )
        self.stdout.write("  ✅ 演示账号 13800000000 / mengya123")