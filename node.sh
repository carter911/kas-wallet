#!/bin/bash

# 检查是否以 root 用户身份运行
if [ "$(id -u)" -ne 0 ]; then
  echo "请以 root 用户或使用 sudo 运行此脚本。"
  exit 1
fi

# 更新系统包索引
echo "正在更新系统包索引..."
sudo apt update

# 安装常规依赖
echo "正在安装常规依赖..."
sudo apt install -y curl git build-essential libssl-dev pkg-config

# 安装 Protobuf（gRPC 所需）
echo "正在安装 Protobuf..."
sudo apt install -y protobuf-compiler libprotobuf-dev

# 安装 clang 工具链（RocksDB 和 WASM secp256k1 编译所需）
echo "正在安装 clang 工具链..."
sudo apt-get install -y clang-format clang-tidy \
clang-tools clang clangd libc++-dev \
libc++1 libc++abi-dev libc++abi1 \
libclang-dev libclang1 liblldb-dev \
libllvm-ocaml-dev libomp-dev libomp5 \
lld lldb llvm-dev llvm-runtime \
llvm python3-clang

# 安装 Rust 编译器
echo "正在安装 Rust 编译器..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# 克隆 rusty-kaspa 仓库
echo "正在克隆 rusty-kaspa 仓库..."
git clone https://github.com/kaspanet/rusty-kaspa.git
cd rusty-kaspa

# 编译 rusty-kaspa
echo "正在编译 rusty-kaspa..."
cargo build --release

# 提示用户完成安装
echo "安装完成。您可以通过以下命令运行 rusty-kaspa："
echo "./target/release/rusty-kaspa"

# 创建 systemd 服务文件
echo "正在创建 systemd 服务文件..."
SERVICE_FILE="/etc/systemd/system/kaspad.service"

sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=Kaspad p2p Node (mainnet)
After=network.target

[Service]
User=$USER
WorkingDirectory=$HOME/rusty-kaspa
ExecStart=$HOME/rusty-kaspa/target/release/kaspad --utxoindex --disable-upnp --maxinpeers=64 --perf-metrics --outpeers=32 --yes --perf-metrics-interval-sec=1 --rpclisten=0.0.0.0:16110 --rpclisten-borsh=0.0.0.0:17110 --rpclisten-json=0.0.0.0:18110
RestartSec=5
Restart=on-failure
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

# 重新加载 systemd 并启用服务
echo "正在启用并启动 Kaspad 服务..."
sudo systemctl daemon-reload
sudo systemctl enable kaspad.service
sudo systemctl start kaspad.service

# 检查服务状态
echo "正在检查 Kaspad 服务状态..."
sudo systemctl status kaspad.service

#journalctl -u kaspad.service
