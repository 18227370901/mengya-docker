# 萌芽（Mengya）母婴全周期成长伴侣平台 - 容器微服务编排版 (mengya-docker)

> **GitHub 仓库地址**：[https://github.com/18227370901/mengya-docker.git](https://github.com/18227370901/mengya-docker.git)
> **兄弟项目**：[https://github.com/18227370901/mengya-traditional.git](https://github.com/18227370901/mengya-traditional.git)


本项目为萌芽（Mengya）母婴全周期平台的**Docker 容器化生产与演练部署工程（mengya-docker）**。采用 Docker Compose 微服务架构，提供 PostgreSQL、Redis、Celery、Django 后端、Vite 前端及宿主机 Nginx SSL 独立反代等全栈能力。

---

## 一、微服务架构模型与双版本共存隔离设计

| 容器服务 | 基础镜像 / 技术栈 | 内部端口 | 宿主机暴露策略与隔离设计（与传统版零冲突） |
| :--- | :--- | :--- | :--- |
| **frontend** | `node:20-alpine` (React + Vite) | `5173` | **宿主机映射端口调整为 `5174`**：避开传统版 `5173`，支持宿主机双版本同时无冲突运行。 |
| **backend** | `python:3.11-slim` (Django + DRF) | `8000` | **安全内部隔离（仅 expose）**：不对宿主机暴露 8000 端口，仅通过 Docker 网络内网互联。 |
| **db** | `pgvector/pgvector:pg18` (PostgreSQL) | `5432` | **安全内部隔离（仅 expose）**：不对宿主机暴露 5432 端口，数据持久化至数据卷 `pgdata`。 |
| **redis** | `redis:7-alpine` (可选 profile) | `6379` | **安全内部隔离（仅 expose）**：仅在内部容器网络暴露，供 Celery 任务调度与缓存。 |
| **worker** | `python:3.11-slim` (Celery Worker) | - | **后台任务执行**：与 backend 共享代码环境与内部通信。 |

> **宿主机 NGINX 双版本多站点“零冲突”规范**：
> - **独立配置文件**：执行 `./run.sh add_nginx` 时，向宿主机 `/opt/service/nginx/conf.d/mengya_docker_ssl.conf` 写入配置，绝不覆盖传统版的 `mengya_ssl.conf`。
> - **独立证书路径**：证书写入宿主机 `/opt/service/nginx/ssl/mengya_docker.crt`，互不覆盖。
> - **SNI 域名分流**：默认匹配域名为 `mengya-docker.local`，与传统版的 `mengya.local` 共享宿主机 443 端口，通过 TLS 握手 SNI 域名精准路由，实现真正的单 IP / 443 单入口多站点安全共存！

---


---

## 核心基础业务数据与开箱演示账户

本项目内置了全量精细化母婴核心基础数据包（已完成全面脱敏，不含任何真实用户隐私与私有密钥），存储于 pps/core/fixtures/initial_data.json（共 971 条标准数据对象）。

在容器首次拉起时，后端容器会自动装载该数据包入库。

1. **基础业务知识库（900+ 条）**：
   - **40 周孕育周历事件库**：204 条阶段科普、注意事项与产检关键期记录（TimelineEvent）。
   - **孕期产后营养食谱库**：288 道科学养胎、月子餐与辅食营养食谱（Recipe）。
   - **睡前胎教故事库**：245 篇精选温馨睡前胎教童话与故事（FetalStory）。
   - **儿科百科与护理知识库**：57 条权威育儿问答与常见病防治百科（KidsEncyclopedia）。
   - **母婴待产备用清单**：69 款必备用品分类清单（BabyShoppingItem）。
   - **精选母婴品牌库**：41 个严选品牌信息（BrandProfile）。
   - **母婴优选商品库**：63 款严选商品参数与评测（Product）。
   - **系统安全基线设置**：1 条标准安全设置（SystemSetting）。

2. **开箱即用脱敏演示账户**：
   - **超级管理员账号**：13800000000（或用户名 admin），默认初始密码 admin123，角色 admin。
   - **家庭演示用户账号**：13800138000，默认初始密码 user123，预设孕第 24 周示例宝宝「小萌芽」档案。

> ⚠️ **生产部署安全须知**：本地开发测试可使用上述默认密码与 .env.example 占位配置；若上线生产环境，请务必修改超级管理员密码，并在 .env 中重新生成独立的 DJANGO_SECRET_KEY 与 JWT_SECRET_KEY！

## 二、运行环境要求

- **操作系统**：Linux / macOS / Windows (WSL 2 或 Docker Desktop)
- **Docker 引擎**：Docker Engine 20.10 及以上
- **Docker Compose**：Docker Compose v2.0 及以上（支持 `docker compose` 插件或独立 `docker-compose`）

---

## 三、现代化解耦运维与管理脚本 (`./run.sh`)

`run.sh` 脚本全面遵循**单一职责与正交解耦原则**，移除了冗余函数，启动不再捆绑自动 build 或证书生成，并在启停入口增加了全自动垃圾与缓存清理：

```bash
# 1. 启动 Docker 容器服务（启动前自动执行 cleanup_cache 清理 .git 垃圾与 Python 缓存，纯粹执行 up -d）
./run.sh start

# 2. 查看各容器运行状态与健康指标
./run.sh status

# 3. 查看实时容器运行日志（支持指定服务）
./run.sh logs
./run.sh logs backend

# 4. 平滑重启容器服务（重启前自动清理垃圾与缓存）
./run.sh restart

# 5. 安全停止服务并释放容器网络资源
./run.sh stop

# 6. 手动重新构建容器镜像（仅在修改 Dockerfile 或依赖时显式调用）
./run.sh build

# 7. 向宿主机 /opt/service/nginx/conf.d 写入独立 SSL 反代配置（与传统版零冲突）
./run.sh add_nginx

# 8. 在 backend 容器中执行任意命令
./run.sh exec python manage.py showmigrations

# 9. 查看帮助信息
./run.sh help
```

服务启动完成后，访问地址：
- **宿主机直连访问**：[http://localhost:5174/](http://localhost:5174/)（已避开传统版 5173）
- **宿主机 Nginx 443 统一入口**：[https://mengya-docker.local/](https://mengya-docker.local/)（配置 hosts 并执行 `./run.sh add_nginx` 后即可访问）

---

## 四、容器环境变量配置 (`.env`)

系统启动时自动读取根目录下的 `.env` 文件，常用配置项如下：

```ini
# ===== 端口与域名配置 =====
FRONTEND_PORT=5174        # 前端宿主机暴露端口（默认 5174，避开传统版 5173）
EXTERNAL_PORT=443         # 外部 HTTPS 访问端口（开启 Nginx 时生效，默认 443）
HTTP_PORT=80              # 外部 HTTP 重定向端口（默认 80）
SERVER_NAME=mengya-docker.local # Nginx SNI 匹配域名（与传统版隔离）

# ===== 管理员凭据保障 =====
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_NICKNAME=管理员

# ===== 数据库配置（已内建容器网络别名 db:5432） =====
POSTGRES_DB=mengya
POSTGRES_USER=mengya
POSTGRES_PASSWORD=mengya123

# ===== 可选微服务控制 =====
ENABLE_WORKER=auto        # Celery 异步任务控制 (auto / 1 / 0)

# ===== AI 大模型配置（可选，未配置时自动降级为内置专业母婴知识库） =====
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=
```

---

## 五、目录结构

```text
mengya-docker/
├── apps/                     # Django 后端业务应用源码（含 core 等模块）
│   ├── core/
│   │   ├── migrations/       # 数据库迁移文件（已完整同步至 0021）
│   │   ├── models/           # 数据模型（含商品推荐购买链接、密保风控、细粒度权限）
│   │   ├── serializers/      # DRF 序列化器
│   │   ├── services/         # AI 助手服务与联网检索服务
│   │   ├── utils/            # 权限矩阵计算 (permissions.py)、渲染器、阶段推算
│   │   └── views.py          # 全量 API 视图控制器
├── config/                   # Django 与 Celery 项目主配置
├── frontend/                 # React + Vite 前端工程
│   ├── src/
│   │   ├── api/              # API 请求层（含认证、权限矩阵、AI连通性测试、商品评测等）
│   │   ├── components/       # 公共组件（含 SetStageModal 弹窗、ProductCard 双向反馈等）
│   │   ├── pages/            # 业务页面（用户管理、注册解耦、审计日志、AI配置等）
│   │   ├── layouts/          # 布局组件（含 31 项菜单动态权限过滤）
│   │   └── store/            # 全局状态管理（authStore 权限持久化）
│   ├── Dockerfile            # 前端容器构建定义
│   └── package.json          # Node 依赖配置
├── nginx/                    # Nginx SSL 反向代理模板
│   ├── mengya_ssl.conf       # 443 HTTPS SNI 虚拟主机与反代配置模板
│   ├── nginx.conf            # HTTP 基础反代配置
│   └── ssl/                  # SSL 证书存放目录
├── Dockerfile                # 后端 Django 容器构建定义（基于当前平铺代码上下文）
├── docker-compose.yml        # 多容器微服务编排定义（安全隔离模型）
├── .env                      # 容器环境变量
├── .env.example              # 环境变量配置模板
├── requirements.txt          # 后端 Python 依赖清单
├── Project_Survey_Document.md # 深度调研、架构评估与需求设计规范文档
├── README.md                 # 本说明文档
└── run.sh                    # 现代化解耦容器编排与管理脚本
```

---

## 六、维护与排错

1. **查看特定容器的日志**：
   ```bash
   ./run.sh logs backend
   ./run.sh logs db
   ```
2. **容器内部手工执行管理命令**：
   ```bash
   ./run.sh exec python manage.py showmigrations
   ```
3. **数据持久化位置**：
   数据库数据自动持久化于 Docker 命名数据卷 `pgdata`（对应 PG18+ `/var/lib/postgresql` 父目录挂载），更新容器不会丢失数据。

---

## 七、最新业务功能矩阵与版本演进记录

Docker 版现已与传统版最新功能（v1.13 ~ v1.17）实现 100% 深度同步：

1. **普通用户页面菜单与增删改查（CRUD）细粒度权限管控矩阵 (v1.15 ~ v1.16)**：
   - 全系统 **6 大核心模块、共 31 项细粒度权限项**（11 项页面菜单 + 20 项业务功能 CRUD 细粒度操作）。
   - **全局默认模板与用户专属配置解耦**：可在「用户管控中心」自由配置新用户默认模板，也可针对特定普通用户弹出专属 `UserPermissionModal` 单独设置。
   - **系统管理员最高特权绝对保底**：后端与前端双重硬编码保证管理员无条件具备所有 31 项最高权限，不可被关闭或禁用，接口层拦截任何禁用管理员权限的尝试。
2. **登录安全风控与密保超限熔断锁定 (v1.13 ~ v1.14, v1.16)**：
   - 新增找回密码输入密保最大尝试次数限制（`forgot_password_max_attempts`，默认 5 次），达到上限自动熔断锁定（返回 1012 状态码）并将账号物理冻结（`is_active=False`）。
   - 管理员端高亮展示「密保超限冻结」标签，提供一键「解冻 / 解锁」操作并自动清空失败计数器。
3. **商品库中心收藏全流程与双向反馈 (v1.13 ~ v1.15)**：
   - 支持对任意商品一键收藏/取消收藏，前端配备双向 Toast 实时反馈与防抖机制，路由切换及跨页焦点唤醒自动同步状态。
   - 收藏列表支持富商品卡片渲染（图片、品牌、分类、评分、价格、购买渠道），采用乐观更新机制即时平滑移除卡片。
   - 后端新增原子级收藏切换接口（`POST /api/favorites/toggle/`）与 HTTP 200 规范返回，消除 204 解析异常。
4. **商品购买渠道与 AI 一键评测 (v1.13)**：
   - 商品模型新增推荐购买链接（淘宝、京东、拼多多等），管理员可在后台单独配置。
   - 商品详情页新增「AI 一键深度评测」功能（`POST /api/products/{id}/ai-evaluate/`），支持价格分析、核心性能与安全（含 CCC 认证）、多平台比价与避坑指南。
5. **孕育阶段设置交互优化 (v1.13, v1.15)**：
   - 重构为交互式操作入口与弹窗（`SetStageModal`），支持怀孕中（预产期推算）与已出生（宝宝生日/档案录入）即时切换保存，全站阶段信息与导航栏徽章即时响应更新。
6. **AI 助手连通性测试与稳定性保障 (v1.13 ~ v1.15)**：
   - 新增 `POST /api/users/ai-config/test/` 连通性测试接口，前端卡片提供一键测试与毫秒级延迟测速。
   - DuckDuckGo 搜索线程守护化（严格超时退出），保证离线或网络故障时秒级降级至内置本地知识库，保证对话 100% 稳定响应。
   - 普通用户开放个人 AI 配置编辑，未配置时平滑继承管理员已配置的系统大模型。
7. **注册管理排版解耦与双模块独立化 (v1.14 ~ v1.15)**：
   - 彻底解耦为「注册模式控制」与「邀请链接管理」双独立卡片。
   - 邀请链接列表支持多选、全选、批量删除（带计数徽章）与一键清空。
8. **全站操作审计日志系统 (v1.13)**：
   - 覆盖认证安全、用户管控、孕育阶段变更、商品管理、收藏夹、健康医疗、待产清单管理、AI 问答评测等 48 项关键行为。
   - 配备指标概览统计卡片、8 大类色彩分类徽章、多维度筛选工具栏及日志详情完整弹窗。