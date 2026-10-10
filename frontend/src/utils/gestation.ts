/**
 * v1.58 孕周推算前端共享工具（与后端 gestation_engine.py 双基准模型保持一致）
 * 基准1：档案预产期（280 天医学模型，最高优先级）
 * 基准2：用户首次孕期打卡锚点（日期 + 孕周）线性外推
 * 展示粒度：孕X周 / 孕X周Y天
 */

const FULL_PREGNANCY_DAYS = 280;

export interface GestationAnchor {
  /** 锚点日期 YYYY-MM-DD */
  date: string;
  /** 锚点孕周（整周数） */
  week: number;
}

export interface GestationResult {
  week: number;
  days: number;
  /** 展示标签：孕X周 或 孕X周Y天 */
  label: string;
}

/** 依据锚点（预产期即 week=40 的锚点）推算指定日期的孕周与周内天数 */
export function computeGestation(anchor: GestationAnchor, recordDate: string): GestationResult | null {
  const anchorTs = new Date(anchor.date).getTime();
  const recTs = new Date(recordDate).getTime();
  if (Number.isNaN(anchorTs) || Number.isNaN(recTs)) return null;
  const lmp = anchorTs - anchor.week * 7 * 86400000;
  const days = Math.floor((recTs - lmp) / 86400000);
  if (days < 0) return { week: 0, days: 0, label: gestationLabel(0, 0) };
  if (days >= FULL_PREGNANCY_DAYS) {
    // 超过预产期：40 周封顶 + 超期天数
    const over = days - FULL_PREGNANCY_DAYS;
    return { week: 40, days: over, label: gestationLabel(40, over) };
  }
  const week = Math.floor(days / 7);
  const rem = days % 7;
  return { week, days: rem, label: gestationLabel(week, rem) };
}

/** 统一孕周展示文案：孕X周 / 孕X周Y天（days 为空或 0 时仅显示整周） */
export function gestationLabel(week: number | null | undefined, days?: number | null): string {
  if (week == null) return "孕期";
  return days != null && days > 0 ? `孕${week}周${days}天` : `孕${week}周`;
}

/**
 * 从妈妈时序/健康记录中提取最早的孕期孕周锚点（与后端 first_anchor 查询口径一致：
 * 最早一条 gestational_week 有效（>0）的 prenatal_exam 记录；阶段不限——
 * 产后/非孕期记录的 gestational_week 为空自然不参与）。
 */
export function extractGestationAnchor<
  T extends { record_date: string; gestational_week?: number | null; record_type: string },
>(records: T[]): GestationAnchor | null {
  const candidates = records
    .filter((r) => r.record_type === "prenatal_exam" && r.gestational_week != null && r.gestational_week > 0)
    .sort((a, b) => (a.record_date < b.record_date ? -1 : a.record_date > b.record_date ? 1 : 0));
  const first = candidates[0];
  if (!first) return null;
  return { date: first.record_date, week: first.gestational_week as number };
}
