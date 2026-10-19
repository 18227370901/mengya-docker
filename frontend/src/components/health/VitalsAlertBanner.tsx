import { AlertTriangle, AlertCircle, Info, PhoneCall } from "lucide-react";
import type { MedicalAlert } from "@/types/health";

interface VitalsAlertBannerProps {
  alerts: MedicalAlert[];
}

export default function VitalsAlertBanner({ alerts }: VitalsAlertBannerProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert, idx) => {
        const isDanger = alert.level === "danger";
        const isWarning = alert.level === "warning";

        return (
          <div
            key={alert.code || idx}
            className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all ${
              isDanger
                ? "border-rose-300 bg-gradient-to-r from-rose-50 via-red-50/60 to-rose-100/40 text-rose-950 dark:border-rose-900/60 dark:from-rose-950/40 dark:to-rose-900/20 dark:text-rose-200"
                : isWarning
                ? "border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50/60 to-amber-100/40 text-amber-950 dark:border-amber-900/60 dark:from-amber-950/40 dark:to-amber-900/20 dark:text-amber-200"
                : "border-sky-300 bg-gradient-to-r from-sky-50 via-blue-50/60 to-sky-100/40 text-sky-950 dark:border-sky-900/60 dark:from-sky-950/40 dark:to-sky-900/20 dark:text-sky-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  isDanger
                    ? "bg-rose-500 text-white shadow-rose-200 shadow-md"
                    : isWarning
                    ? "bg-amber-500 text-white shadow-amber-200 shadow-md"
                    : "bg-sky-500 text-white shadow-sky-200 shadow-md"
                }`}
              >
                {isDanger ? (
                  <AlertCircle className="h-5 w-5 animate-pulse" />
                ) : isWarning ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Info className="h-5 w-5" />
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold tracking-tight">
                    {alert.title}
                  </h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      isDanger
                        ? "bg-rose-200 text-rose-800 dark:bg-rose-900/80 dark:text-rose-200"
                        : isWarning
                        ? "bg-amber-200 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200"
                        : "bg-sky-200 text-sky-800 dark:bg-sky-900/80 dark:text-sky-200"
                    }`}
                  >
                    {isDanger ? "急症高危预警" : isWarning ? "临床重点关注" : "健康监测提示"}
                  </span>
                </div>

                <p className="text-xs leading-relaxed opacity-90">
                  {alert.description}
                </p>

                {alert.action_advice && (
                  <div
                    className={`mt-2 flex items-start gap-2 rounded-xl p-2.5 text-xs font-medium ${
                      isDanger
                        ? "bg-rose-100/80 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100"
                        : isWarning
                        ? "bg-amber-100/80 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                        : "bg-sky-100/80 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"
                    }`}
                  >
                    <span className="shrink-0 font-bold">👉 临床处置指导：</span>
                    <span className="flex-1 leading-relaxed">{alert.action_advice}</span>
                  </div>
                )}
              </div>
            </div>

            {isDanger && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm">
                <span className="flex items-center gap-1.5">
                  <PhoneCall className="h-4 w-4" />
                  若伴有视物模糊、上腹剧痛或剧烈头痛，请立即就近就医
                </span>
                <span className="rounded bg-white/20 px-2 py-0.5 text-[11px]">产科急诊指征</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
