import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Apple,
  Stethoscope,
  BookOpen,
  Activity,
  Baby,
  CalendarHeart,
} from "lucide-react";
import { timelineApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { TimelineItem } from "@/types";
import CopyButton from "@/components/CopyButton";

const TOTAL_WEEKS = 40;

// 月份分组
const MONTHS = [
  { month: 1, weeks: [1, 2, 3, 4], label: "孕1月", desc: "悄悄来临" },
  { month: 2, weeks: [5, 6, 7, 8], label: "孕2月", desc: "早孕反应" },
  { month: 3, weeks: [9, 10, 11, 12], label: "孕3月", desc: "害喜月" },
  { month: 4, weeks: [13, 14, 15, 16], label: "孕4月", desc: "平稳愉快" },
  { month: 5, weeks: [17, 18, 19, 20], label: "孕5月", desc: "感受胎动" },
  { month: 6, weeks: [21, 22, 23, 24], label: "孕6月", desc: "孕味十足" },
  { month: 7, weeks: [25, 26, 27, 28], label: "孕7月", desc: "大腹便便" },
  { month: 8, weeks: [29, 30, 31, 32], label: "孕8月", desc: "憧憬见面" },
  { month: 9, weeks: [33, 34, 35, 36], label: "孕9月", desc: "幸福近了" },
  { month: 10, weeks: [37, 38, 39, 40], label: "孕10月", desc: "欢迎到来" },
];

const CATEGORY_META: Record<string, { label: string; icon: typeof Heart; color: string }> = {
  milestone: { label: "胎儿发育", icon: Baby, color: "text-pink-500 bg-pink-50" },
  food: { label: "营养重点", icon: Apple, color: "text-green-500 bg-green-50" },
  checkup: { label: "产检项目", icon: Stethoscope, color: "text-blue-500 bg-blue-50" },
  health: { label: "健康护理", icon: Activity, color: "text-orange-500 bg-orange-50" },
  education: { label: "胎教建议", icon: BookOpen, color: "text-purple-500 bg-purple-50" },
  exercise: { label: "运动建议", icon: Heart, color: "text-red-500 bg-red-50" },
  emotion: { label: "心理情绪", icon: CalendarHeart, color: "text-indigo-500 bg-indigo-50" },
  shopping: { label: "购物准备", icon: Heart, color: "text-teal-500 bg-teal-50" },
};

const TRIMESTER = (week: number) => {
  if (week <= 12) return { label: "孕早期", color: "bg-rose-100 text-rose-600" };
  if (week <= 27) return { label: "孕中期", color: "bg-amber-100 text-amber-600" };
  return { label: "孕晚期", color: "bg-emerald-100 text-emerald-600" };
};

const WEEK_DESC: Record<number, string> = {
  1: "受精卵形成", 2: "排卵受精", 3: "受精卵着床", 4: "三胚层形成",
  5: "小海马", 6: "胎心跳动", 7: "面部初现", 8: "快速发育",
  9: "进入胎儿期", 10: "安全了", 11: "草莓大小", 12: "NT检查",
  13: "桃子大小", 14: "做鬼脸", 15: "唐筛", 16: "感受胎动",
  17: "快速长肉", 18: "测胎动", 19: "孕味十足", 20: "大排畸",
  21: "300克", 22: "动作更多", 23: "微型老头", 24: "OGTT",
  25: "大脑高峰", 26: "眼睛睁开", 27: "长头发", 28: "入孕晚期",
  29: "记录胎动", 30: "1500克", 31: "房子变小", 32: "1600克",
  33: "圆润可爱", 34: "不怕早产", 35: "新生儿", 36: "越来越近",
  37: "随时相见", 38: "足月了", 39: "最后冲刺", 40: "欢迎到来",
};

export default function PregnancyWeeklyPage() {
  const { stage } = useAuthStore();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 根据用户孕周自动定位
  useEffect(() => {
    if (stage?.is_pregnant && stage.value) {
      const week = Math.min(Math.max(1, stage.value), 40);
      setSelectedWeek(week);
    }
  }, [stage]);

  // 获取选中周的数据
  useEffect(() => {
    setLoading(true);
    timelineApi
      .list({ stage: `pregnancy_${selectedWeek}w` })
      .then((data) => {
        // 按 sort_order 排序
        const sorted = [...data].sort((a, b) => {
          const orderA = CATEGORY_ORDER[a.category] ?? 99;
          const orderB = CATEGORY_ORDER[b.category] ?? 99;
          if (orderA !== orderB) return orderA - orderB;
          return 0;
        });
        setItems(sorted);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [selectedWeek]);

  // 分组
  const grouped = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};
    for (const item of items) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [items]);

  const trimester = TRIMESTER(selectedWeek);
  const currentMonth = MONTHS.find((m) => m.weeks.includes(selectedWeek));
  const weekDesc = WEEK_DESC[selectedWeek] || "";

  const goPrev = () => selectedWeek > 1 && setSelectedWeek(selectedWeek - 1);
  const goNext = () => selectedWeek < TOTAL_WEEKS && setSelectedWeek(selectedWeek + 1);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">孕期周历</h1>
          <p className="mt-1 text-sm text-gray-400">40周全程护航，每周知识点一目了然</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${trimester.color}`}>
          {trimester.label}
        </span>
      </div>

      {/* 周导航条 */}
      <div className="card p-4">
        {/* 月份分组 */}
        <div className="mb-3 flex flex-wrap gap-2">
          {MONTHS.map((m) => (
            <button
              key={m.month}
              onClick={() => setSelectedWeek(m.weeks[0])}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                currentMonth?.month === m.month
                  ? "bg-brand-500 text-white"
                  : "bg-brand-50 text-brand-600 hover:bg-brand-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 周数选择 */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-medium transition ${
                selectedWeek === week
                  ? "bg-brand-500 text-white shadow-sm"
                  : stage?.is_pregnant && stage.value === week
                  ? "bg-brand-200 text-brand-700 ring-2 ring-brand-400"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
              title={`第${week}周 · ${WEEK_DESC[week] || ""}`}
            >
              {week}
            </button>
          ))}
        </div>
      </div>

      {/* 当前周信息卡 */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-500 to-orange-400 p-6 text-white shadow-lg">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <button
                onClick={goPrev}
                disabled={selectedWeek <= 1}
                className="rounded-full bg-white/20 p-1.5 transition hover:bg-white/30 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="text-center">
                <p className="text-sm opacity-90">第</p>
                <p className="text-4xl font-bold">{selectedWeek}</p>
                <p className="text-sm opacity-90">周</p>
              </div>
              <button
                onClick={goNext}
                disabled={selectedWeek >= TOTAL_WEEKS}
                className="rounded-full bg-white/20 p-1.5 transition hover:bg-white/30 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{weekDesc}</p>
            <p className="text-sm opacity-90">{currentMonth?.label} · {currentMonth?.desc}</p>
            {stage?.is_pregnant && stage.value === selectedWeek && (
              <span className="mt-2 inline-block rounded-full bg-white/25 px-3 py-0.5 text-xs">
                你正在这里
              </span>
            )}
          </div>
        </div>
        {/* 装饰圆 */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -right-4 bottom-0 h-20 w-20 rounded-full bg-white/10" />
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="card py-12 text-center text-sm text-gray-400">
          暂无第{selectedWeek}周的数据
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, catItems]) => {
            const meta = CATEGORY_META[cat] || { label: cat, icon: Heart, color: "text-gray-500 bg-gray-50" };
            return (
              <div key={cat}>
                {catItems.map((item) => (
                  <div key={item.id} className="card mb-3 hover:shadow-md transition">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${meta.color}`}>
                        <meta.icon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-medium text-gray-400">{meta.label}</span>
                      {item.is_essential && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">必读</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-800">{item.title}</h3>
                    {item.subtitle && (
                      <p className="mt-0.5 text-xs text-gray-400">{item.subtitle}</p>
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.content}</p>
                    <div className="mt-1 flex justify-end">
                      <CopyButton text={item.content} label="复制" />
                    </div>
                    {item.tips && (
                      <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                        <p className="text-xs text-amber-700">
                          <span className="font-medium">小贴士：</span>{item.tips}
                        </p>
                        <div className="mt-1 flex justify-end">
                          <CopyButton text={item.tips} label="复制" />
                        </div>
                      </div>
                    )}
                    <Link
                      to={`/timeline/${item.id}`}
                      className="mt-3 inline-flex items-center text-xs text-brand-500 hover:underline"
                    >
                      查看详情 <ChevronRight className="ml-0.5 h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* 底部导航 */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={goPrev}
          disabled={selectedWeek <= 1}
          className="btn-secondary disabled:opacity-40"
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> 上一周
        </button>
        <span className="text-sm text-gray-400">
          {selectedWeek} / {TOTAL_WEEKS} 周
        </span>
        <button
          onClick={goNext}
          disabled={selectedWeek >= TOTAL_WEEKS}
          className="btn-secondary disabled:opacity-40"
        >
          下一周 <ChevronRight className="ml-1 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// 分类排序顺序
const CATEGORY_ORDER: Record<string, number> = {
  milestone: 1,
  food: 2,
  checkup: 3,
  health: 4,
  education: 5,
  exercise: 6,
  emotion: 7,
  shopping: 8,
};
