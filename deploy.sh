#!/bin/bash

# 定义变量
REPO_DIR="/www/wwwroot/kas-mint"
WWW_DIR="/www/wwwroot/kas-mint/www"
APP_NAME="kas-mint"
TS_CONFIG="tsconfig.json"

echo "开始检查代码更新..."

# 进入项目目录
cd "$REPO_DIR" || { echo "目录 $REPO_DIR 不存在"; exit 1; }

# 获取最新代码信息
git fetch origin main

# 检查是否有更新
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    echo "检测到代码更新，开始拉取并部署..."

    # 拉取代码
    git pull origin main || { echo "Git 拉取失败"; exit 1; }

    # 安装依赖
    echo "安装依赖..."
    npm install || { echo "依赖安装失败"; exit 1; }

    # 编译 TypeScript 项目
    echo "编译 TypeScript..."
    npx tsc -p "$TS_CONFIG" || { echo "TypeScript 编译失败"; exit 1; }

    # 复制 Library 文件夹到 dist
    if [ -d "src/Library" ]; then
        echo "复制 Library 文件夹到 dist..."
        cp -r src/Library dist/Library || { echo "Library 文件夹复制失败"; exit 1; }
    fi

    # 同步到生产目录
    echo "同步代码到生产目录..."
    rsync -a --delete "$REPO_DIR/" "$WWW_DIR/" || { echo "代码同步失败"; exit 1; }

    # 重启 PM2 应用
    echo "重启 PM2 应用..."
    pm2 restart "$APP_NAME" || { echo "PM2 重启失败"; exit 1; }

    echo "部署完成！"
else
    echo "没有检测到更新，无需操作。"
fi
