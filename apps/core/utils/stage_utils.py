from datetime import date
from typing import Optional


def calculate_pregnancy_progress(due_date: date, today: Optional[date] = None) -> dict:
    """
    根据预产期精确计算医学孕周与剩余天数。
    医学标准全孕期共280天（40周）。
    days_pregnant = 280 - (due_date - today).days
    weeks = days_pregnant // 7
    rem_days = days_pregnant % 7
    """
    if today is None:
        today = date.today()
    delta = due_date - today
    if delta.days < 0:
        days_over = abs(delta.days)
        weeks = 40
        rem_days = days_over
        label = f"孕40周+{days_over}天（已过预产期{days_over}天）"
        week_days_text = f"孕40周+{days_over}天"
        days_pregnant = 280 + days_over
    else:
        days_pregnant = 280 - delta.days
        if days_pregnant < 0:
            weeks = 0
            rem_days = 0
        else:
            weeks = days_pregnant // 7
            rem_days = days_pregnant % 7
        weeks = max(0, min(weeks, 40))
        label = f"孕{weeks}周{rem_days}天（距预产期{delta.days}天）"
        week_days_text = f"孕{weeks}周{rem_days}天"

    if weeks <= 13:
        trimester = "孕早期"
    elif weeks <= 27:
        trimester = "孕中期"
    else:
        trimester = "孕晚期"

    return {
        "weeks": weeks,
        "rem_days": rem_days,
        "days_pregnant": days_pregnant,
        "days_to_due": delta.days,
        "label": label,
        "week_days_text": week_days_text,
        "trimester": trimester,
    }


def calculate_baby_age(baby_birthday: date, today: Optional[date] = None) -> dict:
    """
    根据宝宝出生日期计算精确周岁、月龄与剩余天数。
    格式规范：
    - 满1周岁以上：X岁X个月X天（总月龄个月），例如：2岁8个月5天（32个月），整岁整月自适应精简（如：1岁整（12个月）、1岁零5天（12个月））；
    - 1个月~1周岁：X个月X天，例如：8个月5天，整月显示 X个月整；
    - 未满月（新生儿期）：X天。
    """
    if today is None:
        today = date.today()
    days = (today - baby_birthday).days
    if days < 0:
        return {
            "days": days,
            "years": 0,
            "months": 0,
            "rem_days": 0,
            "total_months": 0,
            "age_text": "尚未出生",
            "label": "等待宝宝出生",
            "period": "等待期",
        }

    from dateutil.relativedelta import relativedelta
    r = relativedelta(today, baby_birthday)
    years = r.years
    rem_months = r.months
    rem_days = r.days
    total_months = years * 12 + rem_months

    if years > 0:
        parts = [f"{years}岁"]
        if rem_months > 0:
            parts.append(f"{rem_months}个月")
        elif rem_days > 0:
            parts.append("零")
        if rem_days > 0:
            parts.append(f"{rem_days}天")
        elif rem_months == 0:
            parts.append("整")
        age_main = "".join(parts)
        age_str = f"{age_main}（{total_months}个月）"
    elif total_months > 0:
        if rem_days > 0:
            age_str = f"{total_months}个月{rem_days}天"
        else:
            age_str = f"{total_months}个月整"
    else:
        age_str = f"{days}天"

    if days <= 28:
        period = "新生儿期"
    elif total_months <= 12:
        period = "婴儿期"
    elif total_months <= 36:
        period = "幼儿期"
    else:
        period = "学龄前期"

    return {
        "days": days,
        "years": years,
        "months": rem_months,
        "rem_days": rem_days,
        "total_months": total_months,
        "age_text": age_str,
        "label": f"宝宝{age_str}",
        "period": period,
    }

def get_stage_info(
    due_date: Optional[date] = None,
    baby_birthday: Optional[date] = None,
    is_pregnant: Optional[bool] = None,
) -> dict:
    """
    根据预产期或宝宝生日计算当前阶段信息。
    优先依据 is_pregnant 明确标识；若未指定则通过 due_date 与 baby_birthday 综合推导。
    返回：阶段类型、阶段值、显示文本、精确周天及推荐标签等。
    """
    today = date.today()

    # 判定当前是否优先按孕期计算：
    # 1) 显式声明 is_pregnant is True 且存在预产期
    # 2) 或 is_pregnant 为 None 时，存在 due_date 且未指定 baby_birthday
    # 3) 或即使存在 baby_birthday，但显式指定了 is_pregnant=True
    is_pregnancy_mode = False
    if due_date:
        if is_pregnant is True:
            is_pregnancy_mode = True
        elif is_pregnant is False:
            is_pregnancy_mode = False
        else:
            is_pregnancy_mode = not bool(baby_birthday)

    # 情况1：孕期
    if is_pregnancy_mode and due_date:
        prog = calculate_pregnancy_progress(due_date, today)
        content_week = max(1, min(prog["weeks"], 40))
        return {
            "type": "pregnancy",
            "value": content_week,
            "weeks": prog["weeks"],
            "rem_days": prog["rem_days"],
            "days_pregnant": prog["days_pregnant"],
            "days_to_due": prog["days_to_due"],
            "label": prog["label"],
            "week_days_text": prog["week_days_text"],
            "trimester": prog["trimester"],
            "stage_key": f"pregnancy_{content_week}w",
            "is_pregnant": True,
        }

    # 情况2：产后
    if baby_birthday:
        age_info = calculate_baby_age(baby_birthday, today)
        if age_info["days"] < 0:
            return {
                "type": "waiting",
                "value": 0,
                "label": "等待宝宝出生",
                "stage_key": "waiting",
                "is_pregnant": True,
            }

        years = age_info["years"]
        rem_days = age_info["rem_days"]
        total_months = age_info["total_months"]
        stage_key = f"baby_{years}y{age_info['months']}m" if years > 0 else f"baby_{total_months}m"

        return {
            "type": "baby",
            "value": total_months if total_months > 0 else age_info["days"],
            "days": age_info["days"],
            "years": years,
            "months": age_info["months"],
            "rem_days": rem_days,
            "total_months": total_months,
            "age_text": age_info["age_text"],
            "label": age_info["label"],
            "period": age_info["period"],
            "stage_key": stage_key,
            "is_pregnant": False,
        }

    # 保底：若只有 due_date 且未被标记为非孕期
    if due_date and (is_pregnant is not False):
        prog = calculate_pregnancy_progress(due_date, today)
        content_week = max(1, min(prog["weeks"], 40))
        return {
            "type": "pregnancy",
            "value": content_week,
            "weeks": prog["weeks"],
            "rem_days": prog["rem_days"],
            "days_pregnant": prog["days_pregnant"],
            "days_to_due": prog["days_to_due"],
            "label": prog["week_days_text"],
            "week_days_text": prog["week_days_text"],
            "trimester": prog["trimester"],
            "stage_key": f"pregnancy_{content_week}w",
            "is_pregnant": True,
        }

    # 情况3：未设置
    return {
        "type": "unknown",
        "value": 0,
        "label": "请设置预产期或宝宝生日",
        "stage_key": "unknown",
        "is_pregnant": False,
    }
