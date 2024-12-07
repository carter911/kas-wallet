module.exports = {
    apps: [
        {
            name: "kas-mint", // 应用名称
            script: "./dist/app.js", // 启动脚本路径
            instances: "max", // 启动实例数量，"max" 表示根据 CPU 核心数自动设置
            exec_mode: "cluster", // 使用 cluster 模式（推荐多实例时使用）
            watch: false, // 是否监听文件变化（适合开发环境）
            ignore_watch: ["node_modules", "logs"], // 忽略监听的文件或目录
            max_memory_restart: "600M", // 内存占用超过 300MB 时重启
            env: {
                NODE_ENV: "production", // 默认环境变量，生产环境
                PORT: 3000, // 应用监听端口
            },
            env_development: {
                NODE_ENV: "development", // 开发环境变量
                PORT: 3000,
            },
        },
    ],
};
