import RpcConnectionPool from "./services/RpcConnectionPool";
import Bull from "bull";

declare global {
    namespace Express {
        interface Request {
            pool: RpcConnectionPool; // Connection pool instance
            taskQueue: any; // Task queue instance
        }
    }
}

// Redis configuration
const redisOptions: any = {
    host: process.env.REDIS_URL,
    port: process.env.REDIS_PORT,
    password: '',
    tls: process.env.REDIS_TLS,
};
let taskQueue: any | null = null;
try {

    taskQueue = new Bull('mint-queue', redisOptions);
    console.log('Task queue initialized successfully');
} catch (error) {
    console.error('Error initializing task queue:', error);
}

// Initialize RPC connection pool
let rpcPool: RpcConnectionPool;
try {
    rpcPool = new RpcConnectionPool(10, 100);
    console.log('RPC connection pool initialized successfully');
} catch (error) {
    console.error('Error initializing RPC connection pool:', error);
}

export { rpcPool, taskQueue,redisOptions };
