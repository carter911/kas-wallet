import { Request, Response } from 'express';
import Wallet from '../services/Wallet';
import Keys from '../services/Keys';
import Krc from '../services/Krc';
import rpcPool from "../app";
//  获取钱包地址
export async function generateAddress(req: Request, res: Response): Promise<void> {
    const {password } = req.body;
    console.log(password);
    if (!password || typeof password !== 'string') {
        console.warn('password is undefined, using default network.');
        res.status(401).json({ error: 'password is undefined, using default network.' });
        return;
    }
    try {
        const key = new Keys();
        const address = await key.generateKeys(password);
        res.status(200).json(address);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function importAddress(req: Request, res: Response): Promise<void> {
    const { xprv } = req.body;
    if (!xprv || typeof xprv !== 'string') {
        console.warn('xprv is undefined, using default network.');
        res.status(401).json({ error: 'xprv is undefined, using default network.' });
        return;
    }
    try {
        const key = new Keys();
        const address = await key.generateAddressFromXPrv(xprv.toString());
        res.status(200).json(address);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function balance(req: Request, res: Response): Promise<void> {
    const { privateKey } = req.body;
    if (!privateKey) {
        console.warn('privateKey is undefined, using default network.');
        res.status(401).json({ error: 'privateKey is undefined, using default network.' });
        return ;
    }

    console.log(privateKey);
    try {
        const connection = await rpcPool.getConnection();
        const RPC = await connection.getRpcClient();
        const request = {
            //txSize: 300,      // 交易大小，单位字节
            numInputs: 1,     // 输入数量
            numOutputs: 1     // 输出数量
        };
        const fee = await RPC.getFeeEstimate(request);
        console.log(fee?.estimate);
        const wallet = new Wallet(privateKey.toString(),connection);
        const address = wallet.getAddress();
        const balance = await wallet.getBalance();
        const Krc20 = new Krc();
        const ticks = await Krc20.getTickList(address.toString());
        res.status(200).json({balance:balance,ticks:ticks});
    } catch (error: any) {
        res.status(500).json({error: error.message});
    }
}

export async function send(req: Request, res: Response): Promise<void> {
    const {privateKey, address,amount,gasFee } = req.body;
    if (!privateKey) {
        console.warn('privateKey is undefined, using default network.');
        res.status(401).json({ error: 'privateKey is undefined, using default network.' });
        return ;
    }
    if (!address) {
        console.warn('address is undefined, using default network.');
        res.status(401).json({ error: 'address is undefined, using default network.' });
        return ;
    }
    if (!amount) {
        console.warn('amount is undefined, using default network.');
        res.status(401).json({ error: 'amount is undefined, using default network.' });
        return ;
    }

    try {
        const connection = await rpcPool.getConnection();
        const wallet = new Wallet(privateKey.toString(),connection);
        console.log(wallet.getAddress())
        wallet.getBalance().then((balance)=>{
            console.log(balance);
            if(balance<amount){
                throw new Error("Insufficient balance");
            }
        });
        const transactionId = await wallet.send(address.toString(),amount,gasFee||0.00002);
        res.status(200).json({transactionId:transactionId});
    } catch (Error: any) {
        res.status(500).json({ error: Error.message });
    }
}


export async function transfer(req: Request, res: Response): Promise<void> {
    const {network,rpcUrl,privateKey, address,tick,amount,gasFee } = req.body;
    console.log(rpcUrl)
    if (!network) {
        console.warn('Network is undefined, using default network.');
        res.status(401).json({ error: 'Network is undefined, using default network.' });
    }
    if (!privateKey) {
        console.warn('privateKey is undefined, using default network.');
        res.status(401).json({ error: 'privateKey is undefined, using default network.' });
    }
    if (!address) {
        console.warn('address is undefined, using default network.');
        res.status(401).json({ error: 'address is undefined, using default network.' });
    }
    if (!amount) {
        console.warn('amount is undefined, using default network.');
        res.status(401).json({ error: 'amount is undefined, using default network.' });
    }
    if (!tick) {
        console.warn('tick is undefined, using default network.');
        res.status(401).json({ error: 'tick is undefined, using default network.' });
    }
    try {
        const connection = await rpcPool.getConnection();
        const wallet = new Wallet(privateKey.toString(),connection);
        const sendAmount = amount*100000000;
        const sendAddress = wallet.getAddress();
        await new Krc().getTickList(sendAddress).then((info)=>{
            if(info.balance<sendAmount){
                throw new Error("Insufficient balance");
            }
        });
        const transactionId = await wallet.transfer(tick.toString(),address.toString(),sendAmount,gasFee);
        res.status(200).json({transactionId:transactionId});
    } catch (error: any) {
        res.status(503).json({ error: error.message });
    }
}

export async function mint(req: Request, res: Response): Promise<void> {
    const {privateKey, address,tick,amount,gasFee } = req.body;
    try {
        console.log(req.body);
        const connection = await rpcPool.getConnection();
        const wallet = new Wallet(privateKey.toString(),connection);
        wallet.mint(tick,amount,gasFee.toString(),address).then((transactionId)=>{
            res.status(200).json({transactionId:transactionId});
        }).catch((error)=>{
            res.status(500).json({ error: error.message });
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
