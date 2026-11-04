# -*- coding: utf-8 -*-
"""
service_config.py — 外部接口服务配置管理（v2.09 增强：API Key / 鉴权头 / 适配协议体系）
"""
import json
import time
import requests

DEFAULT_GROUPS = {
    'geocoding': {
        'label': '地理编码定位服务',
        'type': 'endpoints',
        'defaults': [
            {
                'url': 'https://geocoding-api.open-meteo.com/v1/search',
                'enabled': True,
                'name': 'Open-Meteo 官方地理编码',
                'adapter': 'standard',
                'auth_type': 'none',
                'auth_key': '',
                'auth_value': '',
            }
        ],
        'timeout': 8,
        'retries': 0,
    },
    'forecast': {
        'label': '天气及气象预报服务',
        'type': 'endpoints',
        'defaults': [
            {
                'url': 'https://api.open-meteo.com/v1/forecast',
                'enabled': True,
                'name': 'Open-Meteo 15天全功能预报 (免Key)',
                'adapter': 'standard',
                'auth_type': 'none',
                'auth_key': '',
                'auth_value': '',
            }
        ],
        'timeout': 8,
        'retries': 0,
    },
    'air_quality': {
        'label': '空气质量与指数服务',
        'type': 'endpoints',
        'defaults': [
            {
                'url': 'https://air-quality-api.open-meteo.com/v1/air-quality',
                'enabled': True,
                'name': 'Open-Meteo 空气质量',
                'adapter': 'standard',
                'auth_type': 'none',
                'auth_key': '',
                'auth_value': '',
            }
        ],
        'timeout': 8,
        'retries': 0,
    },
    'holiday': {
        'label': '法定节假日日历',
        'type': 'endpoints',
        'defaults': [
            {
                'url': 'https://timor.tech/api/holiday/year/',
                'enabled': True,
                'name': 'Timor 节假日开放 API',
                'adapter': 'standard',
                'auth_type': 'none',
                'auth_key': '',
                'auth_value': '',
            }
        ],
        'timeout': 8,
        'retries': 0,
    },
    'search_pipeline': {
        'label': 'AI 公网搜索管线搜索引擎',
        'type': 'engines',
        'defaults': [
            {'key': 'duckduckgo', 'url': 'https://lite.duckduckgo.com/lite/', 'timeout': 1.0, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'google', 'url': 'https://www.google.com/search', 'timeout': 1.0, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'bing', 'url': 'https://cn.bing.com/search', 'timeout': 2.5, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'so', 'url': 'https://www.so.com/s', 'timeout': 2.0, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'sogou', 'url': 'https://www.sogou.com/web', 'timeout': 2.0, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'baidu', 'url': 'https://www.baidu.com/s', 'timeout': 1.5, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'yahoo', 'url': 'https://search.yahoo.com/search', 'timeout': 1.2, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
        ],
        'retries': 1,
    },
    'translation': {
        'label': '胎教故事及母婴双语翻译引擎',
        'type': 'engines',
        'defaults': [
            {'key': 'ai_model', 'url': 'internal://ai-model', 'timeout': 15.0, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'mymemory', 'url': 'https://api.mymemory.translated.net/get', 'timeout': 6.0, 'enabled': True, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'google_translate', 'url': 'https://translate.googleapis.com/translate_a/single', 'timeout': 5.0, 'enabled': False, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
            {'key': 'custom_api', 'url': 'https://api.fanyi.baidu.com/api/trans/vip/translate', 'timeout': 5.0, 'enabled': False, 'auth_type': 'none', 'auth_key': '', 'auth_value': ''},
        ],
        'retries': 1,
    },
}

ENGINE_LABELS = {
    'duckduckgo': 'DuckDuckGo',
    'google': 'Google',
    'bing': '微软 Bing',
    'so': '360搜索',
    'sogou': '搜狗搜索',
    'baidu': '百度搜索',
    'yahoo': '雅虎搜索',
    'ai_model': 'AI 母婴专有模型',
    'mymemory': 'MyMemory 翻译免Key端点',
    'google_translate': 'Google 翻译免密端点',
    'custom_api': '自定义开放翻译接口',
}

ENDPOINT_PRESETS = [
    {
        'id': 'open_meteo_forecast',
        'group': 'forecast',
        'name': 'Open-Meteo 15天全功能预报 (免Key推荐)',
        'url': 'https://api.open-meteo.com/v1/forecast',
        'adapter': 'standard',
        'auth_type': 'none',
        'auth_key': '',
        'desc': '全球高精度15天逐日预报、折线图、日出日落、紫外线，免API Key。',
    },
    {
        'id': 'uapis_weather_realtime',
        'group': 'forecast',
        'name': 'UAPIS 国内极简即时实况天气',
        'url': 'https://uapis.cn/api/v1/misc/weather',
        'adapter': 'uapis',
        'auth_type': 'none',
        'auth_key': '',
        'desc': '国内极速实况气温、风向风力与天气现象。前端天气页自适应为精细实时看板。',
    },
    {
        'id': 'qweather_forecast',
        'group': 'forecast',
        'name': '和风天气 QWeather 商业预报 API',
        'url': 'https://devapi.qweather.com/v7/weather/now',
        'adapter': 'qweather',
        'auth_type': 'query',
        'auth_key': 'key',
        'desc': '和风天气官方 Web API，需要填入您的开发者 API Key。',
    },
    {
        'id': 'amap_weather',
        'group': 'forecast',
        'name': '高德开放平台天气查询 API',
        'url': 'https://restapi.amap.com/v3/weather/weatherInfo',
        'adapter': 'amap',
        'auth_type': 'query',
        'auth_key': 'key',
        'desc': '高德官方 Web 服务天气 API，支持国内区县级天气实况。',
    },
    {
        'id': 'timor_holiday',
        'group': 'holiday',
        'name': 'Timor 节假日及调休日历',
        'url': 'https://timor.tech/api/holiday/year/',
        'adapter': 'standard',
        'auth_type': 'none',
        'auth_key': '',
        'desc': '权威法定节假日、调休工作日数据源，免 Key。',
    },
]

HOLIDAY_PLACEHOLDER = '{年份}'
HOLIDAY_FORMAT_PLACEHOLDER = '{}'

def mask_auth_value(val):
    if not val:
        return ''
    s = str(val).strip()
    if len(s) <= 6:
        return '****'
    return f'{s[:2]}****{s[-4:]}'

def is_masked_value(val):
    if not val:
        return False
    return '****' in str(val)

def _get_setting_obj():
    try:
        from apps.core.models.system import SystemSetting
        return SystemSetting.get_settings()
    except Exception:
        return None

def _get_config_map():
    obj = _get_setting_obj()
    if obj is None:
        return {}
    try:
        raw = obj.external_api_config or {}
        if isinstance(raw, dict):
            return raw
    except Exception:
        pass
    return {}

def _save_group(group, payload):
    obj = _get_setting_obj()
    if obj is None:
        return False
    try:
        cfg = obj.external_api_config or {}
        if not isinstance(cfg, dict):
            cfg = {}
        cfg[group] = payload
        obj.external_api_config = cfg
        obj.save(update_fields=['external_api_config', 'updated_at'])
        return True
    except Exception:
        return False

def _normalize_endpoint_item(item, default_name=''):
    if not isinstance(item, dict):
        return None
    url = str(item.get('url', '')).strip()
    if not url:
        return None
    return {
        'url': url,
        'enabled': bool(item.get('enabled', True)),
        'name': str(item.get('name', default_name) or default_name).strip(),
        'adapter': str(item.get('adapter', 'standard') or 'standard').strip(),
        'auth_type': str(item.get('auth_type', 'none') or 'none').strip(),
        'auth_key': str(item.get('auth_key', '') or '').strip(),
        'auth_value': str(item.get('auth_value', '') or '').strip(),
    }

def get_endpoints(group):
    default = [dict(x) for x in DEFAULT_GROUPS[group]['defaults']]
    cfg = _get_config_map()
    if group not in cfg:
        return default
    data = cfg.get(group) or {}
    raw = data.get('endpoints')
    if isinstance(raw, list):
        out = []
        for item in raw:
            norm = _normalize_endpoint_item(item)
            if norm:
                out.append(norm)
        if out:
            return out
    return default

def get_engines(group='search_pipeline'):
    if group not in DEFAULT_GROUPS or DEFAULT_GROUPS[group].get('type') != 'engines':
        group = 'search_pipeline'
    default = [dict(x) for x in DEFAULT_GROUPS[group]['defaults']]
    cfg = _get_config_map().get(group) or {}
    raw = cfg.get('engines')
    if isinstance(raw, list) and raw:
        out = []
        for item in raw:
            if isinstance(item, dict) and str(item.get('key', '')).strip():
                out.append({
                    'key': str(item['key']).strip(),
                    'url': str(item.get('url', '')).strip(),
                    'timeout': _clamp(float(item.get('timeout', 1.0)), 0.3, 30.0),
                    'enabled': bool(item.get('enabled', True)),
                    'auth_type': str(item.get('auth_type', 'none') or 'none').strip(),
                    'auth_key': str(item.get('auth_key', '') or '').strip(),
                    'auth_value': str(item.get('auth_value', '') or '').strip(),
                })
        if out:
            return out
    return default

def _clamp(v, lo, hi):
    try:
        v = float(v)
        return max(lo, min(hi, v))
    except (TypeError, ValueError):
        return lo

def get_timeout(group):
    if DEFAULT_GROUPS.get(group, {}).get('type') == 'engines':
        return None
    cfg = _get_config_map().get(group) or {}
    try:
        return _clamp(float(cfg.get('timeout')), 1, 60)
    except (TypeError, ValueError):
        return DEFAULT_GROUPS[group]['timeout']

def get_retries(group):
    cfg = _get_config_map().get(group) or {}
    try:
        return int(max(0, min(10, int(float(cfg.get('retries', 0))))))
    except (TypeError, ValueError):
        return DEFAULT_GROUPS[group]['retries']

def get_enabled_urls(group):
    return [u['url'] for u in get_endpoints(group) if u.get('enabled')]

def get_enabled_endpoints(group):
    return [u for u in get_endpoints(group) if u.get('enabled')]

def get_enabled_engines():
    return [{'key': e['key'], 'url': e['url'], 'timeout': e['timeout']}
            for e in get_engines() if e.get('enabled')]

def save_group_config(group, payload):
    meta = DEFAULT_GROUPS.get(group)
    if not meta:
        return False
    
    old_endpoints = {u.get('url'): u for u in get_endpoints(group)}
    old_engines = {e.get('key'): e for e in get_engines(group)} if meta['type'] == 'engines' else {}

    data = {'retries': int(get_retries(group))}
    if meta['type'] != 'engines':
        data['timeout'] = int(get_timeout(group))
    
    if meta['type'] == 'engines':
        raw_engines = payload.get('engines')
        if raw_engines is not None:
            engines = []
            for item in raw_engines or []:
                if not isinstance(item, dict) or not str(item.get('key', '')).strip():
                    continue
                k = str(item['key']).strip()
                auth_val = str(item.get('auth_value', '') or '').strip()
                if is_masked_value(auth_val) and k in old_engines:
                    auth_val = old_engines[k].get('auth_value', '')
                engines.append({
                    'key': k,
                    'url': str(item.get('url', '')).strip(),
                    'timeout': _clamp(float(item.get('timeout', 1.0)), 0.3, 30.0),
                    'enabled': bool(item.get('enabled', True)),
                    'auth_type': str(item.get('auth_type', 'none') or 'none').strip(),
                    'auth_key': str(item.get('auth_key', '') or '').strip(),
                    'auth_value': auth_val,
                })
            if engines:
                data['engines'] = engines
        if payload.get('timeout') is not None:
            data['timeout'] = int(_clamp(float(payload['timeout']), 1, 60))
        if payload.get('retries') is not None:
            data['retries'] = int(max(0, min(10, int(float(payload['retries'])))))
    else:
        raw_eps = payload.get('endpoints')
        if raw_eps is not None:
            endpoints = []
            for item in raw_eps or []:
                norm = _normalize_endpoint_item(item)
                if not norm:
                    continue
                url = norm['url']
                if group == 'holiday':
                    url = normalize_holiday_url(url)
                    norm['url'] = url
                auth_val = norm['auth_value']
                if is_masked_value(auth_val) and url in old_endpoints:
                    norm['auth_value'] = old_endpoints[url].get('auth_value', '')
                endpoints.append(norm)
            if endpoints:
                data['endpoints'] = endpoints
        if payload.get('timeout') is not None:
            data['timeout'] = int(_clamp(float(payload['timeout']), 1, 60))
        if payload.get('retries') is not None:
            data['retries'] = int(max(0, min(10, int(float(payload['retries'])))))
            
    return _save_group(group, data)

def normalize_holiday_url(url):
    s = (url or '').strip()
    if not s:
        s = DEFAULT_GROUPS['holiday']['defaults'][0]['url']
    s = s.replace(HOLIDAY_PLACEHOLDER, '').replace(HOLIDAY_FORMAT_PLACEHOLDER, '')
    s = s.rstrip('/')
    return s + '/' + HOLIDAY_PLACEHOLDER

def display_holiday_url(url):
    return (url or '').replace(HOLIDAY_PLACEHOLDER, '').replace(HOLIDAY_FORMAT_PLACEHOLDER, '')

def holiday_url_for_year(url, year):
    s = (url or '').strip()
    if HOLIDAY_PLACEHOLDER in s or HOLIDAY_FORMAT_PLACEHOLDER in s:
        s = s.replace(HOLIDAY_PLACEHOLDER, str(year)).replace(HOLIDAY_FORMAT_PLACEHOLDER, str(year))
    else:
        s = s.rstrip('/') + '/' + str(year)
    return s

def clear_group(group):
    obj = _get_setting_obj()
    if obj is None:
        return
    try:
        cfg = obj.external_api_config or {}
        if isinstance(cfg, dict) and group in cfg:
            cfg.pop(group, None)
            obj.external_api_config = cfg
            obj.save(update_fields=['external_api_config', 'updated_at'])
    except Exception:
        pass

def restore_all_defaults():
    obj = _get_setting_obj()
    if obj is None:
        return
    try:
        obj.external_api_config = {}
        obj.save(update_fields=['external_api_config', 'updated_at'])
    except Exception:
        pass

def get_all_config():
    result = {}
    for group, meta in DEFAULT_GROUPS.items():
        item = {
            'label': meta['label'],
            'type': meta['type'],
            'timeout': get_timeout(group),
            'retries': get_retries(group),
            'defaults': meta['defaults'],
        }
        if meta['type'] == 'engines':
            engines = get_engines(group)
            masked_engines = []
            for e in engines:
                ec = dict(e)
                ec['has_auth_value'] = bool(e.get('auth_value'))
                ec['auth_value'] = mask_auth_value(e.get('auth_value'))
                masked_engines.append(ec)
            item['engines'] = masked_engines
            item['engine_labels'] = ENGINE_LABELS
        else:
            endpoints = get_endpoints(group)
            masked_endpoints = []
            for u in endpoints:
                uc = dict(u)
                if group == 'holiday':
                    uc['url'] = display_holiday_url(u['url'])
                uc['has_auth_value'] = bool(u.get('auth_value'))
                uc['auth_value'] = mask_auth_value(u.get('auth_value'))
                masked_endpoints.append(uc)
            item['endpoints'] = masked_endpoints
        result[group] = item
    return {'groups': result, 'presets': ENDPOINT_PRESETS}

def get_group(group):
    meta = DEFAULT_GROUPS.get(group)
    if not meta:
        return None
    if meta['type'] == 'engines':
        return {
            'engines': get_engines(group),
            'retries': get_retries(group),
        }
    return {
        'endpoints': get_endpoints(group),
        'timeout': get_timeout(group),
        'retries': get_retries(group),
    }

def _http_get_dual(url, params=None, timeout=8, headers=None):
    try:
        with requests.Session() as s:
            s.trust_env = False
            return s.get(url, params=params, timeout=timeout, headers=headers)
    except Exception:
        pass
    with requests.Session() as s:
        s.trust_env = True
        return s.get(url, params=params, timeout=timeout, headers=headers)

def test_endpoint(group, item_or_url, timeout=None):
    if isinstance(item_or_url, dict):
        url = str(item_or_url.get('url', '')).strip()
        adapter = str(item_or_url.get('adapter', 'standard')).strip()
        auth_type = str(item_or_url.get('auth_type', 'none')).strip()
        auth_key = str(item_or_url.get('auth_key', '')).strip()
        auth_value = str(item_or_url.get('auth_value', '')).strip()
        if is_masked_value(auth_value):
            for ep in get_endpoints(group):
                if ep.get('url') == url:
                    auth_value = ep.get('auth_value', '')
                    break
    else:
        url = str(item_or_url or '').strip()
        adapter = 'standard'
        auth_type = 'none'
        auth_key = ''
        auth_value = ''

    if timeout is None:
        timeout = get_timeout(group) or 8
    start = time.time()

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }
    params = {}

    if auth_value:
        if auth_type == 'bearer':
            headers['Authorization'] = f'Bearer {auth_value}'
        elif auth_type == 'header' and auth_key:
            headers[auth_key] = auth_value
        elif auth_type == 'query' and auth_key:
            params[auth_key] = auth_value

    ok_fn = None
    fail_hint = ''

    if adapter == 'uapis' or 'uapis.cn' in url:
        params['city'] = '北京'
        ok_fn = lambda d: isinstance(d, dict) and ('weather' in d or 'temperature' in d or d.get('code') in (0, 200))
        fail_hint = '响应缺少 weather/temperature 字段（非 UAPIS 实时天气兼容源）'
    elif adapter == 'qweather':
        params['location'] = '101010100'
        ok_fn = lambda d: isinstance(d, dict) and d.get('code') in ('200', 200)
        fail_hint = '和风天气返回异常或 Key 鉴权失败'
    elif adapter == 'amap':
        params['city'] = '110000'
        ok_fn = lambda d: isinstance(d, dict) and d.get('status') == '1'
        fail_hint = '高德天气返回异常或 Key 鉴权失败'
    elif group == 'geocoding':
        params['name'] = '北京'
        params['count'] = 1
        params['language'] = 'zh'
        params['format'] = 'json'
        ok_fn = lambda d: isinstance(d, dict) and isinstance(d.get('results'), list)
        fail_hint = '响应缺少 results 列表（非 Open-Meteo Geocoding 兼容端点）'
    elif group == 'forecast':
        params['latitude'] = 39.9
        params['longitude'] = 116.4
        params['current'] = 'temperature_2m'
        params['timezone'] = 'auto'
        ok_fn = lambda d: isinstance(d, dict) and ('current' in d or 'daily' in d)
        fail_hint = '响应缺少 current/daily 字段（非 Open-Meteo Forecast 兼容端点）'
    elif group == 'air_quality':
        params['latitude'] = 39.9
        params['longitude'] = 116.4
        params['current'] = 'us_aqi'
        params['timezone'] = 'auto'
        ok_fn = lambda d: isinstance(d, dict) and isinstance(d.get('current'), dict)
        fail_hint = '响应缺少 current 字段（非 Open-Meteo Air Quality 兼容端点）'
    elif group == 'holiday':
        target = holiday_url_for_year(url, time.localtime().tm_year)
        url = target
        ok_fn = lambda d: isinstance(d, dict) and d.get('code') == 0
        fail_hint = '响应缺少 code==0 字段（非 timor.tech 兼容端点）'
    else:
        return {'url': url, 'ok': False, 'message': '未知服务组: %s' % group, 'latency_ms': int((time.time() - start) * 1000)}

    try:
        resp = _http_get_dual(url, params=params, timeout=timeout, headers=headers)
        latency_ms = int((time.time() - start) * 1000)
        try:
            data = resp.json()
        except ValueError:
            return {'url': url, 'ok': False, 'message': f'响应非有效 JSON（HTTP {resp.status_code}）', 'latency_ms': latency_ms}
        
        if ok_fn and ok_fn(data):
            extra_msg = ''
            if adapter == 'uapis' or 'uapis.cn' in url:
                extra_msg = f' (已识别即时天气: {data.get("weather")}, 气温 {data.get("temperature")}°C)'
            return {'url': url, 'ok': True, 'message': f'连接成功（HTTP {resp.status_code}）{extra_msg}', 'latency_ms': latency_ms}
        
        reason = ''
        if isinstance(data, dict):
            if data.get('error'):
                reason = '：' + str(data.get('reason') or data.get('error'))
            elif data.get('msg') or data.get('message'):
                reason = '：' + str(data.get('msg') or data.get('message'))
        return {'url': url, 'ok': False, 'message': fail_hint + reason, 'latency_ms': latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {'url': url, 'ok': False, 'message': f'连接失败: {str(e)[:200]}', 'latency_ms': latency_ms}

def test_engine(key, url, timeout=None):
    if key in ('ai_model', 'mymemory', 'google_translate', 'custom_api'):
        try:
            from apps.core.services.translation_service import test_translation_engine
            return test_translation_engine(key, url=url, timeout=timeout)
        except Exception as e:
            return {'url': url or key, 'ok': False, 'message': f'翻译引擎测试异常: {str(e)[:150]}', 'latency_ms': 0}
    if timeout is None:
        timeout = 1.0
        for eng in get_engines():
            if eng['key'] == key:
                timeout = eng['timeout']
                break
    url = (url or '').strip()
    start = time.time()
    try:
        from apps.core.services.web_search import search_with_engine
        results = search_with_engine(key, url, '母婴健康', max_results=3, timeout=timeout)
        latency_ms = int((time.time() - start) * 1000)
        if results:
            return {'url': url, 'ok': True, 'message': f'端点畅通，成功解析 {len(results)} 条结果', 'latency_ms': latency_ms}
        return {'url': url, 'ok': False, 'message': f'端点可达但未能解析结果（可能非 {ENGINE_LABELS.get(key, key)} 兼容端点或被反爬拦截）', 'latency_ms': latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {'url': url, 'ok': False, 'message': f'连接失败: {str(e)[:200]}', 'latency_ms': latency_ms}

def test_group(group, payload):
    results = []
    if DEFAULT_GROUPS.get(group, {}).get('type') == 'engines':
        engines = payload.get('engines') or []
        for item in engines:
            if not isinstance(item, dict) or not item.get('enabled'):
                continue
            results.append(test_engine(item.get('key', ''), item.get('url', ''), timeout=item.get('timeout')))
    else:
        endpoints = payload.get('endpoints') or []
        for item in endpoints:
            if not isinstance(item, dict) or not item.get('enabled'):
                continue
            results.append(test_endpoint(group, item, timeout=payload.get('timeout')))
    return results
