import threading
import time
from collections import defaultdict, deque

from django.conf import settings

_lock = threading.Lock()
_hits = defaultdict(lambda: deque())


def allow_request(key: str, limit_per_minute: int = None) -> bool:
    """简单内存限流：同一 key 每分钟最多 limit 次"""
    if limit_per_minute is None:
        limit_per_minute = settings.RATE_LIMIT_GENERAL_PER_MINUTE
    now = time.time()
    with _lock:
        dq = _hits[key]
        while dq and now - dq[0] > 60:
            dq.popleft()
        if len(dq) >= limit_per_minute:
            return False
        dq.append(now)
        return True


def get_wait_seconds(key: str) -> int:
    """获取限流 key 的剩余等待秒数（距离最早一条记录过期的秒数）"""
    now = time.time()
    with _lock:
        dq = _hits[key]
        if not dq:
            return 0
        earliest = dq[0]
        wait = 60 - (now - earliest)
        return max(0, int(wait))


def rate_limit(key: str, limit_per_minute: int = None):
    """装饰器：未通过限流时抛出 429 异常，携带剩余等待秒数"""

    def decorator(view_func):
        def wrapped(request, *args, **kwargs):
            from rest_framework.exceptions import Throttled

            if not allow_request(key, limit_per_minute):
                wait = get_wait_seconds(key)
                raise Throttled(detail=f"请求过于频繁，请 {wait} 秒后再试", wait=wait)
            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator
