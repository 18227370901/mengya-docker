import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, ImageOff, Loader2, Pencil, X } from "lucide-react";
import { shoppingApi } from "@/api/services";
import type { ShoppingList, ShoppingListItem } from "@/types";
import CopyButton from "@/components/CopyButton";

const PURCHASE_OPTIONS = [
  { key: "not_bought", label: "未购买" },
  { key: "bought", label: "已购买" },
  { key: "considering", label: "考虑中" },
];

const SEASON_LABELS: Record<string, string> = {
  spring: "春季",
  summer: "夏季",
  autumn: "秋季",
  winter: "冬季",
};

const DELIVERY_LABELS: Record<string, string> = {
  vaginal: "顺产",
  cesarean: "剖宫产",
  both: "通用",
};

export default function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState("");
  const [savingStatus, setSavingStatus] = useState<number | null>(null);

  // 编辑弹窗
  const [editing, setEditing] = useState<ShoppingListItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const load = () => {
    if (!id) return;
    setLoading(true);
    shoppingApi
      .detail(Number(id))
      .then(setList)
      .catch(() => setList(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const toggle = async (itemId: number) => {
    setToggling(itemId);
    setToggleError("");
    try {
      await shoppingApi.toggleCheck(Number(id), itemId);
      load();
    } catch (e) {
      setToggleError((e as Error).message || "操作失败，请稍后重试");
    } finally {
      setToggling(null);
    }
  };

  const changePurchaseStatus = async (item: ShoppingListItem, status: string) => {
    setSavingStatus(item.id);
    setToggleError("");
    try {
      await shoppingApi.updateItem(Number(id), item.id, { purchase_status: status });
      load();
    } catch (e) {
      setToggleError((e as Error).message || "更新失败");
    } finally {
      setSavingStatus(null);
    }
  };

  const openEdit = (item: ShoppingListItem) => {
    setEditing(item);
    setEditForm({
      custom_name: item.custom_name || item.product?.name || "",
      owner: item.owner || "mom",
      category: item.category || "",
      quantity: String(item.quantity ?? ""),
      unit: item.unit || "件",
      unit_price: item.unit_price != null ? String(item.unit_price) : "",
      total_price: item.total_price != null ? String(item.total_price) : "",
      purchase_status: item.purchase_status || "not_bought",
      note: item.note || "",
    });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const payload: Record<string, string> = {
        custom_name: editForm.custom_name,
        owner: editForm.owner,
        category: editForm.category,
        quantity: editForm.quantity || "1",
        unit: editForm.unit || "件",
        purchase_status: editForm.purchase_status,
        note: editForm.note,
      };
      if (editForm.unit_price !== "") payload.unit_price = editForm.unit_price;
      if (editForm.total_price !== "") payload.total_price = editForm.total_price;
      await shoppingApi.updateItem(Number(id), editing.id, payload);
      setEditing(null);
      load();
    } catch (e) {
      setEditError((e as Error).message || "保存失败，请稍后重试");
    } finally {
      setSavingEdit(false);
    }
  };

  // 汇总统计
  const stats = useMemo(() => {
    const items = list?.items || [];
    const momItems = items.filter((i) => i.owner === "mom" || !i.owner);
    const babyItems = items.filter((i) => i.owner === "baby");
    const toNum = (v?: string | number | null) => {
      const n = parseFloat(String(v ?? ""));
      return Number.isFinite(n) ? n : 0;
    };
    const sum = (arr: ShoppingListItem[]) => arr.reduce((acc, i) => acc + toNum(i.total_price), 0);
    return {
      momCount: momItems.length,
      babyCount: babyItems.length,
      momTotal: sum(momItems),
      babyTotal: sum(babyItems),
      allTotal: sum(items),
    };
  }, [list]);

  // 按归属 + 分类分组
  const groups = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of list?.items || []) {
      const key = `${item.owner === "baby" ? "宝宝" : "妈妈"} · ${item.category || "其他"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [list]);

  if (loading) {
    return <p className="py-10 text-center text-gray-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></p>;
  }

  if (!list) {
    return (
      <div className="card py-12 text-center">
        <p className="text-gray-500">待产包不存在或已被删除</p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/shopping-list")}>
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-500" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      {/* 头部进度 */}
      <section className="card bg-gradient-to-r from-brand-500 to-orange-400 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{list.name}</h1>
            <p className="mt-1 text-sm opacity-90">
              {SEASON_LABELS[list.season] || list.season} · {DELIVERY_LABELS[list.delivery_method] || list.delivery_method}
            </p>
          </div>
          <CheckCircle2 className="h-10 w-10 opacity-60" />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>已备选 {list.prepared_count}/{list.total_items} 件</span>
            <span>{list.progress_percent}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${list.progress_percent}%` }}
            />
          </div>
        </div>
      </section>

      {toggleError && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          <span>{toggleError}</span>
          <button className="text-red-400 hover:text-red-600" onClick={() => setToggleError("")}>×</button>
        </div>
      )}

      {/* 汇总统计卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex flex-col items-center py-3">
          <span className="text-xs text-gray-400">妈妈物品</span>
          <span className="mt-1 text-lg font-bold text-brand-600">{stats.momCount} 件</span>
        </div>
        <div className="card flex flex-col items-center py-3">
          <span className="text-xs text-gray-400">宝宝物品</span>
          <span className="mt-1 text-lg font-bold text-orange-500">{stats.babyCount} 件</span>
        </div>
        <div className="card flex flex-col items-center py-3">
          <span className="text-xs text-gray-400">妈妈预估总价</span>
          <span className="mt-1 text-lg font-bold text-brand-600">¥{stats.momTotal ? stats.momTotal.toFixed(2) : "—"}</span>
        </div>
        <div className="card flex flex-col items-center py-3">
          <span className="text-xs text-gray-400">宝宝预估总价</span>
          <span className="mt-1 text-lg font-bold text-orange-500">¥{stats.babyTotal ? stats.babyTotal.toFixed(2) : "—"}</span>
        </div>
      </div>

      {stats.allTotal > 0 && (
        <p className="text-right text-sm text-gray-500">
          合计预估总价：<span className="text-base font-bold text-brand-600">¥{stats.allTotal.toFixed(2)}</span>
        </p>
      )}

      {/* 物品明细表格 */}
      {groups.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-gray-400">清单暂无物品</p>
        </div>
      ) : (
        groups.map(([key, items]) => (
          <section key={key} className="card overflow-hidden p-0">
            <h2 className="border-b border-gray-100 bg-gray-50/50 px-4 py-3 font-semibold text-gray-800">{key}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs text-gray-400">
                    <th className="w-10 px-3 py-2.5"></th>
                    <th className="px-2 py-2.5 font-medium">示例图片</th>
                    <th className="px-2 py-2.5 font-medium">物品名称</th>
                    <th className="px-2 py-2.5 text-center font-medium">数量</th>
                    <th className="px-2 py-2.5 text-center font-medium">单价</th>
                    <th className="px-2 py-2.5 text-center font-medium">总价</th>
                    <th className="px-2 py-2.5 font-medium">备注</th>
                    <th className="px-2 py-2.5 text-center font-medium">购买情况</th>
                    <th className="px-3 py-2.5 text-center font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${item.is_checked ? "bg-green-50/40" : ""}`}>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          className="shrink-0"
                          onClick={() => toggle(item.id)}
                          disabled={toggling === item.id}
                          aria-label={item.is_checked ? "取消勾选" : "勾选已准备"}
                        >
                          {item.is_checked ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <Circle className="h-5 w-5 text-gray-300 hover:text-brand-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        {(item.image_url || item.product?.image_url) ? (
                          <div className="relative overflow-hidden rounded-lg bg-gray-50">
                            <img
                              src={item.image_url || item.product?.image_url}
                              alt=""
                              className="h-11 w-11 object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-50">
                            <ImageOff className="h-4 w-4 text-gray-300" />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <p className={`font-medium ${item.is_checked ? "text-gray-400 line-through" : "text-gray-700"}`}>
                          {item.custom_name || item.product?.name || "未命名"}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 text-center text-gray-600">
                        {item.quantity} {item.unit || "件"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-gray-500">
                        {item.unit_price != null ? `¥${item.unit_price}` : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-center text-gray-500">
                        {item.total_price != null ? `¥${item.total_price}` : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-gray-400">
                        <span className="line-clamp-2 max-w-[160px]">{item.note || "—"}</span>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {savingStatus === item.id ? (
                          <Loader2 className="mx-auto h-4 w-4 animate-spin text-brand-400" />
                        ) : (
                          <select
                            className={`rounded-lg border px-2 py-1 text-xs outline-none ${
                              item.purchase_status === "bought"
                                ? "border-green-200 bg-green-50 text-green-600"
                                : item.purchase_status === "considering"
                                ? "border-amber-200 bg-amber-50 text-amber-600"
                                : "border-gray-200 text-gray-500"
                            }`}
                            value={item.purchase_status || "not_bought"}
                            onChange={(e) => changePurchaseStatus(item, e.target.value)}
                          >
                            {PURCHASE_OPTIONS.map((o) => (
                              <option key={o.key} value={o.key}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                            onClick={() => openEdit(item)}
                            title="编辑物品"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <CopyButton
                            text={`物品：${item.custom_name || item.product?.name || ""}${item.category ? `（${item.category}）` : ""}\n数量：${item.quantity} ${item.unit || "件"}${item.unit_price != null ? `\n单价：¥${item.unit_price}` : ""}${item.total_price != null ? `\n总价：¥${item.total_price}` : ""}${item.purchase_status_label ? `\n购买情况：${item.purchase_status_label}` : ""}${item.note ? `\n备注：${item.note}` : ""}`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {list.note && (
        <p className="rounded-xl bg-cream p-3 text-sm text-gray-500">
          温馨提示：{list.note}
        </p>
      )}
      <p className="text-center text-xs text-gray-300">
        本品类建议来自母婴专家共识，具体以个人情况与医生建议为准
      </p>

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !savingEdit && setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">编辑物品</h3>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => !savingEdit && setEditing(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">物品名称</label>
                <input
                  className="input"
                  value={editForm.custom_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, custom_name: e.target.value }))}
                  placeholder="物品名称"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">归属</label>
                  <select
                    className="input"
                    value={editForm.owner}
                    onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
                  >
                    <option value="mom">妈妈</option>
                    <option value="baby">宝宝</option>
                  </select>
                </div>
                <div>
                  <label className="label">分类</label>
                  <input
                    className="input"
                    value={editForm.category}
                    onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="如：衣物类"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">数量</label>
                  <input
                    className="input"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                    placeholder="如：2"
                  />
                </div>
                <div>
                  <label className="label">单位</label>
                  <input
                    className="input"
                    value={editForm.unit}
                    onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="如：件"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">单价（元）</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.unit_price}
                    onChange={(e) => setEditForm((f) => ({ ...f, unit_price: e.target.value }))}
                    placeholder="如：39.9"
                  />
                </div>
                <div>
                  <label className="label">总价（元）</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.total_price}
                    onChange={(e) => setEditForm((f) => ({ ...f, total_price: e.target.value }))}
                    placeholder="如：79.8"
                  />
                </div>
              </div>
              <div>
                <label className="label">购买情况</label>
                <select
                  className="input"
                  value={editForm.purchase_status}
                  onChange={(e) => setEditForm((f) => ({ ...f, purchase_status: e.target.value }))}
                >
                  {PURCHASE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">备注</label>
                <textarea
                  className="input min-h-[70px] resize-y"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="尺码/颜色/购买建议等"
                />
              </div>
            </div>

            {editError && <p className="mt-3 text-sm text-red-500">{editError}</p>}

            <div className="mt-5 flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => !savingEdit && setEditing(null)}>
                取消
              </button>
              <button className="btn-primary flex-1" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {savingEdit ? "保存中…" : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}