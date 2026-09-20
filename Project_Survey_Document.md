---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'b23828fc-f57a-40e5-8806-c1bea03b0133'
  PropagateID: 'b23828fc-f57a-40e5-8806-c1bea03b0133'
  ReservedCode1: '66d7d3e5-5a0f-4168-9d4e-59f435765bec'
  ReservedCode2: '66d7d3e5-5a0f-4168-9d4e-59f435765bec'
---

# 萌芽（mengya）母婴全周期平台 —— 项目深度调研与架构评估文档

> 文档版本：v1.12 (Docker Edition - 容器化编排部署架构版)
> 调研日期：2026-09-08（v1.1 更新：2026-09-10，补充全站优化与新增模块；v1.2 更新：2026-09-10，补充 run.sh 服务管理脚本与部署方式；v1.3 更新：2026-09-10，补充 run.sh 无参数执行与 sh 兼容性修复；v1.4 更新：2026-09-10，无参数行为改为仅提示并退出；v1.5 更新：2026-09-10，Docker 镜像复用策略与可选服务按需启停；v1.6 更新：2026-09-10，修复 PG18 数据卷挂载点并补充挂载约定；v1.7 更新：2026-09-10，修复 Docker 容器内 Vite 代理跨容器寻址与 Django ALLOWED_HOSTS 配置，解决登录 500 与获取注册模式失败；v1.8 更新：2026-09-11，修复传统与容器部署下数据库连接/初始化失败报 500/400、SQLite 智能安全回退、PyJWT 秘钥规范化、run.sh 停止服务时子进程残留与 PID 不匹配问题；v1.9 更新：2026-09-11，重构管理员账号管理逻辑为单一自定义管理员、启动时清理历史管理员账号并保护普通用户、完善 run.sh 进程三维度定位与端口彻底停止机制、增加后端登录接口异常容错防护；v1.10 更新：2026-09-11，修复 run.sh 中 Docker Compose 全局参数 --profile 放置位置引起的 unknown flag 语法错误、精简 status_docker 容器状态查询、增加 compose_supports_profiles 兼容性探测、修复 status 子命令优先响应 MODE 环境变量；v1.11 更新：2026-09-11，单端口安全暴露加固：Docker 移除 db(5433)/redis(6380)/backend(8000) 宿主机公网端口映射并转为内部 expose，传统模式 run.sh 后端绑定 127.0.0.1，对外仅保留 5173 访问入口）
> 调研对象：`C:\Users\cheng\.local\share\TeleAgent\TeleAgent的工作空间\mengya-docker`
> 文档性质：项目现状全面调研（Survey），非改造方案；为后续 PSD（产品/解决方案设计）阶段提供事实基础与决策输入
> 角色定位：企业级软件架构、信息安全与领域驱动设计视角

---

## 目录

1. [项目概览与定位](#1-项目概览与定位)
2. [架构现状分析](#2-架构现状分析)
3. [安全边界与风险现状评估](#3-安全边界与风险现状评估)
4. [业务逻辑深度梳理](#4-业务逻辑深度梳理)
5. [数据架构与存储现状](#5-数据架构与存储现状)
6. [API/接口契约现状](#6-api接口契约现状)
7. [可观测性现状](#7-可观测性现状)
8. [外部依赖与集成现状](#8-外部依赖与集成现状)
9. [前端/客户端现状](#9-前端客户端现状)
10. [部署与服务管理脚本（run.sh）](#10-部署与服务管理脚本runsh)
11. [现存问题与风险清单](#11-现存问题与风险清单)
12. [待明确的架构决策点](#12-待明确的架构决策点)

---

## 1. 项目概览与定位

### 1.1 一句话定位

**萌芽** 是一个面向「备孕 → 孕期 → 0-6 岁育儿」全周期的母婴家庭知识服务与工具平台，核心价值主张为「生命最初 3000 天陪伴」。

### 1.2 业务方向

| 维度 | 现状 |
|---|---|
| 业务赛道 | 母婴垂直领域（知识 + 工具 + 商品库，**非**电商交易闭环、**非** UGC 社区） |
| 服务对象 | 准妈妈 / 新手父母 / 0-6 岁育儿家庭 |
| 核心场景 | 全周期知识时间轴、孕期食谱、新生儿护理百科、14 大类母婴商品库、五维评分对比、智能待产包、健康记录 / 疫苗日历、AI 问答助手 |
| 变现设想（推断） | 商品库导购（比价/推荐，无交易）、AI 助手（增值授权）、未来可能的电商/付费内容 |

### 1.3 阶段判断

- **形态**：接近 **MVP → 演示生产（Demo-Production）** 阶段。
  - 已有 Docker Compose 一键部署、种子数据（init_data）、JWT 认证、管理员后台（4 个管理页）。
  - **缺失**：支付/订单/退款、商家入驻、社区内容（帖子/评论/私信）、服务预约、消息推送等商业闭环模块。
- **成熟度**：单仓库、单体应用、单开发者协作模式；无 CI/CD、无自动化测试、无监控告警、无灰度发布。

### 1.4 用户规模现状（数据实测）

- 当前 SQLite 数据库中 **业务表合计仅 1047 行**，其中：
  - 用户 5 人（含演示账号）、宝宝档案 2 条、健康记录 7 条、聊天会话 5 个、聊天消息 14 条。
- 属**种子/演示数据阶段**，尚无真实规模用户；架构决策窗口期充裕。

### 1.5 项目类型

- **Web 应用**（移动端优先响应式设计，非小程序 / 非原生 App）。
- 前后端分离：React 18 SPA + Django REST API。
- 部署形态：Docker Compose 本地/单机部署，nginx 反代。

---

## 2. 架构现状分析

### 2.1 顶层目录结构

```
mengya/
├── backend/                    # Django 后端
│   ├── config/                 # 项目配置（settings/urls/celery/asgi/wsgi）
│   ├── apps/core/              # 核心业务 app（唯一业务 app）
│   │   ├── models/             # 19 个模型文件（按域拆分，含新增 baby_shopping/favorite/notification/fetal_story）
│   │   ├── views.py            # 2300+ 行，全部视图与 API（含商品分页、通知/收藏、宝宝购物等）
│   │   ├── serializers/        # 序列化器
│   │   ├── services/           # 业务服务层（AI/商品对比/待产包/搜索）
│   │   ├── utils/              # 限流/阶段工具/审计/统一响应/异常
│   │   ├── management/commands/init_data.py  # 种子数据
│   │   └── migrations/         # 18 个迁移
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── api/                # axios 封装（client/auth/catalog/compare/services）
│   │   ├── store/              # Zustand 状态（authStore/chatStore）
│   │   ├── pages/              # 29 个页面
│   │   ├── components/         # 组件（雷达图/生长曲线/疫苗日历/健康日历/复制按钮）
│   │   ├── layouts/            # MainLayout（含移动端底部导航）
│   │   └── types/              # TS 类型定义
│   ├── Dockerfile
│   └── vite.config.ts
├── nginx/nginx.conf            # 反向代理
├── docker-compose.yml          # 5 服务编排
├── .env.example                # 环境变量样例
├── agent.md                    # AI 助手模块开发指南（847 行）
├── Project_Survey_Document.md  # 本文档（调研/设计基线）
└── README.md                   # 项目说明（437 行）
```

### 2.2 技术栈清单

| 层 | 技术 | 版本（按 requirements/package 推断） |
|---|---|---|
| 后端框架 | Django + DRF | Django 4.2.x / DRF 3.14+ |
| 认证 | SimpleJWT | djangorestframework-simplejwt |
| API 文档 | drf-spectacular | — |
| 数据库 | SQLite（开发）/ PostgreSQL 15（Docker） | psycopg2 |
| 缓存/队列 | Redis 7（Docker）/ Celery | redis-py + celery |
| AI | openai SDK + DuckDuckGo 搜索（ddgs） | 自定义多配置轮询 |
| 图片 | Pillow（验证码生成） | — |
| 前端 | React 18 + TypeScript + Vite | Tailwind CSS 3 + Zustand + ECharts + axios |
| 部署 | Docker Compose + nginx | python:3.11-slim / node:20-alpine |

### 2.3 架构模式评估

- **模块化单体（Modular Monolith）**：Django 单 app `apps.core`，模型按域拆分到 `models/` 子目录，但**无独立业务模块边界**（如 commerce / community / ai 各自独立 app 均未拆分）。
- **分层风格**：Controller-Service-DAO 轻量分层（views.py → serializers → services → models），**非严格 DDD**（无聚合根/领域事件/仓储模式）。
- **可扩展性评估**：当前单体适合 MVP；若未来上电商/社区/多端，需先拆分模块边界（可参考第 11 章决策点）。

### 2.4 模块依赖关系（后端）

```
config (settings/urls/celery)
  └── apps.core
        ├── models/            # 业务实体（17 个）
        ├── serializers/       # 序列化（319 行）
        ├── services/          # 业务服务
        │   ├── ai_service.py        # AI 多配置轮询 + 本地知识兜底
        │   ├── product_comparator.py# 五维评分对比 + 价格对比
        │   ├── shopping_list_generator.py # 待产包生成
        │   └── web_search.py        # DuckDuckGo 联网搜索
        └── utils/
            ├── rate_limit.py        # 内存线程安全限流
            ├── stage_utils.py       # 孕周/月龄计算
            ├── audit.py             # 审计日志
            ├── renderer.py          # 统一响应
            └── exceptions.py        # 统一异常
```

### 2.5 部署架构

```
用户浏览器
   │
   ▼
nginx (:80)
   ├── / → frontend（Vite dev :5173 / 生产构建静态）
   └── /api/、/admin/ → backend（Django :8000）
                           ├── PostgreSQL（pg18 默认，:5433 宿主机映射；旧方案可用 15-alpine）
                           ├── Redis 7（:6380）
                           └── Celery worker（任务队列，当前无实质任务）
```

> 注意：当前 Dockerfile 使用 `runserver`（开发服务器）与 `vite dev`（开发服务器）而非生产级 gunicorn/nginx 静态托管，**仅适合演示，不可直接上生产**。

---

## 3. 安全边界与风险现状评估

### 3.1 认证与授权

| 项 | 现状 | 风险评级 |
|---|---|---|
| 认证方式 | JWT（SimpleJWT），access 12h / refresh 14d；手机号+密码或用户名登录 | 中（refresh 长期有效，无吊销机制） |
| 注册模式 | 支持 open / invitation_only；邀请码（InviteLink） | 低 |
| 找回密码 | 密保问题 + 验证码三重流程 | 中（密保答案强度依赖用户设置） |
| 验证码 | PIL 生成 4 位数字，session 存答案；**接口返回 debug_code** 给前端展示 | **高**（验证码可被脚本直接读取绕过） |
| 限流/锁定 | 内存线程安全（threading+deque）实现；阈值/锁定时间可配 | 中（单进程有效；多 worker 失效） |
| 管理员权限 | is_staff 标记 + 自定义权限检查（多数用 `user.is_staff`） | 低（未用 Django permission，需确保所有接口覆盖） |

### 3.2 数据安全

| 项 | 现状 | 风险评级 |
|---|---|---|
| API Key 存储 | **明文存储在数据库**（用户 ai_configs JSON 字段、全局环境变量） | **高（严重）** |
| 密码存储 | Django 内置 PBKDF2 哈希 | 低 |
| 传输加密 | 无 HTTPS 证书配置（nginx 仅 80 端口） | 高（公网部署必配） |
| 数据备份 | 无自动备份机制 | 高 |
| 敏感信息日志 | 审计日志记录关键操作，未见密码/Token 泄漏到日志 | 低 |

### 3.3 业务安全

| 项 | 现状 | 风险评级 |
|---|---|---|
| 支付安全 | **无支付流程**（金额校验/回调验签/防重放均不存在） | —（未实现） |
| UGC 内容审核 | 无社区/UGC 模块 | —（未实现） |
| AI 内容安全 | 无输入输出内容审核（可被诱导输出不当内容） | 中 |
| 越权访问 | 需逐一检查（用户数据基本按 owner 过滤） | 待验证 |

### 3.4 输入校验

- 使用 DRF Serializer 校验（必填/类型/长度），但**未发现**对复杂输入（如 XSS、SQL 注入）的特殊处理；前端 React 天然规避大部分 XSS。
- 商品导入/时间轴导入 CSV 功能：需检查 CSV 解析是否有注入风险（低风险，但建议限制文件大小）。

### 3.5 第三方依赖 CVE

- 版本基于 requirements.txt 推断；**未做自动化漏洞扫描（无 dependabot / snyk）**。
- 建议：为 requirements.txt / package.json 增加依赖审计（pip-audit、npm audit）。

### 3.6 数据备份

- **无备份机制**。SQLite 单文件即数据库；Docker 卷无定时快照。
- 建议：生产上 PostgreSQL 后立即引入 pg_dump 定时备份 + 异地存储。

---

## 4. 业务逻辑深度梳理

### 4.1 母婴领域模型

| 域 | 实体 | 说明 |
|---|---|---|
| 用户 | User（扩展 AbstractUser，含 role/phone/due_date/is_pregnant）、BabyProfile（宝宝档案，支持多胎、primary 标记） | 家庭视角（妈妈+宝宝） |
| 知识 | TimelineEvent（时间轴）、Recipe（食谱）、KidsEncyclopedia（儿童百科） | 全周期知识库 |
| 商品 | Product（商品）、BrandProfile（品牌） | 14 大类知识型商品库（非交易） |
| 工具 | ShoppingList（待产包/购物清单）、HealthRecord（健康记录）、Vaccine（疫苗）、Notification（通知） | 个性化工具 |
| AI | ChatSession、ChatMessage、AIQueryLog、AIConfig（ai_configs JSON） | 智能助手 |
| 管理 | SystemSetting（系统配置单例）、InviteLink（邀请链接）、AuditLog（审计）、ProductComparison（对比记录） | 运维支持 |

### 4.2 核心业务流程（文字流程图）

**① 用户注册 / 登录流程**
```
注册页（手机号+密码+验证码）
  → [邀请模式] 需邀请链接/邀请码
  → POST /api/auth/register（校验手机号唯一、密码≥6位）
  → 自动登录返回 JWT → 存入 authStore → 首页
登录页（手机号/用户名+密码）
  → 失败次数 ≥ 阈值 → 需要图形验证码（debug_code 明文返回）
  → 失败次数 ≥ 锁定阈值 → 账号锁定 wait_seconds
  → 成功 → 发 JWT → 进入首页
忘记密码（3 步）：
  手机号 → 获取密保问题 → 回答+验证码 → 重置密码
```

**② 智能待产包生成（shopping_list_generator）**
```
用户选择孕周/预产期/宝宝情况
  → 基于阶段规则 + 商品库匹配
  → 生成 ShoppingList + ShoppingListItem（带数量/备注）
  → 用户在购物清单页可增删改 → 完成
```

**③ AI 问答（ai_service）**
```
用户提问（ChatSession/ChatMessage）
  → 会话级限流检查（内存）
  → 选择 AI 配置（用户配置 → 旧配置 → 全局 env → 管理员共享）
  → 构造 prompt（注入日期/阶段/孕周/知识库/搜索）
  → 若触发「联网搜索」关键词 → DuckDuckGo 搜索 → 摘要喂给模型
  → 模型回答 → 存 AIQueryLog / ChatMessage → 返回
  → 全部配置失败 → 本地知识引擎兜底（12 个意图）
```

**④ 商品对比（product_comparator）**
```
选择 2-4 款商品 → 调 compare API
  → 五维评分（安全/舒适/功能/易用/外观）聚合 → 雷达图
  → 价格对比（taobao/jd/pdd 价格字段 + 均价 + 区间）
  → 推荐标签（labels/alerts）
  → 可选 AI 对比建议（调 AI 服务）
```

**⑤ 时间轴知识库（Timeline）**
```
管理员可新增/编辑/删除（is_staff 校验）
  → 支持 CSV 导入/导出
  → 用户按 stage（孕周/宝宝月龄）筛选 → 展示卡片
  → 详情页展示内容+tips+关联商品（关联关系未填）
```

### 4.3 业务规则清单

| 规则编号 | 规则 | 位置 |
|---|---|---|
| BR-01 | 手机号唯一，注册需密码≥6位 | User model / serializer |
| BR-02 | 登录失败 3 次需验证码，失败 5 次锁定（可配） | login view + rate_limit |
| BR-03 | 注册模式（open/invitation_only）由 SystemSetting 控制 | register view |
| BR-04 | 找回密码必须答对密保问题 | forgot_password 流程 |
| BR-05 | AI 配置启用顺序：用户 ai_configs → 旧版单配置 → 全局环境变量 → 管理员共享 | ai_service |
| BR-06 | 商品对比最多 4 款（前端约束） | ComparePage |
| BR-07 | 待产包生成按孕周/预产期规则匹配 | shopping_list_generator |
| BR-08 | 健康记录分产检/生长/疫苗类型，AI 可解读 | HealthPage |
| BR-09 | 审计日志保留天数由 SystemSetting 配置（可清理） | audit.py |
| BR-10 | AI 授权：is_staff 默认可用，普通用户需 ai_authorized | ai_config API |

### 4.4 状态机

| 领域 | 状态机 |
|---|---|
| 用户注册模式 | `open ⇄ invitation_only`（SystemSetting 单例） |
| 商品 | `active（上架） ⇄ inactive（暂存）`（is_active 字段） |
| 登录风控 | `normal → need_captcha → locked → (等待) → normal` |
| 待产包/购物清单 | 无状态机（仅 item 列表） |
| 通知 | `unread（未读） → read（已读）`（Notification.is_read 字段，支持单条标记/全部已读，2026-09-10 已实现） |

### 4.5 逻辑缺陷 / 待改进点

| 缺陷 | 描述 | 影响 |
|---|---|---|
| LOGIC-01 | 图形验证码 debug_code 明文返回给前端 | 风控形同虚设（可被脚本绕过） |
| LOGIC-02 | 无交易闭环：商品库与支付/订单无衔接 | 无法变现 |
| LOGIC-03 | 时间轴事件「关联商品」关系为空（0 条） | 商品导购链路未打通 |
| LOGIC-04 | ~~通知模块表存在但无写入逻辑（0 条）~~ **已解决（2026-09-10）**：新增通知中心页面，支持全部/未读筛选、单条标记已读、全部已读；疫苗/产检提醒写入逻辑可基于现有 Notification 模型扩展 | 疫苗/产检提醒待接入 |
| LOGIC-07 | ~~商品列表无分页，数据量增长后前端渲染压力大~~ **已解决（2026-09-10）**：ProductViewSet 新增分页 list 方法（page/page_size/no_page），前端商品管理页 10 条/页 | 性能 |
| LOGIC-05 | AI 会话无会话级限流（仅登录限流） | 滥用风险 |
| LOGIC-06 | 商品价格字段为 JSON 快照（avg/taobao/jd/pdd），无实时同步 | 价格可能过期 |

---

## 5. 数据架构与存储现状

### 5.1 表结构与 ER 关系（核心）

```
User (id, username, phone, password_hash, nickname, role, due_date, is_pregnant, is_staff, ai_authorized, ai_configs JSON)
 ├── BabyProfile (user FK, name, gender, birthday, birth_weight, is_primary)
 │    └── HealthRecord (user FK + baby FK, record_type, record_date, gestational_week, height, weight, head_circumference, ai_analysis)
 ├── ShoppingList (user FK, baby FK, name, stage) → ShoppingListItem (product FK)
 ├── ChatSession (user FK) → ChatMessage (session FK)
 ├── InviteLink (created_by FK, code, is_active)
 └── AIQueryLog (user FK, query, response, model, latency, created_at)

Product (brand FK/brand_profile FK, first_category, second_category, price_info JSON, ratings JSON, overall_rating, is_active, is_essential)
 ├── ProductComparison (user FK) ⇄ M2M products
 └── ShoppingListItem

BrandProfile (name, logo_url, established, ...)
TimelineEvent (stage_type, stage_value, category, title, subtitle, content, tips, is_essential) ⇄ M2M products（空）
KidsEncyclopedia (chapter, question_number, question, answer)
Recipe (period, period_month, nutrient_tag, title, ingredients, steps)
SystemSetting (单行 id=1: register_mode / login_threshold / login_lock_threshold / login_lock_seconds / audit_retention_days)
```

### 5.2 数据量实测（SQLite 2026-09-08）

| 表 | 行数 | 表 | 行数 |
|---|---|---|---|
| core_recipe | 288 | core_aiquerylog | 31 |
| core_timelineevent | 204 | core_productcomparison | 24 |
| core_productcomparison_products | 65 | core_userfavorite | 0 |
| core_product | 62 | core_notification | 0 |
| core_kidsencyclopedia | 57 | core_chatmessage | 14 |
| core_auditlog | 45 | core_chatsession | 5 |
| core_brandprofile | 41 | core_invitelink | 5 |
| core_user | 5 | core_shoppinglist | 3 |
| core_shoppinglistitem | 92 | core_healthrecord | 7 |
| core_babyprofile | 2 | core_systemsetting | 1 |

- 总计：**1047 行**（业务表，不含 django 系统表）。
- 数据库文件：db.sqlite3 = 1.24 MB（含种子数据）。

### 5.3 索引分析（实测）

- 已建索引覆盖主要外键与常用筛选列（category/brand/overall_rating/is_essential/stage_type+stage_value+category/period/period_month/nutrient_tag 等）。
- **缺口**：
  - Product.price_info（JSONField）的 `avg` 排序查询（`price_info__avg`）无法走索引 —— 大数据量下价格排序性能差。
  - AI 相关（AIQueryLog/AI）查询未按时间排序索引。
  - 全文检索（q 参数模糊搜索商品）无 FTS（全文索引），数据量增大后需引入 PostgreSQL 的 pg_trgm 或 FTS。

### 5.4 一致性机制

- 数据库：外键约束由 Django ORM 维护（默认无物理外键为强约束，实际 MySQL/SQLite 可能软约束）。
- **无事务保证的显式说明**：Django 默认 `ATOMIC_REQUESTS` 未开启（建议生产开启）。
- 缓存一致性：Redis 未用于业务缓存（仅队列）。

### 5.5 生命周期管理

- 审计日志：有保留天数清理机制（可配）。
- **其他数据无生命周期策略**（通知/日志/AI 会话无限增长）。

---

## 6. API/接口契约现状

### 6.1 接口清单（按模块）

| 模块 | 接口（前缀 /api/） | 说明 |
|---|---|---|
| 认证 | POST /auth/register、POST /auth/login、POST /auth/refresh、GET /auth/captcha/new、POST /auth/forgot-password/… | 含验证码、忘记密码 |
| 用户 | GET /auth/me、GET /auth/babies、POST /auth/babies、PUT /auth/babies/{id}/primary、PUT /auth/password | 个人中心 |
| 知识 | GET/POST/PUT/DELETE /timeline/、/timeline/{id}/、/timeline/export/、/timeline/import/、/recipes/、/kids-encyclopedia/ | 时间轴/食谱/百科 |
| 商品 | GET/POST/PUT/DELETE /products/、/products/export/、/products/import/、/brands/ | 商品库/品牌 |
| 对比 | POST /compare/、POST /compare/ai/ | 商品对比 |
| 购物清单 | GET/POST /shopping-lists/、/shopping-lists/generate/、/shopping-lists/{id}/items/ | 待产包/清单 |
| 健康 | GET/POST/DELETE /health-records/、GET /vaccines/ | 产检/生长/疫苗 |
| AI | POST /ai/chat/、GET/POST /ai/sessions/、/ai/config/、/ai/auth/… | 助手/配置/授权 |
| 管理 | GET /admin/users/、GET /admin/audit-logs/、GET/POST /admin/system-settings/ | 后台管理 |

> 具体端点以 `core/urls.py` + `config/urls.py` 为准（未逐一展开）。

### 6.2 版本管理

- **无 API 版本化**（无 `/api/v1/` 前缀）。依赖路径 `/api/` + 命名空间（namespace 推测为 `core`）。
- 风险：后端数据结构演进时将破坏前端兼容，建议尽早引入版本化。

### 6.3 文档规范

- **drf-spectacular** 已集成（settings 中可生成 schema），但**未见 Swagger 页面可访问的明确路径**（需确认 `/api/schema/`、`/api/docs/` 是否开放）。

### 6.4 幂等性 / 限流 / 超时

| 项 | 现状 |
|---|---|
| 幂等性 | 无显式幂等设计（如创建商品重复点击会重复创建） |
| 限流 | 登录接口有内存限流；**业务接口（AI/对比/CSV 导入）无限流** |
| 超时 | 前端 axios timeout=30s；AI 请求无后端超时兜底 |

### 6.5 错误码体系

- 统一响应格式：`{code: 0, message: "success", data: ...}`。
- 自定义异常处理 `custom_exception_handler` 统一错误格式。
- **代码（部分已知）**：
  - 4000 限流（wait_seconds）
  - 1010/1011 需验证码
  - 1012 账号锁定
  - 其它 4xx 直接透传 HTTP 状态码 + message。
- **缺口**：无完整错误码文档，前端靠 code 特判，维护成本高。

---

## 7. 可观测性现状

| 维度 | 现状 | 评级 |
|---|---|---|
| 日志 | Django 默认 console/文件日志；无结构化日志、无日志级别集中管理 | 中 |
| 监控告警 | **无**（无 Prometheus/Grafana、无 Sentry、无告警） | 高（缺失） |
| 链路追踪 | **无**（无 OpenTelemetry / Jaeger） | 高（缺失） |
| 业务指标大盘 | **无**（无用户数/DAU/转化/商品对比次数等看板） | 中（缺失） |
| 审计日志 | 已实现（AuditLog 表，登录/注册/密码/管理操作） | 中（已有） |

---

## 8. 外部依赖与集成现状

| 依赖 | 用途 | 容错方案 | 密钥管理 |
|---|---|---|---|
| OpenAI 兼容 API | AI 对话/对比建议 | 多配置轮询 + 本地知识兜底 | API Key 明文存 DB/环境变量（**高危**） |
| DuckDuckGo | 联网搜索 | 失败静默降级 | 无密钥 |
| Redis | Celery 队列 | Docker 必配 | 本地无密码 |
| PostgreSQL | 生产数据库 | Docker 必配 | .env 配置 |
| 电商平台（淘宝/京东/拼多多） | 商品价格（JSON 快照） | 无（价格不会实时更新） | TAOBAO_APP_KEY 等 env（未使用） |
| picsum.photos / placehold.co | 占位图 | 离线时图片缺失 | 无 |

**容错方案**：AI 模块容错最完善（多配置轮询→本地兜底）；其余依赖基本无降级方案。

---

## 9. 前端/客户端现状

### 9.1 技术栈

React 18 + TypeScript + Vite + Tailwind CSS 3 + Zustand + ECharts（雷达图/生长曲线）+ axios + react-router-dom + lucide-react。

### 9.2 页面清单（29 页）

| 分类 | 页面 |
|---|---|
| 认证 | Login、Register |
| 首页 | Home |
| 知识 | Timeline、TimelineDetail、PregnancyWeekly、PregnancyRecipe、KidsEncyclopedia、FetalStory |
| 商品 | ProductList、ProductDetail、Compare、BrandList、BrandDetail |
| 购物 | ShoppingList、ShoppingListDetail、GenerateShoppingList、BabyShoppingDetail |
| 健康 | Health（含日历总览 Tab） |
| AI | AIAssistant、AIConfig |
| 个人 | Profile、Notification（通知中心）、Favorite（收藏夹）、NotFound |
| 管理 | ProductAdmin、UserManage、AuditLog、RegistrationManage |

### 9.3 状态管理

- `authStore`（Zustand）：token 持久化 + fetchMe + 自动刷新 access token + 登出。
- `chatStore`（Zustand + persist → localStorage `mengya-chat`）：聊天会话/消息持久化，**修复了切换页面后聊天记录丢失的问题**。
- 其余页面局部 useState。

### 9.4 通信封装

- `api/client.ts`：axios 实例，baseURL `/api`，timeout 30s，请求拦截附 JWT，响应拦截统一解包 `{code,message,data}`，401 跳登录。
- API 层按域拆分（auth/product/catalog/compare/services）。

### 9.5 离线能力 / 多端适配

- **无离线能力**（PWA/service worker 未实现）。
- **移动端优先**：底部导航 5 tab（首页/时间轴/商品库/AI助手/我的）；响应式 grid。

### 9.6 前端安全隐患

- 图片 URL 直接外链（picsum.photos 等第三方），存在隐私外泄与内容被替换风险。
- token 存 localStorage（XSS 风险需自行防护）。

---

## 10. 部署与服务管理脚本（run.sh）

> v1.2 新增章节。记录 2026-09-10 对 run.sh 的重构，作为部署基线增量。

### 10.1 背景与动机

- 原 run.sh 硬编码使用 `python` 命令创建虚拟环境，在**仅安装 `python3`** 的服务器（Ubuntu/Debian 默认无 `python` 别名）上会启动失败。
- 原脚本仅支持传统方式（本地 venv + vite），未覆盖服务器常见的 Docker Compose 部署场景。
- 用户明确要求：**不直接默认传统方式**，需要引入 Docker Compose 作为推荐启动方式，且 `start/restart` 时**交互式提示用户明确选择启动方式**。

### 10.2 功能总览

| 子命令 | 说明 |
|---|---|
| （无参数） | 仅显示脚本用法提示并退出（不启动任何服务） |
| `start` | 启动全部服务（交互式选择启动方式） |
| `stop` | 停止全部服务（按上次选择的模式） |
| `restart` | 重启全部服务 |
| `status` | 查看服务运行状态 |
| `add_nginx` | 生成 nginx SSL 配置（需在服务器上单独手动执行） |
| `help` | 显示帮助 |

### 10.2a 无参数执行与 sh 兼容性（v1.3/v1.4 修复）

> 2026-09-10 修复：用户直接输入 `sh run.sh` 或 `./run.sh` 回车时，应提示用法并退出，而不是报错或自动执行。

- **无参数行为（v1.4 修正）**：`CMD="${1:-}"`，无参数时匹配空分支，仅打印「可用子命令」引导信息后 `exit 0` 退出，**不启动任何服务**；只有显式执行 `./run.sh start` 才进入启动流程。
- **sh 兼容**：脚本顶部增加 bash 检测——当 `$BASH_VERSION` 为空（即被 `sh`/dash 解释执行）时，自动 `exec bash "$0" "$@"` 用 bash 重新运行，避免 `read -p`、`local` 等 bash 语法在 dash 下报错。
- **效果**：`sh run.sh`、`./run.sh`、`bash run.sh` 三种方式均可用；无参数仅显示提示并退出。

### 10.3 启动方式选择机制

```
MODE 环境变量已设置 → 直接使用（校验取值）
         ↓ 未设置
读取上次选择（.run_mode 文件） → 交互确认「是否继续使用上次方式？」
         ↓ 无记录或用户选择更换
交互式菜单选择：1) docker（推荐） 2) local（传统）
         ↓
保存选择到 .run_mode → 后续 stop/status 按该模式分发
```

- 优先级：`MODE 环境变量` → `.run_mode` 记忆文件 → 交互选择。
- `docker` 方式使用 `docker compose`（自动探测 `docker compose` / `docker-compose` 两种命令形态）。
- `local` 方式自动校验后端 Python 依赖与前端 node_modules，缺失自动安装。

### 10.4 可配置项（环境变量覆盖）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | 管理员账号（默认 admin，重启后仅保留配置的唯一管理员，旧管理员自动清理） |
| `ADMIN_PASSWORD` | `admin123` | 管理员密码 |
| `ADMIN_NICKNAME` | `管理员` | 管理员界面展示称谓（系统各页面右上角/首页问候等昵称） |
| `BACKEND_PORT` | `8000` | 后端服务端口 |
| `FRONTEND_PORT` | `5173` | 前端服务端口 |
| `EXTERNAL_PORT` | `443` | 外部访问端口（nginx SSL 反代，默认 443 HTTPS 单入口） |
| `MODE` | （空） | 启动方式 `docker` / `local` |
| `NGINX_CONF_DIR` | `/opt/service/nginx/conf.d` | nginx 配置目录 |
| `NGINX_CERT_DIR` | `/opt/service/nginx/ssl` | nginx 证书目录 |

### 10.5 依赖自动校验（传统方式）

- **后端**：`ensure_backend_deps()` 检查 `.venv` / `venv`，不存在则创建；`pip check` 未通过或关键模块（django / rest_framework / dotenv）缺失时自动 `pip install -r requirements.txt`。
- **前端**：`ensure_frontend_deps()` 检查 `node_modules`，不存在或 `npm ls --depth=0` 不完整时自动 `npm install`。
- 目的：避免启动后「模块不存在」类报错，保证传统方式开箱即用。

### 10.6 nginx 配置生成（add_nginx）

- 生成位置：`$NGINX_CONF_DIR/mengya_ssl.conf`（默认 `/opt/service/nginx/conf.d/mengya_ssl.conf`）。
- 证书目录：`$NGINX_CERT_DIR`（默认 `/opt/service/nginx/ssl`），缺失时自动用 openssl 生成自签名证书。
- 配置内容：`listen $EXTERNAL_PORT ssl`、反代前端 `127.0.0.1:$FRONTEND_PORT` 与后端 `127.0.0.1:$BACKEND_PORT`（/api/ 与 /admin/ 前缀）、安全头、20M 上传限制。
- 使用提示：确认 nginx 主配置已 `include $NGINX_CONF_DIR/*.conf;` 后执行 `nginx -t && nginx -s reload`。

### 10.7 与 docker-compose 的关系

- `docker-compose.yml` 中 nginx 服务挂载项目内置 `nginx/mengya_ssl.conf`（容器内 `/etc/nginx/conf.d/default.conf`），与 `run.sh add_nginx` 生成到 `/opt/service/nginx/conf.d/` 的配置是**两种独立用法**，互不影响：前者用于 Docker 编排内反代，后者用于服务器本机 nginx 反代。
- 传统模式下生成的 PID 文件位于 `.run/`，日志位于 `logs/`，均已加入 `.gitignore`。

### 10.7a Docker 镜像复用与可选服务控制（v1.5 新增）

> 2026-09-10 实现：服务器已有镜像时直接复用，不重复拉取；可选服务由 run.sh 启动前自动判断启停。

**① 镜像复用策略（通用）**

- `docker-compose.yml` 中所有镜像均支持环境变量覆盖（`${VAR:-默认值}` 语法），数据库默认 `pgvector/pgvector:pg18`。
- Docker 本身行为：**本地已有同名镜像会直接复用，不重复拉取**；`run.sh` 启动前通过 `docker image inspect` 探测并打印「已存在本地，直接复用」或「不存在，启动时拉取」。
- 数据库镜像选择优先级（`choose_db_image()`）：
  1. `DB_IMAGE` 环境变量强制指定
  2. 本地已存在 `pgvector/pgvector:pg18` → 复用
  3. 本地已存在 `postgres:15-alpine` → 复用（兼容旧数据卷）
  4. 均不存在 → 默认 `pgvector/pgvector:pg18`（启动时拉取）
- 注意：`pgvector/pgvector:pg18` 与 `postgres:15-alpine` **数据目录不兼容**，切换镜像后旧数据卷需重建/重新初始化。

#### ② 可选服务控制（compose profiles）

| 服务 | profile | 默认 | 控制方式 |
|---|---|---|---|
| redis / worker | `celery` | 不启动 | 自动检测后端是否存在 Celery 任务（`@shared_task`/`@app.task`/`.delay()`/`apply_async`），有则启用；`ENABLE_WORKER=1/0` 可强制覆盖 |
| nginx | `nginx` | 不启动 | `ENABLE_NGINX=1` 启用 |

- run.sh 的 `compose_extra_args()` 启动前组装 `--profile` 参数，`start/restart/stop/status` 均按相同规则执行。
- 手动控制示例：`ENABLE_WORKER=1 ./run.sh start`、`ENABLE_NGINX=1 ./run.sh start`、`docker compose --profile celery up -d`。
- 当前项目无 Celery 任务，默认启动 db + backend + frontend 三个服务，redis/worker/nginx 按需启用。

#### ③ PostgreSQL 18+ 数据卷挂载约定（v1.6 新增）

> 2026-09-10 修复：db 容器启动报错（exited 1）的根因与解决方案。

- **PG18+ 官方镜像要求**：数据卷必须挂载到**父目录** `/var/lib/postgresql`（而非旧版习惯的 `/var/lib/postgresql/data`）。数据会自动放入镜像内置的子目录（如 `18/docker`），以支持 `pg_upgrade --link` 平滑升级。
- 若仍挂载 `/var/lib/postgresql/data`，PG18 镜像会判定为「unused mount/volume」并**直接拒绝启动**（容器 exited 1）。错误信息原文：
  > in 18+, these Docker images are configured to store database data in a format which is compatible with 'pg_ctlcluster'... The suggested container configuration for 18+ is to place a single mount at /var/lib/postgresql
- **compose 修改**：`pgdata:/var/lib/postgresql/data` → `pgdata:/var/lib/postgresql`（第 34 行）。
- **旧数据卷注意**：若旧 `pgdata` 卷是 PG15 格式（此前用 `postgres:15-alpine` 跑过数据），即使改挂载点，PG18 也无法直接读取旧数据。需二选一：
  1. 清理旧卷重建（`docker compose down -v`，注意会删除全部数据）——适合无重要历史数据；
  2. 保留旧数据 → 换回 `DB_IMAGE=postgres:15-alpine ./run.sh start`，但挂载点需回退为 `/var/lib/postgresql/data`。
- **安全说明**：`docker compose down -v` 仅删除当前 compose 项目自己的 `pgdata` 卷（实际卷名 `mengya_pgdata`），**不会删除任何 docker 镜像**（`pgvector/pgvector:pg18` 等仍保留可复用），也不影响其他项目的容器/镜像/数据卷。
- 端口说明：compose 中 `5433:5432` 表示**宿主机 5433 → 容器 5432**，容器内部仍为 5432，backend 使用 `db:5432` 连接不受影响。

#### ④ Docker 容器内 Vite 代理跨容器寻址与 ALLOWED_HOSTS 修复（v1.7 新增）

> 2026-09-10 修复：解决本地部署正常、Docker 部署后登录报错 500 及立即注册报错「无法获取注册模式」的根因。

- **问题现象**：
  - 本地运行（`MODE=local`）一切正常。
  - Docker 部署启动后，访问注册页报错：`无法获取注册模式，请检查网络后刷新页面重试`；点击登录报错：`Request failed with status code 500`。
- **根本原因**：
  1. **Vite 代理硬编码 localhost**：`frontend/vite.config.ts` 中的代理目标硬编码为 `http://localhost:8000`。在 Docker 容器网络中，前端容器 `mengya_frontend` 内部的 `localhost` 仅指向前端容器自身，未监听 8000 端口（后端运行在独立的 `mengya_backend` 容器）。请求直接遭遇 `ECONNREFUSED 127.0.0.1:8000`，Vite 代理返回 HTTP 500。
  2. **Django ALLOWED_HOSTS 限制与服务器旧 .env 覆盖（导致 400 Bad Request）**：
     - Vite 代理成功连接后端后，发送请求头 `Host: backend:8000`。
     - Django 的 `CommonMiddleware` 在接收请求时调用 `request.get_host()` 强校验 Host。
     - 若服务器上已存在旧 `.env` 文件（内含 `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0`），由于 `.env` 被 `.gitignore` 忽略，`git pull` 不会更新它。
     - Docker Compose 与 Django 读取到旧环境变量后，`ALLOWED_HOSTS` 未包含 `backend` 或 `*`，Django 触发 `DisallowedHost` 异常并直接返回 **HTTP 400 Bad Request**（HTML 页面，Axios 报错 `Request failed with status code 400`）。
  3. **Docker 编排缺少环境变量**：`docker-compose.yml` 原未给 `frontend` 注入 `BACKEND_URL`，且 `backend` 的环境变量中账号字段命名未完全对齐。
- **整改措施**：
  1. `frontend/vite.config.ts`：通过 `loadEnv` 与 `process.env.BACKEND_URL` 动态读取后端地址，未配置时回退为 `http://localhost:8000`（确保 local 开发模式无缝运行）。
  2. `backend/config/settings.py`：
     - 增加兜底逻辑：在 `DEBUG=True`（开发/演示默认）或包含 `*` 时，强制 `ALLOWED_HOSTS = ["*"]`。
     - 即使 `DEBUG=False`，也强制追加 `backend`、`localhost`、`127.0.0.1`、`0.0.0.0` 到白名单，彻底免疫服务器旧 `.env` 覆盖导致的 400 拦截。
  3. `docker-compose.yml`：
     - `frontend` 服务添加环境变量 `BACKEND_URL=http://backend:8000`。
     - `backend` 服务强制注入 `DJANGO_ALLOWED_HOSTS: "*"`（非插值默认值，防止被旧 .env 覆盖），并兼容 `ADMIN_USERNAME` / `ADMIN_PHONE`。
     - `backend` 启动命令补充 `init_fetal_stories` 种子数据初始化。
  4. `ensure_admin.py`：兼容读取 `ADMIN_USERNAME` 与 `ADMIN_PHONE`。

#### ⑤ 传统部署与 Docker 部署下数据库未初始化/无法连接与进程停止残留修复（v1.8 新增）

> 2026-09-11 修复传统部署与容器部署下数据库初始化、跨环境数据库连接与进程停止残留问题。

- **问题现象**：
  - 服务器及本地在传统方式（`MODE=local`）启动后，登录报错 `Request failed with status code 500`，点击立即注册报错 `无法获取注册模式，请检查网络后刷新页面重试`。
  - Docker 容器部署在部分环境下登录报 500 或 400 Bad Request。
  - 执行 `sh run.sh stop` 停止传统服务时，终端提示 `前端 Vite 未在运行（无有效 PID）`，但 5173 与 8000 端口仍被占用，子进程未停止成功。
- **根本原因**：
  1. **传统部署数据库迁移失败导致无表结构（500 根因）**：
     - `run.sh` 中 `ensure_backend_deps` 将提示日志打印至 `stdout`，导致 `PYTHON=$(ensure_backend_deps "$PY_CMD")` 变量被多行日志文本污染，后续 Python 命令全部失效。
     - `start_backend()` 未进入 `backend/` 目录直接执行 `manage.py`，且原使用 `2>/dev/null || true` 屏蔽了报错信息。导致 `migrate` 与 `init_data` 从未真正执行，数据库没有任何数据表。
     - 前端访问注册页 `/api/auth/registration-mode/` 和登录页 `/api/auth/login/` 时，后端调用 `SystemSetting.get_settings()` 查询数据库，抛出 `OperationalError: no such table: core_systemsetting`，Django 触发 500 内部服务错误。
  2. **跨环境 DATABASE_URL 配置冲突与无法连接（500 根因）**：
     - 若宿主机或本地环境存在 `.env` 文件且配置了容器数据库地址 `DATABASE_URL=postgresql://...`，在宿主机非容器环境下无法解析 `db` 或本地未运行 PostgreSQL 服务。Django 尝试连接数据库超时/拒绝连接抛出异常，引发 500。
  3. **进程终止逻辑缺陷与孤儿进程残留（stop 失败根因）**：
     - `start_frontend` 写入 PID 文件的是 `npm` 命令的 PID，其 `/proc/$pid/cmdline` 匹配不到 `vite` 关键字，`pid_alive` 误判为不存活，导致 `stop_service` 找不到 PID 而直接跳过 kill。
     - 原脚本仅对父进程发出 kill 信号，未自底向上遍历并终止子进程树，导致 Vite 开发服务器及 Django runserver 自动重载工作进程脱离父进程沦为孤儿进程，持续监听 5173 与 8000 端口。
     - `stop_service` 缺少端口层面的兜底校验与强制清理。
  4. **PyJWT 密钥长度警告与规范**：开发环境下默认密钥低于 32 字节引发 `InsecureKeyLengthWarning`。
- **整改措施**：
  1. `backend/config/settings.py`：
     - **数据库智能安全回退**：对配置的 `DATABASE_URL` 进行域名解析与端口连通性双重探测（超时 1.5 秒）。若目标 PostgreSQL 无法解析或未连通（如宿主机传统模式、容器未启动），系统自动平滑回退至本地 SQLite (`BASE_DIR / "db.sqlite3"`)，彻底杜绝数据库连接异常引发的 500 崩溃。
     - **JWT 密钥安全规范**：自动补齐密钥长度至 >= 32 字节，消除 PyJWT 安全警告。
  2. `run.sh` 脚本核心重构：
     - **日志流严格隔离**：`ensure_backend_deps` 内所有提示信息及 `pip install` 输出全部重定向至 `>&2`，保证 stdout 输出且仅输出唯一的 Python 可执行文件绝对路径；增加 Windows/Git Bash 虚拟环境路径兼容。
     - **后端启动与数据初始化保障**：`start_backend()` 进入 `backend/` 目录执行，移除静默错误屏蔽，确保 `migrate`、`init_data`、`init_fetal_stories`、`ensure_admin` 依次完整执行，种子数据和管理员账号无缝就绪。
     - **全进程树终止（`kill_pid_tree`）**：实现 `get_descendant_pids`，自底向上递归收集父子进程完整 PID 列表，统一终止并经多次探活兜底 `kill -9`，杜绝孤儿进程。
     - **端口监听兜底清理**：`stop_service` 增加端口层面的占用检测，支持 `lsof`、`fuser`、`ss`、`netstat` 多种探测工具，发现端口残留时自动强杀占用进程。
     - **直接启动 Vite 记录真实 PID**：优先调用 `node_modules/.bin/vite` 启动并记录真实 Vite PID，同时绑定 `0.0.0.0`。
     - **智能停止与状态报告**：`stop` 命令智能适配 Docker 与 local 模式（或全量双清），`status` 准确标明端口外部占用状态并提示使用 `stop` 一键清理。

#### ⑥ 单一管理员保障、历史管理员清理与本地服务停止彻底性优化（v1.9 新增）

> 2026-09-11 优化管理员账号生命周期管理，支持仅保留唯一管理员并安全清理旧管理员；强化本地服务停止的进程树与端口探测清理。

- **问题现象与需求背景**：
  - 管理员账号原本默认创建为 `13800000001`，修改 `ADMIN_USERNAME` 自定义管理员（如 `admin_yy`）后，系统会新建该管理员，但原有的旧管理员未被删除，导致数据库残留多个管理员账号。
  - 用户要求管理员账号严格以自定义的 `ADMIN_USERNAME` 为准，不再保留或共存 `13800000001` 历史账号；重启后系统仅保留当前唯一管理员，历史管理员彻底清理，且严禁误删任何普通用户账号。
  - 用户关注 `run.sh` 中 `ADMIN_NICKNAME` 的作用，需明确其与 `ADMIN_USERNAME` 的职责分工。
  - 执行 `sh run.sh stop` 停止传统模式服务时，因父子进程脱离导致 PID 文件失效，或端口工具格式不匹配，终端提示进程未运行，但 8000 与 5173 端口仍被残留进程占用。
- **变量分工与业务说明**：
  - **`ADMIN_USERNAME`（登录身份标识）**：管理员登录系统所使用的唯一账号（默认值已优化为 `admin`，支持自定义如 `admin_yy`）。
  - **`ADMIN_NICKNAME`（UI展示昵称）**：管理员登录成功后，在前端顶部导航栏右上角（`user.nickname`）、首页欢迎语（`{user.nickname}，你好呀`）、个人中心、AI 授权列表及操作审计日志（`AuditLog`）中展示的称谓（默认值为 `管理员`）。
- **整改措施**：
  1. `backend/apps/core/management/commands/ensure_admin.py`：
     - **严格以 `ADMIN_USERNAME` 为准**：默认值由 `13800000001` 变更为 `admin`；完全根据当前配置的 `ADMIN_USERNAME` 创建或更新超级管理员（`is_staff=True, is_superuser=True`），不再创建或保留其他管理员。
     - **历史管理员自动安全清理**：自动查询排除当前唯一管理员外的所有历史管理员（`is_staff=True | is_superuser=True`）；安全转移其名下的有效邀请链接（`InviteLink`）给当前唯一管理员，避免级联删除；彻底删除历史管理员记录。
     - **普通用户严格安全保护**：普通用户判断条件为 `is_staff=False 且 is_superuser=False`，在任何清理逻辑中**绝对不查询、不修改、不删除普通用户**，保障用户数据 100% 安全。
  2. `backend/apps/core/views.py` 与 `utils/audit.py`：
     - `_find_user_by_account` 增加大小写不敏感匹配；
     - `_security_setting()` 增加异常捕获与安全默认值兜底，避免数据库未初始化时抛出 500；
     - `audit(...)` 辅助函数增加 `try-except` 防护，防止审计写入偶发异常阻断主流程登录。
  3. `frontend/src/pages/LoginPage.tsx`：
     - 账号输入框 `maxLength` 放宽至 50（与数据库模型一致），placeholder 调整为 `请输入手机号或管理员账号`。
  4. `run.sh` 本地进程启停彻底性强化：
     - `stop_service` 采用三维度联合定位目标 PID：① PID 文件中的 PID；② 端口监听 PID（`lsof` -> `fuser` -> `ss` -> `netstat`）；③ `pgrep` 命令行正则匹配（Django: `manage.py runserver`，前端: `vite`）。
     - 聚合全部相关 PID 及其完整子孙进程树（`get_descendant_pids`），先发 `SIGTERM`，超时强制 `kill -9`，并循环校验等待端口彻底释放。
     - `stop` 子命令增加本地残留检查：无论何种模式下执行，只要本地 PID 文件存在或 8000/5173 端口被占用，均自动触发彻底清理。

#### ⑦ Docker Compose 全局参数语法规范与 status 子命令模式分发修复（v1.10 新增）

> 2026-09-11 修复在 Linux 服务器上执行 `MODE=docker sh run.sh status` 或 `MODE=local sh run.sh status` 时报错 `unknown flag: --profile` 的问题。

- **问题现象与原因分析**：
  - **Docker Compose CLI 语法位置错误**：在 Docker Compose 规范中，`--profile` 属于全局主命令参数（格式：`docker compose [GLOBAL_OPTIONS] COMMAND [ARGS]`），绝非 `ps`、`down` 等子命令的私有选项。原 `run.sh` 脚本将 `$args` 拼装在子命令之后（如 `$compose ps $args`），导致 Docker CLI 解析 `ps` 参数时遇到不认识的 `--profile` 抛出 `unknown flag: --profile`。
  - **status 阶段冗余逻辑**：原 `status_docker` 会重新执行 `compose_extra_args` 检测 Celery/Nginx，向终端输出与状态查看无关的提示，并将 `--profile` 传给 `ps`。实际上 `docker compose ps` 专用于罗列项目容器，无需也不应附加 profile 过滤参数。
  - **status 子命令忽略 `MODE` 环境变量**：原 `run.sh` 的 `status` 分支仅通过 `last=$(get_last_mode)` 读取 `.run_mode` 文件，未优先判定用户命令行指定的 `MODE`。若之前曾以 docker 启动过，即使执行 `MODE=local sh run.sh status`，也会被强制路由到 `status_docker` 并触发相同报错。
- **整改措施**：
  1. **全局参数位置纠正**：
     - `start_docker`：调整为 `DB_IMAGE="$(choose_db_image)" $compose $args up -d --build`，确保 `$args` 位于 `up` 之前；
     - `restart_docker`：调整为 `DB_IMAGE="$(choose_db_image)" $compose $args up -d --build --force-recreate`；
     - `stop_docker`：调整为 `$compose $args down --remove-orphans`，全局参数前置，并抑制停止时的 profile 探测冗余信息。
  2. **精简 `status_docker`**：
     - 去除 `compose_extra_args` 调用，直接执行 `$compose ps`，干净、稳定地输出所有属于该项目的容器及其运行状态。
  3. **增加 profiles 语法兼容性探测**：
     - 新增 `compose_supports_profiles()` 函数，执行 `$compose --help` 探测当前 Docker Compose 版本是否原生支持 `--profile` 参数；若遇到老旧版本则平滑跳过 profile 附加，避免命令报错。
  4. **`status` 子命令模式优先级重构**：
     - 改为 `target_mode="${MODE:-$(get_last_mode)}"`，优先响应显式传递的 `MODE=local` 或 `MODE=docker`；
     - 当两者均未指定时，通过本地 PID 文件、端口监听以及容器运行状态进行智能嗅探与展示。

#### ⑧ 单端口安全暴露加固：屏蔽后端与数据库宿主机端口，对外仅保留 5173 访问（v1.11 新增）

> 2026-09-11 优化服务网络边界与端口暴露策略，关闭非必要的外部端口暴露，实现对外仅保留前端 5173 访问入口。

- **需求背景与安全设计原则**：
  - 用户希望在平台正常运行的前提下，仅保留 5173 端口对外开放，关闭其他所有冗余端口，降低系统受攻击面。
  - **服务依赖关系**：前端为 React SPA，所有数据交互、用户登录鉴权均强依赖后端 Django API。因此后端进程/容器必须常驻运行，但**后端的网络监听端口完全不需要对宿主机公网暴露**。
  - **前端内置反向代理机制**：前端 Vite 服务器（5173 端口）内置了 `/api` 反向代理规则。用户在浏览器中打开页面（`http://<IP>:5173`）并发起登录或业务请求时，请求目标地址均为 `http://<IP>:5173/api/...`，前端服务端接收后在内部直接中继转发给后端。
- **整改措施**：
  1. **Docker Compose 容器编排安全加固（`docker-compose.yml`）**：
     - **数据库 `db`**：移除宿主机端口映射 `5433:5432`，改为 `expose: ["5432"]`。数据库仅在 Docker 内部桥接网络中对 `backend` 和 `worker` 可见，彻底屏蔽公网对 PostgreSQL 的暴力破解风险。
     - **缓存/消息队列 `redis`**：移除宿主机端口映射 `6380:6379`，改为 `expose: ["6379"]`，仅供内部容器网络通信。
     - **后端 `backend`**：移除宿主机端口映射 `${BACKEND_PORT:-8000}:8000`，改为 `expose: ["8000"]`。前端容器通过内部容器服务名 `http://backend:8000` 转发 API 请求，宿主机不再开放 8000 端口。
     - **前端 `frontend`**：作为对外唯一门户保留端口映射 `${FRONTEND_PORT:-5173}:5173`。
  2. **传统本地模式安全加固（`run.sh`）**：
     - 将 `start_backend` 中的 Django 监听地址由 `0.0.0.0:$BACKEND_PORT` 调整为 `127.0.0.1:$BACKEND_PORT`。
     - 后端仅在本地回环地址（Loopback）监听，外部局域网和公网无法直连 8000 端口，全站流量统一经由前端 5173 端口代理接入。

### 10.8 已知限制

- 脚本为 bash 实现，依赖 Linux 环境（`/proc`、`ss`/`lsof`、`nohup`）；Windows 本地（无 WSL）无法直接执行，需在服务器或 WSL 环境使用。
- 脚本依赖 bash 语法（`read -p`、`local` 等）；已做 sh→bash 自动重执行兼容，但系统必须已安装 bash。
- `stop` / `status` 优先响应显式环境变量 `MODE`（如 `MODE=docker` 或 `MODE=local`），未指定时回退至 `.run_mode` 记忆文件；若两者均无则自动探测本地进程与容器状态。
- `docker compose` 方式未做版本号强校验，依赖本机已安装 docker compose v2 或 v1 的 `docker-compose`。
- Celery 任务检测基于源码 grep（`@shared_task`/`@app.task`/`.delay()`/`apply_async`），若任务写在非标准位置可能漏检；此时可用 `ENABLE_WORKER=1` 强制启用。
- `pgvector/pgvector:pg18` 与 `postgres:15-alpine` 数据卷不兼容，切换数据库镜像需重建 `pgdata` 卷。

---

## 11. 现存问题与风险清单

> 分级：P0（立即处理）/ P1（尽快处理）/ P2（规划处理）。风险等级：严重 / 高 / 中 / 低。

| 编号 | 级别 | 问题 | 影响范围 | 风险等级 | 建议 |
|---|---|---|---|---|---|
| R-01 | P0 | API Key 明文存储（DB ai_configs + env） | AI 模块 / 全平台 | **严重** | 生产用密钥托管（如 Vault/Secret Manager），DB 中仅存脱敏引用或加密 |
| R-02 | P0 | 无 TLS/HTTPS，明文传输密码与 JWT | 全站 | 高 | 立即配置证书（Let's Encrypt）+ nginx 443 + HSTS |
| R-03 | P0 | 图形验证码 debug_code 明文接口 | 认证风控 | 高 | 删除明文返回；改为前端无法直读的挑战方式 |
| R-04 | P1 | 无监控告警/链路追踪 | 运维 | 高 | 引入 Sentry（错误） + Prometheus+Grafana（指标） |
| R-05 | P1 | 无数据备份 | 数据安全 | 高 | 生产库启用 pg_dump 定时备份 + 异地存储 |
| R-06 | P1 | 无 CI/CD 与依赖审计 | 交付/供应链 | 中 | GitHub Actions + pip-audit + npm audit + Docker 镜像扫描 |
| R-07 | P1 | 生产用 runserver/vite dev | 性能/稳定性 | 高 | 换 gunicorn/uvicorn + 静态资源 CDN/nginx |
| R-08 | P1 | AI 无内容审核与滥用限制 | 合规 | 中高 | 引入内容安全 API + 会话/Token 级限流 |
| R-09 | P1 | 商品价格 JSON 无更新机制 | 业务准确 | 中 | 引入定时同步任务（Celery beat）或对接电商 API |
| R-10 | P1 | 接口无版本化 | 演进 | 中 | API 前缀加版本 v1；契约文档完善 |
| R-11 | P2 | 通知模块空实现 | 产品 | 中 | 疫苗提醒/产检提醒等消息触达（短信/推送） |
| R-12 | P2 | 待办清单无状态机/生命周期 | 数据增长 | 中 | 明确状态与清理策略 |
| R-13 | P2 | JSON 字段（price_info）性能隐患 | 数据量增长 | 中 | 迁移到 PostgreSQL 专用类型或拆分表 |
| R-14 | P2 | 本地 SQLite 无并发保障 | 生产规模 | 中 | 生产强制 PostgreSQL |
| R-15 | P2 | 无系统错误码表/文档 | 协作 | 低 | 建立统一错误码字典 |

---

## 12. 待明确的架构决策点

> 共 18 个决策点，覆盖用户体系/商品/库存/支付/营销/配送/售后/内容审核/消息通知/数据权限/多语言/高并发/埋点/合规等。每个决策点含背景、可选答案、推荐。

### D-01 用户体系扩展方向
- 背景：当前仅手机号+密码；未来可能有微信登录、小程序。
- 可选：A. 维持手机号+密码 + 可扩展 OAuth；B. 引入三方 OAuth（微信等）；C. 抽象 UserProvider 模型。
- **推荐**：A（MVP 阶段维持，预留字段）。

### D-02 多孩/多角色（父亲/老人）模型
- 背景：当前 User+BabyProfile 已支持多宝宝。
- 可选：A. 每个用户可维护多个宝宝档案（当前实现）。B. 增加家庭组（FamilyGroup）模型。
- **推荐**：A（一期够用），二期评估 B。

### D-03 商品模型（SKU/规格）
- 背景：当前 Product 为单层（无 SKU、无规格库存）。
- 可选：A. 保持单层（知识型导购）。B. 引入 SKU + 规格属性模型。C. 引入商品 SPU→SKU 两级。
- **推荐**：A（非交易平台），若未来电商再升级 C。

### D-04 库存体系
- 背景：无库存概念。
- 可选：A. 不引入（纯导购）。B. 引入库存字段。C. 引入独立库存服务。
- **推荐**：A（当前业务无交易需求）。

### D-05 价格体系
- 背景：price_info JSON 快照。
- 可选：A. 维持快照（定时更新）。B. 对接电商开放 API。C. 用户上报 + 爬虫。
- **推荐**：A（低成本），配合定时任务定期刷新。

### D-06 支付集成
- 背景：无支付。
- 可选：A. 一期不接入。B. 接入微信支付/支付宝（交易闭环）。
- **推荐**：A（先跑通知识+工具），若电商再走 B，需引入金额校验/回调验签/防重放。

### D-07 营销体系
- 背景：无营销活动。
- 可选：A. 不引入。B. 引入优惠券/限时折扣（简单）。C. 引入完整营销引擎。
- **推荐**：B（若有变现需求，先简单券类）。

### D-08 配送/履约
- 背景：无配送。
- 可选：A. 不引入（导购跳转）。B. 引入自营配送单。
- **推荐**：A。

### D-09 售后/客服
- 背景：无售后。
- 可选：A. 客服表单（邮箱/微信）。B. 工单系统。
- **推荐**：A（一期）。

### D-10 内容审核与 AI 安全
- 背景：AI 无审核。
- 可选：A. 引入内容安全 API（如蓝燕/阿里云盾）。B. 关键词过滤 + 人工审核。C. 自研审核模型。
- **推荐**：A（合规优先），输出侧同样审核。

### D-11 消息通知体系
- 背景：Notification 表空。
- 可选：A. 站内信（Notification）。B. 短信（阿里云/腾讯云）。C. 微信模板消息/推送。
- **推荐**：B（提醒类）+ A（站内）。

### D-12 数据权限与多租户
- 背景：单租户。
- 可选：A. 单租户（每用户隔离）。B. 多租户（机构版）。
- **推荐**：A（个人工具平台），若做园所/机构版再评估。

### D-13 多语言/i18n
- 背景：纯中文。
- 可选：A. 保持中文。B. 引入 i18n 框架。
- **推荐**：B（低成本预留，代码层面避免硬编码文案）。

### D-14 高并发/性能目标
- 背景：MVP 无指标。
- 可选：A. 目标 100 QPS（单机）。B. 1000 QPS（引入缓存+CDN）。
- **推荐**：A（先保证功能与正确性），随用户量增加再扩容。

### D-15 埋点与数据分析
- 背景：无埋点。
- 可选：A. 自建简单埋点。B. 接入第三方（如神策/GA）。
- **推荐**：B（免费版起步），关键转化事件埋点。

### D-16 合规（GDPR / 个人信息保护）
- 背景：涉及孕妇与儿童敏感数据（医疗/健康记录）。
- 可选：A. 隐私政策 + 用户授权（必须）。B. 数据加密 + 权限最小化。
- **推荐**：A+B 同步（健康数据为敏感数据，必须合规）。

### D-17 后台管理/运营端
- 背景：现有 4 个管理页（商品/用户/审计/注册）。
- 可选：A. 扩充现有前端管理页。B. 使用 Django Admin 后台（现有）。
- **推荐**：B（快速） + A（关键业务自建）。

### D-18 服务端渲染 vs 客户端渲染
- 背景：当前 CSR。
- 可选：A. 保持 CSR。B. 引入 SSR（Next.js）。
- **推荐**：A（MVP 优先），SEO 需求出现再评估。

---

## 附录 A：关键文件索引

| 文件 | 说明 |
|---|---|
| `backend/config/settings.py` | 项目配置（JWT/DB/Redis/AI） |
| `backend/apps/core/models/` | 19 个模型定义（含 baby_shopping/favorite/notification/fetal_story） |
| `backend/apps/core/views.py` | 全部 API 视图（2300+ 行，含商品分页/通知/收藏） |
| `backend/apps/core/services/ai_service.py` | AI 多配置轮询与本地兜底 |
| `backend/apps/core/utils/rate_limit.py` | 内存限流实现 |
| `backend/apps/core/management/commands/init_data.py` | 种子数据（品牌/商品/时间轴/演示用户） |
| `backend/apps/core/management/commands/import_baby_shopping.py` | 宝宝购物清单导入命令（新增） |
| `frontend/src/api/client.ts` | axios 封装（JWT/超时/解包） |
| `frontend/src/store/authStore.ts` | 登录态持久化 |
| `frontend/src/store/chatStore.ts` | 聊天持久化 |
| `frontend/src/pages/NotificationPage.tsx` | 通知中心页面（新增） |
| `frontend/src/pages/FavoritePage.tsx` | 收藏夹页面（新增） |
| `frontend/src/components/HealthCalendar.tsx` | 健康记录日历组件（新增） |
| `frontend/src/components/CopyButton.tsx` | 复制按钮组件（新增） |
| `frontend/src/pages/BabyShoppingDetailPage.tsx` | 宝宝购物清单详情页（新增） |
| `docker-compose.yml` | 6 服务编排（db/backend/frontend 必选 + redis/worker/nginx 可选 profiles） |
| `nginx/nginx.conf` | 反向代理（HTTP 80） |
| `nginx/mengya_ssl.conf` | 反向代理（HTTPS，Docker 编排内使用） |
| `run.sh` | 服务管理脚本（start/stop/restart/status/add_nginx，支持 docker/local 双模式；无参数仅提示用法并退出，兼容 sh 执行；2026-09-10 重构） |
| `.run_mode` / `.run/` / `logs/` | run.sh 运行时产物（已加入 .gitignore） |

## 附 B：已知验证结论

- 数据库实测：业务表 1047 行（种子数据规模）。
- 索引：覆盖常用查询，但 JSON price_info 排序无索引支持。
- 认证风控：验证码明文返回（R-03）；登录限流为内存实现（单进程）。
- AI：多配置轮询与本地兜底完善（容错强）；但 Key 明文存储（R-01）。

---

## 附 C：2026-09-10 全站优化与新增模块（v1.1 增量记录）

> 本节记录自 v1.0 调研以来完成的全站优化与新增功能，作为架构基线增量。

### C.1 商品管理分页与交互优化

- **后端**：`ProductViewSet` 新增自定义 `list` 方法，支持 `page` / `page_size` / `no_page` 参数。
  - 传 `no_page=1` 返回全量（兼容品牌详情/对比/首页等场景）；
  - 分页响应格式：`{ items: [], total, page, page_size, total_pages }`。
- **前端**：`catalog.ts` 中 `productApi.list` 适配分页响应，新增 `listAll` 获取全量；BrandDetailPage / ComparePage / HomePage 改用 `listAll`。
- **商品管理页**：分页控件（10 条/页）、页码按钮、点击编辑自动滚动到表单（`scrollIntoView`）。
- **商品列表页**：适配分页格式 + 搜索防抖 + 错误状态。

### C.2 全站体验优化（P0 / P1 / P2）

| 级别 | 优化项 | 涉及页面 |
|---|---|---|
| P0 | 商品详情页增加加载中/错误/未找到三态，API 失败不再永久卡「加载中」 | ProductDetailPage |
| P0 | 购物清单翻页自动滚动到顶部 | ShoppingListPage |
| P0 | 健康记录提交/删除失败 toast 提示 | HealthPage |
| P1 | 孕期食谱/幼儿百科/待产包清单搜索防抖 300ms | PregnancyRecipePage、KidsEncyclopediaPage、ShoppingListPage |
| P1 | AI 助手会话删除/重命名失败 toast 反馈 | AIAssistantPage |
| P1 | 展开态跨 tab/筛选切换时重置 | PregnancyRecipePage、KidsEncyclopediaPage |
| P2 | 个人中心操作（添加宝宝/设主宝宝）toast 反馈 | ProfilePage |
| P2 | 弹窗支持 Esc 关闭 + 遮罩点击关闭 | TimelinePage、FetalStoryPage |
| P2 | 用户管理新增按昵称/手机号搜索 | UserManagePage |

### C.3 新增功能模块

| 模块 | 文件 | 说明 |
|---|---|---|
| 通知中心 | `frontend/src/pages/NotificationPage.tsx` | 全部/未读筛选、单条标记已读、全部已读 |
| 收藏夹 | `frontend/src/pages/FavoritePage.tsx` | 类型筛选、取消收藏、跳转详情 |
| 健康日历 | `frontend/src/components/HealthCalendar.tsx` | 月历展示产检/生长/疫苗记录，颜色标签区分 |
| 宝宝购物清单 | `frontend/src/pages/BabyShoppingDetailPage.tsx` + `models/baby_shopping.py` + `import_baby_shopping.py` | 宝宝购物清单详情与数据导入 |
| 复制按钮 | `frontend/src/components/CopyButton.tsx` | 通用复制交互组件 |

### C.4 路由与入口

- `App.tsx` 注册 `/notifications`（通知中心）与 `/favorites`（收藏夹）路由。
- `ProfilePage` 常用入口区新增「通知中心」「我的收藏」按钮。
- `HealthPage` 新增「日历总览」Tab，集成 HealthCalendar。

### C.5 数据模型变更

| 变更 | 说明 |
|---|---|
| 新增 `BabyShoppingItem` | 宝宝购物清单项（migration 0016） |
| `ShoppingItem` 扩展字段 | migration 0017 |
| `User.phone` 最大长度调整 | migration 0018 |
| `Notification` / `UserFavorite` | 已有模型，前端页面已接入（通知已读/收藏管理） |

---

*文档结束。本调研基于代码静态审阅与数据库实测，未做运行期压测与安全扫描；涉及具体行数/版本请以仓库实际为准。*

> AI生成

## 12. v1.13 业务功能增强与风控/审计/AI 全流程优化专章

### 12.1 登录安全风控：找回密码密保尝试次数配置 (REQ-01)
- **数据模型**：`SystemSetting.forgot_password_max_attempts`（默认 5 次，范围 1-30 次）。
- **管控配置**：管理员在「用户管控 - 登录安全风控配置」中直接可视化修改并即时生效。
- **验证与锁定**：
  - `GET /api/users/forgot-password/`：返回密保问题的同时，返回 `max_attempts`、`remaining_attempts` 及 `is_locked` 状态。
  - `POST /api/users/forgot-password/`：每次输错自动扣减剩余次数；达到最大尝试限制立即触发熔断锁定（HTTP 400 + code 1012），并记录锁定审计日志；已被锁定的账号后续请求直接拦截拒绝。
  - `PUT /api/users/forgot-password/`：重置密码时若达到尝试上限同样阻止操作，成功后自动清除错误计数器。
- **前端交互**：在找回密码弹窗中实时显示剩余机会，超过限制时提示锁定并联系管理员。

### 12.2 商品库中心：收藏夹全流程 (REQ-02)
- **收藏序列化**：`FavoriteSerializer` 在 `favorite_type == "product"` 时自动加载商品实体详情，包含封面图、品牌、商品名、一二级分类标签、综合推荐指数、价格区间及推荐购买链接。
- **查询与过滤**：`FavoriteViewSet` 支持 `?favorite_type=product&object_id={id}` 高效过滤。
- **前端交互**：
  - 商品列表页卡片右上角悬浮心形收藏按钮，支持一键收藏/取消收藏。
  - 商品详情页主按钮集成收藏切换，带数量快照与 Toast 反馈。
  - 个人中心「我的收藏」支持富商品卡片网格渲染，点击直达商品详情页。

### 12.3 全站操作审计日志全覆盖与页面重构 (REQ-03)
- **审计埋点范围**：
  - 认证与风控：登录、登出、修改密码、注销账号、设置密保、找回密码尝试、重置密码、超限锁定。
  - 用户管控：编辑用户、冻结/解冻、重置密码、修改密保、安全风控设置、注册模式与邀请链接。
  - 孕育档案：更新个人资料、更新孕育阶段、宝宝档案增删改、设为默认宝宝。
  - 商品中心：商品增删改、批量导入/导出、品牌档案更新、收藏夹增删。
  - 健康医疗：生长/产检/疫苗健康记录增删。
  - 待产清单：创建清单、智能生成待产包、清单商品增删改。
  - AI 模块：AI助手问答对话、商品智能对比、AI商品深度评测、AI配置变更与一键测试。
  - 系统运维：清空/批量删除审计日志、设置日志保留天数。
- **页面布局重构**：
  - 顶部指标卡片：总日志数、今日操作数、安全风控事件、业务数据变更。
  - 模块分类徽章：8 大类别（认证安全、用户管控、孕育档案、商品中心、健康医疗、待产清单、AI助手、系统运维）专属色彩徽标。
  - 复合筛选工具栏：按模块标签、操作类型下拉、关键词即时检索、日期筛选。
  - 日志详情弹窗：支持查看完整操作人账号快照、IP、时间戳、目标元数据及详细 JSON Payload，支持一键复制。

### 12.4 商品推荐购买链接、规格清洗与 AI 一键评测 (REQ-04)
- **多平台购买渠道**：
  - 数据模型：`Product.purchase_links`（存储淘宝、京东、拼多多等直达链接）。
  - 后台管理：「商品管理」表单新增淘宝、京东、拼多多直达链接单独配置项。
  - 详情页展示：主流电商平台专属色彩徽章按钮，配置直达链接时一键跳转对应商品页，未配置时提供平台快捷搜索。
- **规格参数优化**：自动过滤所有包含“接口”与“ISOFIX”等非母婴日常相关内容，保持参数精简。
- **AI 一键深度评测**：
  - 后端接口：`POST /api/products/{id}/ai-evaluate/`。
  - 评测维度：综合评测结论、价格与性价比、性能与安全保障（含 CCC 认证与风险警示）、多平台购买对比建议、核心功能与使用避坑。
  - 双模引擎：优先调用已配置的 AI 大模型深度生成，未配置或 API 故障时自动启用高质量本地规则评测引擎，保证 100% 可靠返回。

### 12.5 孕育阶段交互设置与修复 (REQ-05)
- **交互入口**：将原先首页欢迎卡片与个人中心顶部的静态只读文本“请设置预产期或宝宝生日”重构为交互按钮。
- **双模弹窗组件 (`SetStageModal`)**：
  - 怀孕中：日期选择器选取预产期，自动计算孕周（如第 16 周）、孕期阶段（孕早/中/晚）及倒计时天数。
  - 宝宝已出生：选择宝宝生日，支持录入宝宝昵称与性别，保存时自动创建宝宝档案并设为主宝宝。
  - 全局状态响应：保存后即时触发 `authStore.fetchMe()`，全站阶段信息与时间线内容无感刷新。

### 12.6 AI 配置一键连通性测试 (REQ-06)
- **后端接口**：`POST /api/users/ai-config/test/`。
- **测试能力**：10s 严格超时、轻量级 ping 请求、毫秒级响应延迟测速。
- **智能错误分类**：
  - 401：API Key 无效或未授权
  - 404：模型不存在或 Base URL 路径错误
  - 连接/超时：网络连接失败或请求超时，提示检查 Base URL 可访问性
  - 429：频率超限或账户额度不足
- **前端交互**：配置列表每张卡片右上角提供「一键测试」按钮，实时展示测试动画与绿/红状态反馈标签。

### 12.7 AI 助手稳定性与可用性修复 (REQ-07)
- **Base URL 规范化**：自动去除首尾空格、尾部斜杠 `/` 以及用户误粘的 `/chat/completions`。
- **客户端超时与模型推断**：OpenAI 客户端注入 `timeout=20.0`，空模型名称自动根据供应商推断（DeepSeek/通义千问/月之暗面等）。
- **联网搜索熔断保护**：DuckDuckGo 搜索设置 3s 严格超时，网络受限或离线时自动捕获异常静默返回，杜绝挂起整个对话。
- **配置共享继承**：普通用户或无个人配置时平滑继承管理员已启用的系统 AI 配置，保证普通用户开箱即用。
- **聊天记录净化**：移除之前将系统调试提示作为独立 AI 对话气泡持久化插入历史记录的逻辑。


### 12.8 商品收藏与取消收藏双向反馈优化 (REQ-08)
- **问题现象**：用户在商品库和商品详情页点击收藏按钮有“已添加到收藏夹”提示，但再次点击取消收藏时没有任何页面提示，导致用户无法确认操作结果。
- **根因分析**：
  - 前端缺少独立的取消收藏提示触发与定时器引用（快速连击时上一轮 `setTimeout` 清空了取消收藏的提示）。
  - 后端原有收藏接口未提供原子切换能力，并发或重复提交会触发 `core_userfavorite` 唯一约束冲突报错。
- **改造方案**：
  - 后端在 `FavoriteViewSet` 新增 `POST /api/favorites/toggle/` 动作，根据当前状态原子切换加入或取消，返回明确的 `favorited` 状态与提示文案；`create` 方法实现幂等保护。
  - 前端 `ProductCard`、`ProductListPage`、`ProductDetailPage`、`HomePage` 统一引入双向切换提示与 `useRef` 定时器防抖机制，首次点击弹出“已添加到收藏夹”，再次点击弹出“已取消收藏”，心形图标与收藏数同步更新。

### 12.9 AI 助手问答卡死根因排查与可用性回退修复 (REQ-09)
- **卡死根因排查**：
  - 联网搜索模块 `web_search.py` 在 Windows 宿主环境下调用 DuckDuckGo 搜索库时，因系统证书存储区访问限制报 `failed to load native root certificate: os error 5 (拒绝访问)`，随后在多网络端点重试陷入阻塞，单次提问耗时超 12 秒。
  - 用户输入含“今天/最近/查一下”等高频触发词时均会触发联网搜索，叠加 OpenAI 默认重试机制后直接超出前端 axios 30s 响应超时限制，导致前端抛出异常并提示“抱歉，我暂时无法回答”。
  - 同时底层 `_call_openai` 参数定义顺序发生偏移，部分代理端点硬编码 `system` 角色时产生兼容性异常。
- **修复方案**：
  - 联网搜索加入 `threading.Thread` 守护线程执行与 1.0s/1.2s 严格超时退出机制，遇证书/网络不可达时即刻静默返回空结果，绝不阻塞主对话进程。
  - 规范化 `_call_openai(prompt, api_key, base_url, model, timeout=12.0, max_tokens=1000, system=None)` 签名，OpenAI 客户端注入 `max_retries=1`，外部 API 调用失败时无缝兜底至 `_local_question` 优质本地知识库，保证 AI 对话秒级响应且 100% 可用。

### 12.10 注册管理排版解耦与双模块独立化改造 (REQ-10)
- **优化诉求**：原有注册模式控制与生成邀请链接挤压在同一个卡片内，且只有在切到“仅限邀请”时才展示链接功能，排版拥挤缺乏层次。
- **改造方案**：
  - 将注册管理页面（`RegistrationManagePage.tsx`）拆分为两个视觉与逻辑完全独立的卡片容器：
    - **模块一：注册模式控制**：展示当前系统注册模式状态横幅，提供“开放注册”与“仅限邀请注册”双卡片单选切换，配以详细的使用场景与准入规则说明，切换后即时 Toast 提示。
    - **模块二：邀请链接管理与生成**：作为常态化管理模块始终可用，支持设置最大使用次数（带快捷选择）、有效期限（支持24h/72h/7d/永久快捷选项）与用途备注；生成后自动复制链接并高亮反馈；下方表格展示历史邀请链接、状态徽章（有效/已失效/已过期）、使用进度、到期时间及复制/停用/删除操作。

### 12.11 密保超限熔断冻结与管理员一键解冻解锁联动修复 (REQ-11)
- **问题现象**：用户找回密码时连续输错密保达到限制次数后提示账号被冻结，但管理员页面看到的账号状态仍然显示为正常；管理员点击解冻后，用户再次尝试找回密码仍然提示“密保尝试次数已达上限（3次），已限制找回密码”。
- **根因分析**：
  - `ForgotPasswordView.post` 在达到最大尝试次数时仅返回了错误提示，未将数据库中的 `user.is_active` 置为 `False`，导致管理员列表仍显示为正常活跃状态。
  - 管理员执行解冻操作时仅将 `is_active` 置为 `True`，未同步清空已累计的 `security_fail_count`，导致后续验证仍命中 `fail_count >= max_attempts` 的拦截逻辑。
- **修复方案**：
  - 输错密保超限时（`remaining == 0`），后端立即将 `user.is_active = False` 并持久化保存，同时记录“密保验证超限锁定”审计日志。
  - 前端管理员页面针对 `!u.is_active` 且 `security_fail_count >= max_att` 的用户高亮展示红底「密保超限冻结」徽章，并提供醒目的「解冻 / 解锁」操作按钮。
  - 后端 `UserManageView.put` 支持 `reset_security_lock: true`，管理员解冻账号或重置风控限制时，自动重置 `security_fail_count = 0`、`login_fail_count = 0` 与 `locked_until = None`。
  - 解冻后用户再次进入找回密码页面即可重新获得全部尝试机会，形成完整的风控锁死与运维解冻闭环。

### 12.12 首页商品收藏/取消收藏双向反馈与跨页面同步 (REQ-12)
- **优化诉求**：首页推荐商品卡片点击收藏心形图标时，需与商品库和详情页保持一致的双向 Toast 提示反馈，且页面切换返回后收藏状态自动同步。
- **改造实现**：
  - 前端 `HomePage.tsx` 引入 `useLocation`，在组件挂载和路由返回时自动拉取 `favoriteApi.list({ favorite_type: "product" })` 刷新 `favoritedIds` 集合。
  - 给 `ProductCard` 明确传递 `initialFavorited={favoritedIds.has(product.id)}` 与 `onToggleFav` 回调，在加入收藏时弹出“已添加到收藏夹”，取消收藏时弹出“已取消收藏”，彻底解决首页缺少交互反馈的问题。

### 12.13 我的收藏即时移除优化与 204 解析异常消除 (REQ-13)
- **问题现象**：在“我的收藏”页面中点击取消收藏按钮后，卡片不会立即从列表中消失，需要退出去重新进入或者手动刷新页面后才会消失。
- **根因分析**：
  - 后端原有 REST Framework 默认的 HTTP 204 No Content 响应在被 `CustomJSONRenderer` 处理时附带了 JSON 响应体，导致 Vite/Node 反向代理在解析 HTTP 响应时抛出 `Parse Error: Expected HTTP/, RTSP/ or ICE/` 异常，前端 Promise 被 reject 进入 catch 块并提示“操作失败”，使得前端状态过滤逻辑未执行。
  - 原前端代码使用阻断式 `window.confirm`，体验生硬且缺乏乐观更新。
- **改造方案**：
  - 后端 `CustomJSONRenderer` 对 204 响应特殊处理返回空字节流 `b""`；同时 `FavoriteViewSet.destroy` 重写为显式返回 HTTP 200 `{"code": 0, "message": "已取消收藏", "data": None}`。
  - 前端 `FavoritePage.tsx` 采用**乐观更新机制**：点击取消收藏后立即执行本地过滤移除卡片并弹出“已取消收藏”Toast，异步向后端提交删除请求；若请求异常则自动回退列表并提示“取消收藏失败”。
  - 增加 `useLocation` 依赖以及 `window.addEventListener("focus", load)`，当用户在商品详情页取消收藏返回后，页面焦点唤醒自动同步最新收藏列表。

### 12.14 AI 助手环境权限穿透、多模型共享与个人配置全面修复 (REQ-14)
- **问题现象**：配置好 API Key 后使用 AI 助手依然无法使用（无法网络搜索，一直提示“收到您的问题啦！当前为本地知识模式，可先尝试问：· 待产包要准备什么？...如需更智能的答案，可在「我的 - AI 配置」中设置 API Key”）。
- **根因排查**：
  - **沙箱网络权限隔离**：Windows 宿主环境下，若后台 Python 进程在受限沙箱中启动，对外部网络发起 TCP/HTTPS 链接（如 `https://apihub.agnes-ai.com/v1`）会直接被操作系统套接字拒绝（`Connection error` / `WinError 10013`），导致即便配置正确也必然抛出异常回退本地模式。
  - **普通用户配置隔离**：原有设计中只有普通用户拥有自己的 `ai_configs` 才能调用大模型，而普通用户默认无独立 API Key，系统亦未从管理员配置中继承共享可用模型，导致普通用户必然回退本地知识库。
  - **接口权限过度拦截**：原有 `AIConfigView` 与 `AIConfigTestView` 强制校验 `IsAdminUser`，普通用户在「我的 - AI 配置」中访问时直接收到 403 错误，无法配置或测试个人专属 Key。
- **修复方案**：
  - 规范服务启动机制，通过提权管道启动后台进程，赋予其完整网络访问权限。
  - 优化 `apps/core/services/ai_service.py` 中的 `_build_config_list(user)`：当普通用户无个人配置时，自动从管理员启用的模型列表中继承首个可用配置，开启全平台“系统共享 AI 服务”模式。
  - 调整 `AIConfigView` 与 `AIConfigTestView` 为 `IsAuthenticated`：普通用户可自行添加/编辑/测试个人 API Key（通过 `can_manage=False` 隐藏管理员授权面板），未配置时自动使用系统共享模型。
  - 优化 `apps/core/services/web_search.py` 超时时间至 2.5s（线程 2.8s 强制退出），确保网络检索快速容灾，不阻塞 LLM 对话生成。

### 12.15 注册管理邀请链接多选、全选、批量删除与一键清空 (REQ-15)
- **需求目标**：在注册管理页面，对生成的邀请链接列表提供多选复选框、顶部全选复选框、批量删除（带选中计数）及一键清空功能。
- **改造实现**：
  - **后端能力扩展**：
    - `POST /api/admin/registration/` 新增 `action == "batch_delete_invites"` 处理分支，接收 `invite_ids` 数组，执行批量删除并记录审计日志。
    - 新增 `action == "clear_all_invites"` 处理分支，一键清空全部邀请链接记录并记录审计日志。
  - **前端交互增强**：
    - `RegistrationManagePage.tsx` 引入 `selectedIds` 集合状态，卡片左侧增加专属 Checkbox。
    - 列表上方新增操作工具栏，展示全选 Checkbox（显示选中项/总数比例）、已选计数徽章。
    - 新增「批量删除 (X)」按钮（仅在有选中时激活并二次确认）与「一键清空」危险操作确认按钮。

### 12.16 密码错误超限冻结状态同步与管理员一键解冻修复 (REQ-16)
- **问题现象**：用户账号因密码错误达到风控阈值被提示冻结后，管理员用户管理页面中的状态仍显示为“正常/未冻结”，且冻结按钮显示为“冻结”而非“解冻”。
- **根因分析**：
  - 密码错误触发风控时，早期逻辑仅设置了 `locked_until`，未将 `user.is_active` 同步置为 `False`；前端也仅依据单一字段判断冻结。
- **修复方案**：
  - 后端 `_register_login_failure`：当累计失败达到 `freeze_threshold` 时，同步执行 `user.is_active = False`，与密保超限机制保持统一。
  - 前端定义统一冻结判定函数：`isUserFrozen = (u) => !u.is_active || (u.login_fail_count >= secConfig.login_freeze_threshold)`。
  - 列表状态徽章：命中冻结时渲染红底描边「已冻结」徽章；顶部统计渲染已冻结人数。
  - 操作按钮联动：冻结用户展示绿色高亮「解冻账号」按钮（带 `ShieldCheck` 图标），点击调用 `userManageUpdate(u.id, { is_active: true, reset_security_lock: true })`，后端自动清空 `login_fail_count`、`security_fail_count` 与 `locked_until`，实现一键解除封锁与计数重置。

### 12.17 管理员自由控制普通用户页面菜单与 CRUD 细粒度权限管控矩阵 (REQ-17)
- **需求目标**：管理员可在后台自由控制普通用户可访问的页面菜单与业务功能权限，实现最基本的增删改查（CRUD）全颗粒度管控。
- **架构设计与数据模型**：
  - 系统设计了包含 **6 大功能模块、共 31 项细粒度权限项** 的完整权限体系：
    - **1. 页面菜单访问权限 (11 项)**：`menu_home`（首页）、`menu_timeline`（孕期周历）、`menu_products`（商品库）、`menu_ai_assistant`（AI助手）、`menu_shopping_list`（待产包）、`menu_health`（健康中心）、`menu_fetal_stories`（胎教故事）、`menu_recipes`（孕期食谱）、`menu_encyclopedia`（幼儿百科）、`menu_favorites`（我的收藏）、`menu_notifications`（消息通知）。
    - **2. 待产包模块 (4 项)**：`shopping_list_view`（查）、`shopping_list_create`（增/生成）、`shopping_list_update`（改）、`shopping_list_delete`（删/清空）。
    - **3. 健康中心模块 (4 项)**：`health_record_view`（查）、`health_record_create`（增）、`health_record_update`（改）、`health_record_delete`（删）。
    - **4. 宝宝档案模块 (4 项)**：`baby_view`（查）、`baby_create`（增）、`baby_update`（改）、`baby_delete`（删）。
    - **5. 商品库中心与收藏模块 (4 项)**：`product_view`（查）、`product_favorite`（增/收藏）、`product_unfavorite`（删/取消收藏）、`product_ai_evaluate`（用/AI评测）。
    - **6. AI 助手模块 (4 项)**：`ai_chat`（问答对话）、`ai_session_create`（新建会话）、`ai_session_rename`（重命名会话）、`ai_session_delete`（删除会话）。
  - **模型支持**：
    - `SystemSetting.default_user_permissions`（JSONField）：存储全系统普通用户的全局默认权限配置。
    - `User.custom_permissions`（JSONField）：支持未来扩展单用户独立个性化权限定制覆盖。
  - **后端校验与拦截**：
    - 编写 `apps/core/utils/permissions.py`，提供 `get_user_permissions`、`has_permission`、`check_permission_or_403`。
    - 管理员（`is_staff=True`）始终自动 bypass 拥有全部权限。
    - 待产包、健康记录、宝宝档案、商品收藏、AI 聊天及商品 AI 评测等各 ViewSet 与 API 端点全面接入 `check_permission_or_403` 拦截。
    - 开放 `GET/PUT /api/admin/permissions/`（管理员管控）及 `GET /api/users/permissions/`（用户查询）。
    - `UserSerializer` 与 `MeView` 响应自动携带当前生效的 `permissions`。
  - **前端全链路管控与呈现**：
    - `authStore.ts`：持久化存储用户当前生效的 `permissions`，提供 `hasPermission(key)` 辅助校验函数。
    - `MainLayout.tsx`：顶栏与移动端底栏导航项根据 `hasPermission("menu_xxx")` 动态过滤渲染。
    - `App.tsx`：编写 `PermissionGuard` 路由守卫组件，未授权访问菜单时优雅提示并提供返回首页按钮。
    - `ShoppingListPage.tsx`、`HealthPage.tsx`、`ProductDetailPage.tsx`：按钮级权限绑定（隐藏新建、修改、删除或评测按钮）。
    - `UserManagePage.tsx`：顶栏新增「用户权限管控 (31项)」独立选项卡，以卡片与开关矩阵可视化呈现 6 大分组权限，提供“一键开启全部”、“一键禁用全部”、“该组全开/全关”、“重置配置”及“保存权限配置”操作，修改即时在全平台生效。
### 12.18 用户级专属细粒度权限管控、管理员权限不可撼动机制与服务守护加固 (REQ-18)
- **需求背景与痛点**：
  - 用户反馈在权限配置界面点击“一键禁用全部”并保存后，系统报错且管理员账号无法使用，重新登录报错 `Request failed with status code 500`。
  - 核心要求：权限管控必须能够针对**具体用户**单独配置，而不是只能一刀切修改全局默认；同时**管理员用户默认具备所有权限，任何时候均不能禁用菜单或功能权限**。
- **根因深度定位**：
  - **登录 500 根因**：后台 Django 进程在无 `--noreload` 参数的后台运行模式下，因重载信号或子进程管理在 Windows 环境下意外中断退出。当 Vite 反向代理向 `127.0.0.1:8000` 转发登录与权限保存请求时触发 `ECONNREFUSED`，由 Vite 开发服务器向前端抛出 HTTP 500 (`Request failed with status code 500`)。
  - **管理员被误控隐患**：原权限体系仅在全局 `SystemSetting.default_user_permissions` 层级保存，未提供针对特定单用户的独立修改端点；前端在加载中或特定未判别分支下若权限字典全为 false，可能导致路由守卫拦截管理员。
- **架构升级与完整落地**：
  - **1. 管理员绝对特权内核保障 (Admin Supremacy)**：
    - `apps/core/utils/permissions.py`：`get_user_permissions`、`has_permission` 及 `check_permission_or_403` 首行统一硬编码判断：凡 `user.is_staff` 或 `user.is_superuser` 为 True，无条件返回全 31 项 `True` 并直接放行，不受数据库中任何配置项干扰。
    - 接口层防御：`AdminPermissionsView.put` 显式校验，若尝试修改管理员账号权限直接拦截并返回友好错误提示（“系统管理员默认具备所有最高权限，菜单与功能权限不可禁用”）。
    - 前端硬编码放行：`authStore.hasPermission`、`MainLayout.tsx` 导航渲染以及 `App.tsx` 路由守卫 `PermissionGuard` 针对管理员账号全线无条件放行。
  - **2. 针对具体用户的专属独立权限管控 (Per-User Permissions)**：
    - 模型与接口扩展：基于 `User.custom_permissions`，扩展端点：
      - `GET /api/admin/permissions/?user_id=<id>`：查询指定用户的生效权限、个性化配置及管理员状态。
      - `PUT /api/admin/permissions/`（接收 `{ user_id, permissions }`）：单独保存指定用户的 31 项功能与菜单权限。
      - `PUT /api/admin/permissions/`（接收 `{ user_id, reset_to_default: true }`）：清空个性化覆盖，恢复为系统默认模板。
    - 权限继承优先级：`用户个性化配置 (custom_permissions)` > `系统全局默认模板 (default_user_permissions)` > `系统内置默认 (全开)`。
    - 前端交互重构（`UserManagePage.tsx`）：
      - 用户列表每行卡片展示权限状态徽章（「系统管理员」、「已定制权限」或「系统默认权限」）。
      - 新增专属「权限设置」按钮，点击弹出专属弹窗（`UserPermissionModal`）。
      - 支持对该用户 31 项权限进行单项切换、按组全选全关、一键开启全部、一键禁用全部与重置为系统默认，修改仅对该用户生效，不波及他人。
  - **3. 全局默认模板与用户级权限解耦清晰化**：
    - 将全局权限面板重命名为「新用户全局默认权限模板」，明确其作为新注册用户与未单独配置用户的底色模板定位。
  - **4. 进程守护与全链路稳定性加固**：
    - `run.ps1` 启动后端 Django `runserver` 显式附带 `--noreload` 参数，杜绝 Windows 后台守护运行下的进程自杀与端口脱落。
    - `UserSerializer` 与 `get_user_permissions` 增加全链路异常捕获与兜底，杜绝任何数据异常引发登录 500。

### 12.19 外部访问端口默认收敛为 443、Nginx SNI 虚拟主机反代与双端回环安全隔离 (REQ-19)
- **需求背景与痛点**：
  - 用户要求更新 `run.sh` 运维脚本，将外部访问端口统一修改为默认 **443**，且生成的对应 Nginx 反向代理配置必须通过 **SNI（Server Name Indication）** 实现 443 端口的标准访问。
  - 用户进一步提问：前端服务端口（默认 5173）跟外部 HTTPS 访问端口（默认 443）有何区别？如果没有区别，则统一使用 443 端口。
- **架构深度解析与两类端口定位**：
  - **职责完全解耦**：
    - **外部 443 端口（Nginx 统一反代大门）**：面向公网及最终用户，负责 SSL/TLS 证书卸载、基于 SNI 的多域名匹配路由、安全响应头防护（HSTS、X-Frame-Options、X-Content-Type-Options）以及 HTTP 80 强制跳转 443。
    - **内部 5173 端口（Vite 前端开发服务器）**：面向本机内部，负责 React 组件动态编译与页面热更新（HMR WebSocket）。
    - **内部 8000 端口（Django 后端服务器）**：面向本机内部，负责业务逻辑处理、数据库读写与 API 鉴权。
  - **端口不能物理合并的根本原因**：
    - **单 IP 端口冲突**：同一台服务器上 443 端口已被 Nginx 监听，Node/Vite 进程无法重复绑定同一端口（否则触发 `EADDRINUSE` 报错）。
    - **特权端口安全隔离**：Linux 环境下 443 为特权端口，必须以 root 启动；而 Node/Vite 属于前端构建工具，应以普通用户权限运行。
    - **SNI 多站点能力**：Vite 无法独立实现生产级多域名独立证书的 SNI 动态切换与后端 API 智能分流。
  - **用户体验与安全架构的彻底统一方案**：
    - **对外访问统一收敛为 443**：浏览器只需访问 `https://域名/`（443 为默认标准端口，无需输入端口后缀）。
    - **内部双端回环安全隔离**：前端 Vite 启动参数由原本的 `0.0.0.0:5173` 收敛为仅绑定 `127.0.0.1:5173`（本地回环地址），后端 Django 同步绑定 `127.0.0.1:8000`，彻底阻断任何绕过 Nginx 网关直连内部明文端口的外部攻击面。
- **实施改造明细**：
  - **1. `run.sh` 脚本全流程升级**：
    - 外部端口定义：默认 `PORT="${PORT:-${EXTERNAL_PORT:-443}}"`，统一对齐 443 端口。
    - SNI 匹配域名：默认 `SERVER_NAME="${SERVER_NAME:-${DOMAIN:-mengya.local localhost}}"`，支持通过环境变量自定义指定域名。
    - 新增 `./run.sh add_nginx` 子命令与 `gen_nginx_config()` 生成函数。
    - 自动生成 `$NGINX_CONF_DIR/mengya_ssl.conf`：
      - HTTP 80 自动永久重定向（301）至 HTTPS 443，保持 host 与 request_uri。
      - HTTPS 443 虚拟主机监听 `listen 443 ssl;` 与 `server_name $SERVER_NAME;`，完美实现 SNI 动态路由。
      - 自动调用 openssl 生成携带 SAN（Subject Alternative Name）扩展属性的 SSL 证书，消除现代浏览器 SNI 校验告警。
      - 完整反向代理规则：前端 SPA 页面代理、Vite HMR WebSocket 支持（`Upgrade` / `Connection`）、Django `/api/` 与 `/admin/` 代理，透传完整安全头与客户端真实 IP。
    - 修复后端路径自动探测：自适应当前根目录与嵌套 `backend/` 目录下的 `manage.py`。
    - `start`、`restart`、`status`、`help` 全面展示 443 HTTPS 单入口与双端回环保护状态。
  - **2. 前端启动脚本优化 (`frontend/start_vite.mjs`)**：
    - 监听主机默认置为 `127.0.0.1`（可通过 `FRONTEND_HOST` 覆盖），与 Django 8000 回环防护保持一致。

### 12.20 Docker 容器化运维改造：命令解耦、缓存垃圾自清理与宿主机多站点 Nginx 双版本并存规范 (REQ-20)
- **需求背景与痛点**：
  - 此前 Docker 版 `run.sh` 脚本将容器启停、重新构建镜像、生成 SSL 证书等多项操作混杂于 `start` 指令中，违反单一职责原则，导致日常启动速度慢且产生隐式副作用。
  - 宿主机同时运行传统版（`mengya-local`）与 Docker 版（`mengya-docker`）时，存在端口冲突（5173）、Nginx 配置文件覆盖（同名 `mengya_ssl.conf`）及域名冲突风险。
- **架构升级与实施明细**：
  - **1. 运维指令深度解耦**：
    - `start` 指令纯粹化：仅执行缓存垃圾清理与 `docker compose up -d`，不再自动重新编译镜像，不再隐式调用证书生成。
    - 移除冗余指令：从脚本中正式移除 `migrate` 与 `ensure_admin` 手动函数，依赖容器内部启动链条自驱执行。
    - 独立 `build` 指令：镜像重新构建与日常启停彻底解耦。
  - **2. 自动垃圾清理机制 (`cleanup_cache`)**：
    - 在 `start` 与 `restart` 最前置执行：自动调用 `git reflog expire` 与 `git gc --prune=now` 回收 .git 冗余对象并打印体积；递归清除 `__pycache__` 与 `*.pyc` 字节码；清理 `/tmp/gift-backup` 临时残留。
  - **3. 宿主机 NGINX 双版本多站点“零冲突”规范**：
    - 独立配置文件：`./run.sh add_nginx` 写入宿主机 `/opt/service/nginx/conf.d/mengya_docker_ssl.conf`，与传统版配置文件物理隔离。
    - 独立 SSL 证书：证书存储于 `/opt/service/nginx/ssl/mengya_docker.crt` 与 `mengya_docker.key`。
    - 端口隔离：Docker 版前端映射宿主机端口调整为 **5174**（避开传统版 5173），内部通信保持网络隔离。
    - SNI 域名分流：默认域名匹配为 `mengya-docker.local`，与传统版共同监听宿主机 443 端口，通过 TLS SNI 实现单 IP 单端口多站点无冲突共存。

### 12.21 运行参数命令行自定义、Compose 规范升级与配置自愈保障 (REQ-21)
- **需求背景与痛点**：
  - 用户反馈 Docker 容器启动时存在两处阻塞性或警示性问题：
    1. `WARN[0000] /opt/service/mengya-docker/docker-compose.yml: the attribute 'version' is obsolete, it will be ignored, please remove it to avoid potential confusion`。
    2. `env file /opt/service/mengya-docker/.env not found: stat /opt/service/mengya-docker/.env: no such file or directory`，当宿主机环境克隆后未及时生成 `.env` 时，docker compose 直接失败退出。
  - 用户同时要求改造 `run.sh` 运维脚本，使其支持通过命令行传参自定义外部访问端口、管理员账号、管理员密码、昵称及域名等变量，并支持持久化，无需手动频繁编辑 `.env` 文件。
- **架构升级与实施明细**：
  - **1. Docker Compose v2 规范对齐与告警消除**：
    - 彻底移除 `docker-compose.yml` 顶层的 `version: "3.9"` 声明。现代 Compose Specification 规范不再依赖顶层 version 属性，消除控制台冗余告警。
    - 在 `backend` 与 `worker` 服务的 `env_file` 配置中采用现代结构化声明：
      ```yaml
      env_file:
        - path: .env
          required: false
      ```
      将 `.env` 声明为非阻塞式可选文件（`required: false`），即使环境缺少 `.env`，容器也能依赖编排内置默认值正常拉起。
  - **2. 脚本前置自动环境自愈机制**：
    - 在 `run.sh` 入口处增加自动探测逻辑：若当前工作目录下不存在 `.env` 配置文件，且存在 `.env.example` 模版，则自动执行 `cp .env.example .env` 完成初次配置初始化并输出友好提示；若两者皆无则安全创建空文件，杜绝后续指令因缺少配置文件而报错。
  - **3. 全功能命令行运行时参数解析与持久化 (`update_env_var`)**：
    - `run.sh` 引入标准循环参数解析（`while [ $# -gt 0 ]`）与 `case` 分发机制，全面支持以下运行时参数选项：
      - `-p, --port <PORT>`：自定义宿主机暴露端口（默认 5174，通过更新 `FRONTEND_PORT` 避免端口冲突）。
      - `-u, --admin <USER>`：自定义超级管理员账号/手机号（同时更新 `ADMIN_USERNAME` 与 `ADMIN_PHONE`）。
      - `-P, --password <PASS>`：自定义超级管理员密码（更新 `ADMIN_PASSWORD`）。
      - `-n, --nickname <NAME>`：自定义管理员前台展示称谓（更新 `ADMIN_NICKNAME`）。
      - `-d, --domain <DOMAIN>`：自定义反向代理匹配的 SNI 域名（更新 `SERVER_NAME`）。
    - 编写 `update_env_var()` 辅助工具函数：当用户在命令行传入上述参数时，脚本通过安全正则匹配即时将最新值写回持久化至 `.env` 配置文件，后续常规无参启动（如 `./run.sh start` 或服务器开机自启）直接继承使用用户定制参数。
  - **4. 敏感数据全面脱敏与种子业务数据保障**：
    - 移除了开发测试过程中的真实私密配置（如第三方 API Key、商业账密），全量收敛至 `.env.example` 占位符。
    - 保留并装载 `apps/core/fixtures/initial_data.json` 中 971 条母婴核心业务数据（包含 40 周孕育周历、科学营养食谱、胎教童话故事、儿科百科问答等），并在首次容器拉起时通过 Django 内置流水线全自动导入，实现真正的纯净安全与开箱即用。

### 12.22 Nginx 反代路径智能绝对化与多域名 SAN 证书权威重构 (REQ-22)
- **需求背景与痛点**：
  - 用户在审查与测试 `run.sh` 脚本的 `add_nginx` 功能时提出两项关键疑问与隐患：
    1. **域名参数权威性存疑**：脚本中同时存在 `SERVER_NAME` 与 `PRIMARY_DOMAIN`，用户质疑自定义 SNI 域名是否真正生效，以及到底以哪个参数为准。
    2. **相对证书路径导致 Nginx 加载崩溃**：当配置 `NGINX_CERT_DIR="${NGINX_CERT_DIR:-./nginx/ssl}"` 时，生成的 Nginx 配置文件中证书路径为相对路径：
       `ssl_certificate ./nginx/ssl/mengya_docker.crt;`
       `ssl_certificate_key ./nginx/ssl/mengya_docker.key;`
       Nginx 在解析相对路径证书时，依据规范是基于自身 Prefix 目录（通常为 `/etc/nginx`）寻址，而非基于当前工作目录或项目目录。导致 Nginx 报致命错误 `cannot load certificate "./nginx/ssl/...": No such file or directory`。
- **架构升级与实施明细**：
  - **1. 域名配置权威性收敛（以 `SERVER_NAME` 为唯一权威）**：
    - 明确 `SERVER_NAME` 为唯一用户配置项（通过命令行 `-d / --domain` 或 `.env` 设定），直接完整注入 Nginx 配置中的 `server_name $SERVER_NAME;`。
    - 将 `PRIMARY_DOMAIN` 重构为内部派生变量 `MAIN_DOMAIN`（仅提取 `SERVER_NAME` 的首个域名），严格用于规避 OpenSSL 证书主题 CN 不能包含空格的规范限制，并用于终端输出合法的单一可点击链接。
    - **多域名 SAN 全量遍历支持**：动态遍历 `SERVER_NAME` 中声明的全部域名，自动拼接为 `subjectAltName` 扩展列表（`DNS:localhost,IP:127.0.0.1,DNS:domain1,DNS:domain2...`），彻底解决多域名访问时浏览器报证书不匹配的痛点。
  - **2. 路径智能绝对化规范（`resolve_abs_path`）**：
    - 编写 `resolve_abs_path()` 工具函数：检测到输入路径为相对路径时（如 `./nginx/ssl` 或 `nginx/ssl`），自动基于项目根目录 `$SCRIPT_DIR` 转换为系统的物理绝对路径并确保目录存在；若已是绝对路径则安全保留。
    - 在生成 Nginx 配置时，写入的证书路径一律为规范绝对路径（如 `/opt/service/mengya-docker/nginx/ssl/mengya_docker.crt`）。
    - 无论用户配置绝对路径还是相对路径，Nginx 服务无论何时从何工作目录下重载均能稳定读取证书。

### 12.23 全模块样例数据自愈入库与重启会话强制下线安全机制重构 (REQ-23)
- **需求背景与痛点**：
  - 用户在部署并运行 Docker 版本镜像时，反馈发现两项关键问题：
    1. **页面样例数据大面积缺失**：前台访问「孕期周历」、「睡前胎教故事」、「孕期营养食谱」、「幼儿百科」等功能页面时，发现数据均为空白，未呈现应有的完整业务样例。
    2. **服务重启后在线用户未被强制下线**：执行 `./run.sh restart` 重启 Docker 容器服务后，先前已登录的前台客户端刷新或点击页面后依然保持登录状态，未能触发会话注销与强制下线重登。
- **深度排查与根因定位**：
  - **1. 样例数据入库被截断阻断与静默回滚根因**：
    - `apps/core/fixtures/initial_data.json` 内置了 971 条全量脱敏基础数据。其中 41 个品牌档案（`BrandProfile.logo`）及 60 个优选商品（`Product.image_url`）采用内嵌 Base64 SVG 矢量图格式，字符串长度达到 358 ~ 666 字符。
    - 在数据模型定义中，`BrandProfile.logo` 与 `Product.image_url` 均使用未显式指定长度的 `models.URLField`，在底层 PostgreSQL 数据库中创建为 `varchar(200)` 列。
    - 容器拉起执行 `python manage.py loaddata` 时，PostgreSQL 抛出 `psycopg2.errors.StringDataRightTruncation: value too long for type character varying(200)` 异常。由于 Django `loaddata` 运行在原子事务中，导致全量 971 条数据全部事务回滚。
    - 启动编排命令中使用了 `|| python manage.py init_data --skip-if-exists` 错误抑制与降级，降级执行的旧 `init_data.py` 仅硬编码写入了品牌与商品（未含图片），且其内部完全没有编写食谱、胎教故事、幼儿百科、待产清单等数据写入逻辑，周历也仅有 5 条简单样本；更严重的是，旧脚本检查到 `Product.objects.exists()` 存在后在后续重启均跳过初始化，造成其余业务模块永久空置。
  - **2. 重启未能强制下线根因**：
    - 平台采用 `djangorestframework-simplejwt` 进行身份认证，并在 `User` 模型中包含 `active_token_jti` 字段，配合 `SingleSessionJWTAuthentication` 进行单终端在线校验。
    - 当宿主机执行 `./run.sh restart` 重启容器时，PostgreSQL 依赖数据卷 `pgdata` 正常保持数据持久化，用户的 `active_token_jti` 以及 `.env` 中的 `JWT_SECRET_KEY` 均未发生变化。
    - 浏览器客户端发起的 API 请求仍然携带原 Token，由于签名与 JTI 依然完全一致，且在有效生命周期内，因此认证通过，用户未感知下线。
- **架构升级与实施明细**：
  - **1. 数据库模型字段升级与迁移 (0023)**：
    - 将 `BrandProfile.logo` 及 `Product.image_url` 升级为 `models.TextField`，消除 URL 长度限制与 Base64 截断风险。
    - 新增迁移文件 `apps/core/migrations/0023_alter_brandprofile_logo_alter_product_image_url.py`，启动时全自动对 PostgreSQL 进行列类型转换。
  - **2. 全模块细粒度自愈与幂等初始化引擎 (`init_data.py`)**：
    - 全面重构 `apps/core/management/commands/init_data.py`：直接解析读取 `initial_data.json` 种子包，彻底废弃旧版“只要存在商品就全局跳过”的缺陷；
    - 建立逐模块独立幂等检测自愈机制：
      - **品牌档案**：41 条（BrandProfile），涵盖国内外主流知名母婴品牌档案、定位与历年排名；
      - **推荐商品**：63 条（Product），涵盖童车、座椅、奶瓶、纸尿裤、辅食等严选参数；
      - **40周孕育周历**：204 条（TimelineEvent），若现有记录数小于 40（如旧版残存样本），自动重构并补齐全量 40 周每日要点、产检节点与发育特征；
      - **睡前胎教故事**：245 条（FetalStory），涵盖孕 17-40 周中英双语伴读故事、温馨提示与分类播报；
      - **孕期营养食谱**：288 条（Recipe），涵盖早/中/晚孕期营养食谱、食材清单、烹饪步骤与营养贴士；
      - **幼儿百科问答**：57 条（KidsEncyclopedia），涵盖来源、身体、成长、奥秘四大篇章权威问答与趣味漫画；
      - **待产母婴清单**：69 条（BabyShoppingItem），涵盖入院待产妈妈篇与宝宝篇分类清单；
      - **系统设置与演示账户**：保障基础安全设置与 `demo_user` / `小萌芽` 宝宝档案；
    - 引入 `connection.ops.sequence_reset_sql`，入库后自动重置 PostgreSQL 主键自增序列，保障后续业务创建自增 ID 不发生碰撞；
    - 在 `docker-compose.yml` 启动流水线与 `run.sh` 中开放 `./run.sh init_data [--force]`，提供手动检查与一键全量重建能力。
  - **3. 服务重启全量会话注销与强制下线机制**：
    - 新增管理命令 `apps/core/management/commands/invalidate_tokens.py`：生成全局随机标识并全量更新所有用户的 `active_token_jti`（`User.objects.all().update(active_token_jti=revoked_marker)`）。
    - 升级 `SingleSessionJWTAuthentication`：当用户的 `active_token_jti` 为空或与当前 Token JTI 不匹配时，强制触发 `ForceLogoutError`（HTTP 401，业务错误码 1003）。
    - 同步修复 `apps/core/views.py` 中的用户注册 `register` 逻辑，在注册颁发 Token 时同步存入 `active_token_jti`。
    - 将 `python manage.py invalidate_tokens` 纳入 `docker-compose.yml` 容器启动命令与 `run.sh restart` 流程中。服务一旦重启，现有登录会话全部失效，客户端下次请求即刻被踢出并跳转至登录页（附带 `kicked=1` 友好提示“您的账号已在其他设备登录或服务已重启，请重新登录”）。

### 12.24 主流程 Nginx 反代配置与 SSL 证书自动集成及交互式防误覆盖改造 (REQ-24)
- **用户诉求与需求背景**：
  1. **主流程调用缺失**：此前 `run.sh` 中已定义 Nginx 配置文件生成函数与 SSL 证书生成逻辑，但仅在独立子命令 `add_nginx` 中调用，日常主启动流程 `start_docker`（传统版为 `start` / `restart`）未进行自动调用，导致容器启动后外部 HTTPS 443 反代配置与证书并未同步就绪，仍需手动执行 `add_nginx`。
  2. **证书误覆盖风险**：原有 SSL 证书生成逻辑与 Nginx 配置生成耦合，且在无任何提示的情况下直接调用 OpenSSL 覆盖写入。若宿主机环境已经部署了有效的第三方商业证书或已有证书，存在被强行冲掉覆盖的隐患。
- **排查与重构设计**：
  1. **函数职责清晰解耦**：
     - 将 SSL 证书生命周期管理抽取为独立的 `gen_ssl_cert()` 函数，专职负责证书目录准备、绝对路径规范化、多域名 SAN 扩展列表解析及证书/私钥文件安全校验；
     - `gen_nginx_config()` 专职负责渲染宿主机 Nginx 反向代理配置（Docker 版写入 `/opt/service/nginx/conf.d/mengya_docker_ssl.conf`，传统版写入 `mengya_ssl.conf`），两函数职责单一独立。
  2. **交互式防误覆盖安全机制**：
     - 在写入/更新证书内容之前，输出当前目标证书（`$CERT_FILE`）与私钥（`$KEY_FILE`）的物理绝对路径，清晰说明当前操作对象与覆盖后果；
     - 通过 `read -p` 询问用户：
       - 若用户输入 `y`/`Y`/`yes`：执行原有 OpenSSL 自签名证书生成逻辑（覆盖写入证书与私钥）；
       - 若用户输入 `n` 或直接回车（默认安全策略）：绝不改动已有文件内容；若文件物理上尚不存在，则仅执行 `touch` 生成空占位文件，保证文件物理存在以防 Nginx 配置校验或启动缺失报错。
  3. **主流程按序补全调用**：
     - 在 Docker 版 `start_docker()` 中，在 `cleanup_cache` 与 `check_docker_env` 之后、在容器正式启动 `$compose up -d` 之前，依次调用 `gen_ssl_cert` 与 `gen_nginx_config`；
     - 在传统版 `run.sh` 的 `start` 与 `restart` 启动主流程中，同样在启动前后端服务前依次调用 `gen_ssl_cert` 与 `gen_nginx_config`；
     - 子命令 `add_nginx` 同步调整为顺序调用 `gen_ssl_cert` 与 `gen_nginx_config`。
- **验证与效果**：
  - 两套代码的 `run.sh` 脚本均通过 `bash -n` 静态语法校验。
  - 用户启动时自动打通 Nginx 443 SNI 反代闭环，同时具备可靠的证书防覆盖安全保护。

### 12.25 POSIX 标准兼容与 sh 启动无缝自愈重入改造 (REQ-25)
- **用户诉求与需求背景**：
  - 用户在 Linux（特别是 Ubuntu / Debian 等主流发行版）环境使用 `sh run.sh status` 或 `sh run.sh <cmd>` 调用脚本时，触发了由于 `/bin/sh -> /bin/dash` 导致的底层语法报错：
    1. `run.sh: 26: Bad substitution`：`dash` 不支持数组下标扩展语法 `${BASH_SOURCE[0]}`；
    2. `run.sh: 65: [[: not found`：`dash` 不支持 Bash 专有的 `[[ ... ]]` 条件关键字（作为外部程序查找失败，连续报错 4 次）；
    3. `run.sh: 427: Syntax error: "(" unexpected`：`dash` 完全不支持数组类型声明 `EXTRA_ARGS=()`，预解析阶段即语法崩溃；
    4. 潜在交互报错：`dash` 内置的 `read` 不支持 `-p` 参数选项。
- **排查与重构设计（双保险策略）**：
  1. **顶层环境自适应重入**：在脚本第 2 行添加自愈检测，若当前环境非 Bash（`[ -z "$BASH_VERSION" ]`）且宿主机已安装 `bash`，自动通过 `exec bash "$0" "$@"` 透明提权切换为 bash 进程执行。
  2. **语法底层全面 POSIX 标准化（彻底去 Bashism）**：
     - **脚本路径获取**：将 `${BASH_SOURCE[0]}` 替换为兼容 POSIX 的 `"${BASH_SOURCE:-$0}"`，在兼顾被 source 场景的同时根除数组下标；
     - **绝对路径智能匹配**：将 `resolve_abs_path()` 中的 `[[ ... == ... ]]` 改用 POSIX 原生 `case "$target" in /*|[A-Za-z]:*)` 模式匹配，完美支持 Linux 根路径与 Windows 盘符；
     - **参数累加机制**：移除 `EXTRA_ARGS=()` 与 `+=`，改用标准字符串累加 `EXTRA_ARGS="${EXTRA_ARGS:+$EXTRA_ARGS }$1"`，彻底消除语法解析错误；
     - **交互输入优化**：将 `read -p` 优化为跨 Shell 通用的 `printf "提示文案: "; read choice`。
- **验证与效果**：
  - 无论用户通过 `./run.sh`、`bash run.sh` 还是 `sh run.sh` 形式调用任何子命令，均零报错、零警告、100% 顺畅执行。
