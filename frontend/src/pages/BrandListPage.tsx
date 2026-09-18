import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, MapPin, Search } from "lucide-react";
import { brandApi } from "@/api/catalog";
import type { BrandProfile } from "@/types";

export default function BrandListPage() {
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    brandApi
      .list()
      .then((data) => setBrands(data))
      .catch((e) => setError((e as Error).message || "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = keyword.trim()
    ? brands.filter((b) =>
        b.name.toLowerCase().includes(keyword.toLowerCase()) ||
        (b.name_en || "").toLowerCase().includes(keyword.toLowerCase()) ||
        (b.country_of_origin || "").includes(keyword)
      )
    : brands;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">品牌档案</h1>
        <p className="mt-1 text-sm text-gray-400">国内外主流母婴品牌，市场定位与口碑一览</p>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-10"
          placeholder="搜索品牌名称或国家…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : error ? (
        <div className="card py-12 text-center">
          <p className="text-red-500">{error}</p>
          <button className="btn-secondary mt-4" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-12 text-center">
          <Globe className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">
            {keyword.trim() ? "未找到匹配的品牌" : "暂无品牌数据"}
          </p>
          {keyword.trim() && (
            <button className="btn-secondary mt-4" onClick={() => setKeyword("")}>
              清除搜索
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <Link key={b.id} to={`/brands/${b.id}`} className="card hover:shadow-md transition">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-500">
                  {b.name?.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-800">
                    {b.name}
                    {b.name_en && <span className="ml-1 text-xs font-normal text-gray-400">{b.name_en}</span>}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {b.country_of_origin && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> {b.country_of_origin}
                      </span>
                    )}
                    {b.market_rank && <span>{b.market_rank}</span>}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">{b.positioning_desc || b.positioning}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                <span className="text-xs text-gray-400">{b.market_share || "—"}</span>
                {b.official_url && (
                  <span className="flex items-center gap-1 text-xs text-brand-500">
                    <Globe className="h-3 w-3" /> 官网
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
