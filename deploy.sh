#!/bin/bash
export HOME=/root

# 定义变量
REPO_DIR="./"
APP_NAME="kas-mint"
TS_CONFIG="tsconfig.json"
PORT=3000 # 应用监听的端口

echo "开始检查代码更新..."

# 检查端口是否被占用的函数
check_port() {
    echo "检查端口 $PORT 是否被占用..."
    if lsof -i:$PORT > /dev/null 2>&1; then
        echo "端口 $PORT 被占用，尝试释放..."
        PID=$(lsof -t -i:$PORT)
        if [ -n "$PID" ]; then
            echo "杀死占用端口的进程 PID: $PID"
            kill -9 "$PID" || { echo "无法终止进程 $PID"; exit 1; }
        fi
    else
        echo "端口 $PORT 未被占用。"
    fi
}

# 进入项目目录
cd "$REPO_DIR" || { echo "目录 $REPO_DIR 不存在"; exit 1; }

# 获取最新代码信息
git fetch origin main

# 检查是否有更新
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    echo "检测到代码更新，开始拉取并部署..."

    git stash
    # 拉取代码
    git pull origin main || { echo "Git 拉取失败"; exit 1; }

    # 复制 Library 文件夹到 dist
    if [ -d "src/Library" ]; then
        echo "复制 Library 文件夹到 dist..."
        cp -r src/Library dist/Library || { echo "Library 文件夹复制失败"; exit 1; }
    fi

    # 安装依赖
    echo "安装依赖..."
    npm install || { echo "依赖安装失败"; exit 1; }

    # 编译 TypeScript 项目
    echo "编译 TypeScript..."
    npx tsc -p "$TS_CONFIG" || { echo "TypeScript 编译失败"; exit 1; }


    # 检查 PM2 应用是否已存在
    echo "检查 PM2 应用状态..."
    if pm2 list | grep -q "$APP_NAME"; then
        echo "应用已存在，重启应用..."
        pm2 restart "$APP_NAME" || { echo "PM2 重启失败"; exit 1; }
    else
        echo "应用未运行，尝试启动应用..."
        pm2 start ecosystem.config.js --env production || { echo "PM2 启动失败"; exit 1; }
    fi

    echo "部署完成！"
else
    echo "没有检测到更新，无需操作。"
fi

chmod +x deploy.sh
