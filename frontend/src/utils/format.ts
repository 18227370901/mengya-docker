/**
 * 全站数值紧凑格式化工具（v2.07 强化：淘宝风格大数紧凑显示与千分位提示）
 */
export function formatCompactCount(count: number | undefined | null): string {
  if (count === undefined || count === null || isNaN(count) || count <= 0) {
    return "";
  }
  if (count < 1000) {
    return String(count);
  }
  if (count < 10000) {
    const k = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return `${k}k`;
  }
  if (count < 100000) {
    const w = (count / 10000).toFixed(1).replace(/\.0$/, "");
    return `${w}万`;
  }
  if (count < 1000000) {
    const w = Math.floor(count / 10000);
    return `${w}万+`;
  }
  return "100万+";
}

/**
 * 完整千分位格式化（用于 Tooltip / 悬浮详情提示）
 */
export function formatFullCount(count: number | undefined | null): string {
  if (count === undefined || count === null || isNaN(count)) {
    return "0";
  }
  return Number(count).toLocaleString("zh-CN");
}
