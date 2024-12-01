import {Mnemonic, XPrv } from '../Library/wasm/kaspa';
class Keys {
    private network: string;

    constructor() {
        this.network = process.env.KASPA_NETWORK!;
    }

    async generateKeys(password:string|undefined): Promise<{ mnemonic: string;privateKey:string;address:string;xprv:string}> {
        const mnemonic = Mnemonic.random();
        const seed = mnemonic.toSeed(password);
        const xprv = new XPrv(seed);
        const privateKey = xprv.derivePath("m/44'/111111'/0'/0/0").toPrivateKey(); // Derive the private key for the receive address
        const publicKey = privateKey.toPublicKey();
        const address = publicKey.toAddress(this.network).toString();
        return {
            xprv:xprv.toString(),
            mnemonic: mnemonic.phrase,
            privateKey: privateKey.toString(),
            address: address,
        };
    }

    async generateAddressFromXPrv(XPrvString: string): Promise<{privateKey:string;address:string;xprv:string}> {
        const xprv = XPrv.fromXPrv(XPrvString);
        const privateKey = xprv.derivePath("m/44'/111111'/0'/0/0").toPrivateKey(); // Derive the private key for the receive address
        const publicKey = privateKey.toPublicKey();
        const address = publicKey.toAddress(this.network).toString();
        return {
            xprv:xprv.toString(),
            privateKey: privateKey.toString(),
            address: address.toString(),
        };
    }
}
export default Keys;
