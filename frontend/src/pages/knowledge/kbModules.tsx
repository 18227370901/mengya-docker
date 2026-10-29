/**
 * v1.88 知识库管理中心 —— 各模块配置定义（配置驱动渲染，便于统一维护）
 * 模块：孕期周历/时间轴、胎教故事、孕期食谱、幼儿百科、待产包预置库
 */
import {
  BookOpen,
  CalendarDays,
  ChefHat,
  Heart,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  babyShoppingApi,
  fetalStoryApi,
  kidsEncyclopediaApi,
  knowledgeAdminApi,
  recipeApi,
  timelineApi,
  type KbExportPayload,
} from "@/api/catalog";

/* ============ 类型定义 ============ */

export type KbBatchAction = "delete" | "active" | "inactive" | "essential" | "unessential";

export interface KbFormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox";
  required?: boolean;
  placeholder?: string;
  options?: { value: string | number; label: string }[];
  rows?: number;
  /** 表单分组标题（相同分组的连续字段渲染在同一卡片内） */
  group?: string;
}

export interface KbColumn {
  label: string;
  key?: string;
  render?: (item: any) => ReactNode;
  className?: string;
}

export interface KbFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface KbStatsCard {
  /** stats 字典键（total 表示列表 total） */
  key: string;
  label: string;
  color: string;
}

/** v1.88.1 行内状态开关列（可多个：时间轴同时有 必读 + 启用 两个开关） */
export interface KbStatusSwitch {
  /** 开关对应的数据字段（如 is_essential / is_active） */
  field: string;
  /** 列标题（表头用） */
  header: string;
  /** [开启文案, 关闭文案] */
  labels: [string, string];
  onValue: any;
  offValue: any;
  /** 单条状态切换 API */
  toggleApi: (id: number, value: any) => Promise<any>;
}

export interface KbTemplateColumnSpec {
  headerCn: string;
  headerEn: string;
  required: boolean;
  desc: string;
  example: string;
}

export interface KbModuleConfig {
  /** 恢复出厂的模块键 */
  key: string;
  title: string;
  icon: LucideIcon;
  desc: string;
  /** 权限键 */
  permMenu: string;
  permManage: string;
  /** 列表 API（服务端分页） */
  listApi: (params: Record<string, any>) => Promise<any>;
  /** 批量 API */
  batchApi: (ids: number[], action: KbBatchAction) => Promise<any>;
  /** 单条删除 API */
  removeApi: (id: number) => Promise<any>;
  /** 保存 API（id 为空表示新增） */
  saveApi: (id: number | null, data: Record<string, any>) => Promise<any>;
  /** 恢复出厂 API */
  resetApi: () => Promise<any>;
  /** CSV 导入导出（可选）；v1.88.1 导出改 POST + scope 三选，模板双语 */
  csv?: {
    exportCsv: (payload: KbExportPayload) => Promise<Blob>;
    importCsv: (file: File) => Promise<any>;
    importTemplate: (lang?: "cn" | "en") => Promise<Blob>;
  };
  filters: KbFilter[];
  searchPlaceholder: string;
  /** v1.88.1 行内状态开关列（可多个） */
  statusSwitches: KbStatusSwitch[];
  batchActions: KbBatchAction[];
  columns: KbColumn[];
  statsCards: KbStatsCard[];
  formFields: KbFormField[];
  formTitle: (editing: boolean) => string;
  defaultForm: Record<string, any>;
  /** 编辑时从列表条目提取表单值 */
  toForm: (item: any) => Record<string, any>;
  unitLabel: string;
  /** v1.88.4 模板字段规范明细表（用于帮助弹窗直观展示与校验规则） */
  templateSpecs?: KbTemplateColumnSpec[];
}

/* ============ 公共渲染 ============ */

const TAG_CLS = "rounded-full px-2 py-0.5 text-[10px] font-medium";

/* ============ 模块配置 ============ */

export const KB_MODULES: KbModuleConfig[] = [
  /* ---------- 1. 孕期周历 / 时间轴 / 本周重点 ---------- */
  {
    key: "timeline",
    title: "孕期周历/时间轴",
    icon: CalendarDays,
    desc: "覆盖首页本周重点、孕期周历 40 周与时间轴全部事件（204 条内置）",
    permMenu: "menu_admin_kb_timeline",
    permManage: "kb_timeline_manage",
    listApi: (params) => timelineApi.listPaged(params),
    batchApi: (ids, action) => timelineApi.batch(ids, action as any),
    removeApi: (id) => timelineApi.remove(id),
    saveApi: (id, data) => (id ? timelineApi.update(id, data as any) : timelineApi.create(data as any)),
    resetApi: () => knowledgeAdminApi.reset("timeline"),
    csv: {
      exportCsv: (payload) => timelineApi.exportCsv(payload),
      importCsv: (f) => timelineApi.importCsv(f),
      importTemplate: (lang) => timelineApi.importTemplate(lang),
    },
    filters: [
      {
        key: "stage",
        label: "阶段",
        options: [
          { value: "", label: "全部阶段" },
          { value: "pregnancy", label: "孕期" },
          { value: "baby", label: "0-1岁" },
          { value: "toddler", label: "1-3岁" },
          { value: "preschool", label: "3-6岁" },
        ],
      },
      {
        key: "essential_filter",
        label: "必读",
        options: [
          { value: "", label: "全部" },
          { value: "essential", label: "仅必读" },
          { value: "normal", label: "仅普通" },
        ],
      },
      {
        key: "status",
        label: "状态",
        options: [
          { value: "", label: "全部状态" },
          { value: "active", label: "已启用" },
          { value: "inactive", label: "已停用" },
        ],
      },
    ],
    searchPlaceholder: "搜索标题 / 副标题 / 内容...",
    // v1.88.1 时间轴双开关：必读重点（is_essential）+ 启用状态（is_active）
    statusSwitches: [
      {
        field: "is_essential",
        header: "必读",
        labels: ["必读", "普通"],
        onValue: true,
        offValue: false,
        toggleApi: (id, value) => timelineApi.update(id, { is_essential: value } as any),
      },
      {
        field: "is_active",
        header: "状态",
        labels: ["已启用", "已停用"],
        onValue: true,
        offValue: false,
        toggleApi: (id, value) => timelineApi.update(id, { is_active: value } as any),
      },
    ],
    batchActions: ["essential", "unessential", "active", "inactive", "delete"],
    columns: [
      { label: "ID", key: "id", className: "w-12 text-center" },
      {
        label: "阶段",
        render: (item) => (
          <div className="text-[11px] whitespace-nowrap">
            <span className="font-medium text-gray-700 dark:text-gray-300">{item.stage_label}</span>
            <span className="ml-1 text-gray-400">{item.stage_value}</span>
          </div>
        ),
      },
      {
        label: "分类",
        render: (item) => <span className={`${TAG_CLS} bg-blue-50 text-blue-600`}>{item.category_label}</span>,
      },
      {
        label: "标题与内容",
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900 line-clamp-1 dark:text-gray-100">{item.title}</div>
            <p className="line-clamp-1 text-[11px] text-gray-400">{item.content}</p>
          </div>
        ),
      },
    ],
    statsCards: [
      { key: "total", label: "总事件数", color: "text-brand-600" },
      { key: "essential_count", label: "必读重点", color: "text-rose-500" },
      { key: "pregnancy_count", label: "孕期条目", color: "text-pink-500" },
      { key: "baby_count", label: "育儿条目", color: "text-emerald-600" },
    ],
    formFields: [
      { key: "stage_type", label: "阶段类型", type: "select", required: true, group: "基本信息", options: [
        { value: "pregnancy_week", label: "孕周" },
        { value: "baby_age_day", label: "宝宝天数" },
        { value: "baby_age_month", label: "宝宝月龄" },
        { value: "pregnancy_trimester", label: "孕早期/中期/晚期" },
      ] },
      { key: "stage_value", label: "阶段值（周/天/月）", type: "number", required: true, group: "基本信息" },
      { key: "category", label: "分类", type: "select", required: true, group: "基本信息", options: [
        { value: "milestone", label: "胎儿发育" },
        { value: "food", label: "饮食" },
        { value: "checkup", label: "产检" },
        { value: "health", label: "健康护理" },
        { value: "education", label: "胎教建议" },
        { value: "exercise", label: "运动建议" },
        { value: "emotion", label: "心理情绪" },
        { value: "shopping", label: "购物准备" },
        { value: "clothing", label: "穿衣" },
        { value: "housing", label: "居家" },
        { value: "travel", label: "出行" },
      ] },
      { key: "title", label: "标题", type: "text", required: true, placeholder: "如：孕10周：胎儿发育关键期", group: "基本信息" },
      { key: "subtitle", label: "副标题", type: "text", group: "基本信息" },
      { key: "content", label: "详细内容", type: "textarea", required: true, rows: 5, group: "基本信息" },
      { key: "tips", label: "小贴士", type: "textarea", rows: 2, group: "基本信息" },
      { key: "cover_image", label: "封面图 URL", type: "text", placeholder: "可选", group: "展示设置" },
      { key: "sort_order", label: "排序权重", type: "number", group: "展示设置" },
      { key: "is_essential", label: "标记为首页必读重点", type: "checkbox", group: "展示设置" },
      { key: "is_active", label: "启用展示（停用后前台不显示）", type: "checkbox", group: "展示设置" },
    ],
    formTitle: (e) => (e ? "编辑时间轴事件" : "新增时间轴事件"),
    defaultForm: { stage_type: "pregnancy_week", stage_value: 1, category: "health", title: "", subtitle: "", content: "", tips: "", cover_image: "", sort_order: 0, is_essential: false, is_active: true },
    toForm: (item) => ({
      stage_type: item.stage_type, stage_value: item.stage_value, category: item.category,
      title: item.title, subtitle: item.subtitle || "", content: item.content,
      tips: item.tips || "", cover_image: item.cover_image || "", sort_order: item.sort_order ?? 0,
      is_essential: item.is_essential,
      is_active: item.is_active ?? true,
    }),
    unitLabel: "条事件",
    templateSpecs: [
      { headerCn: "阶段类型*", headerEn: "stage_type*", required: true, desc: "pregnancy_week(孕周) / baby_age_day(宝宝天数) / baby_age_month(宝宝月龄) / pregnancy_trimester(孕期三阶段)", example: "pregnancy_week" },
      { headerCn: "阶段值*", headerEn: "stage_value*", required: true, desc: "整数数字（如孕周填10、宝宝天数填30、月龄填3）", example: "10" },
      { headerCn: "分类*", headerEn: "category*", required: true, desc: "food/clothing/housing/travel/health/shopping/milestone/emotion/exercise/checkup/education", example: "health" },
      { headerCn: "标题*", headerEn: "title*", required: true, desc: "事件主标题（必填）", example: "孕10周：胎儿发育关键期" },
      { headerCn: "副标题", headerEn: "subtitle", required: false, desc: "简短副标题或核心摘要（选填）", example: "神经系统快速发育" },
      { headerCn: "详细内容*", headerEn: "content*", required: true, desc: "详尽指导与科普正文，支持多行换行（必填）", example: "本周宝宝神经系统快速发育……" },
      { headerCn: "小贴士", headerEn: "tips", required: false, desc: "备忘建议或注意事项（选填）", example: "补充叶酸、均衡饮食" },
      { headerCn: "封面图URL", headerEn: "cover_image", required: false, desc: "图片网络URL地址（选填）", example: "https://example.com/cover.jpg" },
      { headerCn: "必读（是/否）", headerEn: "is_essential(Yes/No)", required: false, desc: "是/否，留空默认否（标为首页必读）", example: "是" },
      { headerCn: "排序权重", headerEn: "sort_order", required: false, desc: "数字越大越靠前（默认0）", example: "0" },
      { headerCn: "是否启用（是/否）", headerEn: "is_active(Yes/No)", required: false, desc: "是/否，留空默认是（前台是否展示）", example: "是" },
    ],
  },

  /* ---------- 2. 胎教故事 ---------- */
  {
    key: "fetal_stories",
    title: "胎教故事",
    icon: Heart,
    desc: "按孕周天序排列的中英双语胎教故事（245 条内置，17-40 周）",
    permMenu: "menu_admin_kb_stories",
    permManage: "kb_stories_manage",
    listApi: (params) => fetalStoryApi.listPaged(params),
    batchApi: (ids, action) => fetalStoryApi.batch(ids, action as any),
    removeApi: (id) => fetalStoryApi.remove(id),
    saveApi: (id, data) => (id ? fetalStoryApi.update(id, data as any) : fetalStoryApi.create(data as any)),
    resetApi: () => knowledgeAdminApi.reset("fetal_stories"),
    csv: {
      exportCsv: (payload) => fetalStoryApi.exportCsv(payload),
      importCsv: (f) => fetalStoryApi.importCsv(f),
      importTemplate: (lang) => fetalStoryApi.importTemplate(lang),
    },
    filters: [
      {
        key: "narrator",
        label: "讲述者",
        options: [
          { value: "", label: "全部" },
          { value: "mom", label: "妈妈讲" },
          { value: "dad", label: "爸爸讲" },
          { value: "either", label: "都可以" },
        ],
      },
      {
        key: "status",
        label: "状态",
        options: [
          { value: "", label: "全部" },
          { value: "active", label: "已启用" },
          { value: "inactive", label: "已停用" },
        ],
      },
    ],
    searchPlaceholder: "搜索中英文标题 / 正文...",
    statusSwitches: [
      {
        field: "is_active",
        header: "状态",
        labels: ["已启用", "已停用"],
        onValue: true,
        offValue: false,
        toggleApi: (id, value) => fetalStoryApi.update(id, { is_active: value } as any),
      },
    ],
    batchActions: ["active", "inactive", "delete"],
    columns: [
      { label: "ID", key: "id", className: "w-12 text-center" },
      {
        label: "孕周排期",
        render: (item) => (
          <div className="text-[11px] whitespace-nowrap">
            <span className="font-semibold text-brand-600">孕{item.week_start}周</span>
            <span className="ml-1 text-gray-400">+{item.day_offset}天 #{item.day_index}</span>
          </div>
        ),
      },
      {
        label: "标题",
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900 line-clamp-1 dark:text-gray-100">{item.title}</div>
            {item.title_en && <div className="line-clamp-1 text-[11px] text-gray-400">{item.title_en}</div>}
          </div>
        ),
      },
      {
        label: "讲述者",
        render: (item) => (
          <span className={`${TAG_CLS} bg-pink-50 text-pink-600`}>
            {item.narrator === "mom" ? "妈妈讲" : item.narrator === "dad" ? "爸爸讲" : "都可以"}
          </span>
        ),
      },
    ],
    statsCards: [
      { key: "total", label: "总故事数", color: "text-brand-600" },
      { key: "active_count", label: "已启用", color: "text-emerald-600" },
      { key: "inactive_count", label: "已停用", color: "text-gray-400" },
      { key: "weeks_count", label: "覆盖孕周", color: "text-purple-500" },
    ],
    formFields: [
      { key: "title", label: "故事标题（中文）", type: "text", required: true, group: "基本信息" },
      { key: "title_en", label: "故事标题（英文）", type: "text", group: "基本信息" },
      { key: "subtitle", label: "副标题 / 寓意", type: "text", group: "基本信息" },
      { key: "subtitle_en", label: "英文副标题", type: "text", group: "基本信息" },
      { key: "week_start", label: "起始孕周", type: "number", required: true, group: "排期设置" },
      { key: "day_offset", label: "天数偏移", type: "number", group: "排期设置" },
      { key: "day_index", label: "当天序号", type: "number", group: "排期设置" },
      { key: "narrator", label: "适合讲述者", type: "select", group: "排期设置", options: [
        { value: "mom", label: "妈妈讲" },
        { value: "dad", label: "爸爸讲" },
        { value: "either", label: "都可以" },
      ] },
      { key: "sort_order", label: "排序权重", type: "number", group: "排期设置" },
      { key: "content", label: "故事正文（中文）", type: "textarea", required: true, rows: 6, group: "中文内容" },
      { key: "tips", label: "胎教提示（中文）", type: "textarea", rows: 2, group: "中文内容" },
      { key: "content_en", label: "故事正文（英文）", type: "textarea", rows: 6, group: "英文内容" },
      { key: "tips_en", label: "胎教提示（英文）", type: "textarea", rows: 2, group: "英文内容" },
      { key: "cover_image", label: "封面图 URL", type: "text", placeholder: "可选", group: "展示设置" },
      { key: "source", label: "来源", type: "text", group: "展示设置" },
      { key: "source_en", label: "英文来源", type: "text", group: "展示设置" },
      { key: "is_active", label: "立即启用展示", type: "checkbox", group: "展示设置" },
    ],
    formTitle: (e) => (e ? "编辑胎教故事" : "新增胎教故事"),
    defaultForm: { title: "", title_en: "", subtitle: "", subtitle_en: "", week_start: 17, day_offset: 0, day_index: 1, narrator: "mom", sort_order: 0, content: "", tips: "", content_en: "", tips_en: "", cover_image: "", source: "", source_en: "", is_active: true },
    toForm: (item) => ({
      title: item.title, title_en: item.title_en || "", subtitle: item.subtitle || "", subtitle_en: item.subtitle_en || "",
      week_start: item.week_start, day_offset: item.day_offset, day_index: item.day_index,
      narrator: item.narrator, sort_order: item.sort_order ?? 0,
      content: item.content, tips: item.tips || "", content_en: item.content_en || "", tips_en: item.tips_en || "",
      cover_image: item.cover_image || "", source: item.source || "", source_en: item.source_en || "",
      is_active: item.is_active ?? true,
    }),
    unitLabel: "个故事",
    templateSpecs: [
      { headerCn: "标题（中文）*", headerEn: "title*", required: true, desc: "故事中文名称（必填）", example: "月亮婆婆的摇篮曲" },
      { headerCn: "英文标题", headerEn: "title_en", required: false, desc: "故事英文名称（选填）", example: "Moon Lullaby" },
      { headerCn: "副标题", headerEn: "subtitle", required: false, desc: "故事寓意或副标题（选填）", example: "温柔与安全感" },
      { headerCn: "英文副标题", headerEn: "subtitle_en", required: false, desc: "英文副标题（选填）", example: "Gentleness and security" },
      { headerCn: "起始孕周*", headerEn: "week_start*", required: true, desc: "起始孕周整数（17-40周）（必填）", example: "17" },
      { headerCn: "天数偏移", headerEn: "day_offset", required: false, desc: "周内天数偏移（0-6，0表示第1天）", example: "0" },
      { headerCn: "当天序号", headerEn: "day_index", required: false, desc: "同一天内故事排序序号（从1开始）", example: "1" },
      { headerCn: "故事正文（中文）*", headerEn: "content*", required: true, desc: "中文故事全文内容，支持换行（必填）", example: "夜幕降临，月亮婆婆轻轻哼起了摇篮曲……" },
      { headerCn: "英文正文", headerEn: "content_en", required: false, desc: "英文故事内容对照（选填）", example: "Night falls, and Grandma Moon hums..." },
      { headerCn: "胎教提示（中文）", headerEn: "tips", required: false, desc: "准爸妈伴读温馨提示（选填）", example: "睡前轻声讲述，配合轻抚腹部节奏感更佳。" },
      { headerCn: "英文提示", headerEn: "tips_en", required: false, desc: "英文胎教提示（选填）", example: "Tell it softly before sleep..." },
      { headerCn: "封面图URL", headerEn: "cover_image", required: false, desc: "插画封面图片网络URL（选填）", example: "" },
      { headerCn: "讲述者", headerEn: "narrator", required: false, desc: "mom(妈妈讲) / dad(爸爸讲) / either(都可以)，默认 mom", example: "mom" },
      { headerCn: "来源", headerEn: "source", required: false, desc: "故事出处或作者（选填）", example: "格林童话" },
      { headerCn: "英文来源", headerEn: "source_en", required: false, desc: "英文来源出处（选填）", example: "" },
      { headerCn: "排序权重", headerEn: "sort_order", required: false, desc: "排序权重数字（默认0）", example: "0" },
      { headerCn: "是否启用（是/否）", headerEn: "is_active(Yes/No)", required: false, desc: "是/否，留空默认是", example: "是" },
    ],
  },

  /* ---------- 3. 孕期食谱 ---------- */
  {
    key: "recipes",
    title: "孕期食谱",
    icon: ChefHat,
    desc: "孕期早/中/晚三阶段专属怀孕餐（288 道内置）",
    permMenu: "menu_admin_kb_recipes",
    permManage: "kb_recipes_manage",
    listApi: (params) => recipeApi.listPaged(params),
    batchApi: (ids, action) => recipeApi.batch(ids, action as any),
    removeApi: (id) => recipeApi.remove(id),
    saveApi: (id, data) => (id ? recipeApi.update(id, data as any) : recipeApi.create(data as any)),
    resetApi: () => knowledgeAdminApi.reset("recipes"),
    csv: {
      exportCsv: (payload) => recipeApi.exportCsv(payload),
      importCsv: (f) => recipeApi.importCsv(f),
      importTemplate: (lang) => recipeApi.importTemplate(lang),
    },
    filters: [
      {
        key: "period",
        label: "孕期阶段",
        options: [
          { value: "", label: "全部" },
          { value: "early", label: "孕早期" },
          { value: "mid", label: "孕中期" },
          { value: "late", label: "孕晚期" },
        ],
      },
      {
        key: "status",
        label: "状态",
        options: [
          { value: "", label: "全部" },
          { value: "active", label: "已启用" },
          { value: "inactive", label: "已停用" },
        ],
      },
    ],
    searchPlaceholder: "搜索菜名 / 营养标签 / 食材...",
    statusSwitches: [
      {
        field: "is_active",
        header: "状态",
        labels: ["已启用", "已停用"],
        onValue: true,
        offValue: false,
        toggleApi: (id, value) => recipeApi.update(id, { is_active: value } as any),
      },
    ],
    batchActions: ["active", "inactive", "delete"],
    columns: [
      { label: "ID", key: "id", className: "w-12 text-center" },
      {
        label: "菜品名称",
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900 line-clamp-1 dark:text-gray-100">{item.title}</div>
            <p className="line-clamp-1 text-[11px] text-gray-400">{item.ingredients}</p>
          </div>
        ),
      },
      {
        label: "营养标签",
        render: (item) => (
          <span className={`${TAG_CLS} bg-emerald-50 text-emerald-600 line-clamp-1`}>{item.nutrient_tag || "—"}</span>
        ),
      },
      {
        label: "阶段",
        render: (item) => (
          <span className={`${TAG_CLS} bg-amber-50 text-amber-600`}>{item.period_label}</span>
        ),
      },
    ],
    statsCards: [
      { key: "total", label: "总食谱数", color: "text-brand-600" },
      { key: "active_count", label: "已启用", color: "text-emerald-600" },
      { key: "inactive_count", label: "已停用", color: "text-gray-400" },
    ],
    formFields: [
      { key: "title", label: "菜品名称", type: "text", required: true, group: "基本信息" },
      { key: "nutrient_tag", label: "营养标签", type: "text", placeholder: "如：高蛋白·DHA", group: "基本信息" },
      { key: "period", label: "孕期阶段", type: "select", required: true, group: "基本信息", options: [
        { value: "early", label: "孕早期（1-12周）" },
        { value: "mid", label: "孕中期（13-27周）" },
        { value: "late", label: "孕晚期（28-40周）" },
      ] },
      { key: "period_month", label: "月份分组", type: "text", placeholder: "如 month_5_6，可选", group: "基本信息" },
      { key: "ingredients", label: "材料（支持多行）", type: "textarea", required: true, rows: 3, group: "做法内容" },
      { key: "steps", label: "做法步骤（支持多行）", type: "textarea", required: true, rows: 4, group: "做法内容" },
      { key: "nutrition_tip", label: "营养小叮咛", type: "textarea", rows: 2, group: "做法内容" },
      { key: "cover_image", label: "封面图 URL", type: "text", placeholder: "可选", group: "展示设置" },
      { key: "sort_order", label: "排序权重", type: "number", group: "展示设置" },
      { key: "is_active", label: "立即启用展示", type: "checkbox", group: "展示设置" },
    ],
    formTitle: (e) => (e ? "编辑孕期食谱" : "新增孕期食谱"),
    defaultForm: { title: "", nutrient_tag: "", period: "mid", period_month: "", ingredients: "", steps: "", nutrition_tip: "", cover_image: "", sort_order: 0, is_active: true },
    toForm: (item) => ({
      title: item.title, nutrient_tag: item.nutrient_tag || "", period: item.period, period_month: item.period_month || "",
      ingredients: item.ingredients, steps: item.steps, nutrition_tip: item.nutrition_tip || "",
      cover_image: item.cover_image || "", sort_order: item.sort_order ?? 0, is_active: item.is_active ?? true,
    }),
    unitLabel: "道食谱",
    templateSpecs: [
      { headerCn: "标题*", headerEn: "title*", required: true, desc: "菜品名称（必填）", example: "清蒸鲈鱼" },
      { headerCn: "营养标签", headerEn: "nutrient_tag", required: false, desc: "营养标签（选填，如：高蛋白·DHA·清淡）", example: "高蛋白·DHA" },
      { headerCn: "孕期阶段*", headerEn: "period*", required: true, desc: "early(孕早期1-12周) / mid(孕中期13-27周) / late(孕晚期28-40周)", example: "mid" },
      { headerCn: "月份分组", headerEn: "period_month", required: false, desc: "月份分组代码，如 month_5_6（可选留空）", example: "month_5_6" },
      { headerCn: "材料*", headerEn: "ingredients*", required: true, desc: "食材清单与用量，支持换行（必填）", example: "鲈鱼一条约500g\n姜丝适量" },
      { headerCn: "做法步骤*", headerEn: "steps*", required: true, desc: "烹饪步骤，支持多行换行（必填）", example: "1. 鲈鱼洗净划刀\n2. 大火蒸8分钟" },
      { headerCn: "营养小叮咛", headerEn: "nutrition_tip", required: false, desc: "营养贴士或孕期食用注意（选填）", example: "孕中期优质蛋白助力大脑发育" },
      { headerCn: "封面图URL", headerEn: "cover_image", required: false, desc: "菜品图片网络URL（选填）", example: "" },
      { headerCn: "排序权重", headerEn: "sort_order", required: false, desc: "排序权重数字（默认0）", example: "0" },
      { headerCn: "是否启用（是/否）", headerEn: "is_active(Yes/No)", required: false, desc: "是/否，留空默认是", example: "是" },
    ],
  },

  /* ---------- 4. 幼儿百科 ---------- */
  {
    key: "encyclopedia",
    title: "幼儿百科",
    icon: BookOpen,
    desc: "幼儿身体与认知趣味问答（57 问内置，4 大篇章）",
    permMenu: "menu_admin_kb_encyclopedia",
    permManage: "kb_encyclopedia_manage",
    listApi: (params) => kidsEncyclopediaApi.listPaged(params),
    batchApi: (ids, action) => kidsEncyclopediaApi.batch(ids, action as any),
    removeApi: (id) => kidsEncyclopediaApi.remove(id),
    saveApi: (id, data) => (id ? kidsEncyclopediaApi.update(id, data as any) : kidsEncyclopediaApi.create(data as any)),
    resetApi: () => knowledgeAdminApi.reset("encyclopedia"),
    csv: {
      exportCsv: (payload) => kidsEncyclopediaApi.exportCsv(payload),
      importCsv: (f) => kidsEncyclopediaApi.importCsv(f),
      importTemplate: (lang) => kidsEncyclopediaApi.importTemplate(lang),
    },
    filters: [
      {
        key: "chapter",
        label: "章节",
        options: [
          { value: "", label: "全部篇章" },
          { value: "origin", label: "我从哪里来" },
          { value: "body", label: "我的身体" },
          { value: "growth", label: "我的成长" },
          { value: "mystery", label: "身体的奥秘" },
        ],
      },
      {
        key: "status",
        label: "状态",
        options: [
          { value: "", label: "全部" },
          { value: "active", label: "已启用" },
          { value: "inactive", label: "已停用" },
        ],
      },
    ],
    searchPlaceholder: "搜索问题 / 答案 / 选项...",
    statusSwitches: [
      {
        field: "is_active",
        header: "状态",
        labels: ["已启用", "已停用"],
        onValue: true,
        offValue: false,
        toggleApi: (id, value) => kidsEncyclopediaApi.update(id, { is_active: value } as any),
      },
    ],
    batchActions: ["active", "inactive", "delete"],
    columns: [
      { label: "ID", key: "id", className: "w-12 text-center" },
      {
        label: "篇章 / 题号",
        render: (item) => (
          <div className="text-[11px] whitespace-nowrap">
            <span className={`${TAG_CLS} bg-violet-50 text-violet-600`}>{item.chapter_label}</span>
            <span className="ml-1 text-gray-400">Q{item.question_number}</span>
          </div>
        ),
      },
      {
        label: "问题与答案",
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900 line-clamp-1 dark:text-gray-100">{item.question}</div>
            <p className="line-clamp-1 text-[11px] text-gray-400">{item.answer}</p>
          </div>
        ),
      },
    ],
    statsCards: [
      { key: "total", label: "总问答数", color: "text-brand-600" },
      { key: "active_count", label: "已启用", color: "text-emerald-600" },
      { key: "inactive_count", label: "已停用", color: "text-gray-400" },
    ],
    formFields: [
      { key: "chapter", label: "章节", type: "select", required: true, group: "基本信息", options: [
        { value: "origin", label: "我从哪里来" },
        { value: "body", label: "我的身体" },
        { value: "growth", label: "我的成长" },
        { value: "mystery", label: "身体的奥秘" },
      ] },
      { key: "question_number", label: "问题编号", type: "number", required: true, group: "基本信息" },
      { key: "question", label: "问题", type: "text", required: true, group: "基本信息" },
      { key: "option_a", label: "选项 A", type: "text", group: "选项与解答" },
      { key: "option_b", label: "选项 B", type: "text", group: "选项与解答" },
      { key: "option_c", label: "选项 C", type: "text", group: "选项与解答" },
      { key: "answer", label: "解答正文", type: "textarea", required: true, rows: 4, group: "选项与解答" },
      { key: "comic_dialogue", label: "漫画对话", type: "textarea", rows: 2, group: "选项与解答" },
      { key: "cover_image", label: "配图 URL", type: "text", placeholder: "可选", group: "展示设置" },
      { key: "sort_order", label: "排序权重", type: "number", group: "展示设置" },
      { key: "is_active", label: "立即启用展示", type: "checkbox", group: "展示设置" },
    ],
    formTitle: (e) => (e ? "编辑百科问答" : "新增百科问答"),
    defaultForm: { chapter: "body", question_number: 1, question: "", option_a: "", option_b: "", option_c: "", answer: "", comic_dialogue: "", cover_image: "", sort_order: 0, is_active: true },
    toForm: (item) => ({
      chapter: item.chapter, question_number: item.question_number, question: item.question,
      option_a: item.option_a, option_b: item.option_b, option_c: item.option_c || "",
      answer: item.answer, comic_dialogue: item.comic_dialogue || "",
      cover_image: item.cover_image || "", sort_order: item.sort_order ?? 0, is_active: item.is_active ?? true,
    }),
    unitLabel: "条问答",
    templateSpecs: [
      { headerCn: "章节*", headerEn: "chapter*", required: true, desc: "origin(我从哪里来) / body(我的身体) / growth(我的成长) / mystery(身体的奥秘)", example: "body" },
      { headerCn: "题号*", headerEn: "question_number*", required: true, desc: "题号数字（如 1、2、3）（必填）", example: "1" },
      { headerCn: "问题*", headerEn: "question*", required: true, desc: "科学探索问题题目（必填）", example: "为什么我会肚子疼？" },
      { headerCn: "选项A", headerEn: "option_a", required: false, desc: "亲子互动趣味选项 A（选填）", example: "吃太饱啦" },
      { headerCn: "选项B", headerEn: "option_b", required: false, desc: "亲子互动趣味选项 B（选填）", example: "肚子着凉了" },
      { headerCn: "选项C", headerEn: "option_c", required: false, desc: "亲子互动趣味选项 C（选填）", example: "要拉便便了" },
      { headerCn: "解答正文*", headerEn: "answer*", required: true, desc: "科学严谨且通俗易懂的解答内容，支持换行（必填）", example: "小朋友的肚子里住着一位「小管家」……" },
      { headerCn: "漫画对话", headerEn: "comic_dialogue", required: false, desc: "亲子情景漫画生动对白（选填）", example: "" },
      { headerCn: "配图URL", headerEn: "cover_image", required: false, desc: "科普图解配图网络URL（选填）", example: "" },
      { headerCn: "排序权重", headerEn: "sort_order", required: false, desc: "排序权重数字（默认0）", example: "0" },
      { headerCn: "是否启用（是/否）", headerEn: "is_active(Yes/No)", required: false, desc: "是/否，留空默认是", example: "是" },
    ],
  },

  /* ---------- 5. 待产包预置库 ---------- */
  {
    key: "baby_shopping",
    title: "待产包预置库",
    icon: PackageSearch,
    desc: "智能待产包引用的妈妈篇/宝宝篇预置参考物品（69 条内置）",
    permMenu: "menu_admin_kb_shopping",
    permManage: "kb_shopping_manage",
    listApi: (params) => babyShoppingApi.list(params) as Promise<any>,
    batchApi: (ids, action) => babyShoppingApi.batch(ids, action as any),
    removeApi: (id) => babyShoppingApi.remove(id),
    saveApi: (id, data) => (id ? babyShoppingApi.update(id, data as any) : babyShoppingApi.create(data as any)),
    resetApi: () => knowledgeAdminApi.reset("baby_shopping"),
    csv: {
      exportCsv: (payload) => babyShoppingApi.exportCsv(payload),
      importCsv: (f) => babyShoppingApi.importCsv(f),
      importTemplate: (lang) => babyShoppingApi.importTemplate(lang),
    },
    filters: [
      {
        key: "owner",
        label: "归属",
        options: [
          { value: "", label: "全部" },
          { value: "mom", label: "妈妈篇" },
          { value: "baby", label: "宝宝篇" },
        ],
      },
      {
        key: "status",
        label: "状态",
        options: [
          { value: "", label: "全部" },
          { value: "active", label: "已启用" },
          { value: "inactive", label: "已停用" },
        ],
      },
    ],
    searchPlaceholder: "搜索物品名称 / 备注...",
    statusSwitches: [
      {
        field: "is_active",
        header: "状态",
        labels: ["已启用", "已停用"],
        onValue: true,
        offValue: false,
        toggleApi: (id, value) => babyShoppingApi.update(id, { is_active: value } as any),
      },
    ],
    batchActions: ["active", "inactive", "delete"],
    columns: [
      { label: "ID", key: "id", className: "w-12 text-center" },
      {
        label: "归属",
        render: (item) => (
          <span className={`${TAG_CLS} ${item.owner === "mom" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600"}`}>
            {item.owner_label}
          </span>
        ),
      },
      {
        label: "类别",
        render: (item) => <span className="text-[11px] text-gray-600 dark:text-gray-300">{item.category}</span>,
      },
      {
        label: "物品与数量",
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900 line-clamp-1 dark:text-gray-100">{item.name}</div>
            <p className="line-clamp-1 text-[11px] text-gray-400">
              {item.quantity}{item.unit} · 约 ¥{item.total_price ?? "—"}
            </p>
          </div>
        ),
      },
    ],
    statsCards: [
      { key: "total", label: "总物品数", color: "text-brand-600" },
      { key: "mom_count", label: "妈妈篇", color: "text-rose-500" },
      { key: "baby_count", label: "宝宝篇", color: "text-sky-500" },
      { key: "total_price_all", label: "预置总估价(¥)", color: "text-amber-600" },
    ],
    formFields: [
      { key: "owner", label: "物品归属", type: "select", required: true, group: "基本信息", options: [
        { value: "mom", label: "妈妈篇" },
        { value: "baby", label: "宝宝篇" },
      ] },
      { key: "category", label: "类别", type: "text", required: true, placeholder: "如：喂奶用品", group: "基本信息" },
      { key: "name", label: "物品名称", type: "text", required: true, group: "基本信息" },
      { key: "quantity", label: "建议数量", type: "text", placeholder: "如 3 或 3-4", group: "数量与价格" },
      { key: "unit", label: "单位", type: "text", placeholder: "件 / 片 / 条", group: "数量与价格" },
      { key: "unit_price", label: "单价 (元)", type: "number", group: "数量与价格" },
      { key: "total_price", label: "总价 (元)", type: "number", group: "数量与价格" },
      { key: "remark", label: "备注说明", type: "textarea", rows: 2, group: "展示设置" },
      { key: "image_url", label: "示例图片 URL", type: "text", placeholder: "可选", group: "展示设置" },
      { key: "sort_order", label: "排序权重", type: "number", group: "展示设置" },
      { key: "is_active", label: "立即启用展示", type: "checkbox", group: "展示设置" },
    ],
    formTitle: (e) => (e ? "编辑预置物品" : "新增预置物品"),
    defaultForm: { owner: "mom", category: "", name: "", quantity: "1", unit: "件", unit_price: null, total_price: null, remark: "", image_url: "", sort_order: 0, is_active: true },
    toForm: (item) => ({
      owner: item.owner, category: item.category, name: item.name,
      quantity: String(item.quantity ?? "1"), unit: item.unit || "件",
      unit_price: item.unit_price ?? null, total_price: item.total_price ?? null,
      remark: item.remark || "", image_url: item.image_url || "", sort_order: item.sort_order ?? 0,
      is_active: item.is_active ?? true,
    }),
    unitLabel: "件物品",
    templateSpecs: [
      { headerCn: "物品归属*", headerEn: "owner*", required: true, desc: "mom(妈妈篇) / baby(宝宝篇)（必填）", example: "mom" },
      { headerCn: "类别*", headerEn: "category*", required: true, desc: "待产证件/产后护理/哺乳用品/新生喂养/新生穿衣 等（必填）", example: "产后护理" },
      { headerCn: "物品名称*", headerEn: "name*", required: true, desc: "待产物品具体名称（必填）", example: "一次性产妇卫生巾套包" },
      { headerCn: "建议数量", headerEn: "quantity", required: false, desc: "建议备货数量（如：2 或 2-3，默认1）", example: "2" },
      { headerCn: "单位", headerEn: "unit", required: false, desc: "计量单位（如：包/件/盒/罐，默认件）", example: "包" },
      { headerCn: "单价(元)", headerEn: "unit_price", required: false, desc: "预估单价，数字（选填）", example: "39.9" },
      { headerCn: "总价(元)", headerEn: "total_price", required: false, desc: "预估总价，数字（选填）", example: "79.8" },
      { headerCn: "备注说明", headerEn: "remark", required: false, desc: "选购要点、适用阶段或温馨提示（选填）", example: "建议产前提前备齐，产后恶露期必备" },
      { headerCn: "示例图片URL", headerEn: "image_url", required: false, desc: "物品参考图片网络URL（选填）", example: "" },
      { headerCn: "排序权重", headerEn: "sort_order", required: false, desc: "排序权重数字（默认0）", example: "1" },
      { headerCn: "是否启用（是/否）", headerEn: "is_active(Yes/No)", required: false, desc: "是/否，留空默认是", example: "是" },
    ],
  },
];
