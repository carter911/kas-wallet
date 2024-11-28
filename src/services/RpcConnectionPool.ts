import RpcConnection from './RpcConnection';

class RpcConnectionPool {
    private pool: RpcConnection[] = [];
    private currentIndex: number = 0;
    private size: number;
    private network: string;
    constructor(size: number, network: string, private url?: string) {
        this.size = size;
        this.network = network;
        this.initializePool();
    }

    // 初始化连接池
    private initializePool() {
        for (let i = 0; i < this.size; i++) {
            const connection = new RpcConnection(this.network, this.url);
            this.pool.push(connection);
        }
    }
    // 获取一个可用连接（轮询分配）
    public async getConnection(): Promise<RpcConnection> {
        const connection = this.pool[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.size;
        // 确保连接已建立
        await connection.connect();
        return connection;
    }

    // 关闭所有连接
    public async closeAll() {
        for (const connection of this.pool) {
            await connection.disconnect();
        }
    }
}

export default RpcConnectionPool;
