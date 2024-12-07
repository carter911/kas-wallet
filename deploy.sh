#!/bin/bash
export HOME=/root

# 定义变量
REPO_DIR="./"
APP_NAME="kas-mint"
TS_CONFIG="tsconfig.json"
PORT=3000 # 应用监听的端口

# 输出日志函数
log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $*"
}

# 检查端口是否被占用的函数
check_port() {
    log "检查端口 $PORT 是否被占用..."
    if lsof -i:$PORT > /dev/null 2>&1; then
        log "端口 $PORT 被占用，尝试释放..."
        PID=$(lsof -t -i:$PORT)
        if [ -n "$PID" ]; then
            log "杀死占用端口的进程 PID: $PID"
            kill -9 "$PID" || { log "无法终止进程 $PID"; exit 1; }
        fi
    else
        log "端口 $PORT 未被占用。"
    fi
}

# 解析输入参数
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --env=*) ENVIRONMENT="${1#--env=}" ;;
        *) log "未知参数 $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$ENVIRONMENT" ]; then
    log "请提供环境变量，例如 --env=development 或 --env=production"
    exit 1
fi

log "使用环境: $ENVIRONMENT"

# 进入项目目录
cd "$REPO_DIR" || { log "目录 $REPO_DIR 不存在"; exit 1; }

# 获取最新代码信息
git fetch origin main || { log "Git fetch 失败"; exit 1; }

# 检查是否有更新
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    log "检测到代码更新，开始拉取并部署..."

    if ! git diff --quiet; then
        git stash || { log "Git stash 失败"; exit 1; }
    fi

    git pull origin main || { log "Git 拉取失败"; exit 1; }

    # 复制 Library 文件夹到 dist
    if [ -d "src/Library" ]; then
        log "复制 Library 文件夹到 dist..."
        cp -r src/Library dist/Library || { log "Library 文件夹复制失败"; exit 1; }
    fi

    # 安装依赖
    log "安装依赖..."
    npm install || { log "依赖安装失败"; exit 1; }

    # 编译 TypeScript 项目
    log "编译 TypeScript..."
    npx tsc -p "$TS_CONFIG" || { log "TypeScript 编译失败"; exit 1; }

    # 检查 PM2 应用状态
    log "检查 PM2 应用状态..."
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        log "应用已存在，重启应用..."
        pm2 restart "$APP_NAME" --env "$ENVIRONMENT" || { log "PM2 重启失败"; exit 1; }
    else
        log "应用未运行，尝试启动应用..."
        pm2 start ecosystem.config.js --name "$APP_NAME" --env "$ENVIRONMENT" || { log "PM2 启动失败"; exit 1; }
    fi
    log "部署完成！"
else
    log "没有检测到代码更新，检查应用是否运行..."
    if ! pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        log "应用未运行，尝试启动应用..."
        pm2 start ecosystem.config.js --name "$APP_NAME" --env "$ENVIRONMENT" || { log "PM2 启动失败"; exit 1; }
    else
        log "应用正在运行，无需操作。"
    fi
fi

# 确保脚本可执行
chmod +x "$0"
