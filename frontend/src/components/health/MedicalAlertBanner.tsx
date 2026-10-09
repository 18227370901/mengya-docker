import { AlertOctagon, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import type { MedicalAlert } from "@/types/health";

interface MedicalAlertBannerProps {
  alerts: MedicalAlert[];
}

export default function MedicalAlertBanner({ alerts }: MedicalAlertBannerProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 transition dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h4 className="text-sm font-semibold">【医学评估正常】未发现高危孕产代谢或增重异常征象</h4>
            <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              各项指标符合国家卫健委 WS/T 801-2022 推荐走势，请继续保持健康均衡膳食与规律产检。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, idx) => {
        const isDanger = alert.level === "danger";
        const isWarning = alert.level === "warning";

        const bgClass = isDanger
          ? "border-red-200 bg-red-50/90 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          : isWarning
          ? "border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          : "border-blue-200 bg-blue-50/90 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200";

        const iconColor = isDanger
          ? "text-red-600 dark:text-red-400"
          : isWarning
          ? "text-amber-600 dark:text-amber-400"
          : "text-blue-600 dark:text-blue-400";

        const IconComponent = isDanger ? AlertOctagon : isWarning ? AlertTriangle : Info;

        return (
          <div
            key={alert.code || idx}
            className={`${bgClass} rounded-2xl border p-4 shadow-sm transition`}
          >
            <div className="flex items-start gap-3">
              <IconComponent className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconColor}`} />
              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold tracking-tight">{alert.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${iconColor}`}
                  >
                    {isDanger ? "临床高度关注" : isWarning ? "指标偏离预警" : "关怀提示"}
                  </span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">{alert.description}</p>
                <div className="mt-2 rounded-xl bg-white/70 p-2.5 text-xs font-medium text-gray-800 shadow-xs dark:bg-gray-900/70 dark:text-gray-200">
                  <span className="font-bold text-brand-600 dark:text-brand-400">【医生处置建议】：</span>
                  {alert.action_advice}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
