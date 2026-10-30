import React, { useEffect, useState, useMemo } from "react";
import {
  Compass,
  ExternalLink,
  Search,
  Layers,
  ChevronRight,
  Globe,
  Sparkles,
  Baby,
  Smile,
  GraduationCap,
  Wrench,
  Gamepad2,
  FolderOpen
} from "lucide-react";
import { platformApi } from "@/api/platform";
import { ThirdPartyPlatform, ThirdPartyPlatformResource } from "@/types/platform";
import { useAuthStore } from "@/store/authStore";
import PermissionDeniedCard from "@/components/PermissionDeniedCard";
import FavoriteButton from "@/components/FavoriteButton";
import LightPagination, { PageSizeOption } from "@/components/ui/LightPagination";

const CATEGORIES = [
  { key: "", label: "全部", icon: Layers },
  { key: "parenting", label: "育儿早教", icon: Baby },
  { key: "health", label: "母婴健康", icon: Smile },
  { key: "learning", label: "课外学习", icon: GraduationCap },
  { key: "tools", label: "实用工具", icon: Wrench },
  { key: "entertainment", label: "益智娱乐", icon: Gamepad2 },
  { key: "other", label: "其他资源", icon: FolderOpen },
];

const AGE_GROUPS = [
  { key: "", label: "全年龄段" },
  { key: "prenatal", label: "孕产阶段" },
  { key: "infant", label: "0-1岁婴儿" },
  { key: "toddler", label: "1-3岁幼儿" },
  { key: "preschool", label: "3-6岁学前" },
  { key: "school_age", label: "6岁以上学龄" },
];

const PAGE_SIZE_OPTIONS: PageSizeOption[] = [
  { value: 6, label: "6 个/页" },
  { value: 9, label: "9 个/页" },
  { value: 18, label: "18 个/页" },
  { value: -1, label: "全部平台" },
];

const STORAGE_KEY = "mengya_platforms_page_size";

function HubPlatformLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className="h-11 w-11 rounded-xl object-contain border border-gray-100 bg-gray-50 p-1"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-500 font-bold text-lg border border-amber-100">
      {name ? name.slice(0, 1) : "?"}
    </div>
  );
}

export default function ThirdPartyHubPage() {
  const { user, hasPermission } = useAuthStore();
  const [platforms, setPlatforms] = useState<ThirdPartyPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? parseInt(saved, 10) : 9;
      return [6, 9, 18, -1].includes(parsed) ? parsed : 9;
    } catch {
      return 9;
    }
  });

  const canAccess = user?.is_staff || hasPermission("menu_third_party_hub") || hasPermission("menu_admin_platforms");

  const loadPlatforms = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await platformApi.getPlatforms({
        category: selectedCategory || undefined,
        age_group: selectedAgeGroup || undefined,
        keyword: searchKeyword || undefined,
      });
      setPlatforms(res.data.data || []);
      setPage(1);
    } catch (err: any) {
      setErrorMsg(err.message || "获取平台列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) {
      loadPlatforms();
    }
  }, [canAccess, selectedCategory, selectedAgeGroup]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPlatforms();
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    try {
      localStorage.setItem(STORAGE_KEY, String(newSize));
    } catch {}
  };

  // 分页计算
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(platforms.length / pageSize));
  const paginatedPlatforms = useMemo(() => {
    if (pageSize === -1) return platforms;
    const start = (page - 1) * pageSize;
    return platforms.slice(start, start + pageSize);
  }, [platforms, page, pageSize]);

  const handleOpenPlatform = (p: ThirdPartyPlatform, resource?: ThirdPartyPlatformResource) => {
    // 异步上报访问行为，不阻断页面跳转
    platformApi.logAccess(p.id, resource?.id).catch(() => {});
    
    let targetUrl = p.url;
    if (resource) {
      if (resource.path_or_url.startsWith("http://") || resource.path_or_url.startsWith("https://")) {
        targetUrl = resource.path_or_url;
      } else {
        const base = p.url.endsWith("/") ? p.url.slice(0, -1) : p.url;
        const sub = resource.path_or_url.startsWith("/") ? resource.path_or_url : `/${resource.path_or_url}`;
        targetUrl = `${base}${sub}`;
      }
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  if (!canAccess) {
    return (
      <div className="py-12">
        <PermissionDeniedCard
          message="您当前账号尚未配置三方中转站访问权限，如需使用请联系管理员在用户管理中为您开通。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部导航 Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-orange-400 via-amber-400 to-rose-400 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="h-6 w-6" />
              <h1 className="text-xl font-bold">三方中转站 · 聚合工具箱</h1>
            </div>
            <p className="text-xs text-orange-50">
              汇聚精选母婴健康、科学早教、知识工具及优质外部平台，一键安全直达
            </p>
          </div>
          {user?.is_staff && (
            <a
              href="/admin/platforms"
              className="inline-flex items-center gap-1.5 self-start rounded-xl bg-white/20 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-white/30"
            >
              <Sparkles className="h-3.5 w-3.5" />
              接入管理配置
            </a>
          )}
        </div>

        {/* 搜索与年龄段 */}
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="relative flex-1">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索平台名称、功能或描述..."
              className="w-full rounded-xl border-0 bg-white/95 px-4 py-2.5 pl-10 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:ring-2 focus:ring-amber-300"
            />
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition"
            >
              搜索
            </button>
          </form>

          {/* 年龄段快捷筛选 */}
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {AGE_GROUPS.map((ag) => (
              <button
                key={ag.key}
                onClick={() => {
                  setSelectedAgeGroup(ag.key);
                  setPage(1);
                }}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  selectedAgeGroup === ag.key
                    ? "bg-white text-brand-600 shadow"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {ag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 分类切换 Tab */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => {
                setSelectedCategory(cat.key);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* 平台卡片流 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : errorMsg ? (
        <div className="rounded-2xl bg-red-50 p-6 text-center text-sm text-red-600">
          {errorMsg}
        </div>
      ) : platforms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Globe className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">暂无可访问的三方平台</p>
          <p className="mt-1 text-xs text-gray-400">
            管理员尚未接入或分配该分类下的三方中转资源
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedPlatforms.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div>
                  {/* 顶部：图标、标题、分类徽章、收藏按钮、直达按钮 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
<HubPlatformLogo name={p.name} logoUrl={p.logo_url} />
                      <div>
                        <h3 className="font-semibold text-gray-800 line-clamp-1">{p.name}</h3>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                            {p.category_display || "工具"}
                          </span>
                          {p.age_group_display && p.age_group !== "all" && (
                            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              {p.age_group_display}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* 收藏按钮 */}
                      <FavoriteButton
                        objectId={p.id}
                        favoriteType="platform"
                        note={p.name}
                        size="sm"
                      />
                      <button
                        onClick={() => handleOpenPlatform(p)}
                        className="flex items-center gap-1 rounded-xl bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-orange-100"
                        title="在新标签页中打开主站"
                      >
                        <span>直达</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* 描述 */}
                  <p className="mt-3 text-xs text-gray-500 line-clamp-2 min-h-[32px]">
                    {p.description || "暂无描述信息"}
                  </p>

                  {/* 标签 */}
                  {p.tags && p.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {p.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 子资源/二级入口工具箱 */}
                {p.resources && p.resources.length > 0 && (
                  <div className="mt-4 border-t border-gray-50 pt-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-gray-400">
                      <span>快捷入口 / 子资源 ({p.resources.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.resources.map((res) => (
                        <button
                          key={res.id}
                          onClick={() => handleOpenPlatform(p, res)}
                          className="group flex items-center gap-1 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-1 text-xs text-gray-600 transition hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-600"
                          title={res.description || res.path_or_url}
                        >
                          <span>{res.title}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-brand-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 分页组件 */}
          <LightPagination
            page={page}
            totalPages={totalPages}
            total={platforms.length}
            pageSize={pageSize}
            sizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            unitLabel="个平台"
          />
        </div>
      )}
    </div>
  );
}
