import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  Sparkles,
  X,
} from "lucide-react";
import { fetalStoryApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { FetalStory } from "@/types";
import CopyButton from "@/components/CopyButton";
import FavoriteButton from "@/components/FavoriteButton";
import LightPagination from "@/components/ui/LightPagination";
import TopProgressBar from "@/components/ui/TopProgressBar";
import PermissionDeniedCard from "@/components/PermissionDeniedCard";

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

const FETAL_PAGE_SIZE_KEY = "mengya_fetal_page_size";
const FETAL_SIZE_OPTIONS = [
  { value: 24, label: "24 个/页" },
  { value: 48, label: "48 个/页" },
  { value: 96, label: "96 个/页" },
  { value: -1, label: "全部" },
];

export default function FetalStoryPage() {
  const { stage } = useAuthStore();
  const [stories, setStories] = useState<FetalStory[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<number[]>([]);
  /** v1.88.4 “全部列表”模式服务端分页状态（按周视图不分页，数量少） */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(FETAL_PAGE_SIZE_KEY));
      return FETAL_SIZE_OPTIONS.some((o) => o.value === saved) ? saved : 24;
    } catch {
      return 24;
    }
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  /** v1.88.4 二次加载：保留旧内容 + 顶部进度条 */
  const [refreshing, setRefreshing] = useState(false);
  /** v1.88.5 页面访问被拒（菜单权限，code=4030）：整页提示卡 */
  const [permDenied, setPermDenied] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // 计算孕周定位：胎教故事范围为 17~40 周
  const getTargetWeek = useCallback((weeksList?: number[]) => {
    if (stage?.is_pregnant && stage.value) {
      const clamped = Math.min(Math.max(17, stage.value), 40);
      if (weeksList && weeksList.length > 0) {
        if (weeksList.includes(clamped)) return clamped;
        return weeksList[0];
      }
      return clamped;
    }
    return weeksList && weeksList.length > 0 ? weeksList[0] : 17;
  }, [stage]);

  const [selectedWeek, setSelectedWeek] = useState<number>(() => getTargetWeek());
  const [narratorFilter, setNarratorFilter] = useState<string>("");
  const [activeStory, setActiveStory] = useState<FetalStory | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "list">("week");

  // 根据用户阶段信息变动自动定位
  useEffect(() => {
    if (stage?.is_pregnant && stage.value) {
      const target = Math.min(Math.max(17, stage.value), 40);
      setSelectedWeek((curr) => {
        if (availableWeeks.length > 0 && !availableWeeks.includes(target)) {
          return availableWeeks[0];
        }
        return target;
      });
    }
  }, [stage, availableWeeks]);

  // 加载周列表
  useEffect(() => {
    fetalStoryApi.weeks().then((weeks) => {
      setAvailableWeeks(weeks);
      if (weeks.length > 0) {
        setSelectedWeek((curr) => {
          if (stage?.is_pregnant && stage.value) {
            const target = Math.min(Math.max(17, stage.value), 40);
            if (weeks.includes(target)) return target;
          }
          if (weeks.includes(curr)) return curr;
          return weeks[0];
        });
      }
    }).catch(() => {});
  }, [stage]);

  // 加载故事列表：按周视图全量（周内数量少）；全部列表视图服务端分页（v1.88.4，默认 24/页）
  const loadStories = useCallback(() => {
    if (hasLoadedRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    if (viewMode === "list") {
      fetalStoryApi
        .listPaged({ narrator: narratorFilter || undefined, page, page_size: pageSize })
        .then((res) => {
          setStories(res.items);
          setTotal(res.total);
          setTotalPages(res.total_pages);
          hasLoadedRef.current = true;
        })
        .catch((err: any) => {
          // v1.88.5 菜单权限被拒：展示整页提示卡，不再静默空态
          if (err?.code === 4030) {
            setPermDenied(err?.message || "管理员已关闭本页面访问，如有需要请联系管理员开启。");
          }
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    } else {
      fetalStoryApi
        .list({ week: selectedWeek, narrator: narratorFilter || undefined })
        .then((data) => {
          setStories(data);
          hasLoadedRef.current = true;
        })
        .catch((err: any) => {
          // v1.88.5 菜单权限被拒：展示整页提示卡，不再静默空态
          if (err?.code === 4030) {
            setPermDenied(err?.message || "管理员已关闭本页面访问，如有需要请联系管理员开启。");
          }
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    }
  }, [selectedWeek, narratorFilter, viewMode, page, pageSize]);

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

  const handlePageSizeChange = (s: number) => {
    setPageSizeState(s);
    try { localStorage.setItem(FETAL_PAGE_SIZE_KEY, String(s)); } catch { /* ignore */ }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* v1.88.4 二次加载顶部细进度条（切周/切视图/筛选时保留旧内容） */}
      {refreshing && <TopProgressBar />}
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
            onClick={() => { setViewMode("list"); setPage(1); }}
          >
            <List className="h-4 w-4" />
            全部列表
          </button>
        </div>

        <select
          className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          value={narratorFilter}
          onChange={(e) => { setNarratorFilter(e.target.value); setPage(1); }}
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

      {/* 孕周自适应定位提示 */}
      {viewMode === "week" && stage?.is_pregnant && stage.value && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50/80 px-4 py-2 text-xs text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 border border-brand-100 dark:border-brand-900/50">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0" />
            {stage.value < 17 ? (
              <span>
                您当前处于 <strong>{stage.week_days_text || `孕${stage.value}周`}</strong>（胎教故事自孕17周胎儿听觉发育起推荐，已为您定位至第17周故事）
              </span>
            ) : stage.value > 40 ? (
              <span>
                您当前处于 <strong>{stage.week_days_text || `孕${stage.value}周`}</strong>，已为您定位至第40周足月故事
              </span>
            ) : (
              <span>
                根据您当前的孕周（<strong>{stage.week_days_text || `第${stage.value}周`}</strong>），已为您自动定位到本周胎教故事
              </span>
            )}
          </div>
          {stage.value >= 17 && stage.value <= 40 && selectedWeek !== stage.value && (
            <button
              onClick={() => setSelectedWeek(stage.value)}
              className="ml-2 shrink-0 font-medium text-brand-600 hover:text-brand-800 underline dark:text-brand-400"
            >
              返回我的孕周 (第{stage.value}周)
            </button>
          )}
        </div>
      )}

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
                      ? "bg-brand-500 font-medium text-white shadow-sm"
                      : stage?.is_pregnant && stage.value === w
                      ? "bg-brand-100 text-brand-700 font-medium ring-2 ring-brand-400 dark:bg-brand-950 dark:text-brand-300"
                      : availableWeeks.includes(w)
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      : "bg-gray-50 text-gray-300 dark:bg-gray-900 dark:text-gray-600"
                  }`}
                  onClick={() => availableWeeks.includes(w) && setSelectedWeek(w)}
                  disabled={!availableWeeks.includes(w)}
                  title={
                    stage?.is_pregnant && stage.value === w
                      ? `第${w}周 (您当前孕周)`
                      : `第${w}周`
                  }
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
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${TRIMESTER(selectedWeek).color}`}>
            {TRIMESTER(selectedWeek).label}
          </span>
          <span>·</span>
          <span>{WEEK_DESC[selectedWeek] || ""}</span>
          <span>·</span>
          <span>{stories.length} 篇故事</span>
          {stage?.is_pregnant && stage.value === selectedWeek && (
            <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-900/60 dark:text-brand-300">
              当前孕周
            </span>
          )}
        </div>
      )}

      {/* v1.88.5 菜单权限被拒：整页提示卡 */}
      {permDenied && <PermissionDeniedCard message={permDenied} />}

      {/* 加载中 */}
      {!permDenied && loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
        </div>
      )}

      {/* 按周视图：v1.88.5 统一单列竖排 —— 每天 N 篇即 N 张等宽全宽卡，任意数量规整，双端一致 */}
      {!permDenied && !loading && viewMode === "week" && (
        <div className={`space-y-4 ${refreshing ? "opacity-60" : ""}`}>
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
                <div className="space-y-3">
                  {dayStories.map((story) => (
                    <StoryCard key={story.id} story={story} onClick={() => handleStoryClick(story)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 全部列表视图：服务端分页（v1.88.4，默认 24/页可选 12/24/48/全部） */}
      {!permDenied && !loading && viewMode === "list" && (
        <div className={`space-y-3 ${refreshing ? "opacity-60" : ""}`}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} onClick={() => handleStoryClick(story)} compact />
            ))}
          </div>
          {stories.length === 0 && (
            <div className="py-20 text-center text-gray-400">
              <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>暂无故事</p>
            </div>
          )}
          <LightPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            sizeOptions={FETAL_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            unitLabel="个"
          />
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

  // v1.88.2 外层改为 div+role=button：卡片右上角需内嵌收藏按钮（button 不能嵌套 button），
  // 收藏按钮自带 stopPropagation，不会误触打开故事
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group flex cursor-pointer gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 text-left transition hover:border-brand-200 hover:shadow-md"
    >
      {story.cover_image && !compact && (
        <img
          src={story.cover_image}
          alt={story.title}
          className="h-20 w-20 flex-shrink-0 rounded-xl object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
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
          {/* v1.88.2 列表卡片直接提供收藏按钮，无需点进故事详情 */}
          <FavoriteButton
            objectId={story.id}
            favoriteType="fetal_story"
            note={story.title}
            className="ml-auto"
          />
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
    </div>
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
            {/* v1.88.1 收藏本故事（阅读弹窗头部） */}
            <FavoriteButton
              objectId={story.id}
              favoriteType="fetal_story"
              note={story.title}
              variant="icon"
              size="sm"
            />
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
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
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
