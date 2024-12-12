import {
    PrivateKey,
    createTransactions,
    kaspaToSompi,
    sompiToKaspaString,
    IPaymentOutput,
    ScriptBuilder,
    createTransaction,
    createInputSignature,
    SighashType,
    Opcodes,
    addressFromScriptPublicKey, Transaction
} from '../Library/wasm/kaspa';
import RpcConnection from './RpcConnection';
type ItemType = {
    address:string,
    script: ScriptBuilder;
    publicKey: string;
};
const MAX_RETRIES = 20; // 最大重试次数
class Wallet {
    private privateKeyObj: PrivateKey;
    private network: string;
    private RpcConnection:RpcConnection;

    constructor(privateKey: string, RpcConnection:RpcConnection) {
        this.privateKeyObj = new PrivateKey(privateKey);
        this.network = process.env.KASPA_NETWORK!;
        this.RpcConnection = RpcConnection;
    }

    // Generate Address for the Wallet
    public getAddress() {
        const address = this.privateKeyObj.toPublicKey().toAddress(this.network).toString();
        return address;
    }
    public getPublicKey(){
        return this.privateKeyObj.toPublicKey();
    }

    async getUTXO() {
        const RPC = await this.RpcConnection.getRpcClient();
        const address =  this.getAddress();
        const { entries } = await RPC.getUtxosByAddresses({ addresses: [address] });
        return entries;
    }

    async rbfTransaction(transactionId: string, amount: number, gasFee: number) {
        const address = this.getAddress();
        console.log(amount,transactionId);
        const RPC = await this.RpcConnection.getRpcClient();
        const { entries } = await RPC.getUtxosByAddresses({ addresses: [address] });
        const { transactions } = await createTransactions({
            entries,
            outputs: [],
            changeAddress: address,
            priorityFee: kaspaToSompi(gasFee.toString())
        });

        if (transactions.length > 0) {
            const firstTransaction = transactions[0];
            console.log(`TrxManager: Payment with transaction ID: ${firstTransaction.id} to be signed and submitted`);
            firstTransaction.sign([this.privateKeyObj]);
            const transaction = await RPC.submitTransactionReplacement(firstTransaction);
            return transaction.transactionId;
        }
    }



    // Get Balance of the Wallet
    async getBalance() {
        const RPC = await this.RpcConnection.getRpcClient();
        const address = this.getAddress();
        const balance = await RPC.getBalanceByAddress({ address });
        //console.log(balance,address)
        return sompiToKaspaString(balance.balance).toString();
    }

    async feeEstimation(inputCount:number,outputCount:number){
        const RPC = await this.RpcConnection.getRpcClient();
        const request = {
            numInputs: inputCount|1,     // 输入数量
            numOutputs: outputCount|1     // 输出数量
        };
        let feeEstimate = await RPC.getFeeEstimate(request);
        return feeEstimate.estimate;
    }

    // Send KAS
    async send(toAddress: string, amount: number, gasFee: number=0.00000) {
        const RPC = await this.RpcConnection.getRpcClient();
        const address = this.getAddress();
        const UTXO = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
        // UTXO.entries.forEach(function (item,index){
        //     console.log(sompiToKaspaString(item.amount),index);
        // })
        //let fee = await this.feeEstimation(1,1);
        //console.log(UTXO.entries.length,fee);
        let outputs: IPaymentOutput[] = [{
            address: toAddress,
            amount: kaspaToSompi(amount.toString())!
        }];
        const { transactions: transactions } = await createTransactions({
            priorityEntries:UTXO.entries,
            entries: UTXO.entries,
            outputs: outputs,
            changeAddress: address.toString(),
            priorityFee: kaspaToSompi(gasFee.toString())!,
            networkId: this.network,
        });


        let hash: any;
        for (const transaction of transactions) {
            transaction.sign([this.privateKeyObj], false);
            hash = await transaction.submit(RPC).catch((e:any)=>{
                console.log(e);
            });
            console.log(hash);
        }
        return hash;
    }

    async sendV2(toAddressList:any, gasFee: number=0.00002) {
        const RPC = await this.RpcConnection.getRpcClient();
        const address = this.getAddress();
        const UTXO = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
        let outputs: IPaymentOutput[] = [];
        toAddressList.forEach((toAddress:any)=>{
            outputs.push({
                address: toAddress.address.toString(),
                amount: kaspaToSompi(toAddress.amount.toString())!
            })
        })
        const { transactions: transactions } = await createTransactions({
            entries: UTXO.entries,
            outputs: outputs,
            changeAddress: address.toString(),
            priorityFee: kaspaToSompi(gasFee.toString())!,
            networkId: this.network
        });


        let hash: any;
        for (const transaction of transactions) {
            transaction.sign([this.privateKeyObj], false);
            hash = await transaction.submit(RPC);
            console.log(hash);
        }
        return hash;
    }

    async reveal(address: string, amount: number, gasFee: number,script:ScriptBuilder,change?:string) {
        const RPC = await this.RpcConnection.getRpcClient();
        const { entries: entries } = await RPC.getUtxosByAddresses({ addresses: [address] });
        if (entries.length === 0) {
            console.log('entries.length === 0');
            return;
        }
        let total = entries.reduce((agg, curr) => {
            return curr.amount + agg;
        }, 0n);

        const changeAddress = change || address;
        console.log(amount);
        const safeGasFee = gasFee ?? "0.00002"; // Use "0" or another appropriate fallback value
        const safeTotal = total ?? 0; // Default to 0 if `total` is `undefined`
        const outputs: IPaymentOutput[] = [
            {
                address: changeAddress,//找零地址
                amount: safeTotal - kaspaToSompi(safeGasFee.toString())!
            }
        ];
        const transaction = createTransaction(entries, outputs,kaspaToSompi(gasFee.toString())!, "", 1);
        transaction.inputs.forEach((_,index) => {
            let signature = createInputSignature(transaction, index, this.privateKeyObj, SighashType.All);
            transaction.inputs[index].signatureScript = script.encodePayToScriptHashSignatureScript(signature);
        })
        const submittedTransactionId = await RPC.submitTransaction({transaction}).then(function (submittedTransactionId) {
            console.log(submittedTransactionId);
            return submittedTransactionId.transactionId;
        }).catch((error) => {
            console.log('error----------------------->',error);
            throw error;
        });
        return submittedTransactionId;
    }

    public mintOP(ticker:string,i:number,address:string){
        return {p: 'krc-20', op: 'mint', tick: ticker.toLocaleUpperCase(), to: address.toString(), index:i,};
    }

    public transferOP(ticker:string,address:string,amt:string){
        return {p: 'krc-20', op: 'transfer', tick: ticker.toLocaleUpperCase(), amt: amt, to: address.toString(),};
    }

    public deployOP(ticket:string,max:string,lim:string,to?:string,dec:string="8",pre?:string){
        return {p: "krc-20",op: "deploy",tick: ticket,max: max,lim:lim,to:to,dec: dec,pre: pre};
    }

    public listOP(ticket:string,amt:string){
        return {p:'krc-20',op:"list",tick:ticket.toLocaleUpperCase(),amt:amt};
    }

    public sendOP(ticket:string){
        return {p:'krc-20',op:"send",tick:ticket.toLocaleUpperCase()};
    }


    public makeP2shAddress(privateKeyString:String,data:any):ItemType{
        const privateKey = new PrivateKey(privateKeyString.toString());
        const publicKey = privateKey.toPublicKey();
        const script:ScriptBuilder = new ScriptBuilder()
            .addData(publicKey.toXOnlyPublicKey().toString())
            .addOp(Opcodes.OpCheckSig)
            .addOp(Opcodes.OpFalse)
            .addOp(Opcodes.OpIf)
            .addData(Buffer.from('kasplex'))
            .addI64(0n)
            .addData(Buffer.from(JSON.stringify(data)))
            .addOp(Opcodes.OpEndIf);
        const P2SHAddress = addressFromScriptPublicKey(script.createPayToScriptHashScript(), this.network);
        return {
            address:P2SHAddress!.toString(),
            script:script,
            publicKey:publicKey.toString()
        }
    }


    public async transfer(tick:string,to:string,amount:string,gasFee:number=0.00002):Promise<{transactionId:string,revealTransactionId:string}>{
        try {
            const RPC = await this.RpcConnection.getRpcClient();
            const MAX_RETRIES = 20; // 最大重试次数
            const address = this.getAddress();
            const data = this.transferOP(tick,to,amount);
            console.log(data);
            const P2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),data);
            await RPC.subscribeUtxosChanged([P2SHAddress.address.toString()]);
            const transactionId = await this.send(P2SHAddress.address, 3, gasFee);
            console.log(transactionId)
            await this.RpcConnection.listenForUtxoChanges(P2SHAddress.address,transactionId.toString());
            await this.sleep(5);

            const revealTransactionId = await this.retryRequest(async () => {
                return await this.reveal(P2SHAddress.address, 3-gasFee, gasFee, P2SHAddress.script,address);
            }, MAX_RETRIES, "reveal transaction");
            console.log(revealTransactionId)
            return {transactionId:transactionId.toString(),revealTransactionId:revealTransactionId!.toString()};
        }catch (e) {
            console.log(e);
            return {transactionId:'',revealTransactionId:''};
        }
    }




    public async mint(tick:string,amount:number,gasFee:number,address?:string):Promise<{transactionId:string,revealTransactionId:string}>{
        try {

            const index =1;
            if(address ==undefined || address==""){
                address = this.getAddress();
            }
            const RPC = await this.RpcConnection.getRpcClient();

            const data = this.mintOP(tick,index,address);
            const P2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),data);

            await RPC.subscribeUtxosChanged([P2SHAddress.address.toString()]);
            const transactionId = await this.retryRequest(async () => {
                return await this.send(P2SHAddress.address.toString(), amount, gasFee);
            }, MAX_RETRIES, "send transaction");
            console.log(`Transaction sent: ${transactionId}`);
            await this.RpcConnection.listenForUtxoChanges(P2SHAddress.address,transactionId.toString());
            await this.sleep(5);
            const revealTransactionId = await this.retryRequest(async () => {
                return await this.reveal(
                    P2SHAddress.address.toString(),
                    amount - gasFee,
                    gasFee,
                    P2SHAddress.script
                );
            }, MAX_RETRIES, "reveal transaction");
            console.log(`Reveal transaction completed: ${revealTransactionId}`);
            return {transactionId:transactionId.toString(),revealTransactionId:revealTransactionId!.toString()};
        }catch (e) {
            console.log(e);
            return {transactionId:'',revealTransactionId:''};
        }
    }

    private async retryRequest<T>(
        action: () => Promise<T>,
        maxRetries: number,
        actionDescription: string
    ): Promise<T> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                return await action(); // 执行传入的异步操作
            } catch (error) {
                retries++;
                console.warn(
                    `Attempt ${retries} failed for ${actionDescription}: ${error}`
                );
                if (retries >= maxRetries) {
                    throw new Error(`Max retries reached for ${actionDescription}`);
                }
                await this.sleep(2); // 可根据需要调整重试间隔
            }
        }
        throw new Error(`Failed to execute ${actionDescription} after ${maxRetries} retries`);
    }

    async sleep(seconds:number) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    public async market(tick:string,amount:string,gasFee:number):Promise<{transactionId:string,revealTransactionId:string}>{
        try {
            const P2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),this.listOP(tick,amount));
            const RPC = await this.RpcConnection.getRpcClient();
            await RPC.subscribeUtxosChanged([P2SHAddress.address.toString()]);

            if(!gasFee){
                gasFee = 0.0002;
            }
            const transactionId = await this.retryRequest(async () => {
                return await this.send(P2SHAddress.address.toString(), 3, gasFee);
            }, MAX_RETRIES, "send transaction");
            //const transactionId = await this.send(P2SHAddress.address, 3);
            await this.RpcConnection.listenForUtxoChanges(P2SHAddress.address,transactionId.toString());
            await RPC.unsubscribeUtxosChanged([P2SHAddress.address.toString()]);

            //reveal
            const SendP2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),this.sendOP(tick));
            await RPC.subscribeUtxosChanged([SendP2SHAddress.address.toString()]);
            const revealTransactionId = await this.retryRequest(async () => {
                return await this.reveal(P2SHAddress.address, 3-gasFee, gasFee, P2SHAddress.script,SendP2SHAddress.address);
            }, MAX_RETRIES, "reveal transaction");
            if(revealTransactionId){
                await this.RpcConnection.listenForUtxoChanges(SendP2SHAddress.address,revealTransactionId.toString());
            }
            await RPC.unsubscribeUtxosChanged([SendP2SHAddress.address.toString()]);
            return {transactionId:transactionId!.toString(),revealTransactionId:revealTransactionId!.toString()};
        }catch (e) {
            console.log(e);
            return {transactionId:'',revealTransactionId:''};
        }
    }

    public async sell(tick:string,tickAmount:string,amount:string,gasFee:number):Promise<{transactionId:string,revealTransactionId:string,tx:any}>{
        try {

            const P2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),this.listOP(tick,tickAmount));
            const RPC = await this.RpcConnection.getRpcClient();
            await RPC.subscribeUtxosChanged([P2SHAddress.address.toString()]);

            if(!gasFee){
                gasFee = 0.0002;
            }
            const transactionId = await this.retryRequest(async () => {
                return await this.send(P2SHAddress.address.toString(), 3, gasFee);
            }, MAX_RETRIES, "send transaction");
            //const transactionId = await this.send(P2SHAddress.address, 3);
            await this.RpcConnection.listenForUtxoChanges(P2SHAddress.address,transactionId.toString());
            await RPC.unsubscribeUtxosChanged([P2SHAddress.address.toString()]);

            //reveal
            const SendP2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),this.sendOP(tick));
            await RPC.subscribeUtxosChanged([SendP2SHAddress.address.toString()]);
            const revealTransactionId = await this.retryRequest(async () => {
                return await this.reveal(P2SHAddress.address, 3-gasFee, gasFee, P2SHAddress.script,SendP2SHAddress.address);
            }, MAX_RETRIES, "reveal transaction");
            if(revealTransactionId){
                await this.RpcConnection.listenForUtxoChanges(SendP2SHAddress.address,revealTransactionId.toString());
            }
            await RPC.unsubscribeUtxosChanged([SendP2SHAddress.address.toString()]);
            const tx:any = await this.txSign(this.sendOP(tick),revealTransactionId!.toString(),BigInt(amount));

            console.log('----------------->',tx);
            return {tx:tx.toString(),transactionId:transactionId!.toString(),revealTransactionId:revealTransactionId!.toString()};

        }catch (e) {
            console.log(e);
            return {tx:"",transactionId:'',revealTransactionId:''};
        }
    }

    public async txSign(data: Object, hash: string, amount: bigint) {
        console.log(amount);
        //const u64MaxValue = 18446744073709551615;
        const privateKey = this.privateKeyObj;
        const publicKey = privateKey.toPublicKey();
        const address = publicKey.toAddress(this.network);
        const script = new ScriptBuilder()
            .addData(privateKey.toPublicKey().toXOnlyPublicKey().toString())
            .addOp(Opcodes.OpCheckSig)
            .addOp(Opcodes.OpFalse)
            .addOp(Opcodes.OpIf)
            .addData(Buffer.from("kasplex"))
            .addI64(0n)
            .addData(Buffer.from(JSON.stringify(data, null, 0)))
            .addOp(Opcodes.OpEndIf);
        let scriptPublicKey = script.createPayToScriptHashScript()
        const P2SHAddress = addressFromScriptPublicKey(scriptPublicKey, this.network)!;

        const RPC = await this.RpcConnection.getRpcClient();

        const {entries} = await RPC.getUtxosByAddresses({addresses: [P2SHAddress.toString()]});

        let entry:any = [];
        let enterAmount = 0n
        for (var item of entries) {
            if (item.outpoint.transactionId == hash) {
                enterAmount = item.amount
                console.log('enterAmount', enterAmount)
                console.log('entry', item.entry);
                entry = item.entry;
                break
            }
        }
        let output = [{
            address: address.toString(),
            amount: kaspaToSompi(amount.toString())!,
        }];
        const tx:Transaction = createTransaction([entry], output, 0n, "", 1);
        console.log(tx.outputs);
        let signature = createInputSignature(tx, 0, privateKey, SighashType.SingleAnyOneCanPay);
        tx.inputs[0].signatureScript = script.encodePayToScriptHashSignatureScript(signature)
        return tx.serializeToSafeJSON();
    }


    public async pskt(data: string) {
        const privateKey = this.privateKeyObj;
        const publicKey = privateKey.toPublicKey();
        const address = publicKey.toAddress(this.network);
        const RPC = await this.RpcConnection.getRpcClient();
        try {
            //sell tx
            let tx:Transaction = Transaction.deserializeFromSafeJSON(data);
            console.log(tx.inputs[0].utxo);
            const {entries} = await RPC.getUtxosByAddresses({addresses: [address.toString()]});
            let total:bigint = entries.reduce((agg, curr) => {
                return curr.amount + agg;
            }, 0n);

            if(tx.inputs.length<1
                || tx.inputs[0].utxo === undefined
                || tx.inputs[0].utxo.outpoint === undefined
                || tx.inputs[0].utxo.outpoint.transactionId === undefined
                || tx.inputs[0].utxo.address === undefined
                || tx.inputs[0].utxo.amount === undefined
                || tx.inputs[0].utxo.scriptPublicKey === undefined){
                console.log('tx.inputs.length<1');
                return  false;
            }


            let entry:any = {
                "address": tx.inputs[0].utxo.address.toString(),
                "amount": tx.inputs[0].utxo.amount,
                "outpoint": {
                    "transactionId": tx.inputs[0].utxo.outpoint.transactionId,
                    "index": 0
                },
                "scriptPublicKey": "0000" + tx.inputs[0].utxo.scriptPublicKey.script,
                "blockDaaScore": tx[0].blockDaaScore,
                "isCoinbase": false
            }


            entries.unshift(entry);
            console.log(entries);

            if (entries.length === 0) {
                console.log('entries.length === 0');
                return;
            }
            let outputs:IPaymentOutput[] = [{
                address: "kaspatest:qpp2xdfehz4jya6pu5uq0vghvsf8g4xsa9hq4ua40lgfaktjdxhxgzylhyr9t",
                amount: tx.outputs[0].value!
            }];

            console.log(total-tx.outputs[0].value!);
            outputs.push({
                address: address.toString(),
                amount: total-tx.outputs[0].value!
            });
            console.log(outputs);

            const {transactions, summary} = await createTransactions({
                priorityEntries: entries,
                entries: entries,
                outputs: outputs,
                changeAddress: address.toString(),
                priorityFee: 1n,
                networkId: this.network
            });
            for (const transaction of transactions) {

                transaction.fillInput(0, tx.inputs[0].signatureScript);
                transaction.sign([privateKey], false);
                await transaction.submit(RPC);
            }

            return summary.finalTransactionId
        } catch (error) {
            console.log(error);
            return error
        }
    }
    //
    // public async deploy(tick:string,max:string,lim:string,to:string,gasFee:number,dec:string="8"):Promise<{transactionId:string,revealTransactionId:string}>{
    //     try {
    //         const data = this.deployOP(tick,max,lim,to,dec);
    //         const P2SHAddress = this.makeP2shAddress(this.privateKeyObj.toString(),data);
    //         const transactionId = await this.send(P2SHAddress.address, 3, gasFee);
    //         const address = await this.getAddress();
    //         const revealTransactionId = await this.reveal(P2SHAddress.address, 3-gasFee, gasFee,P2SHAddress.script, address);
    //         return {transactionId:transactionId.toString(),revealTransactionId:revealTransactionId!.toString()};
    //     }catch (e) {
    //         console.log(e);
    //         return {transactionId:'',revealTransactionId:''};
    //     }
    //}
}
export default Wallet;
