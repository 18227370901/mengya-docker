# -*- coding: utf-8 -*-
"""
萌芽（Mengya）母婴平台 - 本地前端一键构建与静态产物同步脚本

功能：
  1. 在本地开发环境自动执行前端编译 (npm run build)；
  2. 将编译产物 frontend/dist/index.html 同步至 templates/index.html；
  3. 将编译产物 frontend/dist/assets/* 同步至 static/assets/；
  4. 自动清理已过期的旧静态 Chunk 文件；
  5. 产物直接随代码提交 Git 仓库，实现云端服务器 git clone 即拉即跑（零 Node / 零 npm 依赖）。

用法：
  python build_frontend.py              # 执行构建与同步
  python build_frontend.py --install    # 强制重新安装 npm 依赖并构建
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / 'frontend'
TEMPLATES_DIR = ROOT_DIR / 'templates'
STATIC_DIR = ROOT_DIR / 'static'
STATIC_ASSETS_DIR = STATIC_DIR / 'assets'
DIST_DIR = FRONTEND_DIR / 'dist'


def run_command(cmd, cwd):
    print(f"==> 执行命令: {cmd}")
    res = subprocess.run(cmd, cwd=cwd, shell=True)
    if res.returncode != 0:
        print(f"[错误] 命令执行失败 (退出码: {res.returncode})", file=sys.stderr)
        sys.exit(res.returncode)


def main():
    print("=" * 60)
    print("  萌芽平台 - 本地前端编译与静态资产同步")
    print("=" * 60)

    if not FRONTEND_DIR.is_dir():
        print(f"[错误] 未找到前端源码目录: {FRONTEND_DIR}", file=sys.stderr)
        sys.exit(1)

    force_install = '--install' in sys.argv
    node_modules = FRONTEND_DIR / 'node_modules'

    if force_install or not node_modules.is_dir():
        print("==> 正在安装前端 npm 依赖 (npm install)...")
        run_command('npm install', cwd=FRONTEND_DIR)

    print("==> 正在编译前端生产版本 (npm run build)...")
    run_command('npm run build', cwd=FRONTEND_DIR)

    if not DIST_DIR.is_dir():
        print("[错误] 未找到构建输出目录 dist", file=sys.stderr)
        sys.exit(1)

    dist_index = DIST_DIR / 'index.html'
    dist_assets = DIST_DIR / 'assets'

    if not dist_index.is_file():
        print(f"[错误] 未找到构建出的 index.html: {dist_index}", file=sys.stderr)
        sys.exit(1)

    # 1. 同步 index.html -> templates/index.html
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    target_index = TEMPLATES_DIR / 'index.html'
    shutil.copy2(dist_index, target_index)
    print(f"  [OK] 同步模板: {target_index.relative_to(ROOT_DIR)} ({target_index.stat().st_size} bytes)")

    # 2. 清理并同步 static/assets
    STATIC_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    new_asset_files = set()
    if dist_assets.is_dir():
        for f in dist_assets.iterdir():
            if f.is_file():
                dest = STATIC_ASSETS_DIR / f.name
                shutil.copy2(f, dest)
                new_asset_files.add(f.name)
                print(f"  [OK] 同步静态资产: {dest.relative_to(ROOT_DIR)} ({dest.stat().st_size} bytes)")

    # 清理 static/assets 中不再存在的历史旧哈希文件（仅清理 index-* 文件）
    for old_f in STATIC_ASSETS_DIR.iterdir():
        if old_f.is_file() and old_f.name.startswith('index-') and old_f.name not in new_asset_files:
            print(f"  [清理] 移除历史旧版本资产: {old_f.name}")
            old_f.unlink()

    # 3. 同步 dist 根目录下的其他静态文件（如 favicon 等）至 static/
    for item in DIST_DIR.iterdir():
        if item.is_file() and item.name != 'index.html':
            target = STATIC_DIR / item.name
            shutil.copy2(item, target)
            print(f"  [OK] 同步辅助资源: {target.relative_to(ROOT_DIR)}")

    print("=" * 60)
    print("✅ 前端生产资源已全部就绪并同步完成！")
    print("提示：请执行 git add templates static && git commit 提交至仓库，即可在云端即拉即跑。")
    print("=" * 60)


if __name__ == '__main__':
    main()
