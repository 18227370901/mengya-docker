---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'aefda46a-a8aa-46f6-86f4-a3e9cdf7a6e4'
  PropagateID: 'aefda46a-a8aa-46f6-86f4-a3e9cdf7a6e4'
  ReservedCode1: '86c23125-5e31-4ee1-abc2-531f2d8a2e14'
  ReservedCode2: '86c23125-5e31-4ee1-abc2-531f2d8a2e14'
---

# 萌芽平台 AI 助手模块开发指南 (agent.md)

> 本文档面向 AI 开发者（Agent），完整描述萌芽母婴平台 AI 助手模块的架构设计、安全边界、业务逻辑、数据模型、API 规格与前端交互，使另一个 AI 能据此从零完成一模一样的开发。

---

## 1. 系统概览

### 1.1 技术栈

- 后端：Django 4.x + Django REST Framework + SQLite（开发环境）
- 前端：React 18 + TypeScript + Vite + Tailwind CSS + Zustand（状态管理）
- AI 接入：OpenAI Python SDK（兼容任何 OpenAI 协议的 API 端点）
- 联网搜索：DuckDuckGo Search（ddgs / duckduckgo_search 库）
- 认证：JWT（SimpleJWT），Bearer token

### 1.2 AI 助手核心能力

1. 智能问答：用户在聊天界面提问，AI 基于用户阶段（孕周/宝宝月龄）和本周知识库回答
2. 联网搜索：自动判断问题是否需要联网（天气/新闻/实时信息），搜索后注入 prompt
3. 产品对比：选定多个商品后调用 AI 生成结构化对比报告
4. 多配置容错：支持配置多个 AI（不同 key/base_url/model），按优先级顺序尝试，全部失败后回退本地知识引擎
5. 会话管理：多会话创建/切换/重命名/删除，消息持久化到数据库
6. 三级授权：管理员配置 → 全局配置 → 被授权用户共享管理员配置

### 1.3 部署架构

```
前端 (localhost:5173)          后端 (localhost:8000)
  React App                      Django + DRF
    │                               │
    ├─ AIAssistantPage.tsx         ├─ views.py (ai_chat, ai_sessions...)
    │  └─ chatStore.ts (zustand)   ├─ services/ai_service.py (核心逻辑)
    │                              ├─ services/web_search.py (联网搜索)
    ├─ AIConfigPage.tsx            ├─ models/chat.py (ChatSession, ChatMessage)
    │  └─ authApi (AI配置管理)     ├─ models/ai_log.py (AIQueryLog)
    │                              ├─ models/user.py (User.ai_configs等字段)
    └─ api/services.ts             └─ utils/rate_limit.py, stage_utils.py
       └─ aiApi (聊天/会话API)
```

---

## 2. 后端数据模型

### 2.1 User 模型中的 AI 相关字段

文件：`backend/apps/core/models/user.py`

```python
class User(AbstractUser):
    # 旧版单配置（向后兼容）
    ai_api_key = models.CharField(max_length=255, blank=True, default="")
    ai_base_url = models.CharField(max_length=255, blank=True, default="")
    ai_model = models.CharField(max_length=100, blank=True, default="")

    # 多配置列表（JSON 数组）
    ai_configs = models.JSONField(default=list, blank=True)
    # ai_configs 结构: [{"name": str, "api_key": str, "base_url": str, "model": str, "enabled": bool}]

    # AI 授权标记（管理员可授权普通用户使用 AI）
    ai_authorized = models.BooleanField(default=False)
```

设计要点：
- `ai_configs` 是 JSON 数组，支持多个 AI 配置，每个含 name/api_key/base_url/model/enabled
- 旧版 `ai_api_key` 等三个字段保留，保存时与 `ai_configs[0]` 同步，确保向后兼容
- `ai_authorized` 控制普通用户是否可共享管理员配置

### 2.2 ChatSession 模型

文件：`backend/apps/core/models/chat.py`

```python
class ChatSession(models.Model):
    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="chat_sessions")
    title = models.CharField(max_length=100, default="新会话")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
```

### 2.3 ChatMessage 模型

```python
class ChatMessage(models.Model):
    ROLE_CHOICES = [("user", "用户"), ("ai", "AI")]

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    used_config_name = models.CharField(max_length=100, blank=True, default="")  # 使用的AI配置名
    used_search = models.BooleanField(default=False)  # 是否使用了联网搜索
    error_hint = models.TextField(blank=True, default="")  # 错误提示
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
```

设计要点：
- `used_config_name` 让前端知道当前回复用了哪个 AI 配置
- `used_search` 标记是否触发了联网搜索
- `error_hint` 在所有 AI 配置都失败时，告知用户原因并引导去配置页面

### 2.4 AIQueryLog 模型（旧版兼容）

文件：`backend/apps/core/models/ai_log.py`

```python
class AIQueryLog(models.Model):
    QUERY_TYPES = [("qa", "普通问答"), ("price_compare", "比价"), ...]
    user = models.ForeignKey("User", on_delete=models.SET_NULL, null=True, blank=True)
    session_id = models.CharField(max_length=100, blank=True)
    query_type = models.CharField(max_length=20, choices=QUERY_TYPES, default="qa")
    query_text = models.TextField()
    response_text = models.TextField()
    response_time_ms = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
```

每次 `ai_chat` 调用同时写入 ChatMessage（新版）和 AIQueryLog（旧版兼容），确保历史数据不丢失。

### 2.5 全局配置（环境变量）

文件：`backend/config/settings.py`

```python
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")
RATE_LIMIT_GENERAL_PER_MINUTE = int(os.getenv("RATE_LIMIT_GENERAL_PER_MINUTE", "30"))
```

---

## 3. 后端核心服务层

### 3.1 ai_service.py 整体架构

文件：`backend/apps/core/services/ai_service.py`

核心函数调用链：

```
ai_chat(query, stage_label, user)
  ├─ needs_search(query)  → 判断是否联网
  ├─ search_and_summarize(query)  → DuckDuckGo搜索，返回格式化文本
  ├─ _build_week_knowledge(user)  → 根据孕周提取知识库
  ├─ _build_config_list(user)  → 构建AI配置优先级列表
  ├─ _call_openai(prompt, api_key, base_url, model)  → 逐个尝试配置
  └─ _local_question(query, stage_label)  → 全部失败时的本地兜底
```

### 3.2 AI 配置优先级体系（_build_config_list）

```python
def _build_config_list(user=None):
    # 返回 [{name, api_key, base_url, model}] 列表

    # 第1优先级：用户多配置 (user.ai_configs)
    #   遍历 ai_configs，筛选 enabled=True 且有 api_key 的条目
    #   按 ai_configs 数组顺序排列

    # 第2优先级：用户旧版单配置 (user.ai_api_key)
    #   仅在未被第1优先级重复包含时加入

    # 第3优先级：全局配置 (settings.OPENAI_API_KEY)
    #   仅在未被前面重复包含时加入

    # 第4优先级：管理员共享配置
    #   仅当用户无任何自己的配置、且 ai_authorized=True、且非管理员时
    #   查找第一个 is_staff=True 且 ai_configs 非空的管理员
    #   取其第一个 enabled 且有 api_key 的配置
```

关键安全边界：
- API Key 从不暴露给前端（GET 接口返回时也不含 key 明文——管理员可见但不传给普通用户）
- 被授权用户只能"使用"管理员配置，不能"查看"管理员配置内容
- 配置去重：同一个 api_key 只保留第一个出现的配置

### 3.3 System Prompt 设计

```python
GENERAL_CHAT_PROMPT = """
你是一个乐于助人的智能助手，名字叫"萌小芽"。

## 当前日期
今天是 {today}（{weekday}）。
当用户询问日期/时间/星期/节假日等问题时，以此为准。

## 网络搜索结果
{search_context}
如果有搜索结果，优先基于搜索结果回答，末尾标注信息来源。
如显示"（无网络搜索结果）"，则按自身知识回答。

## 用户当前阶段
{user_stage}

## 本周知识库（基于用户当前孕周）
{week_knowledge}
如果有知识库内容，回答孕产/胎儿发育/营养/产检/胎教等问题时优先参考。

## 用户问题
{user_query}

## 输出要求
1. 语气温暖、耐心，像朋友聊天
2. 涉及母婴/育儿/孕产问题时结合用户阶段和知识库
3. 涉及医疗问题提醒以医生建议为准
4. 回答简洁明了
5. 有搜索结果时末尾标注"（信息来源：网络搜索）"
"""
```

### 3.4 本周知识库构建（_build_week_knowledge）

```python
def _build_week_knowledge(user):
    # 1. 检查用户是否孕期且设置了预产期
    # 2. 计算当前孕周：days_pregnant = (today - due_date).days + 280
    # 3. 查询 TimelineEvent.objects.filter(stage_type="pregnancy_week", stage_value=week)
    # 4. 每个事件提取：[分类] 标题：内容前120字（小贴士前60字）
    # 5. 返回多行文本注入 prompt
```

### 3.5 联网搜索（web_search.py）

文件：`backend/apps/core/services/web_search.py`

```python
# 需要联网搜索的关键词正则模式
_SEARCH_PATTERNS = [
    r"天气|气温|温度|下雨|下雪|台风|雾霾|空气质量",
    r"新闻|最新|最近|今天.*发生|热点|事件|时事",
    r"现在|目前|当前|实时|今天|今日|本月|近期",
    r"搜一下|搜索|查一下|帮我查|查询",
    r"股价|汇率|油价|金价|比特币|基金|股票|理财|利率",
    r"是谁|谁.*说|谁.*做|发生了什么",
    r"几号|星期几|节假日|放假|调休|农历|阴历|阳历|节气",
]

def needs_search(query): # 逐条匹配正则，任一命中返回 True
def web_search(query, max_results=5): # DuckDuckGo 搜索
def search_and_summarize(query): # 格式化搜索结果为 prompt 注入文本
```

### 3.6 本地回复引擎（无 API Key 时兜底）

```python
_LOCAL_INTENTS = [
    ("比价", "关于比价：建议先在京东自营和淘宝旗舰店对比..."),
    ("安全座椅", "安全座椅选购要点：1）必须有3C认证..."),
    ("推车", "婴儿推车选购要点：1）避震性能优先..."),
    # ... 共12个本地意图
]

def _local_question(query, stage_label):
    # 关键词匹配 → 命中则返回对应预设回答
    # 未命中 → 返回通用引导消息，提示用户配置 API Key
```

### 3.7 产品对比 AI（ai_compare）

```python
def ai_compare(query_text, products, stage_label, user):
    # 1. 构建 PRODUCT_COMPARE_PROMPT，注入产品列表和详细数据
    # 2. 遍历 _build_config_list(user) 逐个尝试 OpenAI
    # 3. 成功返回 {"response": ..., "mode": "openai", ...}
    # 4. 全部失败返回本地结构化对比（基于五维评分+价格数据）
```

---

## 4. 后端 API 规格

### 4.1 AI 聊天

```
POST /api/ai/chat/
Auth: Bearer JWT
Body: { "query": "用户问题", "session_id": 123 (可选) }
Response: {
  "code": 0,
  "data": {
    "query": "用户问题",
    "response": "AI回复文本",
    "used_openai": true/false,
    "used_config_name": "配置名称",
    "used_search": true/false,
    "latency_ms": 500,
    "suggestions": ["推荐问题1", ...],
    "error_hint": "错误提示(空字符串表示无错误)",
    "session_id": 123,
    "session_title": "会话标题"
  }
}
```

业务逻辑：
1. 如果传了 session_id，使用已有会话；否则自动创建新会话（标题取问题前30字）
2. 保存用户消息和 AI 消息到 ChatMessage 表
3. 同时写入 AIQueryLog（旧版兼容）
4. 返回 session_id 供前端后续使用

### 4.2 AI 产品对比

```
POST /api/ai/compare/
Auth: Bearer JWT
Body: { "product_ids": [1, 2, 3], "query": "用户问题(可选)" }
Response: { "code": 0, "data": { "response": "...", "mode": "openai/local", "products": [1,2,3] } }
```

### 4.3 会话管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/ai/sessions/ | 获取当前用户会话列表（摘要，不含消息） |
| GET | /api/ai/sessions/{id}/ | 获取某会话完整消息列表 |
| POST | /api/ai/sessions/create/ | 创建新会话 |
| PATCH | /api/ai/sessions/{id}/rename/ | 重命名会话 |
| DELETE | /api/ai/sessions/{id}/delete/ | 删除会话及所有消息 |

安全边界：
- 所有会话操作均检查 `user=request.user`，用户只能操作自己的会话
- `get_object_or_404(ChatSession, id=session_id, user=request.user)` 确保跨用户访问返回404

### 4.4 AI 配置管理 API

```
GET /api/users/ai-config/
Auth: Bearer JWT + IsAdminUser
Response: {
  "ai_configs": [{name, api_key, base_url, model, enabled}],
  "ai_api_key": "旧版字段",
  "ai_base_url": "旧版字段",
  "ai_model": "旧版字段",
  "has_global_key": false,
  "can_manage": true
}

PUT /api/users/ai-config/
Auth: Bearer JWT + IsAdminUser
Body: { "ai_configs": [{name, api_key, base_url, model, enabled}, ...] }
```

安全边界：
- `permission_classes = [IsAuthenticated, IsAdminUser]` → 仅管理员可访问
- 普通用户访问返回 403，前端显示"此页面仅管理员可访问"
- 保存时自动同步 `ai_configs[0]` 到旧版字段
- 空 api_key 的配置会被跳过（不保存）

### 4.5 AI 授权管理 API

```
GET /api/users/ai-auth/
Auth: Bearer JWT + IsAdminUser
→ 返回所有用户列表及其 ai_authorized 状态

POST /api/users/ai-auth/
Auth: Bearer JWT + IsAdminUser
Body: { "user_id": 5, "ai_authorized": true }
→ 切换指定用户的 AI 授权状态
```

### 4.6 AI 建议（推荐问题）

```
GET /api/ai/suggestions/
Auth: Bearer JWT
→ 返回 ["待产包应该准备哪些物品？", "婴儿推车怎么选？", ...]
```

---

## 5. 前端架构

### 5.1 文件结构

```
frontend/src/
├── api/
│   ├── client.ts          # axios 实例，JWT 拦截，401 跳登录
│   ├── services.ts        # aiApi: chat/sessions/sessionDetail/...
│   └── auth.ts            # authApi: aiConfig/updateAIConfig/aiAuthList/aiAuthToggle
├── store/
│   ├── chatStore.ts        # zustand + persist，聊天状态持久化
│   └── authStore.ts        # 用户认证状态
├── pages/
│   ├── AIAssistantPage.tsx # AI 聊天主页面
│   └── AIConfigPage.tsx    # AI 配置管理页面（管理员）
└── types/
    └── index.ts            # ChatSessionSummary, ChatSessionDetail, AIChatResult 等
```

### 5.2 API 客户端（client.ts）

```typescript
const api = axios.create({ baseURL: "/api", timeout: 30000 });

// 请求拦截：附加 JWT Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mengya_access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截：
// - code !== 0 时 reject（业务错误）
// - 401 时清除 token + 跳转 /login
// - 统一提取 error.message
```

### 5.3 聊天状态管理（chatStore.ts）

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatState {
  messages: Msg[];           // 当前会话消息列表
  activeSessionId: number | null;  // 当前活跃会话ID
  sessions: ChatSessionSummary[];  // 侧边栏会话列表
  loaded: boolean;          // 是否已加载会话列表
  // ... actions
}

export const useChatStore = create<ChatState>()(
  persist(/* ... */, { name: "mengya-chat" })
);
```

设计要点：
- 使用 zustand + persist 中间件，消息在页面切换/刷新后不丢失
- `persist` 存储到 localStorage，key 为 "mengya-chat"
- 切换路由不会丢失聊天内容（修复了早期 Bug：组件卸载时 state 被重置）

### 5.4 AI 助手页面（AIAssistantPage.tsx）

布局结构：
```
┌──────────────────────────────────────────────┐
│  侧边栏(可折叠)  │  对话区                      │
│  ┌────────────┐  │  ┌──────────────────────┐  │
│  │ 新建会话    │  │  │ 萌芽 AI 助手标题       │  │
│  │ ─────────  │  │  │ ───────────────────  │  │
│  │ 会话1 [选中]│  │  │ 消息气泡区(滚动)      │  │
│  │ 会话2      │  │  │ user消息(右对齐)      │  │
│  │ 会话3      │  │  │ ai消息(左对齐+头像)   │  │
│  │ ...        │  │  │ loading动画           │  │
│  └────────────┘  │  └──────────────────────┘  │
│                  │  输入框 + 发送按钮           │
│                  │  "AI回答仅供参考，医疗请遵医嘱"│
└──────────────────────────────────────────────┘
```

交互逻辑：
1. 首次加载：拉取推荐问题 + 会话列表
2. 发送消息：addMessage(user) → POST /ai/chat → addMessage(ai) → 刷新会话列表
3. 如果 used_openai + used_config_name：额外显示配置名提示
4. 如果 error_hint：显示错误提示，引导去配置页
5. 切换会话：清空 messages → GET /ai/sessions/{id}/ → 重新加载消息
6. 新建会话：clearMessages()（不调API，第一条消息时自动创建）
7. 重命名会话：内联编辑 → PATCH /ai/sessions/{id}/rename/
8. 删除会话：二次确认弹窗 → DELETE → 从侧边栏移除

### 5.5 AI 配置页面（AIConfigPage.tsx）

安全控制：
1. 页面加载时 GET /users/ai-config/，如果返回 403 → 显示"仅管理员可访问"
2. 多配置卡片列表，每个含：配置名称、API Key（密码框+显示/隐藏切换）、Base URL、Model、启用/禁用开关
3. 支持上下移动调整优先级顺序
4. 支持删除单个配置
5. "添加 AI 配置"按钮：新增空配置卡片
6. 保存时 PUT /users/ai-config/ { ai_configs: [...] }
7. 管理员额外显示"AI 授权管理"面板：勾选/取消普通用户的 AI 授权

---

## 6. 安全边界总结

### 6.1 认证与授权

| 层级 | 控制方式 | 说明 |
|------|----------|------|
| 所有 AI API | IsAuthenticated | 必须登录 |
| AI 配置管理 | IsAdminUser | 仅管理员可查看/修改 |
| AI 授权管理 | IsAdminUser | 仅管理员可授权 |
| 会话操作 | 隐式隔离 | 查询条件含 user=request.user |
| 产品对比 | IsAuthenticated | 所有登录用户可用 |

### 6.2 API Key 安全

- API Key 存储在 User 模型的 JSONField 中（明文，依赖数据库安全）
- 前端配置页面的 API Key 输入框默认 type="password"，支持点击切换显示
- 被授权用户无法查看管理员配置内容，只能通过后端间接使用
- 全局配置（环境变量）不对前端暴露 key 内容，仅返回 has_global_key 布尔值

### 6.3 限流

- `rate_limit.py`：基于内存的简单限流，同一 key 每分钟最多 N 次
- `RATE_LIMIT_GENERAL_PER_MINUTE` 默认 30 次/分钟
- `RATE_LIMIT_LOGIN_PER_MINUTE` 默认 5 次/分钟

### 6.4 联网搜索安全

- DuckDuckGo 搜索仅获取摘要文本（title + body），不追踪用户
- 搜索结果注入 prompt 后不持久化，仅用于本次 AI 回复
- 搜索失败时静默降级，不影响 AI 正常回答

### 6.5 医疗免责

- System Prompt 中明确要求"涉及医疗问题提醒以医生建议为准"
- 前端输入框下方固定提示"AI 回答仅供参考，医疗问题请以医生建议为准"

---

## 7. 完整 API 端点清单

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/ai/chat/ | Auth | AI 问答（核心入口） |
| POST | /api/ai/compare/ | Auth | AI 产品对比 |
| GET | /api/ai/sessions/ | Auth | 会话列表 |
| GET | /api/ai/sessions/{id}/ | Auth | 会话详情 |
| POST | /api/ai/sessions/create/ | Auth | 创建会话 |
| PATCH | /api/ai/sessions/{id}/rename/ | Auth | 重命名会话 |
| DELETE | /api/ai/sessions/{id}/delete/ | Auth | 删除会话 |
| GET | /api/ai/history/ | Auth | 旧版历史记录 |
| GET | /api/ai/suggestions/ | Auth | 推荐问题 |
| GET | /api/users/ai-config/ | Admin | 获取 AI 配置 |
| PUT | /api/users/ai-config/ | Admin | 更新 AI 配置 |
| GET | /api/users/ai-auth/ | Admin | 获取授权用户列表 |
| POST | /api/users/ai-auth/ | Admin | 切换用户授权 |

---

## 8. 前端类型定义

```typescript
// AIChatResult - ai_chat 返回
interface AIChatResult {
  query: string;
  response: string;
  used_openai: boolean;
  used_config_name?: string;
  used_search?: boolean;
  latency_ms: number;
  suggestions: string[];
  error_hint?: string;
  session_id?: number;
  session_title?: string;
}

// ChatSessionSummary - 会话列表项
interface ChatSessionSummary {
  id: number;
  title: string;
  message_count: number;
  last_message: string;
  last_role: string;
  created_at: string;
  updated_at: string;
}

// ChatSessionDetail - 会话详情
interface ChatSessionDetail {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessageItem[];
}

// ChatMessageItem - 单条消息
interface ChatMessageItem {
  id: number;
  role: "user" | "ai";
  content: string;
  used_config_name?: string;
  used_search?: boolean;
  error_hint?: string;
  created_at: string;
}

// AIConfigItem - AI 配置项
interface AIConfigItem {
  name: string;
  api_key: string;
  base_url: string;
  model: string;
  enabled: boolean;
}

// AIConfigData - AI 配置返回
interface AIConfigData {
  ai_configs: AIConfigItem[];
  ai_api_key: string;
  ai_base_url: string;
  ai_model: string;
  has_global_key: boolean;
  can_manage: boolean;
}
```

---

## 9. 前端 API 封装

### 9.1 aiApi（services.ts）

```typescript
export const aiApi = {
  chat: (query: string, sessionId?: number) =>
    api.post("/ai/chat/", { query, session_id: sessionId }),
  history: () => api.get("/ai/history/"),
  suggestions: () => api.get("/ai/suggestions/"),
  sessions: () => api.get("/ai/sessions/"),
  sessionDetail: (id: number) => api.get(`/ai/sessions/${id}/`),
  sessionCreate: (title?: string) => api.post("/ai/sessions/create/", { title }),
  sessionRename: (id: number, title: string) =>
    api.patch(`/ai/sessions/${id}/rename/`, { title }),
  sessionDelete: (id: number) => api.delete(`/ai/sessions/${id}/delete/`),
};
```

### 9.2 authApi AI 相关（auth.ts）

```typescript
export const authApi = {
  aiConfig: () => api.get("/users/ai-config/"),
  updateAIConfig: (data) => api.put("/users/ai-config/", data),
  aiAuthList: () => api.get("/users/ai-auth/"),
  aiAuthToggle: (userId: number, authorized: boolean) =>
    api.post("/users/ai-auth/", { user_id: userId, ai_authorized: authorized }),
};
```

---

## 10. 关键业务流程

### 10.1 用户提问完整流程

```
用户输入问题
    │
    ▼
前端 AIAssistantPage
    │  addMessage({role:"user", content:q})
    │  POST /api/ai/chat/ {query, session_id}
    ▼
后端 ai_chat view
    │  get_stage_info(user.due_date, user.baby_birthday) → stage_label
    │  ai_service.ai_chat(query, stage_label, user)
    ▼
ai_service.ai_chat
    │  1. needs_search(query) → 如果True:
    │     search_and_summarize(query) → search_context
    │  2. _build_week_knowledge(user) → week_knowledge
    │  3. 构建 prompt（注入日期/搜索/阶段/知识库/问题）
    │  4. _build_config_list(user) → configs[]
    │  5. for cfg in configs:
    │       _call_openai(prompt, cfg.api_key, cfg.base_url, cfg.model)
    │       成功 → response, break
    │       失败 → error_hints.append(错误信息)
    │  6. 全部失败 → _local_question(query, stage_label)
    ▼
后端保存
    │  ChatMessage(user消息) → ChatMessage(ai消息) → AIQueryLog
    │  返回 {response, used_openai, used_config_name, used_search, error_hint, session_id}
    ▼
前端
    │  addMessage({role:"ai", content:response})
    │  如果 used_openai → 显示配置名
    │  如果 error_hint → 显示错误提示+引导配置
    │  setActiveSessionId(session_id)
    │  刷新会话列表
```

### 10.2 新会话自动创建流程

```
用户首次提问（无 session_id）
    │
    ▼
后端 ai_chat
    │  session_id 为空 → 自动创建 ChatSession
    │  title = query[:30] + "…"
    │  保存用户消息 + AI消息
    │  返回 session_id
    ▼
前端
    │  setActiveSessionId(session_id)
    │  刷新侧边栏会话列表
```

### 10.3 AI 配置保存流程

```
管理员在 AIConfigPage 修改配置
    │
    ▼
前端 PUT /api/users/ai-config/ {ai_configs: [...]}
    │
    ▼
后端 AIConfigView.put
    │  1. 遍历 ai_configs，过滤空 api_key 的条目
    │  2. 清洗：name 截取50字符，base_url/model strip
    │  3. user.ai_configs = cleaned
    │  4. 同步 cleaned[0] 到旧版字段（ai_api_key等）
    │  5. user.save(update_fields=["ai_configs","ai_api_key","ai_base_url","ai_model"])
    │  6. 返回清洗后的配置列表
    ▼
前端更新本地 state
```

---

## 11. 统一响应格式

所有 API 返回统一结构：

```json
{
  "code": 0,       // 0=成功，非0=业务错误
  "message": "success",
  "data": { ... }  // 具体数据
}
```

前端响应拦截器：
- `code !== 0` → reject(Error)，前端 catch 中处理
- HTTP 401 → 清除 token，跳转 /login
- HTTP 403 → 前端 catch 中显示权限提示

---

## 12. 路由注册

### 12.1 后端 URL

```python
# backend/apps/core/urls.py
urlpatterns = [
    path("ai/chat/", views.ai_chat),
    path("ai/compare/", views.ai_compare),
    path("ai/history/", views.ai_history),
    path("ai/suggestions/", views.ai_suggestions),
    path("ai/sessions/", views.ai_sessions),
    path("ai/sessions/create/", views.ai_session_create),
    path("ai/sessions/<int:session_id>/", views.ai_session_detail),
    path("ai/sessions/<int:session_id>/rename/", views.ai_session_rename),
    path("ai/sessions/<int:session_id>/delete/", views.ai_session_delete),
    path("users/ai-config/", views.AIConfigView.as_view()),
    path("users/ai-auth/", views.AIAuthManageView.as_view()),
]
```

### 12.2 前端路由

```tsx
// frontend/src/App.tsx
<Route path="/ai-assistant" element={<AIAssistantPage />} />
<Route path="/settings/ai" element={<AIConfigPage />} />
```

### 12.3 导航入口

- 底部导航 5 个 tab：首页 / 时间轴 / 商品库 / AI助手 / 我的
- AI 助手 tab → `/ai-assistant`
- 个人中心 → AI 助手配置 → `/settings/ai`
- 首页快捷入口：AI小助手 → `/ai-assistant`

---

## 13. 依赖清单

### 后端

```
Django>=4.2
djangorestframework
djangorestframework-simplejwt
openai  # OpenAI Python SDK
ddgs  # 或 duckduckgo_search（DuckDuckGo 搜索）
```

### 前端

```
react react-dom
react-router-dom
axios
zustand
lucide-react  # 图标库
tailwindcss
```

---

## 14. 开发注意事项

1. **OpenAI SDK 可选**：`ai_service.py` 中 `try: from openai import OpenAI except ImportError: OpenAI = None`，未安装时自动降级为本地引擎
2. **DuckDuckGo 可选**：`web_search.py` 同样 try-except 导入，未安装时跳过联网搜索
3. **聊天消息持久化**：使用 zustand persist 存到 localStorage，路由切换不丢失。这是早期 Bug 修复方案——原方案用 useState 导致组件卸载时消息清空
4. **配置去重**：`_build_config_list` 中用 `any(c["api_key"] == ...)` 防止同一个 key 被重复尝试
5. **管理员共享逻辑**：仅取管理员第一个可用配置，不遍历全部，避免过度消耗
6. **error_hint 传递链**：ai_service → ChatMessage.error_hint → 前端展示 → 引导用户去配置页
7. **向后兼容**：ai_configs 为空时自动从旧版 ai_api_key 迁移；保存时同步旧版字段
8. **prompt 中的日期**：每次请求动态注入当前日期，避免 AI 使用训练数据中的旧日期
9. **本周知识库**：仅对孕期用户生效，非孕期返回"（用户非孕期或未设置预产期）"
10. **产品对比本地兜底**：AI 失败时返回结构化文本（非 AI 生成），基于五维评分和价格数据

---

## 15. 测试验证清单

开发完成后需验证：

- [ ] 未配置 API Key 时，AI 聊天返回本地知识引擎回复
- [ ] 配置 API Key 后，AI 聊天使用 OpenAI 回复，返回 used_openai=true
- [ ] 多配置场景：第一个失败自动尝试第二个
- [ ] 联网搜索：问"今天天气"时 used_search=true
- [ ] 会话管理：创建/切换/重命名/删除均正常
- [ ] 消息持久化：切换路由后回来消息不丢失
- [ ] 权限隔离：普通用户访问 /settings/ai 返回 403
- [ ] 授权管理：管理员可勾选/取消普通用户 AI 授权
- [ ] 被授权用户无自己配置时，可使用管理员配置
- [ ] 产品对比：至少2个产品，AI 生成对比报告或本地兜底
- [ ] error_hint 正确显示并引导用户配置

> AI生成