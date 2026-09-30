# 萌芽（Mengya）母婴全周期成长伴侣平台 - 容器微服务编排版 (mengya-docker)

> **GitHub 仓库地址**：[https://github.com/18227370901/mengya-docker.git](https://github.com/18227370901/mengya-docker.git)
> **兄弟项目**：[https://github.com/18227370901/mengya-traditional.git](https://github.com/18227370901/mengya-traditional.git)


本项目为萌芽（Mengya）母婴全周期平台的**Docker 容器化生产与演练部署工程（mengya-docker）**。采用 Docker Compose 微服务架构，提供 PostgreSQL、Redis、Celery、Django 后端、Vite 前端及宿主机 Nginx SSL 独立反代等全栈能力。

---

## 一、单体一体化微服务架构模型与双版本共存隔离设计

| 容器服务 | 基础镜像 / 技术栈 | 内部端口 | 宿主机暴露策略与隔离设计（与传统版零冲突） |
| :--- | :--- | :--- | :--- |
| **backend** | `python:3.11-slim` (Django + DRF + React 前端一体化托管，Gunicorn 调度) | `8000` | **宿主机映射端口为 `5174`**：本地一键预构建前端静态产物（服务端免 Node.js/npm 编译依赖），`Dockerfile` 极致精简为单阶段纯 Python 生产镜像；采用 Gunicorn 1 Worker + 4 Threads (gthread) 调度，内存低至 ~60-88MB，CPU 待机 0.00%~0.04%，内存上限动态自适应宿主机真实物理内存（如 2C2G 服务器显示为 1.922GiB，与同机服务无缝对齐）。 |
| **db** | `pgvector/pgvector:pg18` (PostgreSQL) | `5432` | **安全内部隔离（仅 expose）**：不对宿主机暴露 5432 端口，数据持久化至数据卷 `pgdata`；深度裁剪内核缓冲（shared_buffers=24MB、work_mem=1MB），常驻内存稳定在 25~35MB。 |
| **redis** | `redis:7-alpine` (可选 profile) | `6379` | **安全内部隔离（仅 expose）**：仅在内部容器网络暴露，供 Celery 任务调度与缓存。 |
| **worker** | `python:3.11-slim` (Celery Worker) | - | **后台任务执行**：与 backend 共享代码环境与内部通信。 |

> **宿主机 NGINX 双版本多站点“零冲突”规范**：
> - **独立配置文件**：执行 `./run.sh add_nginx` 时，向宿主机 `/opt/service/nginx/conf.d/mengya_docker_ssl.conf` 写入配置，绝不覆盖传统版的 `mengya_ssl.conf`。
> - **独立证书路径**：默认使用当前项目根目录下的 `ssl/` 目录（自动创建），独立存放 `mengya_docker.crt` 与 `mengya_docker.key`，互不覆盖。
> - **SNI 域名分流**：默认匹配域名为 `mengya-docker.local`，与传统版的 `mengya.local` 共享宿主机 443 端口，通过 TLS 握手 SNI 域名精准路由，实现真正的单 IP / 443 单入口多站点安全共存！

---


### 极致低资源性能优化与云端免依赖极速部署特性

为彻底解决在小内存云服务器（如 1G/2G 实例）上运行时出现的 **CPU 虚高（50%+）与内存占用膨胀（300MB~400MB+）** 问题，本项目在 `mengya-docker-optimize` 分支实施了极致的轻量化重构：

1. **CPU 待机彻底归零 (0.00% ~ 0.04%)**：
   - 彻底废除 `manage.py runserver` 开发服务器，引入生产级 **Gunicorn**（1 Worker + 4 Threads `gthread` 多线程模型）；
   - 杜绝了 `StatReloader` 对挂载目录的毫秒级高频扫描空转，空闲时 CPU 使用率稳定在 **0.00% ~ 0.04%**；
   - 启用 `--max-requests 1000` 循环回收机制，定期平滑重建 Worker，防止长期运行产生内存碎片。

2. **核心内存开销缩减 70%+ (~60-88MB 后端 + ~30MB 数据库)**：
   - **AI SDK 惰性延迟加载**：改造 `ai_service.py`，启动时不再静态急切导入 `openai` 及底层庞大依赖，仅在用户触发 AI 提问时按需加载，冷启动立减 **44.6MB** 内存；
   - **底层内存分配器收敛**：容器注入 `ENV MALLOC_ARENA_MAX=2`，抑制 glibc 堆无限分裂；开启 `PYTHONOPTIMIZE=1` 编译优化并在启动后执行 `gc.freeze()` 冻结常驻对象；
   - **零拷贝静态分发**：集成 `whitenoise>=6.6.0`，由 Python 进程在内核空间直接高效派发前端单页产物，无需独立前端或反代容器；
   - **数据库内核调优**：将 PostgreSQL 18 内核缓冲微调为 `shared_buffers=24MB`、`work_mem=1MB`、`max_connections=20`，常驻内存由 100MB+ 压降至 **25~35MB**。

3. **本地预构建与云端免 Node 即拉即跑 (Zero Node Overhead)**：
   - 提供跨平台一键预构建脚本 `python build_frontend.py`，在本地开发机执行编译，将构建产物（`templates/index.html` 及 `static/assets/`）纳入 Git 仓库管理；
   - `Dockerfile` 改造为单阶段 `python:3.11-slim` 纯净镜像，容器内彻底剔除 Node.js、npm 工具链；
   - 云服务器拉取代码后直接 `docker compose up -d`，镜像构建仅需 **10 秒以内**，免除小内存服务器反复编译 Vite 导致的 CPU 飙满或 OOM 崩溃。

4. **宿主机物理内存自适应规格 (Self-Adaptive Host Limit)**：
   - 彻底移除 `docker-compose.yml` 中静态硬编码的 `mem_limit: 100m` / `80m`；
   - 容器自动透明继承宿主机物理内存上限（2C2G 服务器在 `docker stats` 中显示 `MEM USAGE / LIMIT: 88.57MiB / 1.922GiB`，`MEM %` 约 4.5%）；
   - 既消除短时并发流量下被系统 OOM Killer 误杀的隐患，又与同机其他微服务（如 tradingview-worker、pgvector-18）的监控指标完全对齐。

5. **全量业务功能与契约 100% 守恒**：
   - 19 个数据模型、50 个接口视图、27 项权限代码、971 条基础脱敏知识库种子数据、全站黑夜/白天模式双主题无缝切换等所有业务能力 100% 完整无损。

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

### 脚本组件化架构与 bin/ 模块化分层治理 (v1.41 重构)
为解决单脚本体积过大、逻辑杂糅、不易审计维护的问题，系统对运维脚本实施了**高内聚低耦合的组件化重构**：`run.sh` 仅保留基础生命周期启停调度与命令分发，将所有底层支撑能力下沉至 `bin/` 专属模块库中，由主入口动态加载：

```text
mengya-docker/
├── run.sh                  # 主运维入口（基础启停流程、参数解析、子命令分发，轻量清爽）
└── bin/                    # 模块化独立函数库
    ├── env.sh              # 基础环境、.env 读写同步、绝对路径规范、域名规约、端口冲突预检、垃圾清理
    ├── docker.sh           # Docker/Compose 进程探测、多 compose 文件动态装载、镜像构建、实时日志与容器 exec
    ├── db.sh               # 硬件资源感知(RAM/PG容器/镜像)、3大数据库部署向导、本地镜像复用、共享PG建库、数据备份恢复
    ├── nginx.sh            # SAN 多域名证书签发、Nginx 反代配置写入、带时间戳备份与防误覆盖锁定标记
    └── data.sh             # 种子数据与全量样例初始化 (init_data)
```
- **模块动态加载与缺失自愈防护**：`run.sh` 在初始化阶段遍历装载 `bin/*.sh`，具备强健的缺失预警守卫，缺失组件即时给出精准诊断并退出，杜绝运行期半吊死状态；
- **全生命周期无损兼容**：保留全部现存功能、命令行选项（如 `-p`, `-u`, `-P`, `-m`, `--shared-pg`, `--reconfig`, `-y` 等）与免交互执行特性。


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
| `-m` | `--mode`, `--db-mode` | `dedicated` / `sqlite` | 显式指定数据库部署模式（`sqlite` / `shared` / `dedicated`，免交互） |
| - | `--shared-pg` | `pgvector-18` | 指定共享 PostgreSQL 容器名称（共享模式下自动建库与账号） |
| - | `--reconfig` | - | 重新唤起数据库部署模式交互式向导（覆盖 `.env` 记忆） |
| `-y` | `--non-interactive` | - | 全自动免交互模式（自动根据硬件推荐并写入 `.env`，适合脚本/CI） |

### Nginx 反代路径智能绝对化与多域名 SAN 支持
- **权威域名以 `SERVER_NAME` 为准**：通过 `-d / --domain` 自定义 SNI 域名，完整生效至 Nginx 配置中；自动提取首个域名为主域名用于证书 CN，并自动遍历所有域名写入 OpenSSL SAN 扩展列表，多域名访问全兼容。
- **证书路径默认本地化与自动创建**：默认使用当前项目根目录下的 `ssl/` 目录（未显式配置 `NGINX_CERT_DIR` 时自动在当前项目下创建并使用 `ssl` 目录）；无论在 `.env` 或脚本中配置相对路径还是绝对路径，脚本在初始化时均自动规范化为物理绝对路径并自动创建目录，彻底杜绝 Nginx 因相对路径寻找证书失败或外部目录依赖而崩溃。



### Nginx 配置防误触、免打扰锁定与自动安全快照备份机制 (v1.26 新增)
针对生产环境中 Nginx 配置文件经常被运维人员二次调优定制的特点，`run.sh` 实现了三级网关配置资产安全防护体系：
1. **策略 1（子命令差异化交互防护）**：仅在运维人员显式调用 `./run.sh add_nginx` 且旧配置已存在时，主动暂停并交互提示 `是否需要更新 Nginx 配置文件内容？(y/N): `，由运维人员明确确认；在日常 `./run.sh start` 与 `restart` 主自动化流程中保持非阻塞执行，保障 CI/CD 顺畅。
2. **策略 2（自动安全快照备份）**：在对任何已有非空配置文件执行更新前，系统自动生成带精确时间戳的安全快照副本（如 `mengya_docker_ssl.conf.bak_20260923143000`），即使误操作也能一秒无损回滚。
3. **策略 3（免打扰标记锁定与引导高亮）**：无论配置文件是否存在，脚本执行时均主动打印高亮提示指引。高阶运维人员只需在配置文件首行保留或添加 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE`，后续启动脚本将永久识别该标记并跳过覆盖，实现“既能自动化自愈，又能保护高级定制”的终极平衡。

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
├── build_frontend.py         # 本地一键前端静态资产编译与模板自动同步脚本
├── Dockerfile                # 单阶段纯 Python 生产镜像（本地预编译静态资产+Django/Gunicorn全栈托管，服务端零Node依赖）
├── docker-compose.yml        # 微服务编排定义（精简为 db + backend 双核心容器，自适应宿主机内存）
├── .env                      # 容器环境变量
├── .env.example              # 环境变量配置模板
├── requirements.txt          # 后端 Python 依赖清单（已引入 gthread、whitenoise）
├── Project_System_Design.md  # 萌芽平台系统架构设计与重构决策文档 (PSD v2.2)
├── Project_System_Design.html # PSD 架构设计文档的高保真可交互渲染版
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
14. **传统版与 Docker 版双版本多站点无冲突共存与反代 502 彻底根除 (v1.20)**：
   - 彻底修复历史旧反代配置指向 8000 端口导致的登录 `502 Bad Gateway`，全站统一由 Docker 映射至宿主机的端口 `5174` 进行一体化全托管反代；
   - 修复 SSL 证书生成与空占位问题，证书缺失或 0 字节时自动补全有效自签名证书，避免 Nginx 语法检查崩溃；
   - 增强 Nginx 自动化运维：自动扫描遗留 8000 端口配置隐患，自动执行 `nginx -t && nginx -s reload` 平滑更新；
   - 完善与传统部署版本的“零冲突”共存规范，通过 SNI 域名（`mengya-docker.local` vs `mengya.local`）共享宿主机 443 入口，数据库与本地端口完全物理隔离。

15. **双版本同终端启动隔离与单一管理员安全加固 (v1.21)**：
   - 解决同一终端环境下启动两套服务时，Docker 版继承传统版 `FRONTEND_PORT=5173` 导致宿主机端口冲突的问题，Docker 版默认智能重置锁定为 `5174`；
   - 启动前增加宿主机端口冲突预检（`check_port_conflict`），若端口被传统版本或其他服务占用提前拦截并告警；
   - 传统版本 `stop_all` 精确锁定自身进程，严格排除 Docker 容器内部进程，杜绝停止/重启传统版误杀 Docker 容器；
   - 增加 `mengya_backend` 容器健康探活检测（12秒探测窗口），容器异常退出时自动拉取详细诊断日志；
   - 核查确认系统种子包及数据迁移中零硬编码内置用户，`ensure_admin` 增加原子事务与唯一性约束自愈，配置自定义管理员（如 `admin_yy`）时自动清退历史旧管理员，严格保证系统唯一管理员，绝不出现双管理员共存；
   - 普通真实注册用户白名单绝对保护机制持续生效；
   - `.env` 变量持久化追加自动检测补全换行符，Nginx 证书与配置自动化生成增加目录写权限防呆保护。

16. **多 SNI 域名全量访问入口自适应展示与 .env 语法安全自愈 (v1.22)**：
   - 彻底解决配置多个 SNI 域名时控制台仅输出第一个主域名的局限，新增 `print_access_urls` 智能格式化函数；
   - 单域名紧凑展示，多域名层级展示主入口与所有附加入口链接清单，消除“唯一入口”歧义并适配端口；
   - 覆盖容器启动（`start`）、状态查看（`status`）及 Nginx 配置下发（`add_nginx`）；
   - `update_env_var` 持久化包含空格的多域名时自动包裹双引号，并在 `.env` 载入前增加正则语法自愈，杜绝 `command not found` 崩溃。

17. **登录安全风控与找回密码阈值模块：新增管理员登录无操作超时配置 (v1.23 / v1.33)**：
   - 在「用户与权限管控中心 - 用户账号管理 - 登录安全风控与找回密码阈值配置」面板中新增「管理员登录无操作超时（分钟）」配置项；
   - 支持 0~1440 分钟自由配置及 15分(严格)/30分(推荐)/60分(1小时)/0(禁用) 快捷胶囊设置，配置变更即时写入数据库 SystemSetting 并全量记录安全审计日志；
   - 前端集成跨标签页协同与节流的自动化空闲监测引擎，在管理员会话持续无有效操作时自动注销并安全重定向至登录页，给出高亮友好告警提示；
   - 传统版本与 Docker 版本全栈同步（模型、数据迁移 0025、视图、前端静态资源构建与审计）。

18. **胎教故事大文件解耦与双路径自愈静态资源架构保障 (v1.24)**：
   - 彻底优化 Git 仓库资产结构，解耦 32.32 MB 重复静态图片提交，以 `frontend/public/` 为单一真相源；
   - Django `config/urls.py` 升级双路径智能回退服务（`serve_fetal_story`），优先读 `static/`、缺失自动回退 `frontend/public/`，杜绝 404 破图；
   - `run.sh` 启动与构建阶段增加宿主机静态产物自愈同步，杜绝 Docker Compose volume `./static:/app/static` 遮蔽容器内编译产物；
   - 前端代理对齐与故事封面组件优雅容错兜底。

19. **Docker 构建残留层安全自动清理与防膨胀机制 (v1.25)**：
   - 在 `run.sh` 脚本生命周期中深度集成 `cleanup_docker_build_cache`，覆盖 `start`（启动前及带 `-b` 构建后）、`stop`（停服清理）、`restart`（全阶段）与 `build`（构建后）；
   - 严格遵循最小破坏性安全原则，仅清理无标签虚悬镜像（`docker image prune -f`）与未引用的废弃构建缓存层（`docker builder prune -f || docker buildx prune -f`），100% 杜绝磁盘无限制膨胀，且绝对不影响当前正在运行的容器及宿主机上其他项目的有标签镜像；
   - 新增 `--no-cache` CLI 启动/构建参数，支持无缓存强制全量编译镜像；
   - 新增 `./run.sh clean`（别名 `./run.sh prune`）独立运维命令，支持一键安全清理构建残留、虚悬镜像与冗余垃圾，并自动输出 `docker system df` 磁盘占用概况。

20. **Nginx 反代配置智能差分比对与静默自愈引擎 (方案 B) (v1.26)**：
   - 彻底升级 `run.sh#gen_nginx_config` 生成与覆盖逻辑：在内存中预生成目标配置并与现有磁盘配置比对（自动忽略时间戳注释差异）；
   - 配置完全一致时静默保留现有文件，零多余快照备份，日常 `start` / `restart` 启动流程零打扰；
   - 仅在检测到端口、域名等关键参数发生变动时触发自动安全快照备份与自愈同步，杜绝端口漂移导致的 502 Bad Gateway 故障；
   - 针对 `./run.sh add_nginx` 专属运维命令，在配置有变动时提供交互式确认机制；首行 `# MANAGED_BY_ADMIN_DO_NOT_OVERWRITE` 免打扰标记具备最高优先级，坚决保障用户深度定制规则；
   - 容器版本与宿主机独立命名配置（`mengya_docker_ssl.conf`）保持隔离，安全通过 SNI 域名（`mengya-docker.local`）共享 443 端口。

21. **多 SNI 域名全量自适应展示与多分隔符语法清洗 (v1.26)**：
   - 新增纯 Bash 零依赖 `normalize_domains` 函数，自动兼容逗号、分号、多空格及引号混配语法，自动去除协议头与多余斜杠并精准去重；
   - 单域名场景保持简洁单行展示，多域名场景层级展示主入口与全部附加入口链接清单，自动适配非标准外部端口。

22. **全站黑夜/白天模式（Dark/Light Mode）双主题无缝切换系统上线 (v1.37)**：
    - **双主题架构落地**：基于 Tailwind CSS `darkMode: 'class'` 与 Zustand 统一状态管理（`useThemeStore`），支持白天明亮与夜间护眼双套风格；
    - **首屏防闪烁（FOUT 消除）机制**：在 `index.html` 注入首屏防闪烁脚本，彻底消除刷新或冷启动时的白屏视觉跳变；
    - **三维触达入口**：全局主导航顶栏（`MainLayout`）Sun/Moon 按钮、独立登录/注册页右上角悬浮按钮、个人中心（`ProfilePage`）“界面外观”设置卡片；
    - **表单输入框全量深度适配**：覆盖全站 22 个文件、138+ 处输入控件，提供全局深色兜底与聚焦高光反馈；
    - **ECharts 图表动态自适应**：多维商品雷达图与生长曲线图随主题切换自适应调色，确保全站风格高度协调统一。

23. **极致低资源性能优化、本地免依赖打包与宿主机内存自适应架构 (v1.38)**：
    - **CPU 待机彻底归零 (0.00% ~ 0.04%)**：引入生产级 Gunicorn 调度矩阵（1 Worker + 4 Threads `gthread` 线程模型，`--max-requests 1000` 循环回收机制），彻底替代原 `manage.py runserver` 的 `StatReloader` 目录高频轮询，根除单核 50%+ CPU 空转与双进程常驻冗余；
    - **后端与数据库内存极致瘦身 (节省 70%+)**：
      - `apps/core/services/ai_service.py` 改造为 SDK 惰性延迟加载 (`_client()`)，冷启动节省 44.6MB 重型依赖加载内存；
      - 容器集成 `MALLOC_ARENA_MAX=2` 限制 glibc 堆碎片、`PYTHONOPTIMIZE=1`、`config/wsgi.py` 启动完成后执行 `gc.freeze()`，并由 `whitenoise>=6.6.0` 在内核空间实现高效零拷贝静态资源分发；
      - 数据库容器裁剪 PostgreSQL 18 内核缓冲（`shared_buffers=24MB`, `work_mem=1MB`, `max_connections=20`），常驻内存由 100MB+ 压降至 25~35MB；
      - 优化后全栈常驻总内存仅需 90MB~125MB，彻底告别 300MB~400MB+ 的资源压力，完美契合 1G/2G 小内存云服务器；
    - **本地一键预打包与单阶段极速镜像**：
      - 新增跨平台一键脚本 `python build_frontend.py`，在本地环境一键编译前端并自动同步至 `templates/index.html` 与 `static/assets/` 纳入 Git 版本受控；
      - `Dockerfile` 改造为单阶段 `python:3.11-slim` 纯净镜像，容器内彻底剔除 Node.js、npm 工具链；
      - 云服务器拉取代码后直接 `docker compose up -d` 即可在 10 秒内极速构建完成，无需在每台服务器重复耗时耗资源编译，彻底规避 Vite 编译引发的 OOM 宕机；
    - **宿主机物理内存自适应规格 (Self-Adaptive Host Limit)**：
      - 彻底移除 `docker-compose.yml` 中写死的静态 `mem_limit: 100m` / `80m`，容器自动透明继承宿主机物理内存上限（2C2G 服务器在 `docker stats` 中显示 `MEM USAGE / LIMIT: 88.57MiB / 1.922GiB`，`MEM %` 约 4.5%）；
      - 既消除短时并发流量下被系统 OOM Killer 误杀的隐患，又与同机其他服务（如 tradingview-worker、pgvector-18）的监控指标完美对齐；
    - **业务功能 100% 守恒与零减损验证**：
      - 19 个业务数据模型与 50 个 RESTful API 视图契约 100% 保持不变；
      - 971 条核心母婴业务种子数据无缝自动初始化装载；
      - 单端口（5174 映射 8000）全栈一体化、全站黑夜/白天模式昼夜双主题无缝切换等业务能力全量保持。

---

## 八、多数据库部署模式自适应架构与双版本物理隔离规范 (v1.40)

为满足超低配置服务器（≤1.5GB RAM）防 OOM、多应用共用 PG 容器降本增效，以及开发测试环境极简单文件运行等多样化场景，系统实现了**多数据库部署模式自适应架构与智能决策向导**：

### 1. 三大数据库部署模式深度支持
| 部署模式 | 标识 (`DB_MODE`) | 架构特征 | 适用场景与资源消耗 |
| :--- | :--- | :--- | :--- |
| **SQLite 本地化单文件** | `sqlite` | 挂载宿主机本地 `./data/db.sqlite3`，由一体化后端直接读写，**零额外 PG 容器** | 超低配服务器（≤1.5G 内存），整站常驻仅约 **50~60MB** 内存，物理防 OOM |
| **共享已有 PostgreSQL 实例** | `shared` | 共用宿主机已在运行的 PG 容器（如 `pgvector-18`），通过容器内管理接口自动幂等创建当前应用专属库（`mengya`）与专属账号（`mengya`），**零多余容器** | 宿主机已有 PG 运行，最大化复用已有基础设施，节省 **80MB+** 重复容器开销 |
| **独立专属 PostgreSQL 容器** | `dedicated` | 专属容器 `${APP_NAME:-mengya}-pg`，容器内端口隔离，应用 80MB 内核微服务精简调优，**严格复用本地镜像** | 资源充裕环境，独享完整 PG 实例，数据完全专有 |

### 2. 本地镜像就地严格复用机制（严禁联网重复下载）
- **本地镜像智能扫描链**：启动探针依次扫描：① 宿主机正在运行的 PG 容器镜像；② 本地 `pgvector/pgvector:pg18`；③ 本地 `postgres:15-alpine` 等轻量镜像；④ 本地任何包含 `postgres` 或 `pgvector` 的有效镜像；
- **锁定 Pull 策略**：只要本地存在可用 PG 镜像，系统坚决将拉取策略锁定为 `pull_policy: never`，从 Docker 引擎层面彻底杜绝重复下载与无用虚悬层产生。

### 3. 基于硬件配置的智能推荐引擎
- 探测到宿主机已有运行中的 PostgreSQL 容器 $\rightarrow$ 优先推荐 **[2] 共享已有 PG 实例**（零冗余）；
- 宿主机物理内存 $\le 1.5\text{GB}$ $\rightarrow$ 优先推荐 **[1] SQLite 本地化单文件**（保活防 OOM）；
- 宿主机物理内存 $> 1.5\text{GB}$ 且无共享容器 $\rightarrow$ 推荐 **[3] 独立专属 PostgreSQL 容器**；
- 交互终端提供 30 秒超时自动兜底，超时自动采用推荐模式，绝不产生长久挂起。

### 4. 定时任务 / Cron / 重启全静默免交互保护机制
- **重启与运维命令天然免交互**：执行 `./run.sh restart`、`stop`、`status`、`logs` 等命令时，系统天然跳过向导交互，直接沿用已有配置；
- **配置持久化记忆**：首发部署交互完成后，配置自动持久化写入 `.env` 中的 `DB_MODE`、`COMPOSE_FILE` 等变量，后续启动直接读取；
- **无 TTY / 定时任务自愈**：在 Cron、Systemd、CI/CD 等非交互环境（`[ ! -t 0 ]` 或 `-y`）中，向导自动根据硬件推荐自愈选择并持久化，彻底杜绝进程因 `read` 挂起；
- **显式重配入口**：若后续需变更模式，只需追加 `--reconfig` 参数（如 `./run.sh start --reconfig`），即可随时唤醒全流程向导。

### 5. 双版本数据库存储物理隔离规范
为确保 Docker 容器版与传统本地版双版本并存时不发生数据污染，架构制定了严格的物理隔离标准：
- **容器专属隔离**：Docker 版即使选用 shared 模式，数据库名默认为 `mengya`；传统版本则使用独立库名 `mengya_local`，账号完全隔离；
- **传统版默认本地 SQLite**：传统版（`mengya-local`）默认严格锁定本地 `mengya-local/db.sqlite3`，两套系统各自维护独立的用户体系、AI 配置与业务数据，互不干扰，互不读写。

为确保 Docker 容器版与传统本地版双版本并存时不发生数据污染，架构制定了严格的物理隔离标准：

1. **容器化专属数据存储**：
   - Docker 版采用专属容器 `mengya_db`（PostgreSQL 18 + pgvector），数据独立持久化在 Docker 命名卷 `pgdata`（挂载于 `/var/lib/postgresql`）；
   - 容器内 5432 端口仅使用 `expose` 在 Docker Compose 隔离网桥内部通信，**绝不对宿主机开放端口**，彻底阻断宿主机或其他外部应用误连。
2. **与传统本地版（SQLite）物理隔离**：
   - 传统本地版（`mengya-local`）默认仅读写宿主机本地文件 `mengya-local/db.sqlite3`；
   - 两套系统各自维护独立的用户体系、AI 配置与业务数据，互不干扰，互不读写。

### v1.42 (2026-09-29) - 孕育阶段全域自适应协同与胎教故事智能定位
1. **胎教故事页面阶段自适应自动跳转**：
   - 全面订阅 `useAuthStore` 全局阶段状态，与孕期周历、孕期食谱对齐；
   - 用户配置孕期阶段后进入胎教故事页面，系统自动识别并定位至用户当前孕周（17~40周），即时加载对应故事列表；
2. **医学常识与业务边界智能平滑处理**：
   - 契合胎儿听觉自孕 17 周起发育的医学特征，若孕早期（1~16周）用户进入页面，智能推荐并吸附至第 17 周故事，并展示科普温情提示胶囊条；
   - 孕期超 40 周自动截断至第 40 周；未配置阶段或非孕期用户保持优雅降级；
3. **多态视觉标识与一键回跳体验**：
   - 月份与周数选择按钮中，对用户真实孕周展示独立强调环（`bg-brand-100 text-brand-700 ring-2 ring-brand-400`），无论用户浏览何周均可一眼定位自身进度；
   - 按周模式下提供「返回我的孕周 (第X周)」快捷按钮与「当前孕周」状态标签；
   - 提示条、指示器、故事卡片与详情弹窗全量适配白天/黑夜（Dark Mode）色彩模式。

### 6. .env 环境变量持久化与数据库存储方式重新选择操作说明 (v1.43)

#### 6.1 能否直接删除或清空 .env 文件？
- **结论**：**不建议直接删除或清空 `.env` 文件！**
- **深度原因**：
  `.env` 文件是全系统的持久化配置核心，不仅存储数据库模式 (`DB_MODE`)，还锁定了系统通信安全密钥 (`SECRET_KEY`)、自定义访问端口 (`FRONTEND_PORT`)、超级管理员账号与初始密码 (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) 以及 SNI 域名 (`SERVER_NAME`) 等关键状态。
  若直接删除或清空 `.env`，虽然下次启动确实会触发数据库模式选择，但会导致系统密钥与自定义端口被全量重置，造成历史会话失效、端口冲突或账密被重置。

#### 6.2 重新选择数据库模式的 3 大标准方式
1. **方式一：命令行原生重配入口（强烈推荐，安全且零副作用）**
   - **交互式向导重新选择**：
     ```bash
     ./run.sh reconfig
     # 或
     ./run.sh start --reconfig
     ```
     *原理*：强制唤醒硬件感知探针与交互选择菜单，重新选择 SQLite / 共享 PG / 独立 PG 模式，同时完整保留 `.env` 中的端口、密钥与业务参数。
   - **单行命令显式切模（免去交互）**：
     ```bash
     ./run.sh start -m sqlite       # 切换为 SQLite 本地单文件模式
     ./run.sh start -m shared       # 切换为共享宿主机已有 PG 模式
     ./run.sh start -m dedicated    # 切换为独立专属 PG 容器模式
     ```
     *原理*：直接以命令行指定目标模式启动，底层自动更新并持久化至 `.env`。

2. **方式二：精准修改或剔除 .env 中的 DB_MODE 变量**
   - 直接编辑 `.env` 文件，将 `DB_MODE=...` 改为目标值（例如 `DB_MODE=shared`）；
   - 或者仅删除/注释掉 `DB_MODE` 这一行（例如 `# DB_MODE=...`）。下次执行 `./run.sh start` 时，脚本感知到未配置模式，将自动重新弹出交互式选择向导，其他变量不受任何影响。

3. **方式三：直接删除/清空 .env 文件的影响**
   - 若执行了 `rm -f .env` 或清空 `.env`，下次执行 `./run.sh start` 时，系统会自动从 `.env.example` 重新全量初始化环境并唤醒选择向导。请仅在需要彻底重置项目环境时使用此方式。

#### 6.3 帮助模块与说明函数 (show_db_reconfig_guide)
- 在 `bin/db.sh` 中封装了专用的说明函数 `show_db_reconfig_guide()`；
- 在执行 `./run.sh help`、`./run.sh -h` 或直接运行 `./run.sh` 时，系统在输出基础命令帮助的同时，会自动调用该说明函数，以高亮框完整展示重新选择操作说明与参数用法，方便初次使用的用户随时查阅。

### 7. PostgreSQL 镜像动态探针感知与零硬编码复用规范 (v1.44)

#### 7.1 镜像决策与复用三级阶梯
1. **用户自定义显式指定（最高优先级）**：
   - 允许通过命令行 `./run.sh start --db-image <IMAGE>` 或在 `.env` 中配置 `DB_IMAGE` 自由指定所需 PG 版本（如 `postgres:15-alpine`, `postgres:16`, `pgvector/pgvector:pg18` 等）；
   - **绝对遵从**：若本地已存在该镜像直接就地复用（`pull_policy: never`）；若本地尚未下载则启动时精准下载该指定版本（`pull_policy: if_not_present`），严禁被本地其他旧镜像覆盖篡改。
2. **宿主机已有镜像优先就地复用（未显式指定时）**：
   - 自动扫描宿主机正在运行的 PG 容器镜像；
   - 扫描本地已有镜像列表（支持各类官方 Alpine 与 PostgreSQL 镜像），直接就地复用匹配镜像，杜绝不必要的网络拉取。
3. **内置默认轻量镜像兜底（本地无任何 PG 镜像时）**：
   - 宿主机本地彻底没有任何可用 PG 镜像时，才自动下载内置轻量成熟镜像（`postgres:15-alpine`，整站镜像仅约 80MB，常驻内存仅 ~25MB），避免盲目下载体积庞大的专用向量镜像。

#### 7.2 共享 PG 模式（shared）零硬编码
- 彻底剔除历史兜底的 `pgvector-18` 硬编码容器名；
- 优先支持用户通过 `--shared-pg <容器名>` 或 `SHARED_PG_CONTAINER` 显式指定；
- 未指定时自动扫描宿主机运行中 PG 容器；若宿主机未检测到可用 PG 容器，给出清晰诊断并自动平滑降级为独立 PG / SQLite 模式，杜绝进程因盲连不存在容器而崩溃。

### 8. 数据库全参连接信息自定义与 --reconfig 交互向导修复规范 (v1.45)

#### 8.1 --reconfig 交互式向导唤起机制
- **直接执行重配**：支持运行 `./run.sh --reconfig` 或 `./run.sh reconfig`，无需前置启动命令，直接唤起硬件感知与部署模式交互菜单；
- **启动/重启时重配**：支持 `./run.sh start --reconfig` 与 `./run.sh restart --reconfig`，在启动或重启前完成数据库模式切换；
- **定时任务免交互保障**：定时任务执行 `./run.sh restart` 或传入 `-y` 时，天然保持零交互静默执行，绝不挂起进程。

#### 8.2 数据库连接全参数自定义支持（自动持久化至 .env）
系统支持在命令行直接传递数据库详细连接参数，既有默认值，又支持自定义覆盖：
| 命令行选项 | 对应环境变量 | 默认值（Docker版） | 说明 |
| :--- | :--- | :--- | :--- |
| `--db-user <USER>` | `POSTGRES_USER` | `mengya` | 自定义 PostgreSQL 用户名 |
| `--db-pass <PASS>` | `POSTGRES_PASSWORD` | `mengya123` | 自定义 PostgreSQL 连接密码 |
| `--db-name <DB>` | `POSTGRES_DB` | `mengya` | 自定义 PostgreSQL 数据库/实例名 |
| `--db-port <PORT>` | `POSTGRES_PORT` | `5432` | 自定义 PostgreSQL 连接端口 |
| `--db-host <HOST>` | `POSTGRES_HOST` | `db` (或宿主机共享容器名) | 自定义 PostgreSQL 访问主机 |
| `--database-url <URL>` | `DATABASE_URL` | 自动标准拼装 | 直接指定完整连接串，优先采用 |

示例：
```bash
# 自定义账号密码与端口启动
./run.sh start -m dedicated --db-user admin_db --db-pass MyPass123 --db-name mengya_prod --db-port 5432

# 直接指定完整连接串启动
./run.sh start --database-url "postgresql://mengya:mengya123@db:5432/mengya"
```

### 9. run.sh 脚本模块化拆分与自定义变量独立模块规范 (v1.46)

#### 9.1 微内核调度器架构
- **极致精简**：`run.sh` 彻底剥离业务实现细节，行数缩减 80%，专注作为微内核加载 `bin/` 下各个独立组件；
- **模块清晰解耦**：
  - `bin/env.sh`：基础环境检测、路径解析与安全写入；
  - `bin/config.sh`：**自定义变量模块**，收拢端口、管理员账密、域名、数据库全参等默认值声明、命令行解析、校验与 `.env` 持久化；
  - `bin/db.sh`：数据库多模式智能决策、探针感知、无感镜像复用与备份恢复；
  - `bin/docker.sh`：Docker 完整生命周期管理（start, stop, restart, status, logs, build, clean, exec）；
  - `bin/nginx.sh`：SSL 证书与宿主机 SNI 反代配置生成；
  - `bin/data.sh`：种子数据校验与补齐全量初始化；
  - `bin/help.sh`：命令行帮助文档与实用示例输出。

#### 9.2 常用自定义变量配置示例（自动持久化到 .env）
```bash
# 自定义访问端口与管理员账密
./run.sh start -p 5174 -u myadmin -P AdminPass123

# 自定义数据库连接与实例名
./run.sh start -m dedicated --db-user custom_user --db-pass CustomPass456 --db-name mengya_prod
```
