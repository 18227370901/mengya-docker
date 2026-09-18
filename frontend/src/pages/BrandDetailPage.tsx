import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Globe, MapPin, Star } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import { brandApi, productApi } from "@/api/catalog";
import type { BrandProfile, Product } from "@/types";
import ProductCard from "@/components/ProductCard";

export default function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [brandError, setBrandError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setBrandError("");
    Promise.all([
      brandApi.detail(Number(id)).then((b) => { setBrand(b); return b; }).catch((e) => {
        setBrandError((e as Error).message || "加载失败");
        return null;
      }),
      productApi.listAll({ brand: Number(id) }).catch(() => [] as Product[]),
    ])
      .then(([b, p]) => {
        setProducts(p);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-gray-400">加载中…</p>;
  }

  if (brandError && !brand) {
    return (
      <div className="card py-12 text-center">
        <p className="text-red-500">{brandError}</p>
        <p className="mt-1 text-sm text-gray-400">请检查网络后重试</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-secondary" onClick={() => navigate("/brands")}>
            返回品牌列表
          </button>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="card py-12 text-center">
        <p className="text-gray-500">品牌不存在</p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/brands")}>
          返回品牌列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-500" onClick={() => navigate("/brands")}>
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      {/* 品牌头部 */}
      <section className="card">
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-brand-50 text-2xl font-bold text-brand-500">
            {brand.name?.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-800">
              {brand.name}
              {brand.name_en && <span className="ml-2 text-base font-normal text-gray-400">{brand.name_en}</span>}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              {brand.country_of_origin && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {brand.country_of_origin}
                </span>
              )}
              {brand.founded_year && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> {brand.founded_year}年创立
                </span>
              )}
              {brand.parent_company && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" /> {brand.parent_company}
                </span>
              )}
            </div>
            {brand.market_rank && (
              <div className="mt-2 flex items-center gap-1 text-brand-500">
                <Star className="h-4 w-4 fill-current" />
                <span className="text-sm font-medium">{brand.market_rank}</span>
                <span className="text-xs text-gray-400">{brand.market_share}</span>
              </div>
            )}
          </div>
          {brand.official_url && (
            <a href={brand.official_url} target="_blank" rel="noreferrer" className="btn-secondary shrink-0">
              <Globe className="h-4 w-4" /> 官网
            </a>
          )}
        </div>
      </section>

      {/* 品牌故事 */}
      <section className="card">
        <h2 className="mb-2 font-semibold text-gray-800">品牌定位</h2>
        <p className="text-sm text-gray-500">{brand.positioning}</p>
        {brand.positioning_desc && (
          <>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{brand.positioning_desc}</p>
            <div className="mt-1 flex justify-end">
              <CopyButton text={brand.positioning_desc} label="复制" />
            </div>
          </>
        )}
        {brand.brand_story && (
          <>
            <h2 className="mb-2 mt-5 font-semibold text-gray-800">品牌故事</h2>
            <p className="text-sm leading-relaxed text-gray-600">{brand.brand_story}</p>
            <div className="mt-1 flex justify-end">
              <CopyButton text={brand.brand_story} label="复制" />
            </div>
          </>
        )}
      </section>

      {/* 品牌商品 */}
      <section>
        <h2 className="mb-3 font-semibold text-gray-800">品牌商品（{products.length}）</h2>
        {products.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">该品牌暂无收录商品</p>
        )}
      </section>

      <p className="text-center text-xs text-gray-300">
        品牌数据来自公开资料整理，仅供参考
      </p>
    </div>
  );
}