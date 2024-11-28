#!/bin/bash

# 变量定义
APP_NAME="kas-mint"
TS_CONFIG="tsconfig.json"
BUILD_DIR="dist"
ENTRY_FILE="dist/app.js"
NODE_ENV="production"

# 确保脚本失败时停止执行
set -e

echo "开始部署 TypeScript + Express 项目..."

# 安装依赖
echo "安装依赖..."
npm install

# 编译 TypeScript
echo "编译 TypeScript 项目..."
npx tsc -p $TS_CONFIG

# 检查编译是否成功
if [ ! -d "$BUILD_DIR" ]; then
  echo "编译失败：找不到 $BUILD_DIR 目录。"
  exit 1
fi

# 使用 PM2 启动应用
echo "启动 PM2 管理服务..."
pm2 start $ENTRY_FILE --name $APP_NAME --env $NODE_ENV

# 保存当前的 PM2 配置
echo "保存 PM2 运行状态..."
pm2 save

# 确保 PM2 在系统重启时自启动
echo "设置 PM2 为自启动..."
pm2 startup

echo "部署完成！应用 $APP_NAME 已在 PM2 中运行。"
