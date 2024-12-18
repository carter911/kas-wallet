import { Request, Response } from 'express';
import {getTaskMintStatus, cancelTask } from '../services/taskQueue';
import {taskQueue} from "../middleware";
import Wallet from "../services/Wallet";
const crypto = require('crypto');
// mint
export async function submitForm(req: Request, res: Response): Promise<void> {
    const { privateKey, ticker, gasFee, amount,walletNumber, network,notifyUrl,refererInfo } = req.body;

    if (!privateKey || typeof privateKey!=="string") {
        res.status(401).json({ error: 'privateKey is undefined, using default network.' });
        return ;
    }
    if (!ticker || typeof ticker!=="string") {
        res.status(401).json({ error: 'ticker is undefined,' });
        return ;
    }

    if (!gasFee || typeof gasFee!=="number") {
        res.status(401).json({ error: 'gasFee is undefined,' });
        return ;
    }

    if (!walletNumber|| typeof walletNumber!=="number") {
        res.status(401).json({ error: 'walletNumber is undefined' });
        return ;
    }

    if (!amount|| typeof amount!=="number") {
        console.warn('amount is undefined, using default network.');
        res.status(401).json({ error: 'amount is undefined, using default network.' });
        return ;
    }
    let referer = undefined;
    if(refererInfo){
        referer = refererInfo;
    }
    try {
        if(req.pool==undefined){
            console.log(11);
            return ;
        }
        const connection = await req.pool.getConnection();
        const wallet = new Wallet(privateKey,connection);
        const address = wallet.getAddress();
        const balance = await wallet.getBalance();

        const balance2 = parseFloat(balance.replace(/,/g, ''));
        console.log(balance,balance2);

        if(balance2<((amount*gasFee)+walletNumber)){
            res.status(400).json({ error: address+' :Insufficient balance' });
            return;
        }
        console.log('--------------------->',balance);
        // 将任务数据添加到 Bull 队列
        let data = {
            privateKey,
            ticker,
            gasFee,
            walletNumber,
            amount,
            network,
            total:amount,
            current:0,
            status: 'pending',
            notifyUrl,
            referer,
        };
        const timestamp = Math.floor(Date.now() / 1000);
        const hash = crypto.createHash('sha256').update(JSON.stringify(data)+timestamp).digest('hex');
        const job = await taskQueue.add(data, { jobId: hash});
        await job.progress(0);
        // 返回任务ID以及提交确认
        res.status(200).json({
            message: "Task is being processed",
            taskId: job.id,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
// 获取任务状态
export async function getStatus(req: Request, res: Response): Promise<void> {
    const { taskId } = req.query;

    if (typeof taskId !== 'string') {
        res.status(400).json({ error: 'taskId is required' });
        return;
    }
    console.log(req.query);
    try {
        const data = await getTaskMintStatus(taskId);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}


// 取消任务
export async function cancel(req: Request, res: Response): Promise<void> {
    const { taskId } = req.query;

    if (typeof taskId !== 'string') {
        res.status(400).json({ error: 'taskId is required' });
        return;
    }

    try {
        const response = await cancelTask(taskId);
        res.status(200).json({ message: response });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
