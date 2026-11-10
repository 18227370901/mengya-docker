import React from "react";
import { X, BookOpen, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";

interface DocGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DocGuideModal({ isOpen, onClose }: DocGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">外部接口端点协议与接入规范</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">了解系统支持的天气、历法与公网搜索接口接入规范</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-gray-600 dark:text-gray-300">
          {/* Section 1: Weather Service Dual-Mode */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white text-xs">1</span>
              <span>天气预报服务：双模驱动与协议适配</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-7">
              <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300 text-xs mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>模式 A：标准多日全功能源 (如 Open-Meteo)</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  提供15天逐日预报、最高/最低温折线走势图、日出日落、降水概率、紫外线指数。<br />
                  <b>入参：</b>latitude, longitude, daily...<br />
                  <b>前端展示：</b>完整呈现15天趋势折线图与逐日卡片网格。
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300 text-xs mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>模式 B：国内即时实况源 (如 UAPIS / 轻量API)</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  提供即时气温、湿度、天气现象、风力风向。<br />
                  <b>如 UAPIS：</b><code>https://uapis.cn/api/v1/misc/weather?city=北京</code><br />
                  <b>前端展示：</b>系统自动切换为【实时实况精细看板】，平滑展示当前气温与育儿建议，不显示折线图。
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Authentication Types */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white text-xs">2</span>
              <span>API Key 与凭据鉴权配置说明</span>
            </div>
            <div className="pl-7 space-y-2 text-xs">
              <p>系统支持四种通用安全认证机制，配置后系统请求外部接口时将自动注入鉴权信息：</p>
              <ul className="list-disc pl-4 space-y-1 text-gray-500 dark:text-gray-400">
                <li><b>无需认证 (none)：</b>适用于开放免费公共接口（如 Open-Meteo、UAPIS 免费版、Timor）。</li>
                <li><b>Bearer Token (bearer)：</b>在请求头注入 <code>Authorization: Bearer &lt;token&gt;</code>。</li>
                <li><b>Header 请求头 (header)：</b>在请求头注入自定义参数（如 <code>X-API-Key: &lt;key&gt;</code>）。</li>
                <li><b>Query URL 参数 (query)：</b>在 URL 请求参数中注入（如 <code>?key=&lt;key&gt;</code> 或 <code>?apikey=...</code>，如和风天气、高德开放平台）。</li>
              </ul>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-[11px] text-gray-500 flex items-start gap-1.5">
                <AlertCircle className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
                <span>安全脱敏机制：已保存的 API Key 密文前端会自动显示为 <code>sk-****8848</code> 样式，保存未修改字段时自动保留原密钥明文，防止凭据泄露。</span>
              </div>
            </div>
          </div>

          {/* Section 3: Holiday Calendar */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white text-xs">3</span>
              <span>法定节假日日历 API 规范</span>
            </div>
            <div className="pl-7 text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>日历接口默认支持 <code>{'{年份}'}</code> 动态占位符（例如 <code>https://timor.tech/api/holiday/year/</code>）。系统在查询当年度法定休假与调休工作日时，将自动注入目标年份。</p>
            </div>
          </div>
          {/* Section 4: Daily Saying Service */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white text-xs">4</span>
              <span>每日一言名句服务与协议自适应规范</span>
            </div>
            <div className="pl-7 text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
              <p>系统首页引导卡片专属每日一言展示，支持有序端点故障转移与进程级 1 小时缓存（全站共享一句）：</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><b>Hitokoto 一言开放源：</b>支持 <code>https://v1.hitokoto.cn</code>（免密，自适应解析 hitokoto、from、from_who）；</li>
                <li><b>UApis 名言源：</b>支持 <code>https://uapis.cn/api/v1/saying</code>（免密，自适应解析 text 字段）；</li>
                <li><b>纯文本及任意第三方 JSON：</b>内置智能自适应解析器，兼容 <code>text/plain</code> 纯文本或包含 content、saying、quote 字段的私有 API。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
