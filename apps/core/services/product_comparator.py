"""产品对比引擎 - 五维评分、综合推荐、性价比标签"""


class ProductComparator:
    """产品对比引擎：计算五维评分、综合推荐、性价比标签"""

    DIMENSIONS = ["safety", "comfort", "functionality", "usability", "appearance"]
    DIMENSION_LABELS = {
        "safety": "安全性",
        "comfort": "舒适性",
        "functionality": "功能性",
        "usability": "易用性",
        "appearance": "美观性",
    }

    @classmethod
    def compare(cls, products) -> dict:
        """
        products: Product QuerySet（2-5 个）
        返回对比结果：并排数据、雷达图配置、推荐标签、价格对比
        """
        if len(products) < 2:
            raise ValueError("至少需要2个产品进行对比")

        compare_data = []
        for product in products:
            context = product.get_compare_context()
            compare_data.append(
                {
                    "id": product.id,
                    "name": product.name,
                    "brand": product.brand,
                    "image": product.image_url,
                    "price": product.price_info,
                    "ratings": cls._normalize_ratings(context.get("ratings", {})),
                    "overall": context.get("overall", 0),
                    "specs": context.get("specs", {}),
                    "safety": context.get("safety", {}),
                    "purchase_guide": product.purchase_guide,
                }
            )

        return {
            "products": compare_data,
            "radar": cls._build_radar_data(compare_data),
            "recommendation": cls._generate_recommendation(compare_data),
            "price_comparison": cls._build_price_comparison(compare_data),
            "dimensions": cls.DIMENSION_LABELS,
        }

    @classmethod
    def _normalize_ratings(cls, ratings: dict) -> dict:
        return {dim: ratings.get(dim, 0) for dim in cls.DIMENSIONS}

    @classmethod
    def _build_radar_data(cls, products_data: list) -> dict:
        indicator = [{"name": cls.DIMENSION_LABELS[d], "max": 10} for d in cls.DIMENSIONS]
        series = [
            {
                "name": f"{p['brand']} {p['name']}",
                "value": [p["ratings"].get(d, 0) for d in cls.DIMENSIONS],
            }
            for p in products_data
        ]
        return {"indicator": indicator, "series": series}

    @classmethod
    def _generate_recommendation(cls, products_data: list) -> dict:
        recs = []

        best_overall = max(products_data, key=lambda p: p["overall"])
        recs.append(
            {
                "type": "best_overall",
                "label": "综合推荐之选",
                "product_id": best_overall["id"],
                "desc": f"{best_overall['brand']} {best_overall['name']} 综合评分最高",
            }
        )

        priced = [p for p in products_data if p.get("price", {}).get("avg", 0) > 0 and p["overall"] > 0]
        if priced:
            best_value = min(priced, key=lambda p: p["price"]["avg"] / p["overall"])
            if best_value["id"] != best_overall["id"]:
                recs.append(
                    {
                        "type": "best_value",
                        "label": "性价比之选",
                        "product_id": best_value["id"],
                        "desc": f"{best_value['brand']} {best_value['name']} 同价位中评分最高",
                    }
                )

        best_safety = max(products_data, key=lambda p: p["ratings"].get("safety", 0))
        if best_safety["id"] != best_overall["id"]:
            recs.append(
                {
                    "type": "best_safety",
                    "label": "安全首选",
                    "product_id": best_safety["id"],
                    "desc": f"{best_safety['brand']} {best_safety['name']} 安全性评分最高",
                }
            )

        alerts = []
        for p in products_data:
            if p.get("safety", {}).get("alert"):
                alerts.append(
                    {
                        "product_id": p["id"],
                        "product_name": f"{p['brand']} {p['name']}",
                        "alert": p["safety"]["alert"],
                    }
                )

        return {"labels": recs, "alerts": alerts}

    @classmethod
    def _build_price_comparison(cls, products_data: list) -> dict:
        platforms = ["taobao", "jd", "pdd"]
        platform_labels = {"taobao": "淘宝", "jd": "京东", "pdd": "拼多多"}
        result = {}
        for p in products_data:
            price_info = p.get("price", {})
            result[p["id"]] = {
                "name": f"{p['brand']} {p['name']}",
                "prices": {plat: price_info.get(plat) for plat in platforms},
                "avg": price_info.get("avg", 0),
                "range": price_info.get("range", ""),
            }
        return {"products": result, "platform_labels": platform_labels, "platforms": platforms}