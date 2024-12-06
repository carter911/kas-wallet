#!/bin/bash

# 定义变量
NODE_VERSION="20.11.1"
APP_NAME="kas-mint"  # 替换为你的应用名称
APP_DIR="/var/www/$APP_NAME"  # 替换为你的应用路径
CONFIG_FILE="ecosystem.config.js"  # PM2 配置文件路径
BRANCH="main"  # Git 分支名

# 更新系统并安装依赖
echo "更新系统并安装必要依赖..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential

# 安装 Node.js 指定版本
echo "安装 Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g n

# 使用 n 安装指定版本 Node.js
sudo n $NODE_VERSION

# 验证 Node.js 和 npm 版本
echo "验证安装的 Node.js 和 npm 版本..."
node -v
npm -v

# 安装 PM2
echo "安装 PM2..."
sudo npm install -g pm2

# 设置 PM2 开机自启
echo "配置 PM2 开机自启..."
pm2 startup systemd -u $USER --hp $HOME

# 检查并创建应用目录
if [ ! -d "$APP_DIR" ]; then
  echo "创建应用目录 $APP_DIR..."
  sudo mkdir -p "$APP_DIR"
  sudo chown -R $USER:$USER "$APP_DIR"
fi

# 进入应用目录
cd "$APP_DIR" || { echo "应用目录不存在！"; exit 1; }
chmod +x deploy.sh
# 获取或更新代码
if [ -d ".git" ]; then
  echo "更新代码..."
  git reset --hard
  git pull origin "$BRANCH"
else
  echo "拉取代码..."
  git clone --branch "$BRANCH" https://github.com/carter911/kas-wallet "$APP_DIR"
fi

# 安装应用依赖
echo "安装应用依赖..."
npm run install
echo "编译安装..."
npm run build
# 检查 PM2 配置文件
if [ ! -f "$CONFIG_FILE" ]; then
  echo "PM2 配置文件 $CONFIG_FILE 不存在！请检查后重新运行脚本。"
  exit 1
fi


if [ -d "src/Library" ]; then
    echo "复制 Library 文件夹到 dist..."
    cp -r src/Library dist/Library || { echo "Library 文件夹复制失败"; exit 1; }
fi

echo "使用 PM2 启动或重启应用..."
pm2 start "$CONFIG_FILE" --env production

# 保存 PM2 配置
echo "保存 PM2 配置..."
pm2 save

# 检查 PM2 应用状态
echo "当前 PM2 应用状态："
pm2 list

pm2
echo "脚本执行完毕！应用已启动并由 PM2 管理。"

