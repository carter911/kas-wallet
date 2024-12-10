import {Job} from "bull";
import Notify from "../services/Notify";
import Wallet from "../services/Wallet";
import {ItemType, REFERER} from "./types/type";
import {
    createInputSignature,
    createTransaction,
    IPaymentOutput,
    kaspaToSompi, PrivateKey,
    ScriptBuilder, SighashType,
    sompiToKaspaString
} from "../Library/wasm/kaspa";
import RpcConnection from "../services/RpcConnection";
import Redis from "ioredis"
import RpcConnectionPool from "../services/RpcConnectionPool";
import Redlock from "redlock";
const redis = new Redis({
    host:process.env.REDIS_URL
});

const redlock = new Redlock([redis], {
    driftFactor: 0.01, // 漂移因子
    retryCount: 10,    // 重试次数
    retryDelay: 200,   // 每次重试之间的时间（ms）
    retryJitter: 50,   // 重试抖动时间（ms）
});

class MintTask {
    rpcPool:RpcConnectionPool;
    feeRate:number=0.2
    feeAddress:string = process.env.FEE_ADDRESS||""
    taskQueue
    constructor(rpcPool:RpcConnectionPool,taskQueue) {
        this.taskQueue = taskQueue;
        this.rpcPool =rpcPool;
    }

    log(message: string, level: string = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        if (level === 'ERROR') {
            console.error(logMessage);
        } else {
            console.log(logMessage);
        }
    }

    sleep(seconds:number) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async updateProgress(job:Job,address,amount,status?:string){

        await redis.hset("mint_task_status_"+job.id,address,amount);
        await redis.expire("mint_task_status_"+job.id, 3600*24*3);
        const list = await redis.hgetall("mint_task_status_"+job.id);
        const total = Object.values(list).reduce((sum, value) => sum + parseInt(value, 10), 0);
        if(Object.values(list).length!=job.data.walletNumber){
            return false;
        }
        job.data.current = job.data.total-total;
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
        if(job.data.current == job.data.total){
            job.data.status = 'completed';
            await job.update(job.data);
            await job.progress(100);
        }

        //分布式锁
        const resource = 'locks:example'+job.id; // 锁的资源标识
        const ttl = 5000;                 // 锁的过期时间（毫秒）
        const lock = await redlock.acquire([resource], ttl);
        //限制发送频率
        let key = "mint_task_notify_"+job.id+job.data.status;
        let state = await redis.get(key);
        //console.log(job.id,job.data.total,total,job.data.status);
        if(job.data.notifyUrl && !state){
            await redis.setex(key, 5,1);
            console.log(job.id,job.data.total,total,job.data.status);
            let info = { ...job.data };
            delete info.privateKey;
            let notify = new Notify();
            await notify.sendMessage(job.data.notifyUrl,info);
        }
        await lock.release();
        return true;
    }

    distributeTasks(totalTasks, walletCount) {
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
    async jobRun(job:Job){
        console.log("taskQueue processing \n",job.data);
        const { privateKey, ticker, gasFee, amount,walletNumber} = job.data;
        try {

            const connection = await this.rpcPool.getConnection();
            const RPC = await connection.getRpcClient();
            const wallet = new Wallet(privateKey.toString(),connection);
            const address = wallet.getAddress();
            const p2shList:any = []; // 存储所有 P2SH 地址
            this.log(`main addresses for ticker: ${wallet.getAddress()}`, 'INFO');

            //生成p2sh地址
            let amountList = this.distributeTasks(amount,walletNumber);
            for(var i=0;i<walletNumber;i++){
                const data = wallet.mintOP(ticker,i,address.toString());
                const p2shInfo = wallet.makeP2shAddress(privateKey.toString(),data);
                p2shList.push(p2shInfo);
            }

            //设置手续费
            let feeAmount = amount*this.feeRate;
            if(feeAmount<=0.22){
                feeAmount = 0.22;
            }

            //给每个地址分配对应的金额
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
            });


            //设置gas费用
            let realGasFee:number = AddressList.length*1;
            if(walletNumber==1){
                realGasFee = 0.0004;
            }else if(walletNumber>5){
                realGasFee = AddressList.length*1;
            }


            //还没开始 就取消了 责立即取消所有的钱包充值
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
                await RPC.subscribeUtxosChanged([address.toString()]);
                const transactionId = await wallet.sendV2(AddressList,realGasFee);
                console.log("send hash"+transactionId);
                if (transactionId) {
                    await connection.listenForUtxoChanges(address, transactionId.toString()!).catch((error) => {
                        console.log('---------->main \n',error);
                    });
                    await redis.setex("mint_task_send_"+job.id,3*24*60*60,transactionId);
                }
                //防止p2sh没有接收到资金
                await this.sleep(2);
            }

            //设置mint状态
            if(job.data.status!="cancel"){
                job.data.status = "mint";
                await job.update(job.data);
            }

            const p_address = p2shList.map(item => item.address);
            await RPC.subscribeUtxosChanged(p_address);

            const tasks = p2shList.map(async (item:ItemType,index) => {
                // P2SH 地址循环上链操作
                let feeInfo :any;
                if(this.feeAddress && this.feeRate>0){
                     feeInfo = {
                        address:this.feeAddress,
                        amount:kaspaToSompi(feeAmount.toString())!
                    }
                }
                try {
                    await this.updateProgress(job,item.address,item.amount);
                    await this.loopOnP2SHV2(RPC,connection, item.address, item.amount, gasFee.toString(), privateKey, item.script,job,address,index,feeInfo);
                    await RPC.unsubscribeUtxosChanged([item.address]);
                    console.log('--------------------------->',index)
                }catch (e) {
                    console.log('loop error----------->',e);
                }
            });
            // 等待所有任务完成
            await Promise.allSettled(tasks);
            await RPC.unsubscribeUtxosChanged(p_address);
            this.log('Transaction successfully processed.', 'INFO');
            await RPC.disconnect();
            return "done";
        } catch (error) {
            this.log(`Error processing task: ${error}`, 'ERROR');
            if (error instanceof Error) {
                console.error("Stack trace:", error.stack);
            }
            throw error;
        }
    }

    processReferer (
        feeAmount: number,
        rate:number,
        address:string,
        threshold = 0.22
    ){
        let outputs:any;
        if (address && typeof address === "string" && rate && typeof rate === "number") {
            const amountInKaspa = parseFloat(sompiToKaspaString(feeAmount)) * rate;
            if (amountInKaspa >= threshold) {
                const amountInSompi = kaspaToSompi(amountInKaspa.toString());
                if (amountInSompi !== undefined) {
                    outputs = {
                        address,
                        amount: amountInSompi,
                    };
                }
            }
        }
        return outputs;
    };

    async loopOnP2SHV2(RPC,connection: RpcConnection, P2SHAddress: string, amountNum: number, gasFee: string, privateKey,script:ScriptBuilder,job:Job,address,index:number,feeInfo:any) {
        let errorIndex=0;
        let cacheNum:string|null = await redis.hget("mint_task_status_"+job.id,P2SHAddress);
        let amount:number = amountNum;

        let isFirst:boolean = true;
        //说明不是第一次进来
        if(cacheNum!=null && parseInt(cacheNum) != amountNum){
            isFirst = false
        }

        if(cacheNum !== null){
            amount = parseInt(cacheNum);
        }


        let mintTotal = amount;
        let flag = true;
        console.log('----------------->',P2SHAddress,amount);
        while (amount>0 && flag){
            const { entries: entries } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress] });
            if (entries.length === 0) {
                console.error('entries is null',P2SHAddress);
                await this.sleep(3);
                errorIndex++
                if(errorIndex>10){
                    flag = false;
                }
                continue;
            }
            let total = entries.reduce((agg, curr) => {
                return curr.amount + agg;
            }, 0n);
            let toAddress = P2SHAddress;
            if(job.data.status =='cancel'){
                console.log('cancel:'+job.id);
                await this.updateProgress(job,P2SHAddress,amount,'canceled');
                toAddress = address;
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
                // 扣除总费用
                outputs[0].amount = total - kaspaToSompi(gasFee)!-feeInfo.amount;
                const referer: REFERER = job.data.referer;
                let lv1Outputs:IPaymentOutput;
                let lv2Outputs:IPaymentOutput;
                if(referer.lv1_address && referer.lv1_rate){
                    lv1Outputs = this.processReferer(feeInfo.amount, referer.lv1_rate, referer.lv1_address);
                    outputs.push(lv1Outputs);
                    feeInfo.amount = feeInfo.amount-lv1Outputs.amount;
                }
                if(referer.lv2_address && referer.lv2_rate){
                    lv2Outputs = this.processReferer(feeInfo.amount, referer.lv2_rate, referer.lv2_address);
                    outputs.push(lv2Outputs);
                    feeInfo.amount = feeInfo.amount-lv2Outputs.amount;
                }
                //扣除代理费用
                outputs.push(feeInfo);
                console.log(feeInfo,outputs);
            }

            const transaction = createTransaction(entries, outputs,kaspaToSompi(gasFee)!, "", 1);
            transaction.inputs.forEach((_,index) => {
                let privateKeyObj = new PrivateKey(privateKey);
                let signature = createInputSignature(transaction, index, privateKeyObj, SighashType.All);
                transaction.inputs[index].signatureScript = script.encodePayToScriptHashSignatureScript(signature);
            })

            let submittedTransactionId;
            try {
                submittedTransactionId = await RPC.submitTransaction({ transaction });
                amount--;
                errorIndex = 0;
                //submittedTransactionId = submittedTransactionId.transactionId; // 提取 transactionId
                await  connection.listenForUtxoChanges(P2SHAddress, submittedTransactionId.transactionId.toString());
                await this.updateProgress(job, P2SHAddress, amount);
            } catch (error) {
                errorIndex++;
                if (errorIndex > 8) {
                    console.log('Error----------------------->', error);
                    flag = false;
                }
                continue;
            }
            await this.sleep(2);
        }
        console.log('done----------------------->');
        return true;
    }
    async getTaskStatus(taskId: string|number) {
        const job = await this.taskQueue.getJob(taskId);
        if(!job){
            return undefined;
        }
        const {status} = job.data;
        return status;
    }
}

export default MintTask;