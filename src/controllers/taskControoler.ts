// src/controllers/taskController.ts
import { Request, Response } from 'express';
import { taskQueue, getTaskStatus, cancelTask } from '../services/taskQueue';
import Wallet from "../services/Wallet";
import rpcPool from "../app";

// 提交任务的控制器
export async function submitForm(req: Request, res: Response): Promise<void> {
    const { privateKey, ticker, gasFee, amount,walletNumber, timeout, network } = req.body;
    console.log('--------------------->',req.body);
    try {
        const connection = await rpcPool.getConnection();
        const wallet = new Wallet(privateKey.toString(),network.toString(),connection);
        const address = wallet.getAddress();
        const balance = await wallet.getBalance();
        if(parseFloat(balance)<(amount+gasFee)*walletNumber){
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
            timeout,
            network,
            total:amount*walletNumber,
            current:0,
            status: 'pending',
        });
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
        const status = await getTaskStatus(taskId);
        res.status(200).json({ taskId, status });
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
