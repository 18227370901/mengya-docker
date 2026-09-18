"""待产包动态生成器 - 根据季节 + 分娩方式自适应"""


class ShoppingListGenerator:
    """待产包生成器：季节 + 分娩方式动态生成"""

    BASE_ITEMS = [
        {"product_name": "产褥垫", "quantity": 10, "unit": "片", "note": "60*90cm大号，夏季建议额外+5片"},
        {"product_name": "一次性内裤", "quantity": 10, "unit": "条", "note": "纯棉材质"},
        {"product_name": "产妇卫生巾/安睡裤", "quantity": 10, "unit": "片", "note": "产后1-2天用安睡裤，后期用普通卫生巾"},
        {"product_name": "吸管杯", "quantity": 1, "unit": "个", "note": "躺着喝水神器，建议买带吸管的保温杯"},
        {"product_name": "哺乳睡衣/开襟睡衣", "quantity": 2, "unit": "套", "note": "产后虚汗多，备2-3套换洗"},
        {"product_name": "哺乳文胸", "quantity": 3, "unit": "件", "note": "前开扣式，方便哺乳"},
        {"product_name": "防溢乳垫", "quantity": 1, "unit": "盒", "note": "一盒约30-50片"},
        {"product_name": "新生儿连体衣/和尚服", "quantity": 4, "unit": "件", "note": "52码，A类纯棉面料"},
        {"product_name": "NB码纸尿裤", "quantity": 30, "unit": "片", "note": "一小包约30片，仅住院用"},
        {"product_name": "婴儿包被", "quantity": 1, "unit": "条", "note": "不要买带帽子的包被，有窒息风险"},
        {"product_name": "小罐奶粉", "quantity": 1, "unit": "罐", "note": "400g，母乳未及时时备用"},
        {"product_name": "奶瓶", "quantity": 1, "unit": "个", "note": "SS号奶嘴，PPSU或玻璃材质"},
        {"product_name": "棉柔巾", "quantity": 2, "unit": "包", "note": "干湿两用"},
        {"product_name": "手口湿巾", "quantity": 2, "unit": "包", "note": "无酒精无香精"},
        {"product_name": "护臀膏", "quantity": 1, "unit": "支", "note": "预防红屁屁"},
        {"product_name": "胎帽", "quantity": 1, "unit": "顶", "note": "根据季节选厚薄"},
        {"product_name": "纱布围兜/口水巾", "quantity": 5, "unit": "条", "note": "纱布材质，吸水性好"},
        {"product_name": "隔尿垫", "quantity": 2, "unit": "条", "note": "铺在床单下，防止尿湿床垫"},
    ]

    DOCUMENTS = [
        {"name": "夫妻双方身份证", "note": "原件+复印件"},
        {"name": "医保卡/社保卡", "note": "确认已激活"},
        {"name": "产检病历/所有化验单", "note": "按时间顺序整理"},
        {"name": "住院押金", "note": "现金/银行卡/手机支付"},
        {"name": "准生证/生育登记证明", "note": "部分地区需要"},
        {"name": "母子健康手册", "note": "社区医院领取"},
    ]

    SEASON_LABELS = {"spring": "春季", "summer": "夏季", "autumn": "秋季", "winter": "冬季", "all": "通用"}
    DELIVERY_LABELS = {"vaginal": "顺产", "cesarean": "剖腹产", "both": "通用"}

    @classmethod
    def generate(cls, season: str = "all", delivery_method: str = "both") -> dict:
        items = [dict(i) for i in cls.BASE_ITEMS]

        # 季节差异
        items.extend(cls._get_season_items(season))
        if season == "summer":
            items = cls._adjust_quantity(items, "产褥垫", 5)

        # 分娩方式差异
        items.extend(cls._get_delivery_items(delivery_method))

        return {
            "items": items,
            "documents": cls.DOCUMENTS,
            "season": season,
            "season_label": cls.SEASON_LABELS.get(season, "通用"),
            "delivery_method": delivery_method,
            "delivery_label": cls.DELIVERY_LABELS.get(delivery_method, "通用"),
            "total_items": len(items),
        }

    @classmethod
    def _get_season_items(cls, season: str) -> list:
        items = []
        if season == "winter":
            items += [
                {"product_name": "厚包被", "quantity": 1, "unit": "条", "note": "冬季加厚款"},
                {"product_name": "月子鞋/厚袜子", "quantity": 1, "unit": "双", "note": "脚部保暖"},
                {"product_name": "保暖帽（婴儿）", "quantity": 1, "unit": "顶", "note": "外出保暖"},
                {"product_name": "加厚睡袋", "quantity": 1, "unit": "条", "note": "带袖睡袍款"},
            ]
        elif season == "summer":
            items += [
                {"product_name": "防晒遮阳帽（婴儿）", "quantity": 1, "unit": "顶", "note": "防紫外线"},
                {"product_name": "薄款纱布巾", "quantity": 2, "unit": "条", "note": "夏季贴身包裹"},
                {"product_name": "驱蚊用品", "quantity": 1, "unit": "套", "note": "物理驱蚊优先（蚊帐）"},
            ]
        elif season in ("spring", "autumn"):
            items.append({"product_name": "适中厚度包被", "quantity": 1, "unit": "条", "note": "春秋适用"})
        return items

    @classmethod
    def _get_delivery_items(cls, delivery_method: str) -> list:
        if delivery_method == "cesarean":
            return [
                {"product_name": "医用收腹带", "quantity": 1, "unit": "条", "note": "剖腹产必备，下床时减轻伤口牵拉"},
                {"product_name": "一次性吸管", "quantity": 1, "unit": "包", "note": "术后不便起身时用"},
            ]
        if delivery_method == "vaginal":
            return [
                {"product_name": "会阴冷敷贴", "quantity": 3, "unit": "片", "note": "顺产消肿止痛"},
                {"product_name": "私处冲洗器", "quantity": 1, "unit": "个", "note": "顺产清洁护理"},
                {"product_name": "能量零食/功能饮料", "quantity": 0, "unit": "", "note": "产程中补充体力，如巧克力、红牛"},
            ]
        return []

    @classmethod
    def _adjust_quantity(cls, items: list, product_name: str, amount: int) -> list:
        for item in items:
            if item["product_name"] == product_name:
                if isinstance(item["quantity"], int):
                    item["quantity"] += amount
                    item["note"] = item.get("note", "") + f"（额外+{amount}）"
                break
        return items