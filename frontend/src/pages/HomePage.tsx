import SetStageModal from "@/components/SetStageModal";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  BookOpen,
  CalendarDays,
  ChefHat,
  ChevronRight,
  Heart,
  PackageSearch,
  Sprout,
  Calendar,
  Edit3,
  CheckCircle2,
} from "lucide-react";
import { productApi, timelineApi, favoriteApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { Product, TimelineItem } from "@/types";
import ProductCard from "@/components/ProductCard";

// 胎儿大小比喻
const FETUS_SIZE: Record<number, string> = {
  1: "针尖大小", 2: "针尖大小", 3: "芝麻粒", 4: "小海马·4mm",
  5: "苹果子", 6: "松子仁·0.6cm", 7: "小蓝莓", 8: "覆盆子·1.6cm",
  9: "葡萄·2.3cm", 10: "草莓·3.1cm", 11: "无花果·4.1cm", 12: "李子·6cm",
  13: "桃子·7.5cm", 14: "柠檬·8.7cm", 15: "苹果·10cm", 16: "牛油果·11.6cm",
  17: "石榴·13cm", 18: "彩椒·14.2cm", 19: "番茄·15cm", 20: "香蕉·16.5cm",
  21: "胡萝卜·26.7cm", 22: "木瓜·27.8cm", 23: "大芒果·28.9cm", 24: "玉米·30cm",
  25: "花椰菜·34.6cm", 26: "生菜·35.6cm", 27: "白菜·36.6cm", 28: "茄子·37.6cm",
  29: "南瓜·38.6cm", 30: "大白菜·39.9cm", 31: "椰子·41.1cm", 32: "菠萝·42.4cm",
  33: "哈密瓜·43.7cm", 34: "西柚·45cm", 35: "蜜瓜·46.2cm", 36: "木瓜·47.4cm",
  37: "西瓜·48.6cm", 38: "韭菜·49.8cm", 39: "小西瓜·50.7cm", 40: "南瓜·51.2cm",
};

export default function HomePage() {
  const { user, stage } = useAuthStore();
  const [essentials, setEssentials] = useState<TimelineItem[]>([]);
  const [weekItems, setWeekItems] = useState<TimelineItem[]>([]);
  const [recommend, setRecommend] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showStageModal, setShowStageModal] = useState(false);
  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const location = useLocation();

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 2500);
  };

  const reloadFavorites = () => {
    favoriteApi.list({ favorite_type: "product" }).then((items) => {
      if (items) {
        setFavoritedIds(new Set(items.map((it) => it.object_id)));
      }
    }).catch(() => {});
  };

  useEffect(() => {
    reloadFavorites();
  }, [location.key]);

  const handleToggleFav = (fav: boolean, prod: Product) => {
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (fav) next.add(prod.id);
      else next.delete(prod.id);
      return next;
    });
    showToast(fav ? "已添加到收藏夹" : "已取消收藏");
  };

    const fetchHomeData = () => {
    setLoading(true);
    setError("");
    const weekStage = stage?.is_pregnant && stage.value
      ? `pregnancy_${Math.min(Math.max(1, stage.value), 40)}w`
      : undefined;
    Promise.all([
      timelineApi.list({ essential: true }).catch(() => [] as TimelineItem[]),
      productApi.listAll({ sort: "rating" }).catch(() => [] as Product[]),
      ...(weekStage ? [timelineApi.list({ stage: weekStage }).catch(() => [] as TimelineItem[])] : []),
    ])
      .then(([e, r, w]) => {
        setEssentials(e);
        setRecommend(r.slice(0, 4));
        if (w) setWeekItems(w);
      })
      .catch(() => setError("数据加载失败，请刷新重试"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHomeData();
  }, [stage]);

  useEffect(() => {
    const handleStageChanged = () => {
      fetchHomeData();
    };
    window.addEventListener("stageChanged", handleStageChanged);
    return () => window.removeEventListener("stageChanged", handleStageChanged);
  }, [stage]);

  const quickEntries = [
    { to: "/weekly", label: "孕期周历", icon: CalendarDays, desc: "40周全程知识导航" },
    { to: "/fetal-stories", label: "胎教故事", icon: Heart, desc: "每天一个温馨故事" },
    { to: "/recipes", label: "孕期食谱", icon: ChefHat, desc: "288道专属怀孕餐" },
    { to: "/kids-encyclopedia", label: "幼儿百科", icon: BookOpen, desc: "57个趣味人体问答" },
    { to: "/shopping-list/generate", label: "智能待产包", icon: PackageSearch, desc: "季节+分娩方式自适应" },
    { to: "/health", label: "健康中心", icon: Activity, desc: "产检/生长曲线/疫苗" },
    { to: "/ai-assistant", label: "AI小助手", icon: Bot, desc: "7×24小时问答比价" },
  ];

  if (loading) {
    return <div className="py-20 text-center text-gray-400">加载中…</div>;
  }

  if (error) {
    return (
      <div className="card py-12 text-center">
        <p className="text-red-500">{error}</p>
        <button className="btn-secondary mt-4" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  }

  const currentWeek = stage?.is_pregnant ? stage.value : null;
  const fetusSize = currentWeek ? FETUS_SIZE[currentWeek] : null;

  return (
    <div className="space-y-8">
      {/* 顶部欢迎卡 */}
      <section className="rounded-3xl bg-gradient-to-r from-brand-500 to-orange-400 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">{user?.nickname || (user?.role === "father" ? "准爸爸" : user?.role === "grandma" ? "长辈" : user?.role === "caregiver" ? "照料者" : "准妈妈")}，你好呀</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <h1
                onClick={() => setShowStageModal(true)}
                className="text-2xl font-bold cursor-pointer hover:opacity-90 transition inline-flex items-center gap-1.5"
                title="点击设置或修改预产期/宝宝生日"
              >
                {stage?.label || "欢迎来到萌芽"}
              </h1>
              <button
                type="button"
                onClick={() => setShowStageModal(true)}
                className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-0.5 text-xs font-medium text-white transition cursor-pointer"
                title="点击设置或修改预产期/宝宝生日"
              >
                <Edit3 className="h-3 w-3" />
                <span>{stage?.type === "unknown" ? "立即设置" : "修改"}</span>
              </button>
            </div>
            <p className="mt-1 text-sm opacity-90">
              {stage?.trimester || stage?.period || "从第一次胎动到第一次背书包，我们陪您每一步"}
            </p>
          </div>
          <Sprout className="h-14 w-14 opacity-60" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">全周期科学指导</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">智能对比</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">动态清单</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">AI 7×24</span>
        </div>
      </section>

      {/* 未设置阶段时的引导卡片 */}
      {stage?.type === "unknown" && (
        <section className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-2 border-dashed border-brand-200 bg-brand-50/50">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-brand-500/10 p-3 text-brand-600">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">请设置预产期或宝宝生日</p>
              <p className="text-xs text-gray-500">设置后将开启个性化孕期周历、每日胎教故事及专属商品推荐</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStageModal(true)}
            className="btn-primary text-sm px-4 py-2 whitespace-nowrap cursor-pointer"
          >
            立即设置
          </button>
        </section>
      )}

      {/* 孕周状态卡片 - 仅孕期用户显示 */}
      {currentWeek && fetusSize && (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-brand-50">
                <span className="text-2xl font-bold text-brand-600">{currentWeek}</span>
                <span className="text-xs text-brand-400">周</span>
              </div>
              <div>
                <p className="text-sm text-gray-400">宝宝现在大约</p>
                <p className="text-lg font-semibold text-gray-800">{fetusSize}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {currentWeek <= 12 ? "孕早期" : currentWeek <= 27 ? "孕中期" : "孕晚期"} ·
                  距预产期约 {Math.max(0, 40 - currentWeek)} 周
                </p>
              </div>
            </div>
            <Link
              to="/weekly"
              className="flex items-center gap-1 rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-100"
            >
              本周详情 <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {weekItems.length > 0 && (
            <div className="mt-4 border-t border-orange-50 pt-3">
              <p className="mb-2 text-xs font-medium text-gray-400">本周知识点</p>
              <div className="flex flex-wrap gap-2">
                {weekItems.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    to={`/timeline/${item.id}`}
                    className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-brand-50 hover:text-brand-600"
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 快捷入口 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {quickEntries.map((entry) => (
          <Link key={entry.to} to={entry.to} className="card hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-brand-50 p-2.5">
                <entry.icon className="h-6 w-6 text-brand-500" />
              </div>
              <div>
                <p className="font-medium text-gray-800">{entry.label}</p>
                <p className="text-xs text-gray-400">{entry.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* 本周重点 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">本周重点</h2>
          <Link to="/timeline" className="flex items-center text-sm text-brand-500 hover:underline">
            全部时间轴 <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        {essentials.length === 0 ? (
          <div className="card py-8 text-center text-sm text-gray-400">
            暂无重点内容
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {essentials.slice(0, 3).map((item) => (
              <Link key={item.id} to={`/timeline/${item.id}`} className="card hover:shadow-md transition">
                <div className="mb-2 flex items-center gap-2">
                  <span className="tag">{item.stage_label}</span>
                  <span className="tag">{item.category_label}</span>
                  {item.is_essential && <span className="text-xs text-brand-500">必读</span>}
                </div>
                <h3 className="font-medium text-gray-800">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.content}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 推荐商品 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">高分推荐</h2>
          <Link to="/products" className="flex items-center text-sm text-brand-500 hover:underline">
            全部商品 <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        {recommend.length === 0 ? (
          <div className="card py-8 text-center text-sm text-gray-400">
            暂无推荐商品
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recommend.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                initialFavorited={favoritedIds.has(product.id)}
                onToggleFav={handleToggleFav}
              />
            ))}
          </div>
        )}
      </section>
      <SetStageModal isOpen={showStageModal} onClose={() => setShowStageModal(false)} onSuccess={fetchHomeData} />
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-gray-900/90 px-4 py-2.5 text-sm text-white shadow-lg backdrop-blur-sm transition animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-pink-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
