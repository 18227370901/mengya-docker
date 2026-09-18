import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Edit3, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { productApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { Product } from "@/types";

const CATEGORIES = [
  { key: "food", label: "食品类" },
  { key: "feeding", label: "食具类" },
  { key: "clothing", label: "服装及布类" },
  { key: "diaper", label: "尿裤类" },
  { key: "bedding", label: "寝具类" },
  { key: "furniture", label: "家具类" },
  { key: "bath", label: "洗护日用品类" },
  { key: "health_tool", label: "护理工具类" },
  { key: "travel", label: "出行类" },
  { key: "toy", label: "启智早教类" },
  { key: "mama_pregnancy", label: "妈妈用品-孕期" },
  { key: "mama_postpartum", label: "妈妈用品-产后" },
  { key: "mama_nursing", label: "妈妈用品-哺乳" },
  { key: "appliance", label: "电子电器类" },
];

interface ProductForm {
  name: string;
  brand: string;
  image_url: string;
  first_category: string;
  second_category: string;
  description: string;
  overall_rating: number;
  price_avg: number;
  price_range: string;
  is_essential: boolean;
  is_active: boolean;
  purchase_link_taobao: string;
  purchase_link_jd: string;
  purchase_link_pdd: string;
  purchase_link_other: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  brand: "",
  image_url: "",
  first_category: "food",
  second_category: "",
  description: "",
  overall_rating: 7,
  price_avg: 0,
  price_range: "",
  is_essential: false,
  is_active: true,
  purchase_link_taobao: "",
  purchase_link_jd: "",
  purchase_link_pdd: "",
  purchase_link_other: "",
};

const PAGE_SIZE = 10;

export default function ProductAdminPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [toast, setToast] = useState("");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // 分页状态
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const load = (p?: number) => {
    setLoading(true);
    const targetPage = p ?? page;
    const params: Record<string, string | number | undefined> = { page: targetPage, page_size: PAGE_SIZE };
    if (filterCategory) params.category = filterCategory;
    productApi.list(params).then((data) => {
      setProducts(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    }).catch(() => setProducts([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.is_staff) {
      navigate("/profile");
      return;
    }
    load(1);
  }, [filterCategory]);

  // 编辑/发布后自动滚动到表单
  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      brand: p.brand,
      image_url: p.image_url,
      first_category: p.first_category,
      second_category: p.second_category,
      description: p.description || "",
      overall_rating: p.overall_rating,
      price_avg: p.price_info?.avg || 0,
      price_range: p.price_info?.range || "",
      is_essential: p.is_essential || false,
      is_active: p.is_active ?? true,
      purchase_link_taobao: p.purchase_links?.taobao || "",
      purchase_link_jd: p.purchase_links?.jd || "",
      purchase_link_pdd: p.purchase_links?.pdd || "",
      purchase_link_other: p.purchase_links?.other || "",
    });
    setShowForm(true);
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.brand.trim()) return;
    setSaving(true);
    const payload: Partial<Product> = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      image_url: form.image_url || `https://placehold.co/300x300/fef3c7/f97316?text=${encodeURIComponent(form.name.slice(0, 4))}`,
      first_category: form.first_category,
      second_category: form.second_category || "默认",
      description: form.description,
      overall_rating: Number(form.overall_rating),
      price_info: { avg: Number(form.price_avg), range: form.price_range || String(form.price_avg) },
      ratings: { safety: Number(form.overall_rating), comfort: Number(form.overall_rating), functionality: Number(form.overall_rating), usability: Number(form.overall_rating), appearance: Number(form.overall_rating) },
      is_essential: form.is_essential,
      is_active: form.is_active,
      purchase_links: {
        taobao: form.purchase_link_taobao.trim(),
        jd: form.purchase_link_jd.trim(),
        pdd: form.purchase_link_pdd.trim(),
        other: form.purchase_link_other.trim(),
      },
    };
    try {
      if (editingId) {
        await productApi.update(editingId, payload);
      } else {
        await productApi.create(payload);
      }
      setShowForm(false);
      load();
    } catch {
      showToast("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("确认删除此商品？此操作不可恢复。")) return;
    await productApi.remove(id).catch(() => {});
    load();
  };

  const toggleActive = async (p: Product) => {
    try {
      await productApi.update(p.id, { is_active: !p.is_active });
      showToast(p.is_active === false ? "已上架" : "已暂存");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleExport = async () => {
    try {
      const blob = await productApi.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products_export.csv";
      a.click();
      URL.revokeObjectURL(url);
      showToast("导出成功");
    } catch { showToast("导出失败"); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await productApi.importTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
      showToast("模板已下载");
    } catch { showToast("下载失败"); }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const res = await productApi.importCsv(file);
      showToast(res.message || `导入完成：成功 ${res.data.created} 条`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const goToPage = (p: number) => {
    const target = Math.max(1, Math.min(p, totalPages));
    setPage(target);
    load(target);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 text-gray-400 hover:text-gray-600" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">商品管理</h1>
            <p className="text-sm text-gray-400">上架 / 暂存 / 编辑 / 删除商品</p>
          </div>
        </div>
        <button className="btn-primary" onClick={startCreate}>
          <Plus className="h-4 w-4" /> 发布商品
        </button>
      </div>

      {/* 导入导出工具栏 */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <button
          className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-600 hover:bg-green-100"
          onClick={handleExport}
        >
          <Download className="h-3.5 w-3.5" /> 导出 CSV
        </button>
        <button
          className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-100"
          onClick={() => importInputRef.current?.click()}
          disabled={importing}
        >
          <Upload className="h-3.5 w-3.5" /> {importing ? "导入中…" : "导入 CSV"}
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
        />
        <button
          className="flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
          onClick={handleDownloadTemplate}
        >
          <Download className="h-3.5 w-3.5" /> 下载导入模板
        </button>
      </div>

      {/* 筛选 */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">分类</label>
          <select
            className="input flex-1"
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          >
            <option value="">全部分类</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">状态</label>
          <select
            className="input flex-1"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="active">已上架</option>
            <option value="inactive">已暂存</option>
          </select>
        </div>
      </div>

      {/* 表单 */}
      {showForm && (
        <section ref={formRef} className="card space-y-3 scroll-mt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{editingId ? "编辑商品" : "发布新商品"}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">商品名称 *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">品牌 *</label>
              <input className="input" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">一级分类</label>
              <select className="input" value={form.first_category} onChange={(e) => setForm((f) => ({ ...f, first_category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">二级分类</label>
              <input className="input" value={form.second_category} onChange={(e) => setForm((f) => ({ ...f, second_category: e.target.value }))} placeholder="如：奶粉/纸尿裤" />
            </div>
          </div>
          <div>
            <label className="label">商品图片 URL</label>
            <input className="input" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="留空将自动生成占位图" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">均价 (元)</label>
              <input type="number" className="input" value={form.price_avg} onChange={(e) => setForm((f) => ({ ...f, price_avg: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">价格区间</label>
              <input className="input" value={form.price_range} onChange={(e) => setForm((f) => ({ ...f, price_range: e.target.value }))} placeholder="如 200-350" />
            </div>
            <div>
              <label className="label">综合评分 (0-10)</label>
              <input type="number" step="0.1" min="0" max="10" className="input" value={form.overall_rating} onChange={(e) => setForm((f) => ({ ...f, overall_rating: Number(e.target.value) }))} />
            </div>
          </div>
                    <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
            <p className="text-xs font-semibold text-gray-700">推荐购买链接配置（淘宝、京东、拼多多等平台）</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <label className="label text-xs">淘宝购买链接</label>
                <input
                  className="input text-xs"
                  placeholder="https://item.taobao.com/..."
                  value={form.purchase_link_taobao}
                  onChange={(e) => setForm((f) => ({ ...f, purchase_link_taobao: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">京东购买链接</label>
                <input
                  className="input text-xs"
                  placeholder="https://item.jd.com/..."
                  value={form.purchase_link_jd}
                  onChange={(e) => setForm((f) => ({ ...f, purchase_link_jd: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">拼多多购买链接</label>
                <input
                  className="input text-xs"
                  placeholder="https://mobile.yangkeduo.com/..."
                  value={form.purchase_link_pdd}
                  onChange={(e) => setForm((f) => ({ ...f, purchase_link_pdd: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label text-xs">其他平台购买链接（可选）</label>
              <input
                className="input text-xs"
                placeholder="https://..."
                value={form.purchase_link_other}
                onChange={(e) => setForm((f) => ({ ...f, purchase_link_other: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="label">商品描述</label>
            <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.is_essential} onChange={(e) => setForm((f) => ({ ...f, is_essential: e.target.checked }))} />
              标记为刚需必备
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              立即上架（取消则暂存）
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>
              {saving ? "保存中…" : <><Save className="h-4 w-4 inline mr-1" /> {editingId ? "保存修改" : "发布商品"}</>}
            </button>
            <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </section>
      )}

      {/* 商品列表 */}
      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : (
        <div className="space-y-2">
          {products
            .filter((p) => {
              if (filterActive === "active") return p.is_active !== false;
              if (filterActive === "inactive") return p.is_active === false;
              return true;
            })
            .map((p) => (
              <div key={p.id} className="card flex items-center gap-3 p-3">
                <img src={p.image_url} alt={p.name} className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-gray-700">{p.name}</span>
                    {p.is_active === false ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-500">暂存</span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-500">上架</span>
                    )}
                    {p.is_essential && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-400">必备</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {p.brand} · {p.first_category_label || p.first_category} · 评分 {p.overall_rating?.toFixed(1)}
                    {p.price_info?.avg ? ` · ¥${p.price_info.avg}` : ""}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                    onClick={() => toggleActive(p)}
                  >
                    {p.is_active === false ? "上架" : "暂存"}
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                    onClick={() => startEdit(p)}
                    title="编辑"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                    onClick={() => remove(p.id)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          {!loading && products.length === 0 && (
            <p className="py-10 text-center text-gray-400">暂无商品</p>
          )}

          {/* 分页控件 */}
          {total > 0 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-gray-400">
                共 {total} 条，第 {page}/{totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      className={`rounded-lg px-3 py-1 text-sm ${p === page ? "bg-brand-500 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
