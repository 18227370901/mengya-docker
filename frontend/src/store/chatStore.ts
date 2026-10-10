import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatSessionSummary } from "@/types";

/** AI 回答的实时检索来源条目 */
export interface ChatSource {
  title: string;
  url: string;
  domain?: string;
}

interface Msg {
  role: "user" | "ai";
  content: string;
  /** v1.55 实时检索状态：searxng / fallback:<engine> / unavailable / skipped */
  search_status?: string;
  /** 实时检索来源列表（仅实时响应携带，历史会话不回放） */
  sources?: ChatSource[];
}

interface ChatState {
  messages: Msg[];
  activeSessionId: number | null;
  sessions: ChatSessionSummary[];
  loaded: boolean;
  setMessages: (msgs: Msg[]) => void;
  addMessage: (msg: Msg) => void;
  setActiveSessionId: (id: number | null) => void;
  setSessions: (sessions: ChatSessionSummary[]) => void;
  upsertSession: (s: ChatSessionSummary) => void;
  removeSession: (id: number) => void;
  setLoaded: (v: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      activeSessionId: null,
      sessions: [],
      loaded: false,
      setMessages: (msgs) => set({ messages: msgs }),
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      setActiveSessionId: (id) => set({ activeSessionId: id }),
      setSessions: (sessions) => set({ sessions }),
      upsertSession: (s) =>
        set((state) => {
          const idx = state.sessions.findIndex((x) => x.id === s.id);
          if (idx >= 0) {
            const next = [...state.sessions];
            next[idx] = s;
            return { sessions: next };
          }
          return { sessions: [s, ...state.sessions] };
        }),
      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((x) => x.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
          messages: state.activeSessionId === id ? [] : state.messages,
        })),
      setLoaded: (v) => set({ loaded: v }),
      clearMessages: () => set({ messages: [], activeSessionId: null }),
    }),
    { name: "mengya-chat" },
  ),
);
