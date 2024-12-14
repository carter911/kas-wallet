import RpcConnectionPool from "./services/RpcConnectionPool";
import Bull from "bull";
//import MintService from "./services/MintService";
declare global {
    namespace Express {
        interface Request {
            pool: RpcConnectionPool; // Connection pool instance
            taskQueue: any; // Task queue instance
        }
    }
}

// Redis configuration
let redisOptions: any = {
    host: process.env.REDIS_URL,
    port: process.env.REDIS_PORT,
    password: '',
};
if(process.env.REDIS_TLS){
    redisOptions.tls = process.env.REDIS_TLS;
}



// Initialize RPC connection pool
let rpcPool: RpcConnectionPool;
try {
    rpcPool = new RpcConnectionPool(10, 100);
    console.log('RPC connection pool initialized successfully');
} catch (error) {
    console.error('Error initializing RPC connection pool:', error);
}


let taskQueue: any | null = null;
try {
    // const env = process.env.NODE_ENV || 'development';
    // if(env =="production"){
    //     taskQueue = new Promise((resolve, reject) => {
    //         const Mint = new Bull(
    //             'cluster', {
    //                 prefix: 'mint-queue',
    //                 createClient: (type, config) => new Redis.Cluster([redisOptions])
    //             })
    //         resolve(Mint)
    //     });
    // }else{
    //     taskQueue = new Bull('mint-queue', redisOptions);
    // }
    taskQueue = new Bull('mint-queue', redisOptions);
    // taskQueue.process(50,async (job) => {
    //     const MintTask = new MintService(rpcPool,taskQueue);
    //     await MintTask.jobRun(job);
    // });
    // console.log('Task queue initialized successfully');
} catch (error) {
    console.error('Error initializing task queue:', error);
}

export { rpcPool, taskQueue,redisOptions };
