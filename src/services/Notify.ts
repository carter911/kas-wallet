import axios from "axios";

class Notify {

    async sendMessage(url:string,data:any) {
        try {
            const response = await axios.post(url,data);
            return response.data.result;
        } catch (error) {
            console.error(`Error fetching data for token list`, error);
            throw error;
        }
    }
}
export default Notify;
