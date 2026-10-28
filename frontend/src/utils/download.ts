/**
 * v1.88.1 公共 Blob 下载工具
 *
 * 修复：此前各页面在 a.click() 后立即 revokeObjectURL，浏览器尚未开始读取
 * blob URL 就被释放，大文件（如知识库 CSV 导出）会下载出 0 字节或截断文件。
 * 此处统一延迟释放，确保下载流完成后再回收内存。
 */

/**
 * 触发浏览器下载指定 Blob，并安全延迟释放 ObjectURL
 * @param blob   响应 Blob（CSV/图片等）
 * @param filename 下载保存的文件名（不含扩展名时按 blob 类型补全，一般由调用方带全）
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // 延迟释放：等浏览器把 blob 完整读取后再回收，避免大文件下载被截断
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 30_000);
}
