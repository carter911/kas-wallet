import Bull, {Job} from 'bull';
import {
    ScriptBuilder,
    PrivateKey,
    SighashType,
    kaspaToSompi,
    IPaymentOutput,
    createTransaction,
    createInputSignature,
} from '../Library/wasm/kaspa';
import Wallet from "./Wallet";
import RpcConnection from "./RpcConnection";
import rpcPool from "../app";
import Redis from "ioredis";
type ItemType = {
    address: string;
    script: ScriptBuilder;
    publicKey: string;
};
// 初始化 Redis 连接
const redisOptions:any = { host: '127.0.0.1', port: 6379 ,password:''};
const taskQueue = new Bull('taskQueue', redisOptions);
const redis = new Redis(redisOptions);
// const u64MaxValue = 18446744073709551615;
const feeRate:number = 0.02;

const feeAddressTest:string ="kaspatest:qpp2xdfehz4jya6pu5uq0vghvsf8g4xsa9hq4ua40lgfaktjdxhxgzylhyr9t";
let feeAddress:string="kaspa:qz8n45r7fuzzax7ps98w5w9q2mf0wnhz2s32ktqx9zqmnxmsj0das788rxpwl";
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

// // 从普通地址打款到 P2SH 地址
// async function sendToP2SH(connection: RpcConnection, address: string, P2SHAddress: string, amount: number, gasFee: string, privateKey: PrivateKey) {
//     const RPC = await connection.getRpcClient();
//     const { entries } = await RPC.getUtxosByAddresses({ addresses: [address] });
//     if (entries.length === 0) {
//         return;
//     }
//     let total = entries.reduce((agg, curr) => {
//         return curr.amount + agg;
//     }, 0n);
//     const outputs: IPaymentOutput[] = [
//         {
//             address: P2SHAddress,//打款地址
//             amount: kaspaToSompi(amount.toString())!
//         },
//         {
//             address: address,//找零地址
//             amount: total-kaspaToSompi(amount.toString())! - kaspaToSompi(gasFee)!
//         }
//     ];
//     const tx = createTransaction( entries, outputs,kaspaToSompi(gasFee)!, "", 1);
//     const transaction = signTransaction(tx, [privateKey], true);
//     const submittedTransactionId = await RPC.submitTransaction({transaction}).then(function (submittedTransactionId) {
//         return submittedTransactionId.transactionId;
//     }).catch((error) => {
//         console.log(error);
//         return undefined;
//
//     });
//     if (submittedTransactionId) {
//         await connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.toString()!).catch((error) => {
//             console.log(error);
//         });
//     }
//     return submittedTransactionId;
// }

async function updateProgress(job:Job,address,amount){
    await redis.hset("mint_task_status_"+job.id,address,amount);
    const list = await redis.hgetall("mint_task_status_"+job.id)
    const total = Object.values(list).reduce((sum, value) => sum + parseInt(value, 10), 0);
    job.data.current = job.data.total-total;
    await job.update(job.data);
    if(amount == 0){
        await job.progress(100);
    }
}
// //找零归集
// // P2SH 地址循环上链操作
// async function loopOnP2SH(connection: RpcConnection, P2SHAddress: string, amount: number, gasFee: string, privateKey: PrivateKey,script:ScriptBuilder,job:Job,address) {
//     const RPC = await connection.getRpcClient();
//     let errorIndex=0;
//     const mintTotal = parseInt(amount.toString());
//     while (amount>=1){
//         const taskStatus =await getTaskStatus(job.id);
//         console.log('task status---------------->',taskStatus);
//         log(`Loop ${amount}: creating UTXO entries from ${P2SHAddress}`, 'DEBUG');
//         const { entries: entries } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress] });
//         if (entries.length === 0) {
//             return;
//         }
//         let total = entries.reduce((agg, curr) => {
//             return curr.amount + agg;
//         }, 0n);
//         let outputs: IPaymentOutput[] = [
//             {
//                 address: P2SHAddress,//找零地址
//                 amount: total - kaspaToSompi(gasFee)!
//             }
//         ];
//         if(taskStatus =='cancel'){
//             const num:number = mintTotal-amount;
//             let taskAmount:number = num*feeRate;
//             if(taskAmount<=0.22){
//                 taskAmount = 0.22;
//             }
//             outputs = [
//                 {
//                     address: feeAddress,//找零地址
//                     amount: kaspaToSompi(taskAmount.toString())!
//                 }
//                 ,
//                 {
//                     address: address,//找零地址
//                     amount: total-kaspaToSompi(taskAmount.toString())! - kaspaToSompi(gasFee)!
//                 }
//             ];
//             amount=1;
//         }else if(parseInt(amount.toString())==1){
//             outputs[0].address = feeAddress;
//         }
//         const transaction = createTransaction(entries, outputs,kaspaToSompi(gasFee)!, "", 1);
//         transaction.inputs.forEach((_,index) => {
//             let signature = createInputSignature(transaction, index, privateKey, SighashType.All);
//             transaction.inputs[index].signatureScript = script.encodePayToScriptHashSignatureScript(signature);
//         })
//         const submittedTransactionId = await RPC.submitTransaction({transaction}).then(function (submittedTransactionId) {
//             amount--;
//             errorIndex =0;
//             updateProgress(job,P2SHAddress,amount);
//             return submittedTransactionId.transactionId;
//         }).catch((error) => {
//             console.log('error----------------------->',error);
//             errorIndex++;
//             //amount =0;
//             if(errorIndex>8){
//                 amount =0
//             }
//         });
//
//         if(submittedTransactionId && errorIndex<=8){
//              await  connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.toString());
//         }
//
//         await sleep(4);
//         console.log('---------------done---------------------------------------------------------->');
//     }
//     return true;
// }
//
// // 提交任务的逻辑实现
// async function submitTask(privateKeyArg: string, ticker: string, gasFee: string, amount: number,walletNumber: number,  network: string,job:Job) {
//     const connection = await rpcPool.getConnection();
//     const RPC = await connection.getRpcClient();
//     const privateKey = new PrivateKey(privateKeyArg.toString());
//     const wallet = new Wallet(privateKeyArg.toString(),connection);
//     const address = wallet.getAddress();
//     const p2shList:any = []; // 存储所有 P2SH 地址
//     log(`main addresses for ticker: ${wallet.getAddress()}`, 'INFO');
//
//     for(var i=0;i<walletNumber;i++){
//         let p2shAmount:number = amount*parseFloat(gasFee) +amount*feeRate;
//         if(p2shAmount<=0.22){
//             p2shAmount = 0.22;
//         }
//         const data = wallet.mintOP(ticker,i,address.toString());
//         const p2shInfo = wallet.makeP2shAddress(privateKeyArg.toString(),data);
//         p2shList.push(p2shInfo);
//
//         await RPC.subscribeUtxosChanged([address.toString()]);
//         // 从普通地址打款到 P2SH 地址
//         const transactionId= await wallet.send(p2shInfo.address,p2shAmount);
//         log(`${p2shInfo.address} send p2sh addresses id: ${transactionId}`, 'INFO');
//         if (transactionId) {
//             await connection.listenForUtxoChanges(address, transactionId.toString()!).catch((error) => {
//                 console.log(error);
//             });
//         }
//         await sleep(5);
//         if(transactionId){
//             redis.hset("mint_task_status_"+job.id,p2shInfo.address,amount);
//         }
//         await RPC.unsubscribeUtxosChanged([address.toString()]);
//     }
//
//     console.log(`--------------------------------------->send to p2sh  successful \n`,p2shList)
//     if(network !="mainnet"){
//         feeAddress = feeAddressTest
//     }
//     const tasks = p2shList.map(async (item:ItemType) => {
//         // P2SH 地址循环上链操作
//         await RPC.subscribeUtxosChanged([item.address.toString()]);
//         await loopOnP2SH(connection, item.address, amount, gasFee.toString(), privateKey, item.script,job,address);
//         await RPC.unsubscribeUtxosChanged([item.address.toString()]);
//     });
//     // 等待所有任务完成
//     await Promise.all(tasks);
//     await job.finished();
//     log('Transaction successfully processed.', 'INFO');
//     await RPC.disconnect();
//     return { status: 'success' };
// }

// 提交任务的逻辑实现
async function submitTaskV2(privateKeyArg: string, ticker: string, gasFee: string, amount: number,walletNumber: number,  network: string,job:Job) {

    const connection = await rpcPool.getConnection();
    const RPC = await connection.getRpcClient();
    const privateKey = new PrivateKey(privateKeyArg.toString());
    const wallet = new Wallet(privateKeyArg.toString(),connection);
    const address = wallet.getAddress();
    const p2shList:any = []; // 存储所有 P2SH 地址
    log(`main addresses for ticker: ${wallet.getAddress()}`, 'INFO');

    for(var i=0;i<walletNumber;i++){
        const data = wallet.mintOP(ticker,i,address.toString());
        const p2shInfo = wallet.makeP2shAddress(privateKeyArg.toString(),data);
        p2shList.push(p2shInfo);
    }
    let AddressList:any = [];
    p2shList.forEach((item:ItemType) => {
        AddressList.push({
            address:item.address.toString(),
            amount:amount*parseFloat(gasFee)+1
        });
    });
    if(network !="mainnet"){
        feeAddress = feeAddressTest
    }
    //fee
    AddressList.push({
        address:feeAddress.toString(),
        amount:amount*feeRate*walletNumber
    });
    await RPC.subscribeUtxosChanged([address.toString()]);
    let realGasFee:number = (AddressList.length+1);

    //避免进程启动过程中，重复提交任务
    if(!await redis.get("mint_task_send_"+job.id)){
        const transactionId = await wallet.sendV2(AddressList,realGasFee);
        if (transactionId) {
            await redis.set("mint_task_send_"+job.id,transactionId);
            await connection.listenForUtxoChanges(address, transactionId.toString()!).catch((error) => {
                console.log('---------->main \n',error);
            });
            job.data.status = "send";
            await job.update(job.data);
        }

    }

    const tasks = p2shList.map(async (item:ItemType) => {
        // P2SH 地址循环上链操作

        await RPC.subscribeUtxosChanged([item.address.toString()]);
        job.data.status = "minting";
        await job.update(job.data);
        await loopOnP2SHV2(RPC,connection, item.address, amount, gasFee.toString(), privateKey, item.script,job,address);
        await RPC.unsubscribeUtxosChanged([item.address.toString()]);
    });

    // 等待所有任务完成
    await Promise.all(tasks);
    log('Transaction successfully processed.', 'INFO');
    await RPC.disconnect();
    return { status: 'success' };
}

async function loopOnP2SHV2(RPC,connection: RpcConnection, P2SHAddress: string, amountNum: number, gasFee: string, privateKey: PrivateKey,script:ScriptBuilder,job:Job,address) {
    let errorIndex=0;
    let cacheNum:string|null = await redis.hget("mint_task_status_"+job.id,P2SHAddress);
    let amount:number = amountNum;
    if(cacheNum !== null){
        amount = parseInt(cacheNum);
    }
    while (amount-1>=1){
        const taskStatus =await getTaskStatus(job.id);
        //console.log('task status---------------->',taskStatus);
        //log(`Loop ${amount}: creating UTXO entries from ${P2SHAddress}`, 'DEBUG');
        const { entries: entries } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress] });
        if (entries.length === 0) {
            return;
        }
        let total = entries.reduce((agg, curr) => {
            return curr.amount + agg;
        }, 0n);
        let toAddress = P2SHAddress;
        if(taskStatus =='cancel' ||amount ==2){
            toAddress = address;
            amount=1;
        }
        let outputs: IPaymentOutput[] = [
            {
                address: toAddress,//找零地址
                amount: total - kaspaToSompi(gasFee)!
            }
        ];
        const transaction = createTransaction(entries, outputs,kaspaToSompi(gasFee)!, "", 1);
        transaction.inputs.forEach((_,index) => {
            let signature = createInputSignature(transaction, index, privateKey, SighashType.All);
            transaction.inputs[index].signatureScript = script.encodePayToScriptHashSignatureScript(signature);
        })
        const submittedTransactionId = await RPC.submitTransaction({transaction}).then(function (submittedTransactionId) {
            amount--;
            errorIndex =0;
            updateProgress(job,P2SHAddress,amount);

            return submittedTransactionId.transactionId;
        }).catch((error) => {
            console.log('error----------------------->',error);
            errorIndex++;
            if(errorIndex>8){
                amount =0
            }
        });
        if(submittedTransactionId){
            await  connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.toString());
        }
        await sleep(2);
        //console.log('---------------done---------------------------------------------------------->');
    }
    return true;
}


// 获取任务状态
async function getTaskStatus(taskId: string|number) {
    const job = await taskQueue.getJob(taskId);
    if(!job){
        return undefined;
    }
    const {status} = job.data;
    return status;
}

async function getTaskMintStatus(taskId: string|number) {
    const job = await taskQueue.getJob(taskId);
    if(!job){
        return undefined;
    }
    const {status} = job.data;
    const list = await redis.hgetall("mint_task_status_"+job.id);
    return {list:list,status:status,taskInfo:job.data};
}

// 取消任务
async function cancelTask(taskId: string) {
    const job = await taskQueue.getJob(taskId);
    if (job) {
        //const {status} = job.data;
        job.data.status = "cancel";
        await job.update(job.data);
        return 'Job canceled';
    }
    return 'Job not found';
}

// 任务处理器
taskQueue.process(50,async (job) => {
    console.log("taskQueue processing \n");
    const { privateKey, ticker, gasFee, amount,walletNumber,network} = job.data;
    try {
        log(`Starting task with data: ${JSON.stringify(job.data)}`, 'INFO');
        const taskResult = await submitTaskV2(privateKey, ticker, gasFee, amount,walletNumber,network,job);
        await job.progress(100);
        return taskResult;

    } catch (error) {
        log(`Error processing task: ${error}`, 'ERROR');
        throw error;
    }
});

taskQueue.on('ready', async () => {
    const failedJobs = await taskQueue.getFailed();
    console.log(`taskQueue ready, failed jobs: ${failedJobs.length}`);
    for (const job of failedJobs) {
        await job.retry();
        console.log(`Retrying job: ${job.id}`);
    }
});

export { taskQueue, submitTaskV2, getTaskMintStatus, cancelTask };
