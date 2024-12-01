import axios from "axios";

class Krc {
    private testnet10: string = "https://tn10api.kasplex.org/v1/krc20";
    private testnet11: string = "https://tn11api.kasplex.org/v1/krc20";
    private mainnet: string = "https://api.kasplex.org/v1/krc20";
    private baseUrl: string = "https://api.kasplex.org/v1/krc20";

    constructor() {
        const network = process.env.KASPA_NETWORK;
        if (network == "mainnet") {
            this.baseUrl = this.mainnet;
        } else if (network == "testnet-10") {
            this.baseUrl = this.testnet10;
        } else if (network == "testnet-11") {
            this.baseUrl = this.testnet11;
        }
    }

    public async getTickList(address:string) {
        try {
            const url = `${this.baseUrl}/address/${address}/tokenlist`;
            const response = await axios.get(url);
            return response.data.result;
        } catch (error) {
            console.error(`Error fetching data for token list`, error);
            throw error;
        }
    }

    public async getTickBalance(address:string,tick:string) {
        try {
            const url = `${this.baseUrl}/address/${address}/token/${tick}`;
            console.log(url)
            const response = await axios.get(url);
            console.log(response);
            return response.data.result;
        } catch (error) {
            console.error(`Error fetching data for token list`, error);
            throw error;
        }
    }

    public async getTickInfo(tick: string) {
        try {
            const response = await axios.get(`${this.baseUrl}/token/${tick}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching data for token info`, error);
            throw error;
        }
    }

    public async getMarketList(tick: string, prev?: string, next?: string) {
        try {
            let url = `${this.baseUrl}/market/${tick}`;
            const params: string[] = [];
            if (prev) params.push(`prev=${prev}`);
            if (next) params.push(`next=${next}`);
            if (params.length > 0) {
                url += `?${params.join("&")}`;
            }
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            console.error(`Error fetching market list for tick: ${tick}`, error);
            throw error;
        }
    }
}
export default Krc;
