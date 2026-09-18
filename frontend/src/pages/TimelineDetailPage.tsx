import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Edit3 } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import { timelineApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { TimelineItem } from "@/types";
import ProductCard from "@/components/ProductCard";

export default function TimelineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [item, setItem] = useState<TimelineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setError("缺少文章ID");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    timelineApi
      .detail(Number(id))
      .then((data) => {
        setItem(data);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message || "加载失败，请稍后重试");
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="py-20 text-center text-gray-400">加载中…</div>;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/timeline" className="flex items-center text-sm text-brand-500 hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回时间轴
        </Link>
        <div className="card py-12 text-center">
          <p className="text-red-500">{error}</p>
          <button
            className="btn-secondary mt-4"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/timeline" className="flex items-center text-sm text-brand-500 hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回时间轴
        </Link>
        {user?.is_staff && item && (
          <button
            className="flex items-center gap-1 rounded-xl bg-brand-50 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-100"
            onClick={() => navigate(`/timeline?edit=${item.id}`)}
          >
            <Edit3 className="h-4 w-4" /> 编辑此事件
          </button>
        )}
      </div>

      <article className="card">
        <div className="mb-3 flex items-center gap-2">
          <span className="tag">{item.stage_label} {item.stage_value}</span>
          <span className="tag">{item.category_label}</span>
          {item.is_essential && <span className="tag bg-red-50 text-red-500">必读</span>}
        </div>
        <h1 className="text-2xl font-bold text-gray-800">{item.title}</h1>
        {item.subtitle && <p className="mt-1 text-brand-400">{item.subtitle}</p>}
        <div className="mt-4 whitespace-pre-wrap leading-relaxed text-gray-600">{item.content}</div>
        <div className="mt-2 flex justify-end">
          <CopyButton text={item.content} label="复制内容" />
        </div>
        {item.tips && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
            <strong>小贴士：</strong>
            {item.tips}
            <div className="mt-2 flex justify-end">
              <CopyButton text={item.tips} label="复制" />
            </div>
          </div>
        )}
      </article>

      {item.products?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-gray-800">关联商品</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {item.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
