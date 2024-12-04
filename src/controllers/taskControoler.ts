import { Request, Response } from 'express';
import { taskQueue, getTaskMintStatus, cancelTask } from '../services/taskQueue';
import Wallet from "../services/Wallet";

// 提交任务的控制器
export async function submitForm(req: Request, res: Response): Promise<void> {
    const { privateKey, ticker, gasFee, amount,walletNumber, network } = req.body;

    //amount mint张数
    //gasFee mint手续费
    //最后分佣 每个钱包的金额为 amount*gasFee +amount*feeAmount+gasFee
    console.log('--------------------->',req.body);
    try {
        if(req.pool==undefined){
            console.log(11);
            return ;
        }
        const connection = await req.pool.getConnection();
        const wallet = new Wallet(privateKey.toString(),connection);
        const address = wallet.getAddress();
        const balance = await wallet.getBalance();

        const balance2 = parseFloat(balance.replace(/,/g, ''));
        console.log(balance,balance2);
        if(balance2<(amount+gasFee)*walletNumber){
            res.status(400).json({ error: address+' :Insufficient balance' });
            return;
        }
        console.log('--------------------->',balance);
        // 将任务数据添加到 Bull 队列
        const job = await taskQueue.add({
            privateKey,
            ticker,
            gasFee,
            walletNumber,
            amount,
            network,
            total:amount*walletNumber,
            current:0,
            status: 'pending',
        });
        await job.progress(0);
        // 返回任务ID以及提交确认
        res.status(202).json({
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
