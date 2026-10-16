// 孕产妇体重/BMI 分析与个性化方案类型定义 (WS/T 801-2022)

/** v1.56：pregnancy 孕期 / postpartum 产后 / general 非孕期（备孕·日常） */
export type PregnancyStage = "pregnancy" | "postpartum" | "general";

export interface BmiAnalysisInput {
  record_date?: string;
  /** v1.57：同日重复打卡覆盖开关（后端 409 后用户确认覆盖时携 true） */
  overwrite?: boolean;
  /** 留空自动继承上次打卡基线（首次打卡时后端初始化） */
  height_cm?: number;
  pre_pregnancy_weight_kg?: number;
  current_weight_kg: number;
  waist_circumference_cm?: number;
  stage_type: PregnancyStage;
  gestational_week?: number;
  /** v1.58：孕x周x天输入——周内天数（0~6；用户显式传值优先于推算值） */
  gestational_days?: number;
  postpartum_months?: number;
  is_twins: boolean;
  medical_history: string[];
  save_record?: boolean;
  mother_id?: number | null;
}

export interface CurvePoint {
  week: number;
  target_min: number;
  target_max: number;
  target_median: number;
}

export interface BmiTimeSeriesRecord {
  id: number;
  record_date: string;
  record_type: string;
  /** 妈妈记录阶段：pregnancy 孕期 / postpartum 产后 / general 非孕期（v1.55/1.56 语义统一） */
  stage?: "pregnancy" | "postpartum" | "general";
  gestational_week?: number | null;
  /** v1.58：孕x周x天粒度——周内天数（0~6，历史记录可能为空） */
  gestational_days?: number | null;
  height?: number | null;
  weight: number;
  waist_circumference?: number | null;
  bmi?: number | null;
  delta_kg: number;
  pre_weight?: number | null;
  cumulative_gain?: number | null;
  gain_status?: "below" | "normal" | "above" | null;
  is_twins?: boolean;
  postpartum_months?: number | null;
  note?: string;
}

export interface BmiCategoryInfo {
  bmi: number;
  category: "underweight" | "normal" | "overweight" | "obese";
  category_label: string;
  is_twins: boolean;
  stage_type: PregnancyStage;
  gestational_week?: number;
  postpartum_months?: number;
  recommended_total_gain_min?: number;
  recommended_total_gain_max?: number;
  recommended_weekly_gain?: string;
  current_week_target_min?: number;
  current_week_target_max?: number;
  actual_gain: number;
  gain_status: "below" | "normal" | "above";
  gain_status_label?: string;
  curve: CurvePoint[];
  weight_retention?: number;
  energy_extra_kcal?: number;
  protein_extra_g?: number;
  advice?: string;
}

export interface MedicalAlert {
  level: "danger" | "warning" | "info";
  code: string;
  title: string;
  description: string;
  action_advice: string;
}

export interface RecipeRecommendationItem {
  meal_type: "breakfast" | "morning_snack" | "lunch" | "afternoon_snack" | "dinner";
  meal_name: string;
  source_type: "platform" | "searxng_fallback" | "guideline_standard";
  source_id?: number;
  source_badge: string;
  source_url?: string;
  nutrient_tag?: string;
  ingredients: string;
  benefits: string;
  safety_passed: boolean;
  safety_tip?: string;
}

export interface LifestyleAdvice {
  exercise: string[];
  psychological_care: string[];
}

export interface BmiAnalysisResult {
  evaluation: BmiCategoryInfo;
  alerts: MedicalAlert[];
  diet_plan: RecipeRecommendationItem[];
  lifestyle_advice: LifestyleAdvice;
  disclaimer: string;
  created_record_id?: number | null;
  /** v1.57：created 首次归档 / updated 覆盖当日已有记录 */
  record_action?: "created" | "updated";
  timeseries?: BmiTimeSeriesRecord[];
  /** 孕周引擎校验结果（自动填充基准/提示语） */
  gestation_check?: {
    week: number | null;
    basis: string;
    auto_filled: boolean;
    hint: string;
  };
  /** 首次打卡时自动以当前体重初始化孕前基线 */
  baseline_initialized?: boolean;
}

export interface SearXNGConfig {
  base_url: string;
  timeout: number;
  format: string;
  engines: string;
  health_domains: string;
  health_domain_list?: string[];
  is_available: boolean;
  can_manage?: boolean;
  /** AI 助手公网引擎兜底开关（管理员可控，默认关闭） */
  ai_fallback_enabled?: boolean;
}

export interface SearXNGTestResult {
  /** v1.55.1：warning = 实例可达但上游引擎无结果（被限流/验证码封禁） */
  status: "success" | "warning" | "failed";
  latency_ms?: number;
  status_code?: number;
  sample_count?: number;
  /** v1.55.1：权威健康白名单通道检索样本数 */
  health_count?: number;
  sample_titles?: string[];
  /** v1.55.1：SearXNG 返回的暂不可用引擎清单 */
  unresponsive_engines?: string[];
  message: string;
}

/** v1.57：同日重复打卡 409 冲突载荷（后端 data 字段结构） */
export interface SameDayConflictPayload {
  conflict: boolean;
  conflict_code: number;
  existing_id: number;
  existing_date: string;
  existing_stage: string;
  existing_weight: number | null;
  existing_height: number | null;
  overwrite_supported: boolean;
}

/** v1.57：CSV 批量导入结果 */
export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; date: string; reason: string }>;
}
