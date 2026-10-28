/**
 * v1.88 商品库管理 —— 商品 + 品牌库双 Tab
 * 能力：新增/编辑/删除/上下架、搜索、单选/多选/全选、批量删除/批量上架/批量暂存、
 *       CSV 导入导出、一键恢复出厂（商品 63 条 / 品牌 41 条）
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { brandApi, knowledgeAdminApi, productApi, type KbExportScope } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { BrandProfile, KnowledgeResetStats, Product } from "@/types";
import CsvImportResultModal from "@/components/CsvImportResultModal";
import { downloadBlob } from "@/utils/download";

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

const POSITIONING_OPTIONS = [
  { value: "premium", label: "高端" },
  { value: "mid_high", label: "中高端" },
  { value: "mid", label: "中端" },
  { value: "value", label: "性价比" },
  { value: "budget", label: "平价" },
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

interface BrandForm {
  id?: number;
  name: string;
  name_en: string;
  positioning: string;
  country_of_origin: string;
  market_rank: string;
  brand_story: string;
  official_url: string;
  is_active: boolean;
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

const EMPTY_BRAND_FORM: BrandForm = {
  name: "",
  name_en: "",
  positioning: "mid",
  country_of_origin: "",
  market_rank: "",
  brand_story: "",
  official_url: "",
  is_active: true,
};

const PAGE_SIZE = 10;

export default function ProductAdminPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  /* ===== 顶部 Tab：商品 / 品牌 ===== */
  const [tab, setTab] = useState<"products" | "brands">("products");

  /* ===== 商品列表状态 ===== */
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [toast, setToast] = useState("");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  /** v1.88.2 导入结果明细弹窗（v1.88.3 接口级错误也常驻弹窗） */
  const [importResult, setImportResult] = useState<{
    kind: "result" | "error";
    title?: string;
    created?: number;
    errors?: string[];
    message?: string;
  } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  /** v1.88 多选（当前页内选择） */
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  /** v1.88 恢复出厂弹窗 */
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStats, setResetStats] = useState<KnowledgeResetStats | null>(null);
  /** v1.88.1 导出范围下拉 / 导出中标记 */
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* ===== 品牌库状态 ===== */
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [brandForm, setBrandForm] = useState<BrandForm>(EMPTY_BRAND_FORM);
  const [brandEditing, setBrandEditing] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandResetOpen, setBrandResetOpen] = useState(false);
  const [brandResetStats, setBrandResetStats] = useState<KnowledgeResetStats | null>(null);
  const [brandDeleting, setBrandDeleting] = useState<BrandProfile | null>(null);
  /** v1.88.1 品牌删除确认：该品牌关联的商品清单 */
  const [brandProducts, setBrandProducts] = useState<Product[] | null>(null);
  const [brandProductsLoading, setBrandProductsLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  /* ===== 商品数据加载 ===== */
  const load = (p?: number) => {
    setLoading(true);
    const targetPage = p ?? page;
    // v1.88.1 管理页带 with_inactive=1：可见含已暂存商品，并可按状态筛选
    const params: Record<string, string | number | undefined> = { page: targetPage, page_size: PAGE_SIZE, with_inactive: 1 };
    if (filterCategory) params.category = filterCategory;
    if (filterActive) params.status = filterActive === "active" ? "active" : "inactive";
    if (searchQ.trim()) params.q = searchQ.trim();
    productApi
      .list(params)
      .then((data) => {
        setProducts(data.items);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.is_staff && !user) return;
    if (!user?.is_staff) {
      navigate("/profile");
      return;
    }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterActive]);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

  /* ===== 选择逻辑 ===== */
  const isAllCurrentSelected = useMemo(
    () => products.length > 0 && products.every((p) => selectedIds.includes(p.id)),
    [products, selectedIds]
  );
  const isSomeSelected = useMemo(() => {
    const count = products.filter((p) => selectedIds.includes(p.id)).length;
    return count > 0 && count < products.length;
  }, [products, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllCurrentSelected) {
      const ids = new Set(products.map((p) => p.id));
      setSelectedIds((prev) => prev.filter((id) => !ids.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...products.map((p) => p.id)])));
    }
  };

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /* ===== 商品批量操作 ===== */
  const handleBatch = async (action: "delete" | "active" | "inactive") => {
    if (selectedIds.length === 0) return;
    if (action === "delete" && !window.confirm(`确认批量删除已选择的 ${selectedIds.length} 个商品？此操作不可恢复。`)) {
      return;
    }
    try {
      const res = await productApi.batch(selectedIds, action);
      showToast(res?.message || "批量操作成功");
      setSelectedIds([]);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "批量操作失败");
    }
  };

  /* ===== 商品单条操作 ===== */
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
    if (!form.name.trim() || !form.brand.trim()) {
      showToast("请填写商品名称与品牌");
      return;
    }
    setSaving(true);
    const payload: Partial<Product> = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      image_url:
        form.image_url ||
        `https://placehold.co/300x300/fef3c7/f97316?text=${encodeURIComponent(form.name.slice(0, 4))}`,
      first_category: form.first_category,
      second_category: form.second_category || "默认",
      description: form.description,
      overall_rating: Number(form.overall_rating),
      price_info: { avg: Number(form.price_avg), range: form.price_range || String(form.price_avg) },
      ratings: {
        safety: Number(form.overall_rating),
        comfort: Number(form.overall_rating),
        functionality: Number(form.overall_rating),
        usability: Number(form.overall_rating),
        appearance: Number(form.overall_rating),
      },
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
      showToast("保存成功");
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
    showToast("删除成功");
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

  /* ===== 商品 CSV ===== */
  /** v1.88.1 构造导出载荷：scope 三选 + 当前筛选条件（管理页含暂存商品） */
  const buildExportPayload = (scope: KbExportScope) => {
    const payload: Record<string, unknown> = { scope, with_inactive: 1 };
    if (filterCategory) payload.category = filterCategory;
    if (filterActive) payload.status = filterActive === "active" ? "active" : "inactive";
    if (searchQ.trim()) payload.q = searchQ.trim();
    if (scope === "page") {
      payload.page = page;
      payload.page_size = PAGE_SIZE;
    }
    if (scope === "selected") {
      payload.ids = selectedIds;
    }
    return payload;
  };

  const handleExport = async (scope: KbExportScope) => {
    if (scope === "selected" && selectedIds.length === 0) {
      showToast("请先勾选要导出的商品");
      setExportOpen(false);
      return;
    }
    setExportOpen(false);
    setExporting(true);
    try {
      const blob = await productApi.exportCsv(buildExportPayload(scope) as any);
      downloadBlob(blob, "products_export.csv");
      showToast(
        scope === "page" ? `已导出当前页（第${page}页）商品` : scope === "filtered" ? `已导出筛选结果全部商品` : `已导出选中的 ${selectedIds.length} 个商品`
      );
    } catch {
      showToast("导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await productApi.importTemplate("cn");
      downloadBlob(blob, "products_import_template_cn.csv");
      showToast("模板已下载");
    } catch {
      showToast("下载失败");
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const res = await productApi.importCsv(file);
      // v1.88.2：有失败行时弹窗展示逐行原因（含真实文件行号），便于修正后重导
      const errs = res?.data?.errors || [];
      if (errs.length > 0) {
        setImportResult({ kind: "result", created: res?.data?.created ?? 0, errors: errs });
      } else {
        showToast(res?.message || `导入成功：${res?.data?.created ?? 0} 条`);
      }
      load();
    } catch (err) {
      // v1.88.3：接口级错误同样常驻弹窗，等待用户手动点击「知道了」关闭
      const msg = err instanceof Error ? err.message : "导入失败，请重试";
      setImportResult({ kind: "error", title: "导入失败", message: msg });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const goToPage = (p: number) => {
    const target = Math.max(1, Math.min(p, totalPages));
    setPage(target);
    setSelectedIds([]);
    load(target);
  };

  /* ===== 商品恢复出厂 ===== */
  const openProductReset = async () => {
    setResetOpen(true);
    setResetStats(null);
    try {
      const list = await knowledgeAdminApi.stats("products");
      setResetStats(list?.[0] ?? null);
    } catch {
      setResetStats(null);
    }
  };

  const confirmProductReset = async () => {
    setResetting(true);
    try {
      const res = await knowledgeAdminApi.reset("products");
      showToast(res?.message || "已恢复出厂");
      setResetOpen(false);
      setSelectedIds([]);
      setPage(1);
      load(1);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "恢复出厂失败");
    } finally {
      setResetting(false);
    }
  };

  /* ===== 品牌库 ===== */
  const loadBrands = () => {
    setBrandsLoading(true);
    brandApi
      .list({ with_inactive: 1 })
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]))
      .finally(() => setBrandsLoading(false));
  };

  useEffect(() => {
    if (tab === "brands" && brands.length === 0) loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredBrands = useMemo(
    () =>
      brandSearch.trim()
        ? brands.filter(
            (b) => b.name.includes(brandSearch.trim()) || (b.name_en || "").toLowerCase().includes(brandSearch.trim().toLowerCase())
          )
        : brands,
    [brands, brandSearch]
  );

  const openBrandCreate = () => {
    setBrandForm(EMPTY_BRAND_FORM);
    setBrandEditing(true);
  };

  const openBrandEdit = (b: BrandProfile) => {
    setBrandForm({
      id: b.id,
      name: b.name,
      name_en: b.name_en || "",
      positioning: b.positioning || "mid",
      country_of_origin: b.country_of_origin || "",
      market_rank: b.market_rank || "",
      brand_story: b.brand_story || "",
      official_url: b.official_url || "",
      is_active: b.is_active ?? true,
    });
    setBrandEditing(true);
  };

  const saveBrand = async () => {
    if (!brandForm.name.trim()) {
      showToast("请填写品牌名称");
      return;
    }
    setBrandSaving(true);
    try {
      const payload = {
        name: brandForm.name.trim(),
        name_en: brandForm.name_en.trim(),
        positioning: brandForm.positioning,
        country_of_origin: brandForm.country_of_origin.trim(),
        market_rank: brandForm.market_rank.trim(),
        brand_story: brandForm.brand_story,
        official_url: brandForm.official_url.trim(),
        is_active: brandForm.is_active,
      };
      if (brandForm.id) {
        await brandApi.update(brandForm.id, payload);
      } else {
        await brandApi.create(payload);
      }
      setBrandEditing(false);
      showToast("品牌保存成功");
      loadBrands();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "品牌保存失败");
    } finally {
      setBrandSaving(false);
    }
  };

  const confirmBrandDelete = async () => {
    if (!brandDeleting) return;
    try {
      await brandApi.remove(brandDeleting.id);
      showToast("品牌已删除");
      setBrandDeleting(null);
      setBrandProducts(null);
      loadBrands();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "删除失败");
    }
  };

  /** v1.88.1 品牌删除前拉取关联商品清单，供确认弹窗展示 */
  const openBrandDelete = (b: BrandProfile) => {
    setBrandDeleting(b);
    setBrandProducts(null);
    setBrandProductsLoading(true);
    productApi
      .list({ brand_profile_id: b.id, with_inactive: 1, page: 1, page_size: 50 })
      .then((data) => setBrandProducts(data.items || []))
      .catch(() => setBrandProducts([]))
      .finally(() => setBrandProductsLoading(false));
  };

  /** v1.88.1 品牌恢复出厂弹窗：打开时拉取当前/内置统计 */
  const openBrandReset = async () => {
    setBrandResetOpen(true);
    setBrandResetStats(null);
    try {
      const list = await knowledgeAdminApi.stats("brands");
      setBrandResetStats(list?.[0] ?? null);
    } catch {
      setBrandResetStats(null);
    }
  };

  const confirmBrandReset = async () => {
    setResetting(true);
    try {
      const res = await knowledgeAdminApi.reset("brands");
      showToast(res?.message || "已恢复出厂");
      setBrandResetOpen(false);
      loadBrands();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "恢复出厂失败");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* 顶部 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 text-gray-400 hover:text-gray-600 dark:bg-gray-800" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">商品管理</h1>
            <p className="text-sm text-gray-400">商品与品牌库 · 上架/暂存/编辑/删除/批量操作/恢复出厂</p>
          </div>
        </div>
        {/* Tab 切换 */}
        <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <button
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === "products" ? "bg-white text-brand-600 shadow-sm dark:bg-gray-700 dark:text-brand-300" : "text-gray-500"
            }`}
            onClick={() => setTab("products")}
          >
            <Package className="h-3.5 w-3.5" /> 商品列表
          </button>
          <button
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === "brands" ? "bg-white text-brand-600 shadow-sm dark:bg-gray-700 dark:text-brand-300" : "text-gray-500"
            }`}
            onClick={() => setTab("brands")}
          >
            <Tag className="h-3.5 w-3.5" /> 品牌库
          </button>
        </div>
      </div>

      {/* ============ 商品 Tab ============ */}
      {tab === "products" && (
        <>
          {/* v1.88.1 发布/编辑独占模式：表单展开时隐藏列表，专注填写 */}
          {showForm ? (
            <section ref={formRef} className="card scroll-mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                  {editingId ? "编辑商品" : "发布新商品"}
                  <span className="ml-2 text-xs font-normal text-gray-400">（独占模式，保存或取消后返回列表）</span>
                </h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
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
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
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
                    <input className="input text-xs" placeholder="https://item.taobao.com/..." value={form.purchase_link_taobao} onChange={(e) => setForm((f) => ({ ...f, purchase_link_taobao: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label text-xs">京东购买链接</label>
                    <input className="input text-xs" placeholder="https://item.jd.com/..." value={form.purchase_link_jd} onChange={(e) => setForm((f) => ({ ...f, purchase_link_jd: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label text-xs">拼多多购买链接</label>
                    <input className="input text-xs" placeholder="https://mobile.yangkeduo.com/..." value={form.purchase_link_pdd} onChange={(e) => setForm((f) => ({ ...f, purchase_link_pdd: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">其他平台购买链接（可选）</label>
                  <input className="input text-xs" placeholder="https://..." value={form.purchase_link_other} onChange={(e) => setForm((f) => ({ ...f, purchase_link_other: e.target.value }))} />
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
                <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>
                  取消并返回列表
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* 工具栏 */}
              <div className="card flex flex-wrap items-center gap-2 p-3">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setPage(1);
                        load(1);
                      }
                    }}
                    placeholder="搜索商品名称，回车查询"
                    className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                {/* v1.88.1 导出范围下拉三选 */}
                <div className="relative z-20">
                  <button
                    className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-600 hover:bg-green-100 disabled:opacity-50"
                    onClick={() => setExportOpen((v) => !v)}
                    disabled={exporting}
                  >
                    <Download className="h-3.5 w-3.5" /> {exporting ? "导出中…" : "导出 CSV"}
                    <span className="text-[9px] opacity-60">▾</span>
                  </button>
                  {exportOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                      <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <button type="button" onClick={() => handleExport("page")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-green-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          当前页（第{page}页）
                        </button>
                        <button type="button" onClick={() => handleExport("filtered")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-green-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          筛选结果全部（{total} 个）
                        </button>
                        <button type="button" onClick={() => handleExport("selected")} className="block w-full px-3 py-2 text-left text-gray-600 transition hover:bg-green-50 dark:text-gray-300 dark:hover:bg-gray-700">
                          仅选中项（{selectedIds.length} 个）
                        </button>
                      </div>
                    </>
                  )}
                </div>
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
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                  }}
                />
                <button className="flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100" onClick={handleDownloadTemplate}>
                  <Download className="h-3.5 w-3.5" /> 模板
                </button>
                <button
                  className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  onClick={openProductReset}
                  title="清空商品库并恢复为系统初始 63 条内置商品"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 恢复出厂
                </button>
                <button className="btn-primary ml-auto" onClick={startCreate}>
                  <Plus className="h-4 w-4" /> 发布商品
                </button>
              </div>

              {/* 筛选 */}
              <div className="card flex flex-wrap items-center gap-3 p-4">
                <div className="flex flex-1 items-center gap-2">
                  <label className="label mb-0 whitespace-nowrap">分类</label>
                  <select
                    className="input flex-1"
                    value={filterCategory}
                    onChange={(e) => {
                      setFilterCategory(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">全部分类</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <label className="label mb-0 whitespace-nowrap">状态</label>
                  <select
                    className="input flex-1"
                    value={filterActive}
                    onChange={(e) => {
                      setFilterActive(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">全部状态</option>
                    <option value="active">已上架</option>
                    <option value="inactive">已暂存</option>
                  </select>
                </div>
              </div>

              {/* 批量操作条 */}
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2.5 text-xs text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200">
                  <div className="flex items-center gap-2 font-medium">
                    <Check className="h-4 w-4 text-brand-600" />
                    <span>已勾选 {selectedIds.length} 个商品</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-lg bg-emerald-600 px-2.5 py-1 font-medium text-white transition hover:bg-emerald-700" onClick={() => handleBatch("active")}>
                      批量上架
                    </button>
                    <button className="rounded-lg bg-gray-600 px-2.5 py-1 font-medium text-white transition hover:bg-gray-700" onClick={() => handleBatch("inactive")}>
                      批量暂存
                    </button>
                    <button className="rounded-lg bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700" onClick={() => handleBatch("delete")}>
                      批量删除
                    </button>
                    <button className="px-2 py-1 text-gray-500 hover:text-gray-800" onClick={() => setSelectedIds([])}>
                      取消勾选
                    </button>
                  </div>
                </div>
              )}

              {/* 商品列表 */}
              {loading ? (
                <p className="py-10 text-center text-gray-400">加载中…</p>
              ) : (
                <div className="space-y-2">
                  {/* 全选行 */}
                  {products.length > 0 && (
                    <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={isAllCurrentSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isSomeSelected;
                        }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        title="全选 / 反选当前页"
                      />
                      <span>全选当前页（{products.length} 个）</span>
                    </div>
                  )}
                  {products.map((p) => (
                    <div key={p.id} className={`card flex items-center gap-3 p-3 ${selectedIds.includes(p.id) ? "border-brand-300 bg-brand-50/40" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleRow(p.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <img src={p.image_url} alt={p.name} className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-gray-700">{p.name}</span>
                          {p.is_active === false ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-500">暂存</span>
                          ) : (
                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-500">上架</span>
                          )}
                          {p.is_essential && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-400">必备</span>}
                          {/* v1.88.1 行内品牌档案标签 */}
                          {p.brand_profile && (
                            <span className="flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-500" title="品牌档案">
                              <Tag className="h-3 w-3" />
                              {p.brand_profile.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {p.brand} · {p.first_category_label || p.first_category} · 评分 {p.overall_rating?.toFixed(1)}
                          {p.price_info?.avg ? ` · ¥${p.price_info.avg}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-50" onClick={() => toggleActive(p)}>
                          {p.is_active === false ? "上架" : "暂存"}
                        </button>
                        <button className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500" onClick={() => startEdit(p)} title="编辑">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" onClick={() => remove(p.id)} title="删除">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!loading && products.length === 0 && <p className="py-10 text-center text-gray-400">暂无商品</p>}

                  {/* 分页控件 */}
                  {total > 0 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-xs text-gray-400">
                        共 {total} 条，第 {page}/{totalPages} 页
                      </p>
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let p: number;
                          if (totalPages <= 7) p = i + 1;
                          else if (page <= 4) p = i + 1;
                          else if (page >= totalPages - 3) p = totalPages - 6 + i;
                          else p = page - 3 + i;
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
                        <button className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ============ 品牌 Tab ============ */}
      {tab === "brands" && (
        <>
          <div className="card flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="搜索品牌名称..."
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>
            <button
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              onClick={openBrandReset}
              title="清空品牌库并恢复为系统初始 41 条内置品牌"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 恢复出厂
            </button>
            <button className="btn-primary ml-auto" onClick={openBrandCreate}>
              <Plus className="h-4 w-4" /> 新增品牌
            </button>
          </div>

          {/* 品牌编辑/新增表单 */}
          {brandEditing && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 dark:text-gray-100">{brandForm.id ? "编辑品牌" : "新增品牌"}</h2>
                <button onClick={() => setBrandEditing(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">品牌名 *</label>
                  <input className="input" value={brandForm.name} onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">英文名</label>
                  <input className="input" value={brandForm.name_en} onChange={(e) => setBrandForm((f) => ({ ...f, name_en: e.target.value }))} />
                </div>
                <div>
                  <label className="label">定位</label>
                  <select className="input" value={brandForm.positioning} onChange={(e) => setBrandForm((f) => ({ ...f, positioning: e.target.value }))}>
                    {POSITIONING_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">原产国/地区</label>
                  <input className="input" value={brandForm.country_of_origin} onChange={(e) => setBrandForm((f) => ({ ...f, country_of_origin: e.target.value }))} />
                </div>
                <div>
                  <label className="label">市场排名</label>
                  <input className="input" value={brandForm.market_rank} onChange={(e) => setBrandForm((f) => ({ ...f, market_rank: e.target.value }))} />
                </div>
                <div>
                  <label className="label">官网</label>
                  <input className="input" value={brandForm.official_url} onChange={(e) => setBrandForm((f) => ({ ...f, official_url: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">品牌故事</label>
                <textarea className="input min-h-[70px]" value={brandForm.brand_story} onChange={(e) => setBrandForm((f) => ({ ...f, brand_story: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={brandForm.is_active} onChange={(e) => setBrandForm((f) => ({ ...f, is_active: e.target.checked }))} />
                品牌有效（前台可见）
              </label>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={saveBrand} disabled={brandSaving}>
                  {brandSaving ? "保存中…" : "保存品牌"}
                </button>
                <button className="btn-secondary flex-1" onClick={() => setBrandEditing(false)}>
                  取消
                </button>
              </div>
            </section>
          )}

          {/* 品牌列表 */}
          {brandsLoading ? (
            <p className="py-10 text-center text-gray-400">加载中…</p>
          ) : (
            <div className="card divide-y divide-gray-100 p-0 dark:divide-gray-800">
              {filteredBrands.length === 0 ? (
                <p className="py-10 text-center text-gray-400">暂无品牌</p>
              ) : (
                filteredBrands.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-gray-700 dark:text-gray-200">{b.name}</span>
                        <span className="text-xs text-gray-400">{b.name_en}</span>
                        {b.is_active === false && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-500">停用</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {POSITIONING_OPTIONS.find((o) => o.value === b.positioning)?.label || "—"}
                        {b.country_of_origin ? ` · ${b.country_of_origin}` : ""}
                        {b.market_rank ? ` · 排名 ${b.market_rank}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500" onClick={() => openBrandEdit(b)} title="编辑">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" onClick={() => openBrandDelete(b)} title="删除">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
              <div className="p-3 text-center text-xs text-gray-400">共 {filteredBrands.length} 个品牌</div>
            </div>
          )}
        </>
      )}

      {/* 商品恢复出厂 Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center gap-3 text-amber-600">
              <RotateCcw className="h-6 w-6" />
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">恢复出厂 —— 商品库</h3>
            </div>
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <p className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>高危操作：商品库全部数据将被清空（含管理员新增/修改），随后重灌系统初始内置商品；用户收藏的商品将失效（保留收藏记录并提示）。建议先导出 CSV 备份。</span>
              </p>
            </div>
            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <div className="flex items-center justify-between">
                <span>当前库数据</span>
                <span className="font-semibold text-rose-600">{resetStats ? `${resetStats.current} 条` : "加载中…"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>恢复后内置数据</span>
                <span className="font-semibold text-emerald-600">{resetStats ? `${resetStats.builtin} 条` : "—"}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button type="button" onClick={() => setResetOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                取消
              </button>
              <button type="button" disabled={resetting} onClick={confirmProductReset} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
                {resetting ? "恢复中..." : "确认恢复出厂"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 品牌删除确认（v1.88.1 附关联商品清单） */}
      {brandDeleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center gap-3 text-rose-600">
              <Trash2 className="h-6 w-6" />
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">确认删除品牌</h3>
            </div>
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">确定要删除品牌「{brandDeleting.name}」吗？相关商品的品牌字段将失去关联档案，操作不可逆。</p>
            {/* v1.88.1 关联商品清单提示 */}
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="flex items-start gap-1.5 font-semibold">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>关联影响提示：</span>
              </p>
              {brandProductsLoading ? (
                <p className="mt-1.5">正在检查该品牌下关联的商品…</p>
              ) : brandProducts === null ? (
                <p className="mt-1.5">关联商品检查失败，请谨慎确认。</p>
              ) : brandProducts.length === 0 ? (
                <p className="mt-1.5">该品牌下暂无关联商品，可放心删除。</p>
              ) : (
                <>
                  <p className="mt-1.5">
                    该品牌下仍有 <b className="text-rose-600">{brandProducts.length} 个关联商品</b>，删除后这些商品的品牌档案关联将被清空（商品本身保留）：
                  </p>
                  <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto pl-1">
                    {brandProducts.slice(0, 10).map((p) => (
                      <li key={p.id} className="truncate">· {p.name}（{p.is_active === false ? "暂存中" : "已上架"}）</li>
                    ))}
                    {brandProducts.length > 10 && <li>… 等共 {brandProducts.length} 个</li>}
                  </ul>
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button type="button" onClick={() => { setBrandDeleting(null); setBrandProducts(null); }} className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                取消
              </button>
              <button type="button" onClick={confirmBrandDelete} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 品牌恢复出厂 Modal（v1.88.1 补全统计与回填说明） */}
      {brandResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center gap-3 text-amber-600">
              <RotateCcw className="h-6 w-6" />
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">恢复出厂 —— 品牌库</h3>
            </div>
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <p className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>高危操作：品牌库全部数据将被清空（含管理员新增/修改），随后重灌系统初始内置品牌（41 条）。操作不可逆。</span>
              </p>
              <p className="mt-2 rounded-lg bg-white/70 p-2 dark:bg-gray-900/50">
                商品关联保护：恢复时会自动回填仍指向内置品牌（主键未变）的商品关联；管理员自建品牌下的商品关联会因品牌删除而清空，商品本身保留。
              </p>
            </div>
            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <div className="flex items-center justify-between">
                <span>当前库数据</span>
                <span className="font-semibold text-rose-600">{brandResetStats ? `${brandResetStats.current} 条` : "加载中…"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>恢复后内置数据</span>
                <span className="font-semibold text-emerald-600">{brandResetStats ? `${brandResetStats.builtin} 条` : "—"}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button type="button" onClick={() => setBrandResetOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                取消
              </button>
              <button type="button" disabled={resetting} onClick={confirmBrandReset} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
                {resetting ? "恢复中..." : "确认恢复出厂"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v1.88.2 导入结果明细弹窗（v1.88.3 支持接口错误常驻模式） */}
      {importResult && (
        <CsvImportResultModal
          open={!!importResult}
          kind={importResult.kind}
          title={importResult.title}
          created={importResult.created}
          errors={importResult.errors}
          message={importResult.message}
          onClose={() => setImportResult(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
