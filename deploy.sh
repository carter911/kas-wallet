#!/bin/bash
export HOME=/root

# 定义变量
REPO_DIR="./"
APP_NAME="kas-mint"
TS_CONFIG="tsconfig.json"
PORT=3000 # 应用监听的端口

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

# 检查输入的环境变量
if [ -z "$1" ]; then
    echo "请提供环境变量，例如 --env=development 或 --env=production"
    exit 1
fi

# 解析环境变量
ENVIRONMENT="${1#--env=}"
if [ -z "$ENVIRONMENT" ]; then
    echo "环境变量无效，请使用 --env=development 或 --env=production"
    exit 1
fi

echo "使用环境: $ENVIRONMENT"

# 根据环境设置分支名称
if [ "$ENVIRONMENT" == "production" ]; then
    BRANCH="main"
elif [ "$ENVIRONMENT" == "development" ]; then
    BRANCH="test"
else
    echo "未知环境: $ENVIRONMENT，请使用 production 或 development"
    exit 1
fi

echo "拉取的 Git 分支: $BRANCH"

# 进入项目目录
cd "$REPO_DIR" || { echo "目录 $REPO_DIR 不存在"; exit 1; }

# 获取最新代码信息
git fetch origin "$BRANCH" || { echo "Git fetch 失败"; exit 1; }

# 检查是否有更新
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/"$BRANCH")

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    echo "检测到代码更新，开始拉取并部署..."

    git stash || { echo "Git stash 失败"; exit 1; }
    git pull origin "$BRANCH" || { echo "Git 拉取失败"; exit 1; }

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

    # 检查 PM2 应用状态
    echo "检查 PM2 应用状态..."
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        echo "应用已存在，重启应用..."
        pm2 restart ecosystem.config.js --env "$ENVIRONMENT" || { echo "PM2 重启失败"; exit 1; }
    else
        echo "应用未运行，尝试启动应用..."
        pm2 start ecosystem.config.js --name "$APP_NAME" --env "$ENVIRONMENT" || { echo "PM2 启动失败"; exit 1; }
    fi
    echo "部署完成！"
else
    echo "没有检测到代码更新，检查应用是否运行..."
    if ! pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        echo "应用未运行，尝试启动应用..."
        pm2 start ecosystem.config.js --name "$APP_NAME" --env "$ENVIRONMENT" || { echo "PM2 启动失败"; exit 1; }
    else
        echo "应用正在运行，无需操作。"
    fi
fi

# 确保脚本可执行
chmod +x "$0"
