# -*- coding: utf-8 -*-
"""
service_config.py — 外部接口服务配置管理（v1.73 新增）

集中管理各模块「内置默认调用地址但页面无配置入口」的外部服务：
  1. 天气·地理编码（Open-Meteo Geocoding）
  2. 天气·天气预报（Open-Meteo Forecast）
  3. 天气·空气质量（Open-Meteo Air Quality）
  4. 法定节假日班/休数据（timor.tech，地址含 {年份} 占位符自动补全）
  5. AI 公网搜索引擎管线（DuckDuckGo / Google / Bing / 360 / 搜狗 / 百度 / 雅虎，
     行级地址+行级超时+行级开关，顺序即故障转移顺序）

统一模型：
  - 普通组（天气三组 / 节假日） = 有序端点列表 [{url, enabled}] + 重试参数（timeout 秒 / retries 轮）
  - 搜索引擎组（search_pipeline） = 有序引擎列表 [{key, url, timeout, enabled}] + retries 轮
    （每个 key 绑定专属 HTML 解析器，改地址须为同款引擎的兼容端点）

故障转移：
  - 按序遍历启用端点/引擎，任一成功即返回；全部失败按 retries 整轮重试

存储：复用 SystemSetting 单行模型新增 external_api_config JSONField（见 models/system.py），
  实时读库、异常兜底返回默认值，与业务完全解耦。
"""
import json
import time

# ===================== 分组默认配置 =====================

DEFAULT_GROUPS = {
    'geocoding': {
        'label': '天气·地理编码',
        'type': 'endpoints',
        'defaults': [{'url': 'https://geocoding-api.open-meteo.com/v1/search', 'enabled': True}],
        'timeout': 8,
        'retries': 0,
    },
    'forecast': {
        'label': '天气·天气预报',
        'type': 'endpoints',
        'defaults': [{'url': 'https://api.open-meteo.com/v1/forecast', 'enabled': True}],
        'timeout': 8,
        'retries': 0,
    },
    'air_quality': {
        'label': '天气·空气质量',
        'type': 'endpoints',
        'defaults': [{'url': 'https://air-quality-api.open-meteo.com/v1/air-quality', 'enabled': True}],
        'timeout': 8,
        'retries': 0,
    },
    'holiday': {
        'label': '法定节假日',
        'type': 'endpoints',
        # 管理员只需填写到 .../year/ 即可，保存时自动补全 {年份} 占位符，调用时注入当年年份
        'defaults': [{'url': 'https://timor.tech/api/holiday/year/', 'enabled': True}],
        'timeout': 8,
        'retries': 0,
    },
    'search_pipeline': {
        'label': 'AI 公网搜索引擎管线',
        'type': 'engines',
        # key 与 web_search.py 的引擎解析器一一对应；顺序即故障转移顺序
        'defaults': [
            {'key': 'duckduckgo', 'url': 'https://lite.duckduckgo.com/lite/', 'timeout': 1.0, 'enabled': True},
            {'key': 'google', 'url': 'https://www.google.com/search', 'timeout': 1.0, 'enabled': True},
            {'key': 'bing', 'url': 'https://cn.bing.com/search', 'timeout': 2.5, 'enabled': True},
            {'key': 'so', 'url': 'https://www.so.com/s', 'timeout': 2.0, 'enabled': True},
            {'key': 'sogou', 'url': 'https://www.sogou.com/web', 'timeout': 2.0, 'enabled': True},
            {'key': 'baidu', 'url': 'https://www.baidu.com/s', 'timeout': 1.5, 'enabled': True},
            {'key': 'yahoo', 'url': 'https://search.yahoo.com/search', 'timeout': 1.2, 'enabled': True},
        ],
        'retries': 1,
    },
}

# 搜索引擎 key → 展示名（前端图标/标签用）
ENGINE_LABELS = {
    'duckduckgo': 'DuckDuckGo',
    'google': 'Google',
    'bing': '微软 Bing',
    'so': '360搜索',
    'sogou': '搜狗搜索',
    'baidu': '百度搜索',
    'yahoo': '雅虎搜索',
}

# 节假日地址占位符（管理员无需填写，保存时自动补全，调用时注入年份）
HOLIDAY_PLACEHOLDER = '{年份}'
# 与 holiday_service 既有 TIMOR_API 的 {} 占位兼容：存储层统一用 {年份}，读取后转 {} 给 format()
HOLIDAY_FORMAT_PLACEHOLDER = '{}'


# ===================== 存储读写 =====================

def _get_setting_obj():
    """获取 SystemSetting 单行对象（读失败返回 None，保证后台线程安全）"""
    try:
        from apps.core.models.system import SystemSetting
        return SystemSetting.get_settings()
    except Exception:
        return None


def _get_config_map():
    """读取整份 external_api_config（{group: {...}}），无配置返回空 dict"""
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
    """保存一组配置子树（失败静默，配置写失败不阻断主流程）"""
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


# ===================== 读取配置 =====================

def get_endpoints(group):
    """普通组：返回 [{url, enabled}]；库中无有效配置时回落默认列表"""
    default = [dict(x) for x in DEFAULT_GROUPS[group]['defaults']]
    data = _get_config_map().get(group) or {}
    raw = data.get('endpoints')
    if isinstance(raw, list) and raw:
        out = []
        for item in raw:
            if isinstance(item, dict) and str(item.get('url', '')).strip():
                out.append({
                    'url': str(item['url']).strip(),
                    'enabled': bool(item.get('enabled', True)),
                })
        if out:
            return out
    return default


def get_engines():
    """搜索引擎组返回 [{key, url, timeout, enabled}]；无配置回落默认"""
    default = [dict(x) for x in DEFAULT_GROUPS['search_pipeline']['defaults']]
    cfg = _get_config_map().get('search_pipeline') or {}
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
    """读取组请求超时（秒），非法回落默认。
    search_pipeline 组无组级超时（超时在引擎行级），返回 None"""
    if group == 'search_pipeline':
        return None
    cfg = _get_config_map().get(group) or {}
    try:
        return _clamp(float(cfg.get('timeout')), 1, 60)
    except (TypeError, ValueError):
        return DEFAULT_GROUPS[group]['timeout']


def get_retries(group):
    """读取组重试轮数，非法回落默认"""
    cfg = _get_config_map().get(group) or {}
    try:
        return int(max(0, min(10, int(float(cfg.get('retries', 0))))))
    except (TypeError, ValueError):
        return DEFAULT_GROUPS[group]['retries']


def get_enabled_urls(group):
    """普通组：按配置顺序返回启用的端点 URL 列表（故障转移遍历用）"""
    return [u['url'] for u in get_endpoints(group) if u.get('enabled')]


def get_enabled_engines():
    """搜索引擎组：按配置顺序返回启用的引擎 [{key, url, timeout}]"""
    return [{'key': e['key'], 'url': e['url'], 'timeout': e['timeout']}
            for e in get_engines() if e.get('enabled')]


# ===================== 保存配置 =====================

def save_group_config(group, payload):
    """保存一组配置。
    payload: {'endpoints': [{url, enabled}] | 'engines': [{key,url,timeout,enabled}],
              'timeout': 秒, 'retries': 轮}
    """
    meta = DEFAULT_GROUPS.get(group)
    if not meta:
        return False
    # search_pipeline 组无组级超时（超时在引擎行级），仅普通组带 timeout
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
                engines.append({
                    'key': str(item['key']).strip(),
                    'url': str(item.get('url', '')).strip(),
                    'timeout': _clamp(float(item.get('timeout', 1.0)), 0.3, 30.0),
                    'enabled': bool(item.get('enabled', True)),
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
                if not isinstance(item, dict) or not str(item.get('url', '')).strip():
                    continue
                url = str(item['url']).strip()
                if group == 'holiday':
                    url = normalize_holiday_url(url)
                endpoints.append({'url': url, 'enabled': bool(item.get('enabled', True))})
            if endpoints:
                data['endpoints'] = endpoints
        if payload.get('timeout') is not None:
            data['timeout'] = int(_clamp(float(payload['timeout']), 1, 60))
        if payload.get('retries') is not None:
            data['retries'] = int(max(0, min(10, int(float(payload['retries'])))))
    return _save_group(group, data)


def normalize_holiday_url(url):
    """节假日地址规范化：自动补全 {年份} 占位符
    例：https://timor.tech/api/holiday/year/ → https://timor.tech/api/holiday/year/{年份}
    """
    s = (url or '').strip()
    if not s:
        s = DEFAULT_GROUPS['holiday']['defaults'][0]['url']
    s = s.replace(HOLIDAY_PLACEHOLDER, '').replace(HOLIDAY_FORMAT_PLACEHOLDER, '')
    s = s.rstrip('/')
    return s + '/' + HOLIDAY_PLACEHOLDER


def display_holiday_url(url):
    """页面展示用：隐藏 {年份} 占位符，只展示管理员需要编辑的地址"""
    return (url or '').replace(HOLIDAY_PLACEHOLDER, '').replace(HOLIDAY_FORMAT_PLACEHOLDER, '')


def holiday_url_for_year(url, year):
    """把存储的节假日端点地址转换为可请求地址（注入年份）：
    - 含 {年份} 或 {} 占位符 → 原位替换；
    - 无占位符（默认端点形态，管理员只填到 .../year/）→ 自动在末尾追加 /{year}"""
    s = (url or '').strip()
    if HOLIDAY_PLACEHOLDER in s or HOLIDAY_FORMAT_PLACEHOLDER in s:
        s = s.replace(HOLIDAY_PLACEHOLDER, str(year)).replace(HOLIDAY_FORMAT_PLACEHOLDER, str(year))
    else:
        s = s.rstrip('/') + '/' + str(year)
    return s


def clear_group(group):
    """删除一组配置（读取时自动回落默认值）"""
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
    """恢复全部组默认（清空整份外部接口配置）"""
    obj = _get_setting_obj()
    if obj is None:
        return
    try:
        obj.external_api_config = {}
        obj.save(update_fields=['external_api_config', 'updated_at'])
    except Exception:
        pass


def get_all_config():
    """供配置页面渲染：{groups: {group: {label, type, endpoints|engines, timeout, retries, defaults, engine_labels}}}"""
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
            item['engines'] = get_engines()
            item['engine_labels'] = ENGINE_LABELS
        else:
            endpoints = get_endpoints(group)
            if group == 'holiday':
                endpoints = [{'url': display_holiday_url(u['url']), 'enabled': u['enabled']} for u in endpoints]
            item['endpoints'] = endpoints
        result[group] = item
    return {'groups': result}


# ===================== 一键测试执行器 =====================

def _http_get_dual(url, params=None, timeout=8, headers=None):
    """禁代理直连优先 + 系统代理兜底（与 weather_service._http_get 同款双路径）"""
    import requests
    try:
        with requests.Session() as s:
            s.trust_env = False
            return s.get(url, params=params, timeout=timeout, headers=headers)
    except Exception:
        pass
    with requests.Session() as s:
        s.trust_env = True
        return s.get(url, params=params, timeout=timeout, headers=headers)


def test_endpoint(group, url, timeout=None):
    """测试单个端点地址是否有效，返回 {url, ok, message, latency_ms}
    按各组真实协议做结构校验（非仅 HTTP 200）"""
    if timeout is None:
        timeout = get_timeout(group)
    url = (url or '').strip()
    start = time.time()

    params = None
    ok_fn = None
    fail_hint = ''
    if group == 'geocoding':
        params = {'name': '北京', 'count': 1, 'language': 'zh', 'format': 'json'}
        ok_fn = lambda d: isinstance(d, dict) and isinstance(d.get('results'), list)
        fail_hint = '响应缺少 results 数组（非 Open-Meteo Geocoding 兼容端点）'
    elif group == 'forecast':
        params = {'latitude': 39.9, 'longitude': 116.4,
                  'current': 'temperature_2m', 'timezone': 'auto'}
        ok_fn = lambda d: isinstance(d, dict) and ('current' in d or 'daily' in d)
        fail_hint = '响应缺少 current/daily 字段（非 Open-Meteo Forecast 兼容端点）'
    elif group == 'air_quality':
        params = {'latitude': 39.9, 'longitude': 116.4, 'current': 'us_aqi', 'timezone': 'auto'}
        ok_fn = lambda d: isinstance(d, dict) and isinstance(d.get('current'), dict)
        fail_hint = '响应缺少 current 字段（非 Open-Meteo Air Quality 兼容端点）'
    elif group == 'holiday':
        target = holiday_url_for_year(url, time.localtime().tm_year)
        url = target
        ok_fn = lambda d: isinstance(d, dict) and d.get('code') == 0
        fail_hint = '响应缺少 code==0 字段（非 timor.tech 兼容端点）'
    else:
        return {'url': url, 'ok': False, 'message': '未知分组: %s' % group, 'latency_ms': int((time.time() - start) * 1000)}

    try:
        # timor.tech 反爬：必须模拟浏览器 UA（否则 403）
        headers = None
        if group == 'holiday':
            headers = {
                'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                               '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'),
                'Accept': 'application/json',
            }
        resp = _http_get_dual(url, params=params, timeout=timeout, headers=headers)
        latency_ms = int((time.time() - start) * 1000)
        try:
            data = resp.json()
        except ValueError:
            return {'url': url, 'ok': False, 'message': '响应非有效 JSON（HTTP %s）' % resp.status_code, 'latency_ms': latency_ms}
        if ok_fn(data):
            return {'url': url, 'ok': True, 'message': '连接正常（HTTP %s）' % resp.status_code, 'latency_ms': latency_ms}
        reason = ''
        if isinstance(data, dict) and data.get('error'):
            reason = '：' + str(data.get('reason') or '接口返回错误')
        return {'url': url, 'ok': False, 'message': fail_hint + reason, 'latency_ms': latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {'url': url, 'ok': False, 'message': '请求失败: %s' % str(e)[:200], 'latency_ms': latency_ms}


def test_engine(key, url, timeout=None):
    """测试搜索引擎行：复用 web_search 各引擎专属解析器，能解析出结果即成功"""
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
        results = search_with_engine(key, url, '测试天气', max_results=3, timeout=timeout)
        latency_ms = int((time.time() - start) * 1000)
        if results:
            return {'url': url, 'ok': True, 'message': '端点可达且成功解析出 %d 条结果' % len(results), 'latency_ms': latency_ms}
        return {'url': url, 'ok': False, 'message': '端点可达但未能解析出结果（可能非 %s 兼容端点或被反爬拦截）' % ENGINE_LABELS.get(key, key), 'latency_ms': latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {'url': url, 'ok': False, 'message': '请求失败: %s' % str(e)[:200], 'latency_ms': latency_ms}


def test_group(group, payload):
    """按当前配置顺序与启用状态测试整组（模拟故障转移顺序），返回逐条结果"""
    results = []
    if group == 'search_pipeline':
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
            results.append(test_endpoint(group, item.get('url', ''), timeout=payload.get('timeout')))
    return results


