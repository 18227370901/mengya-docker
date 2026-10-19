# 萌芽（Mengya）母婴全周期成长伴侣平台 (mengya-docker) - AI 协作与维护规范

本项目已全面实行**模块化文档分层治理**与**极简首页架构**。后续任何 AI 编程助手（包括 Codex、Cursor、Claude Code、Windsurf、Aider、Copilot、ChatGPT 等）在接手、维护、重构或升级本项目时，**必须严格遵循本规范**。

---

## 一、文档维护铁律（强制执行）

### 1. `README.md` 首页极简规范
- **篇幅上限**：严格控制在 150 ~ 180 行以内（约 6~10 KB）。
- **内容范围**：仅允许包含项目标题、核心徽章、产品定位、默认管理员账号与安全警示、微服务与单阶段镜像架构概览、快速启动指南（./run.sh）、系统架构概览树、文档导航索引及开源许可证。
- **严禁行为**：**严禁在 `README.md` 中追加任何版本的详细更新日志、版本升级公告、冗长命令或深层技术细节！**

### 2. 文档专属路由与分流规则
当产生新功能、Bug 修复、发布记录或架构改动时，请一律将信息写入 `docs/` 下的对应专属文档，绝对不得堆砌在根目录：
- 📜 **版本发布与全量更新日志** ➔ 一律追加至 `docs/CHANGELOG.md`
  - 新版本请按时间与版本号降序追加在最上方；
  - 必须记录版本号、发布日期、核心变更、修复缺陷及验证结果。
- 📐 **架构设计规范与重构决策记录** ➔ 一律追加至 `docs/Project_System_Design.md` 并同步更新 `docs/Project_System_Design.html`
  - 架构重构、重大设计决策请按序号递增记录新的 ADR 章节（如 10.36、10.37 等）。
- 🛠️ **本地开发与构建脚本** ➔ 一律收敛于 `tools/` 目录；系统启停与运维函数下沉至 `bin/` 模块库，严禁在根目录散落辅助脚本。

---

## 二、代码架构与文件分层规范

项目根目录保持高度整洁，仅保留核心启动入口、容器编排核心、标准工程描述与规范文件：
```text
mengya-docker/
├── manage.py                          # [核心] Django 主应用标准 CLI 调度入口
├── requirements.txt                   # [核心] Python 后端核心依赖清单
├── Dockerfile                         # [核心] 单阶段纯 Python 生产镜像定义 (零Node生产依赖)
├── docker-compose.yml                 # [核心] Docker Compose 基础微服务编排
├── docker-compose.db.yml              # [核心] 独立专属 PostgreSQL 容器编排扩展
├── docker-compose.sqlite.yml          # [核心] 本地 SQLite 存储编排扩展
├── wait_for_db.py                     # [核心] 数据库就绪等待探针 (严格保底根目录，保障容器稳固)
├── run.sh                             # [核心] Linux/macOS 容器全能运维管理脚本
├── README.md                          # [自述] 极简自述与快速导航（< 180 行）
├── AGENTS.md                          # [规范] 跨 AI 协作与维护指南（本文件）
├── .env.example                       # [配置] 环境变量初始化模板
├── .dockerignore                      # [规则] Docker 构建忽略清单
├── .gitignore                         # [规则] Git 忽略规则
│
├── docs/                              # 📁 [文档中心] 统一管理架构设计、HTML视图与发布日志
│   ├── Project_System_Design.md       # 系统架构设计规范 (PSD) 与重构权威决策
│   ├── Project_System_Design.html     # 架构设计离线 HTML 交互视图 (Mermaid 图表)
│   └── CHANGELOG.md                   # 全量版本演化与历史变更日志 (v1.13~v1.74+)
│
├── tools/                             # 📁 [工具中心] 归集非线上常驻的本地开发调试脚本
│   ├── build_frontend.py              # 前端一键构建与静态产物同步脚本 (Path两级回退)
│   └── check_admin_status.py          # 管理员账号状态与锁定诊断脚本 (sys.path动态注入)
│
├── apps/                              # 业务逻辑包 (Django Apps：core, models, views, services)
├── config/                            # Django 全局配置中心 (settings, urls, wsgi, asgi)
├── frontend/                          # React 18 + TS 前端源码工程 (Vite 5 构建)
├── bin/                               # run.sh 拆分后的运维子模块 (docker, db, env, nginx 等)
├── nginx/                             # Nginx 反代配置模版
├── static/                            # Django 生产静态产物合并目录
├── templates/                         # Django SPA 页面入口模板 (index.html)
└── data/                              # 生产数据挂载与运行时持久化缓存 (db.sqlite3 等)
```

---

## 三、开发与修改规范

1. **零业务破坏与容器稳定性原则**：
   - 严格维持**单阶段轻量 Python 镜像与一体化托管架构**，前端构建产物由开发机预先打包合并至 `templates/` 与 `static/`，生产容器内零 Node.js / npm 依赖；
   - 严禁随意移动根目录的 `wait_for_db.py`、`Dockerfile` 及 `docker-compose*.yml`，避免破坏容器依赖链。
2. **路径锚点深度自愈原则**：
   - `tools/` 目录下的辅助脚本引用根目录资源时，必须基于 `Path(__file__).resolve().parent.parent` 解析项目根目录；
   - 涉及 Django 运行环境的脚本必须在入口显式将项目根目录加入 `sys.path`，确保跨目录执行无损。
3. **零明文安全原则**：
   - 严禁将真实凭证（如 `.env`、生产数据库密码、第三方 API Key 等）提交进 Git。
   - 敏感信息与本地配置必须严格通过 `.gitignore` 与 `.dockerignore` 规则保护，绝不入库。
4. **验证闭环**：
   - 每次前端代码改动后，必须在开发机执行 `python tools/build_frontend.py` 验证编译与静态产物同步；
   - 每次容器编排调整后，必须执行 `./run.sh status` 或 `docker compose ps` 检验服务健康状态与端口监听。
