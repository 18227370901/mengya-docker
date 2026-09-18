"""普通用户功能与菜单权限控制工具"""

from rest_framework.exceptions import PermissionDenied

# 系统全部功能与菜单权限的默认值
DEFAULT_USER_PERMISSIONS = {
    # 页面菜单访问权限 (Menu Access)
    "menu_home": True,              # 首页
    "menu_timeline": True,          # 时间轴 / 孕期周历
    "menu_products": True,          # 商品库中心
    "menu_ai_assistant": True,      # AI 助手
    "menu_shopping_list": True,     # 智能待产包
    "menu_health": True,            # 健康中心
    "menu_fetal_stories": True,     # 胎教故事
    "menu_recipes": True,           # 孕期食谱
    "menu_encyclopedia": True,      # 幼儿百科
    "menu_favorites": True,         # 我的收藏
    "menu_notifications": True,     # 消息通知

    # 业务功能操作权限（CRUD 细粒度）
    # 待产包模块 (Shopping List)
    "shopping_list_view": True,     # 查：查看清单详情
    "shopping_list_create": True,   # 增：新建清单/智能生成清单
    "shopping_list_update": True,   # 改：编辑修改清单项
    "shopping_list_delete": True,   # 删：删除清单项/清空清单

    # 健康中心模块 (Health)
    "health_record_view": True,     # 查：查看体征/产检记录
    "health_record_create": True,   # 增：添加体征/产检记录
    "health_record_update": True,   # 改：修改健康记录
    "health_record_delete": True,   # 删：删除健康记录

    # 宝宝档案模块 (Baby Profile)
    "baby_view": True,              # 查：查看宝宝档案
    "baby_create": True,            # 增：添加宝宝档案
    "baby_update": True,            # 改：修改宝宝资料
    "baby_delete": True,            # 删：删除宝宝档案

    # 商品库中心模块 (Products & Favorites)
    "product_view": True,           # 查：浏览商品及对比
    "product_favorite": True,       # 增：收藏商品
    "product_unfavorite": True,     # 删：取消收藏商品
    "product_ai_evaluate": True,    # 用：AI 一键评测商品

    # AI 助手模块 (AI Assistant)
    "ai_chat": True,                # 增/用：发起 AI 问答对话
    "ai_session_create": True,      # 增：创建新会话
    "ai_session_rename": True,      # 改：重命名会话
    "ai_session_delete": True,      # 删：删除会话
}

# 父子关联映射表：子权限 key -> 其直接父权限 key（支持多级继承联动）
PERMISSION_PARENT_MAP = {
    # 待产包清单模块：menu_shopping_list -> shopping_list_view -> [shopping_list_create, update, delete]
    "shopping_list_view": "menu_shopping_list",
    "shopping_list_create": "shopping_list_view",
    "shopping_list_update": "shopping_list_view",
    "shopping_list_delete": "shopping_list_view",

    # 健康中心模块：menu_health -> health_record_view -> [health_record_create, update, delete]
    "health_record_view": "menu_health",
    "health_record_create": "health_record_view",
    "health_record_update": "health_record_view",
    "health_record_delete": "health_record_view",

    # 宝宝档案模块：baby_view -> [baby_create, update, delete]
    "baby_create": "baby_view",
    "baby_update": "baby_view",
    "baby_delete": "baby_view",

    # 商品库中心模块：menu_products -> product_view -> [product_favorite, unfavorite, ai_evaluate]
    "product_view": "menu_products",
    "product_favorite": "product_view",
    "product_unfavorite": "product_view",
    "product_ai_evaluate": "product_view",

    # AI 助手模块：menu_ai_assistant -> [ai_chat, ai_session_create, rename, delete]
    "ai_chat": "menu_ai_assistant",
    "ai_session_create": "menu_ai_assistant",
    "ai_session_rename": "menu_ai_assistant",
    "ai_session_delete": "menu_ai_assistant",
}

# 衍生直接子节点表：父权限 key -> [子权限 key, ...]
PERMISSION_CHILDREN_MAP = {}
for _child, _parent in PERMISSION_PARENT_MAP.items():
    PERMISSION_CHILDREN_MAP.setdefault(_parent, []).append(_child)


def normalize_permissions(perms: dict, previous_perms: dict = None) -> dict:
    """确保权限字典严格满足父子递归联动关系：
    1. 开启子权限时，自动开启其所有祖先父权限（向上递归）
    2. 关闭父权限时，自动关闭其所有后代子权限（向下递归）
    3. 任何时刻，若直接或间接父权限为 False，子权限绝不可为 True
    """
    normalized = dict(perms)

    # 1. 若提供了变更前的基准配置，先依显式变化方向做定向递归联动
    if previous_perms and isinstance(previous_perms, dict):
        for k, v in perms.items():
            prev_v = bool(previous_perms.get(k, True))
            new_v = bool(v)
            if not prev_v and new_v:
                # 开启子权限 -> 向上递归开启所有父权限
                cur = k
                while cur in PERMISSION_PARENT_MAP:
                    p = PERMISSION_PARENT_MAP[cur]
                    normalized[p] = True
                    cur = p
            elif prev_v and not new_v:
                # 关闭父权限 -> 向下递归关闭所有子权限
                def _disable_descendants(p_key):
                    for c_key in PERMISSION_CHILDREN_MAP.get(p_key, []):
                        normalized[c_key] = False
                        _disable_descendants(c_key)
                _disable_descendants(k)

    # 2. 最终严格一致性收敛校验：若父权限未开启，其所有子权限强制设为 False
    changed = True
    while changed:
        changed = False
        for child, parent in PERMISSION_PARENT_MAP.items():
            if not normalized.get(parent, False) and normalized.get(child, False):
                normalized[child] = False
                changed = True

    return normalized


# 权限分组与前端元数据定义（用于管理员端清晰展示与细粒度勾选）
PERMISSION_DEFINITIONS = [
    {
        "group_key": "menus",
        "group_name": "页面菜单访问权限",
        "description": "控制普通用户在顶栏、底栏、首页及个人中心中可见并可访问的功能菜单与页面",
        "permissions": [
            {"key": "menu_home", "name": "首页", "desc": "平台首页浏览及推荐商品查看", "parent_key": None},
            {"key": "menu_timeline", "name": "孕期时间轴/周历", "desc": "孕期周历与时相事件导航", "parent_key": None},
            {"key": "menu_products", "name": "商品库中心", "desc": "母婴选品库及同类商品对比", "parent_key": None},
            {"key": "menu_ai_assistant", "name": "AI 助手", "desc": "7×24小时智能问答小助手", "parent_key": None},
            {"key": "menu_shopping_list", "name": "智能待产包", "desc": "待产包清单与物品准备管理", "parent_key": None},
            {"key": "menu_health", "name": "健康中心", "desc": "产检日历、生长曲线与疫苗记录", "parent_key": None},
            {"key": "menu_fetal_stories", "name": "胎教故事", "desc": "每日温馨胎教故事阅读", "parent_key": None},
            {"key": "menu_recipes", "name": "孕期食谱", "desc": "各阶段专属孕期餐与营养谱", "parent_key": None},
            {"key": "menu_encyclopedia", "name": "幼儿百科", "desc": "幼儿身体与认知趣味科普", "parent_key": None},
            {"key": "menu_favorites", "name": "我的收藏", "desc": "商品、时相、清单等个人收藏夹", "parent_key": None},
            {"key": "menu_notifications", "name": "消息通知", "desc": "系统提醒与关怀通知中心", "parent_key": None},
        ],
    },
    {
        "group_key": "shopping_list",
        "group_name": "智能待产包功能（CRUD）",
        "description": "控制普通用户对待产包清单的新增、修改、删除等操作权限",
        "permissions": [
            {"key": "shopping_list_view", "name": "查看清单 (查)", "desc": "查看待产包清单及明细项", "parent_key": "menu_shopping_list"},
            {"key": "shopping_list_create", "name": "生成/新增 (增)", "desc": "智能生成待产包或手动新增自定义物品", "parent_key": "shopping_list_view"},
            {"key": "shopping_list_update", "name": "编辑/勾选 (改)", "desc": "修改物品数量、价格、购买状态或已购标记", "parent_key": "shopping_list_view"},
            {"key": "shopping_list_delete", "name": "删除物品 (删)", "desc": "删除已选清单项或清空分类清单", "parent_key": "shopping_list_view"},
        ],
    },
    {
        "group_key": "health",
        "group_name": "健康中心功能（CRUD）",
        "description": "控制普通用户在健康中心中产检、体征与疫苗记录的增删改查权限",
        "permissions": [
            {"key": "health_record_view", "name": "查看健康档案 (查)", "desc": "查看产检日历、体温/血压/体重曲线", "parent_key": "menu_health"},
            {"key": "health_record_create", "name": "新增健康记录 (增)", "desc": "录入新的产检备忘、生长指标或疫苗打卡", "parent_key": "health_record_view"},
            {"key": "health_record_update", "name": "修改健康记录 (改)", "desc": "编辑更新既往录入的健康与产检数据", "parent_key": "health_record_view"},
            {"key": "health_record_delete", "name": "删除记录 (删)", "desc": "删除历史录入的体征或产检记录", "parent_key": "health_record_view"},
        ],
    },
    {
        "group_key": "baby",
        "group_name": "宝宝档案功能（CRUD）",
        "description": "控制普通用户对宝宝档案的建立、修改与删除权限",
        "permissions": [
            {"key": "baby_view", "name": "查看宝宝档案 (查)", "desc": "查看宝宝基本资料、月龄及生长信息", "parent_key": None},
            {"key": "baby_create", "name": "添加宝宝 (增)", "desc": "在个人中心添加新的宝宝档案", "parent_key": "baby_view"},
            {"key": "baby_update", "name": "编辑宝宝 (改)", "desc": "修改宝宝姓名、性别、出生日期及昵称", "parent_key": "baby_view"},
            {"key": "baby_delete", "name": "删除宝宝档案 (删)", "desc": "注销或移除已录入的宝宝档案", "parent_key": "baby_view"},
        ],
    },
    {
        "group_key": "product",
        "group_name": "商品库与收藏功能（CRUD）",
        "description": "控制普通用户对商品的收藏、取消收藏及 AI 评测权限",
        "permissions": [
            {"key": "product_view", "name": "浏览商品 (查)", "desc": "查看商品库列表、多维度详情与推荐链接", "parent_key": "menu_products"},
            {"key": "product_favorite", "name": "添加收藏 (增)", "desc": "在首页或商品详情中添加至个人收藏夹", "parent_key": "product_view"},
            {"key": "product_unfavorite", "name": "取消收藏 (删)", "desc": "在商品卡片或收藏夹中取消商品收藏", "parent_key": "product_view"},
            {"key": "product_ai_evaluate", "name": "AI一键评测 (用)", "desc": "在商品详情页调用 AI 获取深度客观评测", "parent_key": "product_view"},
        ],
    },
    {
        "group_key": "ai",
        "group_name": "AI 助手对话功能（CRUD）",
        "description": "控制普通用户使用 AI 助手的问答交互与会话管理权限",
        "permissions": [
            {"key": "ai_chat", "name": "发起问答 (增/用)", "desc": "向 AI 助手发送问题并获取智能解答", "parent_key": "menu_ai_assistant"},
            {"key": "ai_session_create", "name": "新建会话 (增)", "desc": "创建新的独立对话话题分支", "parent_key": "menu_ai_assistant"},
            {"key": "ai_session_rename", "name": "重命名会话 (改)", "desc": "修改会话列表中的主题标题", "parent_key": "menu_ai_assistant"},
            {"key": "ai_session_delete", "name": "删除会话 (删)", "desc": "删除历史对话会话及其全部聊天记录", "parent_key": "menu_ai_assistant"},
        ],
    },
]


def get_user_permissions(user) -> dict:
    """获取指定用户的最终生效权限字典。
    管理员(is_staff/is_superuser)拥有全部 True 权限，任何时候不可禁用菜单与功能。
    普通用户：
      1. 基础系统默认配置 (DEFAULT_USER_PERMISSIONS)
      2. 系统全局设置默认模板 (SystemSetting.default_user_permissions)
      3. 用户个性化权限配置单独覆盖 (user.custom_permissions)
      4. 严格执行递归父子联动规范化
    """
    if not user:
        return normalize_permissions(DEFAULT_USER_PERMISSIONS)

    # 管理员无条件具备所有权限，绝不被任何设置禁用
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return {k: True for k in DEFAULT_USER_PERMISSIONS}

    merged = dict(DEFAULT_USER_PERMISSIONS)

    # 1. 读取系统全局默认权限模板
    try:
        from apps.core.models import SystemSetting
        setting = SystemSetting.get_settings()
        sys_perms = getattr(setting, "default_user_permissions", {}) or {}
        if isinstance(sys_perms, dict):
            for k, v in sys_perms.items():
                if k in merged:
                    merged[k] = bool(v)
    except Exception:
        pass

    # 2. 读取用户个性化权限覆盖 (custom_permissions)
    try:
        custom = getattr(user, "custom_permissions", {}) or {}
        if isinstance(custom, dict) and custom:
            for k, v in custom.items():
                if k in merged:
                    merged[k] = bool(v)
    except Exception:
        pass

    return normalize_permissions(merged)


def has_permission(user, perm_key: str) -> bool:
    """检查用户是否具有指定权限项。管理员永远返回 True。"""
    if not user:
        return False
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True
    if not getattr(user, "is_authenticated", False):
        return False
    perms = get_user_permissions(user)
    return bool(perms.get(perm_key, True))


def check_permission_or_403(user, perm_key: str, message: str = "管理员已关闭该项功能权限"):
    """若无权限则抛出 PermissionDenied 异常。管理员永远通行。"""
    if not user:
        raise PermissionDenied(detail={"code": 4030, "message": "请先登录", "permission": perm_key})
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return
    if not getattr(user, "is_authenticated", False):
        raise PermissionDenied(detail={"code": 4030, "message": "请先登录", "permission": perm_key})
    if not has_permission(user, perm_key):
        raise PermissionDenied(detail={"code": 4030, "message": message, "permission": perm_key})
