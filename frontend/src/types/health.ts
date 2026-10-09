// 孕产妇体重/BMI 分析与个性化方案类型定义 (WS/T 801-2022)

export type PregnancyStage = "pregnancy" | "postpartum";

export interface BmiAnalysisInput {
  height_cm: number;
  pre_pregnancy_weight_kg: number;
  current_weight_kg: number;
  stage_type: PregnancyStage;
  gestational_week?: number;
  postpartum_months?: number;
  is_twins: boolean;
  medical_history: string[];
  save_record?: boolean;
}

export interface CurvePoint {
  week: number;
  target_min: number;
  target_max: number;
  target_median: number;
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
}
