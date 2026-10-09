export interface BabyAgeResult {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalDays: number;
  ageDisplay: string;
}

/**
 * 精准计算宝宝年龄：X岁X个月X天（总月龄）
 * 格式规范：
 * 1. 满1周岁以上：X岁X个月X天（总月龄个月），例如：2岁8个月5天（32个月），整岁整月自适应精简（如：1岁整（12个月）、1岁零5天（12个月））；
 * 2. 1个月~1周岁：X个月X天，例如：8个月5天，整月显示 X个月整；
 * 3. 未满月（新生儿期）：X天。
 */
export function calculateBabyAge(birthDateStr: string, todayDate?: Date): BabyAgeResult {
  if (!birthDateStr) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalMonths: 0,
      totalDays: 0,
      ageDisplay: '',
    };
  }

  const [by, bm, bd] = birthDateStr.split('-').map(Number);
  const today = todayDate ? new Date(todayDate) : new Date();
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();

  const birth = new Date(by, bm - 1, bd);
  const now = new Date(ty, tm - 1, td);
  if (now.getTime() < birth.getTime()) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalMonths: 0,
      totalDays: 0,
      ageDisplay: '尚未出生',
    };
  }

  let years = ty - by;
  let months = tm - bm;
  let days = td - bd;

  if (days < 0) {
    months -= 1;
    const prevMonthDays = new Date(ty, tm - 1, 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  const totalDays = Math.round((now.getTime() - birth.getTime()) / 86400000);

  let ageDisplay = '';
  if (years > 0) {
    const parts: string[] = [years + '岁'];
    if (months > 0) {
      parts.push(months + '个月');
    } else if (days > 0) {
      parts.push('零');
    }
    if (days > 0) {
      parts.push(days + '天');
    } else if (months === 0) {
      parts.push('整');
    }
    ageDisplay = parts.join('') + '（' + totalMonths + '个月）';
  } else if (totalMonths > 0) {
    ageDisplay = days > 0 ? (totalMonths + '个月' + days + '天') : (totalMonths + '个月整');
  } else {
    ageDisplay = totalDays + '天';
  }

  return {
    years,
    months,
    days,
    totalMonths,
    totalDays,
    ageDisplay,
  };
}

export interface PregnancyProgressResult {
  valid: boolean;
  weeks: number;
  remDays: number;
  daysPregnant: number;
  diffDays: number;
  weekDaysText: string;
  message: string;
}

/**
 * 精准计算孕周与剩余天数：孕X周X天
 * 全孕期医学标准 280 天（40周）。
 */
export function calculatePregnancyProgress(dueDateStr: string, todayDate?: Date): PregnancyProgressResult {
  if (!dueDateStr) {
    return {
      valid: false,
      weeks: 0,
      remDays: 0,
      daysPregnant: 0,
      diffDays: 0,
      weekDaysText: '',
      message: '',
    };
  }

  const [dy, dm, dd] = dueDateStr.split('-').map(Number);
  const today = todayDate ? new Date(todayDate) : new Date();
  const due = new Date(dy, dm - 1, dd);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffDays = Math.round((due.getTime() - now.getTime()) / 86400000);

  if (diffDays > 305) {
    return {
      valid: false,
      weeks: 0,
      remDays: 0,
      daysPregnant: 0,
      diffDays,
      weekDaysText: '',
      message: '⚠️ 预产期超出正常怀孕周期（距离当前时间不应超过10个月/约300天）',
    };
  }
  if (diffDays < -30) {
    return {
      valid: false,
      weeks: 0,
      remDays: 0,
      daysPregnant: 0,
      diffDays,
      weekDaysText: '',
      message: '⚠️ 预产期已过去较久，若宝宝已出生请切换至「宝宝已出生」',
    };
  }

  if (diffDays < 0) {
    const daysOver = Math.abs(diffDays);
    return {
      valid: true,
      weeks: 40,
      remDays: daysOver,
      daysPregnant: 280 + daysOver,
      diffDays,
      weekDaysText: '孕40周+' + daysOver + '天',
      message: '💡 预产期已过 ' + daysOver + ' 天（孕40周+' + daysOver + '天）',
    };
  }

  const daysPregnant = 280 - diffDays;
  const weeks = Math.max(0, Math.min(40, Math.floor(daysPregnant / 7)));
  const remDays = Math.max(0, daysPregnant % 7);
  const weekDaysText = '孕' + weeks + '周' + remDays + '天';

  return {
    valid: true,
    weeks,
    remDays,
    daysPregnant,
    diffDays,
    weekDaysText,
    message: '💡 推算当前处于：' + weekDaysText + '（距预产期还有 ' + diffDays + ' 天）',
  };
}
