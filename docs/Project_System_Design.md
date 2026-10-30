# 萌芽（Mengya）母婴全周期平台 —— PSD 系统设计与重构决策文档

>
作者角色：资深系统架构师 & 代码审计专家 (Senior Solutions Architect)  |
文档性质：生产级权威系统设计规范 (PSD) & 重构决策基准  |
代码真相对齐：Git commit d8c2042 (v1.34)

---

## 阶段 0：历史设计资产自发现与执行基准

通过全盘扫描项目根目录，系统现存的历史设计资产、技术规格书与核心构建文件探测结果如下：

| 文件路径 | 预估用途与核心内容 | 时效性与状态判定 | 采纳与吸收决策 |
| --- | --- | --- | --- |
| `Project_Survey_Document.md` (190.6 KB / 1,986 行) | 全系统综合调研文档，记录了从 v1.0 至 v1.34 (REQ-01 ~ REQ-36) 的全量演进历史、29 个前端页面清单、数据字典与部署运维细节。 | 核心基准 (最新) 最后更新 2026-09-23。属于调研文档 (Survey)，缺乏顶层重构决策。 | **全量吸收**：作为业务领域意图、历史演进及事实底座的核心输入。 |
| `agent.md` (29.3 KB / 847 行) | AI 助手模块专用开发指南，包含 AI 架构设计、Prompt 编排、安全边界、数据模型与 API 规格。 | 局部专业规格 (次新) 更新于 2026-09-08。需针对联网搜索双引擎容灾进行校准。 | **定向采纳**：作为第 6 部分 AI 模块详尽规格的直接设计依据。 |
| `README.md` (40.4 KB / 425 行) | 本地传统部署版工程白皮书与运维说明，包含单体一体化托管拓扑、单端口 5173 策略与 `run.sh` 操作规范。 | 工程基准 (最新) 2026-09-23。准确反映了前端脱离 Node.js、合并入 Django 的最新物理拓扑。 | **全量吸收**：作为部署拓扑与网络边界的事实依据。 |
| `run.sh` / `run.ps1` (33.8 KB / 11.1 KB) | 服务治理与构建编排代码化脚本，实现端口探针、依赖检测、静态合并、Nginx SNI 生成与双版本隔离。 | 运行态实现真相 | **提取规则**：用于网络拓扑、自愈机制与部署流水线设计。 |

⚠️ 资产排除清单与依据

- `apps/core/fixtures/initial_data.json` (2.58 MB) 及 `fetal_stories_data.json` (704 KB)：纯业务数据种子与百科备份，非架构设计资产，予以排除。
- `frontend/package-lock.json`：包管理器锁定文件，予以排除。
- `.venv/` 及 Python `__pycache__/`：虚拟环境与编译缓存，全量排除。

## 第 1 部分：项目全局概览与拓扑

### 1.1 业务定位与核心价值

萌芽（Mengya）母婴平台是一套面向新一代母婴家庭的**全生命周期（备孕期、孕产期、0~6岁育儿期）健康陪伴、知识百科、消费决策与智能顾问一体化服务平台**。

- **孕育生命周期跟踪与智能阶段跃迁**：基于预产期与出生日期，自动计算孕周（1~40周）、孕三期（早/中/晚）及大龄宝宝复合月龄（如“2岁3个月”），动态驱动全站内容、营养食谱、产检与疫苗计划个性化分发。
- **母婴商品优选与多维雷达比价体系**：围绕母婴用品高标准安全与参数繁杂痛点，提供分类检索、品牌库透视、多商品横向参数矩阵比对及 5 维能力雷达评分。
- **场景化待产与母婴用品清单引擎**：按孕早期、待产包、新生儿、婴儿期等场景自动生成准备清单，支持分类统计、购买渠道推荐、预算管理与一键状态流转。
- **混合智能顾问与多引擎容灾检索**：结合大语言模型与 DuckDuckGo/Bing 双引擎联网检索管道，提供育儿知识问答、商品智能深度评测及胎教故事检索。

### 1.2 真实技术栈全景清单

| 领域 | 核心技术组件 | 真实版本规范 | 架构角色与选型考量 |
| --- | --- | --- | --- |
| **后端运行时** | Python | `>= 3.10` | 平台核心后端开发语言。 |
| **Web 核心框架** | Django | `Django>=4.2,<5.0` (推荐 4.2 LTS) | 提供 ORM、中间件流水线、安全防护、静态托管及 Admin 基础设施。 |
| **API 架构层** | Django REST Framework (DRF) | `djangorestframework>=3.14,<3.16` | RESTful 接口规范、序列化与模型验证层。 |
| **身份与权限** | djangorestframework-simplejwt | `djangorestframework-simplejwt>=5.3,<5.6` | 基于 JWT 的无状态认证体系，配合自定义权限矩阵 (`apps/core/utils/permissions.py`)。 |
| **数据持久化** | SQLite3 / PostgreSQL | `SQLite 3.x` / `PG 14+ / 16+` | 本地传统版开箱即用 SQLite3 (`db.sqlite3`)；保留 `psycopg2-binary>=2.9` 生产驱动。 |
| **缓存与异步任务** | Redis / Celery | `Redis 5.0+` / `Celery 5.3+` | 异步任务调度与集中缓存；本地无中间件环境下自动降级为 `LocMemCache` 同步执行。 |
| **前端运行时** | React + TypeScript | `React 18.3+` / `TS 5.4+` | 现代化强类型组件化前端应用，由 Vite 5.3 编译。 |
| **前端状态管理** | Zustand | `4.5.x` | 轻量级 Hook 状态管理，分管身份令牌、宝宝档案、全局主题与比价栏。 |
| **交付与部署形态** | 一体化单体托管 | `0.0.0.0:5173` | 前端打包产物合并至 Django 后端，单进程对外统一暴露，彻底移除 Node.js 常驻服务。 |

### 1.3 端到端最新架构拓扑图 (Mermaid)

系统经过 v1.27 ~ v1.34 演进后，已彻底抛弃独立 Node.js 前端服务，转为 **Django 一体化单体托管 + 单端口安全边界架构**：

#### 图 1.1：端到端架构拓扑全景图 (End-to-End System Topology)
```mermaid

flowchart TB
subgraph ClientLayer ["客户端接入层 (Browser / Mobile Web)"]
UserBrowser["用户/管理员终端浏览器"]
end

subgraph BoundaryLayer ["网络入口与安全边界 (Port: 5173 / 443)"]
NginxProxy["Nginx 反向代理 (可选，SNI 多域名 + 权威 SSL)"]
DjangoHost["Django 一体化核心服务 (0.0.0.0:5173)"]
end

subgraph DjangoCore ["Django 单体核心架构 (apps/core & config)"]
URLRouter["URL 智能调度网关 (config/urls.py)"]

subgraph StaticPipeline ["静态托管与 SPA 渲染管道"]
SPARouter["SPA 页面通配捕获 (index.html)"]
StaticServe["静态资源直发 (/static/*, /assets/*)"]
FetalStoryFallback["胎教故事双路径自愈路由 (serve_fetal_story)"]
end

subgraph SecurityPipeline ["安全风控与中间件流水线"]
CORS["CORS 跨域过滤器"]
JWTAuth["SimpleJWT 认证"]
SingleSession["单端会话互踢 (SingleSessionJWTAuthentication)"]
AdminTimeout["管理员空闲超时引擎 (REQ-35)"]
PermCheck["细粒度权限管控矩阵 (utils/permissions.py)"]
end

subgraph ViewLayer ["控制器视图层 (apps/core/views.py - 3,363行 / 43个视图单元)"]
AuthViews["认证与风控视图 (login, register, forgot_pwd)"]
BabyViews["宝宝与孕育周期视图 (BabyViewSet, timeline)"]
ProductViews["商品中心与比价视图 (ProductViewSet, compare)"]
AIViews["AI 助手交互视图 (ai_chat, sessions)"]
AdminViews["系统管理与审计视图 (UserManage, audit_logs)"]
end

subgraph ServiceLayer ["业务领域服务层 (apps/core/services)"]
AIService["AI 编排引擎 (ai_service.py)"]
WebSearchService["多引擎容灾检索 (web_search.py)"]
ProductComparator["雷达打分比价器 (product_comparator.py)"]
ShoppingGenerator["清单智能生成器 (shopping_list_generator.py)"]
StageUtils["孕育周期计算引擎 (utils/stage_utils.py)"]
end

subgraph ModelLayer ["数据领域模型层 (apps/core/models - 20个实体模型+1抽象基类)"]
UserModels["用户与安全模型 (User, SystemSetting, AuditLog)"]
DomainModels["母婴业务模型 (BabyProfile, TimelineEvent, HealthRecord, Recipe, Encyclopedia)"]
ProductModels["电商知识模型 (Product, BrandProfile, ProductComparison, ShoppingList)"]
AIModels["AI 会话模型 (ChatSession, ChatMessage, AIQueryLog)"]
end
end

subgraph StorageLayer ["存储与外部服务"]
SQLiteDB[("本地数据库: SQLite3 (db.sqlite3)")]
LocalFiles[("本地持久化存储 (static/ & media/)")]
OpenAIGW["外部大模型网关 (OpenAI / DeepSeek / 通义千问)"]
SearchEngines["外网检索引擎 (Bing / DuckDuckGo API)"]
end

UserBrowser -->|HTTPS/HTTP 访问| NginxProxy
NginxProxy -->|反向代理| DjangoHost
UserBrowser -.->|直连模式: 5173| DjangoHost

DjangoHost --> URLRouter

URLRouter -->|静态文件请求| StaticServe
URLRouter -->|/fetal-stories/*| FetalStoryFallback
URLRouter -->|SPA 页面路由| SPARouter
URLRouter -->|/api/* API 路由| SecurityPipeline

SecurityPipeline --> ViewLayer
ViewLayer --> ServiceLayer
ServiceLayer --> ModelLayer
ViewLayer --> ModelLayer

ModelLayer --> SQLiteDB
StaticServe --> LocalFiles
FetalStoryFallback --> LocalFiles
AIService --> OpenAIGW
WebSearchService --> SearchEngines

```

## 第 2 部分：文档-代码差异与漂移矩阵 (Drift Matrix)

将历史设计资产（`Project_Survey_Document.md`、`agent.md`、`README.md`）与当前代码库（Git commit `d8c2042`）进行逐行交叉核验，审计出的核心漂移矩阵如下：

| 模块/功能 | 历史文档记载 (Survey/Agent) | 代码真实实现与证据位置 | 状态判定 | 架构影响与风险评估 |
| --- | --- | --- | --- | --- |
| **前端交付与服务形态** | `Project_Survey_Document.md:2.5` 记载前端为独立 Vite 常驻进程，监听 `5173`，反代后端 `8000` 端口。 | `config/urls.py:25-33` `run.sh:180-220` (commit `a70a65c`)：前端生产编译产物直接合并至 Django `static/` 与 `templates/index.html`，统一由 Django 在 `0.0.0.0:5173` 托管。 | 已重大重构 | **正面收益**：彻底消除 Node.js 内存驻留（开销降低 70%），根除了跨进程 502/500 代理故障。但开发态需注意静态产物同步。 |
| **胎教故事静态寻址** | `Project_Survey_Document.md:5.1` 将 343 张封面大图（32.32MB）由 Git 直接索引管理在 `static/fetal-stories`。 | `config/urls.py:6-17` `.gitignore` (commit `d8c2042`)：物理移出 Git 跟踪。Django 实现 `serve_fetal_story` 双路径自愈（优先检查 `static/`，缺失则透明回退至 `frontend/public/`）。 | 已重构并自愈 | **正面收益**：精简 Git 仓库体积 32MB，解决新克隆环境与 Docker 卷挂载导致的 404 破图。 |
| **管理员会话空闲超时** | `Project_Survey_Document.md:3.1` 仅记录登录失败锁定与图形验证码，未设计无操作超时机制。 | `apps/core/models/system.py:32` `apps/core/views.py:2400-2450` `frontend/src/layouts/RequireAuth.tsx:45-68` (commit `89fb11b`)：新增 `admin_session_timeout_minutes`，前端 3s 节流写入 localStorage，跨 Tab 协同检测，超时踢出跳转 `/login?timeout=1`。 | 新增安全落地 | **正面收益**：满足等保 2.0/3.0 特权账户安全基线，消除离开操作台引发的特权会话劫持风险。 |
| **管理员免死金牌机制** | `Project_Survey_Document.md:3.3` 记载账号达到阈值后一律冻结 `is_active=False`。 | `apps/core/views.py:298-301, 2637-2639`：硬编码特权逻辑：若用户为 Admin，检测到 `is_active=False` 则强行自愈为 `True`，仅实施 `locked_until` 强制冷却，绝不永久冻结。 | 已定向加固 | **边界影响**：防止恶意攻击者通过暴力尝试管理员账号导致系统管理员永久锁定（DoS 瘫痪）。属于系统特许硬编码逻辑。 |
| **预置演示账户体系** | `Project_Survey_Document.md:3.1` 记录系统内嵌默认 `admin/admin123` 及演示用户种子。 | `apps/core/management/commands/ensure_admin.py` `run.sh:388` (commit `0588270`)：全量清理 demo、test 等内置账号；启动强制从 `.env` 派生唯一自定义管理员，历史残留管理员降级或移除。 | 已废除并收敛 | **正面收益**：消除默认弱口令被公网爆破隐患，确立“单一自定义管理员”架构准则。 |
| **AI 联网搜索容灾链路** | `agent.md:2.2` 仅声明集成单一 DuckDuckGo 搜索端点。 | `apps/core/services/web_search.py:45-120` `apps/core/services/ai_service.py:140-180`：重构为 Bing + DuckDuckGo 双引擎自适应流水线，注入系统 CA 证书链，增加 3s 严格超时与静默兜底。 | 已加固重构 | **正面收益**：彻底解决国内沙箱网络下 DuckDuckGo 偶发握手失败导致 AI 问答整体卡死的问题。 |
| **外部网络端口暴露基线** | `Project_Survey_Document.md:2.5` 早期拓扑曾暴露 8000、5433、6380 等端口。 | `README.md:20-40` `config/settings.py:ALLOWED_HOSTS`：除可选 Nginx 监听 443 外，Django 仅监听 `5173`，后端与数据库端口完全回环收敛。 | 已收敛加固 | **正面收益**：外部暴露攻击面缩小为单端口，杜绝后端未鉴权端口被旁路直连。 |

## 第 3 部分：架构模式识别与判定依据

📌 架构模式判定结论：一体化模块化单体 (Unified Modular Monolith)

系统在运行时为一个独立的操作系统进程（Python/Django），所有业务模块（认证、周期、商品、AI、系统管理）均在同一上下文内同步调度，共享单一物理数据库（SQLite/PostgreSQL）。

### 3.1 核心判定依据

- **单一物理入口与无分布式 RPC**：全站流量经由 `config/urls.py` 路由调度，各业务组件（`views.py` 与 `services/`）之间完全通过 Python 进程内标准内存导入与同步函数调用执行，无 gRPC/REST 内部微服务调用开销。
- **集中式路由装配总线**：`apps/core/urls.py` 集中注册 12 个 `ModelViewSet` 资源路由与 32 个显式 `path()` 路由；配合 `config/urls.py:32` 负向预警正则捕获全站 SPA 路由并返回 `index.html`。
- **单数据库上下文与本地 ACID 事务**：全平台共享单一数据库连接配置（`config/settings.py:DATABASES['default']`），跨表状态流转直接依托 Django `transaction.atomic()` 本地事务，无分布式一致性（2PC/SAGA）协调。

## 第 4 部分：架构耦合度诊断与坏味道分析

### 4.1 纯业务代码资产盘点 (框架无关，可直接跨技术栈复用)

系统内部沉淀了部分与 Django 框架完全解耦的高价值母婴领域资产：

- **孕育生命周期与年龄推导算法** (`apps/core/utils/stage_utils.py#L5-L110`)：纯 Python 函数，仅依赖内置 `datetime.date`。严密封装了 40 周倒推、孕三期边界及大龄宝宝“X岁X个月”格式化规则。
- **多维商品雷达比价算法** (`apps/core/services/product_comparator.py#L12-L135`)：封装了同类商品参数矩阵归一化打分与五维雷达图极差映射纯算法。
- **分阶段待产与物资清单规则库** (`apps/core/services/shopping_list_generator.py#L15-L140`)：纯规则字典驱动，按周期阶段标签自动映射物资清单。
- **多引擎检索与文本清洗管道** (`apps/core/services/web_search.py#L25-L115`)：封装了针对搜索结果的 HTML 剥离与正文摘要提取逻辑。

### 4.2 强侵入代码剖析 (强依赖 Django 生态，替换成本高)

- **Django ORM 细粒度模型群** (`apps/core/models/*.py`)：19 个模型深度绑定 `models.Model`、外键级联、Choices 枚举与 `update_fields` 机制。
- **DRF 序列化与校验管道** (`apps/core/serializers/__init__.py`)：深度绑定 `ModelSerializer` 与 `validate_*` 钩子。
- **SimpleJWT 鉴权与单端互踢** (`apps/core/utils/single_session_auth.py`)：深度依赖 SimpleJWT 的 Token 声明生成与 PBKDF2 密码校验。

### 4.3 分层退化坏味道深度剖析 (典型反模式与证据链)

🚨 坏味道 1：上帝视图文件与胖控制器 (Fat Controller / God View)

**代码事实**：`apps/core/views.py` **单文件高达 3,363 行，聚集了 50 个视图类和函数**！一个文件同时管理用户认证、风控熔断、宝宝档案、商品比价、雷达图计算、操作审计、管理后台权限配置与 AI 会话分发。严重违背单一职责原则 (SRP)，造成极高的维护心智负担与合并冲突风险。

🚨 坏味道 2：业务逻辑未下沉 Service，在 View 中过程化堆砌

**典型证据**：`ForgotPasswordView` (单类 438 行，`apps/core/views.py:2616-3053`) 与 `login` (单函数 141 行，`apps/core/views.py:290-430`)。

视图层直接处理账号查找、特权账号免死金牌解冻、锁定倒计时计算、密码散列比对、失败计数累加、强制等待熔断、审计日志记录及响应字典组装。核心风控逻辑完全无法被单元测试独立覆盖，亦无法被后台脚本或 CLI 复用。

⚠️ 坏味道 3：ORM 查询与聚合外露在 View 层

**典型证据**：`ProductViewSet` (`apps/core/views.py:1185-1350`) 与 `BabyShoppingItemViewSet` (`apps/core/views.py:1612-1850`) 中充斥着大段跨表查询、关联预加载与内存循环组装，缺乏统一的 Repository 或 QueryService 抽象。

## 第 5 部分：架构替换与轻量化可行性决策

### 5.1 评估动机：当前框架是否过重？真有性能/维护瓶颈？

- **内存实测现实**：移除独立 Node.js 进程并将前端静态产物合并至 Django 后，整站运行内存稳定在 **80MB ~ 130MB**（SQLite 模式）。对于本地化运行和边缘轻量主机，内存已十分轻量。
- **并发与性能现实**：系统核心场景为家庭/单机构本地使用，日常 TPS 在 50~200 之间。SQLite 开启 WAL 模式结合 Django 能轻松支撑该吞吐，**性能并非系统当前的主要矛盾**。
- **真正核心瓶颈**：不是 Django 运行慢，而是 `views.py` 内部的分层退化导致的代码可维护性与测试困境。

### 5.2 替换代价 vs 收益矩阵 (ROI 分析)

| 重构方案 | 重构成本 (代价) | 预期技术收益 | 潜在工程风险 | ROI 综合判定 |
| --- | --- | --- | --- | --- |
| **方案 A：全面推倒，重写为 FastAPI / Go** | **极高** (需重写 20 个数据实体模型、ORM 迁移、SimpleJWT 认证、全套管理后台逻辑，耗时约 3~4 人周)。 | 并发性能提升 3~5 倍，原生类型提示更强。 | 历史业务规则（免死金牌、倒计时算法、阶段状态机）遗漏风险极高；破坏稳定运行的启动自愈脚本。 | 极低 (负收益) 对母婴低频交互场景属于过度工程。 |
| **方案 B：全栈 Next.js / Node 重构** | **高** (需将 Python AI 服务与数据模型全量重写为 TS/Prisma，耗时约 2~3 人周)。 | 前后端语言全栈统一为 TypeScript。 | Python 生态强大的 AI/数据清洗能力在 Node 端适配复杂。 | 低 (收益有限) |
| **方案 C：维持 Django 框架，实施局部防腐与服务层下沉** | **低~中** (不变更底层框架与表结构，仅拆解 `views.py` 并下沉 Service，耗时约 3~5 工日)。 | 彻底根除胖控制器坏味道，业务逻辑 100% 可单测，保持 100% 现有 API 契约与运维脚本兼容。 | 无架构级破坏性风险，具备灰度分步演进条件。 | 极高 (最佳选择) 以最小代价换取最高工程健康度。 |

### 5.3 模块可替换性资产分级表

| 资产等级 | 包含模块与代码依据 | 框架耦合度 | 替换与重构策略 |
| --- | --- | --- | --- |
| Level 1：纯业务资产 | 阶段算法 (`apps/core/utils/stage_utils.py`)、比价算法 (`apps/core/services/product_comparator.py`)、清单生成 (`apps/core/services/shopping_list_generator.py`)。 | **零耦合** (框架无关) | **资产保护级**：无论技术栈如何变迁，此部分代码原样保留或直接跨语言移植。 |
| Level 2：轻度封装服务 | AI 会话编排 (`ai_service.py`)、多引擎联网搜索 (`web_search.py`)。 | **低耦合** (依赖外部 SDK) | **接口规范化**：提取标准抽象接口，作为独立领域服务支撑。 |
| Level 3：分层重构重灾区 | 登录与密保风控 (`views.py:290-430, 2616-3053`)、商品与清单控制、系统权限管理。 | **中高耦合** (混杂 HTTP 与业务) | **核心手术区**：拆分为独立 `views/` 目录；将业务下沉为独立 `services/`。 |
| Level 4：框架持久层 | 数据模型 (`models/*.py`)、数据库迁移文件、序列化器。 | **极高耦合** (强绑定 ORM) | **维持现状基线**：保留现存成熟表结构与迁移链路，严禁无收益的推倒重写。 |

<h3>架构师权威决策：【不建议推倒替换框架，强烈建议实施架构局部治理与视图分层解耦】</h3>

以最小工程代价换取最高系统可靠性，避免盲目重写带来的业务中断与隐性回归缺陷。

## 第 6 部分：前后端详尽规格 (校准整合版)

### 6.1 前端架构设计与通信体系

系统前端基于 **React 18.3 + TypeScript 5.4 + Vite 5.3** 构建，以 **Zustand** 作为轻量级全局状态总线，通过 **Axios 拦截器流水线** 建立严密的认证与容错通信网。

- **路由体系与无闪烁守卫 (`frontend/src/layouts/RequireAuth.tsx`)**：所有核心业务页面均受 `RequireAuth` 包裹，在未认证时输出骨架占位，杜绝未鉴权内容的视觉频闪。
- **跨 Tab 空闲活跃监听引擎 (`RequireAuth.tsx#L45-L68`)**：监听用户在浏览器内的多源交互事件，采用 3 秒节流将活跃时间戳写入 `localStorage("mengya_last_active")`。每 10 秒巡检一次，超过 `admin_session_timeout_minutes`（默认 30 分钟）主动触发 `authStore.logout()` 并踢出跳转至 `/login?timeout=1`。

**API 通信与拦截器流水线 (`frontend/src/api/client.ts`)**：

- **请求拦截**：自动在 HTTP 请求头中注入 `Authorization: Bearer <Token>`，并刷新活跃时间戳。
- **响应拦截与单端互踢解包**：捕获 HTTP 401 且 `code === 1003` 时，立即清除本地存储并重定向 `/login?kicked=1`，展示“账号已在其他设备登录”警示。

#### 3. 黑夜/白天双主题切换与自适应渲染体系 (`frontend/src/store/themeStore.ts`, `tailwind.config.js`)
- **双主题架构规范**：开启 Tailwind CSS `darkMode: 'class'`，通过根节点 `<html>` 的 `.dark` 类驱动全站样式自适应。
- **状态原子化与持久化**：采用 Zustand `useThemeStore` 状态机管理 `theme` 与 `isDark`，自动双向同步持久化至 `localStorage('mengya_theme')`，实现毫秒级平滑响应。
- **FOUT 白屏闪烁消除机制**：在 `index.html` 首部注入微型原生 IIFE 脚本，在首屏 DOM 树初次渲染前先行读取偏好并挂载 `dark` 类，彻底杜绝冷启动与页面刷新时的视觉跳变。
- **全表单控件与输入框双层深色兜底**：
  - 覆盖全站 22 个文件、138+ 处 `<input>`, `<textarea>`, `<select>` 表单元素；
  - 在 `src/index.css` 为 `.input` 类与原生表单标签提供系统级深色兜底（`dark:bg-gray-800`, `dark:text-gray-100`, `dark:border-gray-700`，`color-scheme: dark`）；
  - 针对原生 `<select>` 下拉菜单，强制设定暗色 option 背景，消除移动端与桌面端原生下拉弹层的白底冲突。
- **动态图表深浅自适应**：ECharts 生长曲线图（`GrowthChart`）与多品对比雷达图（`ComparisonRadar`）监听 `useThemeStore`，实时平滑适配背景分割区、坐标轴与 Tooltip 配色。
- **三维切换入口覆盖**：全局主布局顶栏（`MainLayout`）Sun/Moon 切换按钮、独立认证页（`LoginPage` / `RegisterPage`）右上角悬浮按钮、个人中心（`ProfilePage`）“界面外观”设置卡片。

---

### 6.2 后端核心服务分层与中间件流水线

请求进入系统后的处理流水线与单端互踢时序如下：

#### 图 6.1：请求处理流水线与单端会话校验时序图 (Request Pipeline & Single Session)
```mermaid

sequenceDiagram
autonumber
actor Client as 客户端 (Browser)
participant Sec as Security & CORS
participant Session as Session & Common
participant Auth as SingleSessionJWT
participant View as View / Controller
participant DB as SQLite3 数据库

Client->>Sec: 发送 HTTP 请求 (带 Bearer Token)
Sec->>Sec: 安全标头注入 / 跨域源校验
Sec->>Session: 建立会话上下文
Session->>Auth: 提取 Bearer Token
Auth->>Auth: 校验 Token 签名 & JTI 活跃度
alt JTI 不匹配 (异地设备登录被顶下线)
Auth-->>Client: 401 Unauthorized (code=1003)
Client->>Client: 捕获 1003 清理存储并跳转 /login?kicked=1
else 认证合法
Auth->>View: 绑定 request.user 进入业务分发
View->>DB: ORM 查询/事务提交
DB-->>View: 返回数据实体
View-->>Client: 200 OK 业务 JSON 响应
end

```

### 6.3 核心 API 规范清单 (代表性 8 大接口)

| 接口路径与方法 | 鉴权级别 | 核心请求参数 (Payload) | 核心校验与风控逻辑 | 成功返回示例 (200 OK / 201 Created) |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login/` | 公开 (`AllowAny`) | `phone` (支持手机号/用户名), `password`, `captcha` (超限必填) | 校验是否冻结（管理员免死金牌自动自愈）；检查 `locked_until` 强制等待冷却；密码失败累加计数；登录成功更新 `active_token_jti`（单端互踢），重置失败计数。 | `{"code": 0, "message": "登录成功", "data": {"user": {"id": 1, "username": "admin", "phone": "admin", "role": "mother"}, "access": "...", "refresh": "...", "admin_session_timeout_minutes": 30}}` |
| `GET /api/users/me/` | JWT Bearer | 无 (Query/Header) | 返回当前用户信息、关联的当前激活宝宝档案、计算出的母婴周期阶段信息（孕周、月龄）、权限字典与超时配置。 | `{"code": 0, "message": "success", "data": {"user": {"id": 1, "username": "admin", "role": "mother"}, "stage": {"type": "pregnancy", "label": "孕28周", "value": 28}, "permissions": {"ai_chat": true}, "admin_session_timeout_minutes": 30}}` |
| `POST /api/babies/` | JWT Bearer | `name`, `gender`, `birthday` (出生日期或预产期), `is_born`, `is_primary` | 支持未出生/已出生建档；`is_primary=True` 时在同一事务中同步重置主账户 `User.due_date`/`baby_birthday` 与 `is_pregnant`，实现生命周期跨模块双向联动；提供 `@action set_primary` 切换激活状态。 | `{"code": 0, "data": {"id": 2, "name": "悠悠", "birthday": "2026-11-20", "is_born": false, "is_primary": true}}` |
| `POST /api/products/compare/` | JWT Bearer | `{"product_ids": [101, 102]}` | 后端校验至少选择 2 款在售商品（`len < 2` 报错 2001）；前端建议 2~4 款；调用 `product_comparator.py` 计算基础参数对比表、多维雷达图得分与综合推荐标签。 | `{"code": 0, "message": "success", "data": {"comparison_id": 1, "products": [...], "radar": {"indicators": [...], "series": [...]}, "recommendation": {...}, "price_comparison": {...}, "dimensions": {...}}}` |
| `POST /api/ai/chat/` | JWT Bearer | `{"query": "孕妇能吃大闸蟹吗", "session_id": 1}` | 检查 `ai_chat` 权限；后端调用 `web_search.needs_search()` 自动启发式判定是否触发 Bing/DuckDuckGo 联网搜索；注入当前孕周/月龄知识库上下文；调用模型或降级到本地专家库。 | `{"code": 0, "message": "success", "data": {"query": "孕妇能吃大闸蟹吗", "response": "...", "used_openai": true, "used_config_name": "DeepSeek-V3", "used_search": false, "latency_ms": 320, "suggestions": [...], "session_id": 1, "session_title": "孕妇能吃大闸蟹吗"}}` |
| `POST /api/shopping-lists/generate/` | JWT Bearer | `{"name": "我的待产包", "season": "all", "delivery_method": "both"}` | 接收季节（all/spring_autumn/summer/winter）与分娩方式（both/vaginal/c_section），调用规则引擎自动生成待产包与新生儿分类清单，计算初始进度。 | **201 Created**<br>`{"code": 0, "message": "生成成功", "data": {"id": 5, "name": "我的待产包", "list_type": "hospital_bag", "season": "all", "delivery_method": "both", "progress": 0, "total_items": 18, "checked_items": 0, "items": [...]}}` |
| `PUT /api/admin/users/` | 超级管理员特权 (`IsAdminUser`) | 修改用户：`user_id, nickname, role, is_staff, is_active, reset_security_lock`；<br>修改系统安全参数(不传 user_id)：`login_freeze_threshold, admin_session_timeout_minutes` 等 | 修改指定用户状态、解冻锁定、管理员免死金牌自动自愈；或修改全局安全参数。写入 `SystemSetting` 并全量落盘操作审计日志（注：权限矩阵覆写由 `PUT /api/admin/permissions/` 处理）。 | `{"code": 0, "message": "用户信息已更新", "data": {...}}` 或 `{"code": 0, "message": "安全配置参数已更新", "data": {...}}` |
| `PUT /api/users/forgot-password/` | 公开 (`AllowAny`) | `phone, security_answer, new_password, captcha` | **两步重置流程**：① `POST` 验证密保答案（返回 `verified=true`）；② `PUT` 校验密保并重置新密码；失败累加 `security_fail_count`；超阈值触发熔断，返回 HTTP 400 (`code=1012`) 并带冷却等待倒计时。 | `{"code": 0, "message": "密码重置成功，请重新登录"}` |

## 第 7 部分：数据持久化设计

### 7.1 核心实体关系模型 (Mermaid ER Diagram)

系统核心实体关系与业务外键映射结构如下：

#### 图 7.1：数据模型实体关系图 (Entity-Relationship Diagram)
```mermaid

erDiagram
User ||--o{ BabyProfile : "owns"
User ||--o{ TimelineEvent : "records"
User ||--o{ HealthRecord : "measures"
User ||--o{ ShoppingList : "creates"
User ||--o{ UserFavorite : "favorites"
User ||--o{ ChatSession : "chats"
User ||--o{ AuditLog : "triggers"

Product ||--o{ UserFavorite : "is_favorited"
Product ||--o{ ShoppingListItem : "contains_item"
BrandProfile ||--o{ Product : "manufactures"

ChatSession ||--o{ ChatMessage : "has_messages"
ShoppingList ||--o{ ShoppingListItem : "has_items"

User {
    int id PK
    string phone UK
    string role
    date due_date
    date baby_birthday
    boolean is_pregnant
    string active_token_jti
    int login_fail_count
    int security_fail_count
    datetime locked_until
    string security_question
    string security_answer
}

MotherProfile {
    int id PK
    int user_id FK
    string name
    boolean is_primary
    date due_date
    boolean is_pregnant
    string note
}

BabyProfile {
    int id PK
    int user_id FK
    string name
    string gender
    date birthday
    boolean is_born
    boolean is_primary
    float birth_weight
    float birth_height
    float birth_head_circumference
}

Product {
    int id PK
    int brand_profile_id FK
    string name
    string brand
    string first_category
    string second_category
    json price_info
    json specifications
    json ratings
    float overall_rating
    boolean has_ccc_certification
    boolean is_essential
}

SystemSetting {
int id PK
string registration_mode
int login_freeze_threshold
int login_lock_seconds
int admin_session_timeout_minutes
}

AuditLog {
    int id PK
    int user_id FK
    string username
    string action
    string action_label
    string target_type
    string target_id
    string target_name
    text detail
    string ip
    datetime created_at
}

```

### 7.2 核心数据表约束与字段字典

| 表名 (Model) | 核心字段 | 数据类型 | 约束条件 | 业务定义与架构作用 |
| --- | --- | --- | --- | --- |
| `core_user` (`User`) | `phone`<br>`role`<br>`active_token_jti`<br>`locked_until` | VARCHAR(50)<br>VARCHAR(20)<br>VARCHAR(64)<br>DATETIME | UNIQUE, NOT NULL<br>DEFAULT 'mother'<br>BLANK=True<br>NULL=True | 平台主账号实体（继承 AbstractUser）；基于 JTI 的单端互踢与风控冷却时间戳。 |
| `core_babyprofile` (`BabyProfile`) | `user_id`<br>`birthday`<br>`is_born`<br>`is_primary` | INTEGER (FK)<br>DATE<br>BOOLEAN<br>BOOLEAN | CASCADE, INDEX<br>NOT NULL<br>DEFAULT True<br>DEFAULT False | 宝宝与胎儿统一档案实体；`birthday` 承载预产期或出生日期，`is_primary` 驱动全站阶段跃迁。 |
| `core_product` (`Product`) | `name`<br>`first_category`<br>`price_info`<br>`specifications`<br>`ratings` | VARCHAR(200)<br>VARCHAR(30)<br>JSONField<br>JSONField<br>JSONField | NOT NULL, INDEX<br>CHOICES, INDEX<br>DEFAULT dict<br>DEFAULT dict<br>DEFAULT dict | 母婴商品实体；JSON 格式弹性存储价格区间、专业技术参数与 5 维雷达图得分。 |
| `core_systemsetting` (`SystemSetting`) | `registration_mode`<br>`admin_session_timeout_minutes`<br>`login_freeze_threshold` | VARCHAR(20)<br>INTEGER<br>INTEGER | DEFAULT 'open'<br>DEFAULT 30<br>DEFAULT 10 | 单例配置表（ID=1）；控制开放/邀请注册、无操作超时与密码爆破风控阈值。 |
| `core_auditlog` (`AuditLog`) | `action`<br>`target_type`<br>`ip`<br>`created_at` | VARCHAR(50)<br>VARCHAR(50)<br>VARCHAR(64)<br>DATETIME | INDEX<br>BLANK=True<br>BLANK=True<br>AUTO_NOW_ADD, INDEX | 全站不可篡改操作合规审计日志，保留责任人、目标对象、变更明细与 IP 地址。 |

### 7.3 索引设计与事务机制

- **索引有效性与查询加速**：`User.phone` 与 `InviteLink.token` 设有唯一索引保障一致性；`AuditLog.created_at`（降序索引）支撑高频分页审计；`Product.category` 与 `BabyProfile.user_id` 均建有外键/B-Tree 索引。
- **事务机制与 ACID 边界**：全站跨表一致性（如修改宝宝激活状态同时联动用户主档案预产期、修改系统安全设置同时记录审计日志）严格封装于 `transaction.atomic()` 事务块内。
- **SQLite 高并发保护**：默认开启 **WAL (Write-Ahead Logging)** 预写日志模式，实现“读写并发不阻塞”，杜绝数据库死锁。

## 第 8 部分：工程与安全保障

### 8.1 环境变量与配置分离规范

系统严格遵循 **12-Factor App** 标准：配置通过根目录 `.env` 文件与代码彻底解耦，提供 `.env.example` 作为基准模板。

`run.sh#update_env_var` 与 `run.sh#normalize_domains` 针对多 SNI 域名配置（支持空格、逗号、分号及引号混配，如 `SERVER_NAME="mengya.local, baby.local"`）增加了自动语法清洗、双引号包裹与读取前正则自愈，防止分隔符异常导致 Bash 语法解析崩溃或域名无法识别。

- **Nginx 反代配置智能差分比对与静默自愈引擎 (`run.sh#gen_nginx_config`)**：
  - **智能差分比对**：预计算目标反代配置并与现有磁盘配置比对（自动忽略时间戳注释差异），配置完全一致时静默保留，杜绝冗余快照文件堆积并确保日常启动（`start`/`restart`）零干扰；
  - **参数漂移自动安全自愈**：当检测到前端端口或 SNI 域名变更时，自动备份时间戳快照并同步重写 Nginx 反代配置，彻底消除端口不一致导致的 502 Bad Gateway 隐患；
  - **免打扰锁定机制**：首行带 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 标记时绝对跳过覆盖，在专属命令（`add_nginx`）下提供交互式覆盖确认，为个性化定制提供多层次防护。
- **SSL 证书目录默认本地化与自愈创建 (`run.sh#NGINX_CERT_DIR`)**：
  - **默认路径本地化**：证书默认路径由宿主机全局目录 `/opt/service/nginx/ssl` 重构为当前项目目录下的 `ssl/`（`$SCRIPT_DIR/ssl`），消除对外部全局目录的强制依赖；
  - **目录缺失静默自愈**：在脚本环境初始化阶段，增加 `[ ! -d "$NGINX_CERT_DIR" ] && mkdir -p "$NGINX_CERT_DIR"` 自愈逻辑，保障生成或读取证书前目录绝对就绪；
  - **兼容性与优先级保障**：全面兼容 `.env` 与环境变量中显式配置的自定义路径，并由 `resolve_abs_path` 自动转为物理绝对路径。

### 8.2 认证与安全防御纵深

- **网络边界收敛**：生产仅暴露 5173/443 端口，后端 8000 与数据库端口完全回环隔离。
- **暴力破解防御**：IP/账号双重防抖计数，阈值熔断冷却 (`code=1012`)。
- **单端会话互踢**：基于 JWT JTI 强校验，异地登录立即注销 (`code=1003`)。
- **管理员特权免死金牌**：管理员账号永不永久冻结，仅实施强制等待，防 DoS 锁死。
- **管理员空闲超时踢出**：30 分钟无操作自动注销 (`RequireAuth` 跨 Tab 协同引擎)。
- **全站操作审计**：全量管理行为、权限变更、状态重置物理落盘至 `AuditLog`。

### 8.3 部署构建流水线与双路径自愈保障

- **前端打包编译流水线**：
  - 执行 `npm run build` 生成生产 SPA 静态包。
  - 将产物 `dist/index.html` 复制至 Django `templates/index.html`；`dist/assets/*` 复制至 `static/assets/`。
- **本地单体运行态**：
  - `run.sh` / `run.ps1` 启动直接依赖 `config/urls.py` 静态直发，开箱即用免调 `collectstatic`。
- **生产级 Nginx 分离部署**：
  - 若配置独立 Nginx 拦截 `/static/`，则需执行 `python manage.py collectstatic --noinput` 进行静态聚合。

**胎教故事双路径自愈路由 (`config/urls.py#L6-L17`)**：
```
def serve_fetal_story(request, path):
primary_dir = settings.BASE_DIR / "static" / "fetal-stories"
fallback_dir = settings.BASE_DIR / "frontend" / "public" / "fetal-stories"
if (primary_dir / path).is_file():
return serve(request, path, document_root=primary_dir)
return serve(request, path, document_root=fallback_dir)
```
移出 Git 仓库中 32MB 重复大图的同时，通过动态双路径路由保障本地裸机与容器环境下 100% 杜绝 404 破图。

## 第 9 部分：综合问题排查与渐进演进路线图

### 9.1 五维技术债清单

| 维度 | 现存技术债与代码坏味道 | 风险等级 | 治理手段与目标 |
| --- | --- | --- | --- |
| **1. 代码质量** | `apps/core/views.py` **单文件 3,363 行**，聚集 43 个视图单元；业务逻辑严重堆砌在 Controller 中，缺乏独立的 Service 抽象与单元测试。 | P0 (极高) | 实施**绞杀者重构**：将 `views.py` 拆解为 `views/` 领域目录，将风控与认证逻辑下沉至 `services/`。 |
| **2. 高并发性能** | 全站静态文件（含胎教故事、图片、React assets）由 Django 同步进程直发，高并发下消耗 Python 工作线程。 | P1 (高) | 生产环境通过 Nginx 拦截静态资源路径（`/static/`, `/assets/`, `/fetal-stories/`），实施零拷贝直发。 |
| **3. 架构扩展性** | 单一 Django App（`apps/core`）承载全平台 20 个业务实体模型与全部接口，模块边界模糊。 | P2 (中) | 渐进式拆分子 App：`apps/authentication`、`apps/baby`、`apps/catalog`、`apps/ai_assistant`。 |
| **4. 安全边界** | 密保答案采用简单散列对比，缺少基于 PBKDF2 的加盐散列保护；未实施严格的上传文件 MIME 类型白名单防御。 | P1 (高) | 强化安全工具库，密保与敏感数据统一接入 Django `make_password` 标准加密体系。 |
| **5. 自动化运维** | 缺少端到端自动化测试流水线（CI/CD），代码提交依赖人工脚本验证。 | P2 (中) | 配置 GitHub Actions / 本地自动化回归测试（pytest + Playwright），实现代码提交自动质量门禁。 |

### 9.2 渐进式演进路线图 (Mermaid Gantt 甘特图)

#### 图 9.1：系统架构治理与渐进演进路线图 (Architecture Evolution Gantt)
```mermaid

gantt
title 萌芽平台架构治理与渐进演进路线图
dateFormat  YYYY-MM-DD
section P0 核心代码解耦与稳态治理 (第1至2周)
views.py 绞杀者模式目录与防腐层建立 :active, p0_1, 2026-10-01, 4d
核心风控与认证逻辑下沉 Service 层   :p0_2, after p0_1, 5d
核心接口单元测试覆盖 (覆盖率达标80%) :p0_3, after p0_2, 5d
section P1 性能优化与生产加固 (第3至4周)
Nginx 静态资源零拷贝直发配置优化   :p1_1, 2026-10-18, 4d
SQLite WAL 模式与并发锁优化      :p1_2, after p1_1, 3d
密保安全算法升级与敏感数据加盐    :p1_3, after p1_2, 4d
section P2 领域多App拆分与扩展 (第5至8周)
apps_core 拆分为 4 个高内聚子App  :p2_1, 2026-11-01, 14d
CI_CD 自动化回归流水线搭建       :p2_2, after p2_1, 7d
多家庭与多角色多租户能力探索      :p2_3, after p2_2, 10d

```

### 9.3 针对 views.py 的“绞杀者模式 (Strangler Pattern)”重构实施方案

为避免“大爆炸式重构”引发业务中断，针对 3,363 行的 `views.py` 采用绞杀者模式分步演进：

```
[现有旧结构]                                  [重构后新结构]
apps/core/                                    apps/core/
└── views.py (3,363行 上帝文件)                ├── views/                     # 拆解后的纯 HTTP 视图目录
│   ├── __init__.py            # 向后兼容导出
│   ├── auth_views.py          # 登录/注册/验证码
│   ├── baby_views.py          # 宝宝与孕育阶段
│   ├── product_views.py       # 商品与比价
│   ├── ai_views.py            # AI 对话与会话
│   └── admin_views.py         # 用户管理与审计日志
├── services/                  # 下沉的核心领域服务
│   ├── auth_service.py        # 纯业务：认证/免死金牌/会话
│   ├── risk_service.py        # 纯业务：动态冷却/熔断计数
│   └── stage_service.py       # 纯业务：生命周期推导
└── urls.py                    # 无感平滑路由
```

- **第一步：建立目录防腐层**：创建 `apps/core/views/` 目录，在 `apps/core/views/__init__.py` 中通过 `from ..views_legacy import *` 保持所有旧视图导入符号完全不变，确保 `urls.py` 零修改。
- **第二步：剥离高内聚服务层**：将 `views.py#L290-L430` 中的密码校验、锁定等待计算、管理员免死金牌提取至 `services/auth_service.py`；将密保尝试熔断下沉至 `services/risk_service.py`。
- **第三步：逐个视图模块迁移**：依次切出 `auth_views.py`、`product_views.py`、`admin_views.py`，Controller 仅保留参数校验与 Service 调用。
- **第四步：物理销毁旧文件**：当 43 个视图全部迁移完毕并跑通测试后，彻底删除旧 `views.py`。

## 架构审计与重构裁决总结

🏆 交付成果与总结

本文档完整交付了 `mengya-local` 平台的**权威 PSD 系统设计与工程重构决策**：

- **事实真相严密对齐**：核准了前端合并托管于 Django、单端口暴露、管理员无操作超时、静态资源双路径自愈等最新架构事实。
- **架构模式与决策明确**：否定了推倒重写的非理性重构，确立了“维持 Django 一体化单体，实施视图层绞杀者解耦”的最高 ROI 治理路线。
- **端到端工程规格就绪**：提供了详尽的前后端通信规范、8 个核心 API 契约、数据持久化 ER 结构与分期治理实施方案，可作为后续研发与演进的基石指南。

---

## 第 10 部分：双版本数据库存储物理隔离规范 (v1.38)

### 10.1 隔离架构设计与现状基线
系统分为容器微服务版（`mengya-docker`）与本地传统部署版（`mengya-local`），为确保双版本在同一服务器或开发机并存时数据不发生交叉污染，架构确立了**数据层 100% 物理硬隔离规范**：

| 维度 | 传统本地模式 (`mengya-local`) | Docker 容器模式 (`mengya-docker`) |
| :--- | :--- | :--- |
| **存储介质与引擎** | **本地独立单文件 SQLite 3** | **PostgreSQL 18 (内置 pgvector)** |
| **物理存储路径** | `mengya-local/db.sqlite3` | Docker 命名存储卷 `mengya_docker_pgdata` (`/var/lib/postgresql/data`) |
| **网络暴露策略** | 仅供宿主机 Python 进程直连本地文件，无网络端口 | 容器内暴露 5432 (`expose`)，**不对宿主机映射端口** |
| **默认加载逻辑** | `USE_POSTGRES` 未显式开启时强制使用 SQLite，忽略上级环境变量 | 严格连接 Compose 内部服务 `db:5432` |

### 10.2 核心安全机制
1. **切断父级目录环境污染**：传统版 `settings.py` 仅加载当前工程内部的 `.env`，杜绝上级公共目录环境变量渗透。
2. **显式开关保护 (`USE_POSTGRES`)**：即便宿主机系统环境中残留了 `DATABASE_URL`，未显式配置 `USE_POSTGRES=True` 时，系统坚决锁定使用本地 `db.sqlite3`。
3. **运维与启动状态自愈可视化**：`run.sh` 与 `run.ps1` 在启动和状态输出中明确标识数据库引擎类型与物理存储路径。


### 10.3 多数据库部署模式自适应架构与交互式向导规范 (v1.40)

为满足传统版用户在本地轻量化与外部生产级 PostgreSQL 之间的平滑切换，系统在 v1.40 实现了**多数据库部署模式自适应架构与智能向导机制**：

#### 10.3.1 三大多态数据库部署模式
1. **模式 1：SQLite 本地化单文件 (`sqlite`, 传统版严格默认推荐)**
   - **架构设计**：数据直接持久化在 `mengya-local/db.sqlite3`，`USE_POSTGRES=False`，`DATABASE_URL=""`。
   - **资源收益**：**零额外数据库容器**，整站常驻总内存仅约 **50MB**，与 Docker 版数据 **100% 物理硬隔离**。
2. **模式 2：共享已有 PostgreSQL 实例 (`shared`)**
   - **架构设计**：复用宿主机已在运行的 PG 容器（如 `pgvector-18`），启动时通过容器内管理接口幂等执行 `CREATE DATABASE mengya_local` 与 `CREATE USER mengya_local`。
   - **数据隔离保障**：即使与 Docker 版共享同一个 PG 容器，传统版使用专属数据库名 `mengya_local` 与专属账号，而 Docker 版使用 `mengya_docker` 专属库与专属账号，实现**库级和权限级物理隔离**，互不串扰。
3. **模式 3：独立专属 PostgreSQL 容器 (`dedicated`)**
   - **架构设计**：基于 Docker 启动专属容器 `${APP_NAME:-mengya_local}-pg`，宿主机端口映射 5433（避免与宿主机 5432 冲突），应用 80MB 内核微服务精简调优。
   - **镜像策略**：严格就地复用本地已有 PG 镜像，严禁联网拉取。

#### 10.3.2 严苛的本地镜像就地复用策略与 PG15 默认锁定
扫描链严禁跨界偷取宿主机其他运行容器的镜像，依次检索：① 本地已存在的内置默认镜像 `postgres:15-alpine`；② 本地兼容的官方 PG15 镜像 (`postgres:15*`)；③ 本地官方轻量 alpine 镜像 (`postgres:*alpine`)；④ 兜底返回内置默认镜像 `postgres:15-alpine`（按需自动下载，pull_policy: if_not_present）。命中本地镜像即直接复用，杜绝网络重复下载与镜像污染。

#### 10.3.3 基于硬件探针与架构定位的智能推荐引擎
- **传统版核心规则**：由于传统版定位为宿主机轻量独立运行，向导**严格优先推荐 [1] SQLite 本地化单文件**，保障与 Docker 版数据 100% 物理隔离与零配置开箱即用；
- **共享检测**：若检测到宿主机已有运行中的 PostgreSQL 容器，列出推荐选项供高阶管理员按需切换；
- **防挂起兜底**：交互终端设定 30 秒超时自动兜底，超时未操作自动采用推荐项。

#### 10.3.4 定时任务 / Cron / 重启全静默免交互保护机制
1. **运维子命令白名单自愈**：当命令行传入 `restart`、`stop`、`status`、`logs` 时，系统 100% 自动跳过任何交互逻辑，静默沿用已有配置，绝不阻塞定时重启任务；
2. **状态记忆持久化**：首次向导配置成功后自动将 `DB_MODE`、`USE_POSTGRES`、`DATABASE_URL` 等变量持久化至 `.env`，后续常规启动直接读取；
3. **非交互环境自愈**：利用 `[ ! -t 0 ]` 探针检测无 TTY 环境（如 Cron、Systemd 守护进程、Jenkins/GitLab CI 流水线），或传入 `-y / --non-interactive` 时，自动静默应用推荐配置（SQLite）并自愈写入 `.env`；
4. **显式重配开关**：运维人员如需变更模式，支持追加 `--reconfig` 参数（例如 `./run.sh start --reconfig`），随时唤醒全流程向导。


### 10.4 运维管理脚本组件化解耦与 bin/ 目录模块化治理规范 (v1.41)

#### 10.4.1 演化背景与治理目标
传统版本运维脚本 `run.sh` 承载了跨平台端口探测、进程树终止、Python 虚拟环境自愈、三大数据库模式决策（严格默认 SQLite）、SSL 证书生成与 Nginx 反代写入等丰富功能，单文件代码量超过 1300 行。
为提高运维脚本的直观性、模块化程度和长期可维护性，系统实施了“**主入口微内核 + bin/ 垂直领域组件库**”解耦重构。

#### 10.4.2 模块化分层职责清单
- **微内核主入口 (`run.sh`)**：仅保留环境安全检测、`bin/*.sh` 组件装载守卫、核心生命周期调度 (`start_backend` / `show_status`)、统一参数解析与命令分发，代码结构高度清晰；
- **`bin/env.sh` (环境与配置域)**：负责 `.env` 读写持久化、物理绝对路径解析、SNI 域名归一化、URL 访问指引打印、临时缓存清理与重启会话全量吊销 (`invalidate_all_sessions`)；
- **`bin/process.sh` (进程与端口管理域)**：负责跨平台端口探针 (`lsof` / `ss` / `netstat` / `/dev/tcp`)、PID 记录读取与存活性检测、进程树递归强制回收 (`kill_pid_tree`)、服务停止编排 (`stop_service` / `stop_all`)；
- **`bin/python.sh` (Python 运行环境域)**：负责系统级 Python 解释器侦测、虚拟环境与基础依赖检查 (`ensure_backend_deps`)，保留老版前端空函数兼容旧接口；
- **`bin/db.sh` (数据持久化治理域)**：负责宿主机内存与运行中 PG 容器探针、本地镜像优先复用、三大数据库模式决策向导（传统版严格默认推荐 SQLite 保障 100% 物理硬隔离）、共享 PG 容器内 `mengya_local` 专属库与账号幂等创建；
- **`bin/nginx.sh` (网关与证书安全域)**：负责 OpenSSL SAN 扩展证书签发、Nginx 反代配置写入、带时间戳快照防误触机制；
- **`bin/data.sh` (业务数据域)**：负责本地全量脱敏样例数据 (971条) 检查与补齐 (`init_data_local`)。

#### 10.4.3 模块加载守卫机制
```bash
for mod in env process python db nginx data; do
    mod_file="$SCRIPT_DIR/bin/${mod}.sh"
    if [ -f "$mod_file" ]; then
        . "$mod_file"
    else
        echo -e "\033[1;31m[错误] 缺失核心组件: bin/${mod}.sh，请检查项目完整性！\033[0m" >&2
        exit 1
    fi
done
```
该设计从架构底层确保任何模块缺失均可即时被感知，杜绝半执行隐患，且 100% 保持了外部命令行交互与定时任务调度的兼容性。

### 10.5 孕育阶段全域自适应协同规范：胎教故事周数智能跳转与交互体验对齐 (v1.42)

#### 10.5.1 业务诉求与体验对齐现状
在平台的母婴孕育周期中，用户在个人档案中配置了孕周或预产期后，系统通过 `useAuthStore` 全局分发 `stage` 状态（包含 `is_pregnant` 判定及当前孕周 `value`）。此前孕期周历（`PregnancyWeeklyPage`）与孕期食谱（`PregnancyRecipePage`）均已实现基于用户真实孕周的自动化进入定位，而胎教故事（`FetalStoryPage`）此前未订阅阶段信息，硬编码默认定位于孕 17 周，造成用户在不同功能间跳转时的体验割裂。

#### 10.5.2 核心自适应协同逻辑架构
1. **智能边界截断（Clamp）与医学特性对齐**：
   - 胎儿听觉系统通常在孕 17 周（孕 5 月初）左右开始建立外界感知，系统胎教故事库的数据定义亦覆盖孕 17~40 周（共 24 周）。
   - **孕中晚期（17 ≤ `stage.value` ≤ 40）**：进入页面直接自适应定位到用户当前真实孕周，故事列表联动刷新。
   - **孕早期（1 ≤ `stage.value` < 17）**：智能吸附到最早胎教周（第 17 周），并弹出温情科普提示框：“您当前处于孕 X 周，胎儿听觉一般于孕17周左右开始发育，胎教故事从孕17周开启，已为您定位至第17周故事”。
   - **超期孕周（`stage.value` > 40）**：智能截断至第 40 周（足月故事）。
   - **非孕期或未配置阶段**：保持向后兼容的第 17 周默认推荐。
2. **多态视觉反馈与一键跳回交互**：
   - **周选择器按钮高亮**：
     - 当前正在浏览的周：采用主题色全填充 `bg-brand-500 font-medium text-white shadow-sm`；
     - 用户当前的真实孕周（当浏览其他周时）：采用浅色高对比度外环 `bg-brand-100 text-brand-700 font-medium ring-2 ring-brand-400 dark:bg-brand-950 dark:text-brand-300` 显著标记，便于快速识别与跳回；
     - 浏览当前孕周时：在周摘要旁附带「当前孕周」主题徽章。
   - **动态提示胶囊条**：在按周模式顶部展示阶段自适应提示横幅，并在用户切换至其他周时提供「返回我的孕周 (第X周)」一键直达操作。
3. **黑夜/白天模式全面协调**：
   - 提示条、月份快捷键、周数指示器、故事卡片与详情弹窗全面覆盖 Tailwind `dark:` 语义化类，保障双主题模式下良好的对比度与视觉体验。

### 10.6 .env 环境变量持久化与数据库存储模式动态重配机制规范 (v1.43)

#### 10.6.1 架构设计背景
系统在首次执行 `run.sh` 初始化后，会将用户的决策结果（硬件探针推荐或交互选择）以及系统密钥持久化写入 `.env` 文件。为了满足用户在后续运维过程中随时重新调整数据库存储架构（如从 SQLite 平滑升级至共享 PG，或从独立 PG 降级为 SQLite）的需求，同时避免用户因盲目删除 `.env` 导致 `SECRET_KEY`、端口等核心配置丢失，系统建立了规范化的重新配置标准流程与帮助内嵌机制。

#### 10.6.2 核心机制与实现逻辑
1. **显式重配子命令与参数解析**：
   - 增加 `./run.sh reconfig` 原生子命令；
   - 支持 `--reconfig` / `--reconfig-db` 命令行开关；
   - 支持 `-m, --mode <sqlite|shared|dedicated>` 参数直接切模；
   - 支持 `-y, --yes` 非交互兜底，保障 Cron/自动化运维流水线零阻塞。
2. **说明函数封装与帮助模块内嵌**：
   - 在组件模块 `bin/db.sh` 中抽象出 `show_db_reconfig_guide()` 专用展示函数；
   - 在 `run.sh` 的 `help` 模块末尾统一挂载调用，确保终端用户执行 `./run.sh help` 或直接输入 `./run.sh` 即可一览无余。
3. **配置文件容错与自愈策略**：
   - 推荐优先采用 `./run.sh reconfig` 或修改 `.env` 中的 `DB_MODE`；
   - 严正声明直接删除整个 `.env` 文件对 `SECRET_KEY` 与自定义参数的破坏性副作用，引导规范化运维。

### 10.7 PostgreSQL 镜像动态探针感知与零硬编码复用规范 (v1.44)

#### 10.7.1 架构设计背景与治理痛点
此前版本在容器化数据库部署中存在部分写死隐患：
1. `.env.example` 模板硬编码了 `DB_IMAGE=pgvector/pgvector:pg18` 与 `SHARED_PG_CONTAINER=pgvector-18`，导致新节点部署复制 `.env` 时提前赋死值，绕过了镜像探测；
2. 用户显式指定自定义版本时，若本地尚未下载，底层探针曾错误地强制回退至本地已有旧镜像，破坏了用户的自定义预期；
3. 宿主机无任何 PG 镜像时，硬编码拉取体积庞大的 `pgvector/pgvector:pg18`（约 500MB~1GB），未能选用更通用成熟轻量的官方版本；
4. 共享模式下硬编码兜底容器名 `pgvector-18`，在无该容器的异构节点上引发连接断开。

#### 10.7.2 核心机制与治理规范
1. **用户自定义优先原则（100% 遵从，决不篡改）**：
   - 用户通过命令行 `-i / --db-image <IMAGE>` 或在 `.env` 中配置 `DB_IMAGE` 时，系统将其视为绝对不可覆盖的决策输入；
   - 若本地已存在该镜像：标记 `DB_PULL_POLICY="never"`，就地复用，零网络开销；
   - 若本地尚无该镜像：标记 `DB_PULL_POLICY="if_not_present"`，启动时从 Registry 精准拉取用户指定版本，严禁回退到本地其他旧镜像。
2. **服务器本地已有镜像优先复用策略**：
   - 当用户未指定自定义镜像时，探针依次检索：
     - ① 宿主机正在运行的 PG 容器所使用的镜像；
     - ② 本地已存在的官方 Alpine / PostgreSQL 轻量镜像；
     - ③ 本地任何现存的可用 PG 镜像。
     命中任意本地镜像即就地复用并设为 `never`，彻底消除重复拉取。
3. **内置默认轻量镜像与按需拉取**：
   - 全新空服务器（本地无任何 PG 镜像）且选用 PG 存储模式时，自动采用内置轻量成熟镜像（`postgres:15-alpine`，支持 `DEFAULT_PG_IMAGE` 覆盖），仅在此场景下触发自动下载（`if_not_present`）。
4. **共享 PG 模式（shared）零硬编码与智能自愈**：
   - 彻底移除 `pgvector-18` 硬编码；
   - 动态嗅探宿主机运行中 PG 容器；若未运行但存在已停止容器则尝试拉起自愈；
   - 宿主机完全无 PG 容器时，给出明确诊断并智能平滑降级（Docker版降级为独立PG，传统版降级为SQLite），保障服务可用性。

### 10.8 数据库交互式重配链路修复与全参连接自定义规范 (v1.45)

#### 10.8.1 架构设计背景与根因治理
针对执行 `./run.sh` 配合 `--reconfig` / `--reconfig-db` 时未弹出数据库选择向导的问题，经端到端全链路审计，治理了以下 4 项连锁缺陷：
1. **参数解析缺省回退缺陷**：当仅输入 `./run.sh --reconfig` 时，因未指定子命令触发 `[ -z "$CMD" ] && CMD="help"`，导致误入帮助输出而跳过向导。修复后自动识别 `--reconfig` 并赋予 `CMD="reconfig"`；
2. **restart 免交互过早拦截**：`choose_db_mode()` 的第 1 步免交互判定中 `if [ "$CMD" = "restart" ]` 优先于 `RECONFIG_DB` 判定，导致 `./run.sh restart --reconfig` 直接静默退出。修复为仅在 `[ "$RECONFIG_DB" != "1" ]` 时生效；
3. **无 TTY 环境检测误杀**：原 `if [ "$NON_INTERACTIVE" = "1" ] || [ ! -t 0 ]` 将子 shell、IDE 终端与管道误判为非交互定时任务。修复后将后台自愈与用户显式指令解耦，显式传入 `--reconfig` 时强制呈现交互式决策菜单；
4. **传统版端口占用提早退出**：`setup_db_for_mode` 调用时机前置到 `start)` 与 `restart)` 入口，杜绝因服务已占用端口导致的提早 return。

#### 10.8.2 全参数连接信息自定义与持久化规范
为满足传统部署环境下对独立 SQLite、本地或外部 PostgreSQL 账号权限、指定端口的高级需求，系统在 `run.sh` 与 `bin/db.sh` 中全面支持以下命令行选项与自动持久化配置：
- `--db-user <USER>`: 自定义 PostgreSQL 用户名（默认: `mengya_local`）；
- `--db-pass <PASS>`: 自定义 PostgreSQL 连接密码（默认: `mengya123`）；
- `--db-name <DB>`: 自定义 PostgreSQL 数据库名/实例名（默认: `mengya_local`）；
- `--db-port <PORT>`: 自定义 PostgreSQL 端口（默认: `5432` / `5433`）；
- `--db-host <HOST>`: 自定义 PostgreSQL 主机地址（默认: `127.0.0.1`）；
- `--database-url <URL>`: 直接覆盖指定完整的标准连接串（如 `postgresql://user:pass@127.0.0.1:port/dbname`）。

所有参数均自动幂等写入当前目录 `.env`，并在服务启动或重启时组装为标准 `DATABASE_URL`，同时保障传统版默认 SQLite 模式下与 Docker 版本的 100% 物理隔离。

### 10.9 run.sh 脚本模块化拆分与自定义变量独立解耦规范 (v1.46)

#### 10.9.1 微内核启动器重构
为提升传统版本运维脚本的可读性与工程维护性，系统将 `run.sh` 重构为**轻量级微内核调度器**：
1. **体积与行数极致瘦身**：`run.sh` 脚本由原来的 530+ 行精简至 120 行左右，只负责环境引导、模块动态遍历载入（`for mod in env config python process db nginx data help; do ...`）以及最终子命令的极简调度分发；
2. **生命周期高内聚下沉**：将 `start_backend()`, `start_service()`, `restart_service()`, `show_status()` 全部下沉归集至 `bin/process.sh`，使 `process.sh` 成为统一的本地多进程生命周期管理管家；
3. **帮助系统独立收口**：将长篇帮助说明文档、参数说明与典型启动示例迁移至独立模块 `bin/help.sh`（`show_cli_help()` 函数），彻底移除主脚本冗余代码。

#### 10.9.2 自定义变量与配置解析独立模块 (`bin/config.sh`)
将传统版本所有自定义变量、参数解析与持久化逻辑独立抽离并封装至 `bin/config.sh`：
- **`init_default_configs()`**：声明并统一初始化本地端口（`PORT`, `FRONTEND_PORT`，默认 5173）、超级管理员账密（`ADMIN_USERNAME`, `ADMIN_PASSWORD` 等）、SNI 匹配域名、Nginx 路径、PID 与日志文件路径以及全套数据库连接参数；
- **`parse_cli_args "$@"`**：专职承接所有命令行参数循环解析（包括 `-p`, `-u`, `-P`, `-d`, `-m`, `--db-*`, `--reconfig`, `-y` 等）；
- **`apply_and_save_configs()`**：对用户显式传入的自定义参数进行校验，并自动调用 `update_env_var` 持久化同步写入 `.env` 文件；
- **`export_runtime_vars()`**：统一向后置运行环境导出 Django 运行时所需的核心环境变量。

### 10.10 数据库全量变量集中归集于 config.sh 治理规范 (v1.47)

#### 10.10.1 治理背景与单点收拢设计
在传统版本中，此前数据库相关变量分散在 `bin/config.sh`、`bin/db.sh` 以及 `bin/process.sh` 中，并在多处使用了冗余后备默认值（如 `${POSTGRES_USER:-mengya_local}`、`${POSTGRES_DB:-mengya_local}` 等）。用户若希望一次性自定义修改所有数据库默认配置，需要跨多个文件逐一排查，存在维护心智负担与遗漏风险。

为此，系统在 v1.47 版本确立了**数据库全量变量统一集中归集规范**：
1. **单一事实来源（Single Source of Truth）**：所有与数据库、存储引擎相关的可自定义变量，全部一站式归集至 `bin/config.sh` 的 `init_default_configs()` 与 `export_runtime_vars()` 中声明与导出；
2. **严格三级配置优先级**：
   $$\text{CLI 命令行显式参数 (--db-*, -m, --db-image)} > \text{.env 本地持久化配置} > \text{config.sh 代码级默认定义}$$
3. **消除跨模块硬编码后备**：`bin/db.sh` 与 `bin/process.sh` 彻底移除多余的 `:-mengya_local`、`:-5432` 等内联 fallback，统一直接消费 `config.sh` 预先初始化并导出的规范变量。

#### 10.10.2 一站式归集变量矩阵清单
在 `mengya-local/bin/config.sh` 中统一声明并维护的核心数据库变量如下：
- `APP_NAME`：应用命名空间（默认 `mengya_local`）；
- `DB_MODE`：数据库部署模式（传统版默认严格采用 `sqlite`，保障与 Docker 版数据 100% 物理隔离）；
- `DEFAULT_PG_IMAGE`：内置默认 PG 镜像版本（默认 `postgres:15-alpine`）；
- `DB_IMAGE`：用户指定或探针自适应复用的目标 PG 镜像；
- `DB_PULL_POLICY`：镜像拉取策略（就地复用为 `never`，按需下载为 `if_not_present`）；
- `DB_DATA_DIR`：PG 容器挂载目录（默认 `/var/lib/postgresql/data`）；
- `DB_CONTAINER_NAME`：独立 PG 模式专属容器名（默认 `${APP_NAME}-pg`）；
- `SHARED_PG_CONTAINER`：共享模式目标 PG 容器名；
- `POSTGRES_USER`：PostgreSQL 用户名（默认 `mengya_local`）；
- `POSTGRES_PASSWORD`：PostgreSQL 连接密码（默认 `mengya123`）；
- `POSTGRES_DB`：PostgreSQL 数据库/实例名（默认 `mengya_local`）；
- `POSTGRES_PORT`：PostgreSQL 连接端口（默认 `5432`，独立模式遇冲突自适应 `5433`）；
- `POSTGRES_HOST`：PostgreSQL 访问主机（默认 `127.0.0.1`）；
- `DATABASE_URL`：标准数据库连接串（支持在此直接显式定义，或留空由系统自动按参数标准组装）；
- `SQLITE_PATH`：SQLite 模式数据持久化路径（默认 `$BACKEND_DIR/db.sqlite3`）；
- `USE_POSTGRES`：是否启用 PostgreSQL 引擎（默认 `False`，启用 PG 模式时自动置为 `True`）。

### 10.11 传统模式专属 PG 容器生命周期联动终止与 unless-stopped 重启策略规范 (v1.48)

#### 10.11.1 传统模式数据库容器未终止问题与生命周期联动
此前在传统部署版本（`mengya-local`）中，当用户选用独立专属 PostgreSQL 模式（`dedicated`）时，启动脚本会拉起容器 `${APP_NAME}-pg`（如 `mengya_local-pg`）。但在执行 `./run.sh stop` 时，由于仅查杀终止了本地 Django 后端 Python 进程，未触及 Docker 容器，导致数据库容器一直残留在后台运行。

为此，系统确立了**传统模式数据库容器生命周期联动机制**：
1. **新增容器下线感知函数 (`bin/db.sh` -> `stop_db_container`)**：
   通过 Docker 管理指令安全探查当前应用专属的独立 PG 容器是否运行。若存在，执行 `docker stop "$DB_CONTAINER_NAME"` 进行平滑停止；
2. **停止流全面打通 (`bin/process.sh` -> `stop_all`)**：
   在停止本地 Django 服务的同时，联动执行 `stop_db_container`，实现程序停止时本地进程与关联数据库容器的一键完全终止；
3. **共享模式安全隔离**：
   在 `shared` 模式下严格保持边界，不触碰宿主机其他系统共用的已有 PG 实例。

#### 10.11.2 重启策略纠偏至 unless-stopped
- **避免 `always` 策略失控**：初次创建专属 PG 容器时保持 `--restart unless-stopped`；
- **存量容器动态纠偏**：在唤醒已有专属 PG 容器前，自动调用 `docker update --restart unless-stopped "$DB_CONTAINER_NAME"`，将历史可能配置为 `always` 的存量容器无缝纠正为标准 `unless-stopped` 策略。

### 10.12 双版本同机共存 6 种数据库部署组合矩阵与全维度数据隔离规范 (v1.49)

#### 10.12.1 隔离设计背景与协同原则
当同一台服务器同时部署了传统版本（`mengya-local`）与 Docker 容器化版本（`mengya-docker`）时，系统确立了**双版本全链路数据与环境隔离机制**，杜绝两版本在任何部署组合下的数据串扰、端口冲突与容器死锁：
1. **命名空间与容器名隔离**：传统版 `APP_NAME` 锁定为 `mengya_local`，专属容器为 `mengya_local-pg`；Docker 版 `APP_NAME` 锁定为 `mengya_docker`，专属容器为 `mengya_docker-pg`；
2. **数据库凭据隔离**：传统版默认账号/密码/库为 `mengya_local` / `mengya123` / `mengya_local`；Docker 版为 `mengya_docker` / `mengya_docker123` / `mengya_docker`；
3. **全线容器重启策略**：双版本涉及的所有容器均锁定为 `unless-stopped`，严禁使用 `always`。

#### 10.12.2 同机共存 6 种数据库部署组合矩阵
| 组合序号 | 传统版本 (`mengya-local`) 模式 | Docker版本 (`mengya-docker`) 模式 | 传统版存储形态与物理路径 | Docker版存储形态与物理路径 | 端口与网络协同 | 数据隔离与防冲突保障机制 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **组合 1** | **SQLite** | **SQLite** | 宿主机文件：`mengya-local/db.sqlite3` | 容器挂载目录：`mengya-docker/data/db.sqlite3` | 传统版 Web: 5173<br/>Docker Web: 5174 | 两个完全独立的 SQLite 单文件，物理路径彻底隔离，零网络与端口争抢。 |
| **组合 2** | **SQLite** | **独立 PG (`dedicated`)** | 宿主机文件：`mengya-local/db.sqlite3` | 独立容器 `mengya_docker-pg`，数据卷 `mengya_docker_pgdata` | Docker 版内部 expose 5432（不绑定宿主机端口） | 传统版本运行在本地 SQLite，Docker 版自建专属 PG 容器，存储介质异构隔离。 |
| **组合 3** | **SQLite** | **共享 PG (`shared`)** | 宿主机文件：`mengya-local/db.sqlite3` | 共享宿主机现有 PG 容器（如 `pgvector-18`），自建库 `mengya_docker` | 宿主机现有 PG 端口开放，Docker 后端加入网络直连 | 传统版本使用独立文件，Docker 版在已有共享 PG 实例中拥有专属数据库与账号，互不干扰。 |
| **组合 4** | **独立 PG (`dedicated`)** | **SQLite** | 宿主机专有容器 `mengya_local-pg`，数据卷 `mengya_local_pgdata` | 容器挂载目录：`mengya-docker/data/db.sqlite3` | 传统版独占宿主机 5432 端口，Docker 版 SQLite 零端口依赖 | 传统版独占专属 PG 容器，Docker 版完全跑在内嵌 SQLite 文件中，数据与连接完全解耦。 |
| **组合 5** | **独立 PG (`dedicated`)** | **独立 PG (`dedicated`)** | 宿主机专有容器 `mengya_local-pg`（用户 `mengya_local`，宿主机端口 5432） | Docker 专属容器 `mengya_docker-pg`（用户 `mengya_docker`，内部 expose 5432） | 传统版独占宿主机 5432 端口；Docker 版仅在 Compose 内部暴露 5432，**不绑定宿主机端口**，零冲突 | 容器名隔离（`mengya_local-pg` vs `mengya_docker-pg`）、数据卷隔离（`mengya_local_pgdata` vs `mengya_docker_pgdata`）、账号/库隔离（`mengya_local` vs `mengya_docker`），容器与数据双重物理隔离。 |
| **组合 6** | **独立 PG (`dedicated`)** | **共享 PG (`shared`)** | 宿主机专有容器 `mengya_local-pg`（宿主机 5432，数据库 `mengya_local`） | 复用传统版 `mengya_local-pg` 容器，但自动创建专有库 `mengya_docker` 与专有用户 `mengya_docker` | Docker 启动脚本自动将 `mengya_local-pg` 接入 Compose 内网（`${COMPOSE_PROJECT_NAME}_net`） | 数据库级（Database-level）严格隔离。Docker 版启动脚本自动在共享实例中幂等初始化专有库 `mengya_docker` 并授予独立权限，两套版本数据表互不可见，极大节省内存。 |

*(注：若两版本均选择共享第三方宿主机 PG 容器如 `pgvector-18`，传统版与 Docker 版各自持有独立数据库 `mengya_local` 与 `mengya_docker` 及独立账号，天然具备数据库级完全隔离能力。)*


### 10.13 传统模式独立专属 PG 默认镜像锁定 (PG15) 与宿主机越界探测解耦自愈规范 (v1.50)

#### 10.13.1 架构缺陷与根因剖析
此前传统版本在选用独立专属 PostgreSQL 模式（`dedicated`）时，内置默认镜像设计为 `postgres:15-alpine`，但在实际服务器部署时却误启动了 `pgvector/pgvector:pg18` 镜像，经排查根本原因包含以下 4 环链条缺陷：
1. **探针越界偷取镜像**：`bin/db.sh` 中的 `detect_best_pg_image()` 调用 `detect_running_pg_containers`，误将宿主机上其他正在运行的无关 PG 容器（如共存系统或共享模式的 `pgvector-18`）镜像偷取作为自身专属 PG 容器的镜像；
2. **规则权重倒错**：本地镜像扫描逻辑优先匹配了 `^pgvector/pgvector:`，跳过了内置默认的 PG15；
3. **默认镜像优先权被架空**：`DEFAULT_PG_IMAGE="postgres:15-alpine"` 仅在本地没有任何镜像时作为最后兜底；
4. **`.env` 伪自定义持久化锁死**：`choose_db_image()` 无条件调用 `update_env_var "DB_IMAGE" "$DB_IMAGE"`，将探测到的 `pgvector/pgvector:pg18` 写入了 `.env`。后续启动判定 `[ -n "$DB_IMAGE" ]` 为真，误以为是用户显式指定，导致永久锁死在 `pg18`。

#### 10.13.2 治理改造与技术规范
1. **宿主机运行容器探针越界彻底解耦**：彻底移除 `detect_best_pg_image()` 中扫描宿主机其他运行容器的逻辑，独立专属容器镜像与宿主机其他容器完全隔离；
2. **本地镜像优先级阶梯重构**：优先检查本地是否存在内置默认镜像 `postgres:15-alpine`；其次检查兼容官方 PG15 镜像 (`postgres:15*`)；再次检查官方轻量 alpine 镜像 (`postgres:*alpine`)；最后兜底返回 `postgres:15-alpine` 并按需拉取 (`if_not_present`)；
3. **`.env` 伪自定义持久化解耦与历史残留自动纠偏**：默认模式下不向 `.env` 强行写入 `DB_IMAGE`（保持空值以始终跟随系统默认）；仅在用户通过命令行 `--db-image` (`CUSTOM_DB_IMAGE`) 显式传参时才标记为自定义并持久化；若 `.env` 残留历史误判的 `pg18`/`pgvector` 镜像且未显式指定，启动时自动进行配置纠偏清空并重置为内置默认 `postgres:15-alpine`；
4. **专属 PG 容器与存储卷对齐自愈**：启动前检测已有容器实际镜像，若与目标镜像不一致（如历史遗留的 pg18 容器），自动停止并删除旧容器以便以新镜像重新创建；若涉及从 PG18 跨大版本切换回 PG15，自动重置不兼容旧数据卷 `${APP_NAME}_pgdata` 确保全新初始化无报错；
5. **数据卷挂载点标准化**：统一规范为 `/var/lib/postgresql/data`。


### 10.14 孕育生命周期精准阶段计算、菜单权限阶段自适应识别与管理员定制分层防御体系 (v1.53)

#### 10.14.1 业务背景与历史架构缺陷剖析
在平台日常运营与家庭用户真实使用中，存在以下多维度体验与权限安全缺陷：
1. **宝宝年龄粗粒度展示失真**：
   - 历史版本在宝宝出生后仅展示粗略的单一月龄数字（例如“宝宝当前月龄：32 个月”）或单一天数（如“2岁245天”），未能按照儿科发育与家庭日常习惯准确呈现为年月日的自然表达，用户认知断层；
2. **孕周计算粗糙与预产期协同不足**：
   - 历史版本将孕周粗暴四舍五入为“孕X周”，缺少具体天数指示（如“孕28周3天”），且在超出预产期时无法进行合理解释；
3. **用户菜单权限缺乏阶段感知与精准初始化**：
   - 新用户注册或调整阶段后，菜单权限未联动。导致已出生宝宝的家庭依然显示“孕期周历”、“孕期食谱”、“胎教故事”等孕期专属页面；而怀孕中的准妈妈却能看到“幼儿百科”等育儿页面，功能信息架构冗余混乱；
4. **管理员配置用户菜单权限未生效与安全穿透隐患**：
   - 管理员在后台取消指定用户的特定页面权限后，前端依然能看到并访问该页面；
   - **根本原因链条**：
     * **前端默认值降级穿透**：`authStore.ts` 中 `hasPermission` 判定逻辑存在空对象漏洞，当用户 permissions 为空对象或缺少特定 key 时，直接返回 `true`，导致权限失效；
     * **首页快捷入口与聚合模块鉴权缺失**：`HomePage.tsx` 中的快捷入口（`quickEntries`）、推荐商品与高分模块缺乏菜单权限过滤；
     * **权限前端缓存未及时刷新**：缺少路由切换防抖拉取与前台获焦同步，导致后台修改后用户端停留在旧权限快照；
     * **用户切换阶段冲掉管理员配置**：用户在个人中心修改孕育阶段时，系统若直接覆盖权限字典，会导致管理员之前的个性化授权配置被冲掉；
     * **后端缺少 403 严格防线**：相关 ViewSet（食谱、胎教故事、周历等）未对用户自定义菜单权限做服务层拦截。

#### 10.14.2 架构重构与治理方案

##### 1. 宝宝年龄与孕周高人性化精准展示算法体系
- **标准宝宝年龄格式**：统一规范为 `X岁X个月X天（总月龄）`（如 `2岁8个月5天（32个月）`）；
- **自适应认知优化**：
  * 新生儿（< 30天）：精准显示 `X天`；
  * 未满岁宝宝：显示 `X个月X天`；
  * 整岁整月优化：如满 1 周岁且天数为 0 时显示 `1岁整（12个月）`；
- **全孕期 280 天医学标准模型**：
  * 基于医学预产期精准反推已孕天数（`days_pregnant = 280 - days_to_due`）；
  * 精确输出为 `孕X周X天`（如 `孕24周5天`）；超出预产期时展示为 `孕40周+X天`；
- **双端算法 100% 镜像一致性**：
  * 后端：`apps/core/utils/stage_utils.py`（基于 `relativedelta` 严谨处理闰年与大小月份）；
  * 前端：`frontend/src/utils/stage.ts`（基于精确日期偏移与月度天数换算），确保双端无时区或单日偏差。

##### 2. 菜单权限阶段精准自适应与默认初始化规则
- **阶段驱动的默认权限矩阵**（`get_default_permissions_for_stage`）：
  * **已出生宝宝（`baby_born`）**：
    - 自动禁用孕期专属：`menu_timeline = false`（孕期周历）、`menu_recipes = false`（孕期食谱）、`menu_fetal_stories = false`（胎教故事）；
    - 自动启用育儿专属：`menu_encyclopedia = true`（幼儿百科）；
  * **怀孕中（`pregnancy` / 未出生）**：
    - 自动启用孕期专属：`menu_timeline = true`、`menu_recipes = true`、`menu_fetal_stories = true`；
    - 自动禁用育儿专属：`menu_encyclopedia = false`；
- **注册引导与阶段流转无缝联动**：
  * 用户注册阶段（`RegisterPage.tsx`）根据用户选择的阶段即时预览并派发默认权限字典；
  * 用户在个人资料调整阶段时，服务端自动依据新阶段推导权限。

##### 3. 管理员个性化定制最高优先级与分层防御架构
- **管理员定制保护机制（`_admin_customized` 标识）**：
  * 当管理员通过管理后台（`AdminPermissionsView`）显式调整用户权限时，系统自动在底层权限字典中注入私有保护标识 `_admin_customized: True`；
  * 当用户在前端自行修改宝宝生日或预产期时，后端检测到 `_admin_customized: True` 即**严格保留管理员设定的权限矩阵**，杜绝用户阶段更新覆盖管理员管控；
  * 管理后台同时提供“重置为阶段默认”能力，清除保护标记，恢复随阶段动态自适应；
  * 对外 API 输出时自动过滤下划线私有标记（如 `_admin_customized`），保证客户端接口契约纯净。
- **前端鉴权修复与全页面严格过滤**：
  * 修复 `authStore.ts`：显式校验权限字典有效性，未配置或未显式为 `true` 的权限严格判定为 `false`；
  * `HomePage.tsx` 快捷入口（`quickEntries`）、阶段卡片、推荐卡片均按当前用户权限进行强过滤；
  * 前端路由守卫（`PermissionGuard`）对未授权页面进行 403 路由拦截与友好的无权限提示。
- **近实时轻量权限同步机制**：
  * 在 `RequireAuth.tsx` 布局中部署三维同步探针：
    1. **路由跳转防抖刷新**：页面切换时静默请求 `/api/auth/me/` 获取最新权限快照；
    2. **窗口获焦同步**：用户从后台管理标签页切回前台页面时立即触发焦点刷新；
    3. **15秒定时静默轮询**：后台轮询拉取最新权限，实现秒级响应管理员权限撤销。
- **后端 API 403 严格防线**：
  * 在 `RecipeViewSet`、`FetalStoryViewSet`、`TimelineViewSet` 等关键接口增加视图级权限校验，越权访问直接返回 403 Forbidden，杜绝客户端绕过 UI 抓取接口数据。

### 10.15 健康中心 BMI 动态图表与 SearXNG 双通道改造体系 (v1.54)

#### 10.15.1 业务背景与改造目标
1. **健康中心缺失时序化 BMI 智能闭环**：既有 BMI 录入存在“同步存入成长记录”冗余勾选框且日期锁死当日，缺少按天补录历史数据、全时序趋势通道带、相邻/单周增量 Δkg 变色柱状图与时间跨度筛选；
2. **食谱引擎单一来源**：仅从内部 `Recipe` 库取数，无权威联网检索兜底、无双通道数据源打标（`[平台优选: ID]` / `[外部检索: 来源]`）与孕产期禁忌食材全量扫描；
3. **SearXNG 客户端缺乏显式配置清单与熔断机制**：需固化 `SEARXNG_*` 环境变量、0.5s 极速探针 + 快速熔断（Fast-Fail）毫秒级安全降级，并提供管理员在线配置管理。

#### 10.15.2 架构设计与实现落地
1. **零迁移复用成熟表**：测量时序打卡复用 `HealthRecord`（`record_type=prenatal_exam|growth_measurement`），`exam_items` JSONField 扩展承载 `waist_circumference / pre_weight / bmi / actual_gain / gain_status / is_twins`，零数据库迁移破坏；
2. **后端服务层下沉**：
   - `apps/core/services/medical_calculator.py`：WS/T 801-2022 单/双胎孕前 BMI 分级与 1~40 周推荐增重区间/中位线曲线（`curve` 契约），4 级医学预警引擎（剧吐脱水 / 子痫前期 / FGR 生长滞后 / GDM 控糖）；
   - `apps/core/services/diet_recommendation_service.py`：双通道一日五餐（平台库 `[平台优选: ID]` ↔ SearXNG `[外部检索: 域名]` ↔ 本地《孕期膳食指南》兜底），孕囊禁忌食材全量扫描；
   - `apps/core/services/searxng_client.py`：私有化元搜索客户端（`format=json` / `safesearch=1` / 权威健康白名单 / 0.5s 快速探测熔断 / 连通测试 / `.env` 同步持久化）。
3. **接口契约**：
   - `GET/POST /api/health/bmi-analysis/`：时序历史拉取 + 打卡自动持久化 + 综合评估 + 双通道食谱 + `timeseries` 全量回传；
   - `GET/PUT /api/admin/searxng-config/` 与 `POST /api/admin/searxng-config/test/`：管理员配置查看/更新与连通性测试（仅 `is_staff`）。
4. **前端四卡片信息流**：`BmiFormCard`（按天补录 / 腹围 / 单双胎 / 代谢病史 / 移除冗余勾选）→ `BmiTimeSeriesBoard`（趋势通道带+中位线+实测曲线；Δkg 变色柱状 + 视图切换 + 近7天/近1个月/全孕期·全产后筛选）→ `BmiHistoryTable`（历史打卡 + 删除二次确认 + 看板联动刷新）→ 医学预警 Banner + WS/T 801-2022 曲线看板 + 双通道食谱 + 运动心理关怀；
5. **管理员 SearXNG 配置弹窗**：`SearXNGConfigModal` 挂载于 BMI 分析页头部（仅 `is_staff` 可见），支持在线查看/修改/测试连通性/同步写回 `.env` 并热刷新运行配置。

### 10.16 统一健康打卡 · 孕周引擎 · AI 实时检索体系 (v1.55)

#### 10.16.1 业务背景与改造目标
1. **页面间数据联动混乱**：`growth_measurement` 被同时用作"产后妈妈打卡"与"宝宝测量"两种语义，导致妈妈身高体重混入宝宝生长曲线、BMI 历史表对非孕期用户错显"产后恢复"，且孕产记录 / 生长曲线 / BMI 分析三页面三种过滤口径互不一致；
2. **孕周无一致性校验**：同月不同孕周的矛盾数据可同时入库（如 2026-05-01 孕 1 周与 2026-06-01 孕 2 周并存），时序趋势与推荐增重通道失真；
3. **录入入口分裂**：产检录入与生长录入两套表单互不相通、切换 Tab 状态残留，非孕期用户（备孕 / 已育）被迫在孕期语义下打卡；
4. **AI 助手无实时检索能力**：已有 SearXNG 客户端仅服务食谱双通道，AI 问答直接走模型知识库，时效性问题（如最新指南 / 政策）无法联网求证，且 `latency_ms` 为假随机数、无检索状态透出。

#### 10.16.2 架构设计与实现落地
1. **记录语义重构（零迁移）**：产后妈妈打卡复用 `prenatal_exam` + `exam_items.stage="postpartum"` 标记（新增 `stage` / `postpartum_months` 字段），宝宝测量独占 `growth_measurement`，彻底消除一词两义；
2. **孕周一致性引擎**（`apps/core/services/gestation_engine.py`）：
   - 双基准推算：优先档案 `due_date` 预产期（280 天医学模型），无预产期以最早 prenatal_exam 的（日期, 孕周）锚点线性外推；
   - `MAX_WEEK_DEVIATION=1` 周矛盾拦截：`HealthRecordSerializer.validate` 与 BMI 打卡接口双重校验，超偏差返回 400 并附"该日期应为孕 X 周（基于首次打卡推算）"精确提示；
   - 基线自动继承：身高 / 孕前体重留空自动继承最近打卡基线，首次打卡以实测初始化（响应 `baseline_initialized=true`）。
3. **统一健康打卡弹窗**（`UnifiedHealthCheckIn.tsx`）：三选一记录对象（孕期产检 / 产后恢复 / 宝宝生长测量）按档案智能默认（`is_pregnant` → 孕期、`baby_birthday` → 宝宝测量）；日期补录时自动推算孕周 / 产后天数 / 宝宝月龄；妈妈打卡走 `bmi-analysis` 接口、宝宝测量走 `healthApi.create`，归档 toast 按模式提示各自同步范围；
4. **三页面口径统一**：孕产记录 Tab（更名自"产检记录"）仅显示 `prenatal_exam` 全量 + 阶段徽章；生长曲线 Tab 仅 `growth_measurement`；BMI 时序源统一 `prenatal_exam`，历史表阶段列按 `stage` 渲染 `孕 X 周` / `产后 X 个月`；`BmiFormCard` 阶段类型初始跟随档案、产后月龄按宝宝生日自动、身高 / 孕前体重改选填；
5. **AI 实时检索管线**：
   - `web_search.search_for_ai()`：SearXNG 优先（毫秒级熔断）→ 不可用时按管理员开关 `AI_SEARCH_FALLBACK_ENABLED` 决策：关闭（默认）直接 AI 知识库回答（`status=unavailable`），开启回退多公网引擎（`status=fallback:引擎名`）；
   - `_SEARCH_PATTERNS` 扩展母婴健康关键词（黄疸 / 辅食 / 疫苗 / 待产包 / 增重等），寒暄创作类不联网；
   - `ai_chat` 响应新增 `search_status` / `sources`，`latency_ms` 修复为真实耗时；
   - 前端 `AIAssistantPage` 消息级徽章（SearXNG 实时检索绿色 / 未接入实时检索灰色 / 公网引擎蓝色）+ 来源列表展开折叠 + 管理员头部 SearXNG 配置入口；`SearXNGConfigModal` 新增公网兜底开关并随配置接口同步 `.env`。
6. **验证结论**：v1.55 冒烟测试 29/29 通过（孕周引擎锚点推算 / 矛盾拦截 / 序列化器校验 / 语义归档 / 基线继承 / 口径分离 / AI 检索链路 / 兜底开关真实生效），浏览器全链路逐项验证通过（三种打卡模式归档 / 孕周 5 周矛盾被 400 精确拦截 / 累计增重基线继承 / 生长曲线与孕产记录互不混数 / AI 灰色徽章"未接入实时检索" / 兜底开关文案与默认关闭状态）。

#### 10.16.3 SearXNG 接入链路诊断增强与配置生效修复 (v1.55.1)
1. **问题定位**：用户反馈 AI 助手"未接入 SearXNG"——实测实例 `http://100.64.0.1:8090` 连通正常（`/healthz` 193ms、JSON 输出已开启），根因为 SearXNG 实例的默认通用引擎全部被上游封禁（brave 限流、duckduckgo/qwant/startpage CAPTCHA、google 静默 0 结果、wikipedia 中文无索引、bing 返回无关结果），检索恒为 0 条；叠加平台侧缺陷——`SEARXNG_ENGINES` 配置项从未在检索链路生效、`search_for_ai` 将"0 结果"与"不可达"混为 `unavailable`、连通性测试 0 条结果仍报"成功"；
2. **修复落地**：
   - `SearXNGClient.search()` engines 参数为空时回退 `SEARXNG_ENGINES` 配置（配置真正生效）；
   - `search_for_ai()` 新增 `searxng_empty` 精确状态（实例可达但 0 结果），兜底分支不覆盖；前端 AI 助手页新增橙色警示徽章；
   - `test_connection()` 两跳诊断（通用探针 + 权威白名单探针）新增 `warning` 状态、`health_count`、`unresponsive_engines` 透出，弹窗橙色展示失效引擎清单与修复指引；
3. **验证结论**：shell 实测 `search_for_ai("新生儿黄疸怎么办？")` → `searxng_empty`；`test_connection()` → `warning` + 失效引擎 `brave/duckduckgo/qwant/startpage`；浏览器实测新消息橙色徽章、弹窗橙色"连通但引擎异常"诊断（757ms + 失效引擎清单）均正常显示。实例侧引擎修复（更换出口 IP / 配置代理 / 启用可用引擎）由 SearXNG 实例管理员在部署机执行。

### 10.17 健康中心信息架构重构与搜索引擎配置体系 (v1.56)

#### 10.17.1 业务背景与改造目标
1. **搜索引擎可用性原则**：SearXNG 不可用时不能影响用户使用，且需明确提示当前搜索引擎——v1.55.1 已确诊用户实例上游引擎全部被 CAPTCHA/限流封禁（检索恒 0 条），默认关闭的公网兜底使 AI 失去实时检索能力；
2. **配置入口分散**：SearXNG 配置弹窗挂在健康中心 BMI 页与 AI 对话页，位置混乱，期望收敛至 AI 助手配置页；
3. **非孕期用户缺位**：打卡/表单仅孕期与产后，备孕与日常体重管理用户无对应阶段；新增记录后列表偶发不显示（根因：浏览器缓存旧前端包）；
4. **看板只认孕期**：WS/T 801-2022 全孕期走势看板对产后/非孕期无参考通道，且缺少标准 BMI 与当前 BMI 的直观展示；
5. **信息架构混乱**：5 个平铺 Tab（孕产记录/生长曲线/体重BMI/疫苗/日历总览）对象归属与关联关系不清。

#### 10.17.2 架构设计与实现落地
1. **搜索引擎三级降级（v1.56 默认开启兜底）**：`AI_SEARCH_FALLBACK_ENABLED=True`（settings/.env/.env.example 三方同步）——SearXNG 无结果/不可达自动回退平台内置公网引擎（Bing 直连），徽章明确显示当前引擎（`公网实时检索（Bing）`）；三层状态 + `searxng_empty` 橙色诊断，AI 回答末尾注明「信息来源：当前搜索引擎」；
2. **配置入口收敛**：`AIConfigPage`（`/settings/ai`）新增「搜索引擎配置」区块（实例地址/连通状态/兜底开关摘要 + 配置面板），BMI 页与 AI 对话页按钮移除；
3. **非孕期（备孕/日常）阶段**：`stage=general` 零迁移复用 `prenatal_exam`——统一打卡新增「我·非孕期/备孕」模式、BMI 表单新增「非孕期/备孕」按钮、序列化器 `stage_type` 增 `general`（自动清空孕周/产后月龄）、医学计算器新增非孕期评估分支（标准 BMI 区间 18.5~23.9）；孕产记录/历史表阶段列显示「非孕期」；后端 `index.html` 强制 no-cache 根治旧前端缓存；
4. **BMI 状态卡 + 非孕期看板**：三卡展示标准 BMI 区间（18.5~23.9）/ 当前测算 BMI（最新打卡实时计算 + 分类）/ 孕前 BMI 基线；时序看板纯非孕期自动切换为「体重走势 + BMI 18.5~23.9 体重参考带 + BMI 21 中位虚线」，孕期维持 WS/T 通道带；
5. **健康中心 4-Tab 重构**：妈妈·孕产档案（明细列表 + BMI 分析全模块）/ 宝宝·生长档案（曲线 + WHO 男童 P50 参考线 + 测量记录表）/ 宝宝·疫苗计划（日历 + 接种状态 + 免疫规划清单 + 下一针建议按月龄）/ 健康时间轴（日历总览 + 任意日期点击补录弹窗预填日期）；页头「健康打卡」四模式为唯一录入入口，保存后联动刷新全部 Tab；
6. **其他优化**：BMI 表单基线连续预填（身高/孕前体重自动带出）；时间轴补录；WHO P50 参考线（`GrowthChart` 按宝宝月龄插值对齐）；疫苗下一针建议（逾期红字提醒）。

#### 10.17.3 验证结论
- 后端 `Django check` 通过；`stage=general` 序列化/评估冒烟通过（BMI 22.58 正常、文案「非孕期体重管理阶段」）；
- 浏览器全链路验证通过：4-Tab 结构、BMI 状态卡（当前 20.7 正常）、BmiFormCard 三阶段按钮、打卡弹窗四模式（无重复）、非孕期打卡归档（toast「已归档」+ 历史表阶段「非孕期」+ 明细徽章）、宝宝 WHO 参考线、疫苗下一针建议（乙肝第1剂·宝宝 32 个月）、时间轴点 15 日弹窗预填 2026-10-15、AI 配置页搜索区块（实例可达 + 兜底已开启）、AI 助手新消息蓝色「公网实时检索（Bing）· 5 条来源」徽章、BMI 页与 AI 页无配置入口、`Cache-Control: no-cache` 生效；验证数据已清理（用户历史记录保留）。

### 10.18 健康数据严谨性 · 列表管理 · 工程瘦身 · 临床赋能 (v1.57)

#### 10.18.1 业务背景与改造目标
1. **数据严谨性缺位**：打卡/BMI 归档/宝宝测量均无同日唯一性校验，同日反复提交产生重复记录污染时序图；打卡日期可任填未来日期；宝宝测量无数值范围提示；
2. **列表管理能力不足**：三处数据列表（妈妈历史表/明细卡片流/宝宝测量表）仅支持逐条删除且无分页，数据增多后页面冗长、批量清理低效；删除确认交互三处不统一（window.confirm / 两段式按钮）；
3. **「收起本次分析结果」按钮体验缺陷**：点击后清空 result——非孕期模式报告区块内容少视觉变化极小，且按钮随 result 消失无法再展开，被用户判定为"无反应"；
4. **权限模块欠账**：`menu_health` 与 CRUD 权限描述仍为旧 5-Tab 语义；BMI 分析接口写库但仅校验菜单级权限，存在越权写入漏洞；
5. **工程三项阶段目标**：主包体积瘦身（echarts/React 全家桶混装 ~1MB）、SearXNG 引擎配置手工输入低效 + 外部食谱卡片食材缺失、临床实用能力（A4 报告导出 / 蓝牙秤/Apple Health 数据导入）缺位。

#### 10.18.2 架构设计与实现落地
1. **同日唯一 + 覆盖更新引擎**：`HealthRecordViewSet.create` 与 `HealthBmiAnalysisView.post` 双链路查重（user + record_type + record_date，`UNIQUE_DATE_TYPES = (prenatal_exam, growth_measurement)`，疫苗豁免）；命中返回 `409 + code 4090 + existing 摘要`，前端确认后携 `overwrite=true` 重发——妈妈链路后端原地更新当日记录并重新生成评估（`record_action=updated`），宝宝链路 `PATCH` 原记录；保留 id 与 created_at 不产生重复数据；
2. **未来日期硬拦截**：`BmiAnalysisInputSerializer` 与 `HealthRecordSerializer` 层校验 record_date ≤ 今天（400 精确提示）+ 前端 date input `max=今天` 双防线；**宝宝数值软提示**（身高 30~140 / 体重 0.5~40 / 头围 25~60 外黄色警示不阻断，满足特殊医学场景）；
3. **列表管理组件化**：新增 `useListPagination` Hook（分页 + 页大小 localStorage 记忆）+ `PaginationBar`（页码省略号导航 + 5/10/20/50 选择器）+ `ConfirmDialog`（红色二次确认弹窗），四处列表接入（含疫苗 Tab 新增「全部接种记录」管理区）；批量删除走后端新接口 `batch-delete`（单事务 + 200 条/次上限 + 仅本人 + 逐条审计）；
4. **报告可逆折叠**：`reportCollapsed` 状态 + 常驻切换按钮（Chevron 图标），收起仅隐藏区块不丢数据，重新分析自动展开；
5. **权限同步与漏洞修复**：`PERMISSION_DEFINITIONS` 五项描述更新 4-Tab 语义（含 CSV 导入/批删能力说明）；BMI 接口补齐 `health_record_view`（GET 时序）与 `health_record_create`（POST 归档）细粒度校验；
6. **工程瘦身**：`manualChunks` 分包（echarts 1MB / react-vendor 190KB / router 22KB / axios 51KB / pdf-tools 593KB 独立），主包 453KB（gzip 116KB）；`BmiTimeSeriesBoard` 重构为 init 一次 + `setOption({notMerge})` 热更新 + ResizeObserver 自适应，容器常驻挂载；
7. **SearXNG 预设与食谱结构化**：配置弹窗三档预设一键填入（国内优选 bing,sogou / 仅 bing / 国际组合）+ ✓ 选中态 + 一键清空；`extract_ingredients_from_text()` 数量型/适量型双正则 + 动词干扰词过滤提取食材用量填充外部推荐卡片；
8. **临床赋能**：`HealthReportExport` A4 报告（四区块 + iframe 打印 + html2canvas/jsPDF 动态加载多页切片下载）；`CsvImportModal` 双对象导入（mom/baby 模板、解析预览+本地预检、冲突策略 skip/overwrite、逐行错误明细、500 条上限、基线继承）。

#### 10.18.3 验证结论
- 后端冒烟 22 项全部通过：正则提取（菠菜100克、鸡蛋2个、牛奶250ml、盐+适量/干扰句排除）、BMI 链路（首次 created → 同日 409 → 覆盖 updated → 未来日期 400）、宝宝链路（首次/409/覆盖）、疫苗同日两剂不查重、批量删除、CSV 导入（新增/跳过/错误行明细）；
- 构建验证：主包 453KB（gzip 116KB），echarts/pdf-tools/react-vendor/router/axios 五独立 chunk，pdf-tools 按需加载；
- 浏览器全链路验证通过：宝宝头围超范围软提示（改正即消失）+ 日期 max 防呆、宝宝/妈妈/深度表单三链路 409 覆盖（含当日已有数据摘要展示）、收起/展开可逆折叠（数据保留）、四处列表勾选/全选本页/批删确认弹窗（涉及清单展示）、分页（默认 5 条/页、9 条数据 5+4 分布、切 10/页、localStorage 记忆）、批量删除精确清理 8 条测试数据（用户原有记录保留）、疫苗全量记录区（同日两剂 + 批删还原）、A4 报告四区块渲染 + PDF 实际下载（萌芽孕产健康评估报告_20261010.pdf）、CSV 导入（解析预览 + skip 策略：新增1/跳过1/失败2 含行级错误原因）、SearXNG 三预设填入/✓高亮/清空、权限矩阵新描述展示、修复版包 console 零 JS 错误；
- 测试期间发现并修复一个真实缺陷：`CsvImportModal` 的 useMemo 位于 `if (!isOpen) return null` 之后导致 React #310 hooks 数量不一致整树崩溃白屏，修复后（hooks 全部前置 + 注释固化规范）复验通过；
- 验证数据全部清理（妈妈/宝宝/疫苗测试记录 12 条 + 冒烟脚本 + 下载 PDF 回收站），用户原有数据（2026-05-08 孕1周打卡、2026-09-10 宝宝测量）完好保留，`.env` 配置未被测试触碰。

### 10.19 孕周锚点自动推算（孕x周x天）与报告区块归属优化 (v1.57.1)

#### 10.19.1 业务背景与改造目标
1. **孕周自动推算断链**：无预产期用户录入过一次孕期数据（如 2026-05-01 孕1周）后，再次打卡选其他日期孕周仍要求手填——后端 `gestation_engine` 双基准推算能力（预产期 280 天模型 > 最早打卡锚点外推）未贯通到前端两条录入链路；
2. **粒度不足**：孕周仅有整周展示，缺少「孕x周x天」天粒度（05-01 孕1周 → 05-02 应显示孕1周1天）；
3. **报告区块归属不清**：「展开/收起分析报告」按钮挂在模块头部（与导出按钮并排），距报告内容区过远，用户无法分辨"分析报告"指哪部分内容。

#### 10.19.2 架构设计与实现落地
1. **锚点自动推算贯通**：新增 `frontend/src/utils/gestation.ts` 共享工具（`computeGestation` 280 天模型/锚点外推、`gestationLabel` 孕X周/孕X周Y天格式、`extractGestationAnchor` 最早孕期打卡锚点——与后端 `first_anchor` 查询口径一致）；打卡弹窗与深度 BMI 表单孕期模式下无预产期但有锚点时孕周随日期自动推算预填（±1 周微调、超偏差后端拦截），完全无基准才手填；日期变更即时联动（05-01 孕1周锚点：选 05-08 自动"孕2周"、选 05-02 自动"孕1周1天"）；
2. **孕x周x天全链路**：`validate_gestational_week` 全部成功路径透出 `days`（周内天数 0~6，手填与推算一致沿用推算天数、微调 ±1 归零、40 周封顶超期保留），随 `exam_items.gestational_days` 零迁移存储；显示层统一 `gestationLabel`（历史表阶段列、明细卡片徽章、图表轴标签与 tooltip、报告摘要），历史无 days 记录降级整周；CSV 导入 mom 模板 `week` 列支持小数（23.5 = 孕23周3天）；
3. **相邻日期兼容**：锚点次日起任意日期可打卡（同日唯一 409 覆盖机制与按日推算互不冲突），从机制上支持"录完 05-01 再录 05-02"的连续补录场景；
4. **报告区块归属重构**：折叠按钮下移至报告区块自身标题栏——报告包裹独立卡片（📊 本次分析报告 + 评估摘要行「孕X周Y天评估 · 实际增重 Xkg（状态）」+ 收起/展开报告内容按钮），收起仅留标题栏、展开显示五区块完整内容；模块头部仅保留「导出评估报告」。

#### 10.19.3 验证结论
- 后端冒烟（用户真实锚点 2026-05-01 孕1周）：05-02→孕1周1天 / 05-08→孕2周 / 今天→孕24周1天推算全对；validate 自动填充透出 days、手填一致透传/微调归零/偏差>1 拦截、BMI 接口自动归档孕1周1天 note + 存储 + 时序透出、同日 409、历史 days=None 降级整周——全部通过；
- 浏览器全链路：打卡弹窗今天预填 24 / 05-08 预填 2 / 05-02 预填 1（提示"按首次打卡 2026-05-01 孕1周自动推算"）、05-02 保存归档后历史表·明细卡片·看板均显示"孕1周1天"、深度表单推算提示、报告标题栏折叠按钮（收起隐藏曲线区/展开恢复/模块头部无旧按钮）、console 零 JS 错误；
- 测试数据已清理（05-02、10-09 两条验证记录批删），用户原有数据（05-01/05-08/05-15 三条孕期打卡 + 宝宝测量）完整保留。

### 10.20 孕周输入自动填充修复与孕x周x天双输入 (v1.58)

#### 10.20.1 业务背景与根因定位
1. **自动填充失效**：v1.57.1 孕周输入框仅显示 placeholder「自动推算」却无数值填充，用户仍需手填——填充实现依赖 `useEffect`（依赖 `gestation?.week`）setState 回填，「推算值未变化不触发 effect」「弹窗打开重置与填充执行顺序竞争」「锚点异步加载时序」多重竞态叠加，输入框常为空；
2. **天粒度不可修正**：仅有整周输入框，推算出的周内天数（如孕24周1天的"1天"）无法被用户手动修改。

#### 10.20.2 架构设计与实现落地（派生显示值方案）
1. **模型转换（消除填充竞态）**：删除「effect 回填」→「touched 标记 + 派生显示值」：`weekDisplay/daysDisplay = !weekTouched/daysTouched && gestation ? String(推算值) : 手填值`——未编辑时输入框直接绑定推算值（填充绝对可靠、无时序依赖），onChange 置 touched 尊重用户值；effect 职责收缩为「日期/模式变化时重置 touched 回自动推算」，不再承担填充职责；
2. **孕x周x天双输入框**：打卡弹窗（`UnifiedHealthCheckIn`）与深度 BMI 表单（`BmiFormCard`）两组件同构改造——孕周块统一「[周] 周 [天] 天」双输入（周 1~42 必填、天 0~6），placeholder「自动推算」/「天」，标签与提示行显示推算依据（档案预产期 / 首次打卡锚点），周与天均可手改（周偏差 ±1 周内，超差后端 400 拦截）；深度表单产后月龄同步升级 `postpartumMonthsDisplay` 派生值（宝宝生日推算优先、可手改）；
3. **提交与后端采纳优先级**：提交一律以显示值为准（未编辑=推算值、编辑=用户值），`gestational_days` clamp 0~6 上送（打卡 409 覆盖重发链路同口径）；`BmiAnalysisInputSerializer` 新增 `gestational_days`（0~6 可选），BMI 分析接口用户显式传天数优先采纳（clamp 0~6）、未传沿用孕周引擎推算值，周数仍经双基准校验（偏差 >1 周 400 拦截），`gestation_check.days` 回透最终采纳值。

#### 10.20.3 验证结论
- 浏览器全链路（用户真实锚点 2026-05-01 孕1周）：深度表单今天自动填充 24/1、05-08 → 2/0、05-02 → 1/1，手改天数=3 后 05-16 提交落库「孕3周3天」；打卡弹窗今天 24/1、05-17 → 自动 3/2、手改天=4 后落库「孕3周4天」，同日 409 覆盖条出现与取消正常；console 零 JS 错误；
- 数据治理：测试数据（05-16、05-17 两条）批删清理，用户原有 8 条记录完整保留（数据库核验通过）；新主包 `index-AFe2A9fr.js` 构建同步并重启生效。


### 10.21 全面复查闭环重构与系统体验深度优化 (v1.59)

#### 10.21.1 业务背景与复查问题识别
在 v1.58 孕周推算与双输入落地后，对系统代码和运行效果做全面二次复查，发现 6 大核心优化点：
1. **健康日历记录类型脱节与未来日期异常**：`HealthCalendar` 仅硬编码匹配 `vaccine`，导致后端返回的标准 `vaccination` 类型被降级为灰色无格式文本且丢失疫苗名称；同时日历点击未来日期会透传给打卡弹窗，导致后端 400 校验拦截。
2. **宝宝生长曲线单Y轴严重挤压与女童标准缺失**：身高/头围 (35~100cm) 与体重 (3~15kg) 共用单一 Y 轴，导致体重走势被极度压缩扁平化；且仅内置男童 WHO 标准，女童档案无法对照。
3. **主导航架构健康中心入口缺失**：顶栏与移动端底栏缺少 `/health` 导航入口，用户依赖外链或首页卡片跳转。
4. **妈妈档案 Tab 1 双列表展示冗余**：上方已有 `BmiHistoryTable`，下方又全量渲染 `momRecords` 卡片流，列表重复、分页与批量删除重复，造成长达 3000px 的无谓垂直滚动。
5. **跨组件数据刷新脱节**：`BmiAnalysisView` 为无 props 自闭环组件，当用户通过页头「健康打卡」或「CSV导入」更新数据时，看板与图表不会自动重载；反之在 BMI 卡片删除记录时外层 `HealthPage.records` 亦不联动。
6. **多页面暗黑模式 (Dark Mode) 样式缺失**：`HomePage`、`ProductListPage`、`HealthCalendar` 等核心页面缺乏 `dark:` 适配类，深色主题下产生不可读暗色文字。

#### 10.21.2 架构重构与实现细节
1. **日历类型全兼容与未来日期防护 (`HealthCalendar.tsx`)**：
   - `TYPE_COLORS` 与 `TYPE_LABELS` 全面支持 `vaccination` 与 `vaccine`，恢复疫苗名称与蓝色徽章。
   - 增加 `isFuture` 禁用判定，未来日期单元格样式置灰 (`opacity-40 cursor-not-allowed`)，禁用点击，附带中文提示气泡，彻底阻断未来日期误触。
   - 补全月份切换、星期栏、日期单元格的 dark mode 样式。
2. **生长曲线双Y轴体系与女童WHO标准 (`GrowthChart.tsx`)**：
   - 新增 `WHO_P50_GIRL` 0~3岁女童标准数据表，插值函数 `whoP50` 增加 `gender` 入参支持。
   - ECharts 改为双 Y 轴：左轴为「长度 (cm)」（身高、头围及其WHO参考线），右轴为「体重 (kg)」（体重及其WHO参考线，`splitLine` 隐藏）。
   - Tooltip 智能按指标格式化单位 (`cm`/`kg`)，底部文字按宝宝性别动态显示参考标准。
   - `HealthPage` 宝宝生长档案头部自动通过 `authApi.babies()` 识别宝宝性别并提供男童/女童基线手动切换按钮。
3. **主导航顶栏底栏一键直达 (`MainLayout.tsx`)**：
   - `ALL_navItems` 正式纳入 `{ to: "/health", label: "健康中心", icon: HeartPulse, perm: "menu_health" }`。
4. **妈妈档案单表融合与折叠详情 (`BmiHistoryTable.tsx` & `views.py`)**：
   - 后端 `_build_bmi_timeseries` 补齐返回 `ai_analysis` 字段。
   - `BmiHistoryTable` 增加折叠详情行 (`expandedIds`)，点击操作栏「详情」展开查看打卡备注与 AI 临床解读，并内置 `CopyButton` 快捷复制。
   - `HealthPage` 移除底部重复渲染的 `momRecords` 卡片流，移除冗余分页与批删状态，页面精简度大幅提升。
5. **跨组件双向数据联动与409覆盖完善 (`BmiAnalysisView.tsx` & `HealthPage.tsx`)**：
   - `BmiAnalysisView` 增加 `refreshTrigger` 属性与 `onRecordChanged` 回调，打卡或导入时外部触发看板拉取，内部修改或删除时向外通知 `HealthPage.load()`。
   - 完善 409 异常提取：同时检查 `err?.data` 与 `err?.response?.data?.data`，确保同日覆盖弹窗 100% 触发。
   - 清除 `services.ts` 中误放于 `shoppingApi` 的冗余 `analyzeBmi`。
6. **多页面深色模式 (Dark Mode) 全面对齐**：
   - `HomePage.tsx`、`ProductListPage.tsx`、`ProductCard.tsx`、`HealthCalendar.tsx` 补齐 `dark:text-gray-100`、`dark:bg-gray-800` 等类名。

#### 10.21.3 验证效果
- 前端 `tsc -b && vite build` 生产构建通过，0 错误，静态产物同步到 `templates/` 和 `static/assets/`。
- Django 后端 `manage.py check` 0 警告通过。

---

### 10.22 健康打卡与分析报告闭环联动、双向折叠与状态持久化 (v1.60)

#### 10.22.1 业务背景与问题复盘
在 v1.59 优化后，用户反馈：通过「健康打卡」或「一键分析评估 & 归档至时序档案」录入新数据时，原有的「展开分析报告 / 收起分析报告」模块未展示或无法找到。经深入排查，发现以下三大核心体验断层：
1. **折叠/展开按钮位置迁移与视觉盲区**：在 v1.57.1 中，顶部工具栏常驻的「展开/收起分析报告」按钮被移至卡片 4（分析报告卡片）内部标题栏，且文案改为「展开/收起报告内容」。由于卡片 4 位于录入表单、时序看板、历史数据表格的最下方，用户在上方提交后视口停留在上部，被中间长图表和表格阻隔，加上顶部按钮已移除，直观上产生“分析报告模块丢失”的体验。
2. **健康打卡弹窗数据链路断层**：统一健康打卡弹窗（`UnifiedHealthCheckIn`）提交时虽调用了 `analyzeBmi` 接口，但接口返回的分析评估对象 `res` 未回传给外层，导致 `BmiAnalysisView` 的 `result` 状态始终为 `null`，使得打卡后分析报告区块完全不渲染。
3. **分析结果内存状态非持久化**：`result` 状态仅保存在 React 临时状态中，用户刷新浏览器页面或在 Tab（如宝宝生长/时间轴）之间切换后再返回，`result` 被清空，报告瞬间蒸发。

#### 10.22.2 架构设计与实现细节
1. **数据联动全链路打通 (`UnifiedHealthCheckIn.tsx` & `HealthPage.tsx`)**：
   - `UnifiedHealthCheckInProps` 的 `onSaved` 回调签名扩展为 `(archiveHint: string, analysisResult?: BmiAnalysisResult | null) => void`。
   - 首次打卡与 409 同日覆盖提交时，完整捕获 `healthApi.analyzeBmi` 返回的 `res` 结果对象并通过 `onSaved` 传出。
   - `HealthPage` 维护 `latestAnalysisResult` 状态并透传给 `<BmiAnalysisView externalAnalysisResult={latestAnalysisResult} />`，实现打卡即时联动。
2. **聚焦具体报告处的唯一定位折叠控制与自动平滑直达 (`BmiAnalysisView.tsx`)**：
   - 针对多处折叠按钮重复展示问题，收拢全局交互：移除顶部横幅及底部的多余冗余折叠按钮与提示条，仅在「本次分析报告」卡片标题栏保留唯一的 `【展开分析报告 / 收起分析报告】` 控制按钮。
   - 当用户在表单点击「一键分析评估」或从外部健康打卡弹窗完成打卡时，自动将报告置为展开态，并通过 `reportSectionRef` 平滑滚动定位直达报告卡片。
   - 折叠态下报告卡片保留紧凑单行标题栏，用户点击即可无缝展开，界面纯粹精炼无重复干扰。
3. **分析结果客户端持久化留存 (`sessionStorage`)**：
   - 引入 `STORAGE_KEY = "mengya_latest_bmi_analysis"`，在 `useState` 初始化时自动从 `sessionStorage` 还原最近一次生成的医学评估报告。
   - 统一封装 `updateResult` 调度器，确保用户在切换 Tab 或刷新页面后，最新一期的评估档案依然稳定呈现，杜绝报告数据“瞬时蒸发”。

#### 10.22.3 验证效果
- 验证一键分析评估链路：表单提交后顶部展开/收起按钮点亮，页面自动平滑滚动直达报告区域，点击收起后底部提示条与顶部按钮同步联动。
- 验证健康打卡弹窗链路：右上角打卡保存后，自动回传最新分析报告并平滑定位展示，数据与图表、表格完全一致。
- 验证刷新与 Tab 切换留存：刷新页面后评估报告依然完整保留，支持随时展开/收起。
- 生产构建与静态资源全量同步，前端 `tsc -b && vite build` 0 错误编译通过。

---

### 10.23 健康时间轴全景多视图重构、时序空数据自适应折叠与分析报告篇幅精简 (v1.61)

#### 10.23.1 业务背景与问题复盘
1. **健康时间轴名实错位且缺乏统计图表**：原「健康时间轴」Tab 仅提供传统的按月网格日历（`HealthCalendar`），缺少纵向垂直时间轴流（Timeline），数据稀疏时留白多，密集时单日无法展开详情；且缺乏对产检、生长测量、疫苗接种等健康活动的宏观统计图表洞察。
2. **时序看板与历史表格清空后空白占用严重**：当数据被清空或无数据时，`BmiTimeSeriesBoard` 固定渲染了 320px 高的空白图表框，`BmiHistoryTable` 亦常驻大边距占位，在表单下方堆叠近 800px 无效留白，破坏视觉紧凑度。
3. **分析报告默认展开导致页面篇幅过长**：分析报告卡片展开后包含预警、4列指标、WS/T走势图、食谱、运动关怀等上千像素内容，默认展开导致刷新或切换 Tab 后页面严重过长，产生视觉压迫感。

#### 10.23.2 架构重构与实现细节
1. **健康时间轴全景多视图体系 (`HealthTimelineView.tsx` & `HealthPage.tsx`)**：
   - **时间轴流 (Timeline)**：经典左侧纵向时间基线 + 节点类型高亮光标，时间倒序排列；卡片清晰呈现测量指标芯片（身高/体重/头围/血压/体温等）、打卡备注与 AI 解读；提供「全部 / 孕期产检 / 宝宝生长 / 疫苗接种」实时分类筛选器。
   - **统计图表看板 (Charts)**：引入 ECharts 统计看板，包括：① 近 6 个月健康打卡活跃度与类型分布堆叠柱状图；② 健康档案记录类型构成环形饼图；数据动态响应。
   - **经典月历总览 (Calendar)**：完整保留 `HealthCalendar` 月度网格视图，保留点击历史日期快速补录健康打卡能力。
   - **顶部宏观统计与视图切换器**：顶部卡片展示总打卡数、产检数、生长测量数、疫苗数及最近打卡日；右上角提供三选一切换器并持久化偏好至 `localStorage`。
   - **统计图表独立生命周期解耦与白屏根治**：将 ECharts 统计看板封装为独立受控子组件 `HealthChartsBoard`，组件挂载时初始化并绑定 `ResizeObserver` 尺寸监听与首帧重绘，组件卸载时立即 `dispose()` 释放实例，彻底根除视图切换后因旧实例悬空导致的图表空白问题。
2. **时序看板与历史表格自适应折叠 (`BmiTimeSeriesBoard.tsx` & `BmiHistoryTable.tsx`)**：
   - `BmiTimeSeriesBoard`：当 `records.length === 0` 或筛选无数据时，自动折叠收起 320px 的空白图表框与冗余筛选器，转为轻量紧凑的引导栏；标题栏右侧增加折叠/展开开关，有数据时亦可随时自主收拢。
   - `BmiHistoryTable`：无数据时收缩多列空表格框架与内边距，呈现紧凑引导；同样支持头部一键折叠表格。
3. **分析报告默认收起策略 (`BmiAnalysisView.tsx`)**：
   - `reportCollapsed` 初始状态设为 `true`（默认收起），常态下仅展示 52px 高度的精致单行标题栏与评估摘要，彻底根除页面过长问题。
   - 仅当用户在当前表单主动点击「一键分析评估」时，临时切换为展开态并平滑滚动直达报告区域。

#### 10.23.3 验证效果
- 前端 `tsc -b && vite build` 0 错误编译通过，生产静态资源全量同步。
- 时间轴流、统计图表、经典日历三重视图切换顺畅；空数据状态下时序看板与历史表紧凑自适应折叠，留白占用彻底消除；分析报告默认收起，页面篇幅美观清爽。
---

### 10.24 首页定时轮询抖动根除与时序看板图表生命周期完整联动 (v1.62)

#### 10.24.1 业务背景与问题复盘
1. **首页停驻时每隔 15 秒页面剧烈抖动与闪烁**：
   - 现象：停留在系统首页，每隔约 15 秒整个页面内容瞬间消失替换为“加载中…”，随即恢复，造成强烈的视觉跳动与滚动条抖动。
   - 根因：`RequireAuth` 的 15 秒定时器持续调用 `fetchMe()`。每次返回的 JSON 数据反序列化出新的 `data.stage` 对象引用。`HomePage.tsx` 的 `useEffect` 依赖了 `[stage]` 对象，引发 `fetchHomeData()` 反复重发。同时 `fetchHomeData()` 首行调用 `setLoading(true)`，触发顶层 `if (loading)` 条件拦截，将整个几千像素高度的页面 DOM 销毁并替换为 80px 的加载中占位，数据返回后再重建 DOM，导致页面周期性塌陷重建。
2. **妈妈孕产档案多维度时序图表新增数据后持续空白**：
   - 现象：在「妈妈·孕产档案」录入身高体重打卡或一键分析后，下方的「测量打卡历史数据表」已有新增数据，但上方的「多维度时序图表看板」仍然是一片空白，且手动点击展开/收起依然无图表。
   - 根因：在 v1.61 的空数据自适应收拢设计中，当无记录时 `isCollapsed === true`，JSX 条件渲染分支中并未挂载 `<div ref={chartRef} />`。而组件中 ECharts 实例的初始化写在仅执行一次的 `useEffect([], ...)` 中。当组件首次挂载时，`chartRef.current` 为 `null`，初始化被直接 `return` 跳过，`chartInstanceRef.current` 永久滞留在 `null`。当用户新增第一条数据后，组件重绘并挂载了图表 DOM，但 Mount 钩子不再触发；图表数据更新钩子又因 `!chartInstanceRef.current` 拦截而直接退出，导致 ECharts 实例永远未被创建，图表持续空白。

#### 10.24.2 架构重构与实现细节
1. **首页静默刷新机制与引用防抖 (`HomePage.tsx` & `authStore.ts`)**：
   - `authStore.ts`：在 `fetchMe` 逻辑中加入 `stage` 结构化比较。针对 `type`、`is_pregnant`、`value`、`label`、`week_days_text` 等核心字段进行比对，若未发生真实变更则保持既有对象引用，防止状态机发出虚假重绘事件。
   - `HomePage.tsx`：将 `useEffect` 依赖解耦为基元合成键 `stageKey = ${stage?.type || ""}_${stage?.is_pregnant ? "1" : "0"}_${stage?.value || 0}`，彻底隔离对象引用干扰。
   - `HomePage.tsx`：将全量 Loading 拦截优化为首屏条件判断（仅在初次无任何数据时展示），常规刷新与阶段更新均采用后台异步静默更新（`fetchHomeData(silent)`），接口返回后原地替换状态，杜绝 DOM 结构瞬态销毁与页面抖动。
2. **多维度时序图表生命周期与折叠态完全联动 (`BmiTimeSeriesBoard.tsx`)**：
   - 实例创建与数据渲染统一解耦：移除原脱节的挂载单次 `useEffect([], ...)`，统一在响应 `[isCollapsed, filtered, viewMode, isDark, loading]` 的主作用域中执行管理。
   - 容器挂载原地懒初始化：当 `!isCollapsed && chartRef.current` 满足时，自动通过 `echarts.getInstanceByDom(container) || echarts.init(container)` 完成实例激活与挂载，确保新增数据切换展开时 100% 能够捕获到真实的 DOM 节点并立即绘制。
   - 资源受控清理：当折叠或组件卸载时，自动断开 `ResizeObserver` 并执行 `chart.dispose()`，重置实例指针，消除内存泄露与游离画布。
   - 动态留白与单点适配：Category 轴设置 `boundaryGap: filtered.length > 1 ? false : true`，确保新增单条打卡时数据点居中、图表美观。
   - 状态自动复位：监听 `records.length === 0` 时自动重置 `collapsedManually` 为 `null`，确保数据清空后重新打卡时图表能够自动展开激活。

#### 10.24.3 验证效果
- 验证首页停留行为：在首页停留连续观察多次 15s 轮询周期，网络面板正常静默同步用户信息，首页 DOM 稳定无任何抖动、无白屏闪烁。
- 验证妈妈孕产档案看板：初始无数据时紧凑自适应折叠；点击表单打卡或一键分析后，多维度时序图表看板即刻自动展开并流畅渲染出实测走势点线与 WS/T 801 安全通道带，与历史数据表保持 100% 实时同步；多次手动折叠/展开图表均能稳定呈现。
- 生产环境构建：`python build_frontend.py` 成功执行，TypeScript 检查 0 报错，产物完整同步。

---

### 10.25 天气万年历全景融合、首页走秒天气横幅与 AI 模型列表手动拉取 (v1.63)

#### 10.25.1 业务背景与迁移意图
为丰富萌芽（Mengya）平台的生活关怀与智能化配置能力，从兄弟项目（记账伴侣）中深度萃取并重构三大核心功能：
1. **首页天气温差展示**：在系统首页首屏提供轻量级生活气象与时间关怀卡片，包含当前时刻走秒时钟、公历/农历干支生肖、二十四节气、法定节假日调休“班/休”徽章、实况天气温度与今明温差，提升用户粘性与关怀温度。
2. **天气与万年历全景融合页面**：
   - 解决用户在孕育期对天气出行与传统历法吉日的复合查询需求；
   - 原项目存在「日历」与「万年历」概念重复与割裂的问题。本次重构实施**方案 A（万年历与天气统一视图）**，将 1900~2100 年寿星天文历高精度公农历换算、国务院法定节假日班休调休、Open-Meteo 15 天高低温预报、ECharts 走势图与空气质量指数（AQI/PM2.5）无缝融合为同一页面的上下级联架构。
   - **严格排除原项目专有功能**：彻底剔除天气页中与母婴场景无关的「在次日举办宴席」功能，确保目标项目纯净无残留。
3. **AI 助手配置页「手动获取模型列表」**：
   - 支持在配置第三方 OpenAI 兼容大模型（如 DeepSeek、通义千问、Moonshot、LocalAI、vLLM）时，一键调用 `{base_url}/models` 端点拉取模型清单并以标签形式快速点选回填；
   - 严格接入系统现有 RBAC 权限控制体系，受按钮级权限精确守卫。

#### 10.25.2 架构重构与适配落地
1. **后端基础服务与网络韧性**：
   - **`holiday_service.py`**：接入 Timor.tech 法定节假日公报数据，内置 2024~2026 年国务院官方班休离线字典兜底；设计进程内存与 `data/holiday_cache.json` 磁盘双层缓存及 1 小时失败冷却；采用“禁代理直连优先 + 系统代理重试”双路径策略，规避代理失效挂死。
   - **`weather_service.py`**：调用 Open-Meteo 免费气象接口，支持三级级联经纬度直接查询与自由城市名检索，覆盖 15 天预报指标（天气码、高低温、降水概率、日出日落、紫外线）与空气质量（US AQI、PM2.5、PM10）。
   - **`ai_service.py`**：新增 `fetch_model_list` 与 `_ai_http_get` 方法，安全请求远端 `/models`，健全超时与 401/403 异常解析。
2. **全链路 RBAC 权限联动（菜单、路由、按钮三位一体）**：
   - **权限项注册 (`apps/core/utils/permissions.py`)**：
     - `menu_weather`（默认 True）：页面菜单访问权限，定义于“页面菜单访问权限”组；
     - `ai_fetch_models`（默认 False，管理员默认通行）：按钮级操作权限，挂载于 `menu_ai_assistant` 父级节点。
   - **后端 API 守卫 (`apps/core/views.py`)**：
     - `WeatherQueryView` (`/api/weather/query/`) 与 `HomeWeatherView` (`/api/weather/home/`) 统一调用 `check_permission_or_403(user, "menu_weather")` 拦截无权请求；
     - `AIConfigModelsView` (`/api/users/ai-config/models/`) 严格校验 `ai_fetch_models`（普通用户无权即报 4030）。
   - **前端界面联动**：
     - 菜单项 (`MainLayout.tsx`)：无 `menu_weather` 权限时底部导航与菜单隐藏；
     - 路由守卫 (`App.tsx`)：`<PermissionGuard perm="menu_weather"><WeatherPage /></PermissionGuard>` 拦截直接地址栏访问并重定向；
     - 快捷入口 (`HomePage.tsx`)：`quickEntries` 联动隐藏；
     - 按钮级显隐 (`AIConfigPage.tsx`)：`canFetchModels = user?.is_staff || hasPermission("ai_fetch_models")` 精准控制「获取模型列表」按钮显隐，无权限不渲染。
3. **前端高内聚组件与篇幅控制优化**：
   - **`chinaRegions.ts`**：精简打包全国 34 省、476 市、2875 区县标准层级树及高精度经纬度坐标，支持一键级联直查免去后端模糊匹配延迟。
   - **`lunar.ts`**：纯前端寿星天文历实现，无第三方庞大依赖，支持 1900~2100 年农历月日、生肖干支、二十四节气与传统佳节。
   - **`HomeWeatherBanner.tsx`**：响应式渐变横幅，左侧走秒时钟与农历节气班休，右侧轻量实况卡片（点击平滑路由直达 `/weather`）；无权限时仅展示时钟农历，优雅降级。
   - **`WeatherPage.tsx`**：
     - 首屏实况大卡：突出气温、天气描述、风向风速、湿度、空气质量胶囊与紫外线；
     - 趋势折线图：ECharts 15 天高低温双平滑曲线，标注今日锚点；
     - 统一万年历视图：年月切换栏、法定休/班彩色圆点角标、预报期浮标与单日综合详情面板（公农历、干支冲煞、节假日安排、当日天气预测），信息层次分明，篇幅适度紧凑。

#### 10.25.3 验证效果
- **功能验收**：首页天气时钟、天气万年历预报、AI 模型列表拉取三大功能全部就绪。
- **排除项核验**：全文代码无任何「举办宴席」或 `banquet` 相关残留。
- **权限闭环验证**：使用无权限账号实测，菜单与快捷入口不显示、路由访问被拦截、模型拉取按钮隐藏；通过管理员授权后功能秒级放行。
- **构建与测试**：前端 TypeScript 检查与打包 0 错误；后端 RBAC 自动化测试 100% 通过。

---

### 10.26 天气页面白屏根治、健壮性治理与首页天气宝宝卡一体化重构 (v1.64)

#### 10.26.1 业务背景与问题复盘
1. **天气页面及点击查询白屏根因**：
   - **React 18 Object-as-Child 致命渲染崩溃（核心根因）**：后端 `weather_service.py` 的 `_build_result` 方法中，返回字典的 `'city'` 字段直接塞入了 GeoNames 地理编码字典对象 `{'name': '...', 'latitude': ..., ...}`，而非预期的纯字符串。前端 `WeatherPage.tsx` 在首屏和定位大卡中直接执行 `{weatherData?.city}`。React 18 遇到直接渲染普通 Object 时，抛出非捕获运行时错误：`Objects are not valid as a React child (found: object with keys {admin1, admin2, country, latitude, longitude, name, timezone})`，导致整页 React 组件树被卸载，页面彻底白屏。
   - **`localStorage` 脏数据自放大**：`loadWeatherByCoords` 将 `data.city`（即 `[object Object]`）写入本地缓存；刷新后读出字符串 `"[object Object]"` 并再次向后端请求，持续报错。
   - **Open-Meteo GeoNames 中文行政地名 404**：GeoNames 中文库不收录含“市/区/县”的地名（如“成都市”、“双流区”、“四川省成都市”均会返回 404）。自由搜索未做清洗，导致用户搜索常见城市名直接报错并把 `weatherData` 设为 `null`。
   - **级联查询无坐标时静默失效**：部分区县节点缺失经纬度坐标时，原代码直接 `return`，用户点击“定位查询”毫无反应。
2. **首页天气显示框与宝宝标签框冗余问题**：
   - 原 `HomePage.tsx` 首屏上下纵向堆叠两个大型彩色渐变卡片（顶部 `HomeWeatherBanner` 约 190px + 紧随其后的 `孕期/宝宝阶段卡` 约 220px），纵向占用超过 410px；
   - **问候语重复**：天气卡显示“上午好，准妈妈”，阶段卡又显示“准妈妈，你好呀”；
   - **首屏挤压严重**：将真正核心的孕周胎儿发育、快捷功能入口与个性化推荐挤至第二屏下方，影响操作效率。

#### 10.26.2 架构重构与优化落地
1. **后端气象服务高韧性重构 (`apps/core/services/weather_service.py`)**：
   - **规范字符串与对象解耦**：`_build_result` 中将 `'city'` 强制提取为纯字符串 `city_name`，完整地理字典移入 `'location'`，并补齐 `'feels_like'` 体感温度别名，彻底根除前端对象渲染报错。
   - **智能多级地名清洗容错**：在 `geocode_city` 中扩展多级规范化规则，支持自由搜索自动剥离“特别行政区/省/市/区/县”等后缀，支持“四川省成都市”→自动提取“成都”，“成都市双流区”→提取“双流”，100% 成功命中。
2. **天气页面防御与健壮性改造 (`frontend/src/pages/WeatherPage.tsx`)**：
   - **防御性提取城市名**：`displayCity = typeof weatherData?.city === "string" ? weatherData.city : (weatherData?.city as any)?.name || "天气预报与万年历"`，杜绝 JSX 渲染非字符串。
   - **清除 `[object Object]` 历史脏缓存**，过滤无效缓存。
   - **级联查询向上多级兜底**：区县无坐标时回退市级、市级无坐标时回退省级，保障必定发起查询。
   - **ECharts 实例全生命周期管理**：添加 `try...catch` 保护，组件卸载时调用 `dispose()` 释放实例。
   - **新增加载骨架与错误恢复按钮**：查询出错时提供“重置为默认城市 (成都)”按钮，绝不白屏。
3. **首页全景关怀横幅深度整合 (`HomeWeatherBanner.tsx` & `HomePage.tsx`)**：
   - **统一全景关怀横幅**：将阶段身份、阶段修改胶囊按钮与关怀寄语内嵌至 `HomeWeatherBanner`：
     - **头部**：统一动态问候（“上午好，准妈妈”）+ 可点击的阶段徽章胶囊（如「孕 24 周 · 孕中期 [修改]」直接唤起 `SetStageModal`）+ 陪伴寄语；
     - **中部**：左侧走秒时钟、公历年月日、农历干支生肖、二十四节气与班/休徽章；右侧实况天气微卡（点击平滑路由直达 `/weather`）；
   - **首屏纵向空间减负**：移除下方冗余的独立阶段大卡片，首屏纵向空间**节省超过 180px**，孕周发育卡与快捷入口无缝升至第一屏黄金视域。
4. **单终端登录会话兼容保障**：
   - 明确 `SingleSessionJWTAuthentication` 与 `user.active_token_jti` 的一致性验证机制，保障自动化测试与日常使用的会话安全性。

#### 10.26.3 验证效果
- **天气页面与查询白屏测试**：实测“成都”、“成都市”、“双流区”、“北京”、“四川省成都市”等自由文本查询与经纬度级联查询，全部 100% 成功返回 `code: 0`，`city` 严格为 `str` 类型，页面渲染稳定无白屏。
- **首页排版核验**：首页首屏布局紧凑大气，问候语无重复，阶段设置点击即刻呼出弹窗，胎儿发育与快捷入口直观可见。
- **全链路权限守卫**：无 `menu_weather` 权限返回 HTTP 403，有权限放行；AI 模型拉取按钮受 `ai_fetch_models` 权限精确守卫。
- **构建与重启**：前端 TypeScript 检查与打包 0 错误；本地 Django 一体化服务无缝重启（端口 5173）。


---

### 10.27 首页关怀小锦囊管理员后台、阶段自适应与气象按需级联直查 (v1.65)

#### 10.27.1 业务背景与问题复盘
1. **首页引导大卡片中间留白偏多与内容单薄**：原首页全景横幅在中部存在大面积视觉留白，缺少有针对性的科学育儿与孕期健康指导信息。为提升用户粘性与关怀温度，需在横幅中栏新增【今日关怀小锦囊 · 专属贴士卡】，并提供管理员专属配置后台，支持系统内置与自定义提示信息的灵活维护。
2. **育儿阶段匹配错位与贴士停滞缺陷**：
   - 当宝宝成长至幼儿期（如 2 岁 8 个月 8 天，32 个月）时，因原判断逻辑未优先拦截幼儿期特征，被包含“个月”字样错误拦截为婴儿期，导致始终显示婴儿期贴士；
   - 管理员配置专属贴士后，首页卡片未跟随当前宝宝阶段自动更新，始终停留在通用/备孕阶段贴士。
3. **气象页面网络请求过频与级联查询强制受限**：
   - 原天气页面点击进入即自动发起网络请求拉取天气，造成不必要的外部接口消耗；
   - 原省市区三级级联必须逐级选择直至“区县”，用户无法单独查询“省”（如直辖市/省会）或“省+市”（如四川省成都市）天气，交互繁琐。
4. **AI 模型列表拉取后缺乏折叠设计**：点击获取模型列表后，候选模型标签默认全量铺满展开，页面纵向数据过度膨胀且无法折叠，严重挤压表单布局。
5. **阶段设置倒计时跳回与失效**：用户在首页或个人中心设置孕育阶段（如切换至“怀孕中”或“宝宝已出生”）停留 5~10 秒时，因后台定时轮询浅比较缺陷引发虚假重绘刷新，导致用户刚刚保存的设置被自动冲刷还原。

#### 10.27.2 架构重构与优化落地
1. **今日关怀小锦囊实体与管理员后台落地 (`DailyTip` & `DailyTipsManagePage.tsx`)**：
   - **模型设计 (`apps/core/models/daily_tip.py`)**：新增 `DailyTip` 实体，定义 `title`（标题）、`content`（内容）、`tag`（标签）、`stage_type`（适用阶段：newborn/infant/toddler/pregnancy/general）、`is_active`（启用状态）、`is_builtin`（内置标记）、`sort_order`（排序序号）；在 `SystemSetting` 中增加 `daily_tip_display_count` 控制全局展示条数。
   - **数据迁移与种子服务 (`DailyTipService`)**：编写标准迁移脚本并内置 18+ 条覆盖新生儿、婴儿期、幼儿期、孕期与通用的权威指导锦囊，支持一键重置恢复系统内置。
   - **管理员配置接口 (`apps/core/views_daily_tips.py`)**：提供分页列表检索、单选/多选/全选批量启停与删除、单条编辑/新增、展示条数全局配置与重置内置接口，受 `IsAdminUser` 权限守卫。
   - **管理前端组件 (`DailyTipsManagePage.tsx`)**：提供响应式表格、状态徽章、批量操作浮条、阶段分类筛选与分页控制面板。
2. **首页全景横幅三栏重构与阶段优先级纠偏 (`HomeWeatherBanner.tsx`)**：
   - **三栏式宽屏响应式网格**：左侧 5 列（问候+阶段徽章+走秒时钟与农历节气）、中栏 4 列（【今日关怀小锦囊 · 专属贴士卡】，支持阶段徽章、权威科普标签、换一条旋转动画）、右侧 3 列（气象万年历微卡），彻底消除中间大面积留白。
   - **阶段判定算法优先级纠偏**：在 `targetStageKey` 中将幼儿期（`toddler`）判断条件（`calcMonths > 12`、`years > 0` 或 `labelStr.includes("岁")`）前置于婴儿期，确保 1 岁以上宝宝 100% 精准匹配幼儿期贴士。
   - **气象最后查询与权限兜底联动**：右侧气象微卡优先拉取当前用户最后一次查询的城市天气（不论级联还是自由搜索，通过 LocalStorage 与全局事件即时同步）；若当前用户无 `menu_weather` 权限，自动降级展示管理员配置的预设城市天气，并展示来源提示。
3. **天气页面按需查询与独立分级直查 (`WeatherPage.tsx`)**：
   - **默认离线万年历模式**：进入天气页默认不拉取任何外部气象数据，仅呈现本地高精度万年历、节气与法定节假日班休信息，用户点击【查询天气】后再发起远程请求，彻底杜绝请求浪费。
   - **独立分级直查**：重构级联选择器，用户可以单独查询省份（如四川省）、城市（如四川省成都市）或区县，不再强制要求选至第三级。
4. **AI 模型列表收起/展开与自动折叠交互 (`AIConfigPage.tsx`)**：
   - 获取模型列表后，默认呈现紧凑精简条（展示已拉取数量与已选模型），提供【展开列表】按钮；展开后支持关键词搜索过滤，**用户点击任意候选模型后自动回填并立即触发列表折叠收起**，兼顾高效率与页面篇幅。
5. **阶段设置状态防抖与轮询静默锁 (`authStore.ts` & `SetStageModal.tsx`)**：
   - 彻底优化阶段设置与 `fetchMe` 轮询机制，在用户设置或变更阶段期间引入互斥锁与深层结构比较，杜绝虚假重置，保障“怀孕中”与“宝宝已出生”等阶段设置稳固持久。

#### 10.27.3 验证效果
- 首页横幅呈现左中右三栏协调布局，中间贴士卡跟随宝宝月龄（如 2 岁 8 个月精准展示幼儿期成长锦囊）；
- 管理员后台可任意增删改贴士、批量启停与调整展示条数，前台即时联动生效；
- 天气页进入无冗余请求，省市区级联支持仅选成都市直接查询；AI 模型列表选中即自动收起。

---

### 10.28 健康中心打卡与深度 BMI 全维度智能联动、基线双向自动继承与 CSV 导入防呆治理 (v1.66)

#### 10.28.1 业务背景与问题复盘
1. **健康打卡与当前页面上下文脱节**：
   - 用户在宝宝生长档案、产后恢复或备孕子页面点击“健康打卡”，弹窗始终默认定位在“我 · 孕期产检”；
   - 不相关页面（宝宝疫苗、健康时间轴与日历）也展示打卡按钮与导入数据按钮，产生认知误导。
2. **深度体重/BMI 与健康打卡缺乏双向同步**：
   - 深度体重/BMI表单选择全孕期阶段时，健康打卡弹窗未能自动切换；打卡弹窗切换产后恢复时，深度表单亦未同步。
3. **身高与基线体重断连与“留空自动继承”占位符痛点**：
   - 用户在健康打卡弹窗录入身高后，深度分析表单未自动继承，反之亦然；
   - 输入框呈现灰色的“留空自动继承”占位符，用户要求必须在输入框内直接呈现先前录入的实测数值（如 165cm），且必须保持可自由编辑修改。
4. **已有打卡数据但当前测算 BMI 与孕前 BMI 基线无数据展示**：
   - 后端历史打卡记录若某单次打卡未显式填写身高，时序构建器直接将该条高度置空，导致前端状态卡因 `!latestRecord.height` 抛出保护并熔断全空；且原孕前 BMI 错误引用了当日最新打卡 BMI。
5. **CSV 批量导入智能联动与列解析错位**：
   - 用户导入 CSV 时若省略腹围列，阶段关键字被误识别为腹围导致列错位报错；
   - 导入类型（如 general）与当前宝宝档案类型（如 postpartum）不一致时缺乏交互提示；
   - 孕期导入缺少根据日期自动计算孕周（周+天）的能力。

#### 10.28.2 架构重构与优化落地
1. **健康打卡与当前子页面全链路双向联动 (`HealthPage.tsx` & `UnifiedHealthCheckIn.tsx`)**：
   - **按钮动态受控**：健康打卡与导入数据按钮仅在 `tab === "mom" || tab === "growth"` 时渲染，在宝宝疫苗、健康时间轴与日历子页自动隐藏。
   - **记录模式智能预选**：点击健康打卡时，若在宝宝生长页自动预选“宝宝 · 生长测量”；在妈妈页根据 `bmiStageType` 状态自动匹配“我 · 孕期产检”、“我 · 产后恢复”或“我 · 非孕期/备孕”。
   - **双向联动同步**：深度体重/BMI分析的阶段切换与外层 `bmiStageType` 状态及打卡弹窗记录类型保持 100% 实时互锁。
2. **身高与基线体重全时序继承与直接数值回显**：
   - **后端全时序继承 (`apps/core/views.py#_build_bmi_timeseries`)**：逆序检索该用户历史最新有效身高与孕前基线体重，向前后向贯通补全至时序列表的每一条记录，彻底消除因单次记录缺失身高导致的 BMI 断流。
   - **前端数值直观回显与可编辑 (`BmiFormCard.tsx` & `UnifiedHealthCheckIn.tsx`)**：使用 `useRef` + `useEffect` 动态监听基线变化；当存在历史身高或孕前体重时，输入框直接填充真实数值（如 `161`、`55.0`），占位符替换为清晰的 `例如 165` 与 `例如 52.0`（彻底移除“留空自动继承”字样），用户可自由聚焦修改。
3. **当前测算 BMI 与孕前 BMI 基线卡片修复 (`BmiAnalysisView.tsx`)**：
   - **状态卡解耦容错**：重构 `bmiStatus` 计算逻辑，逆序扫描时序记录并结合外层 `fallbackHeight`，确保实测当前 BMI 与孕前基线 BMI 双指标始终稳定输出，并自动打上 WS/T 801-2022 国家卫健委标准分级胶囊。
4. **导入数据按钮与当前页面联动 (`HealthPage.tsx` & `CsvImportModal.tsx`)**：
   - `CsvImportModal` 接入 `initialTarget` 属性；在妈妈孕产档案页点击导入默认展示“妈妈体重打卡”，在宝宝生长档案页点击导入默认展示“宝宝生长测量”。
5. **CSV 批量导入高韧性与智能阶段仲裁**：
   - **列错位规避**：引入 `isStageKeyword` 正则，精准识别阶段列，杜绝省略腹围列时的列错位。
   - **阶段冲突内联仲裁卡片**：当导入数据的阶段与当前宝宝档案阶段不一致时，弹出内联交互提示卡，提供「按导入类型导入」与「按宝宝默认档案导入」两套决策路径。
   - **孕期孕周自动计算**：孕期导入未填周数时，自动根据记录日期与档案预产期/建档时间计算推导精确的孕周（周+天）。

#### 10.28.3 验证效果
- 健康打卡与深度体重/BMI分析实现双向无缝联动，身高与孕前体重输入框直接回显实测值且可任意修改；
- 无论历史打卡是否缺失单次身高，状态卡稳定呈现当前测算 BMI 与孕前 BMI 基线；
- 导入数据按钮随妈妈/宝宝 Tab 自动切换目标；CSV 批量导入容错率显著提升，冲突确认路径明确。


---

### 10.29 健康打卡与时序图表排版优化、阶段合理性医学校验与健康中心宝宝生长档案多实体构建 (v1.67)

#### 10.29.1 业务背景与问题复盘
1. **健康打卡输入框内图标遮挡内容**：在健康打卡弹窗（`UnifiedHealthCheckIn.tsx`）中，身高与体重输入框内部保留了尺子 (`<Ruler>`) 与体重秤 (`<Scale>`) 装饰图标及 `pl-9` 内边距，遮挡了数字开头，导致实测数据看不清楚；
2. **多维度时序图表看板末点阶段信息截断**：在 BMI 时序趋势/增量柱状图看板（`BmiTimeSeriesBoard.tsx`）中，最后一个数据点的横轴阶段长标签（如“10-13 孕40周+5天”）显示不全被截断。定位为：`boundaryGap: false` 末点贴边 + X 轴超长标签居中向右溢出 35~45px + `grid.right` 留白仅 20~25px；
3. **阶段类型合理性校验缺失风险**：健康中心在“用户添加数据”（打卡、一键分析评估）与“CSV 批量导入”两条入库链路中，缺乏跨时序的生理阶段合理性互斥校验，可能出现同一孕产周期内录入非孕期/产后等矛盾数据；且需支持按单个妈妈维度物理隔离；
4. **架构收敛与宝宝生长档案模块内建多宝宝支持**：按照高内聚产品规范，回退独立的“妈妈孕产档案”与“宝宝生长档案”独立页面，**将多宝宝档案管理能力完整内建于健康中心页面的「宝宝·生长档案」模块中**，支持录入多位宝宝信息；且所有支持新增录入宝宝的入口均需贯彻“未填姓名默认自动继承默认宝宝名称，兜底小萌宝”的保底命名规则。

#### 10.29.2 架构重构与优化落地
1. **健康打卡输入框视觉净化 (`UnifiedHealthCheckIn.tsx`)**：
   - 彻底移除身高与体重输入框内的 `<Ruler>` 和 `<Scale>` 装饰图标，移除 `pl-9`，恢复原生 `.input` 干净排版，确保实测数据 100% 完整可见；
   - 严格保留全部输入防呆范围校验（身高 100~220cm，体重 25~250kg）、基线继承与表单校验逻辑。
2. **时序图表看板末端标签防截断排版方案 (`BmiTimeSeriesBoard.tsx`)**：
   - 将趋势折线图网格右侧留白 `grid.right` 从 `25px` 大幅扩展至 `55px`；增量柱状图 `grid.right` 从 `20px` 扩展至 `40px`，预留充足文本安全延伸区；
   - 在 X 轴配置中增加 `axisLabel: { showMaxLabel: true }`，强制确保末端最后一个数据点的标签始终渲染不被丢弃，彻底根除截断。
3. **阶段类型合理性医学校验引擎 (`apps/core/services/stage_validator.py`)**：
   - 依据国家卫健委标准（WS/T 801-2022），以 280 天全孕期模型（`LMP = EDD - 280天`）及分娩后生理恢复周期为基准，建立 `validate_stage_transition` 校验服务；
   - **双路径覆盖**：健康打卡与一键分析评估归档（`HealthBmiAnalysisView.post` & `HealthRecordViewSet.create`）及 CSV 批量导入（`batch_import`）；
   - **严格拦截**：妊娠区间 `[LMP - 14天, EDD + 14天]` 内严禁非孕期数据；预产期分娩前 21 天前绝不允许产后数据；孕周时序递增防倒流；
   - **单人严格隔离**：校验作用域严格绑定在指定妈妈实体内，多位妈妈之间互不干扰。
4. **健康中心「宝宝·生长档案」内建多宝宝管理套件 (`HealthPage.tsx`)**：
   - **多宝宝标签快速切换栏**：展示当前用户全部宝宝胶囊标签（显示性别 emoji、姓名、默认标识、孕育中标识），点击即可无缝切换当前激活宝宝，专属 WHO 参考生长曲线与性别标准实时联动响应；
   - **当前宝宝信息微卡与操作**：展示当前宝宝的姓名、出生日期/预产期、当前月龄/年龄精准计算、出生指标（身长/体重），并提供【设为默认】、【编辑资料】与【删除档案】一站式操作；
   - **内建新增宝宝档案弹窗 (`showAddBabyModal`)**：支持出生状态切换（已出生/预产期）、宝宝昵称、性别、出生日期、出生体重、出生身长及是否设为默认宝宝。
5. **全入口宝宝默认命名保底机制**：
   - **默认命名规则**：用户未输入姓名时，自动查询当前激活的默认宝宝档案信息继承其名称，无宝宝时兜底命名为 `小萌宝`；
   - **全入口 100% 统一覆盖**：
     1. 健康中心「宝宝·生长档案」模块的【录入新宝宝】弹窗（`HealthPage.tsx#handleCreateBaby`）；
     2. 个人中心宝宝档案的【添加宝宝】表单（`ProfilePage.tsx#addBaby`）；
     3. 阶段设置弹窗的宝宝同步建立逻辑（`SetStageModal.tsx`）；
     4. 后端 API 接口全局保底（`BabyViewSet.perform_create`），任何途径调用 `POST /api/babies/` 均安全兜底。

#### 10.29.3 验证效果
- 健康打卡输入框无图标遮挡，输入与回显清爽可见；
- 时序图表看板在末点长标签场景下完整显示无截断；
- 阶段合理性校验引擎精准拦截冲突数据，多妈妈隔离可靠；
- 回退独立路由后系统架构精简规范；健康中心宝宝·生长档案模块内建多宝宝录入、编辑、切换与全入口默认命名 100% 验证通过。


---

### 10.30 跨页面多模块全自动同步、宝宝健康打卡指定已有档案与时间轴/日历/图表多宝宝区分优化 (v1.68)

#### 10.30.1 业务背景与问题复盘
1. **跨页面默认宝宝切换后妈妈档案不同步**：用户在“我的”页面（`ProfilePage`）切换默认宝宝档案后，健康中心“妈妈·孕产档案”模块展示的当前妈妈数据（阶段状态、预产期、妈妈名称）未自动更新；且首页、健康中心、我的页面之间缺乏全自动联动，数据无法实时穿透；
2. **宝宝健康打卡无法选择已有宝宝**：健康中心“宝宝·生长档案”页面点击“健康打卡”按钮时，打卡弹窗未关联已有宝宝，无法针对指定宝宝录入档案信息，且月龄天数仅基于全局单人生日推算；
3. **健康时间轴与日历数据/图表无法区别宝宝**：多宝宝场景下，健康时间轴节点卡片仅显示泛化的“宝宝 x 个月”，无法识别是哪个宝宝的测量或疫苗记录；统计图表将不同宝宝生长测量混在一块；日历单元格未显式标出对应宝宝名称，缺乏宝宝维度筛选与区分能力。

#### 10.30.2 架构重构与优化落地
1. **全域多页面跨模块全自动同步机制**：
   - **后端默认妈妈档案随默认宝宝自愈与联动更新 (`apps/core/views.py#_sync_user_stage` & `MotherViewSet.get_queryset`)**：
     - 当切换默认宝宝（`set_primary`）或阶段变动时，后端不仅更新 `User` 的 `is_pregnant`、`due_date` 与 `baby_birthday`，同时自动同步用户的默认 `MotherProfile`；
     - 自动校准妈妈预产期、孕期标记；若原妈妈名称属于默认模式（如空、`萌宝妈妈` 或以 `妈妈` 结尾），同步更新为 `f"{baby.name}妈妈"`；
     - `MotherViewSet.get_queryset` 增加自动幂等自愈，确保查询时妈妈档案与全局用户和宝宝状态 100% 吻合。
   - **前端全生命周期事件总线广播 (`stageChanged`) 与反应式同步**：
     - **健康中心 (`HealthPage.tsx`)**：注册 `stageChanged` 全局监听器，触发时自动调用 `fetchMe()`、`loadProfiles(true)` 和 `load()`，强制将选中的妈妈档案与宝宝档案实时重新对齐至最新默认实体，并通过 `useEffect` 动态重新计算 `bmiStageType`；
     - **我的页面 (`ProfilePage.tsx`)**：注册 `stageChanged` 监听，其他任何入口切换阶段或宝宝时，立即重新拉取 `fetchMe()` 与宝宝列表，默认徽标与阶段卡片实时更新；
     - **首页 (`HomePage.tsx`)**：`handleStageChanged` 加入 `await fetchMe()`，顶栏孕期周数/宝宝月龄 Banner 与阶段知识流秒级动态刷新。
2. **健康打卡指定已有宝宝精准录入套件 (`UnifiedHealthCheckIn.tsx`)**：
   - **已有宝宝选择器与状态联动**：表单在“宝宝生长测量”模式下渲染已有宝宝选择栏，展示全部宝宝姓名、性别 Emoji（👦/👧）、出生日期与“默认”标识，支持用户一键切换打卡目标宝宝；
   - **精准推算所选宝宝月龄天数**：根据当前所选目标宝宝的实际生日（`activeBaby.birthday`）动态推算精准天数与月龄，并回显即时健康提示；
   - **数据按宝宝物理隔离与防冲突归档**：
     - 提交时携带 `baby: activeBaby.id`；
     - 后端 `HealthRecordViewSet.create` 与 `perform_create` 严格绑定外键 `baby`，并按 `(user, record_type, record_date, baby)` 细粒度校验同日重复，多宝宝同一天打卡互不干扰。
3. **健康时间轴、统计图表与日历多宝宝区分体系**：
   - **API 字段强化 (`HealthRecordSerializer`)**：新增只读字段 `baby_name`（`source="baby.name"`）与 `mother_name`，返回给前端的每条健康记录均明确携带所属宝宝与妈妈姓名；
   - **时间轴流专属宝宝徽章与按宝宝筛选 (`HealthTimelineView.tsx`)**：
     - 多宝宝时在时间轴顶部提供【全部宝宝 / 指定宝宝】快捷筛选卡片，支持按特定宝宝或全量查看；
     - 每一条宝宝测量或疫苗卡片头部均展示高亮实体徽章（如 `👶 甜甜` 或 `👶 小唯一`）与专属月龄计算，一眼即辨；
   - **统计图表多宝宝分离与动态透视 (`HealthChartsBoard`)**：
     - 近 6 个月月度堆叠柱状图将多位宝宝的生长测量细分为专属系列（如 `甜甜生长`、`小唯一生长`）与专属图例配色；
     - 环形构成图按宝宝维度分别计算生长测量频次，多实体数据一览无余；
   - **日历总览多宝宝可视化标注 (`HealthCalendar.tsx`)**：
     - 日历每个日期格子内的生长与疫苗胶囊直接前置显式标明对应宝宝昵称（如 `[甜甜] 生长 5.2kg`、`[小唯一] 生长 6.1kg`），并在筛选时自动跟随过滤；
   - **宝宝生长档案曲线与历史表精准隔离 (`HealthPage.tsx`)**：
     - Tab 2 中的 WHO 生长曲线与历史测量表严格按照当前激活宝宝（`currentBabyGrowthRecords`）物理过滤，彻底根除不同宝宝测量数据混入同一张曲线图的缺陷。

#### 10.30.3 验证效果
- 在“我的”页面切换默认宝宝后，健康中心当前妈妈档案模块、当前宝宝详情微卡、首页 Banner 均无需手动刷新即刻 100% 自动同步；
- 健康打卡宝宝模式可在多个已有宝宝之间自由切换，精准推算月龄天数，打卡数据正确归属于目标宝宝，同日多宝宝打卡无冲突；
- 健康时间轴、统计图表看板与经典日历视图全面呈现宝宝姓名与专属图例，支持多宝宝精准筛选，彻底解决多宝宝数据混淆问题。


---

### 10.31 健康中心宝宝档案交互闭环、日历精准定向打卡与每日统计看板优化 (v1.69)

#### 10.31.1 业务背景与问题复盘
1. **宝宝生长档案录入/编辑/删除操作无反应**：在健康中心「宝宝·生长档案」模块中，点击“录入新宝宝”按钮、宝宝卡片上的“编辑资料”与“删除档案”按钮无任何响应。定位为：组件中虽声明了模态框状态与处理函数，但 JSX 底部漏掉了新增、编辑弹窗及删除确认对话框的渲染；且在进行增删改操作后，需确保与首页和“我的”页面通过全局事件与状态接口实现秒级自动同步；
2. **生长曲线与测量记录未显示宝宝昵称**：在「宝宝·生长档案」的 WHO 参考生长曲线与历史测量记录表中，卡片标题与数据表格未显明所属宝宝昵称，用户切换宝宝标签时无法直观辨认当前数据属于哪一位宝宝；
3. **健康日历总览多宝宝点击未定向且无历史数据提示**：当某一天存在多个宝宝记录时，点击指定宝宝记录胶囊弹出的打卡窗口未自动归属于该宝宝，仍默认停留在首个宝宝；且输入框未显示该记录此前录入的实测数值；
4. **日历总览产检记录点击未切换打卡模式**：在健康日历总览中点击孕期产检记录（`prenatal_exam`）时，打卡弹窗仍停留在默认的“宝宝生长测量”选项卡，未能自动跳转到“我 · 孕期产检”模式；
5. **统计图表时间维度过大且不易观察**：原统计看板采用 6 个月为颗粒度，缺乏日级别（Daily）活跃度时序展示，且在数据密集或跨度较长时容易拥挤不易观察。

#### 10.31.2 架构重构与优化落地
1. **宝宝生长档案管理弹窗闭环与全域跨页同步 (`HealthPage.tsx`)**：
   - 补齐新增宝宝档案模态框（`showAddBabyModal`）、编辑宝宝模态框（`showEditBabyModal`）与删除档案确认弹窗（`deletingBabyId` 对应的 `ConfirmDialog`，保护至少保留一份宝宝档案）；
   - 在新增、设为默认、编辑及删除操作完成后，统一执行 `await fetchMe(); loadProfiles(true); window.dispatchEvent(new CustomEvent("stageChanged"));`，确保健康中心、首页与“我的”页面宝宝列表与阶段状态 100% 自动同步；
2. **生长曲线与历史测量记录宝宝昵称显式呈现 (`HealthPage.tsx`)**：
   - **生长曲线头部**：标题显式标明 `WHO 参考生长曲线 (0-2岁)` 并附带高亮实体徽章 `👶 当前展示：{currentBaby.name}`，副标题明确说明展示目标宝宝数据量与 WHO P50 参考线；
   - **历史测量记录表**：标题显明 `【{currentBaby.name}】历史测量记录`，表格表头新增「宝宝昵称」专属列，每一行记录前置展示 `👶 {r.baby_name || currentBaby.name}` 标识胶囊；无数据时提供引导录入空状态；
3. **健康日历定向打卡与实测数据智能提示体系 (`HealthCalendar.tsx` & `UnifiedHealthCheckIn.tsx`)**：
   - **记录胶囊事件拦截与精准透传**：日历单元格内每个记录胶囊绑定独立点击事件 `onClick={(e) => { e.stopPropagation(); onRecordClick(r); }}`，直接透传选中的目标记录；
   - **自动归属目标宝宝**：打卡弹窗 `UnifiedHealthCheckIn` 接收 `initialRecord` 属性，若属于宝宝记录则自动将 `selectedBabyId` 切换为 `initialRecord.baby`；
   - **已录入数据回显与提示文案**：
     - 弹窗顶部呈现提示横幅：`提示：该日期已有【xx宝宝】录入记录（实测体重: xx kg，身长: xx cm...）`，并提供【一键填入上次数据】快捷按钮；
     - 各数值输入框 placeholder 动态回显 `已录入: xx`，且输入框下方提供友好提示文案（如 `💡 上次已录入：xx kg`），清晰提示此前录入数据；
4. **产检与多模式记录自动路由适配 (`HealthPage.tsx` & `UnifiedHealthCheckIn.tsx`)**：
   - 日历与时间轴记录点击处理器 `handleCalendarRecordClick` 依据 `record_type` 精准分流：
     - 若为 `prenatal_exam` / `checkup`，自动切换至 `mom_pregnancy`（我 · 孕期产检）；
     - 若为 `postpartum_recovery`，自动切换至 `mom_postpartum`（我 · 产后恢复）；
     - 若为 `weight_bmi`，根据阶段切换至对应妈妈体重模式；
     - 若为 `growth_measurement` / `vaccine`，切换至 `baby` 并预选对应宝宝；
   - 彻底解决点击产检仍停留在宝宝生长测量模式的缺陷；
5. **以“天”为时序维度的统计图表看板与交互增强 (`HealthTimelineView.tsx#HealthChartsBoard`)**：
   - **日维度时间跨度切换**：支持【近 7 天】、【近 14 天】（默认）与【近 30 天】自由切换，按 `YYYY-MM-DD` 完整生成每日时序；
   - **快捷 KPI 概览微卡**：顶部展示所选周期内的「打卡总频次（日均）」、「活跃打卡天数（覆盖率）」、「宝宝生长测量次数」与「孕期产检/疫苗次数」4 个核心指标卡；
   - **堆叠柱状图排版与缩放增强**：
     - 细分孕期产检、各宝宝专属生长系列与疫苗接种；
     - 柱子配置 `barMaxWidth: 24` 与顶部圆角，配置 ECharts `dataZoom`（手势/滚轮缩放 + 底部轻量滑块），彻底解决密集或跨度长时不便观察的问题；
     - Tooltip 丰富排版：展示具体日期与星期（如 `2026-10-15 (周四)`）、各分类打卡频次及当日合计；
     - 点击柱子联动：直接联动打开当日健康记录或快捷补录；
   - **右侧环形构成图**：清晰展示全周期各分类与各宝宝占比，环心居中展示 `共 X 次` 全量打卡统计。

#### 10.31.3 验证效果
- 点击“录入新宝宝”、“编辑资料”与“删除档案”弹窗灵敏弹出，保存后首页顶栏、我的页面与健康中心秒级同步；
- 生长曲线与历史测量表清晰展现宝宝昵称，单人多宝宝隔离明确；
- 在日历总览中点击指定宝宝或产检记录，打卡弹窗自动选中对应宝宝与正确模式，并直观提示已录入数值；
- 统计看板按日维度直观呈现，支持滑块缩放与快速联动，数据展示清晰易观察。
---

### 10.32 健康打卡模式隔离、怀孕宝宝孕周推算、日历定向多宝宝数据回填与统计看板深度下钻升级 (v1.70)

#### 10.32.1 业务背景与问题复盘
1. **未出生/怀孕中宝宝月龄展示缺陷**：当用户选择的宝宝处于怀孕中（`is_born === false`）状态时，月龄推算一直展示为“宝宝月龄自动推算：0 天”，未能正确呈现孕周孕天信息；
2. **打卡记录类型未按子页面严格隔离**：健康打卡按钮点击后，在妈妈孕产档案页面中仍展示宝宝生长测量选项，在宝宝生长档案中仍展示孕期/产后/备孕选项，造成录入混淆；
3. **健康日历同日多宝宝/妈妈记录点击定向与数据回填失效**：当同一天存在多条记录时（例如 15 号同时录入宋泽言和悠悠两位宝宝的生长测量数据，或存在妈妈产检数据），点击下面的悠悠胶囊时弹出的页面仍默认停留在宋泽言处，且之前录入的身长、体重、头围等数据信息没有展示与提示；
4. **覆盖提示展示时机不合理**：当日已有数据时，用户点击进入打卡页面尚未点击保存，页面就已默认显示“当日已有记录，是否覆盖更新”，影响正常输入体验；
5. **统计图表看板缺乏深度交互分析能力**：图表看板缺乏多周期（7/14/30/90/180天/全部）时间范围筛选、多粒度（天/周/月）聚合、图表形态（柱状图/折线图/面积图）切换以及点击特定周期（如 2026-09）进入深度下钻详情、面包屑返回等交互。

#### 10.32.2 架构重构与优化落地
1. **怀孕中宝宝临床 280 天推算模型升级 (`HealthPage.tsx` & `UnifiedHealthCheckIn.tsx`)**：
   - 彻底重构未出生宝宝月龄推算算法：当 `is_born === false` 时，依据医学预产期锚点（第 40 周基准）及 280 天模型推算当前孕周与天数；
   - 统一将“0 天”修正为「`孕x周x天`」（如“孕17周3天”），在宝宝卡片、打卡弹窗关联提示中一致呈现。
2. **打卡记录类型按子页面严格隔离 (`HealthPage.tsx` & `UnifiedHealthCheckIn.tsx`)**：
   - 打卡弹窗支持 `allowedModes` 限制：
     - 在「妈妈·孕产档案」子页面中只允许呈现 `mom_pregnancy`、`mom_postpartum`、`mom_general` 三类妈妈打卡模式，隐藏宝宝生长测量；
     - 在「宝宝·生长档案」子页面中只允许呈现 `baby` 宝宝生长测量模式，彻底隐藏妈妈相关模式；
     - 在「健康时间轴/日历」中，点击具体宝宝记录自动定位至 `baby` 模式，点击产检记录自动定位至 `mom_pregnancy` 模式，常规打卡开放全模式。
3. **日历/时间轴记录点击定向跳转与历史实测数据智能回填 (`HealthCalendar.tsx`, `HealthPage.tsx`, `UnifiedHealthCheckIn.tsx`)**：
   - 日历单元格胶囊精准传递对应记录，点击特定宝宝胶囊（如悠悠）时立即选中该宝宝（`selectedBabyId = Number(r.baby)`）；
   - 打卡弹窗接收 `allRecords` 数据集，在打开弹窗或切换宝宝/模式时，自动检索目标对象在选中日期的实测记录，并直接将身长、体重、头围、孕周、天数、备注填充至输入框；
   - 输入框 placeholder 动态回显历史录入数据提示（如 `已录入: 33.0 cm`），实现数据快速对比与校准修改；
   - 弹窗内支持自由切换宝宝标签，实时响应并更新输入框至目标宝宝在该日的数据。
4. **同日打卡覆盖提示触发时机校准 (`UnifiedHealthCheckIn.tsx`)**：
   - 移除打开弹窗时的预先提示；清空打开、切换日期或对象时的覆盖态，严格改为仅在用户点击“保存打卡记录”且后端返回 409 冲突时才激活覆盖确认条。
5. **多粒度健康打卡统计图表看板与深度下钻分析套件 (`HealthChartsBoard.tsx`)**：
   - **时间范围选择**：支持近 7 天 / 近 14 天 / 近 30 天 / 近 90 天 / 近半年 (180天) / 全部 (all) 动态筛选；
   - **展示粒度切换**：支持按天 (day)、按周 (week)、按月 (month) 灵活聚合时序数据；
   - **图表形态切换**：支持堆叠柱状图 (bar)、平滑折线图 (line) 与平滑面积图 (area) 自由切换；
   - **双向点击深度下钻与返回机制**：点击柱子、折线数据点或快捷周期胶囊（如 2026-09），无缝进入该周期下钻深度详情，呈现面包屑导航、顶部/底部「← 返回总览看板」操作、周期 KPI 指标、周期内每日细分折线/柱状图及本周期全部打卡明细卡片（可直接一键查看与打卡修改）。

#### 10.32.3 验证效果
- 怀孕中宝宝卡片与打卡弹窗月龄正确推算并展示为“孕x周x天”；
- 妈妈页面打卡仅展示妈妈选项，宝宝页面打卡仅展示宝宝生长测量；
- 日历总览点击悠悠或宋泽言或产检记录，弹窗准确归属于目标对象，输入框完整展示历史实测数值与提示；
- 覆盖提示仅在点击保存发生冲突时展示；
- 统计看板支持多粒度切换与多形态图表，点击 2026-09 成功下钻查看详情并可平滑返回。


---

### 10.33 健康打卡运行时防崩修复、BMI 提示词与孕周自动填充、多孩阶段校验与图表下钻返回持久化 (v1.71)

#### 10.33.1 业务背景与问题复盘
1. **健康打卡按钮点击白屏崩溃**：健康中心页面点击“健康打卡”按钮后页面崩溃为空白。经排查，系 `UnifiedHealthCheckIn.tsx` 中 `filteredModeOptions` 的 `useMemo` 声明在 `const MODE_OPTIONS = ...` 之前，并且被放置在 `if (!isOpen) return null;` 之后；当用户点击按钮打开弹窗（`isOpen = true`）时，JavaScript 引擎访问处于暂态死区（TDZ）的 `MODE_OPTIONS` 抛出致命的 `ReferenceError: Cannot access 'MODE_OPTIONS' before initialization`，导致 React 根组件树崩溃卸载；
2. **深度体重/BMI分析提示词不具体且未自动填入孕周**：在健康中心“深度体重/BMI分析与打卡 (WS/T 801-2022)”模块中，选择产后恢复期时提示词仅为泛指的“按宝宝生日自动”，未说明是按哪位宝宝计算；选择“全孕期阶段”时，若存在怀孕中的宝宝档案，孕周输入框未能自动填入当前孕周数值；
3. **多孩不同阶段妈妈的阶段类型校验冲突与多模块联动缺失**：同一位妈妈可能同时存在大宝（已出生、处于产后育儿期）与二宝（怀孕中、处于全孕期），原校验逻辑将妈妈一生所有记录视为单一孕期，导致大宝产后历史与二宝当前孕期发生虚假冲突；且页面各模块之间缺乏对当前关联宝宝阶段的智能感知；
4. **统计图表看板下钻返回后记录类型构成饼图失效**：在健康时间轴看板点击周期下钻后点击“返回总览看板”，健康档案记录类型构成环形饼图无法展示数据，必须手动刷新页面才能恢复；日历及图表内点击触发打卡弹窗时亦受弹窗异常影响出现白屏。

#### 10.33.2 架构重构与优化落地
1. **健康打卡弹窗全生命周期健壮性重构 (`UnifiedHealthCheckIn.tsx`)**：
   - 调整声明时序：将 `MODE_OPTIONS` 静态定义与多孩推导严格前置声明，确保在 `filteredModeOptions` 的 `useMemo` 引用前完成初始化，彻底根除 TDZ 变量未初始化异常；
   - 严格遵循 React Hook 规范：将所有 Hook 调用（`useMemo`、`useState`、`useEffect`）统一置于组件最顶层，条件返回 `if (!isOpen) return null;` 严格后置于 JSX 返回之前；
   - 彻底修复点击健康打卡按钮、日历格卡片、时间轴卡片与下钻明细点击时的白屏问题。
2. **深度体重/BMI分析提示词具体化与全孕期孕周自动填入 (`BmiFormCard.tsx`, `BmiAnalysisView.tsx`, `HealthPage.tsx`)**：
   - **提示词具体化**：选择产后恢复期时，根据关联宝宝姓名动态更新提示词为：`产后月龄 (0 ~ 36 个月) · 按【xx】宝宝生日自动`（如 `按宋泽言宝宝生日自动` / `按悠悠宝宝生日自动`），并支持多已出生宝宝快捷切换；
   - **全孕期孕周自动填入**：选择“全孕期阶段”时，自动检索孕期宝宝档案（`is_born === false` 或 `birthday > today`），基于预产期 280 天临床模型自动推算出当前孕周与天数，自动填入输入框，并展示 `按「xx」宝宝预产期自动填入，允许 ±1 周微调`。
3. **多孩不同阶段单次妊娠周期时间窗隔离校验 (`apps/core/services/stage_validator.py`)**：
   - **周期时间窗隔离算法**：将冲突校验严格限定在单次妊娠周期时间窗 `[LMP - 14天, EDD + 42天]`（跨度约 300 天）内；
   - **多孩多胎次兼容**：早于妊娠周期的上一胎大宝产后记录或间隔大于 300 天的历史数据判定为独立胎次事件，与二宝当前的全新孕期记录医学合理共存，彻底解决多孩妈妈历史数据被误杀的问题；
   - **多模块深度联动**：妈妈档案卡片直观呈现当前妈妈的多孩不同状态（如已有大宝与孕育中二宝）；健康打卡弹窗自动根据选择的阶段类型智能分流关联宝宝（选孕期自动关联二宝，选产后自动关联大宝，选宝宝测量支持自主切换）；BMI 分析模块与宝宝档案状态保持双向联动。
4. **统计图表总览与下钻 DOM 常驻及 ECharts 重绘保障 (`HealthChartsBoard.tsx`, `HealthTimelineView.tsx`)**：
   - **DOM 常驻隐藏机制**：总览看板容器在下钻时采用 `className={drillDownPeriod ? "hidden" : "space-y-4"}` 样式隐藏，避免 DOM 节点反复销毁重挂载造成的尺寸归零与实例异常；
   - **ECharts 实例复用与 rAF 安全自愈**：使用 `echarts.getInstanceByDom(el) || echarts.init(el)` 避免重复初始化；从下钻返回总览时，利用 `requestAnimationFrame` 立即触发 `barChart.resize()` 与 `pieChart.resize()`，并重刷配置项；
   - **多宝宝记录弱类型匹配容错**：饼图数据匹配放宽为 `Number(r.baby) === Number(b.id) || r.baby_name === b.name`；在 `HealthTimelineView` 中向图表看板透传全量 `records`，确保记录构成环形饼图与时序趋势图 100% 稳定呈现。

#### 10.33.3 验证效果
- 前端 `npm run build` 编译打包零警告零报错；
- Django 一体化服务（端口 5173）重启成功，本地 HTTP 响应 200 OK；
- 验证健康打卡弹窗秒级打开无白屏，BMI 模块动态展示对应宝宝昵称并自动填入孕周，多孩阶段校验畅通入库，图表下钻返回后记录类型构成饼图与趋势图完美展示。


---

### 10.34 BMI参考宝宝显式化、孕前时序校验边界对齐、时序活跃度图表X轴防挤压与多宝宝图表精准匹配 (v1.72)

#### 10.34.1 业务背景与问题复盘
1. **全孕期参考宝宝信息缺失**：在健康中心“深度体重/BMI分析与打卡 (WS/T 801-2022)”模块中，选择“全孕期阶段”时，提示语为“当前孕周 · 已自动推算（可修改周与天）”，未展示是按哪位宝宝（特别是在多孩孕期场景下）计算的参考依据；
2. **阶段合理性时序校验边界虚假拦截**：校验提示周期为 `2026-05-01 至 2027-02-05`，用户录入 `2026-04-28` 时被系统拦截。医学上 LMP（末次月经日，此处为 2026-05-01）之前属于孕前/备孕阶段（`general`），原代码使用 `LMP - 14天` 误判了孕前数据，且错误信息与判定区间不一致；
3. **时序打卡活跃度与类型分布图表 X 轴排版拥挤与概率丢失**：时间跨度较长时（如 90 天/半年/全部），底部图例、缩放滑块与 X 轴日期标签在有限高度内发生盒模型碰撞，导致 ECharts 动态抑制横坐标显示或标签互相遮盖；
4. **下钻子图表形态丢失与多宝宝同日图表点击混淆**：
   - 外部看板选择折线图或面积图后，下钻进入周期详情时子图表仍显示柱状图；
   - 当某一天存在多位宝宝的打卡记录（如 2026-10-15 同时存在宋泽言与悠悠）时，点击图表对应宝宝柱状/折线段，弹窗始终固定打开第一个宝宝，无法精准跳转到所点击的宝宝。

#### 10.34.2 架构重构与优化落地
1. **全孕期参考宝宝信息显式化 (`BmiFormCard.tsx`)**：
   - 自动检测并提取怀孕中的宝宝档案（或主选宝宝），在表单标签上直观展示：`当前孕周 · 已自动推算（可修改周与天） · 参考宝宝：xx`；
   - 存在多个孕期宝宝时，提供可交互的切换标签芯片；并在底部推算辅助文案中明确标注 `（按孕期宝宝「xx」预产期自动填入，允许 ±1 周微调）`。
2. **阶段类型时序校验边界修正与文案严格对齐 (`stage_validator.py`)**：
   - 临床医学上 LMP（末次月经日）之前为合法的孕前/备孕阶段（`general`），将拦截区间校准为严格的 `[LMP, EDD + 7天]`；
   - 确保早于 LMP 的日期（如 2026-04-28 早于 2026-05-01）正常放行入库，拦截提示文案与校验区间数学完全吻合，杜绝虚假拦截。
3. **图表 X 轴空间结构优化与智能防挤压 (`HealthChartsBoard.tsx`)**：
   - 图表容器高度调整为 320px，图例调整至图表右上方（`top: 4, right: 16`），为底部 X 轴与滑动条留出 58px 充裕净空间；
   - X 轴标签配置 `interval: "auto"`, `hideOverlap: true` 与 `rotate: 30` 动态斜向旋转排版，杜绝重叠与乱码；
   - 当跨度长于 14 单元时，初始化默认展示最近 14 个时序窗口，下方提供精致交互滑动条（DataZoom），既保证首屏清晰易读，又支持随意平移缩放；
   - `setOption` 启用 `notMerge: true`，杜绝范围切换时配置残余导致的坐标轴丢失问题。
4. **图表形态全链路继承与多宝宝精准点击分流 (`HealthChartsBoard.tsx`, `HealthPage.tsx`)**：
   - **形态继承**：通过 `useEffect` 状态双向绑定与下钻入口传参，外部选择折线图或面积图时，下钻子页面 100% 自动继承渲染为折线图或面积图；
   - **多宝宝精准分流**：下钻图表点击事件中智能解析 `params.seriesName`（如 `宋泽言生长`、`悠悠生长`、`孕期产检`），精准检索并匹配当日对应宝宝或产检记录对象，传递给 `onRecordClick`，直达对应宝宝的打卡编辑弹窗。

#### 10.34.3 验证效果
- 前端 `npm run build` 编译打包零警告零报错；
- Django 一体化服务（端口 5173）重启成功，本地 HTTP 响应 200 OK；
- 验证全孕期阶段自动展示参考宝宝姓名与多宝切换，孕前备孕记录（如 2026-04-28）顺利入库且区间冲突提示数学准确；
- 验证时序打卡图表日期标签清晰可见无遮挡，滑动缩放平滑；下钻图表形态与外部一致，多宝宝图表点击精准匹配对应宝宝。


### 10.35 外部接口服务配置统一管理（天气/节假日/AI 公网搜索引擎管线）(v1.73)

#### 10.35.1 设计目标
将散落各服务的「内置默认外部调用地址」（Open-Meteo 天气三接口、timor.tech 节假日、7 大公网搜索引擎管线）统一收敛为管理员在线可配置项，
支持多端点故障转移、重试参数、行级开关/排序/一键测试，从根本上解除"地址变更需改代码"的运维痛点；SearXNG 私有实例配置入口保持原位（AI 助手配置页）。

#### 10.35.2 配置模型
- **普通组**（天气三组 / 节假日）：`{endpoints: [{url, enabled}], timeout(秒), retries(轮)}`；
- **引擎组**（search_pipeline）：`{engines: [{key, url, timeout, enabled}], retries(轮)}`，key 绑定 web_search.py 专属 HTML 解析器；
- 存储：`SystemSetting.external_api_config` JSONField（迁移 `0029_external_api_config`），实时读库，异常兜底返回默认值。

#### 10.35.3 后端实现
- `apps/core/services/service_config.py`：分组默认值（`DEFAULT_GROUPS`）、读写、故障转移遍历、节假日 `{年份}` 占位符规范化与注入、真实协议一键测试（`test_endpoint` / `test_engine` / `test_group`）；
- `apps/core/views_service_config.py`：`admin/service-config/`（GET/PUT）、`admin/service-config/test/`、`admin/service-config/restore/`，仅管理员 + 审计；
- 业务接入：`weather_service._http_get_group()`、`holiday_service._fetch_from_timor()` 双路径+重试、`web_search` 引擎管线动态化（`_ENGINE_FUNCS` + `_build_pipeline`），SearXNG 仍第一优先。

#### 10.35.4 前端新增
- `pages/AdminServiceConfigPage.tsx`（管理面板新入口）：5 组卡片、行级**默认只读 + 编辑双态**（`editingRows` 状态机，编辑/保存/取消）、
  上移/下移（**首行上移、末行下移置灰** `opacity-40 + cursor-not-allowed`）、删除、行级与组级一键测试结果、
  **新增行（_new）启用开关默认可直接勾选**（`enabledLocked = !isEditing && !isNew`），已保存行开关随编辑态锁定、
  恢复默认（ConfirmDialog）、toast 提示；编辑态互斥（同组同时仅一行可编辑），移动/删除自动退出编辑避免索引错位；
- 路由 `/admin/service-config`（AdminGuard），`api/services.ts` 新增 `serviceConfigApi`，类型 `types/serviceConfig.ts`。

#### 10.35.5 验证结论
- 后端 check/迁移/API 权限链路（401/403/管理员 GET·PUT·测试·恢复）全部通过；
- 故障转移实测：Open-Meteo 三端点、timor.tech、Bing/百度真实请求成功解析；
- 前端 `npm run build` 零报错，产物同步 templates/static；
- 一体化服务重启后浏览器逐项验证全部通过：行默认只读、编辑/保存/取消、首尾行置灰、新增行默认只读、排序，首页天气/万年历/AI 助手链路无回归，测试数据已清理。


### 10.36 架构极简治理：根目录瘦身、文档中心分流与跨 AI 协作维护规范落地 (v1.74)

#### 10.36.1 治理背景与核心痛点
随着萌芽母婴全周期平台的持续演进，根目录与文档体系暴露出多项结构性膨胀与失焦问题：
1. **主自述文档（README.md）严重膨胀**：累计达到 1361 行（148 KB），近 65% 篇幅被 v1.13 ~ v1.73 的历史更新流水账和深层数据库理论占据，初次接触项目的开发者翻阅数页仍难以直达基础运维命令；
2. **辅助脚本与设计资产散落首页**：`build_frontend.py`、`check_admin_status.py` 与 PSD 设计文档（Markdown + HTML）混杂在项目根目录，首页文件繁杂；
3. **跨 AI 工具协作失范隐患**：在切换不同 AI 编程助手（Codex、Cursor、Claude Code、Windsurf 等）或多人协作时，缺乏全局统一的行为规范指引，大模型极易按通用习惯继续将更新日志随手追加在 `README.md` 尾部，导致刚刚整理干净的主文档再度膨胀。

#### 10.36.2 核心改造与分层治理方案
1. **文档中心（docs/）独立规范设立**：
   - 将权威系统设计规范 `PSD_System_Design_and_Refactoring.md` 与 HTML 交互视图 `PSD_System_Design_and_Refactoring.html` 统一收纳进 `docs/` 目录；
   - 抽离全量版本演化细节，设立独立的 `docs/CHANGELOG.md`，完整承接 v1.13 ~ v1.73 的全部迭代记录，保持历史审计溯源 100% 守恒；
   - 将三大数据库模式自适应架构（SQLite / 共享 PG / 独立 PG）与 6 种双版本物理隔离矩阵深度融入 PSD 架构规范中。
2. **工具中心（tools/）激活与路径深度自愈**：
   - 将前端一键打包同步脚本 `build_frontend.py` 移入 `tools/` 目录，将其根目录解析锚点从单级 `parent` 升级为两级父目录：`ROOT_DIR = Path(__file__).resolve().parent.parent`，确保前端编译、模板写入与静态资产合并路径 100% 准确；
   - 将管理员账号状态调试脚本 `check_admin_status.py` 移入 `tools/` 目录，头部显式注入 `sys.path.insert(0, str(ROOT_DIR))`，彻底杜绝跨目录执行时找不到 `config` 和 `apps` 导致的 `ModuleNotFoundError`。
3. **首页主文档（README.md）极简重构**：
   - 篇幅严格收敛至 180 行以内，聚焦系统定位、单进程一体化运行架构（0.0.0.0:5173）、快速启动及全局文档导航，大幅提升可读性。
4. **跨 AI 协作与维护规范（AGENTS.md）全面落地**：
   - 在项目根目录设立 `AGENTS.md`，确立文档分流铁律、极简自述标准与零业务破坏原则，作为所有 AI 代理与人工开发的权威执行基准。

#### 10.36.3 验证效果
- 执行 `.\.venv\Scripts\python.exe tools/check_admin_status.py`，正确加载 Django ORM 并输出管理员账号状态，跨目录路径自愈完全生效；
- `tools/build_frontend.py` 根路径锚点两级回退解析准确；
- 传统版一体化单体服务启动及 `./run.ps1 status` 状态检测零异常，单端口 5173、静态托管与 API 链路 100% 守恒，零业务逻辑破坏。


### 10.37 妈妈健康中心生命体征监测（血压/血糖）与智能双轨分析体系（v1.75）

#### 10.37.1 需求背景与方案选型
为了在母婴健康中心中完善对妊娠期高血压与妊娠期糖尿病（GDM）两大核心产科并发症的早筛、监测与预警能力，系统新增妈妈血压（收缩压、舒张压、脉搏）与血糖（空腹、餐后1h、餐后2h、睡前、随机）全场景监测分析功能。
经技术评估与用户审查确认，系统选定**方案 A（融入「妈妈·孕产档案」二级子看板架构）**：
- **导航架构不膨胀**：保持顶层 4 大 Tab（首页、健康中心、待产包、个人中心）简洁稳定，在「妈妈·孕产档案」下划分为 `⚖️ 体重与 BMI 监测分析` 与 `❤️ 血压与血糖监测分析` 双子看板；
- **实体与引擎联动**：直接联动 `currentMother` 妈妈实体与 `gestation_engine` 孕周引擎，自动对齐孕周孕天并实现医学基线自适应。

#### 10.37.2 临床医学判断标准体系
系统严格依循国家产科临床规范构建多维度自适应评估引擎：
1. **血压分级标准**（依据《妊娠期高血压疾病诊治指南》）：
   - **理想健康**：收缩压 90~119 mmHg 且舒张压 60~79 mmHg；
   - **正常高值**：收缩压 120~139 mmHg 或舒张压 80~89 mmHg；
   - **轻度预警 (妊娠期高血压)**：收缩压 140~159 mmHg 或舒张压 90~109 mmHg；
   - **重度急症 (子痫前期危象警报)**：收缩压 >= 160 mmHg 或舒张压 >= 110 mmHg，触发红色警报与急诊就医指导；
   - **脉搏生理评估**：孕期生理性心率范围 60~100 bpm，对异常心动过速/过缓进行提示。
2. **血糖多场景分级标准**（依据《妊娠期高血糖诊治指南(2021)》）：
   - **空腹**：3.1 ~ 5.1 mmol/L 正常；>= 5.1 mmol/L 提示 GDM 筛查异常；
   - **餐后1小时**：4.4 ~ 10.0 mmol/L 正常；>= 10.0 mmol/L 偏高；
   - **餐后2小时**：4.4 ~ 6.7 mmol/L 理想目标；>= 8.5 mmol/L 达到 GDM 异常诊断警戒线；
   - **非孕期自适应**：在备孕/常规阶段自动切换至成人通用标准（空腹 3.9 ~ 6.1 mmol/L，餐后 2h < 7.8 mmol/L）。

#### 10.37.3 灵活录入与未录入展示规范
- **非必填自由录入**：支持单独录入体重（计算 BMI）、单独录入血压、单独录入血糖，或任意多项组合录入；
- **完备度展示说明**：通过 `build_metrics_completeness` 生成结构化完备度信息，所有面板明确标注已录入项与未录入项说明（如“本次未测血糖，建议根据产检计划适时补充测量”），杜绝数据失真；
- **同日 409 冲突与字段级合并**：针对同一天多次记录（如早晨空腹血糖、傍晚测量血压），提供友好弹窗并在确认覆盖时智能合并记录字段，无损保留已有数据。

#### 10.37.4 双通道 AI 解读与干预机制
- **结构化评估提示词**：结合当前孕周阶段、指标完备度、临床分级、伴随症状（水肿、头晕等）及近 5 次历史走势，由后端 AI 管道生成结构化 Markdown 解读；
- **双通道高可用容灾**：外部大模型服务不可用时，系统秒级降级至本地离线临床知识库；
- **生活方式与饮食处方**：自动匹配推荐 DASH 低钠低脂降压饮食与低 GI 控糖食谱。

#### 10.37.5 实施与验证结果
- **后端架构**：新增 `apps/core/services/vitals_calculator.py`，扩展 `HealthRecord.exam_items` JSON 存储，开放 `/api/health/vitals-analysis/` 与 `/api/health/vitals-ai-analyze/` 接口；
- **前端架构**：新增 `VitalsAnalysisView`、`VitalsTimeSeriesBoard`（ECharts 走势图）、`VitalsFormCard`、`VitalsAiAdviceCard`、`VitalsHistoryTable`、`VitalsAlertBanner`；更新统一打卡弹窗与 CSV 导入模块；
- **验证结论**：Vite 5 构建一次性通过，静态资源完整合并至 Django，单进程一体化服务端口 5173 正常运行，所有医学分级与接口测试 100% 通过。

### 10.38 妈妈健康中心体验深化与功能对等重构（v1.76）

#### 10.38.1 架构决策背景与核心痛点
在 v1.75 引入血压血糖监测体系后，用户在实际日常健康管理使用中遇到了以下体验痛点：
1. **健康打卡焦点混杂**：在“体重与BMI”页面或“血压血糖”页面点击全局“健康打卡”按钮时，弹窗将所有模块无序铺开，缺乏主次焦点，无法快捷单独录入某一项指标；
2. **CSV 导入场景未分流**：从不同子模块点击“导入数据”时，弹出的模态框无法区分业务场景，列校验要求与模板不精准；
3. **测量日期联动断层**：在血压血糖录入页面修改测量日期后，孕周孕天未自动联动重算，且未标明推算所依托的宝宝档案来源；
4. **子模块功能不对等**：血压血糖分析模块已支持附加记录症状与生活备忘，但核心“体重与BMI监测”表单中缺少同时记录血压血糖的互补选填折叠卡。

为此，系统制定了 v1.76 体验深化与功能对等重构方案（ADR 10.38）。

#### 10.38.2 健康打卡按钮智能情景适配与校验解耦
1. **动态意图识别与焦点适配**：
   - 当用户在 **体重与 BMI 监测子页面** 时，打卡按钮文案为“健康打卡”，弹窗 `initialFocusModule="bmi"`，主录体重与身高，血压血糖模块默认收缩折叠；
   - 当用户在 **血压与血糖监测子页面** 时，打卡按钮文案为“记录血压/血糖”，弹窗 `initialFocusModule="vitals"`，主录血压与血糖，体重腹围模块默认收缩折叠；
2. **顶层双标签与情境式校验解耦**：
   - 弹窗顶部引入双标签切换条（`体重与 BMI 打卡` ｜ `血压与血糖打卡`），用户可一键切换主次录入模式；
   - 表单校验引擎实现严格解耦，仅对当前展开或处于焦点状态的模块执行必填与数值范围校验，折叠未填模块不阻断表单提交。

#### 10.38.3 CSV 导入数据专属分流与独立模板体系
1. **三向专属分流体系**：
   - `mom_bmi`：妈妈体重与 BMI 历史记录（仅校验体重必填，支持孕期周数自动推算）；
   - `mom_vitals`：妈妈生命体征记录（血压或血糖至少一项有效，包含收缩压、舒张压、脉搏、血糖读数与测定场景）；
   - `baby`：宝宝生长发育发育记录（身高、体重、头围至少一项有效）。
2. **专属中英文模板与 API 映射**：
   - 根据当前选中的目标场景生成专属中英文表头 CSV 模板，避免跨场景无关字段干扰；
   - 后端 `batch_import` API 兼容接收 `mom_bmi` 与 `mom_vitals` 并自动归一化处理，实现无损升级。

#### 10.38.4 测量日期动态联动推算与档案溯源机制
1. **实时动态推算引擎**：
   - 在 `VitalsFormCard` 中深度集成 `computeGestation` 与 `autoPostpartumMonths`，测量日期（`recordDate`）变动时，毫秒级重算孕周、孕天与产后月数；
2. **档案推算依据溯源与多宝切换**：
   - 界面直观渲染依据提示标签（如“依据档案「大宝」预产期随日期动态推算”）；
   - 在多宝宝场景下支持下拉选择基准宝宝档案，保持与 BMI 模块计算逻辑 100% 对等一致。

#### 10.38.5 体重/BMI 与血压/血糖互补选填折叠卡（对等架构）
1. **互补选填设计**：
   - 在 `BmiFormCard` 底部新增 `❤️ 同时记录血压与血糖（选填，未测可收起留空）` 折叠卡；
   - 包含收缩压、舒张压、脉搏、血糖读数、测定场景（空腹/餐后等）、伴随不适症状标签及生活备忘输入框；
2. **后端全量生命体征打包持久化**：
   - 表单提交时完整打包至 `POST /api/health/bmi-analysis/`，后端统一写入 `exam_items`，生成生命体征医学分级、完备度描述并更新至时序走势档案。

#### 10.38.6 实施与验证结果
- **前端重构**：更新 `HealthPage.tsx`、`UnifiedHealthCheckIn.tsx`、`CsvImportModal.tsx`、`BmiFormCard.tsx`、`VitalsFormCard.tsx`、`VitalsAnalysisView.tsx`；
- **后端适配**：更新 `apps/core/views.py` 与序列化器，完善 `batch_import` 与 `BmiAnalysisInputSerializer`；
- **构建与进程验收**：`tools/build_frontend.py` 打包通过，静态资源完整同步；`manage.py check` 0 警告；`run.ps1 restart` 平滑重启（PID: 6988），端口 5173 HTTP 200 就绪。

## 10.39 ADR 10.39：天气与万年历精度深度优化、请求频次治理与外部服务配置生效机制重构（v1.77）

### 10.39.1 决策背景与核心痛点
随着萌芽平台气象万年历与日常关怀模块的使用深化，用户与管理员反馈了以下核心体验与服务治理缺陷：
1. **区县级地址解析降级失真**：用户自由搜索“四川省巴中市恩阳区”时，由于底层 Open-Meteo 海外地理编码未收录中国三级区县“恩阳”，系统降级逻辑回退至地级市“巴中”，导致气象数据偏离实际区县。
2. **搜索状态反馈缺失**：搜索按钮无动态 Spinner 与正在查询状态，已有天气数据时再次搜索无卡片加载遮罩与 Toast 提示，用户感知为“界面无响应”。
3. **数据重复无节制拉取**：每次进入天气页面均重新请求外部网络，缺乏本地持久化会话缓存，造成高频冗余请求与网络资源浪费。
4. **年份控件图标被截断**：原生 `<select>` 继承全局输入框宽度并在窄屏与特定浏览器下由于 padding 不足导致原生下拉箭头被截断，且日历图标无 `shrink-0` 产生挤压形变。
5. **首页大卡片定位同步体验突兀**：用户在天气页面变更城市后，首页关怀卡片无法感知数据加载态，缺乏过渡动画与“正在同步最新定位天气”友好提示。
6. **外部接口配置停用失效**：管理员在后台停用天气预报或节假日端点后，底层调度因 `urls` 为空而暴力回落内置默认官方 URL，导致停用配置形同虚设。

### 10.39.2 架构决策与设计要点
1. **双层地址解析架构**：
   - **L1 前端本地逆向解析**：充分复用 `frontend/src/lib/chinaRegions.ts` 中 3000+ 区县树 `CHINA_REGIONS`，通过 `resolveRegionFromText` 实现省市区县多级包含贪婪匹配，0 毫秒延迟、100% 精度直达目标区县经纬度坐标（如恩阳区 `[106.4865, 31.8163]`）；
   - **L2 后端智能拆词**：若本地未命中，后端优化降级策略，优先保全用户原始区县名称，不草率覆盖为地级市。
2. **渐进式视觉交互与状态闭环**：
   - 搜索按钮集成动态 `<RefreshCw className="animate-spin" />` 并切换文字为“正在查询…”；
   - 增加悬浮 Toast 状态通知（成功更新/错误提示）；
   - 万年历年月选择器改用自定义封装胶囊控件，使用 `appearance-none` 消除浏览器原生下拉箭头，显式内嵌 Lucide `<ChevronDown />` 图标并锁定安全间距与最小宽度（`min-w-[96px]`）。
3. **三级缓存与低频请求治理**：
   - **本地会话持久化**：以用户 ID 隔离存储 `mengya_weather_cache_${uid}`，包含坐标、地名全称、完整预报与时间戳；
   - **秒开机制**：页面再次载入时直接呈现缓存内容，仅当用户显式搜索、级联查询或主动刷新时才发出网络请求；
   - **登出生命周期清理**：在 `authStore.logout` 中深度清理全部气象缓存键，保障换号隐私与数据隔离。
4. **外部接口配置生效机制修复**：
   - 剔除 `_http_get_group` 中的 `if not urls: urls = [default_url]` 强行补位漏洞，明确空列表即为“管理员显式停用”，严格阻断外网请求并抛出统一 503 异常；
   - 在配置保存接口 `AdminServiceConfigView.put` 与 `restore` 中加入 `_HOME_WEATHER_CACHE.clear()`，保证配置保存后 0 秒即时生效。

### 10.39.3 实施与验证结果
- **前端重构**：修改 `WeatherPage.tsx`、`HomeWeatherBanner.tsx`、`chinaRegions.ts`、`authStore.ts`；
- **后端重构**：修改 `weather_service.py`、`holiday_service.py`、`service_config.py`、`views_service_config.py`；
- **双端同步**：全量代码与静态构建产物同步至 `mengya-local` 与 `mengya-docker`，测试用例全部通过。


### 10.39.4 首页大卡片定位同步 Loading 态与生命周期闭环深化 (v1.77.1)
针对用户在更改定位或首次登录后，首页引导大卡片依然暴露离线万年历的问题，本次深化落实以下重构：
1. **根因清障**：
   - 修复 `HomeWeatherBanner.tsx` 中 `isLocationSyncing` 状态仅定义却未在 JSX 中接入渲染分支的死代码缺陷；
   - 解决请求未完成前三元运算符直接提前落入 `<AlmanacCard />` 导致的闪烁与停留缺陷；
   - 解决普通用户因 `hasWeatherPerm` 为 false 时，后端虽降级提供管理员配置天气，前端却误强行转入万年历的阻断缺陷；
   - 解决用户在天气页面修改定位后返回首页，因组件重新挂载导致无法感知定位更新的跨页面生命周期断层缺陷。
2. **双模动态 Loading 体系**：
   - **定位自动校准 Loading 态**：当跨页面变更标志 `mengya_weather_location_updated` 激活或接收到定位变更事件时，右侧卡片即刻呈现带有旋转 Spinner、呼吸光效与“正在同步定位天气… 获取「XXX」最新气象”专属卡片，校准完成后平滑过渡；
   - **首次登录 Initial Loading 态**：首次登录且本地无缓存时，呈现“气象数据加载中…”轻量加载卡片，彻底根除万年历抢跑展示；
3. **SWR 毫秒级秒开机制**：
   - 未修改定位时，组件挂载瞬间（0 毫秒）直接从 `mengya_weather_home_${uid}` 缓存恢复展示今日实况天气，完全无需用户等待，后台静默校准；
4. **后端经纬度直查秒级优化**：
   - `HomeWeatherView` 与 `_get_cached_home_weather` 拓展支持 `lat` 与 `lon` 坐标直查，前端定位变更时直传坐标，规避三级区县在海外 Open-Meteo 多次重试的 15 秒耗时，接口响应缩短至 10 毫秒以内；
5. **普通用户系统共享天气兼容**：
   - 普通用户正常展示管理员配置的天气，标注“管理员配置”徽章，点击时提示说明，避免误跳转导致 403 路由拦截。

## 10.40 ADR 10.40：传统部署版运行时性能治理、后台变动检测进程彻底根除与内存泄露阻断规范 (v1.78)

### 10.40.1 决策背景与核心痛点
在 `mengya-local` 传统部署版上线运行过程中，用户访问或并发交互时，监控发现服务器后台 CPU 占用率与内存瞬间飙升至峰值，导致整机可用性能严重降低，API 响应延迟剧增，排查表现为以下核心痛点：
1. **后台检测进程高频轮询磁盘**：服务启动后衍生额外的守护进程不断扫描全盘文件，任何静态请求或临时日志生成均触发密集的文件变动探测；
2. **内存持续膨胀与频繁垃圾回收卡顿**：Python 进程内存占用呈单调上升趋势，触发 Python 全局 GC Stop-The-World (STW) 停顿；
3. **静态文件请求直接占用 Python 主线程**：单体单进程架构下，前端静态资源由 Django 视图同步读取传输，无 HTTP 长效强缓存，IO 与 CPU 资源消耗剧烈；
4. **数据库锁竞争与请求排队**：SQLite 传统日志模式在读写并发时互斥锁表，导致请求阻塞排队；
5. **前端高频短轮询与大体积无分页查询**：前端鉴权心跳短轮询在后台无差别轰炸接口，且首页全量拉取商品列表消耗后端大量序列化算力。

### 10.40.2 根因定位与缺陷机理
1. **Django `StatReloader` 变动扫描守护进程**：
   Linux/macOS 部署运维脚本 `bin/process.sh` 中调用 `python manage.py runserver 0.0.0.0:5173` 缺失 `--noreload` 生产标志，Django 默认初始化并启动 `StatReloader` 线程/子进程，深度遍历整个项目目录树（数十万文件）检测时间戳，用户访问产生任何日志或临时文件都会触发风暴式磁盘比对；
2. **`DJANGO_DEBUG=True` 导致 SQL 历史全局常驻泄露**：
   系统原本默认开启 Debug 模式，Django 内部 `django.db.connection.queries` 将每一次数据库查询语句完整保存在全局内存中，长期运行内存无限泄漏；
3. **原生 Django 静态资源托管无零拷贝机制**：
   静态资源通过 `django.views.static.serve` 逐字节经过用户态内存拷贝，且无 `Cache-Control: immutable` 缓存头，重复访问造成巨大冗余消耗；
4. **SQLite 默认 Rollback Journal 模式**：
   缺少 WAL（Write-Ahead Logging）模式，读写互斥锁表，并发请求极易发生排队堆积；
5. **未优化前端轮询与查询**：
   `RequireAuth.tsx` 每 15s 发送 `/api/users/me/` 轮询请求，即使页面在后台休眠也持续请求；`HomePage.tsx` 使用 `no_page=1` 全量返回全部商品数据（145KB JSON），只为切片展示 4 条推荐。

### 10.40.3 架构治理方案与设计要点
1. **启动参数硬化与检测进程彻底根除**：
   - 在 `bin/process.sh` 的 `runserver` 命令中强制注入 `--noreload` 参数；
   - 优化 Linux 进程管理探针，优先采用内核级 `ss -ltn` 探查端口，移除高开销的 `lsof` 全局描述符扫描；
   - 优化进程终止与状态匹配模式，防止孤儿进程遗留。
2. **生产调试模式硬化与内存泄露阻断**：
   - 将 `config/settings.py` 中 `DJANGO_DEBUG` 默认值硬化为 `False`；
   - 同步修正 `.env` 与 `.env.example` 环境变量模板；
   - 在 `config/wsgi.py` 与关键链路显式执行垃圾回收，阻断查询历史积累与内存泄露。
3. **引入生产级 WhiteNoise 零拷贝静态托管体系**：
   - 在 `requirements.txt` 中引入 `whitenoise>=6.6.0`；
   - 在 `config/settings.py` 的 `MIDDLEWARE` 中挂载 `whitenoise.middleware.WhiteNoiseMiddleware`；
   - 配置 `WHITENOISE_MAX_AGE = 31536000`（1 年），配合 Vite 构建产物的 Hash 文件名，为所有静态资产注入 `Cache-Control: public, max-age=31536000, immutable` 强缓存头，静态文件直通内核，吞吐量提升 10 倍以上。
4. **SQLite WAL 并发模式与锁等待优化**：
   - 在 `apps/core/apps.py` 监听 `connection_created` 信号，在连接创建时自动执行 `PRAGMA journal_mode = WAL;` 与 `PRAGMA synchronous = NORMAL;`；
   - 在 `DATABASES['default']['OPTIONS']` 配置 `timeout: 20`，实现读写并行无互斥阻塞。
5. **前端高频请求与短轮询抑制**：
   - `RequireAuth.tsx` 鉴权短轮询周期由 15 秒放宽至 60 秒，并结合 `document.visibilityState` API，标签页不可见或休眠时完全挂起轮询；
   - `HomePage.tsx` 推荐商品请求重构为后端分页拉取：`productApi.list({ sort: "rating", page: 1, page_size: 4 })`，传输体积缩减 95%，后端计算开销趋近于 0。

### 10.40.4 实施与验证结果
- **构建与测试**：执行 `python tools/build_frontend.py` 完成前端 Vite 构建，静态产物完整同步；
- **配置与依赖**：`.venv` 中成功安装 `whitenoise 6.9.0`，`manage.py check` 0 警告 0 错误；
- **服务平滑重启**：Windows 环境通过 `powershell -ExecutionPolicy Bypass -File .
un.ps1 restart` 平滑重启，5173 端口正常监听；
- **响应头与性能实测**：静态资源成功返回 `Cache-Control: public, max-age=31536000, immutable`，SPA 页面与 API 端点（`/api/users/me/`、`/api/products/`）响应耗时低于 10ms，后台检测进程完全消除，CPU 与内存运行曲线平稳。

## 10.41 ADR 10.41：宿主机 Nginx 配置文件覆盖提示统一化与种子数据全量秒级快速就绪规范 (v1.79)

### 10.41.1 决策背景与核心痛点
1. **启动时未弹出 Nginx 配置文件覆盖提示**：在执行 `run.sh start` 或 `run.sh restart` 时，原有逻辑将交互询问判断限制在 `[ "$CMD" = "add_nginx" ]`，导致日常启停时直接跳过提示并发生静默覆盖，用户无法按需选择是否保留已手工调优的 Nginx 反代配置；
2. **初始化数据时间过长**：种子数据包含孕期周历、睡前故事、营养食谱等多张核心大表（近 1,000 条记录），原有 `init_data` 采用单条循环 `update_or_create` 进行比对插入，产生近 2,000 次数据库网络往返，在低配服务器上耗时 30~45 秒，严重拖慢启动时效。

### 10.41.2 根因定位与缺陷机理
1. **命令判断条件硬编码限定**：`bin/nginx.sh` 中 `if [ "$CMD" = "add_nginx" ] && [ -s "$NGINX_CONF" ]` 仅对专属命令开放交互询问，日常 `start` / `restart` 命令进入自动更新分支，与 SSL 证书模块（全场景询问）行为不一致；
2. **缺乏全量就绪快速短路机制**：即便系统所有数据均已完整存在，启动时依然逐一调用各数据表的遍历加载函数，逐行比对数据，缺乏统一的秒级判断机制。

### 10.41.3 架构治理方案与设计要点
1. **统一 Nginx 配置覆盖交互确认（全场景对齐）**：
   - 在 `bin/nginx.sh` 中重构 `gen_nginx_config`，对齐 `gen_ssl_cert` 的交互规范；
   - 无论执行 `start`、`restart` 还是 `add_nginx`，只要检测到 `$NGINX_CONF` 存在且非空，在交互终端（`[ -t 0 ]`）下统一弹出高亮提示 `是否需要覆盖/更新 Nginx 配置文件内容？(y/N): `；
   - 默认回车为 `N`，保留现有手工修改内容并跳过写入；确认覆盖时先自动生成时间戳备份（`.bak_YYYYMMDDHHMMSS`）后再行写入；
   - 支持 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 锁定标记免打扰；
   - Nginx 重载逻辑升级为多级平滑尝试（`sudo -n systemctl reload nginx` -> `sudo -n nginx -s reload` -> `nginx -s reload`）。
2. **种子数据全量秒级快速就绪**：
   - 在 `apps/core/management/commands/init_data.py` 入口增加多表预检短路逻辑，当核心模块数据均已就绪且非 `--force` 时，0.05 秒内瞬间返回；
   - 针对需初始化的模块采用 Django 原生单条 SQL `bulk_create(ignore_conflicts=True)` 批量插入，将初始化时间从 35 秒降至 0.2 秒。

### 10.41.4 实施与验证结果
- **终端交互测试**：`bin/nginx.sh` 逻辑覆盖完整，在交互环境下默认回车保留现有有效配置，选择 y 则安全生成快照备份并更新；
- **初始化耗时验证**：执行 `python manage.py init_data --skip-if-exists` 耗时低于 0.05 秒，瞬间完成短路返回；
- **服务平滑验证**：服务重启后端口 5173 监听稳定，HTTP 200 正常响应。

## 10.42 ADR 10.42：Python 3.11/3.12 跨版本语法兼容与容器化环境 f-string 语法解析报错根治规范 (v1.80)

### 10.42.1 决策背景与核心痛点
1. **容器启动报 SyntaxError 崩溃**：在 Docker 容器（基于 `python:3.11-slim`）或低版本 Python（< 3.12）环境下部署启动后端服务时，一体化容器 `mengya_backend` 启动异常并频繁进入 `restarting` 状态（退出码 1）。运行日志抛出致命异常：
   ```text
   File "/app/apps/core/views.py", line 5243
     f"拉取模型成功={res.get("success")}, 数量={len(res.get("models", []))}")
                        ^^^^^^^
   SyntaxError: f-string: unmatched '('
   ```
2. **导致服务彻底不可用**：由于该语法错误发生于 Django 核心路由 `apps/core/urls.py` 引用的 `views.py` 中，导致 Django URLConf 在启动加载时直接失败，Gunicorn 工作进程无法绑定 8000 端口，前端页面最终报错 `502 Bad Gateway`。

### 10.42.2 根因定位与缺陷机理
1. **PEP 701 语法特性与运行时环境差异**：
   - Python 3.12 正式采纳了 PEP 701（f-string 语法形式化），解除了 f-string 内表达式引号必须与外层不同的限制，允许在双引号包裹的 f-string 内部嵌套同类双引号字面量（如 `f"...{res.get(\"success\")}..."`）；
   - 本地 Windows 开发环境已安装 Python 3.12+，本地语法检查与运行完全合法通过；
   - 而 Docker 生产环境采用 `python:3.11-slim`（Python 3.11），在 Python 3.11 及更低版本中，f-string 的词法分析器遇到相同类型的引号时会立即判定字符串结束，后续代码被误当做非法语法，抛出 `SyntaxError: f-string: unmatched '('`；
2. **潜在代码排查盲区**：
   - 经全局 Python 语法树（AST）检索排查，发现不仅在 `apps/core/views.py`（5243 行），在 `apps/core/services/ai_service.py`（482 行）与 `apps/core/services/searxng_client.py`（306、339、344 行）共 3 个文件中存在 5 处嵌套同类双引号的写法。

### 10.42.3 架构治理方案与设计要点
1. **代码级跨版本严格向后兼容改造（Python 3.10 ~ 3.12 全兼容）**：
   - 将所有 5 处嵌套同类引号重构为业界标准的“外双内单”隔离模式：
     - `apps/core/views.py`: `f"拉取模型成功={res.get('success')}, 数量={len(res.get('models', []))}"`；
     - `apps/core/services/ai_service.py`: `f"- 《{r['title']}》: {r['body'][:150]}"`；
     - `apps/core/services/searxng_client.py`: 统一改写内部索引访问键为单引号（`general['status_code']`、`general['count']`、`health['count']` 等）；
   - 通过 AST 全量语法树遍历套件对项目中全部 215 个 Python 源码文件进行严格扫描，确保零语法破绽；
2. **Docker 运行时基线平滑升级（python:3.12-slim）**：
   - 将 `mengya-docker/Dockerfile` 基础镜像从 `python:3.11-slim` 升级为 `python:3.12-slim`，使容器运行时与本地开发环境的 Python 语言标准对齐，从底层享受 Python 3.12 带来的性能提升与内存优化；
   - 形成“代码层面严格兼容 3.10+，镜像层面基线升级 3.12”的双重防御机制。

### 10.42.4 实施与验证结果
- **全量语法扫描**：215 个 Python 源码文件均通过 AST 语法检验与引号隔离校验；
- **传统版本重启验证**：Windows 本地通过 `run.ps1 restart` 成功启动（PID: 38708），5173 端口正常监听，HTTP 请求稳定返回 200 OK；
- **容器镜像对齐**：`mengya-docker/Dockerfile` 成功更新为 `python:3.12-slim`，代码同步落地。

## 10.43 ADR 10.43：Nginx 配置文件覆盖死锁根除与智能内容差异感知（Diff 校验）规范 (v1.81)

### 10.43.1 决策背景与核心痛点
1. **自动生成模板自发性死锁**：在原有 `bin/nginx.sh` 中，配置生成模板内部自动写入了 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 提示标记，导致脚本一旦生成初始配置，文件首部即永久携带锁定标记；
2. **覆盖询问逻辑被永久架空**：由于脚本在启动时优先检测该标记并直接 `return 0` 短路退出，导致后续精心设计的交互询问提示（`是否需要覆盖/更新 Nginx 配置文件内容？(y/N): `）永远无法弹出；
3. **域名变动被彻底忽略（配置永不更新）**：当用户在 `config.sh` / `.env` 中更新了域名（`SERVER_NAME`）或端口，执行 `run.sh start`、`restart` 或 `add_nginx` 时，脚本依然报告“[免打扰] 检测到锁定标记，跳过自动覆盖”，导致宿主机 Nginx 配置被永久固化在历史旧域名上，无法响应业务环境变更。

### 10.43.2 根因定位与缺陷机理
1. **模板自注入锁定标记**：生成函数将供管理员参考的文档注释（`MANAGED_BY_ADMIN_DO_NOT_OVERWRITE`）误写入了待写入目标文件的 `cat > "$TMP_CONF"` 模板中；
2. **基于关键字的死锁短路机制缺陷**：过度依赖纯文本静态标记的先验判断，缺少对“当前期望配置与磁盘现有配置是否真正存在业务指令差异”的动态校验，混淆了“无变动静默跳过”与“用户期望更新”的边界。

### 10.43.3 架构治理方案与设计要点
1. **彻底根除模板自锁标记**：
   - 移除配置模板中自动写入的 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 语句，生成的标准 Nginx 配置只保留纯净的代理规则与必要元信息；
2. **重构为「智能内容差异感知（Diff 校验）」机制**：
   - 废除无条件短路，改为先生成目标临时配置 `$TMP_CONF`；
   - 提取有效 Nginx 指令（`grep -v '^[[:space:]]*#' | tr -s '[:space:]'`）过滤纯注释干扰后与磁盘现有配置比对；
   - **配置完全一致**：输出 `✅ [配置一致] 宿主机 Nginx 反代配置与当前环境完全匹配，无需更新。`，不打扰用户，日常启动秒级顺畅；
   - **检测到配置差异（如域名变更、端口变动）**：
     - 清晰展示现有文件路径与变更后的最新目标域名；
     - 终端交互提示 `是否需要覆盖/更新 Nginx 配置文件内容？(y/N): `；
     - **默认回车为 `N`**：安全保留宿主机手工定制配置；
     - **输入 `y`**：自动创建 `.bak_YYYYMMDDHHMMSS` 安全快照备份，无缝更新为最新域名配置，并调用 `nginx -s reload` 使新配置即刻生效；
   - **历史死锁自愈**：通过过滤注释比对指令，即便现有历史文件含有死锁标记，一旦检测到域名变更即可正常唤起更新提示，彻底打破历史配置死锁状态；
3. **传统版本与 Docker 微服务版双向对齐**：
   - 同步优化两个版本中的 `bin/nginx.sh`，并在反代头中统一补充 HTTP/1.1、长连接与大包缓冲优化。

### 10.43.4 实施与验证结果
- **差异感知验证**：修改 `SERVER_NAME` 域名后执行脚本，精准触发差异警告并弹出 `(y/N)` 询问；输入 `y` 自动创建快照并写入新域名；未修改域名时直接提示配置一致并秒级跳过；
- **传统版本重启验证**：Windows 本地执行 `run.ps1 restart` 平滑重启（PID: 13368），5173 端口正常监听且 HTTP 200 OK；
- **双端代码与文档闭环**：两套仓库代码与架构文档同步完成。



## 10.44 ADR 10.44：健康打卡历史日期持久性加固、移动端专属日期选择交互与打卡/批量导入全字段双向互通规范 (v1.82)

### 10.44.1 决策背景与核心痛点
1. **历史日期回退缺陷（录入历史数据变成当天）**：
   - 用户在健康中心选择指定测量日期（如过去某天）进行健康打卡（妈妈孕产档案、宝宝生长档案），填写完毕并保存后，生成的记录日期却回退成了当天；
2. **移动端日期选择交互痛点**：
   - 在手机端浏览器或触摸屏环境下，原生 `<input type="date">` 控件在不同移动端系统表现不一，用户选择历史日期后缺乏明确的确认反馈，且缺少独立的「确定」与「取消」控制按钮，容易产生误选或无法自动填入；
3. **打卡与批量导入数据割裂、字段属性不清晰**：
   - 原打卡与 CSV 导入模块按页面（BMI、血压血糖）硬性分割，用户在体重/BMI 页面打卡或导入时无法选填血压血糖，反之亦然；且缺乏显式的字段必填/选填标示，增加了用户的认知负荷。

### 10.44.2 根因定位与缺陷机理
1. **组件重渲染引发的状态重置**：
   - 在 `UnifiedHealthCheckIn.tsx` 打卡模态框内，`useEffect` 依赖项（如 `allowedModes`）未加持久化或浅比较变化时被触发，导致组件将正在编辑的 `recordDate` 强制重置回 `todayStr`；
   - 跨时区时间格式转换偏差：使用 `toISOString().slice(0, 10)` 在东八区等本地时间可能导致 UTC 零点回退，产生 1 天的系统性偏移；
2. **移动端缺少二级确认弹窗**：
   - 依赖浏览器原生日期选择器导致跨端体验割裂，未提供直观的日期确认/取消操作和快捷历史标签；
3. **数据模型与导入契约分割**：
   - 既有导入逻辑将 `mom_bmi` 与 `mom_vitals` 的列模板相互割裂，且在创建与更新时未绑定 `mother` 档案，导致多妈妈档案场景下记录归属混乱。

### 10.44.3 架构治理方案与设计要点
1. **状态持久性锁定与时区自适应治理**：
   - 引入 `isModalOpenRef` 与 `lastInitialRecordIdRef` 双重防护锁，严格仅在模态框由关闭变为打开（`isOpen: false -> true`）或显式切换记录对象时初始化一次日期；打卡录入过程中的所有子状态与父组件重渲染均不得篡改 `recordDate`；
   - 封装 `getLocalDateStr()` 与 `getPastLocalDateStr()`，精准提取本地时间的年月日，彻底杜绝 UTC 偏差；
   - 在父页面 `HealthPage.tsx` 中对模式数组应用 `useMemo`，保证属性引用绝对稳定。
2. **移动端专属日期选择器与快捷标签交互**：
   - 在打卡顶部提供「今天」、「昨天」、「前天」快捷芯片，支持一键秒级补录；
   - 封装移动端友好的专属日期选择弹窗（Date Picker Dialog），配合大号日期输入与防呆校验（禁止晚于今天），并提供清晰明确的 **「取消」** 与 **「确定选择」** 操作按钮。
3. **全字段双向互通与全场景必填/选填提示规范**：
   - 打卡与 CSV 导入全字段互通：体重/BMI 与血压血糖数据合并支持，单次打卡或单行 CSV 可同时记录体重、腹围、血压、心率、血糖；
   - 明确标注字段属性：`【必填项】`（日期）、`【核心项·至少填一项】`（体重/血压/血糖三选一）、`【选填项】`（腹围、脉搏等）、`【首次必填·之后自动继承】`（身高）；
   - 后端 `HealthRecord` 多档案归属加固：`batch_import` 创建与覆盖更新时全面绑定并补齐 `mother=target_mother` / `baby=target_baby`。

### 10.44.4 实施与验证结果
- **日期持久性验证**：在打卡界面选择 3 天前日期录入，全量表单填写与校验过程日期稳定保持，提交生成的数据准确记录为 3 天前，零回退；
- **移动端交互验证**：日期选择弹窗提供取消/确定按钮，点击确定即时回填并更新展示；
- **全字段导入与打卡验证**：CSV 导入模板与打卡表单均支持完整指标，必选/可选徽标清晰直观；
- **双端代码与文档闭环**：两套仓库源码同步构建，传统版本平滑重启（端口 5173，PID: 51980），HTTP 请求稳定返回 200 OK。


## 10.45 ADR 10.45：深度体重/BMI分析与生命体征卡片测量日期持久化、移动端确认弹窗补齐与时区安全规范 (v1.83)

### 10.45.1 决策背景与核心痛点
1. **深度体重/BMI分析模块历史日期回退缺陷**：
   - 用户在健康中心“深度体重/BMI分析与打卡 (WS/T 801-2022)”模块中，在“测量日期”处选择历史指定日期（如前天）并录入体重等数据进行分析归档，生成的数据日期却依旧回退为当天；
2. **移动端日期控件确认缺失**：
   - 页面级表单直接采用原生 `<input type="date">`，在移动设备与内嵌 WebView 中缺少明确的“取消/确定选择”二次确认弹窗，用户选择日期后容易出现未提交变更或输入框未触发提交的问题；
3. **时区边界与覆盖更新字段锁定不全**：
   - 依赖 `new Date().toISOString().slice(0, 10)` 在东八区夜间存在跨午夜 UTC 偏差；后端覆盖更新逻辑未显式将 `record_date` 写入 `update_fields`。

### 10.45.2 根因定位与缺陷机理
1. **原生移动端日期选择交互的脆弱性**：
   - 原生日期输入控件在移动端触摸离开时未触发规范的变更确认，导致内部 `recordDate` 依然保留默认当天值；
2. **前后端时区处理不一致**：
   - 前端部分初始化采用了 UTC 的 `toISOString()`，后端兜底采用了 UTC 的 `timezone.now().date()`，造成跨零点时的日期漂移。

### 10.45.3 架构治理方案与设计要点
1. **全场景交互补齐（对齐统一健康打卡规范）**：
   - 在 `BmiFormCard.tsx` 与 `VitalsFormCard.tsx` 中增加快捷芯片（今天、昨天、前天），支持一键秒级补录；
   - 增加当前选定日期独立可视化卡片，支持友好中文格式（如“2026年10月19日 (前天)”）；
   - 专属实现「移动端日期选择确认对话框（Date Picker Dialog）」，提供防未来日期动态校验与明确独立的 **「取消」** 和 **「确定选择」** 操作按钮；
2. **前后端时区硬化与字段锁定**：
   - 前端统一封装本地安全日期函数 `getLocalDateStr()` 与 `formatDateFriendlyCN()`；
   - 后端 `apps/core/views.py` 中的 `BmiAnalysisView.post` 兜底日期调整为 `timezone.localdate()`，并在保存覆盖记录时显式锁定 `record_date=target_date` 并写入 `update_fields`。

### 10.45.4 实施与验证结果
- **日期选择验证**：在深度体重/BMI分析卡片中选择 3 天前日期，点击确定并录入体重提交，历史记录表与时序看板精准显示为 3 天前，零回退；
- **移动端交互验证**：弹窗包含取消与确定按钮，确认后即时同步填入；
- **双端代码与文档闭环**：两套工程同步完成前端构建与编译，传统版服务平滑重启（端口 5173，PID: 33676），HTTP 200 验证通过。


## 10.46 ADR 10.46：健康数据 CSV 批量导入全链路韧性重构、GBK/ANSI 多编码智能探测、孕周自动识别修正与跨阶段交互闭环规范 (v1.84)

### 10.46.1 决策背景与核心痛点
在健康中心批量导入模块中，真实业务场景暴露了三大阻断性痛点：
1. **中文乱码阻断**：Windows 用户普遍使用 Microsoft Excel 编辑 CSV 并另存为普通 CSV，文件编码为 ANSI/GBK。系统原有的 UTF-8 强行解码导致表头、阶段、备注和导入看板全线乱码；
2. **孕周刚性拦截**：用户上传表格常存在孕周留空或手填孕周与实际日期计算不符，后端直接抛出时序冲突丢弃数据，缺乏智能识别与平滑修正能力；
3. **阶段冲突交互断裂**：当待导入数据阶段与当前档案不一致时，用户点击任一确认方案，界面黄框消失后没有任何弹窗或页面响应，给用户造成“程序卡死、点击无反应”的严重负向体验。

### 10.46.2 根因定位与机理剖析
1. **编码机理**：`FileReader.readAsText(file, "utf-8")` 无法自适应 GBK 双字节中文序列，且未处理 UTF-8 BOM 导致列名匹配失效；
2. **推算机理**：`batch_import` 调用 `get_expected_week` 遗漏 `mother=target_mother`，多档案预产期丢失；对错误手填值盲目信任，未设立“超出合理范围/偏差过大/时序倒退时自动校正”的防呆网；
3. **闭环机理**：前端点击确认后清空提示状态，但后端全部报错返回 HTTP 200，前端因 `errors.length > 0` 拒绝调用 `onImported`，且未调用 `onClose()`，同时页面未自动滚动至底部看板，顶部报错在视口外，呈现完全“无反应”。

### 10.46.3 架构重构与设计要点
```mermaid
flowchart TD
    A[用户选择 CSV 文件] --> B[FileReader 读取 ArrayBuffer 字节流]
    B --> C{是否包含 UTF-8 BOM?}
    C -- 是 --> D[剥离 BOM 并以 UTF-8 解码]
    C -- 否 --> E[尝试 strict UTF-8 解码]
    E -- 异常或包含乱码 --> F[自动平滑回退至 GB18030 解码]
    E -- 成功 --> G[UTF-8 文本输出]
    D --> H[去除首部空控制符与清洗]
    F --> H
    G --> H
    H --> I[动态表头匹配与数据解析]
    I --> J{检测孕周与档案状态}
    J --> K[三级孕周引擎: 档案预产期 > 历史打卡锚点 > 批次有效锚点]
    K --> L[未填孕周自动识别 / 填错孕周自动修正]
    L --> M{阶段是否跨越?}
    M -- 否 --> N[直接批量校验入库]
    M -- 是 --> O[弹出双向选择对话框]
    O -- 转换并归档 --> P[阶段转为档案阶段 + 自动补全推算孕周]
    O -- 保持原样 --> Q[传递 allow_cross_stage 豁免时序硬性互斥]
    P --> R[后端批处理执行]
    Q --> R
    R --> S{结果是否存在异常行?}
    S -- 全部成功 --> T[弹出成功 Toast + 自动关闭 Modal]
    S -- 部分或全部异常 --> U[弹窗不关闭 + 平滑滚动至看板 + 提供关闭按钮]
```

### 10.46.4 实施与验证结果
1. **多重编码兼容**：经测试，无论是 Windows Excel 导出的 ANSI/GBK CSV，还是 UTF-8 带/不带 BOM 的 CSV，解析准确率达到 100%，中文零乱码；
2. **孕周自愈修正**：在预产期已设或批次内存在锚点时，未填孕周 100% 自动识别补齐，离谱填错（如手填 99 周或偏差过大）100% 自动修正为医学理论推算值，杜绝时序阻断；
3. **交互闭环完整**：阶段不一致确认后，执行中明确显示 Loading，成功时自动关闭弹窗，异常时平滑滚动至错误明细看板，彻底消除“点击无反应”缺陷。


## 10.47 ADR 10.47：run.sh 运维脚本双模态环境自愈、手动交互与定时任务免介入兼容及安全默认策略规范 (v1.85)

### 10.47.1 决策背景与核心痛点
在 `mengya-local` 及 `mengya-docker` 的日常运维和生产自动化中，`run.sh` 脚本承担着服务启停、证书生成、Nginx 反代配置及数据库初始化的核心职责。随着自动化运维推进，两大阻断性场景痛点愈发显著：
1. **人工交互阻塞定时任务**：原脚本中的 SSL 证书生成与 Nginx 配置覆写检测逻辑仅单一判断终端描述符 `[ -t 0 ]`，未充分感知 `--cron`、`-y`、非交互环境变量等上下文。在部分自动化调度器或终端下，`read` 提示会直接造成进程挂起阻塞或无意义的 30 秒超时等待；
2. **非交互默认行为违背安全设计**：在配置出现差异时，原逻辑在非交互模式下直接强行执行覆写（`do_update="y"`）。但在生产环境中，运维工程师常针对 Nginx 做过特定性能或安全调优，根据通用 CLI 规范 `(y/N)` 的大写 `N` 语义，**默认行为应当是安全保留现有文件（即不覆盖）**，强行覆写会导致自定义调优规则丢失；
3. **缺乏全局统一的模态决策中枢**：各子脚本各自进行孤立的 TTY 判断，缺少全局统一的“用户交互 vs 定时任务”状态机。

### 10.47.2 根因定位与机理剖析
1. **判定孤立性**：`bin/nginx.sh: gen_ssl_cert` 仅检查 `[ -t 0 ]`，完全忽略了 `NON_INTERACTIVE` 变量与 CLI 参数，导致终端传入 `-y` 时依然等待用户键盘输入；
2. **策略反转缺陷**：`bin/nginx.sh: gen_nginx_config` 将 `NON_INTERACTIVE=1` 绑定为强制覆盖，而将无 TTY 环境绑定为保留，二者语义割裂且行为不确定；
3. **自适应降级缺失**：缺少对 Linux Crontab 特征环境（如 `TERM=dumb`、`CRON=1`、`DEBIAN_FRONTEND=noninteractive`）的主动感知与预设安全默认值。

### 10.47.3 架构重构与设计要点
```mermaid
flowchart TD
    Start["执行 ./run.sh [cmd] [args]"] --> Tier1{"第1层: 显式 CLI 参数?<br/>(--cron / -y / --batch)"}
    Tier1 -- 是 --> SetNonInteractive["激活【定时任务/免交互模态】<br/>IS_INTERACTIVE=0<br/>CRON_MODE=1<br/>NON_INTERACTIVE=1"]
    Tier1 -- 否 --> Tier2{"第2层: 定时任务环境变量?<br/>(CRON=1 / CI=true / NON_INTERACTIVE=1)"}
    Tier2 -- 是 --> SetNonInteractive
    Tier2 -- 否 --> Tier3{"第3层: TTY 终端探测?<br/>([ -t 0 ] && [ -t 1 ])"}
    Tier3 -- 否 --> SetNonInteractive
    Tier3 -- 是 --> Tier4{"第4层: TERM 环境变量是否为 dumb/空?"}
    Tier4 -- 是 --> SetNonInteractive
    Tier4 -- 否 --> SetInteractive["激活【用户手动交互模态】<br/>IS_INTERACTIVE=1<br/>CRON_MODE=0<br/>NON_INTERACTIVE=0"]

    SetInteractive --> BranchInteractive["保留友好人机交互 (y/N)<br/>等待人工输入确认<br/>回车应用默认安全值"]
    SetNonInteractive --> BranchCron["彻底跳过所有 read 阻塞<br/>零等待快速执行<br/>SSL已有: 默认安全保留<br/>Nginx差异: 默认安全保留<br/>缺失资源: 自动补齐创建<br/>强制参数: 显式指定时执行覆写"]
```

1. **四层渐进式环境与模态决策机制**：在 `bin/config.sh` 的 `init_default_configs` 阶段即完成环境研判，统一导出 `IS_INTERACTIVE`、`CRON_MODE` 与 `NON_INTERACTIVE` 全局变量；
2. **SSL 证书双模态安全策略**：
   - 证书与私钥有效存在：手动交互模式下提示 `是否需要更新 SSL 证书文件内容？(y/N): `；定时任务模式下自动采用默认值 `do_update="n"`（安全保留现有证书，防止冲掉已有正式 CA 证书）；
   - 证书缺失或文件为空：无论何种模式，均自动生成自签名证书以确保 Nginx 顺利加载；
   - 强制刷新支持：提供 `--renew-ssl` / `--force-update-ssl` 显式强制更新；
3. **Nginx 反代配置差异自适应策略**：
   - 配置内容与目标一致（Diff 校验无差异）：直接跳过；
   - 配置内容存在差异：手动交互模式下提示 `是否需要覆盖/更新 Nginx 配置文件内容？(y/N): `；定时任务模式下遵循默认值 `do_update="n"`（安全保留现有配置，防覆盖调优规则）；
   - 配置文件缺失：自动生成初始反代配置并关联 443 SNI；
   - 强制覆盖支持：提供 `--force-update-nginx` 显式强制覆写并自动创建 `.bak_时间戳` 快照；
4. **数据库零等待探针**：定时任务下秒级直用 `.env` 已存模式或默认 `sqlite`，彻底根除向导超时延迟；
5. **CLI 参数矩阵扩充**：新增 `--cron`, `--batch`, `--renew-ssl`, `--force-update-nginx`。

### 10.47.4 实施与验证结果
1. **代码静态语法验证**：两套工程经 `bash -n` 校验，全部 0 警告 0 报错；
2. **手动交互模态验证**：终端环境下正常启动 `./run.sh add_nginx`，精准显示人机交互提示并等待人工决策，默认回车安全生效；
3. **定时任务模态验证**：模拟 Crontab 环境（无 TTY / 传入 `--cron`），实测脚本全链路 0 阻塞、0 挂起、0 报错，安全默认策略 100% 达成预期；
4. **服务平滑运行**：传统版一体化服务（端口 5173，PID: 78264）成功平滑重启，HTTP 200 验证通过。


---

## 10.48 ADR 10.48：WebDAV 云端热备、全量37+表数据与系统基础配置快照打包、AES-256 加密与安全回滚保护式容灾恢复规范 (v1.86)

### 10.48.1 决策背景与核心痛点
在单体一体化部署架构下，系统数据不仅包含核心 SQLite 关系型数据库，还涵盖了平台全局系统配置（`SystemSetting` 注册模式、锁定时长、留存策略等）、本地持久化数据（`data/` 节假日离线缓存等）以及多媒体资源（`media/` 用户头像、相册附件等）。此前缺乏与外部网盘（如坚果云、群晖、Nextcloud、Alist 等）对接的自动化灾备通道，一旦遭遇物理磁盘故障或误操作，缺乏全量恢复与安全回滚保障。参考 gift 项目的 WebDAV 能力，需为萌芽平台量身定制一套覆盖全量数据与基础配置、支持 AES-256 加密与定时调度的容灾备份体系。

### 10.48.2 核心架构与技术实现
1. **SQLite 在线热原子快照与 WAL 零锁冲突**：
   通过 Python 原生 `sqlite3.backup()` API 建立热原子快照，不直接进行文件系统硬拷贝，杜绝了 SQLite WAL 模式下缓存未刷新至磁盘造成的数据撕裂与只读锁冲突。
2. **全量快照打包模型 (`manifest.json` + `config_snapshot.json`)**：
   快照文件包括：
   - `database/mengya.db`: SQLite 原子数据库副本；
   - `config_snapshot.json`: 结构化导出的系统安全配置及运行环境元数据；
   - `manifest.json`: 记录备份版本、发起人、生成时间戳、各表行数明细统计及数据库 SHA-256 校验和；
   - `data/` 与 `media/`: 平台全部运行时离线数据与附件。
3. **安全自愈与回滚防线**：
   在执行任何远端或本地备份恢复之前：
   - 强制将当前主库备份至 `logs/db_rollback_pre_restore_*.db`；
   - 调用 `PRAGMA integrity_check` 执行完整性预检；
   - 关闭 Django 连接池并清理残留 `-wal` 和 `-shm`；
   - 自动补全数据库迁移 (`call_command('migrate')`)，恢复后智能延续网盘凭据。
4. **轻量 Cron 调度线程**：
   基于纯 Python 标准库解析 `minute, hour, day, month, weekday` 五位 Cron 表达式，由 `CoreConfig.ready()` 仅在服务运行时激活后台守护线程，避免测试及迁移命令时误触发。

### 10.48.3 实施与验证结果
- 全量快照生成经测试成功打包系统全部 37 张数据表（2067+ 条真实数据记录）及系统基础配置，SHA-256 与 `manifest.json` 校验通过；
- 容灾恢复链路全格式覆盖：彻底修复纯 `.db` 数据库文件因 `config_snapshot_data` 作用域未前置引发的 `UnboundLocalError: 500` 缺陷，实现 `.zip` 全量快照与 `.db` 纯数据库快照 100% 幂等恢复；
- 优化了管理员 WebDAV 应用授权码与 AES-256 预设密码回显交互，支持点击眼睛图标随时核验明文；
- 前端管理后台 `AdminBackupPage.tsx` 与各子卡片已由 Vite 5.4 编译通过并同步至生产环境；
- Django 系统环境运行正常，HTTP 200 与全量 API 自动化验证通过。


---

## 10.49 ADR 10.49：全员登录会话无操作超时引擎重构与模式 A（覆盖全平台所有登录账号）落地决策 (v1.87)

### 10.49.1 决策背景与核心痛点
在原有系统实现中，「管理员无操作超时」配置保存后长期未生效，且原有策略仅对 `is_staff=True` 的特权账号过滤生效。经深度代码排查，根本诱因包括：
1. **全局 Axios 拦截器与后台静默轮询相互踩踏**：Axios 请求拦截器在每次 HTTP 请求时均执行 `localStorage.setItem("mengya_last_active", Date.now())`，而 `RequireAuth.tsx` 每隔 60 秒触发 `fetchMe()` 静默同步权限，导致空闲累计时间（`idleMs`）永远被重置在 60 秒内，风控阈值无法达到；
2. **页面可见性恢复时冲刷空闲记录**：切回窗口时先触发数据拉取，导致超时状态被冲刷覆盖；
3. **策略覆盖面有限**：原逻辑排除了普通用户，缺乏对全体登录账号的会话空闲治理能力。

### 10.49.2 核心架构与模式 A 落地
1. **人机物理交互专职维护**：从全局 Axios 拦截器中彻底移除无操作时间戳写入，空闲计时 100% 由 DOM 物理事件（鼠标点击/移动、键盘输入、触摸滚动）节流写入；
2. **优先熔断短路**：在路由跳转、窗口聚焦与定时轮询时，优先执行 `checkIdleTimeout()` 判定；一旦超时立即中止后续请求并执行 `logout()` 跳转 `/login?timeout=1`；
3. **模式 A 全员覆盖**：移除 `!user.is_staff` 过滤分支，全平台所有已登录账号统一享受会话无操作超时风控保护；
4. **多 Tab 跨窗口状态协同**：接入 `StorageEvent` 监听，其他标签页的操作可实时刷新当前标签页空闲状态。

5. **现场阻断式全屏超时模态提示（Session Timeout Modal）与交互前置防线**：
   - 传统静默退出容易因路由重叠丢失 `?timeout=1` 参数且缺乏现场反馈。重构后，达到阈值时由 `RequireAuth` 顶层直接拦截并渲染高优先级居中模态框（`z-[999999]`），锁定全屏并清晰告知用户已连续超时 X 分钟；
   - 在键鼠事件处理器中增加防线：检测到已超时的操作一律短路拦截，杜绝切屏点击时刷新时间戳的竞态漏洞；
   - 登录页增加 `sessionStorage` 双重读取，确保登出后 100% 呈现橙色超时安全警告卡片。

### 10.49.3 实施与验证结果
- 修复后经实测，无操作计时精准累加，达到阈值后准时安全登出并弹出友好超时提示；
- 前端静态工程经 Vite 5.4 编译通过并无缝托管至 Django；
- 两套工程服务均健康运行，API 与全端链路测试通过。

## 10.50 ADR 10.50：知识库管理中心五模块统一治理与 CSV 导入韧性体系落地决策 (v1.88 ~ v1.88.2)

### 10.50.1 决策背景与核心痛点
在 v1.87 之前，系统五大知识模块（孕期时间轴、胎教故事、孕产食谱、育儿百科、待产包预置）仅有种子预置数据，管理员无法在系统界面内进行增删改与批量维护，运营能力缺失。知识库管理中心（v1.88）上线后，CSV 批量导入链路暴露两处致命缺陷：
1. **表头映射落空**：导入逻辑在归一化表头后查询中文键字典全部落空，导致任何合法模板文件导入恒为 0 条（共修复 5 处映射逻辑）；
2. **GBK 编码双读空流**：首次 `read()` 已消耗文件流、二次 `read()` 得到空流，导致 GBK 编码样例文件永远报「无法识别的编码」。
此外，权限模型粒度不足以覆盖新增管理模块（需要 74 键 15 组扩容），管理页全表加载在数据量增长后性能持续恶化。

### 10.50.2 核心架构与治理方案
1. **视图层分离**：独立 `apps/core/views_knowledge_admin.py` 承载知识库管理 CRUD 与导入导出，与用户端展示业务视图（`views.py`）彻底解耦；
2. **种子服务独立**：新增 `apps/core/services/knowledge_seed_service.py` 支撑五大模块「恢复出厂预置」，与 `init_data` 全量初始化命令解耦，支持单模块精准重置；
3. **统一响应契约 `_kb_import_result`**：导入结果统一返回成功条数、失败条数、按文件**真实物理行号**精确定位的逐行错误明细，并同步写入审计日志；
4. **前端明细弹窗**：新增 `CsvImportResultModal` 组件，支持 result（成功摘要）与 error（错误明细，常驻展示需手动「知道了」关闭）双模式；
5. **服务端分页治理**：知识库管理各模块与商品管理页全部接入服务端分页（默认每页 10 条），分页接口支持 `page_size=-1` 全量语义；
6. **74 键 15 组权限体系**：`PermissionTreeCard` 分组渲染组件 + 权限分组独立保存机制（基线配置 + 各分组乐观独立提交，杜绝任意分组改动连带提交其他分组的缺陷）。

### 10.50.3 实施与验证结果
- 用户 GBK 样例文件成功导入，多行字段（如「鲈鱼/大火蒸」）解析正确；坏行按真实物理行号报错（如「第 3 行缺少标题」）；审计 6 条落库；API 校验 59/59 全部通过；
- 权限分组独立保存严格验证：两组各改一个开关只保存第一组，重载后第二组未提交，联动缺陷根除；
- 前端静态工程经 Vite 5.4 编译通过并无缝托管至 Django，服务健康运行。

## 10.51 ADR 10.51：全局收藏状态中心化 Store 与列表页性能治理落地决策 (v1.88.4)

### 10.51.1 决策背景与核心痛点
1. **N+1 请求风暴**：每张列表卡片独立发起一次收藏状态查询，时间轴页实测产生 204 个请求、胎教故事页 245 个，页面加载被海量小请求拖慢；
2. **收藏状态割裂**：列表卡片与详情弹窗各自维护收藏状态，详情页取消收藏后列表卡片状态不刷新，用户反馈「列表与详情不同步」；
3. **全量重拉闪白**：任意增删改操作触发整页数据全量重拉，列表无分页治理，长列表页面体验差。

### 10.51.2 核心架构与治理方案
1. **全局收藏 Store（zustand）**：新增 `frontend/src/store/favoriteStore.ts`，核心数据结构 `maps`（类型 → 已收藏对象 ID 集合），配合 `loaded`/`loading`/`failed` 三态实现并发去重与失败重试；点击收藏执行**乐观更新**（先本地切换再调 API，失败自动回滚）；账号切换与登出时 `reset()` 清空全部类型缓存，杜绝数据串号；
2. **后端类型级接口**：新增 `GET /api/favorites/map/`，一次请求返回该类型全部已收藏 ID 集合，将 N+1 请求收敛为每类型 1 个（204 → 1）；
3. **全端统一接入**：时间轴、胎教故事、孕期周历、孕产食谱、育儿百科、商品三页（首页/列表/详情）与收藏中心统一读取同一份 store，任一处切换收藏全局即时同步；
4. **分页体系**：分页接口支持 `page_size=-1` 全量语义；新增 `LightPagination` 轻量分页组件；时间轴页提供 12/24/48/全部、胎教故事全部列表提供 24/48/96/全部每页条数选择，选择记忆至 `localStorage`；
5. **切换体验治理**：切换筛选条件时保留旧内容、仅顶部渲染 `TopProgressBar` 进度条渐变加载，消除整页闪白；收藏中心删除走乐观移除、编辑走静默刷新。

### 10.51.3 实施与验证结果
- 实测收藏状态请求由 204 个收敛为 1 个；列表 ↔ 详情收藏状态双向同步验证通过；商品页与收藏中心联动验证通过；分页切换与每页条数记忆验证通过；账号切换缓存清理验证通过；
- 前端静态工程经 Vite 5.4 编译通过并无缝托管至 Django。

## 10.52 ADR 10.52：4030 权限拒绝提示结构化与全端 UX 规范统一落地决策 (v1.88.5)

### 10.52.1 决策背景与核心痛点
1. **「4030」数字编码直出**：普通用户触发权限拦截时，界面仅显示「4030」三字，完全无法理解。根因：DRF 将 dict 结构的 `detail` 直接展开为 `response.data`（不再有 `detail` 包裹层），`custom_exception_handler` 走入未覆盖的 elif 分支，`message=str(第一个键值)` 将数字编码字符串原样透传；
2. **40 处权限文案碎片化**：全平台 40 处权限校验点提示文案句式不统一，部分权限类（如 `KbWritePermission`）直接抛出英文默认语；
3. **提示形态不足**：前端仅有 alert 级弹窗提示，缺乏整页阻断式提示卡；路由守卫提示未携带具体页面名，用户不知道哪个页面被关闭。

### 10.52.2 核心架构与治理方案
1. **异常处理器解包修复**：`apps/core/utils/exceptions.py` 正确识别 dict 结构 `detail` 中的 `message`/`code` 键并解包，`code` 显式 `int` 数字化（`code=4030`），杜绝字符串透传；
2. **40 处权限文案统一**：全平台 40 处权限校验点提示词统一为「您暂无「XX」权限，请联系管理员开启」标准句式，`KbWritePermission` 英文默认语改为中文显式抛出；
3. **两层防线体系**：
   - **第一道（前端路由守卫）**：`PermissionGuard` 整页阻断提示卡，17 个路由全部携带具体页名，文案「管理员已关闭「XX」页面访问」；
   - **第二道（API 兜底）**：新增 `PermissionDeniedCard` 组件接入时间轴、胎教故事、孕期周历、孕产食谱、育儿百科 5 个展示页，覆盖管理员中途修改权限的运行时场景；
4. **排版规范化**：胎教故事按周分组视图统一单列竖排，任意天数（1 篇或 2 篇）卡片等宽规整，消除一行 1 个/2 个混排的参差感。

### 10.52.3 实施与验证结果
- 普通用户三场景实测全部通过：路由守卫整页提示卡、核心收藏操作 alert 可读文案（「您暂无添加收藏的权限，请联系管理员开启」）、管理员中途关权限的 API 兜底卡；
- 全部测试数据精确还原（测试账号密码/权限/会话、真实用户权限与收藏记录），服务健康运行，前端经 Vite 5.4 编译通过。

## 10.53 ADR 10.53：权限模板快照固化与自动同步根除决策 (v1.88.6)

### 10.53.1 决策背景与核心痛点
1. **模板实时套用扩散缺陷**：`get_user_permissions()` 每次运行时都将全局默认权限模板（`SystemSetting.default_user_permissions`）叠加进权限解析，导致管理员修改模板保存的瞬间，所有未固化个性化快照（`custom_permissions` 为空）的用户权限立即全量变化，出现「所有用户的权限全部变更为一样」的问题；
2. **「重置为系统默认」语义反转**：原重置实现直接清空 `custom_permissions`，本意是"恢复默认"，实际效果是让该用户进入永久实时跟随模板的状态——被重置的用户越多，下次修改模板的波及面越大，形成恶性循环；
3. **注册初始权限错位**：新注册用户的初始快照由「代码基线 + 宝宝阶段」固化，从不吸收全局模板内容，与模板「新用户默认底色」的产品语义不符。

### 10.53.2 核心架构与治理方案
1. **快照固化模式**：新增 `build_initial_permissions()` 统一构建「代码基线 + 最新全局模板 + 宝宝阶段自适应」初始权限快照，作为模板的唯一读取入口；`get_user_permissions()` 彻底移除模板实时覆盖段——模板仅在**新用户注册**与**管理员点击「重置为系统默认」**两个时机固化落库，此后修改模板不对任何已有用户生效；
2. **重置按钮重定义**：`AdminPermissionsView` 的 `reset_to_default` 分支由清空快照改为固化「最新模板 + 该用户当前宝宝阶段」，不打 `_admin_customized` 标记（保留后续阶段切换联动资格）；
3. **阶段切换局部联动**：`MeView` 资料更新时，未定制用户仅基于自身现有快照调整 4 个阶段菜单键（时间轴/食谱/胎教故事/幼儿百科），其余权限键原样保留，模板改动不借此渗透；管理员单独定制过的用户完全静态；
4. **存量数据迁移固化**：新增数据迁移 `0035_permission_snapshot`，为所有空快照普通用户固化"当前实际生效权限"（基线 + 模板 + 阶段），确保升级前后权限零感知变化；
5. **`has_custom` 显式下发**：用户列表接口改以 `_admin_customized` 标记返回是否已单独定制，前端列表徽标与弹窗标签不再以"快照是否为空"误判（存量迁移后快照非空 ≠ 已定制）；
6. **前端文案协同**：全局模板 Tab 说明与保存提示明确「仅应用于之后新注册用户，已有用户需在其权限弹窗手动点击重置才更新」；重置确认弹窗强化「用最新模板覆盖该用户现有全部权限、不可撤销」警示文案。

### 10.53.3 实施与验证结果
- API 端到端 19 项全部通过：改模板后存量用户（含注册固化、迁移固化、管理员定制三类快照）权限均不变；重置后最新模板 + 阶段固化覆盖；注册初始权限吸收最新模板且此后不受模板修改影响；
- 阶段切换真实 API 11 项全部通过：孕期 ↔ 已出生切换仅 4 个阶段键正确联动、其余键保留、管理员定制用户完全静态；
- 浏览器端到端验证通过：用户列表标签（系统默认/已定制）、全局模板 Tab 说明、保存提示、重置确认弹窗文案逐项确认；
- 全部测试数据精确还原（模板原值、用户快照、临时测试用户），传统版与 Docker 版源文件、静态产物 MD5 一致。


## 10.54 ADR 10.54：全数据库模式（SQLite / 共享 PG / 独立 PG）WebDAV 容灾备份、跨引擎无缝双向互导、四道防线防崩与一键应急撤销规范 (v1.89)

### 10.54.1 决策背景与核心痛点
1. **多数据库模式支持缺失**：早期的 WebDAV 云端容灾模块采用针对 SQLite 单文件的专用备份逻辑，直接调用 `sqlite3.backup` API 读取文件。当系统切换为共享 PostgreSQL 或独立专属 PostgreSQL 容器模式时，Django `NAME` 为逻辑库名而非磁盘路径，导致手动/定时备份因找不到主库文件直接报错阻断，恢复逻辑也无法将数据导入 PG 实例。
2. **跨模式数据孤岛**：传统部署与迁移场景中，开发者在本地 SQLite 录入测试的基础知识库无法一键导入到线上 PostgreSQL；生产运维在 PostgreSQL 导出的数据也无法在本地 SQLite 离线调试，缺乏中立的通用交换协议。
3. **数据恢复的半截瘫痪隐患**：若恢复中途出现网络中断、损坏文件或约束冲突，数据库往往处于被清空一部分的半截脏库状态；跨库导入 PostgreSQL 后若未同步重置 Sequence 序列，会导致后续新增记录频繁产生主键冲突（duplicate key）异常。
4. **误操作无“后悔药”**：管理员若在界面误恢复了一份错误的历史数据，系统缺乏秒级一键回退撤销的保护机制。

### 10.54.2 核心架构与治理方案
1. **运行时环境自省与导出防呆**：
   - 抽象 `get_current_runtime_db_profile()` 探测引擎，精准判定 `sqlite`、`pg_shared`、`pg_dedicated`；
   - 备份导出强绑定当前活跃主库，杜绝凭空导出未连接数据库导致的崩溃；
   - 升级统一命名契约：`mengya_backup_{timestamp}_{db_mode}_{creator}_{scope}.zip`，文件名一眼可辨来源与范围。
2. **分表拓扑流式中立压缩（低内存、抗 OOM）**：
   - 核心 26 张业务表按照外键拓扑顺序，采用 `qs.iterator(chunk_size=1000)` 配合 `gzip` 独立压缩写入 `database/{table_name}.json.gz`；
   - 内存峰值稳定在 50MB 以内，支持十几万级大表稳定打包，彻底解决单文件大 JSON 导致的内存爆仓；
   - SQLite 模式下额外生成 `database/mengya.db` 物理热镜像，保持双模无缝兼容。
3. **四道防线防崩溃兜底体系**：
   - **第一防线（沙箱预检）**：在隔离 `.temp/` 目录完成 CRC 与 manifest 校验，非法文件直接拦截，主库零触碰；
   - **第二防线（强制热镜像）**：修改主库前自动生成当前库 1:1 热回滚快照副本（`logs/rollback_pre_restore_*.db` 或 `.zip`），生成失败则直接终止；
   - **第三防线（原子事务与管理员防踢）**：导入全程置于数据库事务内，遇错底层自动回滚；若导入的新数据缺少当前操作员账户，系统自动将当前管理员实体无损并入新库，确保管理员恢复后不掉线、权限不丢失；
   - **第四防线（后置引擎序列自愈）**：目标为 PostgreSQL 时自动执行 Sequence 重校（`SELECT setval(...)`），目标为 SQLite 时恢复外键约束并执行 `VACUUM;`。
4. **一键应急撤销恢复（后悔药机制）**：
   - 覆盖前自动生成 `pre_restore_snapshot_latest` 与元数据清单；
   - 管理员后台页面顶部激活醒目安全横幅，若业务上误导入历史数据，可在界面上一键秒级撤销回退至覆盖前状态；
   - 专用接口 `POST /api/admin/backups/rollbacks/revert-latest/`。
5. **前端与全系统联动协同**：
   - 顶部状态栏自适应呈现当前运行模式；
   - 远端快照打上色彩模式 Badge（`[SQLite]`、`[共享PG]`、`[独立PG]`）；
   - 跨模式恢复弹出专属黄色安全转换确认弹窗；
   - 现有 4 个权限码 100% 保持向后兼容。

### 10.54.3 实施与验证结果
- **跨引擎全流程自动化测试通过**：模式自省、新规范命名、分表拓扑流式生成、包内清单结构验证、安全灾备恢复与一键应急撤销 5 大环节测试全部 100% 通过；
- **前端静态产物编译同步完成**：`python tools/build_frontend.py` 编译无 TypeScript 报错，生产静态产物与 Django `templates/` 同步；
- **服务健康与运行状态**：传统单体架构一体化服务（PID: 1340）平稳运行于 `0.0.0.0:5173`，服务探针 HTTP 200 正常响应。

### 10.55 全站页面表单操作无刷新异步化（Fetch/Ajax）与就地响应治理体系 (v1.90)

#### 10.55.1 业务背景与全站交互痛点排查
在母婴平台的日常高频运营与使用过程中，用户和管理员频繁进行“表单数据修改、条目开关启停、清单打勾标记、网络异常重试”等操作。经全栈排查，发现系统存在两类破坏 SPA 单页应用流畅体验的交互缺陷：
1. **硬编码全局刷新（Hard Reload）**：在部分展示与详情页面的异常提示卡片中，重试按钮直接绑定了 `window.location.reload()`，导致浏览器整页卸载并重新请求所有 HTML/JS/CSS 静态产物，产生长达数秒的白屏并丢失所有用户交互上下文；
2. **列表行级操作“全量重拉整表”（Full List Re-fetching）**：在知识库、商品库、关怀贴士、待产包详情中，用户切换某一行开关（如“上架/暂存”、“启用/停用”）或在弹窗中编辑某一条目保存后，旧有实现习惯直接调用 `load()` / `loadData()`。这会触发整个表格的 `loading=true` 骨架屏/加载遮罩闪烁，将页面滚动条重置到顶部，且破坏了当前分页的用户焦点。

#### 10.55.2 核心架构与局部响应式改造规范（Optimistic & In-Place State Update）
为构建真正的 Pure Async SPA 无感体验，系统确立了如下异步化改造规范：

1. **彻底根绝 `window.location.reload()`**：
   - 提取出组件内部独立的 `loadDetail()` / `loadBrands()` / `fetchHomeData()` 异步重拉方法；
   - 错误处理卡片中的重试按钮仅触发数据层的局部重发，页面框架、路由与状态不被销毁。

2. **单条状态开关乐观局部更新机制（Optimistic Local Update）**：
   ```typescript
   // 典型模式：以 ProductAdminPage toggleActive 为例
   const toggleActive = async (p: Product) => {
     const nextActive = !p.is_active;
     // 1. 立即乐观更新当前行状态，UI 零延迟响应
     setProducts((prev) =>
       prev.map((item) => (item.id === p.id ? { ...item, is_active: nextActive } : item))
     );
     try {
       await productApi.update(p.id, { is_active: nextActive });
       showToast(nextActive ? "已上架" : "已暂存");
     } catch (err) {
       // 2. 遇错无损回滚
       setProducts((prev) =>
         prev.map((item) => (item.id === p.id ? { ...item, is_active: p.is_active } : item))
       );
       showToast(err instanceof Error ? err.message : "操作失败");
     }
   };
   ```

3. **行级编辑与保存就地精准同步（In-Place State Sync）**：
   - 当用户在弹窗/抽屉中编辑现有记录并保存成功时，直接获取服务端返回的最新对象（或利用提交的 Payload），通过 `setItems((prev) => prev.map((it) => it.id === editingId ? { ...it, ...updated } : it))` 同步；
   - 彻底废除编辑保存后的全表 `load()`，消灭了滚动条抖动与骨架屏闪屏；仅在“新增条目”或“批量删除”等改变总行数与分页拓扑的场景下按需触发分页重算。

#### 10.55.3 实施与验证结果
- **全站覆盖率 100%**：涵盖 `HomePage`、`BrandListPage`、`BrandDetailPage`、`TimelineDetailPage`、`ProductAdminPage`、`KnowledgeAdminPage`、`DailyTipsManagePage`、`ShoppingListDetailPage` 等全部可优化模块；
- **全链路构建通过**：执行 `python tools/build_frontend.py`，Vite 5 打包与产物同步零报错；
- **单体服务平稳运行**：`run.ps1 restart` 重启后服务探针 HTTP 200，端口 5173 监听稳定。

### 10.56 首页宝宝档案编辑持久化联动与健康中心 BMI 批量导入身高顺推治理 (v1.91)

#### 10.56.1 业务背景与交互缺陷复盘
1. **首页宝宝档案编辑保存反馈缺失与回显丢失**：用户在首页全景关怀卡片点击修改宝宝状态，输入或修改宝宝名称保存后，退出重新打开时输入框回显为空白，造成未保存的误解，且保存时缺少 Toast 成功提示；底层逻辑重复触发新建而非更新现有默认档案；
2. **BMI 批量导入无身高放行与后续打卡割裂**：用户首次导入妈妈 BMI 时，CSV 模板缺少身高列导致身高为 None，无法真实计算 BMI；且批量导入多行记录未实现如同手动录入般的身高自动顺推继承，导致导入后手动打卡依然提示未录入身高。

#### 10.56.2 架构治理与协同方案
1. **`SetStageModal` 全流程闭环**：
   - 弹窗打开时通过 `authApi.babies()` 检索 `is_primary` 宝宝并自动回显名称与性别；
   - 保存时区分 `updateBaby(existingBabyId, ...)` 与 `createBaby(...)`，不再吞错；
   - 成功后触发全局明确 Toast（`showToast("阶段与宝宝档案已保存成功")`）与 `stageChanged` 事件。
2. **BMI 导入模板规范与行间顺推机制（Forward-fill）**：
   - 在 CSV 列规格与模板下载中规范「身高」列；
   - 后端 `batch_import` 实现 `running_height` 行间顺推：首行填入身高后后续行自动继承并持久化写库；
   - 增加首次导入无身高的 4005 防呆拦截；
   - 数据入库后，`latestMomHeight` 能自动捕获顺推身高，手动录入弹窗实现 100% 自动预填。

#### 10.56.3 实施与验证结果
- **自动化测试通过**：针对 4005 首次缺失身高拦截、首行填入身高顺推至后续行、BMI 计算及入库持久化编写单元自动化测试，100% 验证通过；
- **前端静态产物构建**：`python tools/build_frontend.py` 零错误编译，并同步模板与静态资源；
- **服务健康与运行状态**：传统单体架构服务平稳重启，服务探针 HTTP 200 验证通过。

### 10.57 全局导入字段规格显式分类、BMI 真实身高双向继承与提示语去歧义优化 (v1.92)

#### 10.57.1 业务背景与治理目标
1. **提示语表述去歧义**：首页保存宝宝档案信息时，旧提示「阶段与宝宝档案已保存成功」容易让用户产生误解，需精简为明确的「宝宝档案已保存成功」；
2. **导入模板字段属性不直观**：批量导入界面未醒目展示当前数据表名，且必填列与选填列缺乏明确的分组区分；
3. **BMI 医学计算严谨性保障**：BMI 的唯一科学计算公式依赖真实身高，严禁默认推算。在首次导入且历史无身高的场景下，必须校验至少有一行提供了有效身高，并将其自动顺推应用至全批次记录以支撑后续手动录入。

#### 10.57.2 核心架构与落地实现
1. **字段规格显式分类与规范表名（`CsvImportModal`）**：
   - 卡片顶层明确标记表名（如 `【表名：妈妈体重与 BMI 历史导入表】`）；
   - 字段规范表默认展开呈现，字段划分为 🔴 必填项 与 ⚪ 选填项 两大区域；
   - 下载的 CSV 模板表头带 `*`，附带 `# 字段规范说明` 前导注释行；
2. **首次导入真实身高硬拦截与双向继承**：
   - 历史无身高且 CSV 无任何身高时，前端预检报警并禁用按钮，后端 `code: 4005` 彻底拦截；
   - 提取首个有效身高作为基准，对整批记录执行双向顺推（Forward & Back Fill），并持久化写库。

#### 10.57.3 实施与验证结果
- **自动化测试套件通过**：拦截校验、首行身高顺推与回填、历史身高自动继承 3 大场景单元测试 100% 通过；
- **前端静态产物构建**：`python tools/build_frontend.py` 零错误编译，并同步模板与静态资源；
- **单体服务稳定运行**：传统单体架构服务平稳重启，服务探针 HTTP 200 验证通过。

### 10.58 母婴健康打卡全能互通模板矩阵与中英双语对等架构 (v1.93)

#### 10.58.1 业务背景与治理痛点
1. **BMI 与血压血糖字段孤岛问题**：此前 `mom_bmi` 模板与 `mom_vitals` 模板割裂，用户在 BMI 入口下载模板时缺少血压、血糖、脉搏等字段，反之亦然，无法实现一次性全量健康打卡；
2. **中英双语模板字段非对等**：英文模板与中文模板在部分字段命名及 `# 规范说明行` 上的必填说明不完全对称；
3. **跨模块打卡统一要求**：无论用户从体重/BMI 入口还是血压血糖入口上传，底层均映射至 `HealthRecord`（`prenatal_exam`），应支持全量 12 字段对等解析与互通继承。

#### 10.58.2 核心架构设计与落地
1. **12 维对等健康打卡字段全集**：
   - `日期*`, `身高(cm)*`, `体重(kg)*`, `收缩压(mmHg)`, `舒张压(mmHg)`, `脉搏(次/分)`, `血糖(mmol/L)`, `测定场景`, `腹围(cm)`, `阶段`, `孕周`, `备注`；
   - 英文对等：`date*`, `height*`, `weight*`, `systolic`, `diastolic`, `pulse`, `blood_sugar`, `glucose_type`, `waist`, `stage`, `week`, `note`；
2. **差异化核心必填与互通选填强调**：
   - **`mom_bmi` 模板**：突出 `日期*`、`体重*`（必填）、`身高*`（首导无历史时至少一行必填），将血压血糖等作为“全能体征互通选填项”；
   - **`mom_vitals` 模板**：突出 `日期*`（必填）、`收缩压*`+`舒张压*` 或 `血糖*`（核心项），将身高、体重作为“全能 BMI 互通选填项”（填体重且具备身高时自动计算 BMI）；
   - **`baby` 模板**：突出 `日期*`（必填）、`身长*`、`体重*`、`头围*`（核心项·三者至少填一项）、`备注`（选填）；
3. **前端与后端无缝对等兼容**：
   - `CsvImportModal` 表头精准映射器增强（优先精确匹配，再长词匹配，避免 `glucose_type` 被 `glucose` 误吞）；
   - 后端 `batch_import` 增强：只要导入含体重数据且用户此前从未录入过身高，必须校验至少有一行提供了有效身高，彻底杜绝默认假定身高。

#### 10.58.3 实施与验证结果
- **前端编译与同步**：`python tools/build_frontend.py` 编译通过，静态资源无缝更新；
- **服务健康验证**：服务重启后状态正常，PID: 30816 端口 5173 监听就绪，主站 HTTP 200。


### 10.59 Nginx 反向代理前置模式自由切换与自定义监听端口架构治理 (v1.94 / ADR 10.55)

#### 10.59.1 背景与痛点
1. **外部端口与监听地址强耦合**：此前反向代理配置生成逻辑中，外部端口固定写入 `listen $EXTERNAL_PORT ssl;`，无法自由指定绑定的 IP 地址；
2. **IPv6 双栈网络下端口冲突隐患**：在 Linux 系统中，IPv6 套接字 `[::]` 在内核默认 `bindv6only=0` 时会抢占 IPv4 通配流量；此前同时生成 `listen $EXTERNAL_PORT ssl;` 与 `listen [::]:$EXTERNAL_PORT ssl;`，易触发 `98: Address already in use` 启动报错；且在系统关闭 IPv6 时直接报协议不支持错误；
3. **前置代理安全隔离诉求**：当服务器上层已部署全局网关（如宿主机主 Nginx、1Panel、宝塔、Caddy 或云厂商 CDN/WAF）时，系统 Nginx 代理仅需监听本地回环接口（`127.0.0.1:3443`），无需向公网全网卡暴露端口，可大幅收敛攻击面。

#### 10.59.2 核心架构设计与决策
1. **监听地址与端口解耦解绑（双模自由切换）**：
   - 将单一端口抽象解耦为「监听绑定 IP (`NGINX_BIND_IP`)」与「对外监听端口 (`EXTERNAL_PORT` / `PORT`)」；
   - **前置代理模式 (Local Proxy)**：设置 `NGINX_BIND_IP="127.0.0.1"` 时，渲染生成 `listen 127.0.0.1:<PORT> ssl;`，仅绑定本地 Loopback 回环网卡，公网完全隐藏；
   - **标准公网暴露模式 (Public Exposed)**：设置 `NGINX_BIND_IP=""` 或 `0.0.0.0` 时，渲染生成稳妥的 `listen <PORT> ssl;`，彻底杜绝操作系统 IPv6 双栈引起的端口占用冲突与缺网卡启动崩溃；
2. **命令行多参数全解析与运维闭环**：
   - `run.sh` 脚本命令行新增参数解析：支持 `--local` / `--front-proxy`（一键设定为 127.0.0.1 前置代理）、`--public`（一键设定为公网暴露）、`--nginx-port <端口>` / `--external-port <端口>`（自定义监听端口，如 3443、8443）、`--bind-ip <IP>`（自定义特定网卡）；
   - 支持三层优先级覆盖（命令行参数 > `.env` 文件 > 内置默认值）；支持与 `add_nginx`、`--force-update-nginx`、`--cron` 等子命令完全联动，免重启后端服务即可热重载 Nginx 反代配置；
3. **运行状态提示智能识别**：
   - `bin/env.sh` 的 `print_access_urls()` 输出函数自动探测当前模式：若为前置代理，在访问地址后附加友好提示说明（`(前置代理模式: 仅监听 127.0.0.1:<PORT>，请经由上层前置网关访问)`），防止运维人员误判；
4. **传统版与 Docker 版同构同步**：
   - 传统版与 Docker 版两套脚本架构同步升级，行为 100% 对齐。

#### 10.59.3 验证结果
- **语法校验**：传统版与 Docker 版全部脚本通过 `bash -n` 语法校验；
- **渲染验证**：沙盒环境中公网模式准确生成 `listen 3443 ssl;`，前置代理模式准确生成 `listen 127.0.0.1:3443 ssl;`，差分感知（Diff 校验）与热重载平滑顺畅。

---

## 10.60 弹性日期正则自适应与纯数据首行表头误判防御 (v1.95)

#### 10.60.1 缺陷现象与根因定位
1. **单数字月份/日期格式报错**：用户输入如 `2026-8-30`、`2026-7-29` 等合法日常日期时，系统误报 `3 行日期格式异常（标准格式：YYYY-MM-DD）`；
2. **根因一（严格双位匹配）**：旧正则表达式为严格的 `^\d{4}-\d{2}-\d{2}$`，月份 `8` 或 `7` 为单数字（`\d{1}`），导致正则断言失败；
3. **根因二（首行表头误判雪崩）**：当用户粘贴未带表头的纯数据行时，判定表头的逻辑为 `!/^\d{4}-\d{2}-\d{2}/.test(firstLineCols[0])`。由于首行 `2026-8-30` 判定为不是标准双位日期，再加上后续单元格匹配到了阶段/场景关键字，系统误将首行真实数据当成了「表头」，进而导致行数偏移与解析异常。

#### 10.60.2 优化与防御方案
1. **智能日期补零自愈函数（`normalizeDate`）**：
   - 支持 `YYYY-M-D`、`YYYY-MM-DD`、`YYYY/M/D`、`YYYY.M.D` 等多种常见日期格式；
   - 提取年月日并对月份和日期自动 `padStart(2, "0")`，自愈为标准的 `YYYY-MM-DD`（如 `2026-8-30` ➔ `2026-08-30`）；
2. **弹性类日期断言（`isDateLike`）**：
   - 表头判定时采用 `isDateLike`，凡以 `YYYY[-/.]M[-/.]D` 开头的首行均明确识别为纯数据行，彻底防止首行真实数据被误吞为表头；
3. **后端（`apps/core/views.py`）防御加固**：
   - 采用正则与多模式安全解析，全面兼容单数字月份/日期的导入。

#### 10.60.3 验证结果
- 前端生产编译 `build_frontend.py` 成功；
- 服务重启平稳，PID: 65468 端口 5173，HTTP 200。

### 10.61 全站 CSV 导入/导出/模板列级对齐与全模块字段规范矩阵重构 (v1.96)

#### 10.61.1 缺陷背景与痛点
1. **Excel/WPS 打开模板空白无列注释**：此前模板第二行将整行说明合并放入 `writer.writerow(["# 必填列：..."])` 单元素数组中，导致 Excel/WPS 打开后除第 1 列塞满文本外，第 2 列至末尾列完全空白无字段属性提示。
2. **知识库管理弹窗无字段明细对照**：原模板帮助弹窗仅有三行通用文本，未展示字段名称、类型、必填性与枚举取值。
3. **待产包预置库缺少 CSV 支持**：5 大知识库子模块中唯独待产包预置库缺失导入导出与模板下载，导致无法批量维护。

#### 10.61.2 优化与重构方案
1. **全模块模板列级对齐注释规范**：
   - 针对 `Timeline`、`Recipe`、`Encyclopedia`、`Product`、`FetalStory` 及 `BabyShopping`，CSV 模板第 2 行各单元格与第 1 行表头 1:1 严格对齐，每一格均以 `# ` 开头标注 `[必填/选填] + 枚举/规则约束`。
   - 解析层 `_kb_read_csv_rows` 保持首格 `#` 跳过机制，中英文双语模板均无感兼容。
2. **补齐待产包预置库全套 CSV 闭环**：
   - `BabyShoppingItemViewSet` 补齐 `CN_HEADER_MAP`、`export_csv`、`import_template`、`import_csv`，并赋权 `KbWritePermission`。
   - 前端 `babyShoppingApi` 与 `kbModules.tsx` 挂载 `csv` 操作。
3. **交互层字段规范矩阵与中英双模**：
   - 知识库管理中心与好物推荐中心均提供包含必选标签徽章、字段中英文、属性说明与示例的交互弹窗，支持随时一键下载中英文模板。

#### 10.61.3 验证结果
- 全模块 6 大 ViewSet 中英双模单元测试与列数对齐自动化校验 100% 通过（每列第 2 行均以 `#` 开头且列数严格相等）；
- 前端 TypeScript 编译构建零错误，静态产物无损同步，传统版本单进程平滑重启。

### 10.62 健康中心全模块导入与新增时序一致性架构治理 (v1.97)

#### 10.62.1 缺陷背景与根因定位
1. **模板列数错位与数据污染**：
   - `CsvImportModal.tsx` 中预置的 `mom_bmi` 模板第 2 行存在多余逗号（4 个空列误写为 5 个逗号），导致后续血糖值移位至 `glucose_type`、阶段移位至 `stage`（被填入“空腹”）、孕周移位至 `week`（被填入“孕期”），造成转数值失败清空，迫使系统使用默认预产期强行重推。
2. **示例数据时序矛盾**：
   - `mom_vitals` 模板第 4 行在第 3 行孕 22 周后仅隔 7 天即标记为「产后/postpartum」，违背 280 天全孕期医学模型，导致该行入库后污染数据库，后续任何同一周期打卡均被 `StageValidator` 的「同一孕期内不可出现产后」规则永久阻断。
3. **用户自主权被推算引擎剥夺**：
   - 用户选择「保持 CSV 所填阶段直接导入」（`keep_csv`）时，后端无条件调用 `resolve_and_fix_gestational_week`，以激活档案预产期反向计算并强行覆盖用户在 CSV 中填写的真实历史孕周；且导入完成后前端将外部 UI 视图切换至导入阶段，给用户带来“依然被自动转换”的强烈违和感。
4. **弹窗篇幅过长**：
   - 字段规范明细表默认处于展开状态，导致模态框必须大幅滚动，遮挡核心操作区。

#### 10.62.2 架构重构与治理方案
1. **CSV 模板 1:1 精确对其与医学时序校准**：
   - 修复中英文 BMI 模板多逗号问题，确保 12 列数据严格与表头对齐；
   - 修复体征模板第 4 行，将矛盾的产后示例调整为孕 23 周平稳监测，保持时间线单调递增与医学合理。
2. **「保持 CSV 直接导入」的不可侵犯性原则**：
   - 在 `batch_import` 入库逻辑中建立保护分支：当 `stage_mode == "keep_csv"` 且用户提供了 1~44 范围内的有效数值孕周时，绝对保留原值入库；仅在留空时触发智能推算。
   - 用户选择保持 CSV 直接导入时，前端回调不改写当前界面的阶段激活态；
   - 批量导入统一开启 `allow_cross_stage=True`，豁免单行跨阶段历史冲突阻断，将决策权归还用户。
3. **界面默认精简**：
   - 将 `showSpecTable` 默认置为 `false`，字段明细按需展开。

### 10.63 健康中心全生命周期多阶段平滑共存与视图切片架构重构 (v1.98)

#### 10.63.1 业务背景与重构动因
1. **单状态锁定的局限性**：传统母婴健康系统通常假设用户在某一时刻仅处于单一静态状态（如要么是孕妇、要么是宝妈）。然而实际用户生命周期是动态连续演进的，用户往往需要回溯录入过去的备孕非孕期体重、当前孕期产检、以及后续产后恢复体征。
2. **多阶段数据共存时的视角混乱**：此前若用户库中同时存在非孕期、孕期与产后数据，页面图表与明细混淆在一起，或者因顶部宝宝档案状态改变导致历史孕期数据展示不直观。
3. **宝宝成长跨度精细化查看诉求**：宝宝从新生儿到 3 岁以上的生长发育变化剧烈，家长迫切需要针对婴儿期（0~1岁）、幼儿期（1~3岁）、学龄前期（3岁+）进行分阶段比对 WHO 生长百分位曲线。

#### 10.63.2 架构设计与实现策略
1. **妈妈生命周期切片模型 (Maternal Lifecycle Slicing Model)**：
   - 定义阶段域：`StageFilter = "all" | "general" | "pregnancy" | "postpartum"`；
   - 视图自适应机制：
     - `general` 视图：聚焦非孕期/备孕，标准成人 BMI 评估与日常体征（完全脱敏宝宝）；
     - `pregnancy` 视图：聚焦 40 周孕期医学增重引导带（WS/T 801-2022），孕周时序比对；
     - `postpartum` 视图：聚焦产后 12 个月体重体形恢复带与恢复期体征；
     - `all` 视图：全生命周期连续时间轴，各记录佩戴语义化阶段彩色徽章。
   - 打卡表单智能预选：根据当前视图切片自动将快捷打卡模态对齐到对应录入模式。
2. **宝宝成长发育切片模型 (Child Growth Stage Model)**：
   - 定义成长域：`BabyGrowthStage = "all" | "infant" | "toddler" | "preschool"`；
   - 基于实测日历差与记录 `baby_age_days` 计算精准月龄：
     - 婴儿期：$m \le 12$ 个月；
     - 幼儿期：$12 < m \le 36$ 个月；
     - 学龄前：$m > 36$ 个月。
   - WHO 参考曲线与分页表格跟随所选阶段切片瞬时联动。

---

## 10.64 ADR 10.64：健康中心三层层次化控制台与全生命周期动态模板深度对齐 (v1.99)

### 10.64.1 背景与业务痛点
1. **视界割裂与层级不清**：健康页面多个卡片平铺散落，健康档案、生命周期筛选器、指标子导航与录入表单缺乏清晰的归属关系，顶部打卡与导入按钮脱离上下文悬空；
2. **模板阶段歧义**：在“全部阶段”视角下，用户无法明确下载哪种阶段的模板；在特定阶段视图下打卡时，表单仍然提供多余的不相干选项，容易导致录入后数据立即被切片过滤的“视界撕裂”困惑。

### 10.64.2 架构决策与设计规范
1. **三层金字塔层次化控制台架构**：
   - **第一层（档案主体控制台）**：统一承载妈妈档案信息、预产期/孕期标签、多档案切换器，并深度下沉操作区（【导入数据 [阶段定制]】与【健康打卡】），建立“当前档案即时操作”的强心理映射；
   - **第二层（生命周期切片控制器）**：集中呈现 4 阶段分段控制器（全部、非孕期/备孕、全孕期产检、产后恢复期），带实时打卡计数与激活光晕；
   - **第三层（指标二级导航与工作区）**：承接【体重与 BMI】和【血压与血糖】监测分析，向下驱动沉浸式工作区。
2. **多阶段动态定制 CSV 导入模板**：
   - 导入弹窗接收 `activeStage`（`pregnancy` | `postpartum` | `general`）；
   - 在【全部阶段】视角下，系统根据下方打卡模块当前的【阶段类型】动态生成对应模板；
   - 在特定阶段视角下，直接与当前视图切片对齐；
   - 留空行在解析时默认赋予当前激活阶段，弹窗标明定制阶段徽章。
3. **打卡模块阶段选择防呆与收敛**：
   - 特定阶段下表单自动锁定为该阶段，隐藏冗余选项，提示“已与生命周期视图切片同步”（支持一键回全部阶段）；
   - 全部阶段下保留 3 项自由切换，并提示所选阶段决定数据导入模板类型。


## 10.65 ADR 10.65：健康中心全模块数据表格可编辑（Edit）赋能与打卡弹窗回显联动规范 (v2.00)

### 10.65.1 背景与业务痛点
1. **历史记录修改断层**：健康中心历史表格（宝宝生长测量历史记录表、深度体重/BMI历史明细表、血压与血糖体征明细表）长期仅支持“勾选与批量/单条删除”，缺乏编辑修改入口；
2. **打卡回显复用诉求**：用户若发现某日体重、身高、血压或血糖数据录入笔误，必须先彻底删除再重新在顶部或底部表单完整录入，不仅操作繁琐，还容易导致关联字段丢失。

### 10.65.2 架构决策与设计规范
1. **全模块表格操作列编辑规范**：
   - 历史明细表格在操作列统一配置「编辑」按钮（采用 `Edit3` 语义化图标），严格基于 `health_record_update` 权限展示；
   - 触发时向外派发事件，将当前时序/主记录实体作为参数传递。
2. **多层组件事件透传与聚焦联动体系**：
   - `BmiHistoryTable` ➔ `BmiAnalysisView` ➔ `HealthPage`；
   - `VitalsHistoryTable` ➔ `VitalsAnalysisView` ➔ `HealthPage`；
   - 顶层页面通过 `openCheckIn(recordDate, mode, babyId, existingRecord, focusModule)` 唤起打卡弹窗；
   - 智能识别记录阶段类型（孕期/非孕期）并传入 `focusModule`（如 `bmi` 或 `vitals`），弹窗自动展开并滚动聚焦对应录入面板，实现完整数据回显与无感更新保存。


## 10.66 ADR 10.66：健康中心全模块表格展示完备度治理、打卡排版水平对齐与覆盖视口自动定位规范 (v2.01)

### 10.66.1 背景与业务痛点
1. **表格编辑与展示断层**：妈妈孕产档案「测量打卡历史数据表」因参数透传遗漏导致编辑按钮未渲染；宝宝生长测量表未展示测量时关键的“月龄/日龄”及“备注备忘”字段，卡片抬头直接硬编码拼接数量括号影响美观；
2. **打卡交互排版错位与视口丢失**：身长、体重、头围在网格中的包装容器不一致导致头围输入框与其他不在同一水平线上；用户在长弹窗底部保存触发覆盖冲突时，提示框在最顶端且页面无自动滚动，造成交互断层。

### 10.66.2 架构决策与设计规范
1. **多层透传与权限完备准则**：
   - 确保 `BmiAnalysisView` ➔ `BmiHistoryTable` 完整透传 `onEditRecord`；
   - 表格操作列与表头均由 `(canDelete || (canEdit && !!onEdit))` 决定，支持单编辑权限用户正常操作。
2. **宝宝成长指标全维度展示规范**：
   - 卡片抬头解耦数量硬编码，以胶囊徽章呈现；
   - 增加「测量月龄」列（自动折算岁/月/天）与「备注备忘」列（带文字溢出截断与 hover title）。
3. **弹窗栅格水平对齐与覆盖视口自愈机制**：
   - 统一 3 列输入框 DOM 结构与 label 最小高度（`min-h-[1.75rem]`）；
   - 弹窗滚动容器接入 Ref，当 `conflict` 变化时执行自动平滑回滚置顶；底部操作区同时集成内联覆盖确认条，双向保障操作便捷性。


## 10.67 ADR 10.67：健康中心全表单水平线物理级对齐与图表统计看板去重聚焦规范 (v2.02)

### 10.67.1 背景与业务痛点
1. **多模式输入框基准线参差**：妈妈打卡模式中，身高、实测体重与腹围因 label 文案长短不一与 DOM 深度不对等，导致输入框在视口中高低错位；
2. **图表页面统计上下重复**：健康时间轴页面顶部已常驻统计卡片，但在切换到图表看板时下方再次平铺同类统计，导致页面过长且信息冗余。

### 10.67.2 架构决策与设计规范
1. **统一输入框网格布局三定律**：
   - 所有横向并排的表单列统一定义为 `flex flex-col justify-between`；
   - 所有列的 label 区域统一定义强制最小高度（`min-h-[1.75rem]` 或 `min-h-[1.5rem]`）与垂直居中，吸收副标签字数波动；
   - 所有的 input 均必须包含一层标准 `div` 包裹，确保物理边距基准线 100% 绝对齐平。
2. **图表视图统计收敛与全量无损统合准则**：
   - 顶部统计卡片在 `viewMode === "charts"` 模式下智能隐去，使图表看板紧凑上浮；
   - 将原有顶部统计的全部维度（总计、最新打卡日期、日均频次、活跃天数/覆盖率、宝宝生长发育、妈妈产检与疫苗针次）完整统合进图表看板的 KPI 体系中，杜绝任何信息项的遗漏。


## 10.68 ADR 10.68：生命体征编辑全链路贯通与记录类型饼图富文本防重叠设计规范 (v2.03)

### 10.68.1 背景与业务痛点
1. **生命体征编辑回调断层**：生命体征明细表编辑按钮因中间层 VitalsAnalysisView 未向下透传 onEditRecord 回调导致点击无响应；
2. **记录类型饼图视觉贫乏与空白过大**：原图表隐藏了扇区外侧标签，只有中心小环，四周大面积死板留白，信息可读性与现代化美感严重不足。

### 10.68.2 架构决策与设计规范
1. **组件层级透传防断裂准则**：
   - 严格在各分析看板视图（VitalsAnalysisView）解构并透传 onEditRecord，确保页面路由层与底层明细表格无缝衔接。
2. **环形饼图双重防重叠与富文本标签体系**：
   - 启用双行富文本外侧标签：第一行分类名称，第二行占比与计数，配合平滑双折线指示线；
   - 引入 avoidLabelOverlap: true 与 labelLayout: { hideOverlap: true, moveOverlap: "shiftY" }，在复杂视口下严格避免文字与扇区重叠；
   - 调整圆环半径至 ['36%', '56%']，留出合理的文字引导缓冲带，兼顾中心统计指示器与四周信息呈现。


## 10.69 ADR 10.69：妈妈测量打卡历史数据表备注备忘列补全与全字段完备展示规范 (v2.04)

### 10.69.1 背景与业务痛点
1. **备注展示层级过深**：测量打卡历史数据表将备注隐匿于“详情”展开卡片内，用户在主表格快速回溯时无法直观看见当时填写的医学建议或备忘；
2. **多模块字段呈现割裂**：宝宝历史表已具备「备注备忘」列，而妈妈体重/BMI 历史表缺少该列，造成三大健康数据子表呈现标准不统一。

### 10.69.2 架构决策与设计规范
1. **主表头备注备忘规范**：
   - 测量打卡历史数据表在达标状态与明细之间新增「备注备忘」列；
   - 单元格设置最大宽度与文本截断样式（max-w-[160px] truncate），并通过原生 title 属性提供无损全文本 hover 查看能力；
   - 联动自愈展开行的 colSpan 计算公式。
2. **三表全字段规范对齐**：
   - 宝宝生长记录表、生命体征明细表、体重/BMI 明细表统一对齐【日期、阶段/月龄、核心测量值、备注备忘、操作】五大黄金列架构。
