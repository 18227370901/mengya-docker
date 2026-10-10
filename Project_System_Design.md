# 萌芽（mengya-docker）系统架构设计与重构决策文档 (PSD)

> **文档代号**：PSD (Project System Design)  
> **文档版本**：v2.2 (Ultra-Low Resource Optimization & Self-Adaptive Host Memory Edition)  
> **文档密级**：企业级核心技术架构设计与重构标准  
> **责任角色**：资深系统架构师 & 代码审计专家 (Senior Solutions Architect)  
> **审计基准**：以最新生产代码与 Docker 编排配置为最高准绳 (Ground Truth)，深度吸收历史调研文档 (Design Intent)  
> **生效工程**：`mengya-docker`（分支：`mengya-docker-optimize`）  
> **落盘位置**：`Project_System_Design.md`

---

## 目录
1. [项目全局概览](#第-1-部分项目全局概览)
2. [文档-代码差异与漂移矩阵 (Drift Matrix)](#第-2-部分文档-代码差异与漂移矩阵-drift-matrix)
3. [架构模式识别与判定依据](#第-3-部分架构模式识别与判定依据)
4. [架构耦合度诊断与代码坏味道剖析](#第-4-部分架构耦合度诊断与代码坏味道剖析)
5. [架构替换与轻量化可行性决策](#第-5-部分架构替换与轻量化可行性决策)
6. [前后端详尽规格（校准整合版）](#第-6-部分前后端详尽规格校准整合版)
7. [数据持久化设计](#第-7-部分数据持久化设计)
8. [工程与安全保障体系](#第-8-部分工程与安全保障体系)
9. [综合问题排查与渐进演进路线图](#第-9-部分综合问题排查与渐进演进路线图)
10. [极致低资源 Docker 容器化性能优化与自适应规格体系](#第-10-部分极致低资源-docker-容器化性能优化与自适应规格体系-v22)

---

## 第 1 部分：项目全局概览

### 1.1 业务定位与核心价值主张
**萌芽（Mengya）** 是面向「备孕 → 孕期 → 0-6 岁育儿」全周期的母婴家庭垂直知识、健康工具与消费决策平台，核心价值主张为**“生命最初 1000 天精准陪伴”**。
- **业务赛道**：母婴垂直领域工具与决策支持平台（非自营电商交易闭环、非纯 UGC 社区）。
- **目标受众**：备孕准父母、孕期准妈妈、0-6 岁新手家庭。
- **关键支撑场景**：孕期周历与知识时间轴、孕期食谱与胎教故事、新生儿护理百科、商品多维雷达对比与选购指南、自适应待产包清单生成、家庭多角色健康打卡、以及基于专业知识库与联网搜索的 AI 母婴顾问。

### 1.2 真实生产技术栈全景清单 (Ground Truth)

系统以**轻量一体化、快速交付、稳定可靠**为演进方向，最新生产环境技术栈基线如下：

| 分层 | 组件 / 库 | 当前基线版本 | 架构作用与配置事实依据 |
| :--- | :--- | :--- | :--- |
| **运行时环境** | Python 3.11-slim | 3.11-slim | 单阶段纯 Python 生产运行容器，前端通过本地预构建（`build_frontend.py`）免除服务端 Node 依赖 (`Dockerfile`) |
| **Web 框架** | Django | 4.2.25 (LTS, `>=4.2,<5.0`) | 核心 Web 引擎，承担请求路由与 ORM 映射 (`requirements.txt:1`) |
| **应用服务器** | Gunicorn | `>=21.2.0` | 生产级 WSGI 容器，1 Worker + 4 Threads (gthread)，循环回收，彻底根除 runserver CPU 轮询空转 (`requirements.txt`, `docker-compose.yml`) |
| **静态托管** | WhiteNoise | `>=6.6.0` | 零拷贝静态文件派发，一体化提供 API 与前端 SPA 静态托管 (`config/settings.py`) |
| **REST 接口** | DRF | 3.15.2 (`>=3.14,<3.16`) | RESTful API 序列化、分页、权限控制与渲染流水线 (`requirements.txt:2`) |
| **认证与鉴权** | SimpleJWT + 自研风控 | 5.3.2 (`>=5.3,<5.6`) | JWT 无状态认证 + JTI 单会话顶号踢出 + 细粒度 RBAC 权限矩阵 (`requirements.txt:3`) |
| **接口契约** | drf-spectacular | 0.28.0 (`>=0.27,<0.29`) | OpenAPI 3.0 / Swagger 文档自动生成 (`requirements.txt:4`) |
| **数据持久化** | PostgreSQL (pgvector) | 18 (Docker: `pgvector:pg18`) | 主数据库，内建向量计算扩展支持；开发模式兼容 SQLite (`docker-compose.yml:24`) |
| **缓存与调度** | Redis + Celery | Redis 7-alpine / Celery 5.3+ | 异步任务与缓存队列，采用 `--profile celery` 按需启动 (`docker-compose.yml:38`) |
| **AI 引擎** | OpenAI SDK + ddgs | OpenAI `>=1.30`, `ddgs>=8.0` | 多大模型兼容接入 + DuckDuckGo 意图联网搜索增强 (`requirements.txt:9,13`) |
| **前端框架** | React + TypeScript | React 18.3.0 / TS 5.4.0 / Vite 5.3.0 | 现代单页应用 (SPA)，极速 HMR 构建 (`frontend/package.json:9,20`) |
| **样式与交互** | Tailwind CSS + Lucide | Tailwind 3.4.0 / Lucide 0.400.0 | 原子化 CSS 样式系统与现代化移动端图标库 (`frontend/package.json:8,19`) |
| **状态管理** | Zustand | 4.5.0 (`zustand^4.5.0`) | 轻量级 Hook 状态容器，维护认证会话与 AI 对话流 (`frontend/package.json:12`) |
| **数据可视化** | ECharts | 5.5.0 (`echarts^5.5.0`) | 儿童生长发育百分位曲线与商品五维雷达图 (`frontend/package.json:7`) |

### 1.3 端到端架构拓扑图

```mermaid
flowchart TB
    subgraph Client["客户端访问层 (Client Layer)"]
        Browser["现代浏览器 (PC / Web / 移动端 H5)"]
    end

    subgraph Host["宿主机网络与网关层 (Host Gateway Layer)"]
        HostNginx["宿主机 Nginx (443 / 80)<br/>• SNI 多域名自适应<br/>• SSL 证书终止与安全头加固"]
    end

    subgraph DockerEnv["容器化一体化编排网格 (Docker Bridge: mengya_default)"]
        subgraph BackendContainer["mengya_docker_backend 容器 (:8000 -> Host:5174)"]
            DjangoEntry["WSGI / Django 核心入口"]
            StaticServe["静态资源/SPA 前端路由托管<br/>(/templates/index.html & /static/)"]
            APIRouter["DRF API 路由网关 (/api/v1/)"]
            
            subgraph MiddlewareStack["中间件与安全守卫流水线"]
                SecMW["Security / SSL Redirect / HSTS"]
                CorsMW["CORS 跨域守卫"]
                SingleSessionMW["SingleSessionAuth (JTI 校验)"]
                RiskMW["防暴力破解 / 冻结检测 / IP 审计"]
            end
            
            subgraph CoreViews["业务视图控制器 (views.py)"]
                AuthViews["认证/注册/密保/风控"]
                UserViews["用户/宝宝档案/权限矩阵"]
                ProductViews["商品/品牌/对比/收藏"]
                HealthViews["健康记录/生长曲线/疫苗"]
                ContentViews["食谱/胎教/百科/待产包"]
                AIViews["AI 会话/配置/一键评测"]
            end

            subgraph ServiceDomain["业务领域服务层 (services/)"]
                AIService["AI 调度引擎 (ai_service.py)"]
                WebSearch["联网检索管道 (web_search.py)"]
                Comparator["商品五维对比引擎 (product_comparator.py)"]
                ListGen["待产包自适应生成 (shopping_list_generator.py)"]
            end
        end

        subgraph StorageLayer["内部数据持久化层 (屏蔽外网端口)"]
            PGDB[("mengya_docker-pg (PostgreSQL 15/18)<br/>数据卷: pgdata:/var/lib/postgresql/data")]
            RedisQueue[("mengya_docker_redis (Redis 7-alpine)<br/>[可选: profile celery]")]
            CeleryWorker["mengya_docker_worker (Celery 5.3+)<br/>[可选: profile celery]"]
        end
    end

    subgraph ExternalCloud["外部第三方服务能力"]
        LLM["大模型提供商 (OpenAI / Claude / DeepSeek / Kimi)"]
        DDG["DuckDuckGo Search Engine"]
        SMS["短信运营商网关 (可拔插)"]
    end

    Browser -->|HTTPS/WSS| HostNginx
    HostNginx -->|反向代理 pass HTTP:5174| DjangoEntry
    DjangoEntry -->|静态页面请求| StaticServe
    DjangoEntry -->|REST 请求| APIRouter
    APIRouter --> MiddlewareStack
    MiddlewareStack --> CoreViews
    CoreViews --> ServiceDomain
    CoreViews -->|Django ORM / SQL| PGDB
    ServiceDomain -->|向量检索 / 元数据| PGDB
    ServiceDomain -->|异步调用 / 任务派发| RedisQueue
    RedisQueue --> CeleryWorker
    AIService -->|LLM API / 流式问答| LLM
    WebSearch -->|网页摘要检索| DDG
    AuthViews -.->|验证码下发| SMS
```

---

## 第 2 部分：文档-代码差异与漂移矩阵 (Drift Matrix)

通过对历史文档 `Project_Survey_Document.md`、`agent.md` 与当前最新代码实现的交叉核对，审计出以下 **7 项关键架构与功能漂移事实**：

| 序号 | 模块 / 业务能力 | 历史文档记载 (Survey/Agent) | 代码真实实现 (Ground Truth) | 状态判定 | 架构影响与风险评估 |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **DR-01** | **数据库迁移演进与 Schema** | 仅记录至 `0018_alter_phone_max_length`；缺失后续字段描述。 | 代码已演化至 `0025_systemsetting_admin_session_timeout_minutes`，包含商品推荐购买链接、系统设置默认权限、找回密码最大尝试次数等。(`apps/core/migrations/0019~0025`) | **已重构演进** | **中**：历史文档未反映最新表字段约束，直接依据旧文档操作会导致模型逆向偏差与数据不一致。 |
| **DR-02** | **视图层规模与胖 Controller** | 记录 `views.py` 约为 2300+ 行。 | `apps/core/views.py` 实际规模已膨胀至 **3,363 行**，承载了 50 个全局函数及 ViewSet 类。 | **严重膨胀** | **高**：业务逻辑未按 DDD 拆分，God File 带来高内聚反面效应，合并代码易发冲突，测试维护成本倍增。 |
| **DR-03** | **单一管理员排他防护与会话强踢** | 仅记载常规 JWT 认证机制。 | 代码实现了多层管理员收敛：启动时 `ensure_admin.py` 清理历史多管理员、`invalidate_tokens.py` 启动作废历史 Token、基于 `active_token_jti` 实施单会话顶号强踢 (`apps/core/utils/single_session_auth.py`)。 | **已加固重构** | **低(正向)**：安全基线显著提高，多管理员演示账号隐患已被彻底封堵。 |
| **DR-04** | **双轨登录风控与熔断锁定策略** | 仅描述错误超限冻结账号。 | 代码实现了管理员与普通用户的精细分流：普通用户超限触发软冻结 (`is_active=False`)；管理员超限不冻结，转入强制冷却倒计时并强制验证码 (`apps/core/views.py:328-354`)。 | **已精细化** | **低(正向)**：防止管理员自身账号被黑客恶意锁死导致全站运维瘫痪。 |
| **DR-05** | **商品中心导购链接与规格清洗** | 描述为纯展示与比价平台，无电商购买路径。 | 增加了 `Product.purchase_links` (JSON 字典字段，支持淘宝/京东/拼多多导购)，并在后台增加规格提取与 AI 评测链路 (`apps/core/models/product.py:38`, `apps/core/migrations/0019`)。 | **已扩展落地** | **中**：由单纯信息展示向商业化导流（Affiliate Marketing）迈进，字段缺乏 JSON Schema 强校验。 |
| **DR-06** | **宝宝档案与未出生状态支持** | 模型假定宝宝均已出生，必须具备准确 birthday。 | 新增 `is_born` 布尔字段，birthday 字段转为“出生日期/预产期”复用，全面支持孕期未出生胎儿建档 (`apps/core/models/baby.py:28`, `apps/core/migrations/0024`)。 | **已修复重构** | **低(正向)**：打通了备孕/孕期与产后育儿的生命周期连续性断点。 |
| **DR-07** | **细粒度权限管控矩阵** | 仅有简单 `is_staff` / `is_superuser` 粗粒度判断。 | 实现了基于字典映射的 27 个细粒度功能/菜单权限矩阵 (`DEFAULT_USER_PERMISSIONS`)，支持管理员对普通用户实施全局或独立覆盖 (`apps/core/utils/permissions.py`)。 | **已成熟落地** | **中**：权限检查分散在 views.py 内部各接口，缺乏统一声明式权限装饰器拦截。 |

---

## 第 3 部分：架构模式识别与判定依据

系统当前遵循 **单体分层架构 (Monolithic Layered Architecture)**，且在容器交付层面采用了 **单容器动静一体化托管模式**。以下为架构判定事实依据：

### 3.1 运行时入口链路
- **单一访问入口**：宿主机 Nginx 将全站流量反向代理至容器端口 `5174`（容器内部 Django 监听 `0.0.0.0:8000`）。
- **统一服务分发**：Django 既负责 `/api/` 路由的 RESTful 接口响应，又通过 `templates/index.html` 与 `/static/` 承担 React 静态 SPA 资源分发。无独立的前端 Node.js SSR 容器或前端专职 Nginx 容器。

### 3.2 路由装配体系
- **单入口聚合**：`config/urls.py` 为全局根路由，以绝对前缀切分流量：
  - `/api/` → 挂载 `apps.core.urls`
  - `/admin/` → 挂载 Django 内建管理后台（备用）
  - `/api/schema/` / `/api/docs/` → drf-spectacular 文档端点
  - `re_path(r"^.*$", TemplateView.as_view(template_name="index.html"))` → 兜底接管前端客户端路由（HTML5 History 模式）。

### 3.3 ORM 与数据库交互范式
- **集中式模型域**：所有 19 个领域模型集中定义在单个 Django App (`apps.core`) 内，跨模块数据关联通过外键直连（如 `ChatMessage.session` 关联 `ChatSession`、`Favorite.product` 关联 `Product`）。
- **进程内直连**：所有业务模块共享同一个 PostgreSQL 连接池，没有网络隔离或服务间 RPC 调用，属于典型的共享数据库单体范式。

### 3.4 通信与异步模式
- **同步为主**：95% 以上的业务（包含 AI 流式问答、 DuckDuckGo 搜索抓取、商品五维计算）均在 HTTP 请求生命周期内**同步阻塞执行**。
- **异步可选**：虽配置了 Celery (`config/celery.py`)，但在 `docker-compose.yml` 中被声明为可选 Profile (`profiles: ["celery"]`)，默认并未启动独立 Worker 容器，体现了单体系统在资源受限场景下的极简运行策略。

---

## 第 4 部分：架构耦合度诊断与代码坏味道剖析

### 4.1 纯业务代码资产（Framework-Agnostic，高复用价值）
项目中存在数个高度纯粹的业务计算模块，其逻辑完全脱离 Django/DRF 框架 API，具备极高的领域沉淀价值与迁移复用性：

1. **商品五维对比与雷达图计算引擎** (`apps/core/services/product_comparator.py:1-131`)：
   - 纯 Python 字典与列表结构运算，输入商品属性，依据安全性、舒适性、功能性、易用性、美观性进行归一化计算，输出雷达图坐标与推荐标签。
2. **待产包智能自适应生成器** (`apps/core/services/shopping_list_generator.py:1-105`)：
   - 基于分娩方式（顺产/剖腹产）与季节（春夏秋冬）的动态清单决策规则，属于典型的无状态策略规则引擎。
3. **母婴生命周期阶段推导引擎** (`apps/core/utils/stage_utils.py:1-123`)：
   - 依据用户预产期或宝宝出生日期，结合 `is_pregnant` 标识，通过纯日期算术精准推导孕周/月龄及对应知识标签。
4. **联网搜索意图正则与清洗管道** (`apps/core/services/web_search.py:1-419`)：
   - 内置母婴高频咨询（用药安全、疫苗接种、突发体征）的正则意图识别，文本切片与清洗逻辑独立。

### 4.2 强侵入代码资产（Framework-Coupled，替换需重构）
1. **视图与控制器层** (`apps/core/views.py`)：3,363 行代码强依赖 `rest_framework.views.APIView`、`rest_framework.viewsets.ModelViewSet`、`rest_framework.response.Response` 以及 `django.http`。
2. **序列化层** (`apps/core/serializers/__init__.py`)：499 行代码深度绑定 `serializers.ModelSerializer`，强耦合 Django ORM 的字段隐式映射机制。
3. **模型与迁移层** (`apps/core/models/*`)：19 个模型文件深度继承 `models.Model`，元数据完全依赖 Django ORM 体系。

### 4.3 分层退化与典型反模式代码片段剖析

#### 坏味道 1：God File 与“胖 Controller”全流程混杂
- **代码位置**：`apps/core/views.py:290-360` (`login` 视图函数，单函数长达 140 余行)
- **事实切片**：
```python
# apps/core/views.py:290-360
def login(request):
    account = request.data.get("phone", "")
    password = request.data.get("password", "")
    sec = _security_setting()
    user = _find_user_by_account(account)
    # 反模式 1：Controller 内部直接修改数据库模型持久化状态
    if user and _is_admin(user) and not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])
    ...
    # 反模式 2：业务风控、等待时间计算、审计日志硬编码在 Controller
    fail_count = user.login_fail_count + 1
    if fail_count >= sec["freeze_threshold"]:
        _register_login_failure(user, fail_count, sec["freeze_threshold"], sec["lock_seconds"])
        audit(request, "login_fail", "登录失败(超限冻结)", "用户", user.username, ...)
        return Response({"code": 1012, "message": "...", "data": ...}, status=403)
```
- **问题诊断**：Controller 既是 HTTP 协议解析器，又是认证服务，又是安全风控机，又是审计上报器，完全违背单一职责原则 (SRP)。

#### 坏味道 2：事务边界缺失与直接 ORM 外露
- **代码位置**：`apps/core/views.py:715-835` (`RegistrationManageView`) 及多处批量处理接口。
- **问题诊断**：在执行多表联动（如删除邀请码同时记录审计日志、更新系统设置同时失效已有会话）时，未声明 `@transaction.atomic`。一旦网络中断或后续逻辑抛错，前置数据库变更无法回滚，直接导致脏数据。

#### 坏味道 3：细粒度权限校验手工平铺
- **代码位置**：`apps/core/views.py:859-930` (`BabyViewSet`)、`views.py:1000+`
- **问题诊断**：权限检查通过在每个 View 方法内部手动调用 `check_user_permission(request.user, 'baby_create')`，导致重复代码大量蔓延，未利用 DRF 的 `permission_classes` 管道形成声明式拦截，容易因人工遗漏产生未授权越权访问漏洞。

---

## 第 5 部分：架构替换与轻量化可行性决策

### 5.1 重构与替换动机分析
1. **当前框架负载真实状况**：
   - 现存数据库业务数据总量在千行级别（实测约 1047 行），用户群体处于种子/演示期。
   - 生产环境采用 1 个 Django 容器即可支撑全站 API + SPA 静态托管，内存占用约 150MB~250MB，CPU 占用低于 5%，**没有任何实际的物理性能或吞吐量瓶颈**。
2. **核心生产力驱动因素**：
   - 当前核心业务高频变更（25 次迁移、37 项功能增强），Django 提供的 **成熟 Schema 迁移体系 (Migrations)、Admin 后台管理、SimpleJWT 认证生态、以及开箱即用的 ORM** 是项目快速迭代的关键保障。
3. **真实痛点所在**：
   - 系统的真正瓶颈在于**“代码工程化质量与组织失序”**（3363 行的单文件 views.py、缺乏单元测试、缺少事务原子性边界），而非框架本身的吞吐能力。

### 5.2 架构演进与替换 ROI 矩阵

| 评估维度 | 方案 A：全面重构换栈 (如迁移至 FastAPI / Go) | 方案 B：维持 Django 架构，推行领域拆分与局部解耦 (推荐) |
| :--- | :--- | :--- |
| **重构代价 (Cost)** | **极高**：需重写 19 个模型的 ORM 映射、重构迁移管理、自研类似 Django Admin/SimpleJWT 的全套基础设施，耗时预计 4~6 人周。 | **低~中**：保留核心依赖，仅做代码物理目录重构与 Service 层剥离，耗时约 3~5 人天。 |
| **业务中断风险** | **极高**：接口契约、错误码体系极易发生意外漂移，前端 29 个页面需全量回归。 | **极低**：保持 API 路径、入参、出参和数据库 Schema 100% 不变，对前端完全透明。 |
| **预期性能收益** | QPS 可能由 500 提升至 3000+，但在当前真实流量下**零实际业务感知**。 | 维持当前 QPS，通过合理加持 Redis 缓存足以应对万级日活。 |
| **代码可维护性** | 获得全新代码库，但若缺乏工程规范仍会迅速劣化。 | 彻底消除 3363 行 God File，业务逻辑下沉，测试覆盖率可快速提升至 80%。 |
| **综合 ROI 评级** | **ROI < 0.2 (严重不划算，过度工程化)** | **ROI > 4.5 (高价值、高确定性交付)** |

### 5.3 模块可替换性资产分级表

| 资产等级 | 对应模块范围 | 框架耦合度 | 替换重构策略 |
| :---: | :--- | :---: | :--- |
| **Level 1 (业务核心)** | `services/product_comparator.py`<br>`services/shopping_list_generator.py`<br>`utils/stage_utils.py` | **极低 (纯 Python)** | **完全保留并保护**：作为核心领域资产直接复用，沉淀为独立的 Domain Services。 |
| **Level 2 (集成服务)** | `services/ai_service.py`<br>`services/web_search.py` | **低 (仅依赖 SDK)** | **接口标准化**：抽象为独立的 Provider 适配器模式，与上层 Web 框架解耦。 |
| **Level 3 (持久化与安全)** | `models/*`<br>`utils/permissions.py`<br>`utils/single_session_auth.py` | **中 (依赖 Django)** | **保持现状，补充约束**：维持 Django ORM，引入统一事务边界与声明式权限注解。 |
| **Level 4 (接入层控制)** | `views.py` (3363 行 God File) | **高 (强耦合 DRF)** | **坚决重构拆解**：必须按业务域（Auth, User, Product, AI, Health）拆分为独立的 View 目录。 |

### 5.4 架构师裁决结论

$$\Large \textbf{明确结论：【不建议替换框架，推行“局部领域服务化解耦与 God View 拆解”的渐进式治理】}

---

## 第 6 部分：前后端详尽规格（校准整合版）

### 6.1 前端架构规格与通信流转

前端基于 **React 18 + TypeScript 5.4 + Vite 5.3** 构建现代单页应用 (SPA)，全面落地移动端优先 (Mobile-First) 与自适应响应式布局。

```
frontend/src/
├── api/            # 通信层：client.ts (统一 Axios 拦截), auth.ts, catalog.ts, compare.ts, services.ts
├── store/          # 状态层：Zustand 原子化管理 (authStore.ts, chatStore.ts, themeStore.ts)
├── pages/          # 视图层：29 个独立业务与管理页面
├── components/     # 组件层：雷达图、生长曲线、疫苗日历、健康日历、复制按钮、权限守卫
├── layouts/        # 布局层：MainLayout (含移动端底部固定导航与桌面端侧边栏)
└── types/          # 契约层：全站 TS 实体接口定义 (index.ts)
```

#### 1. 路由与双层权限守卫流水线 (`frontend/src/App.tsx:6-55`)
- **公共路由**：`/login`、`/register` 开放访问。
- **页面级功能守卫 (`PermissionGuard`)**：
  - 基于当前登录态 `useAuthStore` 中的 `hasPermission(permKey)` 动态判断。
  - 管理员 (`is_staff: true`) 自动穿透拥有全部权限。
  - 普通用户受控于系统配置与个人覆盖字典（若受限则拦截并渲染友好的权限受限卡片）。
- **管理后台守卫 (`AdminGuard`)**：
  - 拦截 `/admin/*` 路由（包括 `/admin/registration`, `/admin/products`, `/admin/users`, `/admin/audit-logs`），非管理员强制重定向至 `/`。

#### 2. 通信协议与响应解包拦截器 (`frontend/src/api/client.ts:8-48`)
- **请求拦截**：从 `localStorage` 读取 `mengya_access` Token，注入 `Authorization: Bearer <token>`；同步刷新 `mengya_last_active` 时间戳以支撑前端闲置监测。
- **响应统一解包**：对返回体进行 `code === 0` 判定，若业务异常 (`code !== 0`) 自动转化为包含业务错误码与上下文的 Promise 拒绝。
- **单会话强踢熔断**：捕获 `401` 且 `code === 1003`（账号在其他设备登录）时，主动清空本地凭证，重定向至 `/login?kicked=1` 唤起全屏强踢提示。

---

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

系统遵循经典分层架构，运行时请求链路经过严密的安全守卫：

```mermaid
sequenceDiagram
    autonumber
    actor Client as 前端 SPA / 客户端
    participant Nginx as 宿主机 Nginx 网关
    participant DjangoWSGI as Django / WSGI
    participant SecurityMW as 安全与跨域中间件
    participant AuthEngine as SingleSessionAuth (JTI)
    participant ViewLayer as 视图层 (views.py)
    participant ServiceLayer as 领域服务 (services/)
    participant DB as PostgreSQL (pgvector)
    participant ThirdParty as 外部 AI / 搜索服务

    Client->>Nginx: HTTPS REST 请求 (带 Bearer Token)
    Nginx->>DjangoWSGI: 反向代理至 5174 (容器 8000)
    DjangoWSGI->>SecurityMW: SecurityMiddleware & CorsMiddleware
    SecurityMW->>AuthEngine: 解析 Header，验证 JWT 签名与有效期
    AuthEngine->>DB: 校验 User.active_token_jti (顶号排他校验)
    alt JTI 不匹配
        AuthEngine-->>Client: 401 Unauthorized (code: 1003 强踢响应)
    else JTI 校验通过
        AuthEngine->>ViewLayer: 注入 request.user
        ViewLayer->>ViewLayer: 检查接口级功能权限 (permissions.py)
        ViewLayer->>ServiceLayer: 调用业务编排逻辑
        alt 需要 AI 问答 / 搜索
            ServiceLayer->>DB: 检索孕周知识与历史上下文
            ServiceLayer->>ThirdParty: 请求 DuckDuckGo 搜索与 LLM API
            ThirdParty-->>ServiceLayer: 返回文本流 / 检索摘要
        else 常规业务
            ServiceLayer->>DB: ORM 增删改查
        end
        ServiceLayer-->>ViewLayer: 返回数据实体
        ViewLayer-->>Client: CustomJSONRenderer 包装统一输出 {code: 0, ...}
    end
```

---

### 6.3 核心 API 规范契约（标准精选）

后端全量 API 经由 `CustomJSONRenderer` 统一输出标准契约结构：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

#### 典型高频核心接口契约定义：

| 端点路径与方法 | 鉴权要求 | 核心请求参数 (Payload) | 关键响应出参与行为 | 专属错误码与处理 |
| :--- | :--- | :--- | :--- | :--- |
| **`POST /api/auth/login/`** | 公开访问 | `{"phone": "admin", "password": "...", "captcha": "..."}` | 颁发 `access` (JWT), `refresh`, 以及用户基本信息与权限字典。更新用户 `active_token_jti`。 | `1001` (密码错误)<br>`1002` (账号被冻结)<br>`1012` (密码超限触发冷却/冻结) |
| **`GET /api/users/me/`** | `IsAuthenticated`<br>`SingleSession` | 无入参（基于 Header Token 鉴权） | 返回个人资料、当前宝宝档案、自适应推导阶段 `stage`（孕周或月龄、倒计时天数）。 | `401` (未认证或会话失效) |
| **`POST /api/babies/`** | `IsAuthenticated`<br>`baby_create` | `{"name": "宝宝", "gender": "male", "birthday": "2026-10-01", "is_born": false, "is_primary": true}` | 创建宝宝档案（全面支持未出生状态），自动同步切换为当前默认宝宝。 | `2001` (日期校验失败或未出生状态约束冲突) |
| **`GET /api/products/`** | `IsAuthenticated`<br>`product_view` | Query: `?category=stroller&page=1&page_size=10&q=推车&sort=rating`<br>*(代码实测：搜索参数为 q；支持 sort 排序及 no_page=1 全量)* | 分页返回商品列表、品牌信息、推荐购买渠道链接、五维评分平均值。 | `2001` (分页参数非法) |
| **`POST /api/products/compare/`** | `IsAuthenticated`<br>`product_view` | `{"product_ids": [1, 2, 3]}` | 传入 2~5 个商品 ID，调用 `ProductComparator` 返回归一化并排对比明细、雷达图坐标及推荐标签。 | `2001` (商品数量小于2或大于5) |
| **`POST /api/shopping-lists/generate/`** | `IsAuthenticated`<br>`shopping_list_create` | `{"season": "summer", "delivery_method": "vaginal"}` | 调用 `ShoppingListGenerator`，基于季节与分娩方式自动实例化生成包含母婴必备品的待产清单。 | `2001` (枚举参数不匹配) |
| **`POST /api/ai/chat/`** | `IsAuthenticated`<br>`ai_chat` | Body: `{"session_id": 12, "query": "孕28周胎动频繁正常吗？"}`<br>*(代码实测：请求键名为 query 非 question)* | 注入本周专业知识库 + 自动意图探测联网搜索，流式或一次性返回专业母婴解答（含医疗免责声明）。 | `4000` (触发每分钟限流频率)<br>`403` (未获 AI 授权) |
| **`POST /api/auth/captcha/new/`** | 公开访问 | 无入参 | 生成图形验证码并记录 Session：<br>`{"captcha_id": "...", "image": "data:image/png;base64,..."}` | `500` (图形引擎异常) |
| **`PUT /api/admin/permissions/`** | `IsAdminUser` | Body: `{"user_id": 3, "permissions": {"ai_chat": false, "menu_products": false}}`<br>*(支持 `reset_to_default: true` 一键重置)* | 管理员覆盖指定普通用户的菜单访问控制与 CRUD 细粒度操作权限矩阵。 | `2002` (用户不存在)<br>`2003` (不可禁用系统管理员)<br>`2001` (格式非法) |
| **`GET /api/admin/audit-logs/`** | `IsAdminUser` | Query: `?page=1&page_size=20&action=login&module=用户&q=admin` | 多条件检索审计日志，返回操作人快照、操作类型、客户端 IP 及时间戳。 | `403` (非管理员无权查看) |

---

## 第 7 部分：数据持久化设计

### 7.1 核心实体关系模型 (ER Topology)

系统数据模型划分为 19 个独立领域文件 (`apps/core/models/`)，核心关系拓扑如下：

```mermaid
erDiagram
    User ||--o{ BabyProfile : "拥有多个宝宝(含未出生)"
    User ||--o{ ChatSession : "开启多个 AI 对话"
    User ||--o{ ShoppingList : "创建多份待产包清单"
    User ||--o{ HealthRecord : "记录多条健康打卡"
    User ||--o{ Favorite : "收藏商品"
    User ||--o{ AuditLog : "产生操作审计轨迹"
    
    ChatSession ||--o{ ChatMessage : "包含有序聊天记录"
    ShoppingList ||--o{ ShoppingListItem : "包含清单物品子项(代码实测:ShoppingListItem)"
    BrandProfile ||--o{ Product : "品牌旗下拥有商品"
    Product ||--o{ Favorite : "被多个用户收藏"

    User {
        int id PK
        string username UK "账号(手机号或标识)"
        string nickname "用户昵称"
        string role "角色(admin/user)"
        boolean is_active "是否有效/冻结"
        string active_token_jti "单会话Token指纹"
        int login_fail_count "连续登录失败次数"
        datetime locked_until "临时锁定到期时间"
        json custom_permissions "用户专属细粒度权限"
        json ai_configs "个人大模型APIKey配置"
    }

    BabyProfile {
        int id PK
        int user_id FK "所属用户"
        string name "宝宝昵称"
        string gender "性别(male/female/unknown)"
        date birthday "出生日期/预产期"
        boolean is_born "是否已出生(v1.18新增)"
        boolean is_primary "是否默认宝宝档案(代码实测:is_primary)"
    }

    Product {
        int id PK
        int brand_id FK "所属品牌"
        string name "商品全称"
        string category "商品品类(14大类)"
        string first_category "一级分类(14大类)"
        json price_info "聚合价格区间字典(代码实测:price_info)"
        text image_url "商品主图路径"
        json purchase_links "多平台推荐导购链接(淘宝/京东/拼多多)"
        json ratings "五维评分数值"
        json specifications "规格参数字典(代码实测:specifications)"
    }

    ShoppingList {
        int id PK
        int user_id FK "所属用户"
        string name "清单名称(代码实测:name)"
        string season "适用季节(春夏秋冬)"
        string delivery_method "分娩方式(顺产/剖腹产)"
        boolean is_default "是否默认清单"
    }

    ShoppingListItem {
        int id PK
        int shopping_list_id FK "所属清单(代码实测:shopping_list)"
        string custom_name "物品名称(代码实测:custom_name)"
        int quantity "预备数量"
        string unit "单位"
        string note "选购备注建议"
        boolean is_checked "是否已购备齐(代码实测:is_checked)"
        int sort_order "排序权重"
    }

    ChatSession {
        int id PK
        int user_id FK "所属用户"
        string title "对话主题"
        datetime updated_at "最后发言时间"
    }

    ChatMessage {
        int id PK
        int session_id FK "所属会话"
        string role "角色(user/assistant/system)"
        text content "对话消息正文"
        boolean used_search "是否触发联网搜索(代码实测:used_search，结果实时下发不落库)"
        string used_config_name "所调用的AI配置名称"
        text error_hint "降级错误提示"
    }

    AuditLog {
        int id PK
        int user_id FK "操作人(SET_NULL)"
        string username "操作人账号快照"
        string action "操作类型枚举(50+项)"
        string module "业务模块"
        string target_id "目标数据ID"
        string ip_address "客户端IP"
        datetime created_at "记录时间"
    }

    SystemSetting {
        int id PK
        int login_freeze_threshold "密码错误冻结阈值(默认10次)"
        int login_captcha_threshold "验证码触发阈值(默认3次)"
        int login_lock_seconds "冷却锁定时长(秒)"
        int admin_session_timeout_minutes "管理员无操作超时时长"
        int forgot_password_max_attempts "密保尝试最大次数"
        json default_user_permissions "全站普通用户默认权限矩阵"
    }
```

### 7.2 关键表字段约束与索引架构

1. **联合唯一索引保障**：
   - `BabyProfile`: `unique_together = [("user", "name")]`，防止同一用户下建立同名宝宝档案；通过模型保存钩子确保单用户下 `is_current=True` 的记录唯一。
   - `Favorite`: `unique_together = [("user", "product")]`，从数据库底层彻底杜绝重复收藏引发的计数脏数据。
2. **PostgreSQL 18 向量计算就绪 (pgvector)**：
   - Docker 镜像统一锁定为 `pgvector/pgvector:pg18`，已预装 `vector` 扩展。目前母婴百科与食谱问答主要通过内存关键词正则过滤，后续版本可在数据库层无缝追加 `embedding vector(1536)` 列，实现语义级母婴医学文献混合召回（Hybrid RAG）。
3. **事务边界机制保障**：
   - 全局服务层需对涉及跨表联动（如批量修改权限、删除用户级联数据、生成待产包）显式声明 `@transaction.atomic`，规避网络抖动产生的半提交孤儿记录。

---

## 第 8 部分：工程与安全保障体系

### 8.1 环境变量与配置隔离规范

系统通过根目录 `.env` 实现与源码彻底解耦，并由 `run.sh` 实施配置语法校验与安全自愈：

| 环境变量名 | 默认值 / 推荐格式 | 安全级别 | 作用说明与代码依据 |
| :--- | :--- | :---: | :--- |
| **`FRONTEND_PORT`** | `5174` | 基础配置 | 宿主机对外唯一暴露的单体一体化服务端口，防与传统本地版 5173 冲突。 |
| **`ADMIN_USERNAME`** | `admin` (或手机号) | **极高** | 部署时强制唯一的超级管理员账号，启动时清理历史多余管理员。 |
| **`ADMIN_PASSWORD`** | `[密级字符]` | **极高** | 部署初始化写入，`ensure_admin.py` 自动执行 PBKDF2 安全哈希加盐。 |
| **`DJANGO_SECRET_KEY`** | `change-me-in-production` | **极高** | Django 底层加密密钥，生产部署必须由随机安全字符替换 (`.env.example:2`)。 |
| **`JWT_SECRET_KEY`** | `change-me-in-production` | **极高** | SimpleJWT 签名独立密钥，杜绝与 Django 密钥共享泄露风险 (`.env.example:11`)。 |
| **`DJANGO_ALLOWED_HOSTS`** | `localhost,127.0.0.1,backend,*` | 基础网络 | 允许的 HTTP Host 白名单，支持反代容器内网与 SNI 域名自适应 (`.env.example:4`)。 |
| **`DATABASE_URL`** | `postgresql://mengya_docker:mengya_docker123@db:5432/mengya_docker` | **极高** | 生产环境容器内网直连（`db:5432`），宿主机外网完全屏蔽。 |
| **`REDIS_URL`** | `redis://redis:6379/0` | 内部网络 | Redis 缓存与 Celery Broker 连接地址，容器内网互联 (`.env.example:8`)。 |
| **`OPENAI_API_KEY`** | `sk-...` (或留空) | **机密** | 全局 AI 兜底 Key（留空时自动降级回退至内置本地专业母婴知识引擎）。 |
| **`OPENAI_MODEL`** | `gpt-4o-mini` | 运行时配置 | 默认全局调用的大模型代号，支持灵活替换 (`.env.example:15`)。 |
| **`OPENAI_BASE_URL`** | `https://api.openai.com/v1` | 运行时配置 | 大模型 API 基地址，支持中继网关与第三方大模型提供商直连 (`.env.example:16`)。 |
| **`ENABLE_WORKER`** | `0` | 资源控制 | 为 `1` 时动态附加 `celery` profile，按需唤起 Redis 与 Celery Worker 容器。 |

- **多 SNI 域名语法清洗 (`run.sh#normalize_domains`)**：智能清洗逗号、分号、多空格及引号混配语法，自动去除协议头与多余斜杠并精准去重，确保 Nginx 与 OpenSSL SAN 列表合法性。
- **Nginx 反代配置智能差分比对与静默自愈引擎 (`run.sh#gen_nginx_config`)**：
  - **智能差分比对**：在内存中预计算目标反代配置并与现有磁盘配置比对（自动忽略时间戳注释差异），配置完全一致时静默保留，杜绝冗余快照文件堆积并确保日常启动（`start`/`restart`）零干扰；
  - **参数漂移自动安全自愈**：当检测到前端端口或 SNI 域名变更时，自动备份时间戳快照并同步重写宿主机 Nginx 独立反代配置（`mengya_docker_ssl.conf`），彻底消除端口不一致导致的 502 Bad Gateway 隐患；
  - **免打扰锁定机制**：首行带 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 标记时绝对跳过覆盖，在专属命令（`add_nginx`）下提供交互式覆盖确认，为个性化定制提供多层次防护。
- **SSL 证书目录默认本地化与自愈创建 (`run.sh#NGINX_CERT_DIR`)**：
  - **默认路径本地化**：证书默认路径由宿主机全局目录 `/opt/service/nginx/ssl` 重构为当前项目目录下的 `ssl/`（`$SCRIPT_DIR/ssl`），消除对外部全局目录的强制依赖；
  - **目录缺失静默自愈**：在脚本环境初始化阶段，增加 `[ ! -d "$NGINX_CERT_DIR" ] && mkdir -p "$NGINX_CERT_DIR"` 自愈逻辑，保障生成或读取证书前目录绝对就绪；
  - **兼容性与优先级保障**：全面兼容 `.env` 与环境变量中显式配置的自定义路径，并由 `resolve_abs_path` 自动转为物理绝对路径。

### 8.2 认证、风控与防暴力破解模型

```mermaid
flowchart TD
    Req([用户请求登录]) --> PwdCheck{密码匹配校验}
    
    PwdCheck -- 校验成功 --> ResetFail[清空连续失败计数<br/>清除锁定时间]
    ResetFail --> TerminateOld[置换 active_token_jti<br/>生成全新 Access/Refresh Token]
    TerminateOld --> AuditSucc[记录 login 成功审计] --> RetSuccess([返回 Token 登录成功])
    
    PwdCheck -- 校验失败 --> IncFail[fail_count = fail_count + 1]
    IncFail --> CheckUserType{是否为超级管理员?}
    
    CheckUserType -- 普通用户 --> CheckThreshold{fail_count >= 冻结阈值?}
    CheckThreshold -- 是 --> FreezeUser[user.is_active = False<br/>永久软冻结账号]
    FreezeUser --> AuditFreeze[记录 login_fail 冻结审计] --> RetFrozen([返回 403: 账号已冻结<br/>需管理员手动解冻])
    CheckThreshold -- 否 --> RetFailCommon([返回 401: 账号或密码错误])
    
    CheckUserType -- 超级管理员 --> CheckAdminThres{fail_count >= 冻结阈值?}
    CheckAdminThres -- 是 --> AdminLock[不冻结账号<br/>设定 locked_until = now + 冷却秒数]
    AdminLock --> AuditAdmin[记录 login_fail 冷却审计] --> RetAdminLock([返回 403: 触发风控冷却<br/>强制等待倒计时+强制验证码])
    CheckAdminThres -- 否 --> RetFailAdmin([返回 401: 账号或密码错误])
```

- **防爆破双轨风控机制**：
  - 普通用户错误达阈值（系统模型默认 `login_freeze_threshold=10` 次）立即**软冻结**（密保找回超限默认 `forgot_password_max_attempts=5` 次锁定），必须由管理员后台人工解冻。
  - 管理员账号受系统保护**永不冻结**（防止系统被恶意打到失控），改为**阶梯式熔断冷却**（默认强制等待 300 秒，且必须输入图形验证码），确保运维通道永不阻断。
- **管理员无操作超时注销**：
  - 新增 `admin_session_timeout_minutes`（默认 30 分钟），结合前端心跳与请求拦截器闲置计算，超时强制踢回登录页。

### 8.3 容器流水线与单端口加固 (Zero-Leakage Network)

1. **单阶段精简镜像与本地预构建架构 (v2.2)**：
   - 采用本地一键预构建（`python build_frontend.py`）产出 SPA 单页静态资产，`Dockerfile` 极致精简为单阶段纯 `python:3.11-slim` 镜像；
   - 彻底免除生产服务器安装与运行 Node.js/npm 的开销，构建时间从数分钟缩减至 10 秒以内，零 CPU/内存峰值抖动；
   - 容器移除静态硬编码 `mem_limit`，内存动态自适应宿主机真实物理上限，杜绝 OOM 误杀并与宿主机整体监控完全契合。
2. **网络端口绝对收敛**：
   - `db (5432)`、`redis (6379)` 在 `docker-compose.yml` 中**仅使用 `expose` 暴露于内部网桥，完全移除宿主机端口映射**。
   - 对外仅暴露一个 HTTP 服务端口（`FRONTEND_PORT`，默认 5174），宿主机外部直接由 Nginx 承接 HTTPS/WSS 流量并反代，杜绝数据库端口被公网扫描爆破。
3. **构建层防膨胀机制 (`run.sh v1.25`)**：
   - 自动化集成 `docker image prune -f` 与中间缓存清理，防止频繁迭代构建导致磁盘被悬虚镜像 (dangling images) 打满。
4. **Nginx 网关配置三级安全防线 (`run.sh v1.26`)**：
   - **子命令差异化交互防护**：在显式调用 `add_nginx` 时交互确认是否覆盖旧配置，主启动流程中保持非阻塞执行，兼顾安全与 CI/CD 自动化。
   - **自动安全快照备份**：在覆写配置前自动生成带时间戳快照副本（如 `.conf.bak_YYYYMMDDHHMMSS`），确保手工定制随时可无损回滚。
   - **免打扰标记锁定与全局高亮**：无论配置是否存在，启动时均高亮提示用户；若检测到文件首行包含 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 则永久跳过覆盖，实现自动对齐与高阶运维定制的完美兼容。

---

## 第 9 部分：综合问题排查与渐进演进路线图

### 9.1 五维技术债清单诊断

| 维度 | 严重度 | 现状技术债事实 (Ground Truth) | 诱发风险 | 治理目标与策略 |
| :--- | :---: | :--- | :--- | :--- |
| **1. 代码质量债** | **P0 (极高)** | `apps/core/views.py` 膨胀至 3,363 行；所有 API 控制逻辑堆叠在单文件；单体测试用例为 0。 | 代码合并极易产生逻辑覆盖，改动一处牵连全站，回归成本极高。 | **代码物理拆分**：按业务域拆分为 `views/` 目录；补充核心路径单元测试。 |
| **2. 高并发性能债** | **P1 (中)** | AI 问答与联网搜索均为同步阻塞请求；商品与食谱列表缺少 Redis 缓存。 | 外部搜索或大模型网络抖动将迅速占满 Gunicorn/WSGI 工作线程池，引发 502/504 级联故障。 | 引入 Redis 缓存只读数据；AI 对话全面迁移为 SSE 流式与异步非阻塞模型。 |
| **3. 架构扩展债** | **P1 (中)** | 单一 Django App 承载全部 19 个领域模型，模型间存在直接外键强依赖。 | 领域边界模糊，未来无法独立演进为微服务或分布式子系统。 | 采用领域驱动设计 (DDD) 规范各子域接口，移除底层直接跨域数据连表。 |
| **4. 安全合规债** | **P2 (低)** | 缺乏用户端密码强度复杂度强校验；缺少用户敏感数据 (手机号) 脱敏导出。 | 不符合等级保护 2.0 (DJCP) 及个人信息保护法 (PIPL) 严格合规标准。 | 增加密码正则强度拦截与敏感个人数据展示脱敏（掩码处理）。 |
| **5. 部署运维债** | **P2 (低)** | 依赖 41,000+ 字符的 `run.sh` 脚本维护大量边缘运维状态；缺少 Prometheus 监控指标。 | 维护人员对复杂 Shell 脚本认知负荷过重；生产状态无法可视化感知。 | 将部分复杂的脚本自愈逻辑沉淀为 Django Management Command；暴露标准 `/metrics`。 |

### 9.2 渐进式演进路线图 (P0 / P1 / P2)

本系统严禁进行“休克式”推倒重写，必须推行**原地重构与平滑演进**：

```mermaid
timeline
    title 萌芽平台渐进式重构演进路线图
    section P0 阶段：架构止血与解耦 (1~2周)
        views.py 物理拆解 : 拆分为 auth, user, product, ai, health 等 6 个独立视图模块
        事务边界固化 : 为所有批量与跨表写操作打上 @transaction.atomic 标记
        声明式权限拦截 : 将 manual check 迁移为 DRF 标准 PermissionClasses
    section P1 阶段：性能与异步深化 (2~4周)
        Celery 异步化就绪 : 将审计日志持久化、邮件/短信下发、联网搜索爬取全面迁入异步队列
        Redis 缓存接入 : 针对母婴周历、食谱、百科等高频只读内容实施 Redis TTL 缓存
        AI 流式协议升级 : 引入 Server-Sent Events (SSE) 解决长文本问答连接挂起
    section P2 阶段：领域服务化与合规 (4~8周)
        DDD 领域边界隔离 : 将 core app 重构为 identity, catalog, health, assistant 独立域
        向量检索深化 : 启用 pgvector 建立本地母婴医学知识库向量索引，降低外部依赖
        合规与监控闭环 : 落地 Prometheus 指标导出与个人信息脱敏存储
```

### 9.3 绞杀者模式 (Strangler Pattern) 平滑迁移策略（未来高阶方案）

若未来业务规模化扩展，需将商品中心或 AI 助手等子系统独立演变为高性能微服务（如使用 Go 或 FastAPI 重写），推荐采用**绞杀者模式 (Strangler Pattern)** 进行平滑解耦，严禁一次性推倒：

```mermaid
flowchart LR
    subgraph Client["统一客户端"]
        SPA["React SPA 前端"]
    end

    subgraph Gateway["API 网关路由分流 (Nginx / Kong)"]
        Router{"/api/ 路径分发"}
    end

    subgraph LegacyMonolith["现存 Django 单体系统 (逐步收敛)"]
        DjangoCore["核心业务 (用户/认证/权限/健康)"]
        OldAI["[逐步废弃] 旧版 AI 与商品视图"]
    end

    subgraph NewMicroservice["全新独立微服务集群 (增量绞杀)"]
        FastAPI_AI["AI 助手服务 (FastAPI/Python)<br/>SSE 高并发流式推理"]
        Go_Product["商品与比价中心 (Go/Gin)<br/>高并发 Redis 缓存与搜索"]
    end

    SPA -->|所有 API 请求| Router
    Router -->|/api/ai/* 流量平滑切换| FastAPI_AI
    Router -->|/api/products/* 流量切换| Go_Product
    Router -->|其他常规路由兜底| DjangoCore
```

#### 迁移实施三步法：
1. **第一步（旁路新建与双写核验）**：新业务或重构模块（如 AI 流式模块）以独立轻量容器运行，保留原 Django 接口并做流量对比验证。
2. **第二步（网关动态路由分流）**：在宿主机 Nginx 处配置特定路径转发（如 `location /api/ai/ { proxy_pass http://fastapi_ai; }`），将该域流量无缝切至新服务，前端代码零改动。
3. **第三步（旧逻辑摘除与绞杀完成）**：逐步将 Django 单体内的废弃视图代码移除，单体自然瘦身，最终演进为以领域为边界的现代化微服务协同架构。


---

## 第 10 部分：极致低资源 Docker 容器化性能优化与自适应规格体系 (v2.2)

### 10.1 资源瓶颈根因诊断 (Root Causes Analysis)

在初期 Docker 容器化演进中，系统曾出现空闲时 CPU 持续高占用 (50%+) 以及总常驻内存膨胀至 300MB~400MB+ 的问题。经系统级深度探测与剖析，定位到以下六大根因：

1. **开发服务器 `manage.py runserver` 误入容器生产环境**：
   - 容器启动命令原使用 `python manage.py runserver` 作为服务入口；
   - 该命令默认启动 `StatReloader` 内部监视线程，以毫秒级高频扫描遍历宿主机挂载的全体代码目录，造成严重的 CPU 空转（单核 50%+ 占用）；
   - 同时 `runserver` 会自动派生出两个进程，导致内存双倍冗余常驻。
2. **重型依赖在应用冷启动时急切载入 (Eager Import)**：
   - `apps/core/services/ai_service.py` 在模块顶层静态导入了 `openai` SDK 及其庞大依赖链（包括 `httpx`, `pydantic`, `anyio`, `httpcore`, `sniffio`, `certifi`, `ssl` 等）；
   - 导致应用初始化阶段即被动加载数百个底层模块，急切分配内存高达 **44.6MB**，哪怕用户未调用任何 AI 功能，该内存也永久无法释放。
3. **PostgreSQL 18 默认内存内核配置对轻量级宿主机不匹配**：
   - 官方 PostgreSQL 镜像默认 `shared_buffers` 为 128MB，各类 worker 进程并发参数偏高；
   - 在轻量级云服务器（如 2C2G）或多服务混部机器上，PostgreSQL 单独常驻内存高达 100MB+，造成严重资源倾斜。
4. **开发模式连接调试泄露 (`DJANGO_DEBUG=True`)**：
   - 默认环境变量中开启 `DJANGO_DEBUG`，Django 会在每次数据库查询时将完整 SQL 语句与耗时写入全局 `connection.queries` 列表，长驻运行造成内存单调递增泄露。
5. **多阶段构建在云服务器重复编译的 CPU/内存风暴**：
   - 原 `Dockerfile` 采用 `node:20-alpine` 进行多阶段编译，每台云服务器在 `docker compose build` 时均需全量拉取 Node.js 镜像并执行 `npm install` 与 `npm run build`；
   - 在 1G/2G 小内存服务器上，Vite 编译期间瞬间吃满 100% CPU，甚至因 V8 引擎内存超限直接触发 OOM 宕机（Exit Code 137）。
6. **静态写死 `mem_limit` 导致的 LIMIT 假象与 OOM 误杀**：
   - `docker-compose.yml` 中人为硬编码了 `mem_limit: 100m`；
   - 导致 `docker stats` 显示为 `88.57MiB / 100MiB (88.57%)`，不但与同机其他容器显示宿主机总量（如 `1.922GiB`，显示为 4% 左右）割裂，且极易在短时并发或数据迁移时被 Linux 内核 OOM Killer 误杀。

---

### 10.2 极致轻量化架构重构实测方案 (Architectural Optimizations)

针对上述六大根因，本项目在 `mengya-docker-optimize` 分支实施了系统化、端到端的轻量化工程重构：

```mermaid
flowchart TD
    subgraph HostEnv["宿主机环境 (自适应物理内存，如 1.922GiB)"]
        subgraph DockerCompose["Docker Compose 编排 (无静态硬编码 mem_limit)"]
            
            subgraph BackendContainer["mengya_docker_backend 容器 (常驻 ~60-88MB, CPU 0.00%~0.04%)"]
                Gunicorn["Gunicorn WSGI<br/>1 Worker + 4 gthreads<br/>--max-requests 1000"]
                WhiteNoise["WhiteNoise 6.6+<br/>零拷贝静态资源分发"]
                LazyAI["AI Service 惰性加载<br/>按需引入 openai SDK (-44.6MB)"]
                Allocator["glibc 优化<br/>MALLOC_ARENA_MAX=2<br/>PYTHONOPTIMIZE=1 / gc.freeze()"]
                Gunicorn --> WhiteNoise
                Gunicorn --> LazyAI
                Gunicorn --> Allocator
            end

            subgraph DBContainer["mengya_docker-pg 容器 (常驻 25~35MB)"]
                PG["PostgreSQL (pgvector)<br/>shared_buffers=24MB<br/>work_mem=1MB<br/>max_connections=20"]
            end

            BackendContainer -->|内部网络通信| DBContainer
        end
    end

    subgraph LocalDev["本地开发机 (One-Click Prebuild)"]
        BuildScript["python build_frontend.py<br/>本地编译 Vite 产物"]
        Assets["templates/index.html<br/>static/assets/*"]
        BuildScript --> Assets
    end

    Assets -.->|Git 版本受控同步| DockerCompose
```

#### 10.2.1 生产级 Gunicorn 调度矩阵与多线程模型
- 彻底替换 `runserver`，引入 `gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 1 --threads 4 --worker-class gthread --max-requests 1000 --max-requests-jitter 100 --timeout 60`；
- **1 个主进程 + 4 个轻量线程 (gthread)**：利用 Python 线程处理 I/O 密集型 API 交互，消除多进程内存冗余；
- **循环回收机制**：每处理 1000 次请求后优雅重启 Worker，彻底杜绝长时间运行下的内存碎片滞留；
- **待机 CPU 彻底归零**：系统空闲时 CPU 使用率稳定在 **0.00% ~ 0.04%**。

#### 10.2.2 内存分配器底层收敛与 WhiteNoise 零拷贝静态分发
- **限制 glibc 内存 Arena**：在 `Dockerfile` 中设置环境变量 `ENV MALLOC_ARENA_MAX=2`，将内存池分配受限于 2 个 Arena，阻断 glibc 默认按 CPU 核心数肆意分配堆内存导致的虚高膨胀；
- **字节码编译与垃圾回收冻结**：设置 `PYTHONOPTIMIZE=1` 裁剪断言与文档字符串；在 `config/wsgi.py` 启动完成后调用 `gc.freeze()`，将不可变初始模块推入只读常驻代，大幅减轻 GC 扫描开销；
- **WhiteNoise 动静分离**：引入 `whitenoise>=6.6.0`，由 Python 进程在内核空间直接高效派发 `templates/` 与 `static/` 下的 CSS/JS 前端单页资产，免除独立 Web 容器开销。

#### 10.2.3 AI 引擎惰性按需延迟加载 (Lazy Loading)
- 改造 `apps/core/services/ai_service.py`：移除模块顶部全量 `from openai import OpenAI` 导入；
- 将客户端初始化封装于内部属性方法 `_client()` 中，仅在实际收到 AI 提问请求时才动态执行局部导入与连接实例化；
- 冷启动内存直接减少 **44.6MB**，空闲时绝不消耗额外物理内存。

#### 10.2.4 数据库内核轻量化微调
- 针对 PostgreSQL 18+ 容器，在 `docker-compose.yml` 注入精细化内核参数：
  ```yaml
  command: >
    postgres
    -c shared_buffers=24MB
    -c work_mem=1MB
    -c maintenance_work_mem=16MB
    -c max_connections=20
    -c max_worker_processes=2
    -c max_parallel_workers=2
    -c max_parallel_workers_per_gather=1
    -c max_parallel_maintenance_workers=1
  ```
- 数据库常驻内存由默认的 100MB+ 大幅缩减并恒定在 **25MB ~ 35MB**，完全满足中小并发母婴知识问答与记账事务。

#### 10.2.5 本地 1 键打包与单阶段纯 Python 生产镜像
- **架构解耦策略**：提供跨平台一键脚本 `python build_frontend.py`，由本地开发机执行 `npm run build`，并将构建产物（`templates/index.html` 及 `static/assets/`）纳入 Git 版本受控管理；
- **生产镜像轻量化**：`Dockerfile` 改造为单阶段 `python:3.11-slim` 纯净镜像，容器内彻底剔除 Node.js、npm 及相关构建工具链；
- **云端部署体验**：服务器执行 `git pull` 后直接 `docker compose up -d`，镜像构建耗时从数分钟骤降至 **10 秒以内**，彻底消除了小内存服务器编译 OOM 风险。

#### 10.2.6 宿主机物理内存自适应规格 (Self-Adaptive Host Limit)
- 彻底移除 `docker-compose.yml` 中静态硬编码的 `mem_limit`；
- 容器在未施加静态硬上限时，自动透明继承宿主机物理内存总量（如 2C2G 显示 `1.922GiB`，8G 显示 `7.8GiB`）；
- `docker stats` 呈现真实合理的系统资源占比（~88MB 对应约 4.5% MEM），消除了静态人为限制导致的 OOM 误杀，与服务器同机其他微服务编排风格完全一致。

---

### 10.3 零功能减损与向后兼容性审计守恒 (Zero-Regression Verification)

本次性能调优严格遵循系统工程“**零功能裁剪、零接口漂移、零配置冲突**”的核心铁律：

1. **核心数据模型与 API 契约 100% 守恒**：
   - 保持 19 个业务模型与底层字段约束不变；
   - 保持 50 个 RESTful API 视图的 URL、入参、出参结构及 HTTP 状态码 100% 一致；
   - 保持 27 项细粒度 RBAC 权限代码与 JTI 单会话顶号踢出机制完全生效。
2. **种子业务数据与安全配置无缝初始化**：
   - 971 条母婴脱敏核心知识库（孕育周历、胎教故事、辅食食谱、百科等）随容器启动无缝装入；
   - 自动生成唯一自定义管理员、清退历史硬编码占位账号的机制持续生效。
3. **前端交互与全站双主题无损保留**：
   - 保留 React 18 SPA 路由链路与 Zustand 状态机制；
   - 保留 v1.37 上线的 Dark/Light Mode 昼夜双主题无缝切换与 ECharts 图表自适应；
   - 保留宿主机独立 Nginx SSL（`mengya_docker_ssl.conf` 与 `mengya-docker.local`）单 IP / 443 入口共存机制。

#### 调优前后关键指标全景对比矩阵

| 评估指标 | 优化前基线 (Base) | 优化后实测 (Optimized) | 改善幅度与收益 |
| :--- | :--- | :--- | :--- |
| **空闲 CPU 占用率** | 50.0% ~ 70.0% (持续空转) | **0.00% ~ 0.04%** | **CPU 占用降低 99.9%**，杜绝发热与虚高负载 |
| **Backend 常驻内存** | 220MB ~ 300MB+ | **59MB ~ 88MB** | **内存节省 65%~75%**，冷启动立减 44.6MB |
| **Database 常驻内存** | 90MB ~ 120MB+ | **25MB ~ 35MB** | **内存节省 70%**，内核缓冲精准适配轻量场景 |
| **单机全栈总内存占用** | 350MB ~ 450MB+ | **90MB ~ 125MB** | **轻松满足 1G/2G 入门级云服务器稳定运行** |
| **云端镜像构建耗时** | 3 ~ 8 分钟 (易 OOM 挂死) | **< 10 秒 (免 Node 编译)** | **构建提速 95%+**，云端克隆即可秒级启动 |
| **内存限制兼容性** | 硬编码 100MB (易 OOM 误杀) | **自适应宿主机实际内存 (如 2G)** | **彻底消除 OOM 风险，与系统其他服务无缝对齐** |

---

## 第 10 部分：双版本数据库存储物理隔离规范 (v1.38)

### 10.1 隔离架构设计与现状基线
系统分为容器微服务版（`mengya-docker`）与本地传统部署版（`mengya-local`），为确保双版本在同一服务器或开发机并存时数据不发生交叉污染，架构确立了**数据层 100% 物理硬隔离规范**：

| 维度 | 传统本地模式 (`mengya-local`) | Docker 容器模式 (`mengya-docker`) |
| :--- | :--- | :--- |
| **存储介质与引擎** | **本地独立单文件 SQLite 3** | **PostgreSQL 18 (内置 pgvector)** |
| **物理存储路径** | `mengya-local/db.sqlite3` | Docker 命名存储卷 `pgdata` (`/var/lib/postgresql`) |
| **网络暴露策略** | 仅供宿主机 Python 进程直连本地文件，无网络端口 | 容器内暴露 5432 (`expose`)，**不对宿主机映射端口** |
| **默认加载逻辑** | `USE_POSTGRES` 未显式开启时强制使用 SQLite，忽略上级环境变量 | 严格连接 Compose 内部服务 `db:5432` |

### 10.2 核心安全机制
1. **切断父级目录环境污染**：传统版 `settings.py` 仅加载当前工程内部的 `.env`，杜绝上级公共目录环境变量渗透。
2. **显式开关保护 (`USE_POSTGRES`)**：即便宿主机系统环境中残留了 `DATABASE_URL`，未显式配置 `USE_POSTGRES=True` 时，系统坚决锁定使用本地 `db.sqlite3`。
3. **运维与启动状态自愈可视化**：`run.sh` 与 `run.ps1` 在启动和状态输出中明确标识数据库引擎类型与物理存储路径。


### 10.3 多数据库部署模式自适应架构与交互式向导规范 (v1.40)

针对生产环境中服务器物理内存差异大（从 1G 超低配 VPS 到 16G 宿主机）以及多应用混部共用数据库实例的现实需求，系统在 v1.40 实现了**多数据库部署模式自适应架构与智能运维向导**。

#### 10.3.1 三大多态数据库部署模式
1. **模式 1：SQLite 本地化单文件 (`sqlite`)**
   - **架构设计**：基于 `docker-compose.sqlite.yml`，将宿主机目录 `./data` 映射进 `backend` 容器内，`DATABASE_URL=""`。
   - **资源收益**：**零额外数据库容器**，省去全部 PostgreSQL 进程与内核常驻，整站常驻总内存仅约 **50~60MB**，彻底消除超低配服务器 OOM 风险。
2. **模式 2：共享已有 PostgreSQL 实例 (`shared`)**
   - **架构设计**：复用宿主机已在运行的 PG 容器（如 `pgvector-18`），启动时通过容器内管理接口幂等执行 `CREATE DATABASE mengya_docker` 与 `CREATE USER mengya_docker`。
   - **资源收益**：实现应用与共用基础设施解耦，宿主机无需额外启动 `mengya_docker-pg`，零新增常驻进程，节约 **80MB+** 冗余内存开销。
3. **模式 3：独立专属 PostgreSQL 容器 (`dedicated`)**
   - **架构设计**：基于 `docker-compose.db.yml`，启动命名为 `${APP_NAME:-mengya_docker}-pg` 的独立专属容器，应用 80MB 内核微服务精简调优，容器内部端口隔离（不对宿主机开放 5432）。
   - **镜像策略**：严格就地复用本地已有 PG 镜像，设定 `pull_policy: never`。

#### 10.3.2 严苛的本地镜像就地复用策略与 PG15 默认锁定
为杜绝自动化脚本在生产或受限内网环境中因盲目连网拉取镜像导致部署失败或耗尽带宽，且彻底避免跨服务越界偷取镜像，`run.sh` 设立了四级镜像扫描优先级链：
1. **本地默认 PG15 镜像**：优先检索本地是否存在内置默认镜像 `postgres:15-alpine`；
2. **本地兼容官方 PG15 镜像**：检索本地是否存在 `postgres:15*` 官方镜像；
3. **本地 alpine 轻量镜像**：检索本地是否存在 `postgres:.*alpine` 等轻量镜像；
4. **按需拉取兜底**：本地无兼容镜像时，选用内置默认版本 `postgres:15-alpine` 并通过 Compose 注入 `pull_policy: if_not_present` 精准下载。
只要本地扫描命中任何现存镜像，Compose 自动注入 `pull_policy: never`，严禁发起网络下载。

#### 10.3.3 基于硬件探针的智能推荐引擎
向导启动时自动采集宿主机物理资源，执行多维度智能推荐加权运算：
- **规则 A（共享优先）**：若检测到宿主机已有运行中的 PostgreSQL 容器，推荐权重最高为 **[2] 共享已有 PG 实例**；
- **规则 B（防 OOM 兜底）**：若宿主机物理内存 $\le 1.5\text{GB}$，推荐权重最高为 **[1] SQLite 本地化单文件**；
- **规则 C（独占性能）**：若内存充裕且无共用容器，推荐 **[3] 独立专属 PostgreSQL 容器**；
- **超时兜底防护**：终端输入设定 30 秒倒计时，超时未操作自动采用推荐项，防止部署挂死。

#### 10.3.4 定时任务 / Cron / 重启全静默免交互保护机制
针对自动化运维中常见由于新增交互向导导致定时重启任务（如每日深夜 `./run.sh restart`）阻塞挂起的痛点，系统架构设计了四重免交互安全护栏：
1. **运维子命令白名单自愈**：当命令行传入 `restart`、`stop`、`status`、`logs`、`down` 时，系统 100% 自动跳过任何交互逻辑，静默沿用已有配置；
2. **状态记忆幂等**：首次向导配置成功后自动将 `DB_MODE`、`COMPOSE_FILE` 持久化至 `.env`，后续常规 `start` 自动读取，零重复提示；
3. **非交互环境自愈**：利用 `[ ! -t 0 ]` 探针检测无 TTY 环境（如 Cron、Systemd 守护进程、Jenkins/GitLab CI 流水线），或传入 `-y / --non-interactive` 时，自动静默应用推荐配置并自愈写入 `.env`；
4. **显式重配开关**：运维人员如需变更已配置的数据库模式，支持显式追加 `--reconfig`（例如 `./run.sh start --reconfig`），随时重开交互式决策。


### 10.4 运维管理脚本组件化解耦与 bin/ 目录模块化治理规范 (v1.41)

#### 10.4.1 演化背景与痛点诊断
随着系统引入多数据库多态自适应部署向导、本地镜像严格免下载复用、Nginx SNI SSL 自愈签发与定时任务免交互安全防护等高级特性，原始单体运维脚本 `run.sh` 代码量激增至 1400+ 行，暴露出以下治理问题：
1. **代码膨胀降低可维护性**：日常运维仅需查看核心启停与状态，庞大的辅助逻辑干扰故障排查；
2. **职责耦合**：环境配置持久化、Docker API 拼装、PostgreSQL 交互建库与 Nginx 反代生成交织在一起，不利于单项技术调优；
3. **跨模块共享脆弱**：单一大文件导致函数作用域与依赖关系不直观。

#### 10.4.2 模块化分层架构设计
架构重构将运维体系解耦为“**一个微内核主入口 + 五大垂直领域组件库**”：
- **微内核入口 (`run.sh`)**：仅保留环境安全检测、自愈模块遍历装载守卫、核心生命周期编排 (`start_docker` / `stop_docker` / `restart_docker` / `status_docker`)、统一参数解析与命令分发，代码大幅压缩至清爽直观；
- **`bin/env.sh` (环境与基础设施域)**：负责 `.env` 双向读写同步、物理绝对路径规范化解析、SNI 域名多域列表归一化、宿主机端口冲突预检、Docker 构建层与临时缓存清理；
- **`bin/docker.sh` (容器引擎交互域)**：负责 Docker/Compose 进程探针、Compose 动态多文件拼装 (`-f docker-compose.yml -f ...`)、构建/日志/容器命令代理；
- **`bin/db.sh` (数据与存储引擎域)**：负责宿主机内存与运行中 PG 容器探针、本地镜像优先级扫描与 `pull_policy: never` 锁定、三大数据库模式交互向导、共享 PG 容器内专属库与账号幂等初始化、跨版本逻辑数据备份与恢复；
- **`bin/nginx.sh` (网关与证书安全域)**：负责 OpenSSL SAN 扩展证书签发、Nginx 反代配置写入、带精确时间戳的快照防误触机制、`# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 锁定标记识别；
- **`bin/data.sh` (业务数据域)**：负责容器内全量脱敏样例数据 (971条) 检查与补齐。

#### 10.4.3 模块加载守卫与自愈保障
主入口通过动态加载环路严格实施组件完整性校验：
```bash
for mod in env docker db nginx data; do
    mod_file="$SCRIPT_DIR/bin/${mod}.sh"
    if [ -f "$mod_file" ]; then
        . "$mod_file"
    else
        echo -e "\033[1;31m[错误] 缺失核心组件: bin/${mod}.sh，请检查项目完整性！\033[0m" >&2
        exit 1
    fi
done
```
该设计从根本上规避了部分依赖丢失导致的静默异常，同时 100% 保持了既有功能、命令行参数与自动化运维行为的一致性。

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
为满足各类复杂部署场景下对数据库账号权限、自定义实例、指定端口与远程主机的高级需求，系统在 `run.sh` 与 `bin/db.sh` 中全面支持以下命令行选项与自动持久化配置：
- `--db-user <USER>`: 自定义 PostgreSQL 用户名（默认: `mengya` / `mengya_local`）；
- `--db-pass <PASS>`: 自定义 PostgreSQL 连接密码（默认: `mengya_docker123`）；
- `--db-name <DB>`: 自定义 PostgreSQL 数据库名/实例名（默认: `mengya` / `mengya_local`）；
- `--db-port <PORT>`: 自定义 PostgreSQL 端口（默认: `5432` / `5433`）；
- `--db-host <HOST>`: 自定义 PostgreSQL 主机地址（默认: `db` / 共享容器名 / `127.0.0.1`）；
- `--database-url <URL>`: 直接覆盖指定完整的标准连接串（如 `postgresql://user:pass@host:port/dbname`）。

所有参数均自动幂等写入当前目录 `.env`，并在容器启动或本地启动时组装为标准 `DATABASE_URL` 注入 Django 与 Docker Compose。

### 10.9 run.sh 脚本模块化拆分与自定义变量独立解耦规范 (v1.46)

#### 10.9.1 微内核启动器重构
为解决主运行脚本 `run.sh` 随着功能演进而代码膨胀、逻辑过长及维护成本高的问题，系统将 `run.sh` 全面重构为**轻量级微内核调度器**：
1. **体积与行数极致瘦身**：`run.sh` 脚本由原来的 640+ 行缩减至 130 行左右，只负责环境引导、模块动态遍历载入（`for mod in env config db nginx data docker help; do ...`）以及最终子命令的极简调度分发；
2. **生命周期高内聚下沉**：将 `start_docker()`, `stop_docker()`, `restart_docker()`, `status_docker()`, `clean_docker()` 全部下沉归集至 `bin/docker.sh`，使 `docker.sh` 成为完整的 Docker 生命周期与编排引擎管家；
3. **帮助系统独立收口**：将冗长的帮助说明文档、参数说明与典型启动示例迁移至独立模块 `bin/help.sh`（`show_cli_help()` 函数），彻底净化主脚本结构。

#### 10.9.2 自定义变量与配置解析独立模块 (`bin/config.sh`)
将系统所有自定义变量、参数解析与持久化逻辑独立抽离并封装至 `bin/config.sh`：
- **`init_default_configs()`**：声明并统一初始化端口（`PORT`, `FRONTEND_PORT`）、超级管理员账密（`ADMIN_USERNAME`, `ADMIN_PASSWORD` 等）、SNI 匹配域名、Nginx 路径以及全套数据库连接参数；
- **`parse_cli_args "$@"`**：专职承接所有命令行参数循环解析（包括 `-p`, `-u`, `-P`, `-d`, `-m`, `--db-*`, `--reconfig`, `-y` 等）；
- **`apply_and_save_configs()`**：对用户显式传入的自定义参数进行校验，并自动调用 `update_env_var` 持久化同步写入 `.env` 文件；
- **`export_runtime_vars()`**：统一向后置运行环境导出 Docker Compose 所需的核心环境变量。

### 10.10 数据库全量变量集中归集于 config.sh 治理规范 (v1.47)

#### 10.10.1 治理背景与单点收拢设计
此前数据库相关变量分散在 `bin/config.sh`、`bin/db.sh` 以及 `bin/docker.sh` 等多个脚本中，并在多处存在冗余后备默认值（如 `${POSTGRES_USER:-mengya}`、`${POSTGRES_DB:-mengya}`）。用户若希望一次性自定义修改所有数据库默认配置，需要跨多个文件逐一排查，存在维护心智负担与遗漏风险。

为此，系统在 v1.47 版本确立了**数据库全量变量统一集中归集规范**：
1. **单一事实来源（Single Source of Truth）**：所有与数据库、存储引擎相关的可自定义变量，全部一站式归集至 `bin/config.sh` 的 `init_default_configs()` 与 `export_runtime_vars()` 中声明与导出；
2. **严格三级配置优先级**：
   $$\text{CLI 命令行显式参数 (--db-*, -m, --db-image)} > \text{.env 本地持久化配置} > \text{config.sh 代码级默认定义}$$
3. **消除跨模块硬编码后备**：`bin/db.sh` 与 `bin/docker.sh` 彻底移除多余的 `:-mengya`、`:-5432` 等内联 fallback，统一直接消费 `config.sh` 预先计算并导出的规范变量。

#### 10.10.2 一站式归集变量矩阵清单
在 `mengya-docker/bin/config.sh` 中统一声明并维护的核心数据库变量如下：
- `APP_NAME`：应用命名空间（默认 `mengya_docker`）；
- `DB_MODE`：数据库部署模式（Docker 版默认首次推荐 `shared`，可选 `dedicated` / `sqlite`）；
- `DEFAULT_PG_IMAGE`：内置默认 PG 镜像版本（默认 `postgres:15-alpine`）；
- `DB_IMAGE`：用户指定或探针自适应复用的目标 PG 镜像；
- `DB_PULL_POLICY`：镜像拉取策略（就地复用为 `never`，按需下载为 `if_not_present`）；
- `DB_DATA_DIR`：容器内挂载目录（PG18+ 自动适配为 `/var/lib/postgresql`，PG15 适配为 `/var/lib/postgresql/data`）；
- `DB_CONTAINER_NAME`：独立 PG 模式专属容器名（默认 `${APP_NAME}-pg`）；
- `SHARED_PG_CONTAINER`：共享模式目标 PG 容器名；
- `POSTGRES_USER`：PostgreSQL 用户名（默认 `mengya_docker`）；
- `POSTGRES_PASSWORD`：PostgreSQL 连接密码（默认 `mengya_docker123`）；
- `POSTGRES_DB`：PostgreSQL 数据库/实例名（默认 `mengya_docker`）；
- `POSTGRES_PORT`：PostgreSQL 连接端口（默认 `5432`）；
- `POSTGRES_HOST`：PostgreSQL 访问主机（默认 `db`，共享模式默认为共享容器名）；
- `DATABASE_URL`：标准数据库连接串（支持在此直接显式定义，或留空由系统自动按参数标准组装）；
- `SQLITE_PATH`：SQLite 模式数据持久化路径（默认 `./data/db.sqlite3`）。

### 10.11 容器生命周期与全域 unless-stopped 重启策略规范 (v1.48)

#### 10.11.1 禁用 always 与锁定 unless-stopped 规范
在 Docker 体系中，容器重启策略直接决定了宿主机故障自愈与运维生命周期的可控性：
- **禁用 `always` 策略**：当容器配置为 `always` 时，只要 Docker 守护进程启动或宿主机重启，无论此前容器是被用户显式执行 `./run.sh stop` 还是异常退出，都会被无条件拉起。这会导致被主动下线的容器在机器重启后“幽灵复活”，造成端口冲突与资源盗用；
- **全域采用 `unless-stopped` 策略**：
  $$\text{容器故障/机器崩溃自动重启} \quad \text{且} \quad \text{主动执行 stop 后机器重启保持停止}$$
  在 `docker-compose.yml`（`backend`, `redis`, `worker`）、`docker-compose.db.yml`（`db` 独立数据库容器）以及 `docker-compose.sqlite.yml` 中，全量显式锁定 `restart: unless-stopped`。

### 10.12 Docker 版本与传统版本全维度数据隔离规范 (v1.49)

#### 10.12.1 隔离设计背景与问题根因
当宿主机环境曾部署传统版本（`mengya-local`）且选用 PG 存储模式时，再部署 Docker 容器版可能会因为容器名冲突、内置凭据同名（如 `mengya`）、宿主机已有残留容器未排除、以及数据卷挂载点偏差（挂载至父目录 `/var/lib/postgresql` 而非 `/var/lib/postgresql/data`）导致数据库容器异常退出（`container exited (1)`）。

为此，系统确立了**双版本全链路数据与环境隔离架构**：
1. **容器与应用标识全隔离**：
   - Docker 版统一将 `APP_NAME` 默认置为 `mengya_docker`；
   - 独立专属 PG 容器命名为 `${APP_NAME}-pg`（即 `mengya_docker-pg`，与传统版 `mengya_local-pg` 隔离）；
   - 后端容器与队列容器规范命名为 `mengya_docker_backend`、`mengya_docker_redis`、`mengya_docker_worker`。
2. **数据库凭据与实例深度隔离**：
   - 默认数据库名 / 实例名：`mengya_docker`；
   - 默认数据库连接用户：`mengya_docker`；
   - 默认数据库连接密码：`mengya_docker123`；
   - 完整数据库连接串：`postgresql://mengya_docker:mengya_docker123@db:5432/mengya_docker`。
3. **数据挂载路径自愈与内核参数轻量化稳态**：
   - 规范化挂载路径为 `${DB_DATA_DIR:-/var/lib/postgresql/data}`，消除非标准路径引发的启动崩溃；
   - 裁剪 PG 启动参数，避免多余的并行工作进程约束造成初始化失败。

#### 10.12.2 同机共存 6 种数据库部署组合矩阵与隔离保障机制
系统全面支持在同一台服务器上同时部署传统版本（mengya-local）与 Docker 容器版本（mengya-docker）。针对两版本各自的 3 种数据库模式（SQLite / 独立PG / 共享PG）相互组合而成的 **6 种核心并存场景**，建立了全方位的端口防冲突、数据硬隔离与自适应协同矩阵：

| 组合序号 | 传统版本 (mengya-local) 模式 | Docker版本 (mengya-docker) 模式 | 传统版存储形态与物理路径 | Docker版存储形态与物理路径 | 端口与网络协同 | 数据隔离与防冲突保障机制 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **组合 1** | **SQLite** | **SQLite** | 宿主机文件：mengya-local/db.sqlite3 | 容器挂载目录：mengya-docker/data/db.sqlite3 | 传统版 Web: 5173<br/>Docker Web: 5174 | 两个完全独立的 SQLite 单文件，物理路径彻底隔离，零网络与端口争抢。 |
| **组合 2** | **SQLite** | **独立 PG (dedicated)** | 宿主机文件：mengya-local/db.sqlite3 | 独立容器 mengya_docker-pg，数据卷 mengya_docker_pgdata | Docker 版内部 expose 5432（不绑定宿主机端口） | 传统版本运行在本地 SQLite，Docker 版自建专属 PG 容器，存储介质异构隔离。 |
| **组合 3** | **SQLite** | **共享 PG (shared)** | 宿主机文件：mengya-local/db.sqlite3 | 共享宿主机现有 PG 容器（如 pgvector-18），自建库 mengya_docker | 宿主机现有 PG 端口开放，Docker 后端加入网络直连 | 传统版本使用独立文件，Docker 版在已有共享 PG 实例中拥有专属数据库与账号，互不干扰。 |
| **组合 4** | **独立 PG (dedicated)** | **SQLite** | 宿主机专有容器 mengya_local-pg，数据卷 mengya_local_pgdata | 容器挂载目录：mengya-docker/data/db.sqlite3 | 传统版独占宿主机 5432 端口，Docker 版 SQLite 零端口依赖 | 传统版独占专属 PG 容器，Docker 版完全跑在内嵌 SQLite 文件中，数据与连接完全解耦。 |
| **组合 5** | **独立 PG (dedicated)** | **独立 PG (dedicated)** | 宿主机专有容器 mengya_local-pg（用户 mengya_local，宿主机端口 5432） | Docker 专属容器 mengya_docker-pg（用户 mengya_docker，内部 expose 5432） | 传统版独占宿主机 5432 端口；Docker 版仅在 Compose 内部暴露 5432，**不绑定宿主机端口**，零冲突 | 容器名隔离（mengya_local-pg vs mengya_docker-pg）、数据卷隔离（mengya_local_pgdata vs mengya_docker_pgdata）、账号/库隔离（mengya_local vs mengya_docker），容器与数据双重物理隔离。 |
| **组合 6** | **独立 PG (dedicated)** | **共享 PG (shared)** | 宿主机专有容器 mengya_local-pg（宿主机 5432，数据库 mengya_local） | 复用传统版 mengya_local-pg 容器，但自动创建专有库 mengya_docker 与专有用户 mengya_docker | Docker 启动脚本自动将 mengya_local-pg 接入 Compose 内网（${COMPOSE_PROJECT_NAME}_net） | 数据库级（Database-level）严格隔离。Docker 版启动脚本自动在共享实例中幂等初始化专有库 mengya_docker 并授予独立权限，两套版本数据表互不可见，极大节省内存。 |

*(注：若两版本均选择共享第三方宿主机 PG 容器如 pgvector-18，传统版与 Docker 版各自持有独立数据库 mengya_local 与 mengya_docker 及独立账号，天然具备数据库级完全隔离能力。)*

#### 10.12.3 容器生命周期与 unless-stopped 重启策略规范
- 全线容器服务（ackend、
edis、worker、db）严格统一配置 
estart: unless-stopped；
- 禁止使用 lways 策略，避免运维主动 stop 或排查故障时无休止重启引发死锁与资源耗尽；
- 兼顾突发宕机自愈能力与运维主动控制意图的一致性。

### 10.13 根除静默降级SQLite缺陷、项目级动态data存储与DB就绪等待机制 (v1.51)

#### 10.13.1 故障现象与根本原因深度剖析
在 Docker 版本启动与数据库切换过程中，曾出现报错：
`
File ".../django/db/backends/sqlite3/base.py", line 180, in get_new_connection
    conn = Database.connect(**conn_params)
django.db.utils.OperationalError: unable to open database file
`
经深度链路排查，确定根本原因如下：
1. **静默回退（Silent Degradation）隐患**：原 config/settings.py 内置了 1.5 秒 Socket 连通性探测及静默回退逻辑。当数据库容器尚未完成内部初始化或网络出现瞬态抖动时，Django 探测超时直接静默将数据库后端降级为 SQLite；
2. **共享 PG 模式下主机名解析未对齐**：在 shared 模式下，POSTGRES_HOST 曾默认继承 "db" 而非实际运行中的共享容器名（如 mengya_local-pg），导致在容器内解析主机名失败并触发静默降级；
3. **Docker 卷挂载单文件目录误建陷阱**：在 docker-compose.sqlite.yml 中原挂载 - ./data/db.sqlite3:/app/db.sqlite3，当宿主机本地尚不存在 db.sqlite3 实体文件时，Docker 引擎会自动在宿主机将 data/db.sqlite3 创建为一个**目录**，导致 SQLite 引擎无法以文件方式打开并抛出异常；
4. **路径硬编码缺陷**：不应假设外部存在固定 /app 路径，必须自适应动态获取当前工程根目录并规范管理。

#### 10.13.2 根治改造与架构规范
1. **彻底废除静默降级，确立协议头强类型驱动**：
   - 在 config/settings.py 中彻底移除 1.5 秒 Socket 探测与静默回退逻辑；
   - 凡 DATABASE_URL 以 postgresql:// 或 postgres:// 开头，严格且唯一使用 django.db.backends.postgresql，连接失败立即暴露明确的数据库异常日志，杜绝暗中降级；
2. **前置健康等待探针 (wait_for_db.py)**：
   - 引入独立的 wait_for_db.py 探针脚本，在执行 manage.py migrate 之前探测目标 PostgreSQL 服务端口连通状态（默认最大等待 30 秒）；
   - 平滑渡过 PostgreSQL 容器冷启动与 Docker 内网 DNS 注册的时序抖动，杜绝闪退；
3. **项目级动态 data 目录规范化存储**：
   - 在 config/settings.py 中动态获取当前工程绝对路径（BASE_DIR），自动检测并创建工程根目录下的 data 目录（BASE_DIR / "data"）；
   - SQLite 数据库文件统一指向 BASE_DIR / "data" / "db.sqlite3"；
   - docker-compose.sqlite.yml 调整为目录级映射 - ./data:/app/data，彻底根除 Docker 误建目录陷阱，并同步挂载至 worker 容器保障数据完全一致；
4. **启动脚本自愈与网络环境强化**：
   - 在 in/db.sh 中增加自愈逻辑：若检测到 data/db.sqlite3 被误建为目录，自动执行安全清理与恢复；
   - 完善 in/config.sh 与 in/docker.sh 对 COMPOSE_FILE 变量的统一生命周期管理与导出。


### 10.14 独立专属 PG 默认镜像锁定 (PG15) 与宿主机越界探测解耦自愈规范 (v1.52)

#### 10.14.1 架构缺陷与根因剖析
此前在数据库镜像检测选择逻辑中，存在因跨容器越界探测引发的镜像非预期漂移缺陷：
1. **探针越界偷取镜像**：`bin/db.sh` 中的 `detect_best_pg_image()` 调用 `detect_running_pg_containers`，误将宿主机上其他正在运行的无关 PG 容器（如外部共存实例 `pgvector-18`）镜像偷取作为新创建专属 PG 容器的镜像；
2. **规则权重倒错**：本地镜像扫描逻辑优先匹配了 `^pgvector/pgvector:`，跳过了内置默认的 PG15；
3. **默认镜像优先权被架空**：`DEFAULT_PG_IMAGE="postgres:15-alpine"` 仅在本地没有任何镜像时作为最后兜底；
4. **`.env` 伪自定义持久化锁死**：`choose_db_image()` 无条件调用 `update_env_var "DB_IMAGE" "$DB_IMAGE"`，将探测到的 `pgvector/pgvector:pg18` 写入了 `.env`。后续启动判定 `[ -n "$DB_IMAGE" ]` 为真，误以为是用户显式指定，导致永久锁死在 `pg18`。

#### 10.14.2 治理改造与技术规范
1. **宿主机运行容器探针越界彻底解耦**：移除 `detect_best_pg_image()` 中扫描宿主机其他运行容器的逻辑，独立专属容器镜像与宿主机其他容器完全隔离；
2. **本地镜像优先级阶梯重构**：优先检查本地是否存在内置默认镜像 `postgres:15-alpine`；其次检查兼容官方 PG15 镜像 (`postgres:15*`)；再次检查官方轻量 alpine 镜像 (`postgres:*alpine`)；最后兜底返回 `postgres:15-alpine` 并按需拉取 (`if_not_present`)；
3. **`.env` 伪自定义持久化解耦与历史残留自动纠偏**：默认模式下不向 `.env` 强行写入 `DB_IMAGE`（保持空值以始终跟随系统默认）；仅在用户通过命令行 `--db-image` (`CUSTOM_DB_IMAGE`) 显式传参时才标记为自定义并持久化；若 `.env` 残留历史误判的 `pg18`/`pgvector` 镜像且未显式指定，启动时自动进行配置纠偏清空并重置为内置默认 `postgres:15-alpine`；
4. **专属 PG 容器与存储卷对齐自愈**：在 `check_db_volume_compatibility()` 中，若检测到已有专属容器或存储卷此前使用了 PG18，其数据文件无法被 PG15 加载，自动清理旧容器并重置存储卷 `${APP_NAME:-mengya_docker}_pgdata`，确保全新 PG15 实例顺利初始化；
5. **数据卷挂载点标准化**：统一规范为 `/var/lib/postgresql/data`。


### 10.15 孕育生命周期精准阶段计算、菜单权限阶段自适应识别与管理员定制分层防御体系 (v1.53)

#### 10.15.1 业务背景与历史架构缺陷剖析
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
     * **前端默认值降级穿透**：authStore.ts 中 hasPermission 判定逻辑存在空对象漏洞，当用户 permissions 为空对象或缺少特定 key 时，直接返回 true，导致权限失效；
     * **首页快捷入口与聚合模块鉴权缺失**：HomePage.tsx 中的快捷入口（quickEntries）、推荐商品与高分模块缺乏菜单权限过滤；
     * **权限前端缓存未及时刷新**：缺少路由切换防抖拉取与前台获焦同步，导致后台修改后用户端停留在旧权限快照；
     * **用户切换阶段冲掉管理员配置**：用户在个人中心修改孕育阶段时，系统若直接覆盖权限字典，会导致管理员之前的个性化授权配置被冲掉；
     * **后端缺少 403 严格防线**：相关 ViewSet（食谱、胎教故事、周历等）未对用户自定义菜单权限做服务层拦截。

#### 10.15.2 架构重构与治理方案

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
  * 后端：`apps/core/utils/stage_utils.py`（基于 relativedelta 严谨处理闰年与大小月份）；
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
  * 修复 `authStore.ts`：显式校验权限字典有效性，未配置或未显式为 true 的权限严格判定为 false；
  * `HomePage.tsx` 快捷入口（`quickEntries`）、阶段卡片、推荐卡片均按当前用户权限进行强过滤；
  * 前端路由守卫（`PermissionGuard`）对未授权页面进行 403 路由拦截与友好的无权限提示。
- **近实时轻量权限同步机制**：
  * 在 `RequireAuth.tsx` 布局中部署三维同步探针：
    1. **路由跳转防抖刷新**：页面切换时静默请求 `/api/auth/me/` 获取最新权限快照；
    2. **窗口获焦同步**：用户从后台管理标签页切回前台页面时立即触发焦点刷新；
    3. **15秒定时静默轮询**：后台轮询拉取最新权限，实现秒级响应管理员权限撤销。
- **后端 API 403 严格防线**：
  * 在 `RecipeViewSet`、`FetalStoryViewSet`、`TimelineViewSet` 等关键接口增加视图级权限校验，越权访问直接返回 403 Forbidden，杜绝客户端绕过 UI 抓取接口数据。

### 10.16 健康中心 BMI 动态图表与 SearXNG 双通道改造体系 (v1.54)

#### 10.16.1 业务背景与改造目标
1. **健康中心缺失时序化 BMI 智能闭环**：既有 BMI 录入存在“同步存入成长记录”冗余勾选框且日期锁死当日，缺少按天补录历史数据、全时序趋势通道带、相邻/单周增量 Δkg 变色柱状图与时间跨度筛选；
2. **食谱引擎单一来源**：仅从内部 `Recipe` 库取数，无权威联网检索兜底、无双通道数据源打标（`[平台优选: ID]` / `[外部检索: 来源]`）与孕产期禁忌食材全量扫描；
3. **SearXNG 客户端缺乏显式配置清单与熔断机制**：需固化 `SEARXNG_*` 环境变量、0.5s 极速探针 + 快速熔断（Fast-Fail）毫秒级安全降级，并提供管理员在线配置管理。

#### 10.16.2 架构设计与实现落地
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

### 10.17 统一健康打卡 · 孕周引擎 · AI 实时检索体系 (v1.55)

#### 10.17.1 业务背景与改造目标
1. **页面间数据联动混乱**：`growth_measurement` 被同时用作"产后妈妈打卡"与"宝宝测量"两种语义，导致妈妈身高体重混入宝宝生长曲线、BMI 历史表对非孕期用户错显"产后恢复"，且孕产记录 / 生长曲线 / BMI 分析三页面三种过滤口径互不一致；
2. **孕周无一致性校验**：同月不同孕周的矛盾数据可同时入库（如 2026-05-01 孕 1 周与 2026-06-01 孕 2 周并存），时序趋势与推荐增重通道失真；
3. **录入入口分裂**：产检录入与生长录入两套表单互不相通、切换 Tab 状态残留，非孕期用户（备孕 / 已育）被迫在孕期语义下打卡；
4. **AI 助手无实时检索能力**：已有 SearXNG 客户端仅服务食谱双通道，AI 问答直接走模型知识库，时效性问题（如最新指南 / 政策）无法联网求证，且 `latency_ms` 为假随机数、无检索状态透出。

#### 10.17.2 架构设计与实现落地
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

#### 10.17.3 SearXNG 接入链路诊断增强与配置生效修复 (v1.55.1)
1. **问题定位**：用户反馈 AI 助手"未接入 SearXNG"——实测实例 `http://100.64.0.1:8090` 连通正常（`/healthz` 193ms、JSON 输出已开启），根因为 SearXNG 实例的默认通用引擎全部被上游封禁（brave 限流、duckduckgo/qwant/startpage CAPTCHA、google 静默 0 结果、wikipedia 中文无索引、bing 返回无关结果），检索恒为 0 条；叠加平台侧缺陷——`SEARXNG_ENGINES` 配置项从未在检索链路生效、`search_for_ai` 将"0 结果"与"不可达"混为 `unavailable`、连通性测试 0 条结果仍报"成功"；
2. **修复落地**：
   - `SearXNGClient.search()` engines 参数为空时回退 `SEARXNG_ENGINES` 配置（配置真正生效）；
   - `search_for_ai()` 新增 `searxng_empty` 精确状态（实例可达但 0 结果），兜底分支不覆盖；前端 AI 助手页新增橙色警示徽章；
   - `test_connection()` 两跳诊断（通用探针 + 权威白名单探针）新增 `warning` 状态、`health_count`、`unresponsive_engines` 透出，弹窗橙色展示失效引擎清单与修复指引；
3. **验证结论**：shell 实测 `search_for_ai("新生儿黄疸怎么办？")` → `searxng_empty`；`test_connection()` → `warning` + 失效引擎 `brave/duckduckgo/qwant/startpage`；浏览器实测新消息橙色徽章、弹窗橙色"连通但引擎异常"诊断（757ms + 失效引擎清单）均正常显示。实例侧引擎修复（更换出口 IP / 配置代理 / 启用可用引擎）由 SearXNG 实例管理员在部署机执行。

### 10.18 健康中心信息架构重构与搜索引擎配置体系 (v1.56)

#### 10.18.1 业务背景与改造目标
1. **搜索引擎可用性原则**：SearXNG 不可用时不能影响用户使用，且需明确提示当前搜索引擎——v1.55.1 已确诊用户实例上游引擎全部被 CAPTCHA/限流封禁（检索恒 0 条），默认关闭的公网兜底使 AI 失去实时检索能力；
2. **配置入口分散**：SearXNG 配置弹窗挂在健康中心 BMI 页与 AI 对话页，位置混乱，期望收敛至 AI 助手配置页；
3. **非孕期用户缺位**：打卡/表单仅孕期与产后，备孕与日常体重管理用户无对应阶段；新增记录后列表偶发不显示（根因：浏览器缓存旧前端包）；
4. **看板只认孕期**：WS/T 801-2022 全孕期走势看板对产后/非孕期无参考通道，且缺少标准 BMI 与当前 BMI 的直观展示；
5. **信息架构混乱**：5 个平铺 Tab（孕产记录/生长曲线/体重BMI/疫苗/日历总览）对象归属与关联关系不清。

#### 10.18.2 架构设计与实现落地
1. **搜索引擎三级降级（v1.56 默认开启兜底）**：`AI_SEARCH_FALLBACK_ENABLED=True`（settings/.env/.env.example 三方同步）——SearXNG 无结果/不可达自动回退平台内置公网引擎（Bing 直连），徽章明确显示当前引擎（`公网实时检索（Bing）`）；三层状态 + `searxng_empty` 橙色诊断，AI 回答末尾注明「信息来源：当前搜索引擎」；
2. **配置入口收敛**：`AIConfigPage`（`/settings/ai`）新增「搜索引擎配置」区块（实例地址/连通状态/兜底开关摘要 + 配置面板），BMI 页与 AI 对话页按钮移除；
3. **非孕期（备孕/日常）阶段**：`stage=general` 零迁移复用 `prenatal_exam`——统一打卡新增「我·非孕期/备孕」模式、BMI 表单新增「非孕期/备孕」按钮、序列化器 `stage_type` 增 `general`（自动清空孕周/产后月龄）、医学计算器新增非孕期评估分支（标准 BMI 区间 18.5~23.9）；孕产记录/历史表阶段列显示「非孕期」；后端 `index.html` 强制 no-cache 根治旧前端缓存；
4. **BMI 状态卡 + 非孕期看板**：三卡展示标准 BMI 区间（18.5~23.9）/ 当前测算 BMI（最新打卡实时计算 + 分类）/ 孕前 BMI 基线；时序看板纯非孕期自动切换为「体重走势 + BMI 18.5~23.9 体重参考带 + BMI 21 中位虚线」，孕期维持 WS/T 通道带；
5. **健康中心 4-Tab 重构**：妈妈·孕产档案（明细列表 + BMI 分析全模块）/ 宝宝·生长档案（曲线 + WHO 男童 P50 参考线 + 测量记录表）/ 宝宝·疫苗计划（日历 + 接种状态 + 免疫规划清单 + 下一针建议按月龄）/ 健康时间轴（日历总览 + 任意日期点击补录弹窗预填日期）；页头「健康打卡」四模式为唯一录入入口，保存后联动刷新全部 Tab；
6. **其他优化**：BMI 表单基线连续预填（身高/孕前体重自动带出）；时间轴补录；WHO P50 参考线（`GrowthChart` 按宝宝月龄插值对齐）；疫苗下一针建议（逾期红字提醒）。

#### 10.18.3 验证结论
- 后端 `Django check` 通过；`stage=general` 序列化/评估冒烟通过（BMI 22.58 正常、文案「非孕期体重管理阶段」）；
- 浏览器全链路验证通过：4-Tab 结构、BMI 状态卡（当前 20.7 正常）、BmiFormCard 三阶段按钮、打卡弹窗四模式（无重复）、非孕期打卡归档（toast「已归档」+ 历史表阶段「非孕期」+ 明细徽章）、宝宝 WHO 参考线、疫苗下一针建议（乙肝第1剂·宝宝 32 个月）、时间轴点 15 日弹窗预填 2026-10-15、AI 配置页搜索区块（实例可达 + 兜底已开启）、AI 助手新消息蓝色「公网实时检索（Bing）· 5 条来源」徽章、BMI 页与 AI 页无配置入口、`Cache-Control: no-cache` 生效；验证数据已清理（用户历史记录保留）。

### 10.19 健康数据严谨性 · 列表管理 · 工程瘦身 · 临床赋能 (v1.57)

#### 10.19.1 业务背景与改造目标
1. **数据严谨性缺位**：打卡/BMI 归档/宝宝测量均无同日唯一性校验，同日反复提交产生重复记录污染时序图；打卡日期可任填未来日期；宝宝测量无数值范围提示；
2. **列表管理能力不足**：三处数据列表（妈妈历史表/明细卡片流/宝宝测量表）仅支持逐条删除且无分页，数据增多后页面冗长、批量清理低效；删除确认交互三处不统一（window.confirm / 两段式按钮）；
3. **「收起本次分析结果」按钮体验缺陷**：点击后清空 result——非孕期模式报告区块内容少视觉变化极小，且按钮随 result 消失无法再展开，被用户判定为"无反应"；
4. **权限模块欠账**：`menu_health` 与 CRUD 权限描述仍为旧 5-Tab 语义；BMI 分析接口写库但仅校验菜单级权限，存在越权写入漏洞；
5. **工程三项阶段目标**：主包体积瘦身（echarts/React 全家桶混装 ~1MB）、SearXNG 引擎配置手工输入低效 + 外部食谱卡片食材缺失、临床实用能力（A4 报告导出 / 蓝牙秤/Apple Health 数据导入）缺位。

#### 10.19.2 架构设计与实现落地
1. **同日唯一 + 覆盖更新引擎**：`HealthRecordViewSet.create` 与 `HealthBmiAnalysisView.post` 双链路查重（user + record_type + record_date，`UNIQUE_DATE_TYPES = (prenatal_exam, growth_measurement)`，疫苗豁免）；命中返回 `409 + code 4090 + existing 摘要`，前端确认后携 `overwrite=true` 重发——妈妈链路后端原地更新当日记录并重新生成评估（`record_action=updated`），宝宝链路 `PATCH` 原记录；保留 id 与 created_at 不产生重复数据；
2. **未来日期硬拦截**：`BmiAnalysisInputSerializer` 与 `HealthRecordSerializer` 层校验 record_date ≤ 今天（400 精确提示）+ 前端 date input `max=今天` 双防线；**宝宝数值软提示**（身高 30~140 / 体重 0.5~40 / 头围 25~60 外黄色警示不阻断，满足特殊医学场景）；
3. **列表管理组件化**：新增 `useListPagination` Hook（分页 + 页大小 localStorage 记忆）+ `PaginationBar`（页码省略号导航 + 5/10/20/50 选择器）+ `ConfirmDialog`（红色二次确认弹窗），四处列表接入（含疫苗 Tab 新增「全部接种记录」管理区）；批量删除走后端新接口 `batch-delete`（单事务 + 200 条/次上限 + 仅本人 + 逐条审计）；
4. **报告可逆折叠**：`reportCollapsed` 状态 + 常驻切换按钮（Chevron 图标），收起仅隐藏区块不丢数据，重新分析自动展开；
5. **权限同步与漏洞修复**：`PERMISSION_DEFINITIONS` 五项描述更新 4-Tab 语义（含 CSV 导入/批删能力说明）；BMI 接口补齐 `health_record_view`（GET 时序）与 `health_record_create`（POST 归档）细粒度校验；
6. **工程瘦身**：`manualChunks` 分包（echarts 1MB / react-vendor 190KB / router 22KB / axios 51KB / pdf-tools 593KB 独立），主包 453KB（gzip 116KB）；`BmiTimeSeriesBoard` 重构为 init 一次 + `setOption({notMerge})` 热更新 + ResizeObserver 自适应，容器常驻挂载；
7. **SearXNG 预设与食谱结构化**：配置弹窗三档预设一键填入（国内优选 bing,sogou / 仅 bing / 国际组合）+ ✓ 选中态 + 一键清空；`extract_ingredients_from_text()` 数量型/适量型双正则 + 动词干扰词过滤提取食材用量填充外部推荐卡片；
8. **临床赋能**：`HealthReportExport` A4 报告（四区块 + iframe 打印 + html2canvas/jsPDF 动态加载多页切片下载）；`CsvImportModal` 双对象导入（mom/baby 模板、解析预览+本地预检、冲突策略 skip/overwrite、逐行错误明细、500 条上限、基线继承）。

#### 10.19.3 验证结论
- 后端冒烟 22 项全部通过：正则提取（菠菜100克、鸡蛋2个、牛奶250ml、盐+适量/干扰句排除）、BMI 链路（首次 created → 同日 409 → 覆盖 updated → 未来日期 400）、宝宝链路（首次/409/覆盖）、疫苗同日两剂不查重、批量删除、CSV 导入（新增/跳过/错误行明细）；
- 构建验证：主包 453KB（gzip 116KB），echarts/pdf-tools/react-vendor/router/axios 五独立 chunk，pdf-tools 按需加载；
- 浏览器全链路验证通过：宝宝头围超范围软提示（改正即消失）+ 日期 max 防呆、宝宝/妈妈/深度表单三链路 409 覆盖（含当日已有数据摘要展示）、收起/展开可逆折叠（数据保留）、四处列表勾选/全选本页/批删确认弹窗（涉及清单展示）、分页（默认 5 条/页、9 条数据 5+4 分布、切 10/页、localStorage 记忆）、批量删除精确清理 8 条测试数据（用户原有记录保留）、疫苗全量记录区（同日两剂 + 批删还原）、A4 报告四区块渲染 + PDF 实际下载（萌芽孕产健康评估报告_20261010.pdf）、CSV 导入（解析预览 + skip 策略：新增1/跳过1/失败2 含行级错误原因）、SearXNG 三预设填入/✓高亮/清空、权限矩阵新描述展示、修复版包 console 零 JS 错误；
- 测试期间发现并修复一个真实缺陷：`CsvImportModal` 的 useMemo 位于 `if (!isOpen) return null` 之后导致 React #310 hooks 数量不一致整树崩溃白屏，修复后（hooks 全部前置 + 注释固化规范）复验通过；
- 验证数据全部清理（妈妈/宝宝/疫苗测试记录 12 条 + 冒烟脚本 + 下载 PDF 回收站），用户原有数据（2026-05-08 孕1周打卡、2026-09-10 宝宝测量）完好保留，`.env` 配置未被测试触碰。

### 10.20 孕周锚点自动推算（孕x周x天）与报告区块归属优化 (v1.57.1)

#### 10.20.1 业务背景与改造目标
1. **孕周自动推算断链**：无预产期用户录入过一次孕期数据（如 2026-05-01 孕1周）后，再次打卡选其他日期孕周仍要求手填——后端 `gestation_engine` 双基准推算能力（预产期 280 天模型 > 最早打卡锚点外推）未贯通到前端两条录入链路；
2. **粒度不足**：孕周仅有整周展示，缺少「孕x周x天」天粒度（05-01 孕1周 → 05-02 应显示孕1周1天）；
3. **报告区块归属不清**：「展开/收起分析报告」按钮挂在模块头部（与导出按钮并排），距报告内容区过远，用户无法分辨"分析报告"指哪部分内容。

#### 10.20.2 架构设计与实现落地
1. **锚点自动推算贯通**：新增 `frontend/src/utils/gestation.ts` 共享工具（`computeGestation` 280 天模型/锚点外推、`gestationLabel` 孕X周/孕X周Y天格式、`extractGestationAnchor` 最早孕期打卡锚点——与后端 `first_anchor` 查询口径一致）；打卡弹窗与深度 BMI 表单孕期模式下无预产期但有锚点时孕周随日期自动推算预填（±1 周微调、超偏差后端拦截），完全无基准才手填；日期变更即时联动（05-01 孕1周锚点：选 05-08 自动"孕2周"、选 05-02 自动"孕1周1天"）；
2. **孕x周x天全链路**：`validate_gestational_week` 全部成功路径透出 `days`（周内天数 0~6，手填与推算一致沿用推算天数、微调 ±1 归零、40 周封顶超期保留），随 `exam_items.gestational_days` 零迁移存储；显示层统一 `gestationLabel`（历史表阶段列、明细卡片徽章、图表轴标签与 tooltip、报告摘要），历史无 days 记录降级整周；CSV 导入 mom 模板 `week` 列支持小数（23.5 = 孕23周3天）；
3. **相邻日期兼容**：锚点次日起任意日期可打卡（同日唯一 409 覆盖机制与按日推算互不冲突），从机制上支持"录完 05-01 再录 05-02"的连续补录场景；
4. **报告区块归属重构**：折叠按钮下移至报告区块自身标题栏——报告包裹独立卡片（📊 本次分析报告 + 评估摘要行「孕X周Y天评估 · 实际增重 Xkg（状态）」+ 收起/展开报告内容按钮），收起仅留标题栏、展开显示五区块完整内容；模块头部仅保留「导出评估报告」。

#### 10.20.3 验证结论
- 后端冒烟（用户真实锚点 2026-05-01 孕1周）：05-02→孕1周1天 / 05-08→孕2周 / 今天→孕24周1天推算全对；validate 自动填充透出 days、手填一致透传/微调归零/偏差>1 拦截、BMI 接口自动归档孕1周1天 note + 存储 + 时序透出、同日 409、历史 days=None 降级整周——全部通过；
- 浏览器全链路：打卡弹窗今天预填 24 / 05-08 预填 2 / 05-02 预填 1（提示"按首次打卡 2026-05-01 孕1周自动推算"）、05-02 保存归档后历史表·明细卡片·看板均显示"孕1周1天"、深度表单推算提示、报告标题栏折叠按钮（收起隐藏曲线区/展开恢复/模块头部无旧按钮）、console 零 JS 错误；
- 测试数据已清理（05-02、10-09 两条验证记录批删），用户原有数据（05-01/05-08/05-15 三条孕期打卡 + 宝宝测量）完整保留。

### 10.21 孕周输入自动填充修复与孕x周x天双输入 (v1.58)

#### 10.21.1 业务背景与根因定位
1. **自动填充失效**：v1.57.1 孕周输入框仅显示 placeholder「自动推算」却无数值填充，用户仍需手填——填充实现依赖 `useEffect`（依赖 `gestation?.week`）setState 回填，「推算值未变化不触发 effect」「弹窗打开重置与填充执行顺序竞争」「锚点异步加载时序」多重竞态叠加，输入框常为空；
2. **天粒度不可修正**：仅有整周输入框，推算出的周内天数（如孕24周1天的"1天"）无法被用户手动修改。

#### 10.21.2 架构设计与实现落地（派生显示值方案）
1. **模型转换（消除填充竞态）**：删除「effect 回填」→「touched 标记 + 派生显示值」：`weekDisplay/daysDisplay = !weekTouched/daysTouched && gestation ? String(推算值) : 手填值`——未编辑时输入框直接绑定推算值（填充绝对可靠、无时序依赖），onChange 置 touched 尊重用户值；effect 职责收缩为「日期/模式变化时重置 touched 回自动推算」，不再承担填充职责；
2. **孕x周x天双输入框**：打卡弹窗（`UnifiedHealthCheckIn`）与深度 BMI 表单（`BmiFormCard`）两组件同构改造——孕周块统一「[周] 周 [天] 天」双输入（周 1~42 必填、天 0~6），placeholder「自动推算」/「天」，标签与提示行显示推算依据（档案预产期 / 首次打卡锚点），周与天均可手改（周偏差 ±1 周内，超差后端 400 拦截）；深度表单产后月龄同步升级 `postpartumMonthsDisplay` 派生值（宝宝生日推算优先、可手改）；
3. **提交与后端采纳优先级**：提交一律以显示值为准（未编辑=推算值、编辑=用户值），`gestational_days` clamp 0~6 上送（打卡 409 覆盖重发链路同口径）；`BmiAnalysisInputSerializer` 新增 `gestational_days`（0~6 可选），BMI 分析接口用户显式传天数优先采纳（clamp 0~6）、未传沿用孕周引擎推算值，周数仍经双基准校验（偏差 >1 周 400 拦截），`gestation_check.days` 回透最终采纳值。

#### 10.21.3 验证结论
- 浏览器全链路（用户真实锚点 2026-05-01 孕1周，传统版实测后同源同步）：深度表单今天自动填充 24/1、05-08 → 2/0、05-02 → 1/1，手改天数=3 后 05-16 提交落库「孕3周3天」；打卡弹窗今天 24/1、05-17 → 自动 3/2、手改天=4 后落库「孕3周4天」，同日 409 覆盖条出现与取消正常；console 零 JS 错误；
- 数据治理：测试数据（05-16、05-17 两条）批删清理，用户原有 8 条记录完整保留（数据库核验通过）；新主包 `index-AFe2A9fr.js` 构建同步并重启生效；本仓库（Docker 版）业务代码同源零分叉，同步后 `Django check` 通过。


### 10.22 全面复查闭环重构与系统体验深度优化 (v1.59 同步)

#### 10.22.1 业务背景与复查问题识别
在 v1.58 孕周推算与双输入落地后，对系统代码和运行效果做全面二次复查，针对发现的 6 大核心优化点进行闭环修复与架构精简：
1. **健康日历记录类型脱节与未来日期异常**：`HealthCalendar` 兼容 `vaccination` 与历史 `vaccine` 类型，恢复疫苗名称与蓝色徽章渲染；增加未来日期禁用判定与样式置灰，禁止点击未来日期补录以防后端 400 校验拦截。
2. **宝宝生长曲线双Y轴体系与女童WHO标准**：内置 `WHO_P50_GIRL` 女童生长标准参考线；改用双 Y 轴架构（左轴长度/头围 cm，右轴体重 kg），彻底根治体重曲线被压扁问题；Tooltip 动态带出单位。
3. **主导航顶栏底栏一键直达**：`ALL_navItems` 正式纳入「健康中心」（`/health`，`menu_health`）。
4. **妈妈孕产档案单表融合与折叠详情**：后端 `_build_bmi_timeseries` 补齐 `ai_analysis` 字段；`BmiHistoryTable` 增加详情折叠展开行展示备注与 AI 临床解读并支持一键复制；移除底部重复渲染的 `momRecords` 卡片流，根除 >3000px 冗余垂直滚动。
5. **跨组件双向数据联动与409覆盖完善**：`BmiAnalysisView` 接入 `refreshTrigger` 与 `onRecordChanged`，实现打卡/导入弹窗与看板双向即时联动；完善 409 异常提取逻辑；清理 `services.ts` 中误放于 `shoppingApi` 的冗余 `analyzeBmi`。
6. **多页面暗黑模式 (Dark Mode) 全面对齐**：`HomePage`、`ProductListPage`、`ProductCard`、`HealthCalendar` 补齐深色模式样式类，消除暗色文字不可读异常。

#### 10.22.2 验证效果
- 前后端代码与传统版 100% 同源同构同步。
- 生产构建静态资产已全量同步到 `templates/` 与 `static/assets/`。

---

### 10.23 健康打卡与分析报告闭环联动、双向折叠与状态持久化 (v1.60)

#### 10.23.1 业务背景与问题复盘
在 v1.59 优化后，用户反馈：通过「健康打卡」或「一键分析评估 & 归档至时序档案」录入新数据时，原有的「展开分析报告 / 收起分析报告」模块未展示或无法找到。经深入排查，发现以下三大核心体验断层：
1. **折叠/展开按钮位置迁移与视觉盲区**：在 v1.57.1 中，顶部工具栏常驻的「展开/收起分析报告」按钮被移至卡片 4（分析报告卡片）内部标题栏，且文案改为「展开/收起报告内容」。由于卡片 4 位于录入表单、时序看板、历史数据表格的最下方，用户在上方提交后视口停留在上部，被中间长图表和表格阻隔，加上顶部按钮已移除，直观上产生“分析报告模块丢失”的体验。
2. **健康打卡弹窗数据链路断层**：统一健康打卡弹窗（`UnifiedHealthCheckIn`）提交时虽调用了 `analyzeBmi` 接口，但接口返回的分析评估对象 `res` 未回传给外层，导致 `BmiAnalysisView` 的 `result` 状态始终为 `null`，使得打卡后分析报告区块完全不渲染。
3. **分析结果内存状态非持久化**：`result` 状态仅保存在 React 临时状态中，用户刷新浏览器页面或在 Tab（如宝宝生长/时间轴）之间切换后再返回，`result` 被清空，报告瞬间蒸发。

#### 10.23.2 架构设计与实现细节
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

#### 10.23.3 验证效果
- 验证一键分析评估链路：表单提交后顶部展开/收起按钮点亮，页面自动平滑滚动直达报告区域，点击收起后底部提示条与顶部按钮同步联动。
- 验证健康打卡弹窗链路：右上角打卡保存后，自动回传最新分析报告并平滑定位展示，数据与图表、表格完全一致。
- 验证刷新与 Tab 切换留存：刷新页面后评估报告依然完整保留，支持随时展开/收起。
- 生产构建与静态资源全量同步，前端 `tsc -b && vite build` 0 错误编译通过。

---

### 10.24 健康时间轴全景多视图重构、时序空数据自适应折叠与分析报告篇幅精简 (v1.61)

#### 10.24.1 业务背景与问题复盘
1. **健康时间轴名实错位且缺乏统计图表**：原「健康时间轴」Tab 仅提供传统的按月网格日历（`HealthCalendar`），缺少纵向垂直时间轴流（Timeline），数据稀疏时留白多，密集时单日无法展开详情；且缺乏对产检、生长测量、疫苗接种等健康活动的宏观统计图表洞察。
2. **时序看板与历史表格清空后空白占用严重**：当数据被清空或无数据时，`BmiTimeSeriesBoard` 固定渲染了 320px 高的空白图表框，`BmiHistoryTable` 亦常驻大边距占位，在表单下方堆叠近 800px 无效留白，破坏视觉紧凑度。
3. **分析报告默认展开导致页面篇幅过长**：分析报告卡片展开后包含预警、4列指标、WS/T走势图、食谱、运动关怀等上千像素内容，默认展开导致刷新或切换 Tab 后页面严重过长，产生视觉压迫感。

#### 10.24.2 架构重构与实现细节
1. **健康时间轴全景多视图体系 (`HealthTimelineView.tsx` & `HealthPage.tsx`)**：
   - **时间轴流 (Timeline)**：经典左侧纵向时间基线 + 节点类型高亮光标，时间倒序排列；卡片清晰呈现测量指标芯片（身高/体重/头围/血压/体温等）、打卡备注与 AI 解读；提供「全部 / 孕期产检 / 宝宝生长 / 疫苗接种」实时分类筛选器。
   - **统计图表看板 (Charts)**：引入 ECharts 统计看板，包括：① 近 6 个月健康打卡活跃度与类型分布堆叠柱状图；② 健康档案记录类型构成环形饼图；数据动态响应。
   - **经典月历总览 (Calendar)**：完整保留 `HealthCalendar` 月度网格视图，保留点击历史日期快速补录健康打卡能力。
   - **顶部宏观统计与视图切换器**：顶部卡片展示总打卡数、产检数、生长测量数、疫苗数及最近打卡日；右上角提供三选一切换器并持久化偏好至 `localStorage`。
2. **时序看板与历史表格自适应折叠 (`BmiTimeSeriesBoard.tsx` & `BmiHistoryTable.tsx`)**：
   - `BmiTimeSeriesBoard`：当 `records.length === 0` 或筛选无数据时，自动折叠收起 320px 的空白图表框与冗余筛选器，转为轻量紧凑的引导栏；标题栏右侧增加折叠/展开开关，有数据时亦可随时自主收拢。
   - `BmiHistoryTable`：无数据时收缩多列空表格框架与内边距，呈现紧凑引导；同样支持头部一键折叠表格。
3. **分析报告默认收起策略 (`BmiAnalysisView.tsx`)**：
   - `reportCollapsed` 初始状态设为 `true`（默认收起），常态下仅展示 52px 高度的精致单行标题栏与评估摘要，彻底根除页面过长问题。
   - 仅当用户在当前表单主动点击「一键分析评估」时，临时切换为展开态并平滑滚动直达报告区域。

#### 10.24.3 验证效果
- 前端 `tsc -b && vite build` 0 错误编译通过，生产静态资源全量同步。
- 时间轴流、统计图表、经典日历三重视图切换顺畅；空数据状态下时序看板与历史表紧凑自适应折叠，留白占用彻底消除；分析报告默认收起，页面篇幅美观清爽。
