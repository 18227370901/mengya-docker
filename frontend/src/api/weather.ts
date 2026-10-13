import api from "./client";

export interface CurrentWeather {
  temperature: number;
  feels_like: number;
  humidity: number;
  weather_code: number;
  weather_text: string;
  icon: string;
  wind_speed: number;
  wind_direction: number;
  wind_direction_text: string;
  wind_gusts?: number;
  pressure?: number;
  cloud_cover?: number;
  precipitation?: number;
  time: string;
}

export interface DailyWeather {
  date: string;
  temp_max: number;
  temp_min: number;
  weather_code: number;
  weather_text: string;
  icon: string;
  precip_prob: number;
  precipitation: number;
  uv_index?: number;
  sunrise?: string;
  sunset?: string;
  wind_speed_max?: number;
}

export interface AirQuality {
  aqi?: number;
  us_aqi?: number;
  aqi_level?: string;
  pm2_5?: number;
  pm25?: number;
  pm10?: number;
}

export interface WeatherData {
  city: string;
  location?: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    province?: string;
    city?: string;
  };
  current: CurrentWeather;
  daily: DailyWeather[];
  air_quality?: AirQuality;
}

export interface HomeWeatherPayload {
  city: string;
  temp: number | null;
  desc: string;
  icon: string;
  code: number | null;
  today_max: number | null;
  today_min: number | null;
  tomorrow_max: number | null;
  tomorrow_min: number | null;
  update_time: string;
}

export interface HomeWeatherResponse {
  city: string;
  source: "user" | "admin" | "default";
  notice?: string;
  has_permission?: boolean;
  weather: HomeWeatherPayload | null;
  badge: { holiday: boolean; name: string } | null;
}

export interface HolidayItem {
  holiday: boolean;
  name: string;
}

export const weatherApi = {
  // 查询天气（支持坐标直查与城市名搜索，默认 15 天）
  query: (params: {
    lat?: number | string;
    lon?: number | string;
    label?: string;
    city?: string;
    province?: string;
    city2?: string;
    days?: number;
  }) => api.get<{ code: number; message: string; data: WeatherData }>("/weather/query/", { params }).then((r) => r.data.data),

  // 首页背景横幅轻量天气（30分钟缓存 + 今日班休）
  homeWeather: (city?: string) =>
    api.get<{ code: number; message: string; data: HomeWeatherResponse }>("/weather/home/", { params: city ? { city } : {} }).then((r) => r.data.data),

  // 法定节假日班休数据
  getHolidays: (year: number) =>
    api.get<{ code: number; message: string; data: { year: number; holiday: Record<string, HolidayItem> } }>(`/weather/holiday/${year}/`).then((r) => r.data.data),
};
