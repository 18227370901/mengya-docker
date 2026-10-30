export interface ThirdPartyPlatformResource {
  id: number;
  platform_id: number;
  title: string;
  path_or_url: string;
  description: string;
  icon: string;
  sort_order: number;
  is_enabled: boolean;
  access_rule: 'inherit' | 'restricted';
  allowed_user_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface ThirdPartyPlatform {
  id: number;
  name: string;
  url: string;
  logo_url: string;
  description: string;
  category: string;
  category_display: string;
  age_group: string;
  age_group_display: string;
  tags: string[];
  sort_order: number;
  is_enabled: boolean;
  visibility_type: 'all' | 'restricted';
  allowed_user_ids?: number[];
  created_by?: string;
  resources: ThirdPartyPlatformResource[];
  created_at?: string;
  updated_at?: string;
}

export interface PlatformMetaFetchResult {
  success: boolean;
  name: string;
  description: string;
  logo_url: string;
  url: string;
  message: string;
}


export interface PlatformUserOption {
  id: number;
  phone: string;
  username: string;
  nickname: string;
  role: string;
  is_staff: boolean;
}
