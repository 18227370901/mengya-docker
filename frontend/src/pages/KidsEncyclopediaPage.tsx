import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, Lightbulb, MessageCircle, Search, Sparkles, X } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import { kidsEncyclopediaApi } from "@/api/catalog";
import type { KidsEncyclopedia } from "@/types";

const CHAPTER_TABS = [
  { key: "", label: "全部", icon: Sparkles, color: "text-orange-500 bg-orange-50" },
  { key: "origin", label: "我从哪里来", icon: BookOpen, color: "text-pink-500 bg-pink-50" },
  { key: "body", label: "我的身体", icon: BookOpen, color: "text-teal-500 bg-teal-50" },
  { key: "growth", label: "我的成长", icon: BookOpen, color: "text-blue-500 bg-blue-50" },
  { key: "mystery", label: "身体的奥秘", icon: BookOpen, color: "text-purple-500 bg-purple-50" },
];

const CHAPTER_LABELS: Record<string, string> = {
  origin: "我从哪里来",
  body: "我的身体",
  growth: "我的成长",
  mystery: "身体的奥秘",
};

export default function KidsEncyclopediaPage() {
  const [activeChapter, setActiveChapter] = useState("");
  const [questions, setQuestions] = useState<KidsEncyclopedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖 300ms
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);

  // 切换章节时重置展开态
  useEffect(() => {
    setExpandedId(null);
  }, [activeChapter]);

  useEffect(() => {
    setLoading(true);
    const params: { chapter?: string; search?: string } = {};
    if (activeChapter) params.chapter = activeChapter;
    if (debouncedSearch) params.search = debouncedSearch;
    kidsEncyclopediaApi
      .list(params)
      .then(setQuestions)
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [activeChapter, debouncedSearch]);

  const groupedQuestions = useMemo(() => {
    if (!activeChapter) {
      const groups: Record<string, KidsEncyclopedia[]> = {};
      for (const q of questions) {
        const key = q.chapter;
        if (!groups[key]) groups[key] = [];
        groups[key].push(q);
      }
      return groups;
    }
    return { [activeChapter]: questions };
  }, [questions, activeChapter]);

  const totalQuestions = questions.length;

  return (
    <div className="space-y-6">
      {/* 顶部标题卡 */}
      <section className="rounded-3xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">幼儿十万个为什么</h1>
            <p className="mt-1 text-sm opacity-90">人体的奥秘 · 3-8岁幼儿科普启蒙</p>
          </div>
          <BookOpen className="h-14 w-14 opacity-60" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">57个趣味问答</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">漫画风格</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">字大图大</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">边玩边学</span>
        </div>
      </section>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={'搜索问题，比如"为什么人会放屁"'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 章节标签 */}
      <div className="flex flex-wrap gap-2">
        {CHAPTER_TABS.map((tab) => (
          <button
            key={tab.key || "all"}
            onClick={() => setActiveChapter(tab.key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeChapter === tab.key
                ? "bg-brand-500 text-white shadow-md"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 问题数量提示 */}
      <p className="text-sm text-gray-400">
        {loading ? "加载中…" : `共 ${totalQuestions} 个问题`}
      </p>

      {/* 问题列表 */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">加载中…</div>
      ) : totalQuestions === 0 ? (
        <div className="card py-12 text-center text-sm text-gray-400">
          没有找到相关问题
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedQuestions).map(([chKey, items]) => (
            <div key={chKey}>
              {/* 章节标题（仅在全部模式下显示） */}
              {!activeChapter && (
                <div className="mb-3 flex items-center gap-2">
                  <div className={`rounded-lg px-2 py-1 ${CHAPTER_TABS.find((t) => t.key === chKey)?.color || "bg-gray-50"}`}>
                    <span className="text-sm font-medium">
                      {CHAPTER_LABELS[chKey] || chKey}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{items.length} 个问题</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
              )}

              {/* 问题卡片 */}
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((q) => (
                  <div
                    key={q.id}
                    className="card overflow-hidden transition hover:shadow-md"
                  >
                    {/* 问题头部 */}
                    <button
                      onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                      className="flex w-full items-start justify-between p-4 text-left"
                    >
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                            {q.question_number}
                          </span>
                          <span className="text-xs text-gray-400">{CHAPTER_LABELS[q.chapter]}</span>
                        </div>
                        <h3 className="font-medium text-gray-800">{q.question}</h3>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 flex-shrink-0 text-gray-400 transition ${
                          expandedId === q.id ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* 展开内容 */}
                    {expandedId === q.id && (
                      <div className="border-t border-orange-50 px-4 pb-4 pt-3">
                        {/* 选项区 */}
                        <div className="mb-3 space-y-1.5">
                          <p className="mb-1 text-xs font-medium text-gray-400">猜一猜：</p>
                          {[
                            { label: "A", text: q.option_a },
                            { label: "B", text: q.option_b },
                            { label: "C", text: q.option_c },
                          ].filter((o) => o.text).map((opt) => (
                            <div
                              key={opt.label}
                              className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                            >
                              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                                {opt.label}
                              </span>
                              <span className="text-gray-600">{opt.text}</span>
                            </div>
                          ))}
                        </div>

                        {/* 解答区 */}
                        <div className="mb-3 rounded-xl bg-brand-50 p-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Lightbulb className="h-4 w-4 text-brand-500" />
                              <span className="text-xs font-medium text-brand-600">原来是这样</span>
                            </div>
                            <CopyButton text={q.answer} />
                          </div>
                          <p className="text-sm leading-relaxed text-gray-700">{q.answer}</p>
                        </div>

                        {/* 漫画对话区 */}
                        {q.comic_dialogue && (
                          <div className="rounded-xl bg-yellow-50 p-3">
                            <div className="mb-1.5 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <MessageCircle className="h-4 w-4 text-yellow-600" />
                                <span className="text-xs font-medium text-yellow-700">趣味对话</span>
                              </div>
                              <CopyButton text={q.comic_dialogue} />
                            </div>
                            <div className="space-y-1">
                              {q.comic_dialogue.split("\n").filter((l) => l.trim()).map((line, idx) => (
                                <p key={idx} className="text-sm text-yellow-800">
                                  "{line}"
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
