# 萌芽（Mengya）母婴全周期成长伴侣平台 - 容器微服务编排版 (mengya-docker)

> **GitHub 仓库地址**：[https://github.com/18227370901/mengya-docker.git](https://github.com/18227370901/mengya-docker.git)
> **兄弟项目**：[https://github.com/18227370901/mengya-traditional.git](https://github.com/18227370901/mengya-traditional.git)


本项目为萌芽（Mengya）母婴全周期平台的**Docker 容器化生产与演练部署工程（mengya-docker）**。采用 Docker Compose 微服务架构，提供 PostgreSQL、Redis、Celery、Django 后端、Vite 前端及宿主机 Nginx SSL 独立反代等全栈能力。

---

## 一、单体一体化微服务架构模型与双版本共存隔离设计

| 容器服务 | 基础镜像 / 技术栈 | 内部端口 | 宿主机暴露策略与隔离设计（与传统版零冲突） |
| :--- | :--- | :--- | :--- |
| **backend** | `python:3.11-slim` (Django + DRF + React 前端一体化托管) | `8000` | **宿主机映射端口为 `5174`**：通过 Docker 多阶段构建将前端打包产物合并至后端，彻底移除 Node 与 Nginx 容器，避开传统版 `5173`，支持宿主机双版本同时无冲突运行。 |
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

本项目内置了全量精细化母婴核心基础数据包（已完成全面脱敏，不含任何真实用户隐私与私有密钥），存储于 apps/core/fixtures/initial_data.json（共 971 条标准数据对象）。

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

2. **纯净权限与自定义管理员账户规范**：
   - **超级管理员账号**：默认管理员用户名为 `admin`（初始密码 `admin123`），支持在首次启动时通过命令行参数自定义（例如 `./run.sh start -u 您的管理员手机号 -P 您的密码`），启动后自动安全持久化至 `.env`，彻底消除固定默认密码的安全隐患。
   - **零预置多余账户与安全隐私保障**：系统不再预置或自愈生成任何硬编码密码的演示账户（历史 `13800138000` / `13800000000` 等已彻底物理清退），所有普通用户均通过前台自主注册产生，保障生产与个人部署的绝对纯净与凭证安全。

> ⚠️ **生产部署安全须知**：本地开发测试可使用上述默认密码与 .env.example 占位配置；若上线生产环境，请务必修改超级管理员密码，并在 .env 中重新生成独立的 DJANGO_SECRET_KEY 与 JWT_SECRET_KEY！

## 二、运行环境要求

- **操作系统**：Linux / macOS / Windows (WSL 2 或 Docker Desktop)
- **Docker 引擎**：Docker Engine 20.10 及以上
- **Docker Compose**：Docker Compose v2.0 及以上（支持 `docker compose` 插件或独立 `docker-compose`）

---

## 三、现代化解耦运维与管理脚本 (`./run.sh` / `sh run.sh`)

`run.sh` 脚本全面遵循**单一职责与正交解耦原则**，移除了冗余函数，启动不再捆绑自动 build 或证书生成，并在启停入口增加了全自动垃圾与缓存清理，同时支持**全量命令行参数自定义**（自动双向持久化至 `.env`）：

```bash
# 1. 启动 Docker 容器服务（启动前自动清理垃圾与缓存，自动检查并安全配置 SSL 证书与 Nginx 反代，随后执行 up -d）
./run.sh start

# 2. 命令行直传参数自定义启动（自动同步更新至 .env）
./run.sh start -p 8080                         # 自定义宿主机前端映射端口为 8080
./run.sh start -p 5200 -u superadmin -P Pass123 # 自定义端口与超级管理员账密启动
./run.sh restart -p 5300                       # 重启容器并变更为 5300 端口

# 3. 查看各容器运行状态与健康指标
./run.sh status

# 4. 查看实时容器运行日志（支持指定服务）
./run.sh logs
./run.sh logs backend

# 5. 平滑重启容器服务（重启前自动清理垃圾与缓存）
./run.sh restart

# 6. 检查并补充初始化全量样例数据（食谱/胎教故事/周历/百科/清单/商品/品牌）
./run.sh init_data

# 7. 导出数据库数据备份（跨版本/跨引擎通用结构化 JSON，支持 SQLite / PG15 / PG18 无缝流转）
./run.sh db_backup                          # 默认生成 mengya_data_backup_YYYYMMDD_HHMMSS.json
./run.sh db_backup my_data.json             # 自定义备份文件名

# 8. 导入恢复数据库数据备份（支持 .json 结构化数据或 .sql 原生转储）
./run.sh db_restore my_data.json

# 9. 强制重新构建并启动容器（修改 Dockerfile 或前端/后端依赖时）
./run.sh start -b                            # 或 ./run.sh start --build

# 10. 指定特定数据库镜像启动（自动持久化写入 .env）
./run.sh start --db-image pgvector/pgvector:pg18

# 11. 安全停止服务并释放容器网络资源（自动清理孤儿容器）
./run.sh stop

# 12. 手动重新构建容器镜像
./run.sh build

# 8. 向宿主机 /opt/service/nginx/conf.d 写入独立 SSL 反代配置（与传统版零冲突）
./run.sh add_nginx
./run.sh add_nginx -d mengya.myhost.com        # 自定义 SNI 域名反代配置

# 9. 在 backend 容器中执行任意命令
./run.sh exec python manage.py showmigrations

# 10. 查看完整帮助信息与选项
./run.sh help
```

### 常用命令行自定义参数选项
| 选项 | 长参数 | 默认值 | 作用说明 |
|---|---|---|---|
| `-p` | `--port` | `5174` | 自定义前端映射至宿主机的访问端口（自动持久化写入 `.env` 的 `FRONTEND_PORT`） |
| `-u` | `--admin` | `admin` | 自定义超级管理员账号/手机号（自动持久化写入 `.env` 的 `ADMIN_USERNAME` 与 `ADMIN_PHONE`） |
| `-P` | `--password` | `admin123` | 自定义超级管理员登录密码（自动持久化写入 `.env` 的 `ADMIN_PASSWORD`） |
| `-n` | `--nickname` | `管理员` | 自定义超级管理员前台展示称谓（自动持久化写入 `.env` 的 `ADMIN_NICKNAME`） |
| `-d` | `--domain` | `mengya-docker.local` | 自定义 Nginx 反代 SNI 域名（自动持久化写入 `.env` 的 `SERVER_NAME`） |
| `-b` | `--build` | - | 启动时强制重新构建容器镜像（等价于 `docker compose up -d --build`） |
| - | `--db-image` | `pgvector/pgvector:pg18` | 指定数据库镜像版本（自动持久化写入 `.env` 的 `DB_IMAGE`） |

### Nginx 反代路径智能绝对化与多域名 SAN 支持
- **权威域名以 `SERVER_NAME` 为准**：通过 `-d / --domain` 自定义 SNI 域名，完整生效至 Nginx 配置中；自动提取首个域名为主域名用于证书 CN，并自动遍历所有域名写入 OpenSSL SAN 扩展列表，多域名访问全兼容。
- **证书路径智能自动绝对化**：无论在 `.env` 或脚本中配置 `NGINX_CERT_DIR="./nginx/ssl"` 相对路径还是 `/opt/service/nginx/ssl` 绝对路径，脚本在生成配置时均自动基于项目目录规范化为物理绝对路径，彻底杜绝 Nginx 因相对路径寻找证书失败而崩溃。



### 数据库镜像自动探测复用与跨版本数据平滑迁移同步

**1. 镜像就地复用与拉取策略优化**：
- **服务器已有镜像优先复用**：`run.sh` 启动前自动执行 `choose_db_image` 探测本地镜像。若服务器已存在 `pgvector/pgvector:pg18`，自动将其设置为目标镜像，并将 Compose 拉取策略锁定为 `DB_PULL_POLICY="never"`，从底层彻底杜绝 Docker 连网请求 Docker Hub 导致重复拉取或产生虚悬层。
- **历史镜像向下兼容**：若本地仅有 `postgres:15-alpine`，系统自动优先复用并适配旧版数据卷。

**2. 跨大版本（如 PG15 ↔ PG18）数据迁移与同步方案**：
PostgreSQL 跨大版本时，磁盘底层物理文件格式互不兼容；且 PostgreSQL 18+ 镜像强制要求将数据卷挂载至父目录 `/var/lib/postgresql`（PG15 为 `/var/lib/postgresql/data`）。系统通过 `DB_DATA_DIR` 环境变量实现挂载目录自动适配。

若需要在不同 PostgreSQL 大版本之间切换并**保留历史业务数据**，请遵循以下平滑迁移流程：
```bash
# 第一步：启动原数据库镜像（以 PG15 为例）
DB_IMAGE=postgres:15-alpine ./run.sh start

# 第二步：导出业务数据备份（基于 Django ORM 逻辑结构导出，跨大版本与跨数据库引擎完全通用）
./run.sh db_backup migration_data.json

# 第三步：停止服务并彻底释放旧版本数据卷
docker compose down -v

# 第四步：切换至新数据库镜像并启动（系统将基于新版本数据格式全新初始化）
./run.sh start --db-image pgvector/pgvector:pg18

# 第五步：将备份数据平滑恢复导入至新数据库中
./run.sh db_restore migration_data.json
```
> 💡 **全新环境说明**：若是全新部署或测试环境无需保留旧数据，直接执行 `docker compose down -v` 清空旧数据卷后执行 `./run.sh start`，系统将自动完成数据迁移并初始化 971 条全量脱敏样例数据与超级管理员。

**3. 前端一体化静态资源穿透与白屏防护**：
- `docker-compose.yml` 中 `backend` 与 `worker` 服务实时挂载宿主机 `./templates:/app/templates` 与 `./static:/app/static`。
- 保证宿主机更新的前端打包产物（`index.html`、`assets/`、`fetal-stories/`）以物理卷直通后端容器，杜绝因镜像构建缓存缺失静态文件引发的 HTTP 404 与前端空白页。

### 容器编排规范与环境自愈加固
- **Compose Spec 现代标准**：完全移除 `docker-compose.yml` 中过时的 `version: "3.9"` 声明，符合 Compose Specification 最新标准，杜绝 `the attribute 'version' is obsolete` 弃用告警。
- **环境配置自动愈合**：`run.sh` 启动前检测若无 `.env` 文件，自动从 `.env.example` 模版克隆初始化；`docker-compose.yml` 中声明 `path: .env, required: false`，彻底根除 `env file .env not found` 导致的容器启动失败异常。

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
├── templates/                # 一体化前端模板（index.html 生产产物）
├── static/                   # 一体化前端静态资源（assets、fetal-stories 等）
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
├── Dockerfile                # 多阶段构建一体化生产镜像（前端编译+Django全栈托管，零Node零Nginx）
├── docker-compose.yml        # 微服务编排定义（精简为 db + backend 双核心容器）
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
9. **Docker 数据库镜像复用与跨大版本平滑数据迁移同步 (v1.17)**：
   - 自动探测复用服务器已有 `pgvector/pgvector:pg18` 镜像，支持 `pull_policy: never` 彻底摆脱外部网络依赖。
   - 内置跨大版本/跨引擎通用数据备份恢复指令（`./run.sh db_backup` / `db_restore`），保证历史数据平滑过渡。
   - 补齐宿主机模板与静态资源目录双向挂载，彻底根除因镜像复用导致的前端空白与静态文件 404 问题。
10. **用户登录「记住登录 / 下次免输账密」全平台功能支持 (v1.17)**：
   - 登录页新增「记住登录（下次免输账密）」复选框，安全加密保存登录凭据。
   - 勾选后成功登录，再次访问或退出登录返回时自动预填账号密码，支持免输账密一键直登；主动取消勾选即时彻底清除本地凭据。
   - 与 JWT Token 独立解耦，兼顾便捷性与安全性；Docker 容器版与传统本地部署版双向同步落地。
11. **宝宝资料与孕育阶段自由流转更新修复 (v1.17)**：
   - 彻底修复用户设置宝宝已出生后，再次切换为怀孕中或更新档案时数据无法保存生效的问题。
   - 前端采用显式 `null` 清理历史日期并增加弹窗唤起响应式监听；后端增加双向状态互斥清洗守卫，确保数据库脏数据物理清空。
   - 阶段推算算法重构，以 `is_pregnant` 为核心驱动，实现孕期周数与宝宝月龄无缝双向自由切换。
12. **全站接口安全闭环与未出生宝宝档案阶段同步 (v1.18)**：
   - 彻底关闭 Django 原生 Admin 后台与 Swagger/OpenAPI 路径暴露，访问 `/admin/login/` 统一 302 重定向至统一登录页；
   - 前端新增 `AdminGuard` 双层拦截守卫，非管理员及未认证用户无法进入管理后台页面；
   - 「我的」页面宝宝档案新增支持「未出生 / 怀孕中（预产期）」模式，支持胎名、预估性别与预产期录入，且支持宝宝出生后一键编辑“转正”；
   - 宝宝档案与首页、个人中心的孕育阶段实现全栈双向自动同步，更新档案即时刷新首页时光轴推荐与阶段看板。
13. **预置演示账户彻底清理与零泄露安全收敛 (v1.19)**：
   - 彻底移除 `init_data` 中 `13800138000`（`demo_user`）自愈生成逻辑，启动时自动物理清理历史预置演示账号与测试宝宝档案；
   - 基础种子数据包（`initial_data.json`）全面深度脱敏，剔除硬编码用户记录，全量 968 条母婴核心业务知识库与特定用户完全解耦；
   - 超级管理员全面收敛为单点自定义模式（通过 `-u` 或 `.env` 声明），物理清退历史 `13800000000` 占位符账号，邀请链接自动安全继承；
   - 真实正常注册普通用户受白名单硬编码保护，绝不作任何删除或变更，达成纯净安全的生产部署基线。
