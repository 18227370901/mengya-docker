export interface User {
  id: number;
  phone: string;
  username?: string;
  nickname: string;
  role: string;
  avatar?: string;
  due_date?: string;
  baby_birthday?: string;
  is_pregnant: boolean;
  bio?: string;
  is_public_profile?: boolean;
  is_staff?: boolean;
  is_active?: boolean;
  ai_authorized?: boolean;
  security_question?: string;
  security_answer?: string;
  permissions?: Record<string, boolean>;
  created_at?: string;
}

export interface Stage {
  type: string;
  value: number;
  label: string;
  trimester?: string;
  period?: string;
  stage_key: string;
  is_pregnant: boolean;
  days?: number;
}

export interface BabyProfile {
  id: number;
  name: string;
  gender: string;
  birthday: string;
  is_born?: boolean;
  due_date?: string;
  gestation_weeks?: number;
  birth_weight?: number;
  birth_height?: number;
  birth_head_circumference?: number;
  is_primary: boolean;
  avatar?: string;
  note?: string;
  age_days?: number;
  age_months?: number;
  age_display?: string;
}

export interface BrandProfile {
  id: number;
  name: string;
  name_en?: string;
  logo?: string;
  country_of_origin?: string;
  positioning?: string;
  positioning_desc?: string;
  market_rank?: string;
  market_share?: string;
  brand_story?: string;
  official_url?: string;
  founded_year?: number;
  parent_company?: string;
}

export interface Product {
  id: number;
  name: string;
  brand: string;
  brand_profile?: BrandProfile;
  model?: string;
  image_url: string;
  gallery_images?: string[];
  first_category: string;
  first_category_label?: string;
  second_category: string;
  third_category?: string;
  specifications?: Record<string, unknown>;
  price_info?: {
    range?: string;
    avg?: number;
    taobao?: number;
    jd?: number;
    pdd?: number;
  };
  ratings?: {
    safety?: number;
    comfort?: number;
    functionality?: number;
    usability?: number;
    appearance?: number;
  };
  purchase_links?: {
    taobao?: string;
    jd?: string;
    pdd?: string;
    other?: string;
  };
  overall_rating: number;
  has_ccc_certification?: boolean;
  safety_alert?: string;
  test_report_source?: string;
  market_position?: Record<string, string>;
  applicable_age_start?: number;
  applicable_age_end?: number;
  description?: string;
  purchase_guide?: string;
  quantity_suggestion?: Record<string, unknown>;
  is_essential?: boolean;
  is_active?: boolean;
  view_count?: number;
  fav_count?: number;
}

export interface TimelineItem {
  id: number;
  stage_type: string;
  stage_value: number;
  category: string;
  category_label: string;
  stage_label: string;
  title: string;
  subtitle?: string;
  content: string;
  tips?: string;
  cover_image?: string;
  is_essential: boolean;
  view_count?: number;
  products: Product[];
}

export interface ShoppingListItem {
  id: number;
  product?: Product;
  provider_item?: number;
  custom_name?: string;
  owner?: string;
  owner_label?: string;
  category?: string;
  quantity: string | number;
  quantity_prepared?: number;
  unit?: string;
  unit_price?: string | null;
  total_price?: string | null;
  image_url?: string | null;
  extra_image_url?: string | null;
  purchase_status?: string;
  purchase_status_label?: string;
  is_checked: boolean;
  note?: string;
  sort_order?: number;
}

export interface ShoppingList {
  id: number;
  name: string;
  list_type: string;
  season: string;
  delivery_method: string;
  total_items: number;
  prepared_count: number;
  progress_percent: number;
  is_public: boolean;
  is_default_template: boolean;
  cover_image?: string;
  note?: string;
  items: ShoppingListItem[];
  created_at?: string;
}

export interface BabyShoppingItem {
  id: number;
  owner: "mom" | "baby";
  owner_label: string;
  category: string;
  name: string;
  quantity: string;
  unit: string;
  unit_price: string | null;
  total_price: string | null;
  remark: string;
  image_url: string | null;
  extra_image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface BabyShoppingListResponse {
  items: BabyShoppingItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  stats: {
    mom_count: number;
    baby_count: number;
    total_price_mom: string;
    total_price_baby: string;
    total_price_all: string;
  };
}

export interface BabyShoppingCategories {
  mom: string[];
  baby: string[];
}

export interface AIRecommendResult {
  summary?: string;
  categories?: Array<{
    category: string;
    owner: string;
    items: Array<{
      name: string;
      quantity: string;
      unit: string;
      remark: string;
      estimated_price: string;
    }>;
  }>;
  tips?: string;
  raw_content?: string;
}

export interface HealthRecord {
  id: number;
  record_type: string;
  record_date: string;
  note?: string;
  gestational_week?: number;
  exam_items?: Record<string, unknown>;
  baby_age_days?: number;
  height?: number;
  weight?: number;
  head_circumference?: number;
  vaccine_name?: string;
  vaccine_dose?: number;
  vaccine_site?: string;
  attachment_url?: string;
  ai_analysis?: string;
  baby?: number;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface CompareResult {
  comparison_id?: number;
  products: Array<{
    id: number;
    name: string;
    brand: string;
    image: string;
    price: Record<string, unknown>;
    ratings: Record<string, number>;
    overall: number;
    specs: Record<string, unknown>;
    safety: {
      ccc: boolean;
      alert?: string;
      test_source?: string;
    };
    purchase_guide?: string;
  }>;
  radar: {
    indicator: Array<{ name: string; max: number }>;
    series: Array<{ name: string; value: number[] }>;
  };
  recommendation: {
    labels: Array<{ type: string; label: string; product_id: number; desc: string }>;
    alerts: Array<{ product_id: number; product_name: string; alert: string }>;
  };
  price_comparison: {
    products: Record<number, { name: string; prices: Record<string, number>; avg: number; range: string }>;
    platform_labels: Record<string, string>;
    platforms: string[];
  };
  dimensions: Record<string, string>;
}

export interface AIChatResult {
  query: string;
  response: string;
  used_openai: boolean;
  used_config_name?: string;
  used_search?: boolean;
  latency_ms: number;
  suggestions: string[];
  session_id?: number;
  session_title?: string;
  error_hint?: string;
}

export interface ChatSessionSummary {
  id: number;
  title: string;
  message_count: number;
  last_message: string;
  last_role: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessageItem[];
}

export interface ChatMessageItem {
  id: number;
  role: "user" | "ai";
  content: string;
  used_config_name?: string;
  used_search?: boolean;
  error_hint?: string;
  created_at: string;
}

export interface Recipe {
  id: number;
  title: string;
  nutrient_tag: string;
  period: string;
  period_label: string;
  period_month: string;
  ingredients: string;
  steps: string;
  nutrition_tip: string;
  cover_image?: string;
  sort_order: number;
  view_count: number;
  created_at: string;
}

export interface FetalStory {
  id: number;
  title: string;
  title_en?: string;
  subtitle?: string;
  subtitle_en?: string;
  week_start: number;
  day_offset: number;
  day_index: number;
  content: string;
  content_en?: string;
  tips?: string;
  tips_en?: string;
  cover_image?: string;
  narrator: string;
  source?: string;
  source_en?: string;
  sort_order: number;
  view_count: number;
  created_at: string;
}

export interface KidsEncyclopedia {
  id: number;
  chapter: string;
  chapter_label: string;
  question_number: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  answer: string;
  comic_dialogue: string;
  cover_image?: string;
  sort_order: number;
  view_count: number;
  created_at: string;
}
export interface FavoriteItem {
  id: number;
  favorite_type: string;
  object_id: number;
  note: string;
  created_at: string;
  product?: {
    id: number;
    name: string;
    brand: string;
    image_url: string;
    overall_rating: number;
    price_info?: {
      range?: string;
      avg?: number;
      taobao?: number;
      jd?: number;
      pdd?: number;
    };
    first_category: string;
    first_category_label?: string;
    second_category?: string;
    purchase_links?: {
      taobao?: string;
      jd?: string;
      pdd?: string;
      other?: string;
    };
  };
}
