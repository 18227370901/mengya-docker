import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ImageOff, Loader2, Tag } from "lucide-react";
import api from "@/api/client";
import type { BabyShoppingItem } from "@/types";
import CopyButton from "@/components/CopyButton";

export default function BabyShoppingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<BabyShoppingItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/baby-shopping/${id}/`)
      .then((r) => r.data.data)
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-gray-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></p>;
  }

  if (!item) {
    return (
      <div className="card py-12 text-center">
        <p className="text-gray-500">物品不存在</p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/shopping-list")}>返回列表</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-500" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      {/* 头部信息卡 */}
      <section className={`card text-white ${item.owner === "mom" ? "bg-gradient-to-r from-brand-500 to-pink-400" : "bg-gradient-to-r from-orange-500 to-amber-400"}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{item.owner_label}</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{item.category}</span>
            </div>
            <h1 className="text-xl font-bold">{item.name}</h1>
          </div>
          <Tag className="h-8 w-8 opacity-50" />
        </div>
        <div className="mt-4 flex gap-6">
          <div>
            <p className="text-xs opacity-75">建议数量</p>
            <p className="text-lg font-semibold">{item.quantity} {item.unit}</p>
          </div>
          {item.unit_price && (
            <div>
              <p className="text-xs opacity-75">单价</p>
              <p className="text-lg font-semibold">¥{item.unit_price}</p>
            </div>
          )}
          {item.total_price && (
            <div>
              <p className="text-xs opacity-75">总价</p>
              <p className="text-lg font-semibold">¥{item.total_price}</p>
            </div>
          )}
        </div>
      </section>

      {/* 示例图片 */}
      {(item.image_url || item.extra_image_url) && (
        <section className="card">
          <h2 className="mb-3 font-semibold text-gray-800">示例图片</h2>
          <div className="flex flex-wrap gap-3">
            {item.image_url && (
              <div className="relative overflow-hidden rounded-xl bg-gray-50">
                <img src={item.image_url} alt={item.name} className="h-40 w-40 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
            {item.extra_image_url && (
              <div className="relative overflow-hidden rounded-xl bg-gray-50">
                <img src={item.extra_image_url} alt={item.name} className="h-40 w-40 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
            <ImageOff className="h-3 w-3" /> 如图片无法显示，可能为内嵌格式未转换
          </p>
        </section>
      )}

      {/* 备注/购买建议 */}
      {item.remark && (
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="mb-3 font-semibold text-gray-800">购买建议与备注</h2>
            <CopyButton text={item.remark} label="复制备注" />
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{item.remark}</p>
        </section>
      )}

      {/* 一键复制全部信息 */}
      <section className="card flex items-center justify-between">
        <span className="text-sm text-gray-500">复制完整物品信息</span>
        <CopyButton
          text={`物品：${item.name}\n归属：${item.owner_label}\n分类：${item.category}\n数量：${item.quantity} ${item.unit}${item.unit_price ? `\n单价：¥${item.unit_price}` : ""}${item.total_price ? `\n总价：¥${item.total_price}` : ""}${item.remark ? `\n备注：${item.remark}` : ""}`}
          label="复制全部"
        />
      </section>
    </div>
  );
}
