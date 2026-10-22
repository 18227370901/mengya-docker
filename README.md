# 萌芽（Mengya）母婴全周期成长伴侣平台 - 容器微服务编排版 (mengya-docker)

<p align="left">
  <img src="https://img.shields.io/badge/Python-3.12--slim-blue.svg" alt="Python Version">
  <img src="https://img.shields.io/badge/Docker-Compose%20v2-2496ED.svg" alt="Docker Compose">
  <img src="https://img.shields.io/badge/Django-4.2%20LTS-brightgreen.svg" alt="Django Version">
  <img src="https://img.shields.io/badge/Frontend-React%2018%20%7C%20TS%20%7C%20TailwindCSS-purple.svg" alt="Frontend">
  <img src="https://img.shields.io/badge/Database-PostgreSQL%2015%20%7C%20SQLite3-orange.svg" alt="Database">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

> **面向新一代母婴家庭的全生命周期（备孕、孕期、育儿）健康陪伴、知识百科、消费决策与智能顾问一体化服务平台**。专为云端生产服务器标准 Docker 容器化交付深度定制，支持单阶段纯 Python 极简镜像与开箱即用多数据库模式。
>
> 📌 **当前版本**：`v1.84` | 📖 **[查看全量版本演化与发布历史 (docs/CHANGELOG.md)](docs/CHANGELOG.md)**

<!-- 
  【AI 协作与维护规范 - 严禁违背】
  本项目严格遵循模块化文档分层治理架构（详见根目录 AGENTS.md）：
  1. 严禁在本 README.md 中追加版本更新公告、历史变更流水账或长篇技术细节！README.md 必须严格保持在 150-180 行以内的极简自述形态。
  2. 新版本发布与全量更新日志：请一律追加至 docs/CHANGELOG.md。
  3. 架构设计与重构决策记录：请一律追加至 docs/Project_System_Design.md 并同步更新 docs/Project_System_Design.html。
  4. 本地开发构建脚本一律收纳在 tools/ 目录下。
-->

---

## 🔑 默认管理员账号与安全凭据

容器初次启动后，系统将自动执行 `ensure_admin` 流程并初始化安全凭证：
- **登录账号**：`admin`
- **初始密码**：`admin123`
- **管理员昵称**：`管理员`
- **安全自定义**：支持在根目录 `.env` 文件中通过 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_NICKNAME` 自定义覆盖；系统内置单管理员生命周期保障，启动时自动清理历史残留管理员并保护普通用户数据完整。

---

## 🌟 核心业务架构与技术特性

1. 🐳 **容器微服务编排与单体一体化托管**
   - 前端 React SPA 生产产物由开发机预构建合并至 Django `templates/` 与 `static/` 目录；
   - Docker 生产镜像基于 `python:3.11-slim` 单阶段打造，**容器内零 Node.js / npm 依赖**，构建仅需 ~10 秒，彻底杜绝服务器 OOM；
   - 宿主机直接暴露 `FRONTEND_PORT`（默认 `5174`），直达 Django 一体化服务（单进程兼顾 Web 页面、静态资源与后端 API）。
2. 🗄️ **多数据库模式自适应与双版本物理隔离**
   - 深度支持 3 大部署模式：独立专属 PG 容器（默认 `postgres:15-alpine`）、共享已有宿主机 PG 实例、本地轻量单文件 SQLite（内置 WAL 高并发模式与 20s 锁等待）；
   - 传统版（默认 SQLite）与 Docker 版（默认独立 PG）同机共存时保持 **100% 数据物理硬隔离**，互不干扰。
3. 👶 **全生命周期健康与育儿陪伴**
   - 涵盖备孕、孕期 1~40 周胎儿发育、妈妈体重/BMI 监测、血压/血糖生命体征智能分析、幼儿生长曲线（WHO 标准）、产检与疫苗智能日历；
   - 结合大语言模型与 SearXNG / 公网多引擎容灾管线，提供智能育儿顾问、胎教故事及母婴商品多维对比雷达。

---

## 🚀 快速启动与运维管理

### 运行环境要求
- **操作系统**：Linux / macOS / Windows (WSL2 / Docker Desktop)
- **Docker 引擎**：Docker 20.10+ 与 Docker Compose v2.0+
- **本地二次开发**：仅在修改前端源码时需要 Node.js 18+（生产容器无需 Node）

### 常用运维命令 (`./run.sh`)

```bash
# 1. 启动容器服务 (启动前自动检查环境、就绪探针与 Nginx SSL 反代)
./run.sh start

# 2. 命令行直传参数自定义启动 (自动持久化至 .env)
./run.sh start -p 5176                         # 自定义宿主机暴露端口为 5176
./run.sh start -m sqlite                       # 显式切换为轻量 SQLite 模式启动

# 3. 查看容器集群运行状态与健康指标
./run.sh status

# 4. 查看容器实时运行日志
./run.sh logs backend                          # 跟踪后端服务日志
./run.sh logs -f                               # 跟踪全量容器日志

# 5. 平滑重启与彻底停止
./run.sh restart                               # 平滑重启容器集群
./run.sh stop                                  # 停止服务并释放网络

# 6. 数据备份与恢复 (跨大版本通用 JSON 格式)
./run.sh backup                                # 导出全量结构化业务数据
./run.sh restore -f backups/dump.json          # 导入恢复数据备份

# 7. 生成独立 Nginx SSL 反向代理配置
./run.sh add_nginx                             # 默认 SNI 配置
./run.sh add_nginx -d mengya-docker.local      # 自定义域名反代
```

> 服务启动后，打开浏览器访问：**[http://localhost:5174/](http://localhost:5174/)**（或自定义端口）

### 常用命令行自定义参数
| 选项 | 长参数 | 默认值 | 作用说明 |
| :--- | :--- | :--- | :--- |
| `-p` | `--port` | `5174` | 自定义宿主机访问端口（自动持久化写入 `.env`） |
| `-u` | `--admin` | `admin` | 自定义管理员账号（同步写入 `.env`） |
| `-P` | `--password` | `admin123` | 自定义管理员密码（同步写入 `.env`） |
| `-n` | `--nickname` | `管理员` | 自定义管理员前台展示昵称 |
| `-d` | `--domain` | `mengya-docker.local` | 自定义 Nginx 反代 SNI 域名 |
| `-m` | `--mode` | `dedicated` | 指定数据库模式（`dedicated` / `shared` / `sqlite`） |
| - | `--reconfig` | - | 重新唤起数据库部署模式交互向导 |
| `-y` | `--non-interactive` | - | 免交互自动化模式（适合自动化脚本/CI 环境） |

---

## 📂 系统文件架构概览

```text
mengya-docker/
├── manage.py                          # [核心] Django 主应用标准 CLI 调度入口
├── requirements.txt                   # [核心] 后端 Python 依赖清单
├── Dockerfile                         # [核心] 单阶段纯 Python 生产镜像定义 (零Node生产依赖)
├── docker-compose.yml                 # [核心] Docker Compose 基础微服务编排
├── docker-compose.db.yml              # [核心] 独立专属 PostgreSQL 容器编排扩展
├── docker-compose.sqlite.yml          # [核心] 本地 SQLite 存储编排扩展
├── wait_for_db.py                     # [核心] 数据库就绪等待探针 (严格保底根目录，保障容器稳固)
├── run.sh                             # [核心] Linux/macOS 容器全能运维管理脚本
├── README.md                          # [自述] 极简自述与快速导航（< 180 行）
├── AGENTS.md                          # [规范] 跨 AI 协作与维护指南
├── .env.example                       # [配置] 环境变量初始化模板
├── .dockerignore                      # [规则] Docker 构建忽略清单
├── .gitignore                         # [规则] Git 忽略规则
│
├── docs/                              # 📁 [文档中心] 统一管理架构设计、HTML视图与发布日志
│   ├── Project_System_Design.md       # 系统架构设计规范 (PSD) 与重构权威决策
│   ├── Project_System_Design.html     # 架构设计离线 HTML 交互视图 (Mermaid 图表)
│   └── CHANGELOG.md                   # 全量版本演化与历史变更日志 (v1.13~v1.84+)
│
├── tools/                             # 📁 [工具中心] 归集非线上常驻的本地开发调试脚本
│   ├── build_frontend.py              # 前端一键构建与静态产物同步脚本 (Path两级回退)
│   └── check_admin_status.py          # 管理员账号状态与锁定诊断脚本 (sys.path动态注入)
│
├── apps/                              # 业务应用包 (Django Apps：core, models, views, services)
├── config/                            # Django 全局配置中心 (settings, urls, wsgi, asgi)
├── frontend/                          # React 18 + TS 前端源码工程 (Vite 5 构建)
├── bin/                               # 运维子模块 (docker, db, env, nginx 等)
├── nginx/                             # Nginx 反代配置模版
├── static/                            # Django 生产静态产物合并目录
├── templates/                         # Django SPA 页面入口模板 (index.html)
└── data/                              # 生产数据挂载与运行时持久化缓存
```

---

## 📚 详细文档导航

深入了解系统架构决策、全版本演化或容器运维深度定制，请参阅 `docs/` 目录下的专有文档：

- 📐 **[PSD 架构设计与重构决策文档 (docs/Project_System_Design.md)](docs/Project_System_Design.md)**：包含系统全景技术栈审计、三大数据库部署模式自适应与 6 种物理隔离矩阵、前后台完整设计规格及 ADR-01~36 全部重构决策（另备有含完整图表的 [HTML 交互版](docs/Project_System_Design.html)）；
- 📜 **[全量版本演化与更新日志 (docs/CHANGELOG.md)](docs/CHANGELOG.md)**：记录自 v1.13 至 v1.84 全部迭代历史、缺陷修复与详细技术升级公告；
- 🤖 **[AI 协作与跨工具维护规范 (AGENTS.md)](AGENTS.md)**：约束 Codex、Cursor、Claude Code、Windsurf 等各类 AI 工具严守极简自述与文档分流铁律。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源许可协议发布。
