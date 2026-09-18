from datetime import date
from typing import Optional


def get_stage_info(
    due_date: Optional[date] = None,
    baby_birthday: Optional[date] = None,
) -> dict:
    """
    根据预产期或宝宝生日计算当前阶段信息。
    返回：阶段类型、阶段值、显示文本、推荐标签等。
    """
    today = date.today()

    # 情况1：孕期
    if due_date and not baby_birthday:
        delta = due_date - today
        if delta.days < 0:
            weeks = 40
            label = "孕40周（已过预产期）"
        else:
            weeks = 40 - (delta.days // 7)
            weeks = max(1, min(weeks, 40))
            label = f"孕{weeks}周（距预产期{delta.days}天）"

        if weeks <= 13:
            trimester = "孕早期"
        elif weeks <= 27:
            trimester = "孕中期"
        else:
            trimester = "孕晚期"

        return {
            "type": "pregnancy",
            "value": weeks,
            "label": label,
            "trimester": trimester,
            "stage_key": f"pregnancy_{weeks}w",
            "is_pregnant": True,
        }

    # 情况2：产后
    if baby_birthday:
        days = (today - baby_birthday).days
        if days < 0:
            return {
                "type": "waiting",
                "value": 0,
                "label": "等待宝宝出生",
                "stage_key": "waiting",
                "is_pregnant": True,
            }

        months = days // 30
        if days < 30:
            label = f"宝宝{days}天"
            stage_key = f"baby_{days}d"
        elif months >= 36:
            years = months // 12
            rem = months % 12
            age_str = f"{years}岁{rem}个月" if rem else f"{years}岁"
            label = f"宝宝{age_str}"
            stage_key = f"baby_{years}y{rem}m" if rem else f"baby_{years}y"
        else:
            label = f"宝宝{months}个月"
            stage_key = f"baby_{months}m"

        if months <= 3:
            period = "新生儿期"
        elif months <= 12:
            period = "婴儿期"
        elif months <= 36:
            period = "幼儿期"
        else:
            period = "学龄前期"

        return {
            "type": "baby",
            "value": months if months > 0 else days,
            "days": days,
            "label": label,
            "period": period,
            "stage_key": stage_key,
            "is_pregnant": False,
        }

    # 情况3：未设置
    return {
        "type": "unknown",
        "value": 0,
        "label": "请设置预产期或宝宝生日",
        "stage_key": "unknown",
        "is_pregnant": False,
    }