import { Request, Response } from 'express';
import Wallet from '../services/Wallet';
import Keys from '../services/Keys';
import Krc from '../services/Krc';
import {parseAmount,formatAmount} from "../services/Misc";
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
        const address = await key.generateAddressFromXPrv(xprv);
        res.status(200).json(address);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function importByPrivateKey(req: Request, res: Response): Promise<void> {
    const { privateKey } = req.body;
    if (!privateKey || typeof privateKey !== 'string') {
        console.warn('privateKey is undefined');
        res.status(401).json({ error: 'privateKey is undefined' });
        return;
    }
    try {
        const connection = await req.pool.getConnection();
        const wallet = new Wallet(privateKey,connection);
        const address = wallet.getAddress();
        res.status(200).json({address:address});
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

    try {
        const connection = await req.pool.getConnection();
        // const RPC = await connection.getRpcClient();
        // const request = {
        //     numInputs: 1,     // 输入数量
        //     numOutputs: 1     // 输出数量
        // };
        //const fee = await RPC.getFeeEstimate(request);
        //console.log(fee?.estimate);
        const wallet = new Wallet(privateKey.toString(),connection);
        const address = wallet.getAddress();
        const balance = await wallet.getBalance();
        const Krc20 = new Krc();
        const ticks = await Krc20.getTickList(address.toString());
        // if(ticks){
        //     ticks.forEach(function (tick,index){
        //         ticks[index].balance = parseAmount(tick.balance.toString(),tick.dec)
        //     });
        // }
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
        const connection = await req.pool.getConnection();
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
    const {privateKey, address,ticker,amount,gasFee } = req.body;
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
    if (!ticker) {
        console.warn('ticker is undefined, using default network.');
        res.status(401).json({ error: 'ticker is undefined, using default network.' });
    }
    try {
        const connection = await req.pool.getConnection();
        const wallet = new Wallet(privateKey.toString(),connection);

        const sendAddress = wallet.getAddress();
        let sendAmount:string = "";
            await new Krc().getTickBalance(sendAddress,ticker).then((info)=>{
                console.log(info.balance.toString(),info.dec);
            let balance = parseAmount(info.balance.toString(),info.dec)
            if(balance<amount){
                throw new Error("Insufficient balance");
            }
            sendAmount = formatAmount(amount.toString(),info.dec);
        }).catch((error)=>{
            console.log(error);
            throw new Error("Insufficient balance");
        });

        const transactionId = await wallet.transfer(ticker.toString(),address.toString(),sendAmount,gasFee);
        res.status(200).json({transactionId:transactionId});
    } catch (error: any) {
        res.status(503).json({ error: error.message });
    }
}


export async function market(req: Request, res: Response): Promise<void> {
    const {privateKey,ticker,amount,gasFee } = req.body;
    if (!privateKey) {
        console.warn('privateKey is undefined, using default network.');
        res.status(401).json({ error: 'privateKey is undefined, using default network.' });
    }
    if (!amount) {
        console.warn('amount is undefined, using default network.');
        res.status(401).json({ error: 'amount is undefined, using default network.' });
    }
    if (!ticker) {
        console.warn('ticker is undefined, using default network.');
        res.status(401).json({ error: 'ticker is undefined, using default network.' });
    }
    try {
        const connection = await req.pool.getConnection();
        const wallet = new Wallet(privateKey.toString(),connection);
        const sendAmount = amount*100000000;
        const sendAddress = wallet.getAddress();
        await new Krc().getTickList(sendAddress).then((info)=>{
            if(info.balance<sendAmount){
                throw new Error("Insufficient balance");
            }
        });
        const transactionId = await wallet.market(ticker.toString(),sendAmount.toString(),gasFee);
        res.status(200).json({transactionId:transactionId});
    } catch (error: any) {
        res.status(503).json({ error: error.message });
    }
}

// export async function mint(req: Request, res: Response): Promise<void> {
//     const {privateKey, address,tick,amount,gasFee } = req.body;
//     try {
//         console.log(req.body);
//         const connection = await rpcPool.getConnection();
//         const wallet = new Wallet(privateKey.toString(),connection);
//         wallet.mint(tick,amount,gasFee.toString(),address).then((transactionId)=>{
//             res.status(200).json({transactionId:transactionId});
//         }).catch((error)=>{
//             res.status(500).json({ error: error.message });
//         });
//     } catch (error: any) {
//         res.status(500).json({ error: error.message });
//     }
// }
//
//
// export async function mint2(req: Request, res: Response): Promise<void> {
//     const {tick,amount,gasFee } = req.query;
//
//     if (!amount|| typeof amount !== 'number') {
//         console.warn('amount is undefined, using default network.');
//         res.status(401).json({ error: 'amount is undefined, using default network.' });
//         return ;
//     }
//     if (!tick || typeof tick !== 'string') {
//         console.warn('tick is undefined, using default network.');
//         res.status(401).json({ error: 'tick is undefined, using default network.' });
//         return ;
//     }
//     if (!gasFee|| typeof gasFee !== 'number') {
//         console.warn('tick is undefined, using default network.');
//         res.status(401).json({ error: 'tick is undefined, using default network.' });
//         return ;
//     }
//     try {
//         const privateKey ="ef20e4684a48528faf7a73cafed5fb97bbf89e597a4ced6c9ceaa829cf362cbf";
//         //console.log(req.body);
//
//         const connection = await rpcPool.getConnection();
//         const wallet = new Wallet(privateKey.toString(),connection);
//
//         wallet.mint(tick,amount,gasFee).then((transactionId)=>{
//             res.status(200).json({transactionId:transactionId});
//         }).catch((error)=>{
//             res.status(500).json({ error: error.message });
//         });
//     } catch (error: any) {
//         res.status(500).json({ error: error.message });
//     }
// }

