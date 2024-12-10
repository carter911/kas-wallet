import {ScriptBuilder} from "../../Library/wasm/kaspa";

type ItemType = {
    address: string;
    script: ScriptBuilder;
    publicKey: string;
    amount:number;
};

type REFERER = {
    lv1_address: string;
    lv1_rate: number;
    lv2_address: string;
    lv2_rate: number;
};
export {ItemType,REFERER};