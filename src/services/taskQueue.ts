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
import Redis from "ioredis";
type ItemType = {
    address: string;
    script: ScriptBuilder;
    publicKey: string;
    amount:number;
};
import {Job} from "bull";
import Redlock from "redlock";
// 初始化 Redis 连接
import {taskQueue,rpcPool,redisOptions} from "../middleware";
import Notify from "./Notify";
const redis = new Redis(redisOptions);
const redlock = new Redlock([redis], {
    driftFactor: 0.01, // 漂移因子
    retryCount: 10,    // 重试次数
    retryDelay: 200,   // 每次重试之间的时间（ms）
    retryJitter: 50,   // 重试抖动时间（ms）
});

// const u64MaxValue = 18446744073709551615;
const feeRate:number = 0.02;

let feeAddress:string = process.env.FEE_ADDRESS==undefined ? "":(process.env.FEE_ADDRESS as string);
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


async function updateProgress(job:Job,address,amount,status?:string){

    //分布式锁
    const resource = 'locks:example'+job.id+job.data.status; // 锁的资源标识
    const ttl = 5000;                 // 锁的过期时间（毫秒）
    const lock = await redlock.acquire([resource], ttl);

    await redis.hset("mint_task_status_"+job.id,address,amount);
    await redis.expire("mint_task_status_"+job.id, 3600*24*3);

    const list = await redis.hgetall("mint_task_total_address_"+job.id);
    const total = Object.values(list).reduce((sum, value) => sum + parseInt(value, 10), 0);

    let currentStatus = job.data.status;
    job.data.current = total;
    console.log(job.data.current,job.data.total,total,job.data.status);
    // if(Object.values(list).length!=job.data.walletNumber){
    //     return false;
    // }

    await job.update(job.data);
    if(status){
        job.data.status = status;
        job.data.cancelnum = +1;
        if(job.data.cancelnum == job.data.walletNumber){
            job.data.status = 'canceled';
            await job.update(job.data);
            await job.progress(100);
        }
        await job.update(job.data);
    }
    let force = false;
    if(job.data.current == job.data.total){
        console.log(1111111111111111111);
        job.data.status = 'completed';
        await job.update(job.data);
        force = true;
    }

    //限制发送频率
    let key = "mint_task_notify_"+job.id+job.data.status;

    if(job.data.status !=currentStatus){
        force = true
    }

    let state = await redis.get(key);
    //console.log(job.id,job.data.total,total,job.data.status);
    if(  (job.data.notifyUrl && !state)||force){
        await redis.setex(key, 2,1);
        console.log(job.id,job.data.total,total,job.data.status);
        let info = { ...job.data };
        delete info.privateKey;
        let notify = new Notify();
        await notify.sendMessage(job.data.notifyUrl,info);
    }
    await lock.release();
    return true;
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
function distributeTasks(totalTasks, walletCount) {
    const tasks = Array(walletCount).fill(0);

    // 基础分配，每个钱包分配 floor(totalTasks / walletCount)
    const baseAllocation = Math.floor(totalTasks / walletCount);

    // 多出来的操作需要分配给前面的钱包
    let remainder = totalTasks % walletCount;

    // 分配任务
    for (let i = 0; i < walletCount; i++) {
        tasks[i] = baseAllocation;
        if (remainder > 0) {
            tasks[i]++;
            remainder--;
        }
    }

    return tasks;
}

function logJob(jobId,title,data?) {
    redis.rpush("mint_task_log_"+jobId,JSON.stringify({title:title,data:data}));
    redis.expire("mint_task_log_"+jobId, 60*60*24*7);
}

// 提交任务的逻辑实现
async function submitTaskV2(privateKeyArg: string, ticker: string, gasFee: string, amount: number,walletNumber: number,job:Job) {
    const connection = await rpcPool.getConnection();
    const RPC = await connection.getRpcClient();
    const privateKey = new PrivateKey(privateKeyArg.toString());
    const wallet = new Wallet(privateKeyArg.toString(),connection);
    const address = wallet.getAddress();
    const p2shList:any = []; // 存储所有 P2SH 地址
    logJob(job.id,"main addresses for ticker",address.toString());
    let amountList = distributeTasks(amount,walletNumber);
    for(var i=0;i<walletNumber;i++){
        const data = wallet.mintOP(ticker,i,address.toString());
        const p2shInfo = wallet.makeP2shAddress(privateKeyArg.toString(),data);
        p2shList.push(p2shInfo);

    }

    let feeAmount = amount*feeRate;
    if(feeAmount<=0.22){
        feeAmount = 0.22;
    }

    let AddressList:any = [];

    p2shList.forEach((item:ItemType,index) => {
        let amt = amountList[index]*parseFloat(gasFee)+1;
        if(index ==0){
            //第一个地址扣费用
            amt = amt+feeAmount;
        }
        AddressList.push({
            address:item.address.toString(),
            amount:amt
        });
        p2shList[index].amount = amountList[index];
        redis.hset("mint_task_status_"+job.id,item.address,amountList[index]);
    });
    await RPC.subscribeUtxosChanged([address.toString()]);
    let realGasFee:number = AddressList.length*1;
    if(walletNumber==1){
        realGasFee = 0.0004;
    }else if(walletNumber>5){
        realGasFee = AddressList.length*1;
    }
    //取消任务
    if(job.data.status =='cancel'){
        job.data.status = 'canceled';
        await job.update(job.data);
        await job.progress(100);
        return true;
    }

    //避免进程启动过程中，重复提交任务
    if(!await redis.get("mint_task_send_"+job.id) ){
        job.data.status = "send";
        await job.update(job.data);
        logJob(job.id,"send to p2sh addresses",{AddressList,realGasFee});
        const transactionId = await wallet.sendV2(AddressList,realGasFee);
        console.log("send hash"+transactionId);
        if (transactionId) {
            await connection.listenForUtxoChanges(address, transactionId.toString()!).catch((error) => {
                console.log('---------->main \n',error);
            });
            logJob(job.id,"send to p2sh addresses id",transactionId);
            await redis.setex("mint_task_send_"+job.id,3*24*60*60,transactionId);
        }
    }


    if(job.data.status!="cancel"){
        logJob(job.id,"update job status mint",job.data);
        job.data.status = "mint";
        await job.update(job.data);
    }

    const tasks = p2shList.map(async (item:ItemType,index) => {

        await sleep(index*1.5);
        // P2SH 地址循环上链操作
        let feeInfo :any = {
            address:feeAddress,
            amount:kaspaToSompi("1")!
        }
        await RPC.subscribeUtxosChanged([item.address.toString()]);
        try {
            //await updateProgress(job,item.address,item.amount);
            logJob(job.id,"----------mint start:"+index,item.address.toString());
            await loopOnP2SHV2(RPC,connection, item.address, item.amount, gasFee.toString(), privateKey, item.script,job,address,index,feeInfo);
            logJob(job.id,"----------mint end:"+index,item.address.toString());
        }catch(e){
            console.log("error",e);
            logJob(job.id,"----------mint error:"+index,e);
        } finally {
            await RPC.unsubscribeUtxosChanged([item.address.toString()]);
        }

    });

    // 等待所有任务完成
    await Promise.allSettled(tasks);
    log('Transaction successfully processed.', 'INFO');
    await RPC.disconnect();
    //延迟30秒删除task
    await sleep(30);
    return { status: 'success' };
}
// type REFERER = {
//     lv1_address: string;
//     lv1_rate: number;
//     lv2_address: string;
//     lv2_rate: number;
// };
// function processReferer(
//     referer: REFERER,
//     feeAmount: number,
//     outputs:IPaymentOutput[],
//     threshold = 0.22
// ) {
//     const processLevel = (
//         address: string | undefined,
//         rate: number | undefined
//     ) => {
//         let amount:bigint = 0n;
//         if (address && typeof address === "string" && rate && typeof rate === "number") {
//             const amountInKaspa = parseFloat(sompiToKaspaString(feeAmount)) * rate;
//             if (amountInKaspa >= threshold) {
//                 const amountInSompi = kaspaToSompi(amountInKaspa.toString());
//                 if (amountInSompi !== undefined) {
//                     amount = amountInSompi;
//                     outputs.push({
//                         address,
//                         amount: amountInSompi,
//                     });
//                 }
//             }
//         }
//         return amount;
//     };
//
//     let amountLv1:bigint = processLevel(referer.lv1_address, referer.lv1_rate);
//     let amountLv2:bigint = processLevel(referer.lv2_address, referer.lv2_rate);
//     return {amountLv1,amountLv2}
// }

async function loopOnP2SHV2(RPC,connection: RpcConnection, P2SHAddress: string, amountNum: number, gasFee: string, privateKey: PrivateKey,script:ScriptBuilder,job:Job,address,index:number,feeInfo:any) {
    let errorIndex=0;
    let cacheNum:string|null = await redis.hget("mint_task_status_"+job.id,P2SHAddress);
    let amount:number = amountNum;
    let isFirst:boolean = true;
    //说明不是第一次进来
    if(cacheNum!=null && parseInt(cacheNum) != amountNum){
        isFirst = false
    }
    console.log(connection.connect());
    if(cacheNum !== null){
        amount = parseInt(cacheNum);
    }

    let mintTotal = amount;
    let flag = true;
    logJob(job.id,"loopOnP2SHV2 start:"+index,P2SHAddress.toString());
    while (amount>0 && flag){
        const taskStatus =await getTaskStatus(job.id);
        const { entries: entries } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress] });
        if (entries.length === 0) {
            console.error('entries is null');
            logJob(job.id,"entries is null"+index,P2SHAddress.toString());
            await sleep(5);
            errorIndex++;
            if(errorIndex>30){
                console.error('entries is null error');
                logJob(job.id,"entries is null error"+index,P2SHAddress.toString());
                flag = false;
                break;
            }
        }
        let total = entries.reduce((agg, curr) => {
            return curr.amount + agg;
        }, 0n);
        let toAddress = P2SHAddress;
        if(taskStatus =='cancel'){
            console.log('cancel:'+job.id);
            await updateProgress(job,P2SHAddress,amount,'canceled');
            toAddress = address;
            logJob(job.id,"cancel:"+index,P2SHAddress.toString());
            flag = false;
        }
        if(amount == 1){
            toAddress = address;
        }
        let outputs: IPaymentOutput[] = [
            {
                address: toAddress,//找零地址
                amount: total - kaspaToSompi(gasFee)!
            }
        ];
        //第一个钱包 并且是第一次mint
        if(index == 0 && amount == mintTotal && isFirst){
            //const referer: REFERER = job.data.referer;
            //let refererAmount = processReferer(referer, feeInfo.amount, outputs);
            // // 扣除总费用
            outputs[0].amount = total - kaspaToSompi(gasFee)!-feeInfo.amount;
            // //扣除代理费用
            // feeInfo.amount = feeInfo.amount-refererAmount.amountLv1-refererAmount.amountLv2;
            outputs.push(feeInfo);
            //console.log('outputs:------------>',outputs,refererAmount);
        }

        const transaction = createTransaction(entries, outputs,kaspaToSompi(gasFee)!, "", 1);
        transaction.inputs.forEach((_,index) => {
            let signature = createInputSignature(transaction, index, privateKey, SighashType.All);
            transaction.inputs[index].signatureScript = script.encodePayToScriptHashSignatureScript(signature);
        });

        try{
            let submittedTransactionId = await RPC.submitTransaction({transaction});
            submittedTransactionId = submittedTransactionId.transactionId
            amount--;
            errorIndex =0;
            await redis.hincrby("mint_task_total_address_"+job.id,P2SHAddress,1);
            await updateProgress(job,P2SHAddress,amount);
            logJob(job.id,"loopOnP2SHV2 done:"+index,{submittedTransactionId,amount});
            // if(submittedTransactionId ){
            //     await  connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.toString());
            // }
        }catch (error) {
            errorIndex++;
            console.log('error----------------------->',error);
            if(errorIndex>30){
                logJob(job.id,`loopOnP2SHV2 error:`+index+` error: ${error} address:${P2SHAddress} amount:${amount}`);
                console.log('error----------------------->',error);
                console.error('entries is null error');
                await sleep(5);
                flag = false;
            }
        }

        await sleep(3);
    }
    logJob(job.id,"loopOnP2SHV2 end:"+index,amount);
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
    const info = { ...job.data }; // 克隆对象
    delete info.privateKey;

    return {list:list,status:status,taskInfo:info};
}

// 取消任务
async function cancelTask(taskId: string) {
    const job = await taskQueue.getJob(taskId);
    if (job) {
        //const {status} = job.data;
        job.data.status = "cancel";
        job.data.cancelnum = 0;
        await job.update(job.data);
        return 'Job canceled';
    }
    return 'Job not found';
}

// // 任务处理器 单独任务及出
taskQueue.process(50,async (job) => {
    console.log("taskQueue processing \n");
    const { privateKey, ticker, gasFee, amount,walletNumber} = job.data;
    try {
        log(`Starting task with data: ${JSON.stringify(job.data)}`, 'INFO');
        const taskResult = await submitTaskV2(privateKey, ticker, gasFee, amount,walletNumber,job);
        await job.progress(100);
        return taskResult;

    } catch (error) {
        log(`Error processing task: ${error}`, 'ERROR');
        if (error instanceof Error) {
            console.error("Stack trace:", error.stack);
        }

        throw error;
    }
});

export { taskQueue, submitTaskV2, getTaskMintStatus, cancelTask };
