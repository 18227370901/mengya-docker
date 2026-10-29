# -*- coding: utf-8 -*-
"""
阶段类型时序合理性校验服务 (StageValidator)
依据 280 天医学全孕期模型 (WS/T 801-2022) 及产后生理恢复周期，
对用户“健康打卡”、“一键分析评估与时序归档”及“CSV 批量导入”两条路径入库的阶段类型做合理性校验。
支持同一位妈妈多孩不同阶段（如大宝处于产后/育儿期，二宝处于全孕期）：
按单次妊娠周期时间窗 [LMP - 14天, EDD + 42天] 隔离校验，
杜绝在同一孕育周期内出现矛盾的非孕期或产后数据，同时允许不同孩子/胎次的合理阶段共存，
严格按单个妈妈维度隔离。
"""
import logging
from datetime import date, timedelta
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

FULL_PREGNANCY_DAYS = 280
CYCLE_WINDOW_DAYS = 300  # 医学单次妊娠周期跨度约 300 天，超过则视为不同胎次/不同孩子


def validate_stage_transition(
    user,
    record_date: date,
    stage_type: str,
    gestational_week: Optional[int] = None,
    gestational_days: Optional[int] = None,
    postpartum_months: Optional[int] = None,
    mother=None,
    exclude_record_id: Optional[int] = None,
    allow_cross_stage: bool = False,
) -> Tuple[bool, str]:
    """
    校验指定妈妈在 record_date 录入 stage_type 的医学合理性。
    支持多孩不同阶段共存：按独立妊娠周期窗口隔离。
    返回: (is_valid: bool, error_msg: str)
    """
    from apps.core.models.health import HealthRecord
    from apps.core.models.mother import MotherProfile

    if not record_date or not stage_type:
        return True, ""

    # 1. 确定妈妈实体（多妈妈严格隔离）
    target_mother = mother
    if not target_mother:
        target_mother = MotherProfile.objects.filter(user=user, is_primary=True).first()
        if not target_mother:
            target_mother = MotherProfile.objects.filter(user=user).first()

    qs = HealthRecord.objects.filter(user=user, record_type="prenatal_exam")
    if target_mother:
        qs = qs.filter(mother=target_mother)
    if exclude_record_id:
        qs = qs.exclude(id=exclude_record_id)

    existing_records = list(qs.order_by("record_date", "created_at"))
    if not existing_records:
        return True, ""

    # 解析现有记录的阶段与孕周/产后月龄
    parsed_existing = []
    for r in existing_records:
        items = r.exam_items if isinstance(r.exam_items, dict) else {}
        r_stage = items.get("stage") or ("pregnancy" if r.gestational_week else "pregnancy")
        r_week = r.gestational_week
        r_days = items.get("gestational_days") or 0
        r_post_m = items.get("postpartum_months")
        parsed_existing.append({
            "id": r.id,
            "date": r.record_date,
            "stage": r_stage,
            "week": r_week,
            "days": r_days,
            "postpartum_months": r_post_m,
        })

    # ================= 规则分支 1：当前准备录入 pregnancy (全孕期) =================
    if stage_type == "pregnancy":
        cur_week = gestational_week or 20
        lmp = record_date - timedelta(days=cur_week * 7 + (gestational_days or 0))
        edd = lmp + timedelta(days=FULL_PREGNANCY_DAYS)
        cycle_start = lmp - timedelta(days=14)
        cycle_end = edd + timedelta(days=42)

        for ex in parsed_existing:
            ex_date = ex["date"]

            # 1.1 与已有非孕期 (general) 冲突：仅在同一孕期周期 [LMP - 14天, EDD + 14天] 拦截（批量导入且用户确认时豁免）
            if ex["stage"] == "general" and not allow_cross_stage:
                if lmp <= ex_date <= (edd + timedelta(days=7)):
                    return False, (
                        f"阶段类型时序冲突：本次录入为孕{cur_week}周，推算整个孕期为 {lmp} 至 {edd}，"
                        f"但该周期内的 {ex_date} 已存在「非孕期/备孕」记录。请核对测量日期或阶段类型。"
                    )

            # 1.2 与已有产后 (postpartum) 冲突：仅在同一孕期周期内 [LMP - 14天, EDD - 21天] 拦截（批量导入且用户确认时豁免）
            # 早于 cycle_start 的产后记录属于上一胎大宝的产后，完全允许共存！
            elif ex["stage"] == "postpartum" and not allow_cross_stage:
                if lmp <= ex_date <= (edd - timedelta(days=21)):
                    return False, (
                        f"阶段类型时序冲突：本次录入为孕{cur_week}周（预产期推算为 {edd}），"
                        f"但在该孕期内的 {ex_date} 已记录为「产后」恢复期。宝宝尚未分娩，不能在孕期内记录产后。"
                    )

            # 1.3 孕周时序推进与倒流校验：仅对相差小于 300 天的同一胎孕期记录进行时序比对（批量导入且用户确认时豁免）
            elif ex["stage"] == "pregnancy" and ex["week"]:
                if not allow_cross_stage and abs((record_date - ex_date).days) <= CYCLE_WINDOW_DAYS:
                    ex_week = ex["week"]
                    if record_date > ex_date:
                        if cur_week < ex_week - 1:
                            return False, (
                                f"孕周时序矛盾：{record_date} 填写的孕 {cur_week} 周比同周期的 {ex_date}（孕 {ex_week} 周）反而倒退。请核对孕周数值。"
                            )
                        delta_d = (record_date - ex_date).days
                        theo_gain = delta_d // 7
                        if (cur_week - ex_week) > theo_gain + 3 and delta_d < 30:
                            return False, (
                                f"孕周增长异常：从 {ex_date} 到 {record_date} 仅相隔 {delta_d} 天，"
                                f"孕周从 {ex_week} 周突增到 {cur_week} 周（理论增长约 {theo_gain} 周）。请核对孕周数值。"
                            )
                    elif record_date < ex_date:
                        if cur_week > ex_week + 1:
                            return False, (
                                f"孕周时序矛盾：{record_date} 填写的孕 {cur_week} 周比同周期后续的 {ex_date}（孕 {ex_week} 周）更大。请核对孕周数值。"
                            )

    # ================= 规则分支 2：当前准备录入 general (非孕期/备孕) =================
    elif stage_type == "general":
        if allow_cross_stage:
            return True, ""
        for ex in parsed_existing:
            if ex["stage"] == "pregnancy" and ex["week"]:
                ex_week = ex["week"]
                lmp = ex["date"] - timedelta(days=ex_week * 7 + (ex["days"] or 0))
                edd = lmp + timedelta(days=FULL_PREGNANCY_DAYS)
                # 落在已知孕期区间内
                if lmp <= record_date <= (edd + timedelta(days=7)):
                    return False, (
                        f"阶段类型时序冲突：{record_date} 处于已有孕期周期（基于 {ex['date']} 孕{ex_week}周推算为 {lmp} 至 {edd}）内，"
                        f"在同一个孕育周期内不能录入「非孕期/备孕」记录。请核对测量日期或阶段类型。"
                    )

    # ================= 规则分支 3：当前准备录入 postpartum (产后恢复期) =================
    elif stage_type == "postpartum":
        if allow_cross_stage:
            return True, ""
        for ex in parsed_existing:
            if ex["stage"] == "pregnancy" and ex["week"]:
                ex_week = ex["week"]
                lmp = ex["date"] - timedelta(days=ex_week * 7 + (ex["days"] or 0))
                edd = lmp + timedelta(days=FULL_PREGNANCY_DAYS)
                # 仅在同一胎孕期内 [LMP - 14天, EDD - 21天] 拦截（早于 LMP - 14天的属于上一胎产后，不冲突）
                if lmp <= record_date < (edd - timedelta(days=21)):
                    days_to_edd = (edd - record_date).days
                    return False, (
                        f"阶段类型时序冲突：基于 {ex['date']} 孕{ex_week}周记录，该胎预产期应为 {edd}（距此记录还有 {days_to_edd} 天），"
                        f"该孕育周期在此日期宝宝尚未分娩，不能记录为「产后」状态。若宝宝已早产分娩，请核对预产期与出生日期。"
                    )
                # 同一胎孕育周期内，产后记录早于孕期产检记录
                if lmp <= record_date < ex["date"]:
                    return False, (
                        f"阶段类型时序冲突：{record_date} 标记为产后，但在同孕育周期的后续日期 {ex['date']} 却存在孕{ex_week}周记录。分娩产后之后不能出现同周期更晚的孕期打卡。"
                    )

    return True, ""
