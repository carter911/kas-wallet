module.exports = {
    apps: [
        {
            name: "kas-mint", // 应用名称
            script: "./dist/index.ts", // 启动脚本路径
            instances: "max", // 启动实例数量，1 表示单实例；设置为 "max" 则根据 CPU 核心数启动
            exec_mode: "cluster", // 使用 cluster 模式（推荐多实例时使用）
            watch: true, // 是否监听文件变化（适合开发环境）
            ignore_watch: ["node_modules", "logs"], // 忽略的文件或目录
            max_memory_restart: "300M", // 内存占用超出 300MB 时重启
            env: {
                NODE_ENV: "production", // 生产环境变量
                PORT: 3000, // 应用监听端口
            },
            env_development: {
                NODE_ENV: "development", // 开发环境变量
                PORT: 3001,
            },
        },
    ],
};
