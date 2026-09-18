import { useEffect, useMemo, useState, useCallback } from "react";
import {
  BookOpen,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Heart,
  Languages,
  BookMarked,
  Eye,
  List,
  X,
} from "lucide-react";
import { fetalStoryApi } from "@/api/catalog";
import type { FetalStory } from "@/types";
import CopyButton from "@/components/CopyButton";

const NARRATOR_META: Record<string, { label: string; color: string; icon: typeof Heart }> = {
  mom: { label: "妈妈讲", color: "bg-pink-100 text-pink-600", icon: Heart },
  dad: { label: "爸爸讲", color: "bg-blue-100 text-blue-600", icon: Heart },
  either: { label: "都可以", color: "bg-amber-100 text-amber-600", icon: BookOpen },
};

const TRIMESTER = (week: number) => {
  if (week <= 12) return { label: "孕早期", color: "bg-rose-100 text-rose-600" };
  if (week <= 27) return { label: "孕中期", color: "bg-amber-100 text-amber-600" };
  return { label: "孕晚期", color: "bg-emerald-100 text-emerald-600" };
};

const WEEK_DESC: Record<number, string> = {
  17: "快速长肉", 18: "测胎动", 19: "孕味十足", 20: "大排畸",
  21: "300克", 22: "动作更多", 23: "微型老头", 24: "OGTT",
  25: "大脑高峰", 26: "眼睛睁开", 27: "长头发", 28: "入孕晚期",
  29: "记录胎动", 30: "1500克", 31: "房子变小", 32: "1600克",
  33: "圆润可爱", 34: "不怕早产", 35: "新生儿", 36: "越来越近",
  37: "足月了", 38: "迫不及待", 39: "发育成熟", 40: "欢迎到来",
};

const MONTHS = [
  { month: 5, weeks: [17, 18, 19, 20], label: "孕5月", desc: "感受胎动" },
  { month: 6, weeks: [21, 22, 23, 24], label: "孕6月", desc: "孕味十足" },
  { month: 7, weeks: [25, 26, 27, 28], label: "孕7月", desc: "大腹便便" },
  { month: 8, weeks: [29, 30, 31, 32], label: "孕8月", desc: "憧憬见面" },
  { month: 9, weeks: [33, 34, 35, 36], label: "孕9月", desc: "幸福近了" },
  { month: 10, weeks: [37, 38, 39, 40], label: "孕10月", desc: "欢迎到来" },
];

export default function FetalStoryPage() {
  const [stories, setStories] = useState<FetalStory[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<number[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(17);
  const [narratorFilter, setNarratorFilter] = useState<string>("");
  const [activeStory, setActiveStory] = useState<FetalStory | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "list">("week");

  // 加载周列表
  useEffect(() => {
    fetalStoryApi.weeks().then((weeks) => {
      setAvailableWeeks(weeks);
      if (weeks.length > 0 && !weeks.includes(selectedWeek)) {
        setSelectedWeek(weeks[0]);
      }
    }).catch(() => {});
  }, []);

  // 加载故事列表
  const loadStories = useCallback(() => {
    setLoading(true);
    const params: { week?: number; narrator?: string } = {};
    if (viewMode === "week") params.week = selectedWeek;
    if (narratorFilter) params.narrator = narratorFilter;
    fetalStoryApi.list(params).then((data) => {
      setStories(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedWeek, narratorFilter, viewMode]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // 按天分组
  const groupedByDay = useMemo(() => {
    const groups: Record<number, FetalStory[]> = {};
    for (const s of stories) {
      const key = s.day_offset;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b));
  }, [stories]);

  const handleStoryClick = (story: FetalStory) => {
    setActiveStory(story);
    fetalStoryApi.incrementView(story.id).catch(() => {});
  };

  const navigateWeek = (delta: number) => {
    const idx = availableWeeks.indexOf(selectedWeek);
    if (idx === -1) return;
    const newIdx = idx + delta;
    if (newIdx >= 0 && newIdx < availableWeeks.length) {
      setSelectedWeek(availableWeeks[newIdx]);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <div className="rounded-2xl bg-gradient-to-br from-pink-50 via-orange-50 to-amber-50 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
            <BookOpen className="h-6 w-6 text-pink-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">胎教故事</h1>
            <p className="text-sm text-gray-500">每天一个小故事，给宝宝最温柔的爱</p>
          </div>
        </div>
      </div>

      {/* 视图切换 + 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-gray-100 p-1">
          <button
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
              viewMode === "week" ? "bg-white font-medium text-brand-600 shadow-sm" : "text-gray-500"
            }`}
            onClick={() => setViewMode("week")}
          >
            <CalendarHeart className="h-4 w-4" />
            按周查看
          </button>
          <button
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
              viewMode === "list" ? "bg-white font-medium text-brand-600 shadow-sm" : "text-gray-500"
            }`}
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
            全部列表
          </button>
        </div>

        <select
          className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600"
          value={narratorFilter}
          onChange={(e) => setNarratorFilter(e.target.value)}
        >
          <option value="">全部讲述者</option>
          <option value="mom">妈妈讲</option>
          <option value="dad">爸爸讲</option>
          <option value="either">都可以</option>
        </select>

        {viewMode === "week" && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
              onClick={() => navigateWeek(-1)}
              disabled={availableWeeks.indexOf(selectedWeek) <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 text-sm font-medium text-brand-600">
              孕{selectedWeek}周
            </span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
              onClick={() => navigateWeek(1)}
              disabled={availableWeeks.indexOf(selectedWeek) >= availableWeeks.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 月份快选（仅 week 模式） */}
      {viewMode === "week" && (
        <div className="flex flex-wrap gap-2">
          {MONTHS.map((m) => (
            <div key={m.month} className="flex items-center gap-1">
              {m.weeks.map((w) => (
                <button
                  key={w}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    selectedWeek === w
                      ? "bg-brand-500 font-medium text-white"
                      : availableWeeks.includes(w)
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      : "bg-gray-50 text-gray-300"
                  }`}
                  onClick={() => availableWeeks.includes(w) && setSelectedWeek(w)}
                  disabled={!availableWeeks.includes(w)}
                >
                  {w}
                </button>
              ))}
              <span className="ml-0.5 text-xs text-gray-400">{m.label.replace("孕", "")}</span>
            </div>
          ))}
        </div>
      )}

      {/* 周信息 */}
      {viewMode === "week" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${TRIMESTER(selectedWeek).color}`}>
            {TRIMESTER(selectedWeek).label}
          </span>
          <span>·</span>
          <span>{WEEK_DESC[selectedWeek] || ""}</span>
          <span>·</span>
          <span>{stories.length} 篇故事</span>
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
        </div>
      )}

      {/* 故事列表 */}
      {!loading && viewMode === "week" && (
        <div className="space-y-4">
          {groupedByDay.length === 0 && (
            <div className="py-20 text-center text-gray-400">
              <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>本周暂无故事</p>
            </div>
          )}
          {groupedByDay.map(([dayOffset, dayStories]) => {
            const dayNum = Number(dayOffset) + 1;
            return (
              <div key={dayOffset}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-medium text-brand-600">
                    {dayNum}
                  </span>
                  <span className="text-sm text-gray-400">第 {dayNum} 天</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dayStories.map((story) => (
                    <StoryCard key={story.id} story={story} onClick={() => handleStoryClick(story)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && viewMode === "list" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} onClick={() => handleStoryClick(story)} compact />
          ))}
        </div>
      )}

      {/* 故事详情弹窗 */}
      {activeStory && (
        <StoryDetail
          story={activeStory}
          showEnglish={showEnglish}
          onToggleLang={() => setShowEnglish(!showEnglish)}
          onClose={() => setActiveStory(null)}
        />
      )}
    </div>
  );
}

// ===== 故事卡片 =====
function StoryCard({ story, onClick, compact }: { story: FetalStory; onClick: () => void; compact?: boolean }) {
  const narrator = NARRATOR_META[story.narrator] || NARRATOR_META.either;
  const Icon = narrator.icon;

  return (
    <button
      onClick={onClick}
      className="group flex gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 text-left transition hover:border-brand-200 hover:shadow-md"
    >
      {story.cover_image && !compact && (
        <img
          src={story.cover_image}
          alt={story.title}
          className="h-20 w-20 flex-shrink-0 rounded-xl object-cover"
          loading="lazy"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs ${narrator.color}`}>
            <Icon className="h-3 w-3" />
            {narrator.label}
          </span>
          {story.day_index > 1 && (
            <span className="text-xs text-gray-400">#{story.day_index}</span>
          )}
        </div>
        <h3 className="truncate font-medium text-gray-800 group-hover:text-brand-600">
          {story.title}
        </h3>
        {story.subtitle && (
          <p className="truncate text-xs text-gray-400">{story.subtitle}</p>
        )}
        <p className="mt-1 line-clamp-2 flex-1 text-xs text-gray-400">
          {story.content.slice(0, 80)}...
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-300">
          <span className="flex items-center gap-0.5">
            <Eye className="h-3 w-3" />
            {story.view_count}
          </span>
          {story.source && (
            <span className="flex items-center gap-0.5">
              <BookMarked className="h-3 w-3" />
              {story.source.length > 10 ? story.source.slice(0, 10) + "..." : story.source}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ===== 故事详情弹窗 =====
function StoryDetail({
  story,
  showEnglish,
  onToggleLang,
  onClose,
}: {
  story: FetalStory;
  showEnglish: boolean;
  onToggleLang: () => void;
  onClose: () => void;
}) {
  const narrator = NARRATOR_META[story.narrator] || NARRATOR_META.either;
  const Icon = narrator.icon;
  const content = showEnglish && story.content_en ? story.content_en : story.content;
  const tips = showEnglish && story.tips_en ? story.tips_en : story.tips;
  const title = showEnglish && story.title_en ? story.title_en : story.title;
  const subtitle = showEnglish && story.subtitle_en ? story.subtitle_en : story.subtitle;

  // Esc 关闭弹窗
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-0.5 rounded-full px-2.5 py-0.5 text-xs ${narrator.color}`}>
              <Icon className="h-3 w-3" />
              {narrator.label}
            </span>
            <span className="text-xs text-gray-400">
              孕{story.week_start}周 · 第{story.day_offset + 1}天
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(story.content_en || story.title_en) && (
              <button
                onClick={onToggleLang}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition ${
                  showEnglish
                    ? "bg-brand-50 font-medium text-brand-600"
                    : "text-gray-400 hover:bg-gray-50"
                }`}
              >
                <Languages className="h-3.5 w-3.5" />
                {showEnglish ? "中文" : "EN"}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>

        {/* 滚动内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {story.cover_image && (
            <img
              src={story.cover_image}
              alt={title}
              className="mb-4 h-40 w-full rounded-xl object-cover"
            />
          )}
          <h2 className="mb-1 text-xl font-bold text-gray-800">{title}</h2>
          {subtitle && (
            <p className="mb-3 text-sm text-gray-500">—— {subtitle}</p>
          )}
          <div className="prose prose-sm max-w-none">
            {content.split('\n').map((line, i) => (
              <p key={i} className="mb-2 leading-relaxed text-gray-700">
                {line.trim() || '\u00A0'}
              </p>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <CopyButton text={content} label="复制正文" />
          </div>

          {tips && (
            <div className="mt-4 rounded-xl bg-amber-50 p-4">
              <div className="mb-1.5 flex items-center justify-between text-sm font-medium text-amber-600">
                <div className="flex items-center gap-1.5">
                  <BookMarked className="h-4 w-4" />
                  {showEnglish ? "Tips" : "胎教提示"}
                </div>
                <CopyButton text={tips} />
              </div>
              <p className="text-sm leading-relaxed text-amber-700">{tips}</p>
            </div>
          )}

          {story.source && (
            <div className="mt-4 text-xs text-gray-400">
              来源：{story.source}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
