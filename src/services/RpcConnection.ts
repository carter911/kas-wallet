import {
    RpcClient,
    Encoding,
    Resolver,
} from '../Library/wasm/kaspa';

// 日志函数
function log(message: string, level: string = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    if (level === 'ERROR') {
        console.error(logMessage);
    } else {
        console.log(logMessage);
    }
}

class RpcConnection {
    private rpcClient: RpcClient;

    constructor() {
        // 初始化 RPC 客户端
        this.rpcClient = new RpcClient({
            url: process.env.KASPA_NODE || undefined,
            resolver: new Resolver(),
            encoding: Encoding.Borsh,
            networkId: process.env.KASPA_NETWORK,
        });
    }

    // 连接方法，确保连接状态检查
    async connect(): Promise<RpcClient> {
        if (this.rpcClient.isConnected) {
            log('RPC connection already established.', 'INFO');
            return this.rpcClient;
        }

        log('Connecting to RPC...', 'INFO');
        await this.rpcClient.connect();
        log('RPC connection established.', 'INFO');
        return this.rpcClient;
    }

    // 断开连接
    async disconnect() {
        if (this.rpcClient.isConnected) {
            await this.rpcClient.disconnect();
            log('RPC connection closed.', 'INFO');
        } else {
            log('RPC connection was already closed.', 'INFO');
        }
    }

    // 获取 RPC 客户端实例，如果没有连接，自动连接
    async getRpcClient(): Promise<RpcClient> {
        if (!this.rpcClient.isConnected) {
            await this.connect();
        }
        return this.rpcClient;
    }

    // 重试机制
    async retry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T | undefined> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === retries) throw error;
                log(`Retrying (${attempt}/${retries})...`, 'WARN');
            }
        }
    }

    // 监听 UTXO 变化，并且提供更强的超时控制
    public async listenForUtxoChanges(address: string, submittedTransactionId: string) {
        let eventReceived = false;
        return new Promise<string>((resolve) => {
            // 监听 UTXO 变化
            this.rpcClient.addEventListener('utxos-changed', async (event: any) => {
                //log(`UTXO changes detected for address: ${address}`, 'INFO');
                const addressPayload = address.split(':')[1]; // Assuming address format is <network>:<address>
                const addedEntry = event.data.added.find((entry: any) => entry.address.payload === addressPayload);
                const removedEntry = event.data.removed.find((entry: any) => entry.address.payload === addressPayload);

                if (addedEntry && addedEntry.outpoint.transactionId === submittedTransactionId) {
                    //log(`Matched submitted transaction ID: ${addedEntry.outpoint.transactionId}`, 'INFO');
                    eventReceived = true;
                }

                if (removedEntry && removedEntry.outpoint.transactionId === submittedTransactionId) {
                    //log(`Matched submitted transaction ID: ${removedEntry.outpoint.transactionId}`, 'INFO');
                    eventReceived = true;
                }

                if (eventReceived) {
                    resolve(submittedTransactionId);
                }
            });
        });
    }
}

export default RpcConnection;
