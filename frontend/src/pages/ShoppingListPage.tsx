import { useAuthStore } from "@/store/authStore";
import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckSquare, ChevronLeft, ChevronRight, Loader2, Plus, Search, ShoppingBag, Sparkles, Trash2, X } from "lucide-react";
import { shoppingApi, babyShoppingApi } from "@/api/services";
import type { ShoppingList, BabyShoppingItem, BabyShoppingListResponse, BabyShoppingCategories } from "@/types";
import CopyButton from "@/components/CopyButton";

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

export default function ShoppingListPage() {
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();

  // 参考数据
  const [refData, setRefData] = useState<BabyShoppingListResponse | null>(null);
  const [categories, setCategories] = useState<BabyShoppingCategories | null>(null);
  const [loading, setLoading] = useState(true);

  // 筛选
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const keywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖 300ms
  useEffect(() => {
    if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => { if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current); };
  }, [keyword]);

  // 分页
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 用户清单
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [error, setError] = useState("");

  // 引用选择
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [listName, setListName] = useState("");
  const [modalMode, setModalMode] = useState<"selected" | "all">("selected");
  const [adopting, setAdopting] = useState(false);

  const loadRef = useCallback(() => {
    setLoading(true);
      babyShoppingApi
      .list({
        owner: ownerFilter || undefined,
        category: categoryFilter || undefined,
        keyword: debouncedKeyword || undefined,
        page,
        page_size: pageSize,
      })
      .then(setRefData)
      .catch(() => setRefData(null))
      .finally(() => setLoading(false));
  }, [ownerFilter, categoryFilter, debouncedKeyword, page]);

  const loadCategories = () => {
    babyShoppingApi
      .categories()
      .then(setCategories)
      .catch(() => setCategories(null));
  };

  const loadLists = () => {
    shoppingApi
      .list()
      .then(setLists)
      .catch(() => setLists([]));
  };

  useEffect(() => {
    loadRef();
  }, [loadRef]);

  useEffect(() => {
    loadCategories();
    loadLists();
  }, []);

  // 筛选变化时重置到第1页并清空选择（用防抖后的关键词，避免输入中途频繁重置）
  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [ownerFilter, categoryFilter, debouncedKeyword]);

  const remove = async (id: number) => {
    if (!confirm("确认删除这份待产包清单吗？")) return;
    setError("");
    try {
      await shoppingApi.remove(id);
      loadLists();
    } catch (e) {
      setError((e as Error).message || "删除失败");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openModal = (mode: "selected" | "all") => {
    setModalMode(mode);
    setListName(mode === "all" ? "完整待产包（模板引用）" : `我的待产包（${selectedIds.length}件）`);
    setShowModal(true);
  };

  const confirmAdopt = async () => {
    setAdopting(true);
    setError("");
    try {
      const data = await shoppingApi.fromTemplate({
        name: listName || "我的待产包",
        item_ids: modalMode === "selected" ? selectedIds : undefined,
        season: "all",
        delivery_method: "both",
      });
      setShowModal(false);
      setSelectedIds([]);
      loadLists();
      navigate(`/shopping-list/${data.id}`);
    } catch (e) {
      setError((e as Error).message || "引用失败，请稍后重试");
      setAdopting(false);
    }
  };

  const stats = refData?.stats;
  const items = refData?.items || [];
  const totalPages = refData?.total_pages || 1;
  const currentPageIds = items.map((i) => i.id);

  return (
    <div className="space-y-5">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">待产包清单</h1>
          <p className="mt-1 text-sm text-gray-400">妈妈篇 + 宝宝篇完整参考清单，勾选后引用为我的清单，支持 AI 智能推荐</p>
        </div>
        {hasPermission("shopping_list_create") && (
          <Link to="/shopping-list/generate" className="btn-primary">
          <Sparkles className="h-4 w-4" /> AI 智能推荐
        </Link>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          <span>{error}</span>
          <button className="text-red-400 hover:text-red-600" onClick={() => setError("")}>×</button>
        </div>
      )}

      {/* 价格汇总卡片 */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card flex flex-col items-center py-3">
            <span className="text-xs text-gray-400">妈妈物品</span>
            <span className="mt-1 text-lg font-bold text-brand-600">{stats.mom_count} 件</span>
          </div>
          <div className="card flex flex-col items-center py-3">
            <span className="text-xs text-gray-400">宝宝物品</span>
            <span className="mt-1 text-lg font-bold text-orange-500">{stats.baby_count} 件</span>
          </div>
          <div className="card flex flex-col items-center py-3">
            <span className="text-xs text-gray-400">妈妈预估总价</span>
            <span className="mt-1 text-lg font-bold text-brand-600">¥{stats.total_price_mom !== "0" ? stats.total_price_mom : "—"}</span>
          </div>
          <div className="card flex flex-col items-center py-3">
            <span className="text-xs text-gray-400">宝宝预估总价</span>
            <span className="mt-1 text-lg font-bold text-orange-500">¥{stats.total_price_baby !== "0" ? stats.total_price_baby : "—"}</span>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="card flex flex-wrap items-center gap-3 py-3">
        {/* 归属筛选 */}
        <div className="flex gap-1.5">
          <button
            className={`rounded-lg px-3 py-1.5 text-sm transition ${!ownerFilter ? "bg-brand-500 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
            onClick={() => setOwnerFilter("")}
          >
            全部
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm transition ${ownerFilter === "mom" ? "bg-brand-500 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
            onClick={() => setOwnerFilter("mom")}
          >
            妈妈篇
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm transition ${ownerFilter === "baby" ? "bg-orange-500 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
            onClick={() => setOwnerFilter("baby")}
          >
            宝宝篇
          </button>
        </div>

        {/* 分类下拉 */}
        <select
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 outline-none focus:border-brand-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">全部分类</option>
          {(ownerFilter === "mom" ? (categories?.mom || []) : ownerFilter === "baby" ? (categories?.baby || []) : [...(categories?.mom || []), ...(categories?.baby || [])]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* 关键词搜索 */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            placeholder="搜索物品名称或备注…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* 引用操作 */}
        {hasPermission("shopping_list_create") && (
        <div className="flex items-center gap-2">
          <button
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
              selectedIds.length > 0
                ? "bg-brand-500 text-white hover:bg-brand-600"
                : "bg-gray-50 text-gray-400 cursor-not-allowed"
            }`}
            disabled={selectedIds.length === 0}
            onClick={() => openModal("selected")}
          >
            <CheckSquare className="h-4 w-4" />
            引用选中 ({selectedIds.length})
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50"
            onClick={() => openModal("all")}
          >
            <Plus className="h-4 w-4" />
            整份引用为我的
          </button>
        </div>
        )}
      </div>

      {/* 引用确认弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !adopting && setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {modalMode === "all" ? "整份模板引用为我的清单" : "引用选中物品为我的清单"}
              </h3>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => !adopting && setShowModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              {modalMode === "all"
                ? "将完整参考模板（妈妈篇+宝宝篇）复制到“我的清单”，之后可在详情页修改数量、单价、购买情况等。"
                : `已选择 ${selectedIds.length} 件物品，复制到“我的清单”，之后可在详情页修改。`}
            </p>
            <label className="label">清单名称</label>
            <input
              className="input mb-4"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="例如：我的待产包"
            />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => !adopting && setShowModal(false)}>
                取消
              </button>
              <button className="btn-primary flex-1" onClick={confirmAdopt} disabled={adopting}>
                {adopting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                {adopting ? "创建中…" : "确认引用并生成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 参考数据列表（表格） */}
      {loading ? (
        <p className="py-10 text-center text-gray-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></p>
      ) : items.length === 0 ? (
        <div className="card py-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">没有找到匹配的物品</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs text-gray-400">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-500"
                      checked={currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => [...new Set([...prev, ...currentPageIds])]);
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">归属</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">物品名称</th>
                  <th className="px-4 py-3 text-center font-medium">数量</th>
                  <th className="px-4 py-3 text-center font-medium">单价</th>
                  <th className="px-4 py-3 text-center font-medium">总价</th>
                  <th className="px-4 py-3 font-medium">备注</th>
                  <th className="px-4 py-3 text-center font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: BabyShoppingItem) => (
                  <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${selectedIds.includes(item.id) ? "bg-brand-50/40" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${item.owner === "mom" ? "bg-brand-50 text-brand-600" : "bg-orange-50 text-orange-500"}`}>
                        {item.owner_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.category}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/shopping-list/ref/${item.id}`} className="font-medium text-gray-700 hover:text-brand-500">
                          {item.name}
                        </Link>
                        {item.image_url && (
                          <span className="inline-block h-2 w-2 rounded-full bg-green-400" title="有示例图" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.quantity} {item.unit}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{item.unit_price ? `¥${item.unit_price}` : "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{item.total_price ? `¥${item.total_price}` : "—"}</td>
                    <td className="px-4 py-3 text-gray-400">
                      <span className="line-clamp-1 max-w-[180px]">{item.remark || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className={`flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs ${
                            selectedIds.includes(item.id) ? "bg-brand-50 text-brand-600" : "text-gray-400 hover:text-brand-500"
                          }`}
                          onClick={() => toggleSelect(item.id)}
                        >
                          <Plus className="h-3 w-3" /> 引用
                        </button>
                        <CopyButton text={`${item.name} ${item.quantity}${item.unit}${item.remark ? " — " + item.remark : ""}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              第 {page}/{totalPages} 页，共 {refData?.total || 0} 条
              {selectedIds.length > 0 && <span className="ml-2 text-brand-500">已选 {selectedIds.length} 件</span>}
            </span>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" /> 上一页
              </button>
              <button
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={page >= totalPages}
              >
                下一页 <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* 用户自己的待产包清单 */}
      {lists.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">我的待产包清单</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {lists.map((list) => (
              <div key={list.id} className="card hover:shadow-md transition">
                <Link to={`/shopping-list/${list.id}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">{list.name}</h3>
                    <div className="flex gap-1.5">
                      <span className="tag">{SEASON_LABELS[list.season] || list.season}</span>
                      <span className="tag">{DELIVERY_LABELS[list.delivery_method] || list.delivery_method}</span>
                    </div>
                  </div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">已备 {list.prepared_count}/{list.total_items} 件</span>
                    <span className="font-semibold text-brand-600">{list.progress_percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-orange-400 transition-all"
                      style={{ width: `${list.progress_percent}%` }}
                    />
                  </div>
                </Link>
                <div className="mt-3 flex justify-end">
                  {hasPermission("shopping_list_delete") && (
                  <button
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-red-500"
                    onClick={() => remove(list.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}