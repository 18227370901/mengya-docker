import axios, { type InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
});

// 重定向防刷锁
let isRedirecting = false;

// 请求拦截：附加 JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mengya_access");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：统一解包 + 重试 + 401 单例处理
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body.code === "number" && body.code !== 0) {
      const err = new Error(body.message || "请求失败") as Error & {
        code?: number;
        data?: unknown;
        response?: any;
      };
      err.code = body.code;
      err.data = body.data;
      err.response = response;
      return Promise.reject(err);
    }
    return response;
  },
  async (error) => {
    const config = error.config as (InternalAxiosRequestConfig & { _hasRetried?: boolean }) | undefined;

    // 弱网自愈：仅针对未取消的 GET 请求遇到 502/503/504 或超时时平滑重试 1 次
    if (
      config &&
      config.method?.toLowerCase() === "get" &&
      !axios.isCancel(error) &&
      !config._hasRetried
    ) {
      const status = error.response?.status;
      if (status === 502 || status === 503 || status === 504 || error.code === "ECONNABORTED") {
        config._hasRetried = true;
        await new Promise((resolve) => setTimeout(resolve, 600));
        return api(config);
      }
    }

    if (error.response?.status === 401) {
      const errCode = error.response?.data?.code;
      if (!isRedirecting && !window.location.pathname.startsWith("/login")) {
        isRedirecting = true;
        localStorage.removeItem("mengya_access");
        localStorage.removeItem("mengya_refresh");
        if (errCode === 1003) {
          sessionStorage.setItem("mengya_kicked", "1");
          window.location.href = "/login?kicked=1";
        } else {
          window.location.href = "/login";
        }
        setTimeout(() => {
          isRedirecting = false;
        }, 3000);
      }
    }

    const msg = error.response?.data?.message || error.message || "网络错误";
    const err = new Error(msg) as Error & {
      code?: number;
      data?: unknown;
      response?: any;
    };
    const rawCode = error.response?.data?.code;
    const numCode = rawCode === undefined || rawCode === null ? undefined : Number(rawCode);
    err.code = Number.isNaN(numCode) ? undefined : numCode;
    err.data = error.response?.data?.data;
    err.response = error.response;
    return Promise.reject(err);
  }
);

export default api;
