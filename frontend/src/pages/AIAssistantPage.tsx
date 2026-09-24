import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot,
  Check,
  Loader2,
  MessageSquare,
  Plus,
  SendHorizonal,
  Sparkles,
  Trash2,
  User,
  Pencil,
  X,
} from "lucide-react";
import { aiApi } from "@/api/services";
import { useChatStore } from "@/store/chatStore";
import type { ChatSessionSummary } from "@/types";
import CopyButton from "@/components/CopyButton";

interface ChatData {
  response: string;
  used_openai?: boolean;
  used_config_name?: string;
  used_search?: boolean;
  error_hint?: string;
  session_id?: number;
  session_title?: string;
}

const DEFAULT_SUGGESTIONS = [
  "待产包需要准备哪些东西？",
  "孕期每周需要补充什么营养？",
  "婴儿床怎么选更安全？",
  "顺产和剖宫产待产包有什么区别？",
];

export default function AIAssistantPage() {
  const {
    messages,
    activeSessionId,
    sessions,
    loaded,
    setMessages,
    addMessage,
    setActiveSessionId,
    setSessions,
    upsertSession,
    removeSession,
    setLoaded,
    clearMessages,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" }>({ msg: "", type: "success" });
  const bottomRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 2500);
  };

  // 首次加载：拉取会话列表
  useEffect(() => {
    aiApi.suggestions().then(setSuggestions).catch(() => {});
    if (!loaded) {
      aiApi.sessions().then((list) => {
        setSessions(list);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 点击侧边栏某个会话 → 加载该会话消息
  const selectSession = useCallback(async (id: number) => {
    if (id === activeSessionId) return;
    setActiveSessionId(id);
    setMessages([]);
    try {
      const detail = await aiApi.sessionDetail(id);
      const msgs = detail.messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages(msgs);
    } catch {
      // 静默失败
    }
  }, [activeSessionId, setActiveSessionId, setMessages]);

  // 新建会话
  const newChat = useCallback(() => {
    clearMessages();
  }, [clearMessages]);

  // 发送消息
  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    addMessage({ role: "user", content: q });
    setLoading(true);
    try {
      const data = await aiApi.chat(q, activeSessionId ?? undefined) as ChatData;
      addMessage({ role: "ai", content: data.response });

      // 更新 activeSessionId
      if (data.session_id && data.session_id !== activeSessionId) {
        setActiveSessionId(data.session_id);
      }

      // 刷新侧边栏会话列表（只更新当前会话摘要 + 排序）
      if (data.session_id) {
        try {
          const updatedSessions = await aiApi.sessions();
          setSessions(updatedSessions);
        } catch {
          // 静默失败
        }
      }
    } catch {
      addMessage({ role: "ai", content: "抱歉，我暂时无法回答，请稍后再试。" });
    } finally {
      setLoading(false);
    }
  };

  // 开始重命名
  const startRename = (s: ChatSessionSummary) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  };

  // 确认重命名
  const confirmRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    try {
      const result = await aiApi.sessionRename(renamingId, renameValue.trim());
      upsertSession({ ...sessions.find((s) => s.id === renamingId)!, title: result.title });
      showToast("重命名成功");
    } catch {
      showToast("重命名失败，请稍后重试", "error");
    }
    setRenamingId(null);
    setRenameValue("");
  };

  // 确认删除
  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await aiApi.sessionDelete(confirmDeleteId);
      removeSession(confirmDeleteId);
      if (confirmDeleteId === activeSessionId) {
        clearMessages();
      }
      showToast("会话已删除");
    } catch {
      showToast("删除失败，请稍后重试", "error");
    }
    setConfirmDeleteId(null);
  };

  return (
    <div className="mx-auto flex gap-3" style={{ height: "calc(100vh - 180px)" }}>
      {/* 侧边栏：会话列表 */}
      <div
        className={`flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
          <span className="text-sm font-semibold text-gray-600">会话列表</span>
          <button
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs text-white transition hover:bg-brand-600"
            onClick={newChat}
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-gray-300">暂无历史会话</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group mb-1 cursor-pointer rounded-xl px-3 py-2.5 transition ${
                s.id === activeSessionId ? "bg-brand-50" : "hover:bg-gray-50"
              }`}
              onClick={() => selectSession(s.id)}
            >
              {renamingId === s.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-brand-200 px-2 py-1 text-xs outline-none dark:border-brand-800 dark:bg-gray-800 dark:text-gray-100"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                    }}
                  />
                  <button onClick={confirmRename} className="text-green-500 hover:text-green-600">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { setRenamingId(null); setRenameValue(""); }} className="text-gray-400 hover:text-gray-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-medium ${s.id === activeSessionId ? "text-brand-600" : "text-gray-600"}`}>
                        {s.title}
                      </p>
                      {s.last_message && (
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">
                          {s.last_message}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        onClick={(e) => { e.stopPropagation(); startRename(s); }}
                        title="重命名"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                        title="删除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-0.5 text-[10px] text-gray-300">
                    {s.message_count} 条消息
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 折叠/展开侧边栏按钮 */}
      <button
        className="mt-2 flex h-8 w-5 shrink-0 items-center justify-center rounded-l-lg bg-white text-gray-400 shadow-sm transition hover:text-brand-500"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? "收起会话列表" : "展开会话列表"}
      >
        {sidebarOpen ? "‹" : "›"}
      </button>

      {/* 右侧：对话区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 头部 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-brand-400 to-orange-400 p-2.5 text-white">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">萌芽 AI 助手</h1>
              <p className="text-xs text-gray-400">
                {activeSessionId ? sessions.find((s) => s.id === activeSessionId)?.title || "对话中" : "孕期 / 育儿 / 比价问答，7×24 小时在线"}
              </p>
            </div>
          </div>
        </div>

        {/* 消息区 */}
        <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
          {messages.length === 0 && !loading && (
            <div className="py-8 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-brand-200" />
              <p className="mt-3 text-sm text-gray-400">你好呀，我是萌小芽。关于怀孕、育儿、选品，都可以问我～</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-100"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "ai" && (
                <div className="rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 p-1.5 text-white">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "rounded-br-sm bg-brand-500 text-white" : "rounded-bl-sm bg-gray-50 text-gray-700"
                }`}
              >
                {m.content}
              </div>
              {m.role === "ai" && (
                <div className="flex items-center gap-1 pl-1 pt-0.5">
                  <CopyButton text={m.content} />
                </div>
              )}
              {m.role === "user" && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start gap-2">
              <div className="rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 p-1.5 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
                <Loader2 className="inline h-4 w-4 animate-spin" /> 思考中…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="输入你的问题…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn-primary shrink-0 px-4" onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-300">
          AI 回答仅供参考，医疗问题请以医生建议为准
        </p>
      </div>

      {/* 删除确认弹窗 */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmDeleteId(null)}>
          <div className="rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 p-2.5 text-red-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">删除这个会话？</p>
                <p className="mt-1 text-xs text-gray-400">删除后无法恢复，该会话的所有消息将被清除</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:bg-gray-50"
                onClick={() => setConfirmDeleteId(null)}
              >
                取消
              </button>
              <button
                className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white transition hover:bg-red-600"
                onClick={confirmDelete}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {toast.msg && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm text-white shadow-lg ${
          toast.type === "error" ? "bg-red-500" : "bg-gray-800"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
