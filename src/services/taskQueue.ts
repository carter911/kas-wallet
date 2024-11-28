import Bull from 'bull';
import {
    ScriptBuilder,
    PrivateKey,
    SighashType,
    kaspaToSompi,
    IPaymentOutput,
    createTransaction,
    signTransaction,
    createInputSignature,
} from '../Library/wasm/kaspa';
import rpcPool from "../app";
import Wallet from "./Wallet";
import RpcConnection from "./RpcConnection";
type ItemType = {
    address: string;
    script: ScriptBuilder;
    publicKey: string;
};
// 初始化 Redis 连接
const redisOptions:any = { host: '127.0.0.1', port: 6379 ,password:'chenrj123'};
const taskQueue = new Bull('taskQueue', redisOptions);
// const u64MaxValue = 18446744073709551615;

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
function sleep(seconds:number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// 从普通地址打款到 P2SH 地址
async function sendToP2SH(connection: RpcConnection, address: string, P2SHAddress: string, amount: number, gasFee: string, privateKey: PrivateKey) {
    const RPC = await connection.getRpcClient();
    const { entries } = await RPC.getUtxosByAddresses({ addresses: [address] });
    if (entries.length === 0) {
        return;
    }
    let total = entries.reduce((agg, curr) => {
        return curr.amount + agg;
    }, 0n);
    const outputs: IPaymentOutput[] = [
        {
            address: P2SHAddress,//打款地址
            amount: kaspaToSompi(amount.toString())!
        },
        {
            address: address,//找零地址
            amount: total-kaspaToSompi(amount.toString())! - kaspaToSompi(gasFee)!
        }
    ];
    const tx = createTransaction( entries, outputs,kaspaToSompi(gasFee)!, "", 1);
    const transaction = signTransaction(tx, [privateKey], true);
    const submittedTransactionId = await RPC.submitTransaction({transaction}).then(function (submittedTransactionId) {
        return submittedTransactionId.transactionId;
    }).catch((error) => {
        console.log(error);
        return undefined;

    });
    if (submittedTransactionId) {
        await connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.toString()!).catch((error) => {
            console.log(error);
        });
    }
    return submittedTransactionId;
}



//找零归集
// P2SH 地址循环上链操作
async function loopOnP2SH(connection: RpcConnection, P2SHAddress: string, amount: number, gasFee: string, privateKey: PrivateKey,script:ScriptBuilder) {
    const RPC = await connection.getRpcClient();
    let errorIndex=0;
    while (amount>0){
        log(`Loop ${amount}: creating UTXO entries from ${P2SHAddress}`, 'DEBUG');
        const { entries: entries } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress] });
        if (entries.length === 0) {
            return;
        }
        let total = entries.reduce((agg, curr) => {
            return curr.amount + agg;
        }, 0n);

        const outputs: IPaymentOutput[] = [
            {
                address: P2SHAddress,//找零地址
                amount: total - kaspaToSompi(gasFee)!
            }
        ];

        if(amount==1){
            //outputs =[];
        }

        const transaction = createTransaction(entries, outputs,kaspaToSompi(gasFee)!, "", 1);

        transaction.inputs.forEach((_,index) => {
            let signature = createInputSignature(transaction, index, privateKey, SighashType.All);
            transaction.inputs[index].signatureScript = script.encodePayToScriptHashSignatureScript(signature);
        })
        const submittedTransactionId = await RPC.submitTransaction({transaction}).then(function (submittedTransactionId) {
            amount--;
            errorIndex =0;
            return submittedTransactionId.transactionId;
        }).catch((error) => {
            console.log('error----------------------->',error);
            errorIndex++;
            //amount =0;
        });

        if(submittedTransactionId && errorIndex<=8){
             await  connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.toString());
        }
        await sleep(8);
        console.log('---------------done---------------------------------------------------------->');
    }
    return true;
}

// 提交任务的逻辑实现
async function submitTask(privateKeyArg: string, ticker: string, gasFee: string, amount: number,walletNumber: number,  network: string) {
    const connection = await rpcPool.getConnection();
    const RPC = await connection.getRpcClient();
    const privateKey = new PrivateKey(privateKeyArg.toString());
    const wallet = new Wallet(privateKeyArg.toString(),network.toString(),connection);
    const address = wallet.getAddress();

    const p2shList:any = []; // 存储所有 P2SH 地址
    log(`main addresses for ticker: ${wallet.getAddress()}`, 'INFO');
    for(var i=0;i<walletNumber;i++){
        const data = wallet.mintOP(ticker,i,address.toString());
        const p2shInfo = wallet.makeP2shAddress(privateKeyArg.toString(),data);
        p2shList.push(p2shInfo);
        await RPC.subscribeUtxosChanged([address.toString()]);
        // 从普通地址打款到 P2SH 地址
        await sendToP2SH(connection, address.toString(), address.toString(), amount, gasFee.toString(), privateKey);
    }

    console.log(`--------------------------------------->send to p2sh  successful \n`,p2shList)
    const tasks = p2shList.map(async (item:ItemType) => {
        // P2SH 地址循环上链操作
        await RPC.subscribeUtxosChanged([item.address.toString()]);
        await loopOnP2SH(connection, item.address, amount, gasFee.toString(), privateKey, item.script);
    });
    // 等待所有任务完成
    await Promise.all(tasks);
    log('Transaction successfully processed.', 'INFO');
    await RPC.disconnect();
    return { status: 'success' };
}

// 获取任务状态
async function getTaskStatus(taskId: string) {
    const job = await taskQueue.getJob(taskId);
    return job ? job.getState() : 'Job not found';
}

// 取消任务
async function cancelTask(taskId: string) {
    const job = await taskQueue.getJob(taskId);
    if (job) {
        await job.remove();
        return 'Job canceled';
    }
    return 'Job not found';
}

// 任务处理器
taskQueue.process(async (job) => {
    const { privateKey, ticker, gasFee, amount,walletNumber, timeout} = job.data;
    try {
        log(`Starting task with data: ${JSON.stringify(job.data)}`, 'INFO');
        const taskResult = await submitTask(privateKey, ticker, gasFee, amount,walletNumber, timeout);
        return taskResult;
    } catch (error) {
        log(`Error processing task: ${error}`, 'ERROR');
        throw error;
    }
});

export { taskQueue, submitTask, getTaskStatus, cancelTask };
