import gc
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()

# 启动完成即刻执行垃圾回收并冻结对象，避免写时复制 (COW) 与 GC 循环扫描
try:
    gc.collect()
    if hasattr(gc, "freeze"):
        gc.freeze()
except Exception:
    pass
