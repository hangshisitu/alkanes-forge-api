import axios from 'axios';

export default class ElectrsAPI {

    static endpoint = 'https://idclub.mempool.space/api'

    static async fetch(url, options = {timeout: 10000}) {
        try {
            const response = await axios.get(url, {
                timeout: options.timeout,
            });
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    static async getBlockTxids(hash) {
        return await this.fetch(`${this.endpoint}/block/${hash}/txids`);
    }

    static async getTx(txid) {
        return await this.fetch(`${this.endpoint}/tx/${txid}`);
    }

    static async getTxStatus(txid) {
        return await this.fetch(`${this.endpoint}/tx/${txid}/status`);
    }

    static async getTxHex(txid) {
        return await this.fetch(`${this.endpoint}/tx/${txid}/hex`);
    }



}


