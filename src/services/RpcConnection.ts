import {
    RpcClient,
    Encoding,
    Resolver,
} from '../Library/wasm/kaspa';
// RPC Connection Class
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
    constructor(private network: string,url?:string) {
        console.log(url);
        this.rpcClient = new RpcClient( {
            resolver: new Resolver(),
            encoding: Encoding.Borsh,
            networkId: this.network,
        });
        return this;
    }

    async connect() {
        if(this.rpcClient.isConnected){
            log('RPC connection already established.', 'INFO');
            return this.rpcClient;
        }
        await this.rpcClient.connect();
        log('RPC connection established.', 'INFO');
        return this.rpcClient;
    }

    async disconnect() {
        await this.rpcClient.disconnect();
        log('RPC connection closed.', 'INFO');
    }

    async getRpcClient(): Promise<RpcClient> {
        if(!this.rpcClient.isConnected){
             await this.connect()
        }
        return this.rpcClient;
    }
    async retry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T|undefined> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === retries) throw error;
                log(`Retrying (${attempt}/${retries})...`, 'WARN');
            }
        }
    }
    // 监听 UTXO 变化
    public async listenForUtxoChanges(address: string, submittedTransactionId: string, timeout: number=300000) {
        let eventReceived = false;
        console.log(timeout);
        return new Promise<string>((resolve, reject) => {
            const revealTimeout = setTimeout(() => {
                if (!eventReceived) {
                    log('Transaction did not mature within the specified timeout.', 'ERROR');
                    reject(new Error('Transaction timeout'));
                }
            }, timeout);
            this.rpcClient.addEventListener('utxos-changed', async (event: any) => {
                log(`UTXO changes detected for address: ${address}`, 'INFO');
                const addedEntry = event.data.added.find((entry: any) => entry.address.payload === address.split(':')[1]);
                const removedEntry = event.data.removed.find((entry: any) => entry.address.payload === address.split(':')[1]);
                if (addedEntry && addedEntry.outpoint.transactionId === submittedTransactionId) {
                    log(`Matched submitted transaction ID: ${addedEntry.outpoint.transactionId}`, 'INFO');
                    eventReceived = true;
                }
                if (removedEntry && removedEntry.outpoint.transactionId === submittedTransactionId) {
                    log(`Matched submitted transaction ID: ${removedEntry.outpoint.transactionId}`, 'INFO');
                    eventReceived = true;
                }
                if (eventReceived) {
                    clearTimeout(revealTimeout);
                    resolve(submittedTransactionId);
                }
            });
        });
    }
}

export default RpcConnection;
