import RpcConnection from './RpcConnection';

// 连接池管理类
class RpcConnectionPool {
    private pool: RpcConnection[] = [];
    private size: number;
    //private network: string;
    //private url: string;
    private maxSize: number;

    constructor(size: number, maxSize: number) {
        this.size = size;
        this.maxSize = maxSize;
        //this.network = network;
        //this.url = url;

        // 初始化连接池
        this.initializePool();
    }

    // 初始化连接池，创建指定数量的连接
    private initializePool() {
        for (let i = 0; i < this.size; i++) {
            const connection = new RpcConnection();
            this.pool.push(connection);
        }
    }

    // 获取一个可用连接（轮询分配）
    public async getConnection(): Promise<RpcConnection> {
        // 循环池中的连接
        const connection = this.pool.shift()!;

        // 确保连接已建立
        await connection.connect();

        // 将连接返回到池中，供下次使用
        this.pool.push(connection);

        return connection;
    }

    // 获取所有连接池中的连接
    public getAllConnections(): RpcConnection[] {
        return this.pool;
    }

    // 获取连接池中有效的连接数
    public getAvailableConnections(): number {
        return this.pool.length;
    }

    // 动态扩展连接池（最大连接数控制）
    public expandPool(): void {
        if (this.pool.length < this.maxSize) {
            const newConnection = new RpcConnection();
            this.pool.push(newConnection);
            console.log(`Expanded pool size. Current pool size: ${this.pool.length}`);
        } else {
            console.log(`Pool already reached maximum size of ${this.maxSize}.`);
        }
    }

    // 关闭所有连接
    public async closeAll(): Promise<void> {
        for (const connection of this.pool) {
            await connection.disconnect();
        }
        console.log('All connections have been closed.');
    }
}

export default RpcConnectionPool;
