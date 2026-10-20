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
   - **统计图表独立生命周期解耦与白屏根治**：将 ECharts 统计看板封装为独立受控子组件 `HealthChartsBoard`，组件挂载时初始化并绑定 `ResizeObserver` 尺寸监听与首帧重绘，组件卸载时立即 `dispose()` 释放实例，彻底根除视图切换后因旧实例悬空导致的图表空白问题。
2. **时序看板与历史表格自适应折叠 (`BmiTimeSeriesBoard.tsx` & `BmiHistoryTable.tsx`)**：
   - `BmiTimeSeriesBoard`：当 `records.length === 0` 或筛选无数据时，自动折叠收起 320px 的空白图表框与冗余筛选器，转为轻量紧凑的引导栏；标题栏右侧增加折叠/展开开关，有数据时亦可随时自主收拢。
   - `BmiHistoryTable`：无数据时收缩多列空表格框架与内边距，呈现紧凑引导；同样支持头部一键折叠表格。
3. **分析报告默认收起策略 (`BmiAnalysisView.tsx`)**：
   - `reportCollapsed` 初始状态设为 `true`（默认收起），常态下仅展示 52px 高度的精致单行标题栏与评估摘要，彻底根除页面过长问题。
   - 仅当用户在当前表单主动点击「一键分析评估」时，临时切换为展开态并平滑滚动直达报告区域。

#### 10.24.3 验证效果
- 前端 `tsc -b && vite build` 0 错误编译通过，生产静态资源全量同步。
- 时间轴流、统计图表、经典日历三重视图切换顺畅；空数据状态下时序看板与历史表紧凑自适应折叠，留白占用彻底消除；分析报告默认收起，页面篇幅美观清爽。
---

### 10.25 首页定时轮询抖动根除与时序看板图表生命周期完整联动 (v1.62)

#### 10.25.1 业务背景与问题复盘
1. **首页停驻时每隔 15 秒页面剧烈抖动与闪烁**：
   - 现象：停留在系统首页，每隔约 15 秒整个页面内容瞬间消失替换为“加载中…”，随即恢复，造成强烈的视觉跳动与滚动条抖动。
   - 根因：RequireAuth 的 15 秒定时器持续调用 fetchMe()。每次返回的 JSON 数据反序列化出新的 data.stage 对象引用。HomePage.tsx 的 useEffect 依赖了 [stage] 对象，引发 fetchHomeData() 反复重发。同时 fetchHomeData() 首行调用 setLoading(true)，触发顶层 if (loading) 条件拦截，将整个几千像素高度的页面 DOM 销毁并替换为 80px 的加载中占位，数据返回后再重建 DOM，导致页面周期性塌陷重建。
2. **妈妈孕产档案多维度时序图表新增数据后持续空白**：
   - 现象：在「妈妈·孕产档案」录入身高体重打卡或一键分析后，下方的「测量打卡历史数据表」已有新增数据，但上方的「多维度时序图表看板」仍然是一片空白，且手动点击展开/收起依然无图表。
   - 根因：在 v1.61 的空数据自适应收拢设计中，当无记录时 isCollapsed === true，JSX 条件渲染分支中并未挂载 <div ref={chartRef} />。而组件中 ECharts 实例的初始化写在仅执行一次的 useEffect([], ...) 中。当组件首次挂载时，chartRef.current 为 null，初始化被直接 return 跳过，chartInstanceRef.current 永久滞留在 null。当用户新增第一条数据后，组件重绘并挂载了图表 DOM，但 Mount 钩子不再触发；图表数据更新钩子又因 !chartInstanceRef.current 拦截而直接退出，导致 ECharts 实例永远未被创建，图表持续空白。

#### 10.25.2 架构重构与实现细节
1. **首页静默刷新机制与引用防抖 (HomePage.tsx & authStore.ts)**：
   - authStore.ts：在 fetchMe 逻辑中加入 stage 结构化比较。针对 type、is_pregnant、value、label、week_days_text 等核心字段进行比对，若未发生真实变更则保持既有对象引用，防止状态机发出虚假重绘事件。
   - HomePage.tsx：将 useEffect 依赖解耦为基元合成键 stageKey = `${stage?.type || ""}_${stage?.is_pregnant ? "1" : "0"}_${stage?.value || 0}`，彻底隔离对象引用干扰。
   - HomePage.tsx：将全量 Loading 拦截优化为首屏条件判断（仅在初次无任何数据时展示），常规刷新与阶段更新均采用后台异步静默更新（fetchHomeData(silent)），接口返回后原地替换状态，杜绝 DOM 结构瞬态销毁与页面抖动。
2. **多维度时序图表生命周期与折叠态完全联动 (BmiTimeSeriesBoard.tsx)**：
   - 实例创建与数据渲染统一解耦：移除原脱节的挂载单次 useEffect([], ...)，统一在响应 [isCollapsed, filtered, viewMode, isDark, loading] 的主作用域中执行管理。
   - 容器挂载原地懒初始化：当 !isCollapsed && chartRef.current 满足时，自动通过 echarts.getInstanceByDom(container) || echarts.init(container) 完成实例激活与挂载，确保新增数据切换展开时 100% 能够捕获到真实的 DOM 节点并立即绘制。
   - 资源受控清理：当折叠或组件卸载时，自动断开 ResizeObserver 并执行 chart.dispose()，重置实例指针，消除内存泄露与游离画布。
   - 动态留白与单点适配：Category 轴设置 boundaryGap: filtered.length > 1 ? false : true，确保新增单条打卡时数据点居中、图表美观。
   - 状态自动复位：监听 records.length === 0 时自动重置 collapsedManually 为 null，确保数据清空后重新打卡时图表能够自动展开激活。

#### 10.25.3 验证效果
- 验证首页停留行为：在首页停留连续观察多次 15s 轮询周期，网络面板正常静默同步用户信息，首页 DOM 稳定无任何抖动、无白屏闪烁。
- 验证妈妈孕产档案看板：初始无数据时紧凑自适应折叠；点击表单打卡或一键分析后，多维度时序图表看板即刻自动展开并流畅渲染出实测走势点线与 WS/T 801 安全通道带，与历史数据表保持 100% 实时同步；多次手动折叠/展开图表均能稳定呈现。
- 生产环境构建：python build_frontend.py 成功执行，TypeScript 检查 0 报错，产物完整同步。

---

### 10.26 天气万年历全景融合、首页走秒天气横幅与 AI 模型列表手动拉取 (v1.63)

#### 10.26.1 业务背景与迁移意图
为丰富萌芽（Mengya）平台的生活关怀与智能化配置能力，从兄弟项目（记账伴侣）中深度萃取并重构三大核心功能：
1. **首页天气温差展示**：在系统首页首屏提供轻量级生活气象与时间关怀卡片，包含当前时刻走秒时钟、公历/农历干支生肖、二十四节气、法定节假日调休“班/休”徽章、实况天气温度与今明温差，提升用户粘性与关怀温度。
2. **天气与万年历全景融合页面**：
   - 解决用户在孕育期对天气出行与传统历法吉日的复合查询需求；
   - 原项目存在「日历」与「万年历」概念重复与割裂的问题。本次重构实施**方案 A（万年历与天气统一视图）**，将 1900~2100 年寿星天文历高精度公农历换算、国务院法定节假日班休调休、Open-Meteo 15 天高低温预报、ECharts 走势图与空气质量指数（AQI/PM2.5）无缝融合为同一页面的上下级联架构。
   - **严格排除原项目专有功能**：彻底剔除天气页中与母婴场景无关的「在次日举办宴席」功能，确保目标项目纯净无残留。
3. **AI 助手配置页「手动获取模型列表」**：
   - 支持在配置第三方 OpenAI 兼容大模型（如 DeepSeek、通义千问、Moonshot、LocalAI、vLLM）时，一键调用 `{base_url}/models` 端点拉取模型清单并以标签形式快速点选回填；
   - 严格接入系统现有 RBAC 权限控制体系，受按钮级权限精确守卫。

#### 10.26.2 架构重构与适配落地
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


#### 10.26.4 Docker 容器化环境与性能专属适配
1. **网络超时与代理容错**：在 Docker 容器内部环境下，宿主机代理环境变量可能导致远端 API 挂死。`holiday_service.py` 与 `weather_service.py` 严格实施“直连优先 + 环境变量代理回退”策略，并设置紧凑超时（连接 5s/读取 8s），防止 Gunicorn 工作线程耗尽。
2. **数据卷持久化规范**：节假日缓存文件存储于 `settings.BASE_DIR / 'data' / 'holiday_cache.json'`，通过 `docker-compose.yml` 的挂载项 `- ./data:/app/data` 确保容器重建与升级时持久化保存，避免容器重复拉取外部网络数据。
3. **今日关怀小锦囊初始化自愈**：在 `apps/core/management/commands/init_data.py` 容器启动引导链中增加 `DailyTip` 预置种子与数据库序列修复，确保容器构建和首次启动即处于完整就绪状态。

#### 10.26.3 验证效果
- **功能验收**：首页天气时钟、天气万年历预报、AI 模型列表拉取三大功能全部就绪。
- **排除项核验**：全文代码无任何「举办宴席」或 `banquet` 相关残留。
- **权限闭环验证**：使用无权限账号实测，菜单与快捷入口不显示、路由访问被拦截、模型拉取按钮隐藏；通过管理员授权后功能秒级放行。
- **构建与测试**：前端 TypeScript 检查与打包 0 错误；后端 RBAC 自动化测试 100% 通过。

---

### 10.27 天气页面白屏根治、健壮性治理与首页天气宝宝卡一体化重构 (v1.64)

#### 10.27.1 业务背景与问题复盘
1. **天气页面及点击查询白屏根因**：
   - **React 18 Object-as-Child 致命渲染崩溃（核心根因）**：后端 `weather_service.py` 的 `_build_result` 方法中，返回字典的 `'city'` 字段直接塞入了 GeoNames 地理编码字典对象 `{'name': '...', 'latitude': ..., ...}`，而非预期的纯字符串。前端 `WeatherPage.tsx` 在首屏和定位大卡中直接执行 `{weatherData?.city}`。React 18 遇到直接渲染普通 Object 时，抛出非捕获运行时错误：`Objects are not valid as a React child (found: object with keys {admin1, admin2, country, latitude, longitude, name, timezone})`，导致整页 React 组件树被卸载，页面彻底白屏。
   - **`localStorage` 脏数据自放大**：`loadWeatherByCoords` 将 `data.city`（即 `[object Object]`）写入本地缓存；刷新后读出字符串 `"[object Object]"` 并再次向后端请求，持续报错。
   - **Open-Meteo GeoNames 中文行政地名 404**：GeoNames 中文库不收录含“市/区/县”的地名（如“成都市”、“双流区”、“四川省成都市”均会返回 404）。自由搜索未做清洗，导致用户搜索常见城市名直接报错并把 `weatherData` 设为 `null`。
   - **级联查询无坐标时静默失效**：部分区县节点缺失经纬度坐标时，原代码直接 `return`，用户点击“定位查询”毫无反应。
2. **首页天气显示框与宝宝标签框冗余问题**：
   - 原 `HomePage.tsx` 首屏上下纵向堆叠两个大型彩色渐变卡片（顶部 `HomeWeatherBanner` 约 190px + 紧随其后的 `孕期/宝宝阶段卡` 约 220px），纵向占用超过 410px；
   - **问候语重复**：天气卡显示“上午好，准妈妈”，阶段卡又显示“准妈妈，你好呀”；
   - **首屏挤压严重**：将真正核心的孕周胎儿发育、快捷功能入口与个性化推荐挤至第二屏下方，影响操作效率。

#### 10.27.2 架构重构与优化落地
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

#### 10.27.3 验证效果
- **天气页面与查询白屏测试**：实测“成都”、“成都市”、“双流区”、“北京”、“四川省成都市”等自由文本查询与经纬度级联查询，全部 100% 成功返回 `code: 0`，`city` 严格为 `str` 类型，页面渲染稳定无白屏。
- **首页排版核验**：首页首屏布局紧凑大气，问候语无重复，阶段设置点击即刻呼出弹窗，胎儿发育与快捷入口直观可见。
- **全链路权限守卫**：无 `menu_weather` 权限返回 HTTP 403，有权限放行；AI 模型拉取按钮受 `ai_fetch_models` 权限精确守卫。
- **构建与重启**：前端 TypeScript 检查与打包 0 错误；本地 Django 一体化服务无缝重启（端口 5173）。


---

### 10.28 首页关怀小锦囊管理员后台、阶段自适应与气象按需级联直查 (v1.65)

#### 10.28.1 业务背景与问题复盘
1. **首页引导大卡片中间留白偏多与内容单薄**：原首页全景横幅在中部存在大面积视觉留白，缺少有针对性的科学育儿与孕期健康指导信息。为提升用户粘性与关怀温度，需在横幅中栏新增【今日关怀小锦囊 · 专属贴士卡】，并提供管理员专属配置后台，支持系统内置与自定义提示信息的灵活维护。
2. **育儿阶段匹配错位与贴士停滞缺陷**：
   - 当宝宝成长至幼儿期（如 2 岁 8 个月 8 天，32 个月）时，因原判断逻辑未优先拦截幼儿期特征，被包含“个月”字样错误拦截为婴儿期，导致始终显示婴儿期贴士；
   - 管理员配置专属贴士后，首页卡片未跟随当前宝宝阶段自动更新，始终停留在通用/备孕阶段贴士。
3. **气象页面网络请求过频与级联查询强制受限**：
   - 原天气页面点击进入即自动发起网络请求拉取天气，造成不必要的外部接口消耗；
   - 原省市区三级级联必须逐级选择直至“区县”，用户无法单独查询“省”（如直辖市/省会）或“省+市”（如四川省成都市）天气，交互繁琐。
4. **AI 模型列表拉取后缺乏折叠设计**：点击获取模型列表后，候选模型标签默认全量铺满展开，页面纵向数据过度膨胀且无法折叠，严重挤压表单布局。
5. **阶段设置倒计时跳回与失效**：用户在首页或个人中心设置孕育阶段（如切换至“怀孕中”或“宝宝已出生”）停留 5~10 秒时，因后台定时轮询浅比较缺陷引发虚假重绘刷新，导致用户刚刚保存的设置被自动冲刷还原。

#### 10.28.2 架构重构与优化落地
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

#### 10.28.3 验证效果
- 首页横幅呈现左中右三栏协调布局，中间贴士卡跟随宝宝月龄（如 2 岁 8 个月精准展示幼儿期成长锦囊）；
- 管理员后台可任意增删改贴士、批量启停与调整展示条数，前台即时联动生效；
- 天气页进入无冗余请求，省市区级联支持仅选成都市直接查询；AI 模型列表选中即自动收起。

---

### 10.29 健康中心打卡与深度 BMI 全维度智能联动、基线双向自动继承与 CSV 导入防呆治理 (v1.66)

#### 10.29.1 业务背景与问题复盘
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

#### 10.29.2 架构重构与优化落地
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

#### 10.29.3 验证效果
- 健康打卡与深度体重/BMI分析实现双向无缝联动，身高与孕前体重输入框直接回显实测值且可任意修改；
- 无论历史打卡是否缺失单次身高，状态卡稳定呈现当前测算 BMI 与孕前 BMI 基线；
- 导入数据按钮随妈妈/宝宝 Tab 自动切换目标；CSV 批量导入容错率显著提升，冲突确认路径明确。


---

### 10.30 健康打卡与时序图表排版优化、阶段合理性医学校验与健康中心宝宝生长档案多实体构建 (v1.67)

#### 10.30.1 业务背景与问题复盘
1. **健康打卡输入框内图标遮挡内容**：在健康打卡弹窗（`UnifiedHealthCheckIn.tsx`）中，身高与体重输入框内部保留了尺子 (`<Ruler>`) 与体重秤 (`<Scale>`) 装饰图标及 `pl-9` 内边距，遮挡了数字开头，导致实测数据看不清楚；
2. **多维度时序图表看板末点阶段信息截断**：在 BMI 时序趋势/增量柱状图看板（`BmiTimeSeriesBoard.tsx`）中，最后一个数据点的横轴阶段长标签（如“10-13 孕40周+5天”）显示不全被截断。定位为：`boundaryGap: false` 末点贴边 + X 轴超长标签居中向右溢出 35~45px + `grid.right` 留白仅 20~25px；
3. **阶段类型合理性校验缺失风险**：健康中心在“用户添加数据”（打卡、一键分析评估）与“CSV 批量导入”两条入库链路中，缺乏跨时序的生理阶段合理性互斥校验，可能出现同一孕产周期内录入非孕期/产后等矛盾数据；且需支持按单个妈妈维度物理隔离；
4. **架构收敛与宝宝生长档案模块内建多宝宝支持**：按照高内聚产品规范，回退独立的“妈妈孕产档案”与“宝宝生长档案”独立页面，**将多宝宝档案管理能力完整内建于健康中心页面的「宝宝·生长档案」模块中**，支持录入多位宝宝信息；且所有支持新增录入宝宝的入口均需贯彻“未填姓名默认自动继承默认宝宝名称，兜底小萌宝”的保底命名规则。

#### 10.30.2 架构重构与优化落地
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

#### 10.30.3 验证效果
- 健康打卡输入框无图标遮挡，输入与回显清爽可见；
- 时序图表看板在末点长标签场景下完整显示无截断；
- 阶段合理性校验引擎精准拦截冲突数据，多妈妈隔离可靠；
- 回退独立路由后系统架构精简规范；健康中心宝宝·生长档案模块内建多宝宝录入、编辑、切换与全入口默认命名 100% 验证通过。


---

### 10.31 跨页面多模块全自动同步、宝宝健康打卡指定已有档案与时间轴/日历/图表多宝宝区分优化 (v1.68)

#### 10.31.1 业务背景与问题复盘
1. **跨页面默认宝宝切换后妈妈档案不同步**：用户在“我的”页面（`ProfilePage`）切换默认宝宝档案后，健康中心“妈妈·孕产档案”模块展示的当前妈妈数据（阶段状态、预产期、妈妈名称）未自动更新；且首页、健康中心、我的页面之间缺乏全自动联动，数据无法实时穿透；
2. **宝宝健康打卡无法选择已有宝宝**：健康中心“宝宝·生长档案”页面点击“健康打卡”按钮时，打卡弹窗未关联已有宝宝，无法针对指定宝宝录入档案信息，且月龄天数仅基于全局单人生日推算；
3. **健康时间轴与日历数据/图表无法区别宝宝**：多宝宝场景下，健康时间轴节点卡片仅显示泛化的“宝宝 x 个月”，无法识别是哪个宝宝的测量或疫苗记录；统计图表将不同宝宝生长测量混在一块；日历单元格未显式标出对应宝宝名称，缺乏宝宝维度筛选与区分能力。

#### 10.31.2 架构重构与优化落地
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

#### 10.31.3 验证效果
- 在“我的”页面切换默认宝宝后，健康中心当前妈妈档案模块、当前宝宝详情微卡、首页 Banner 均无需手动刷新即刻 100% 自动同步；
- 健康打卡宝宝模式可在多个已有宝宝之间自由切换，精准推算月龄天数，打卡数据正确归属于目标宝宝，同日多宝宝打卡无冲突；
- 健康时间轴、统计图表看板与经典日历视图全面呈现宝宝姓名与专属图例，支持多宝宝精准筛选，彻底解决多宝宝数据混淆问题。


---

### 10.32 健康中心宝宝档案交互闭环、日历精准定向打卡与每日统计看板优化 (v1.69)

#### 10.32.1 业务背景与问题复盘
1. **宝宝生长档案录入/编辑/删除操作无反应**：在健康中心「宝宝·生长档案」模块中，点击“录入新宝宝”按钮、宝宝卡片上的“编辑资料”与“删除档案”按钮无任何响应。定位为：组件中虽声明了模态框状态与处理函数，但 JSX 底部漏掉了新增、编辑弹窗及删除确认对话框的渲染；且在进行增删改操作后，需确保与首页和“我的”页面通过全局事件与状态接口实现秒级自动同步；
2. **生长曲线与测量记录未显示宝宝昵称**：在「宝宝·生长档案」的 WHO 参考生长曲线与历史测量记录表中，卡片标题与数据表格未显明所属宝宝昵称，用户切换宝宝标签时无法直观辨认当前数据属于哪一位宝宝；
3. **健康日历总览多宝宝点击未定向且无历史数据提示**：当某一天存在多个宝宝记录时，点击指定宝宝记录胶囊弹出的打卡窗口未自动归属于该宝宝，仍默认停留在首个宝宝；且输入框未显示该记录此前录入的实测数值；
4. **日历总览产检记录点击未切换打卡模式**：在健康日历总览中点击孕期产检记录（`prenatal_exam`）时，打卡弹窗仍停留在默认的“宝宝生长测量”选项卡，未能自动跳转到“我 · 孕期产检”模式；
5. **统计图表时间维度过大且不易观察**：原统计看板采用 6 个月为颗粒度，缺乏日级别（Daily）活跃度时序展示，且在数据密集或跨度较长时容易拥挤不易观察。

#### 10.32.2 架构重构与优化落地
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

#### 10.32.3 验证效果
- 点击“录入新宝宝”、“编辑资料”与“删除档案”弹窗灵敏弹出，保存后首页顶栏、我的页面与健康中心秒级同步；
- 生长曲线与历史测量表清晰展现宝宝昵称，单人多宝宝隔离明确；
- 在日历总览中点击指定宝宝或产检记录，打卡弹窗自动选中对应宝宝与正确模式，并直观提示已录入数值；
- 统计看板按日维度直观呈现，支持滑块缩放与快速联动，数据展示清晰易观察。
---

### 10.33 健康打卡模式隔离、怀孕宝宝孕周推算、日历定向多宝宝数据回填与统计看板深度下钻升级 (v1.70)

#### 10.33.1 业务背景与问题复盘
1. **未出生/怀孕中宝宝月龄展示缺陷**：当用户选择的宝宝处于怀孕中（`is_born === false`）状态时，月龄推算一直展示为“宝宝月龄自动推算：0 天”，未能正确呈现孕周孕天信息；
2. **打卡记录类型未按子页面严格隔离**：健康打卡按钮点击后，在妈妈孕产档案页面中仍展示宝宝生长测量选项，在宝宝生长档案中仍展示孕期/产后/备孕选项，造成录入混淆；
3. **健康日历同日多宝宝/妈妈记录点击定向与数据回填失效**：当同一天存在多条记录时（例如 15 号同时录入宋泽言和悠悠两位宝宝的生长测量数据，或存在妈妈产检数据），点击下面的悠悠胶囊时弹出的页面仍默认停留在宋泽言处，且之前录入的身长、体重、头围等数据信息没有展示与提示；
4. **覆盖提示展示时机不合理**：当日已有数据时，用户点击进入打卡页面尚未点击保存，页面就已默认显示“当日已有记录，是否覆盖更新”，影响正常输入体验；
5. **统计图表看板缺乏深度交互分析能力**：图表看板缺乏多周期（7/14/30/90/180天/全部）时间范围筛选、多粒度（天/周/月）聚合、图表形态（柱状图/折线图/面积图）切换以及点击特定周期（如 2026-09）进入深度下钻详情、面包屑返回等交互。

#### 10.33.2 架构重构与优化落地
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

#### 10.33.3 验证效果
- 怀孕中宝宝卡片与打卡弹窗月龄正确推算并展示为“孕x周x天”；
- 妈妈页面打卡仅展示妈妈选项，宝宝页面打卡仅展示宝宝生长测量；
- 日历总览点击悠悠或宋泽言或产检记录，弹窗准确归属于目标对象，输入框完整展示历史实测数值与提示；
- 覆盖提示仅在点击保存发生冲突时展示；
- 统计看板支持多粒度切换与多形态图表，点击 2026-09 成功下钻查看详情并可平滑返回。


---

### 10.34 健康打卡运行时防崩修复、BMI 提示词与孕周自动填充、多孩阶段校验与图表下钻返回持久化 (v1.71)

#### 10.34.1 业务背景与问题复盘
1. **健康打卡按钮点击白屏崩溃**：健康中心页面点击“健康打卡”按钮后页面崩溃为空白。经排查，系 `UnifiedHealthCheckIn.tsx` 中 `filteredModeOptions` 的 `useMemo` 声明在 `const MODE_OPTIONS = ...` 之前，并且被放置在 `if (!isOpen) return null;` 之后；当用户点击按钮打开弹窗（`isOpen = true`）时，JavaScript 引擎访问处于暂态死区（TDZ）的 `MODE_OPTIONS` 抛出致命的 `ReferenceError: Cannot access 'MODE_OPTIONS' before initialization`，导致 React 根组件树崩溃卸载；
2. **深度体重/BMI分析提示词不具体且未自动填入孕周**：在健康中心“深度体重/BMI分析与打卡 (WS/T 801-2022)”模块中，选择产后恢复期时提示词仅为泛指的“按宝宝生日自动”，未说明是按哪位宝宝计算；选择“全孕期阶段”时，若存在怀孕中的宝宝档案，孕周输入框未能自动填入当前孕周数值；
3. **多孩不同阶段妈妈的阶段类型校验冲突与多模块联动缺失**：同一位妈妈可能同时存在大宝（已出生、处于产后育儿期）与二宝（怀孕中、处于全孕期），原校验逻辑将妈妈一生所有记录视为单一孕期，导致大宝产后历史与二宝当前孕期发生虚假冲突；且页面各模块之间缺乏对当前关联宝宝阶段的智能感知；
4. **统计图表看板下钻返回后记录类型构成饼图失效**：在健康时间轴看板点击周期下钻后点击“返回总览看板”，健康档案记录类型构成环形饼图无法展示数据，必须手动刷新页面才能恢复；日历及图表内点击触发打卡弹窗时亦受弹窗异常影响出现白屏。

#### 10.34.2 架构重构与优化落地
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

#### 10.34.3 验证效果
- 前端 `npm run build` 编译打包零警告零报错；
- Django 一体化服务（端口 5173）重启成功，本地 HTTP 响应 200 OK；
- 验证健康打卡弹窗秒级打开无白屏，BMI 模块动态展示对应宝宝昵称并自动填入孕周，多孩阶段校验畅通入库，图表下钻返回后记录类型构成饼图与趋势图完美展示。


---

### 10.35 BMI参考宝宝显式化、孕前时序校验边界对齐、时序活跃度图表X轴防挤压与多宝宝图表精准匹配 (v1.72)

#### 10.35.1 业务背景与问题复盘
1. **全孕期参考宝宝信息缺失**：在健康中心“深度体重/BMI分析与打卡 (WS/T 801-2022)”模块中，选择“全孕期阶段”时，提示语为“当前孕周 · 已自动推算（可修改周与天）”，未展示是按哪位宝宝（特别是在多孩孕期场景下）计算的参考依据；
2. **阶段合理性时序校验边界虚假拦截**：校验提示周期为 `2026-05-01 至 2027-02-05`，用户录入 `2026-04-28` 时被系统拦截。医学上 LMP（末次月经日，此处为 2026-05-01）之前属于孕前/备孕阶段（`general`），原代码使用 `LMP - 14天` 误判了孕前数据，且错误信息与判定区间不一致；
3. **时序打卡活跃度与类型分布图表 X 轴排版拥挤与概率丢失**：时间跨度较长时（如 90 天/半年/全部），底部图例、缩放滑块与 X 轴日期标签在有限高度内发生盒模型碰撞，导致 ECharts 动态抑制横坐标显示或标签互相遮盖；
4. **下钻子图表形态丢失与多宝宝同日图表点击混淆**：
   - 外部看板选择折线图或面积图后，下钻进入周期详情时子图表仍显示柱状图；
   - 当某一天存在多位宝宝的打卡记录（如 2026-10-15 同时存在宋泽言与悠悠）时，点击图表对应宝宝柱状/折线段，弹窗始终固定打开第一个宝宝，无法精准跳转到所点击的宝宝。

#### 10.35.2 架构重构与优化落地
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

#### 10.35.3 验证效果
- 前端 `npm run build` 编译打包零警告零报错；
- Django 一体化服务（端口 5173）重启成功，本地 HTTP 响应 200 OK；
- 验证全孕期阶段自动展示参考宝宝姓名与多宝切换，孕前备孕记录（如 2026-04-28）顺利入库且区间冲突提示数学准确；
- 验证时序打卡图表日期标签清晰可见无遮挡，滑动缩放平滑；下钻图表形态与外部一致，多宝宝图表点击精准匹配对应宝宝。


### 10.36 架构极简治理：根目录瘦身、文档中心分流与跨 AI 协作维护规范落地 (v1.74)

#### 10.36.1 治理背景与核心痛点
随着平台的持续演进，根目录与文档体系暴露出多项结构性膨胀与失焦问题：
1. **主自述文档（README.md）严重膨胀**：累计达到 1157 行（113 KB），超 75% 篇幅被 v1.13 ~ v1.72 的历史更新流水账占据，初次接触项目的开发者阅读负担重；
2. **辅助脚本与设计资产散落首页**：`build_frontend.py`、`check_admin_status.py` 与 PSD 设计文档（Markdown + HTML）混杂在项目根目录，首页文件繁杂；
3. **跨 AI 工具协作失范隐患**：在切换不同 AI 编程助手（Codex、Cursor、Claude Code、Windsurf 等）或多人协作时，缺乏全局统一的行为规范指引，大模型极易按通用习惯继续将更新日志随手追加在 `README.md` 尾部，导致刚刚整理干净的主文档再度膨胀；
4. **容器依赖特殊性保障**：核心就绪等待探针 `wait_for_db.py` 具有极高运行时地位，需在根目录严格固化，绝不可混同普通脚本随意搬迁。

#### 10.36.2 核心改造与分层治理方案
1. **文档中心（docs/）独立规范设立**：
   - 将权威系统设计规范 `Project_System_Design.md` 与 HTML 交互视图 `Project_System_Design.html` 统一收纳进 `docs/` 目录；
   - 抽离全量版本演化细节，设立独立的 `docs/CHANGELOG.md`，完整承接 v1.13 ~ v1.74 的全部迭代记录，保持历史审计溯源 100% 守恒；
   - 将三大数据库模式自适应架构（SQLite / 共享 PG / 独立 PG）与 6 种双版本物理隔离矩阵深度融入 PSD 架构规范中。
2. **工具中心（tools/）激活与路径深度自愈**：
   - 将前端一键打包同步脚本 `build_frontend.py` 移入 `tools/` 目录，将其根目录解析锚点从单级 `parent` 升级为两级父目录：`ROOT_DIR = Path(__file__).resolve().parent.parent`，确保前端编译、模板写入与静态资产合并路径 100% 准确；
   - 将管理员账号状态调试脚本 `check_admin_status.py` 移入 `tools/` 目录，头部显式注入 `sys.path.insert(0, str(ROOT_DIR))`，彻底杜绝跨目录执行时找不到 `config` 和 `apps` 导致的 `ModuleNotFoundError`；
   - 严格保留 `wait_for_db.py` 于项目根目录，确保 `Dockerfile` 的 `CMD` 与 `docker-compose.yml` 挂载执行 100% 零破坏、零回归。
3. **首页主文档（README.md）极简重构**：
   - 篇幅严格收敛至 150 行左右，聚焦系统定位、单阶段轻量 Python 镜像、单体一体化单进程架构（0.0.0.0:5174/8000）、快速启动及全局文档导航，大幅提升可读性。
4. **跨 AI 协作与维护规范（AGENTS.md）全面落地**：
   - 在项目根目录设立 `AGENTS.md`，确立文档分流铁律、极简自述标准与零业务破坏原则，作为所有 AI 代理与人工开发的权威执行基准。

#### 10.36.3 验证效果
- 执行 `python tools/check_admin_status.py`，跨目录路径自愈完全生效；
- `tools/build_frontend.py` 根路径锚点两级回退解析准确；
- Dockerfile、docker-compose 编排配置与卷挂载保持 100% 守恒，原有代码逻辑与容器功能零影响。

### 10.37 外部接口服务配置统一管理与多源高可用容灾管线 (v1.73)

#### 10.37.1 架构决策背景
在微服务编排环境下，系统依赖的第三方外部接口（如天气、节假日、私有 SearXNG、AI 大模型等）分散在各环境变量中，缺乏可视化的运行时动态维护与统一超时重试策略。

#### 10.37.2 统一服务配置中心与热加载
1. **统一抽象**：设计 `ServiceConfig` 服务中心，归一化管理天气、节假日日历、公网搜索及私有元搜索；
2. **三级容灾**：每个服务配置主用地址、备用地址与本地静态兜底，保证即使网络完全隔离或第三方服务故障，系统核心业务流程亦不被阻塞；
3. **管理后台可视化**：管理员可在「外部接口服务配置」页面直观查看、编辑和连通性测试。

---

### 10.38 妈妈健康中心生命体征监测（血压/血糖）与智能双轨分析体系 (v1.75)

#### 10.38.1 架构方案与临床医学标准
1. **架构方案 A（二级子看板）**：融入「妈妈·孕产档案」主模块，划分为 `体重与 BMI 监测分析` 与 `血压与血糖监测分析` 二级子看板；
2. **严谨合理的临床标准分级**：
   - 血压严格依循《妊娠期高血压疾病诊治指南》（理想/正常高值/妊娠期高血压预警/重度子痫前期危象警报）；
   - 血糖严格依循《妊娠期高血糖诊治指南(2021)》，覆盖空腹、餐后1h、餐后2h、睡前与随机 5 大场景，动态区分孕期与非孕期标准；
3. **部分录入与完备度说明**：解除全字段必填限制，支持单录或组合录入，未录入项给出明确展示说明；
4. **同日打卡 409 冲突与字段级合并**：提供友好弹窗并在确认覆盖时智能合并记录字段，无损保留已有数据；
5. **双通道 AI 专家解读**：结合孕周阶段、录入完备度与历史趋势生成结构化报告，提供 DASH 低钠与低 GI 食谱，外部 AI 故障时秒级降级至本地知识库。

---

### 10.39 妈妈健康中心体验深化与功能对等重构（v1.76）

#### 10.39.1 架构决策背景与核心痛点
针对用户在实际使用中的反馈进行体验深化：
1. **健康打卡按钮智能情景适配**：BMI 页面点击默认主测体重身高（血压血糖折叠收起），血压血糖页面点击自适应为“记录血压/血糖”（体重腹围折叠收起），支持顶部双标签快速切换并解耦校验；
2. **CSV 导入数据专属三向分流**：根据当前子页面自动预选 `mom_bmi`、`mom_vitals` 与 `baby` 场景，提供专属中英文模板与对应列校验；
3. **测量日期动态联动推算与档案溯源**：选择测量日期后自动调用 `computeGestation` / `autoPostpartumMonths` 毫秒级重算孕周天数与产后月数，显式渲染来源档案徽章并支持多宝基准切换；
4. **体重/BMI 模块互补选填折叠卡**：在 `BmiFormCard` 底部新增血压、血糖、伴随症状与生活备忘折叠卡，提交时全量打包归档至后端生命体征库。

#### 10.39.2 实施与容器化验证结果
- **容器与微服务一致性**：所有后端 API 与前端构建产物在 Docker 编排环境下完全对齐，前端产物通过 `build_frontend.py` 预构建合并至 `templates/` 与 `static/`，生产镜像纯净零 Node 依赖；
- **校验结论**：Django `manage.py check` 0 警告，迁移图谱 `0029_external_api_config` 顺畅衔接，前端 TypeScript 编译与 Vite 生产构建 100% 通过。

### 10.40 天气与万年历精度深度优化、请求频次治理与外部服务配置生效机制重构（v1.77）

#### 10.40.1 决策背景与核心痛点
1. **区县级地址解析失真**：自由搜索“四川省巴中市恩阳区”时，因底层 Open-Meteo 海外词库未收录“恩阳”，系统降级至地级市“巴中”，导致气象数据偏离实际区县。
2. **搜索交互缺乏动态反馈**：搜索按钮无动态 Spinner 与正在查询状态，已有天气数据时再次搜索无卡片加载遮罩与 Toast 提示，用户感知为“界面无响应”。
3. **数据重复无节制拉取**：每次进入天气页面均重新请求外部网络，缺乏本地持久化会话缓存，造成高频冗余请求与网络资源浪费。
4. **年份控件图标被截断**：原生 `<select>` 继承全局输入框宽度并在窄屏与特定浏览器下由于 padding 不足导致原生下拉箭头被截断，且日历图标无 `shrink-0` 产生挤压形变。
5. **首页大卡片定位同步体验突兀**：用户在天气页面变更城市后，首页关怀卡片无法感知数据加载态，缺乏过渡动画与“正在同步最新定位天气”友好提示。
6. **外部接口配置停用失效**：管理员在后台停用天气预报或节假日端点后，底层调度因 `urls` 为空而暴力回落内置默认官方 URL，导致停用配置形同虚设。

#### 10.40.2 实施方案与 Docker 环境验证
1. **区县级精准匹配**：前端优先通过本地 3000+ 行政区划树 `resolveRegionFromText` 贪婪逆向解析，0 延迟、100% 精度直取真实经纬度坐标（恩阳区 `[106.4865, 31.8163]`），防止海外 Geocoding 错误降级；
2. **搜索反馈闭环**：搜索按钮集成动态 Spinner 与“正在查询…”文案，看板局部遮罩过渡，全局 Toast 状态通知；
3. **会话持久化缓存**：本地用户级持久化缓存，进入页面秒开免拉取，仅在手动搜索、级联查询或主动刷新时请求，退出登录即时清理；
4. **万年历年份控件防裁切**：消除浏览器原生 select 裁切，专属胶囊控件内嵌 ChevronDown 图标并锁定安全间距与最小宽度；
5. **首页大卡片定位同步 Loading**：定位变更时动态切换毛玻璃 Loading 态与目标城市文案，平滑淡入最新数据；
6. **外部接口停用严格生效**：移除暴力回落漏洞，端点全停用直接中断外网请求并抛出 503 业务异常，配置更新即时清空服务端内存缓存；
7. **Docker 环境纯净镜像适配**：Docker 镜像采用单体一体化部署，静态资源经由 `build_frontend.py` 预编译打包，彻底解除 Node.js 运行时依赖。
### 10.41 容器化运行时高并发治理、前端短轮询抑制、首页大包优化与 SQLite WAL 模式接入（v1.78）

#### 10.41.1 架构决策背景与核心痛点
随着 Docker 容器化版在轻量化低配云主机（如 1C1G / 1C2G）与生产环境的深入运行，监控与用户反馈了以下核心性能痛点：
1. **Gunicorn 线程池频繁打满**：前端 `RequireAuth.tsx` 存在无条件 15 秒短轮询，多标签页或后台挂起时持续冲击 `/api/users/me/`，将 Gunicorn `--threads 4` 的轻量线程池排队占满，导致页面交互请求响应迟钝并引起 CPU 飙升；
2. **首页推荐商品大体积全量查询**：`HomePage.tsx` 每次加载拉取全量商品（约 145KB JSON），只为了切片前 4 条展示，触发大量 ORM 全表扫描与序列化计算；
3. **SQLite 模式（`DB_MODE=sqlite`）读写锁竞争**：在单文件 SQLite 模式下，未开启 WAL 模式且缺少连接超时配置，写操作互斥锁表导致 Gunicorn 多线程争锁阻塞；
4. **环境变量模板配置隐患**：`.env.example` 默认配置 `DJANGO_DEBUG=True`，初次部署复制时易误开启 Debug 导致 `connection.queries` 内存泄漏。

#### 10.41.2 实施方案与容器化治理
1. **配置模板硬化**：修正 `.env.example` 中 `DJANGO_DEBUG=False`，彻底消除 Debug 内存泄漏隐患；
2. **前端短轮询抑制与可见性联动**：轮询周期由 15s 延长至 60s，并结合 `document.visibilityState`，在标签页切走或休眠时完全挂起轮询；
3. **首页推荐商品分页拉取**：改造为 `productApi.list({ sort: "rating", page: 1, page_size: 4 })`，传输体积降低 95%，后端处理耗时趋近于 0；
4. **SQLite WAL 并发模式与锁等待**：在 `apps/core/apps.py` 监听 `connection_created` 执行 `PRAGMA journal_mode = WAL;` 与 `PRAGMA synchronous = NORMAL;`，在 `settings.py` 注入 `timeout: 20`；
5. **静态目录自愈与产物同步**：`STATIC_ROOT.mkdir(exist_ok=True)` 消除底噪告警，执行 `tools/build_frontend.py` 完成生产构建并同步；
6. **502 Bad Gateway 根除与真实 HTTP 就绪探针**：重构 `bin/docker.sh` 的 `start_docker` 探活循环，废除仅按 `running` 状态假判断逻辑，改为连续轮询宿主机映射端口的 HTTP 200 就绪状态（最长等待 60s），并在容器提前崩溃时即刻抓取日志告警；在 `docker-compose.yml` 中引入原生 `healthcheck`；在 Nginx 配置中开启 `proxy_http_version 1.1;`、`proxy_set_header Connection ""`、`proxy_next_upstream` 重试与 `128k/256k` 代理缓冲区，彻底根治 Linux 服务器部署访问 502 痛点。

## 10.41 ADR 10.41：宿主机 Nginx 配置文件覆盖提示统一化、PG 毫秒级探活与 502 崩溃循环治理 (v1.79)

### 10.41.1 决策背景与核心痛点
1. **启停无 Nginx 配置覆盖提示**：执行 `run.sh start` 或 `restart` 时缺失交互询问，跳过提示或静默覆盖；
2. **初始化耗时长且持续打印等待信息**：`postgres:15-alpine` 编排层 healthcheck 参数设置过长（15s/10s），加上 `init_data` 2,000 次循环 `update_or_create` 网络往返（耗时 35s），串行累加达 70 秒，超过 60 秒探活等待上限；
3. **502 Bad Gateway 与假死假就绪**：后端容器在崩溃时进入 Docker `restarting` 状态，原有探测脚本仅检测 `exited/dead`，导致容器陷入死循环时误判为“仍处于初始化中”，超时后误报“启动完成”，用户访问直接抛出 502 Bad Gateway。

### 10.41.2 架构治理方案与设计要点
1. **统一 Nginx 配置覆盖交互确认（全场景对齐）**：
   - 在 `bin/nginx.sh` 中无论 `start`、`restart` 还是 `add_nginx`，只要文件已存在均弹出 `(y/N)` 交互提示，默认 `N` 保留，选 `y` 自动创建快照备份后覆盖写入；
   - Nginx 重载逻辑升级为 `sudo -n systemctl reload nginx || sudo -n nginx -s reload || nginx -s reload` 多级平滑重载。
2. **独立 PG 编排层健康检查秒级提速**：
   - 在 `docker-compose.db.yml` 中调整 healthcheck 为 `start_period: 2s, interval: 2s, timeout: 2s`，1~2 秒内即判定 healthy 并放行 `backend` 启动。
3. **种子数据全量秒级快速就绪**：
   - 在 `init_data.py` 入口引入多表预检短路逻辑，已就绪时 0.05 秒内瞬时返回；未初始化时采用 `bulk_create` 批量插入，全新初始化压缩至 0.2 秒。
4. **数据库真实认证探针与启动平滑重试**：
   - 在 `wait_for_db.py` 中引入 `psycopg2` 真实数据库认证，平滑应对启动时序，并在数据卷凭证不匹配时给出明确指引。
5. **容器崩溃循环捕获与真实就绪严格防线**：
   - `bin/docker.sh` 捕获 `b_status == "restarting"` 与 `.State.Restarting == true`，检测到崩溃立即打印 50 行后端日志并退出；未就绪时绝不误报成功。

### 10.41.3 实施与验证结果
- **启动与就绪耗时**：独立 PG 模式从容器启动到端口完全就绪总耗时由 70+ 秒降至 3~5 秒内；
- **交互与诊断验证**：Nginx 配置覆盖提示正常唤起；容器异常时即刻暴露真实日志，彻底杜绝 502 假死。

