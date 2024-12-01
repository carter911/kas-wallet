
// src/app.ts
import express from 'express';
import dotenv from "dotenv";
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });


globalThis.WebSocket = require("websocket").w3cwebsocket;
import RpcConnectionPool  from './services/RpcConnectionPool';

import router from "./routes/index";

const app = express();
app.use(express.json());  // 解析 JSON 请求体
app.use('/', router);  // 注册任务相关路由

//127.0.0.1:17110
//'eu-1.kaspa-ng.org/testnet-10'
const rpcPool = new RpcConnectionPool(10, 100);
export default rpcPool;
app.listen(3000, async () => {
    console.log('Server running on port 3000');
});
// 捕获退出信号以关闭所有连接
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    process.exit(0);
});
