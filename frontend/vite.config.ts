import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = process.env.BACKEND_URL || env.BACKEND_URL || "http://localhost:5173";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    // v1.57 构建瘦身：大体积依赖独立分包——echarts / react 全家桶 / 路由 /
    // PDF 工具链（jspdf+html2canvas 动态加载，报告导出时才下载）各自独立 chunk，
    // 首屏 index 主包显著减负，长缓存下二次访问直接命中厂商包缓存。
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules")) {
              if (id.includes("echarts") || id.includes("zrender")) return "echarts";
              if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf-tools";
              // 注意顺序：react-router 必须先于 react 判断（路由包 id 含 "react" 字样）
              if (id.includes("react-router") || id.includes("@remix-run")) return "router";
              if (id.includes("react") || id.includes("scheduler") || id.includes("zustand")) return "react-vendor";
              if (id.includes("axios")) return "axios";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      // 允许所有外部域名访问（部署在服务器上通过域名/反向代理访问时需要）
      allowedHosts: true,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
