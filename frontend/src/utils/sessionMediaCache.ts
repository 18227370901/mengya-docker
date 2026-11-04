/**
 * sessionMediaCache.ts — 会话级媒体与图片缓存管理器
 * 
 * 核心目标:
 *   1. 解决三方平台管理页/中转页外部 Logo 反复发起网络拉取的性能与网络消耗痛点;
 *   2. 用户登录期间利用内存 Map 与 sessionStorage 长效保留, 页面路由切换 0 请求、0 毫秒呈现;
 *   3. 用户退出登录时, 由 authStore.logout() 调用 clearSessionMediaCache() 彻底销毁清空;
 *   4. 支持 CORS / 防盗链兜底: 直连拉取失败时自动降级走后端安全代理中转端点 /api/v1/platforms/proxy-icon/。
 */

import { useEffect, useState } from "react";

const STORAGE_PREFIX = "mengya_session_media_";
const memoryCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string | null>>();
const failedUrls = new Set<string>();

/** 简易字符串哈希, 用于 sessionStorage Key 缩短 */
function hashKey(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** 彻底清空所有会话媒体缓存 (退出登录时调用) */
export function clearSessionMediaCache(): void {
  memoryCache.clear();
  inFlightRequests.clear();
  failedUrls.clear();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // 忽略异常
  }
}

/** 获取已缓存的图片 DataURL / ObjectURL */
export async function getCachedMedia(url?: string): Promise<string | null> {
  if (!url || !url.trim()) return null;
  const targetUrl = url.trim();

  // 1. 本地相对路径或已为 DataURL 直接返回
  if (targetUrl.startsWith("data:") || targetUrl.startsWith("/") || targetUrl.startsWith("blob:")) {
    return targetUrl;
  }

  // 2. 内存命中
  if (memoryCache.has(targetUrl)) {
    return memoryCache.get(targetUrl)!;
  }

  // 3. 已知失败跳过
  if (failedUrls.has(targetUrl)) {
    return null;
  }

  // 4. sessionStorage 命中
  const storageKey = STORAGE_PREFIX + hashKey(targetUrl);
  try {
    const cachedData = sessionStorage.getItem(storageKey);
    if (cachedData) {
      memoryCache.set(targetUrl, cachedData);
      return cachedData;
    }
  } catch {
    // 忽略 sessionStorage 访问限制
  }

  // 5. 若已有正在进行的网络请求，合并等待
  if (inFlightRequests.has(targetUrl)) {
    return inFlightRequests.get(targetUrl)!;
  }

  // 6. 执行拉取与转换 DataURL
  const fetchPromise = (async () => {
    try {
      let blob: Blob | null = null;

      // 首先尝试浏览器端直接 CORS 拉取
      try {
        const resp = await fetch(targetUrl, { mode: "cors", credentials: "omit" });
        if (resp.ok) {
          blob = await resp.blob();
        }
      } catch {
        // 直接拉取受限（CORS / 防盗链），转走后端安全代理端点
      }

      // 后端安全代理兜底
      if (!blob) {
        const token = localStorage.getItem("mengya_access");
        const proxyUrl = `/api/v1/platforms/proxy-icon/?url=${encodeURIComponent(targetUrl)}`;
        const headers: HeadersInit = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const resp = await fetch(proxyUrl, { headers });
        if (resp.ok) {
          blob = await resp.blob();
        }
      }

      if (!blob) {
        failedUrls.add(targetUrl);
        return null;
      }

      // 转换为 Base64 Data URL 存储
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob!);
      });

      // 写入内存与 sessionStorage
      memoryCache.set(targetUrl, dataUrl);
      try {
        sessionStorage.setItem(storageKey, dataUrl);
      } catch {
        // sessionStorage 配额不足时平滑降级为纯内存缓存
      }

      return dataUrl;
    } catch {
      failedUrls.add(targetUrl);
      return null;
    } finally {
      inFlightRequests.delete(targetUrl);
    }
  })();

  inFlightRequests.set(targetUrl, fetchPromise);
  return fetchPromise;
}

/** React Hook: 便捷获取会话缓存图片 */
export function useSessionImage(url?: string): { src: string | null; loading: boolean; failed: boolean } {
  const [src, setSrc] = useState<string | null>(() => {
    if (!url) return null;
    if (url.startsWith("data:") || url.startsWith("/")) return url;
    if (memoryCache.has(url)) return memoryCache.get(url)!;
    try {
      const cached = sessionStorage.getItem(STORAGE_PREFIX + hashKey(url));
      if (cached) {
        memoryCache.set(url, cached);
        return cached;
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(!src && Boolean(url));
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!url) {
      setSrc(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    if (src && !src.startsWith("http")) {
      return;
    }

    let active = true;
    setLoading(true);
    setFailed(false);

    getCachedMedia(url).then((dataUrl) => {
      if (!active) return;
      if (dataUrl) {
        setSrc(dataUrl);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [url]);

  return { src, loading, failed };
}
