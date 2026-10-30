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
    "menu_favorites": True,         # 我的收藏（菜单入口）
    "menu_notifications": True,     # 消息通知
    "menu_weather": True,           # 天气预报 / 万年历
    "menu_third_party_hub": False,  # 三方中转站（聚合工具箱前台，默认普通用户不可见，授权后可见）

    # v1.88.1 我的收藏中心功能（CRUD）：从商品组独立，统一管控全部类型收藏
    "favorite_view": True,          # 查：查看收藏中心（分类/搜索/分页）
    "favorite_create": True,        # 增：添加收藏（商品/知识内容/清单）
    "favorite_delete": True,        # 删：取消收藏与批量取消

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

    # 商品库中心模块 (Products；收藏功能已独立到「我的收藏中心」组)
    "product_view": True,           # 查：浏览商品及对比
    "product_ai_evaluate": True,    # 用：AI 一键评测商品

    # AI 助手模块 (AI Assistant)
    "ai_chat": True,                # 增/用：发起 AI 问答对话
    "ai_session_create": True,      # 增：创建新会话
    "ai_session_rename": True,      # 改：重命名会话
    "ai_session_delete": True,      # 删：删除会话
    "ai_fetch_models": False,
    # 管理后台与高级运维权限 (Admin Menus & Management - 普通用户默认全部关闭 False)
    "menu_admin_backups": False,            # 云端容灾备份菜单
    "backup_config_manage": False,          # WebDAV 服务器配置与连通测试
    "backup_trigger": False,                # 手动触发备份与离线快照导出
    "backup_restore": False,                # 执行云端/本地快照系统还原高危操作
    "backup_task_manage": False,            # 定时自动备份调度任务管理

    "menu_admin_service_config": False,     # 外部接口配置菜单
    "service_config_view": False,           # 查看接口配置与单项测试
    "service_config_update": False,         # 修改天气/节假日/搜索管线引擎配置

    "menu_admin_daily_tips": False,         # 关怀贴士管理菜单
    "daily_tips_view": False,               # 查看贴士库与展示规则
    "daily_tips_manage": False,             # 增删改贴士与重置内置题库

    # v1.88 知识库管理中心权限（细粒度分模块控制，普通用户默认全部关闭）
    "menu_admin_kb_timeline": False,        # 孕期周历/时间轴管理菜单
    "kb_timeline_view": False,              # 查看时间轴/孕期周历/本周重点题库
    "kb_timeline_manage": False,            # 增删改/批量/恢复出厂时间轴事件

    "menu_admin_kb_stories": False,         # 胎教故事管理菜单
    "kb_stories_view": False,               # 查看胎教故事题库
    "kb_stories_manage": False,             # 增删改/批量/恢复出厂胎教故事

    "menu_admin_kb_recipes": False,         # 孕期食谱管理菜单
    "kb_recipes_view": False,               # 查看孕期食谱题库
    "kb_recipes_manage": False,             # 增删改/批量/恢复出厂孕期食谱

    "menu_admin_kb_encyclopedia": False,     # 幼儿百科管理菜单
    "kb_encyclopedia_view": False,           # 查看幼儿百科题库
    "kb_encyclopedia_manage": False,         # 增删改/批量/恢复出厂幼儿百科

    "menu_admin_kb_shopping": False,        # 待产包预置库管理菜单
    "kb_shopping_view": False,              # 查看待产包预置物品库
    "kb_shopping_manage": False,            # 增删改/批量/恢复出厂待产包预置物品

    "menu_admin_registration": False,       # 注册管理菜单
    "registration_manage": False,           # 切换注册模式与生成邀请链接

    "menu_admin_products_manage": False,    # 商品发布管理菜单
    "product_manage_create": False,         # 录入新商品
    "product_manage_edit": False,           # 编辑商品资料
    "product_manage_delete": False,         # 下架/删除商品

    "menu_admin_users": False,              # 用户管理与权限管控菜单
    "user_manage_view": False,              # 查看用户列表与详情
    "user_manage_edit": False,              # 编辑用户资料与角色
    "user_manage_freeze": False,            # 冻结/解冻用户账号
    "permission_manage": False,             # 配置全局或单用户权限及风控重置

    "menu_admin_audit_logs": False,         # 审计安全日志菜单
    "audit_log_view": False,                # 查阅全平台安全审计流水
    "audit_log_clean": False,               # 清理历史审计日志

    "menu_admin_platforms": False,          # 三方平台接入管理菜单（仅管理员默认可见）
    "platform_manage_edit": False,          # 平台与子资源增删改与一键抓取配置（需管理员身份）
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

    # 商品库中心模块：menu_products -> product_view -> ai_evaluate（收藏已独立到 menu_favorites 组）
    "product_view": "menu_products",
    "product_ai_evaluate": "product_view",

    # v1.88.1 我的收藏中心：menu_favorites -> favorite_view -> [favorite_create, favorite_delete]
    "favorite_view": "menu_favorites",
    "favorite_create": "favorite_view",
    "favorite_delete": "favorite_view",

    # AI 助手模块：menu_ai_assistant -> [ai_chat, ai_session_create, rename, delete]
    "ai_chat": "menu_ai_assistant",
    "ai_session_create": "menu_ai_assistant",
    "ai_session_rename": "menu_ai_assistant",
    "ai_session_delete": "menu_ai_assistant",
    "ai_fetch_models": "menu_ai_assistant",

    # 三方平台模块：menu_admin_platforms -> platform_manage_edit
    "platform_manage_edit": "menu_admin_platforms",
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
            {"key": "menu_health", "name": "健康中心", "desc": "妈妈孕产档案、宝宝生长档案、疫苗计划与健康时间轴", "parent_key": None},
            {"key": "menu_fetal_stories", "name": "胎教故事", "desc": "每日温馨胎教故事阅读", "parent_key": None},
            {"key": "menu_recipes", "name": "孕期食谱", "desc": "各阶段专属孕期餐与营养谱", "parent_key": None},
            {"key": "menu_encyclopedia", "name": "幼儿百科", "desc": "幼儿身体与认知趣味科普", "parent_key": None},
            {"key": "menu_notifications", "name": "消息通知", "desc": "系统提醒与关怀通知中心", "parent_key": None},
            {"key": "menu_weather", "name": "天气预报/万年历", "desc": "实时天气、15天预报、空气质量与黄历班休", "parent_key": None},
            {"key": "menu_third_party_hub", "name": "三方中转站", "desc": "聚合三方精选网站与工具箱导航", "parent_key": None},
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
        "description": "控制普通用户在健康中心中妈妈孕产档案、宝宝生长档案、疫苗计划与健康时间轴的增删改查权限",
        "permissions": [
            {"key": "health_record_view", "name": "查看健康档案 (查)", "desc": "查看妈妈孕产档案、BMI 时序看板、宝宝生长曲线与疫苗计划", "parent_key": "menu_health"},
            {"key": "health_record_create", "name": "新增健康记录 (增)", "desc": "健康打卡（孕期/产后/非孕期）、宝宝测量与疫苗接种记录录入，及 CSV 批量导入", "parent_key": "health_record_view"},
            {"key": "health_record_update", "name": "修改健康记录 (改)", "desc": "编辑更新既往录入的健康打卡、测量与接种数据，含同日覆盖更新", "parent_key": "health_record_view"},
            {"key": "health_record_delete", "name": "删除记录 (删)", "desc": "删除历史健康记录，支持勾选批量删除", "parent_key": "health_record_view"},
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
    # 商品库中心模块（浏览与 AI 评测；收藏功能已独立至「我的收藏中心」组）
    {
        "group_key": "product",
        "group_key": "product",
        "group_name": "商品库中心功能（浏览/AI）",
        "description": "控制普通用户对商品的浏览与 AI 评测权限（收藏权限已独立到「我的收藏中心」组）",
        "permissions": [
            {"key": "product_view", "name": "浏览商品 (查)", "desc": "查看商品库列表、多维度详情与推荐链接", "parent_key": "menu_products"},
            {"key": "product_ai_evaluate", "name": "AI一键评测 (用)", "desc": "在商品详情页调用 AI 获取深度客观评测", "parent_key": "product_view"},
        ],
    },
    {
        "group_key": "favorites",
        "group_name": "我的收藏中心功能（CRUD）",
        "description": "控制普通用户对商品、孕育知识、胎教故事、孕期食谱、幼儿百科、清单等全部类型收藏的添加、查看与取消权限",
        "permissions": [
            {"key": "menu_favorites", "name": "我的收藏菜单", "desc": "访问我的收藏中心页面（分类浏览/搜索/分页/批量管理）", "parent_key": None},
            {"key": "favorite_view", "name": "查看收藏中心 (查)", "desc": "按分类查看收藏列表、搜索筛选与有效性状态", "parent_key": "menu_favorites"},
            {"key": "favorite_create", "name": "添加收藏 (增)", "desc": "在商品/知识内容页发起收藏（含胎教故事/孕期食谱/幼儿百科/时间轴）", "parent_key": "favorite_view"},
            {"key": "favorite_delete", "name": "取消收藏 (删)", "desc": "取消单条收藏或勾选批量取消收藏", "parent_key": "favorite_view"},
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
            {"key": "ai_fetch_models", "name": "拉取模型列表 (查)", "desc": "在 AI 配置中通过 Base URL 自动拉取可用模型列表", "parent_key": "menu_ai_assistant"},
        ],
    },
    # v1.88.1 管理后台拆分为 8 个独立展示组（权限键不变，仅分组展示，权限树更清晰）
    {
        "group_key": "admin_backups",
        "group_name": "云端容灾备份管理",
        "description": "WebDAV 云端备份、全量快照、系统还原与定时备份任务（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_backups", "name": "云端容灾备份菜单", "desc": "进入 WebDAV 云端备份与系统容灾管理页面", "parent_key": None},
            {"key": "backup_config_manage", "name": "WebDAV配置 (改)", "desc": "配置 WebDAV 服务器、账号授权码及加密策略", "parent_key": "menu_admin_backups"},
            {"key": "backup_trigger", "name": "生成备份 (增)", "desc": "手动创建系统快照并上传或离线导出", "parent_key": "menu_admin_backups"},
            {"key": "backup_restore", "name": "系统还原 (高危)", "desc": "从云端或本地快照执行灾难恢复覆盖", "parent_key": "menu_admin_backups"},
            {"key": "backup_task_manage", "name": "定时任务管理 (改)", "desc": "创建、启停、编辑自动定时备份任务", "parent_key": "menu_admin_backups"},
        ],
    },
    {
        "group_key": "admin_service_config",
        "group_name": "外部接口配置管理",
        "description": "天气、法定节假日与 AI 公网搜索引擎管线配置（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_service_config", "name": "外部接口配置菜单", "desc": "进入天气、节假日及 AI 公网搜索管线配置页面", "parent_key": None},
            {"key": "service_config_view", "name": "查看接口配置 (查)", "desc": "查阅各外部服务状态及单项连通测试", "parent_key": "menu_admin_service_config"},
            {"key": "service_config_update", "name": "修改接口配置 (改)", "desc": "调整天气、历法与搜索引擎权重与密钥", "parent_key": "menu_admin_service_config"},
        ],
    },
    {
        "group_key": "admin_daily_tips",
        "group_name": "关怀贴士管理",
        "description": "今日小锦囊贴士题库维护与一键重置（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_daily_tips", "name": "关怀贴士管理菜单", "desc": "进入今日小锦囊贴士题库管理页面", "parent_key": None},
            {"key": "daily_tips_view", "name": "查看贴士库 (查)", "desc": "查阅贴士库列表与展示数量规则", "parent_key": "menu_admin_daily_tips"},
            {"key": "daily_tips_manage", "name": "编辑贴士题库 (改/删)", "desc": "新增自定义贴士、修改、删除及一键重置内置题库", "parent_key": "menu_admin_daily_tips"},
        ],
    },
    {
        "group_key": "admin_knowledge",
        "group_name": "知识库管理中心",
        "description": "孕期周历/时间轴、胎教故事、孕期食谱、幼儿百科、待产包预置库五大题库的增删改查/批量/CSV导入导出/恢复出厂（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_kb_timeline", "name": "知识库-孕期周历管理菜单", "desc": "管理孕期周历/时间轴/本周重点题库（含恢复出厂）", "parent_key": None},
            {"key": "kb_timeline_view", "name": "查看周历题库 (查)", "desc": "查阅孕期周历/时间轴事件列表与筛选", "parent_key": "menu_admin_kb_timeline"},
            {"key": "kb_timeline_manage", "name": "编辑周历题库 (改/删)", "desc": "新增/修改/删除/批量操作/恢复出厂时间轴事件", "parent_key": "menu_admin_kb_timeline"},

            {"key": "menu_admin_kb_stories", "name": "知识库-胎教故事管理菜单", "desc": "管理胎教故事题库（含恢复出厂与CSV导入导出）", "parent_key": None},
            {"key": "kb_stories_view", "name": "查看故事题库 (查)", "desc": "查阅胎教故事列表与筛选", "parent_key": "menu_admin_kb_stories"},
            {"key": "kb_stories_manage", "name": "编辑故事题库 (改/删)", "desc": "新增/修改/删除/批量操作/恢复出厂/CSV导入导出胎教故事", "parent_key": "menu_admin_kb_stories"},

            {"key": "menu_admin_kb_recipes", "name": "知识库-孕期食谱管理菜单", "desc": "管理孕期食谱题库（含恢复出厂与CSV导入导出）", "parent_key": None},
            {"key": "kb_recipes_view", "name": "查看食谱题库 (查)", "desc": "查阅孕期食谱列表与筛选", "parent_key": "menu_admin_kb_recipes"},
            {"key": "kb_recipes_manage", "name": "编辑食谱题库 (改/删)", "desc": "新增/修改/删除/批量操作/恢复出厂/CSV导入导出孕期食谱", "parent_key": "menu_admin_kb_recipes"},

            {"key": "menu_admin_kb_encyclopedia", "name": "知识库-幼儿百科管理菜单", "desc": "管理幼儿百科问答题库（含恢复出厂与CSV导入导出）", "parent_key": None},
            {"key": "kb_encyclopedia_view", "name": "查看百科题库 (查)", "desc": "查阅幼儿百科问答列表与筛选", "parent_key": "menu_admin_kb_encyclopedia"},
            {"key": "kb_encyclopedia_manage", "name": "编辑百科题库 (改/删)", "desc": "新增/修改/删除/批量操作/恢复出厂/CSV导入导出幼儿百科", "parent_key": "menu_admin_kb_encyclopedia"},

            {"key": "menu_admin_kb_shopping", "name": "知识库-待产包预置库菜单", "desc": "管理待产包预置参考物品库（含恢复出厂）", "parent_key": None},
            {"key": "kb_shopping_view", "name": "查看待产包预置库 (查)", "desc": "查阅待产包预置参考物品列表与统计", "parent_key": "menu_admin_kb_shopping"},
            {"key": "kb_shopping_manage", "name": "编辑待产包预置库 (改/删)", "desc": "新增/修改/删除/批量操作/恢复出厂待产包预置物品", "parent_key": "menu_admin_kb_shopping"},
        ],
    },
    {
        "group_key": "admin_registration",
        "group_name": "注册管理",
        "description": "注册模式切换与邀请链接管理（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_registration", "name": "注册管理菜单", "desc": "进入注册策略与邀请链接管理页面", "parent_key": None},
            {"key": "registration_manage", "name": "注册策略调控 (改)", "desc": "切换开放/邀请码/关闭注册模式及生成邀请链接", "parent_key": "menu_admin_registration"},
        ],
    },
    {
        "group_key": "admin_products",
        "group_name": "商品发布管理",
        "description": "母婴选品库商品发布/编辑/下架与品牌库维护（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_products_manage", "name": "商品发布管理菜单", "desc": "进入母婴选品库后台管理页面", "parent_key": None},
            {"key": "product_manage_create", "name": "发布商品 (增)", "desc": "在商品选品库中录入全新商品及规格", "parent_key": "menu_admin_products_manage"},
            {"key": "product_manage_edit", "name": "编辑商品 (改)", "desc": "修改已有商品基本信息、标签、图片与购买链接", "parent_key": "menu_admin_products_manage"},
            {"key": "product_manage_delete", "name": "下架删除商品 (删)", "desc": "从选品库中下架或彻底删除商品", "parent_key": "menu_admin_products_manage"},
        ],
    },
    {
        "group_key": "admin_users",
        "group_name": "用户与权限管控",
        "description": "用户列表、资料编辑、账号冻结与权限模板定制（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_users", "name": "用户管理菜单", "desc": "进入用户列表与权限管控中心", "parent_key": None},
            {"key": "user_manage_view", "name": "查看用户列表 (查)", "desc": "查阅全站用户手机、角色、注册信息与状态", "parent_key": "menu_admin_users"},
            {"key": "user_manage_edit", "name": "编辑用户资料 (改)", "desc": "修改用户昵称、角色及密码重置", "parent_key": "menu_admin_users"},
            {"key": "user_manage_freeze", "name": "冻结/解冻账号 (改)", "desc": "冻结违规账号或解冻受限用户", "parent_key": "menu_admin_users"},
            {"key": "permission_manage", "name": "权限管控与风控 (高危)", "desc": "定制单用户权限、保存全局权限模板与调整风控熔断阈值", "parent_key": "menu_admin_users"},
        ],
    },
    {
        "group_key": "admin_platforms",
        "group_name": "三方平台接入管理",
        "description": "三方网站中转站、子资源入口管理与一键抓取（仅管理员，普通用户即使赋权配置菜单也仅只读访问）",
        "permissions": [
            {"key": "menu_admin_platforms", "name": "三方平台接入管理菜单", "desc": "进入三方平台接入与中转配置管理页面", "parent_key": None},
            {"key": "platform_manage_edit", "name": "平台与资源编辑 (增/改/删)", "desc": "新增平台、修改配置、维护子资源入口及一键抓取解析", "parent_key": "menu_admin_platforms"},
        ],
    },
    {
        "group_key": "admin_audit",
        "group_name": "审计日志",
        "description": "全平台安全审计流水查阅与清理（默认仅管理员）",
        "permissions": [
            {"key": "menu_admin_audit_logs", "name": "审计日志菜单", "desc": "进入系统安全审计流水查看页面", "parent_key": None},
            {"key": "audit_log_view", "name": "查看审计日志 (查)", "desc": "查阅登录、操作、数据修改等全量审计流水", "parent_key": "menu_admin_audit_logs"},
            {"key": "audit_log_clean", "name": "清理审计日志 (删)", "desc": "按保留天数清理过期历史审计日志", "parent_key": "menu_admin_audit_logs"},
        ],
    },
]


def get_default_permissions_for_stage(
    due_date=None,
    baby_birthday=None,
    is_pregnant=None,
) -> dict:
    """根据宝宝年龄阶段动态推导初始默认菜单与功能权限。
    1. 宝宝已出生 (is_pregnant=False 或 有 baby_birthday 且无 due_date)：
       - 禁用孕期专属：孕期周历 (menu_timeline)、孕期食谱 (menu_recipes)、胎教故事 (menu_fetal_stories)
       - 启用育儿专属：幼儿百科 (menu_encyclopedia)
    2. 宝宝未出生/孕期中 (is_pregnant=True 或 有 due_date)：
       - 启用孕期专属：孕期周历 (menu_timeline)、孕期食谱 (menu_recipes)、胎教故事 (menu_fetal_stories)
       - 禁用育儿专属：幼儿百科 (menu_encyclopedia)
    3. 未设置：保持基础系统默认 (DEFAULT_USER_PERMISSIONS)
    """
    base = dict(DEFAULT_USER_PERMISSIONS)

    is_born = False
    if is_pregnant is False:
        is_born = True
    elif is_pregnant is True:
        is_born = False
    else:
        if baby_birthday and not due_date:
            is_born = True
        elif due_date:
            is_born = False

    if is_born:
        base["menu_timeline"] = False
        base["menu_recipes"] = False
        base["menu_fetal_stories"] = False
        base["menu_encyclopedia"] = True
    elif is_pregnant is True or due_date:
        base["menu_timeline"] = True
        base["menu_recipes"] = True
        base["menu_fetal_stories"] = True
        base["menu_encyclopedia"] = False

    return normalize_permissions(base)


def build_initial_permissions(due_date=None, baby_birthday=None, is_pregnant=None, template=None) -> dict:
    """构建普通用户的「初始权限快照」：代码基线 + 全局默认权限模板 + 宝宝阶段自适应。

    该函数作为权限模板的唯二快照源（新用户注册初始化、管理员点击「重置为系统默认」、
    以及存量用户数据迁移），返回已父子联动规范化、且剔除内部键（_ 开头）的完整权限字典。

    - template 为 None 时，自动读取系统全局默认权限模板 (SystemSetting.default_user_permissions)；
    - 宝宝阶段自适应固定覆盖 4 个阶段菜单键（时间轴/食谱/胎教故事/幼儿百科）。
    """
    merged = dict(DEFAULT_USER_PERMISSIONS)

    # 1. 系统全局默认权限模板覆盖
    if template is None:
        try:
            from apps.core.models import SystemSetting
            template = getattr(SystemSetting.get_settings(), "default_user_permissions", {}) or {}
        except Exception:
            template = {}
    if isinstance(template, dict):
        for k, v in template.items():
            if k in merged:
                merged[k] = bool(v)

    # 2. 宝宝阶段自适应覆盖 4 个阶段菜单键
    stage_defaults = get_default_permissions_for_stage(
        due_date=due_date,
        baby_birthday=baby_birthday,
        is_pregnant=is_pregnant,
    )
    for sk in ("menu_timeline", "menu_recipes", "menu_fetal_stories", "menu_encyclopedia"):
        merged[sk] = stage_defaults[sk]

    norm = normalize_permissions(merged)
    return {k: v for k, v in norm.items() if not k.startswith("_")}


def get_user_permissions(user) -> dict:
    """获取指定用户的最终生效权限字典。
    管理员(is_staff/is_superuser)拥有全部 True 权限，任何时候不可禁用菜单与功能。

    【v1.88.6 快照固化模式】全局默认权限模板不参与实时解析：
      全局模板仅作为快照源，在新用户注册、管理员点击「重置为系统默认」时固化写入
      用户 custom_permissions；此后修改全局模板不会自动覆盖任何已有用户权限。

    普通用户：
      1. 基础系统默认配置 (DEFAULT_USER_PERMISSIONS)
      2. 用户个性化权限快照覆盖 (user.custom_permissions，注册/重置/管理员定制均固化于此)
      3. 无任何快照的异常兜底：自动应用宝宝阶段自适应菜单过滤规则
      4. 严格执行递归父子联动规范化
    """
    if not user:
        return normalize_permissions(DEFAULT_USER_PERMISSIONS)

    # 管理员无条件具备所有权限，绝不被任何设置禁用
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return {k: True for k in DEFAULT_USER_PERMISSIONS}

    merged = dict(DEFAULT_USER_PERMISSIONS)

    custom = getattr(user, "custom_permissions", {}) or {}
    if not custom:
        # 异常兜底：用户无任何权限快照（理论上注册/迁移后不会出现），依据宝宝年龄阶段初始化默认菜单权限
        is_pregnant = getattr(user, "is_pregnant", None)
        baby_birthday = getattr(user, "baby_birthday", None)
        due_date = getattr(user, "due_date", None)
        stage_defaults = get_default_permissions_for_stage(
            due_date=due_date,
            baby_birthday=baby_birthday,
            is_pregnant=is_pregnant,
        )
        for sk in ("menu_timeline", "menu_recipes", "menu_fetal_stories", "menu_encyclopedia"):
            merged[sk] = stage_defaults[sk]
    else:
        # 用户已有权限快照（注册固化/管理员定制/重置固化）：快照优先级最高
        if isinstance(custom, dict):
            for k, v in custom.items():
                if k in merged:
                    merged[k] = bool(v)

    norm = normalize_permissions(merged)
    return {k: v for k, v in norm.items() if not k.startswith("_")}


def has_permission(user, perm_key: str) -> bool:
    """检查用户是否具有指定权限项。管理员永远返回 True。"""
    if not user:
        return False
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True
    if not getattr(user, "is_authenticated", False):
        return False
    perms = get_user_permissions(user)
    return bool(perms.get(perm_key, False))


def check_permission_or_403(user, perm_key: str, message: str = "管理员已关闭该功能，如有需要请联系管理员开启"):
    """若无权限则抛出 PermissionDenied 异常。管理员永远通行。"""
    if not user:
        raise PermissionDenied(detail={"code": 4030, "message": "请先登录后再操作", "permission": perm_key})
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return
    if not getattr(user, "is_authenticated", False):
        raise PermissionDenied(detail={"code": 4030, "message": "请先登录后再操作", "permission": perm_key})
    if not has_permission(user, perm_key):
        raise PermissionDenied(detail={"code": 4030, "message": message, "permission": perm_key})
