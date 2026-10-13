# -*- coding: utf-8 -*-
"""
孕周推算与一致性校验引擎（问题2核心）
优先级：用户档案预产期(due_date, 280天医学模型) > 首次孕期打卡锚点(first_anchor)。
用于健康打卡与 BMI 分析的孕周自动计算、自动填充与偏差拦截，杜绝"日期与孕周矛盾"的脏数据。
"""
import logging
from datetime import date, timedelta
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# 医学标准：全孕期 280 天（40 周）
FULL_PREGNANCY_DAYS = 280

# 允许的手填孕周与推算孕周的最大偏差（周）；超过则拦截
MAX_WEEK_DEVIATION = 1


def _calc_week_from_lmp(record_date: date, lmp: date) -> Tuple[int, int]:
    """依据末次月经日(LMP)计算指定日期的孕周与余天数"""
    days = (record_date - lmp).days
    if days < 0:
        return 0, 0
    if days >= FULL_PREGNANCY_DAYS:
        # 超过预产期，仍按 40 周封顶展示
        return 40, days - FULL_PREGNANCY_DAYS
    return days // 7, days % 7


def get_expected_week(user, record_date: date) -> Optional[Dict[str, Any]]:
    """
    推算指定日期的医学孕周。
    返回 {"week": int, "days": int, "basis": "due_date"|"first_anchor", "label": str}；
    无任何基准（未设预产期且无历史打卡）时返回 None。
    """
    if record_date is None:
        return None

    # ===== 基准1：预产期（最高优先级，医学 280 天模型）=====
    due_date = getattr(user, "due_date", None)
    if not due_date:
        try:
            from apps.core.models.baby import BabyProfile
            unborn_baby = BabyProfile.objects.filter(user=user, is_born=False).order_by("-is_primary", "-id").first()
            if unborn_baby and unborn_baby.birthday:
                due_date = unborn_baby.birthday
        except Exception:
            pass
    if due_date:
        try:
            lmp = due_date - timedelta(days=FULL_PREGNANCY_DAYS)
            week, days = _calc_week_from_lmp(record_date, lmp)
            return {
                "week": week,
                "days": days,
                "basis": "due_date",
                "label": f"孕{week}周{days}天（基于档案预产期 {due_date} 推算）",
            }
        except Exception as e:
            logger.warning("孕周推算-预产期基准异常: %s", e)

    # ===== 基准2：该用户最早一条孕期打卡的 (日期, 孕周) 锚点 =====
    try:
        from apps.core.models.health import HealthRecord

        anchor = (
            HealthRecord.objects.filter(
                user=user,
                record_type="prenatal_exam",
                gestational_week__isnull=False,
            )
            .exclude(gestational_week=0)
            .order_by("record_date", "created_at")
            .first()
        )
        if anchor and anchor.gestational_week:
            lmp = anchor.record_date - timedelta(days=anchor.gestational_week * 7)
            week, days = _calc_week_from_lmp(record_date, lmp)
            return {
                "week": week,
                "days": days,
                "basis": "first_anchor",
                "label": f"孕{week}周{days}天（基于首次打卡 {anchor.record_date} 孕{anchor.gestational_week}周推算）",
            }
    except Exception as e:
        logger.warning("孕周推算-锚点基准异常: %s", e)

    return None


def validate_gestational_week(
    user,
    record_date: date,
    gestational_week: Optional[int],
) -> Dict[str, Any]:
    """
    校验用户手填孕周与推算孕周的一致性。
    返回:
      {"ok": True, "week": 最终孕周, "days": 周内天数(0~6), "auto_filled": bool, "basis": str, "hint": str}
      {"ok": False, "expected": int, "label": str}  -> 偏差超过 1 周，应拦截并提示
    v1.58：全部成功路径透出 days（孕X周Y天粒度），供存储与前端"孕x周x天"展示复用。
    """
    expected = get_expected_week(user, record_date)

    # 无任何推算基准：允许手填（1~42），并提示建议设置预产期
    if expected is None:
        if gestational_week is not None:
            return {
                "ok": True,
                "week": gestational_week,
                "days": 0,
                "auto_filled": False,
                "basis": "manual",
                "hint": "尚未设置预产期，本次孕周以您手填为准；建议在「我的-档案」中设置预产期以自动校准",
            }
        return {
            "ok": True,
            "week": None,
            "days": None,
            "auto_filled": False,
            "basis": "manual",
            "hint": "",
        }

    exp_week = expected["week"]
    exp_days = expected["days"]

    # 未手填孕周：自动采用推算值（周+天）
    if gestational_week is None:
        return {
            "ok": True,
            "week": exp_week,
            "days": exp_days,
            "auto_filled": True,
            "basis": expected["basis"],
            "hint": f"已按档案基准自动填充孕周：{expected['label']}",
        }

    # 手填孕周：偏差超过 1 周直接拦截
    if abs(gestational_week - exp_week) > MAX_WEEK_DEVIATION:
        return {
            "ok": False,
            "expected": exp_week,
            "label": expected["label"],
            "hint": (
                f"孕周与日期不匹配：{expected['label']}，"
                f"该日期应为孕 {exp_week} 周（您填写的是孕 {gestational_week} 周，偏差超过 {MAX_WEEK_DEVIATION} 周）。"
                "请核对测量日期或档案预产期。"
            ),
        }

    # 偏差在允许范围内（含相等）：以手填为准；周数一致时沿用推算的周内天数，微调时按整周（0天）
    return {
        "ok": True,
        "week": gestational_week,
        "days": exp_days if gestational_week == exp_week else 0,
        "auto_filled": False,
        "basis": expected["basis"],
        "hint": "",
    }
