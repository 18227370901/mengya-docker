import { useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2, Mail, MailOpen } from "lucide-react";
import api from "@/api/client";
import type { ApiResponse } from "@/types";

interface NotificationItem {
  id: number;
  notification_type: string;
  title: string;
  content: string;
  link?: string | null;
  extra_data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  vaccine: { label: "疫苗提醒", color: "bg-blue-50 text-blue-500" },
  exam: { label: "产检提醒", color: "bg-pink-50 text-pink-500" },
  milestone: { label: "成长里程碑", color: "bg-amber-50 text-amber-500" },
  shopping: { label: "购物提醒", color: "bg-green-50 text-green-500" },
  system: { label: "系统消息", color: "bg-gray-100 text-gray-500" },
  ai: { label: "AI推荐", color: "bg-purple-50 text-purple-500" },
};

export default function NotificationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const load = () => {
    setLoading(true);
    api.get<ApiResponse<NotificationItem[]>>("/notifications/")
      .then((r) => setNotifications(r.data.data))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/mark_read/`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {
      showToast("操作失败");
    }
  };

  const readAll = async () => {
    try {
      await api.post("/notifications/read_all/");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      showToast("已全部标记已读");
    } catch {
      showToast("操作失败");
    }
  };

  const filtered = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-brand-400 to-orange-400 p-2.5 text-white">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">通知中心</h1>
            <p className="text-xs text-gray-400">
              {unreadCount > 0 ? `${unreadCount} 条未读消息` : "所有消息已读"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            className="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-500 transition hover:bg-brand-100"
            onClick={readAll}
          >
            <CheckCheck className="h-4 w-4" /> 全部已读
          </button>
        )}
      </div>

      {/* 筛选 */}
      <div className="flex gap-2">
        <button
          className={`rounded-xl px-4 py-1.5 text-sm transition ${filter === "all" ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"}`}
          onClick={() => setFilter("all")}
        >
          全部 ({notifications.length})
        </button>
        <button
          className={`rounded-xl px-4 py-1.5 text-sm transition ${filter === "unread" ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"}`}
          onClick={() => setFilter("unread")}
        >
          未读 ({unreadCount})
        </button>
      </div>

      {/* 通知列表 */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Bell className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-3 text-sm text-gray-400">
            {filter === "unread" ? "没有未读消息" : "暂无通知消息"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const meta = TYPE_LABELS[n.notification_type] || TYPE_LABELS.system;
            return (
              <div
                key={n.id}
                className={`card transition ${!n.is_read ? "border-l-4 border-l-brand-400" : "opacity-70"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${meta.color}`}>
                    {n.is_read ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${meta.color}`}>{meta.label}</span>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                    </div>
                    <h3 className="mt-1.5 font-medium text-gray-800">{n.title}</h3>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">{n.content}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-300">
                        {new Date(n.created_at).toLocaleString("zh-CN")}
                      </span>
                      {!n.is_read && (
                        <button
                          className="text-xs text-brand-500 hover:underline"
                          onClick={() => markRead(n.id)}
                        >
                          标记已读
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
