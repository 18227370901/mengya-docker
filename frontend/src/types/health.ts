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
  current_weight_kg?: number;
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
  systolic_bp?: number;
  diastolic_bp?: number;
  pulse?: number;
  blood_sugar?: number;
  glucose_type?: "fasting" | "postprandial_1h" | "postprandial_2h" | "bedtime" | "random";
  symptoms?: string[];
  note?: string;
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


// ============ 妈妈生命体征（血压、血糖）TypeScript 类型定义 ============

export interface VitalsAnalysisInput {
  record_date?: string;
  overwrite?: boolean;
  mother_id?: number | null;
  stage_type: PregnancyStage;
  gestational_week?: number;
  gestational_days?: number;
  postpartum_months?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  pulse?: number;
  blood_sugar?: number;
  glucose_type?: "fasting" | "postprandial_1h" | "postprandial_2h" | "bedtime" | "random";
  current_weight_kg?: number;
  height_cm?: number;
  symptoms?: string[];
  note?: string;
  request_ai?: boolean;
}

export interface VitalsBloodPressureEvaluation {
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  pulse_info?: {
    pulse: number;
    status: string;
    label: string;
    desc: string;
  } | null;
  status: "hypotension" | "normal" | "elevated" | "hypertension_stage1" | "hypertension_severe";
  status_label: string;
  severity: "info" | "warning" | "danger";
  color: "green" | "yellow" | "orange" | "red" | "blue";
  definition: string;
  clinical_advice: string;
  stage_type: PregnancyStage;
}

export interface VitalsBloodSugarEvaluation {
  glucose: number;
  glucose_type: string;
  glucose_type_label: string;
  target_range: string;
  status: "hypoglycemia" | "normal" | "elevated" | "high";
  status_label: string;
  severity: "info" | "warning" | "danger";
  color: "green" | "yellow" | "orange" | "red" | "blue";
  clinical_advice: string;
  stage_type: PregnancyStage;
}

export interface MetricsCompletenessItem {
  key: string;
  label: string;
  value?: string;
  badge?: string;
  status?: string;
  status_label?: string;
  hint?: string;
}

export interface MetricsCompleteness {
  has_bp: boolean;
  has_glucose: boolean;
  has_weight: boolean;
  has_pulse: boolean;
  recorded_items: MetricsCompletenessItem[];
  unrecorded_items: MetricsCompletenessItem[];
  recorded_count: number;
  unrecorded_count: number;
  summary_text: string;
}

export interface VitalsSummary {
  total_records: number;
  latest_bp?: {
    id?: number;
    record_date: string;
    systolic: number;
    diastolic: number;
    pulse?: number | null;
    status: string;
    status_label: string;
    color: string;
    severity: string;
  } | null;
  latest_glucose?: {
    id?: number;
    record_date: string;
    glucose: number;
    glucose_type: string;
    glucose_type_label: string;
    status: string;
    status_label: string;
    color: string;
    severity: string;
  } | null;
  avg_systolic_7d?: number | null;
  avg_diastolic_7d?: number | null;
  avg_glucose_7d?: number | null;
  abnormal_count: number;
}

export interface VitalsTimeSeriesRecord {
  id: number;
  record_date: string;
  stage: PregnancyStage;
  gestational_week?: number | null;
  gestational_days?: number | null;
  postpartum_months?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  pulse?: number | null;
  bp_status?: string | null;
  bp_status_label?: string | null;
  bp_color?: string | null;
  bp_clinical_advice?: string | null;
  blood_sugar?: number | null;
  glucose_type?: string | null;
  glucose_type_label?: string | null;
  glucose_status?: string | null;
  glucose_status_label?: string | null;
  glucose_color?: string | null;
  glucose_clinical_advice?: string | null;
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
  symptoms?: string[];
  completeness?: MetricsCompleteness;
  note?: string;
  ai_analysis?: string;
}

export interface VitalsAiResult {
  response: string;
  used_openai: boolean;
  used_config_name: string;
  latency_ms: number;
  error_hint?: string;
}

export interface VitalsAnalysisResult {
  created_record_id?: number | null;
  record_action?: "created" | "updated";
  bp_evaluation?: VitalsBloodPressureEvaluation | null;
  glucose_evaluation?: VitalsBloodSugarEvaluation | null;
  bmi?: number | null;
  completeness: MetricsCompleteness;
  alerts: MedicalAlert[];
  lifestyle_diet: {
    diet: string[];
    lifestyle: string[];
  };
  ai_analysis?: VitalsAiResult | null;
  timeseries: VitalsTimeSeriesRecord[];
  summary: VitalsSummary;
}
