import axios from 'axios';

export default class ElectrsAPI {

    static endpoint = 'https://idclub.mempool.space/api'

    static async getBlockTxids(hash) {
        try {
            const response = await axios.get(`${this.endpoint}/block/${hash}/txids`);
            return response.data;
        } catch (error) {
            if (error.response.status === 404) {
                return [];
            }
            throw error;
        }
    }

    static async getTx(txid) {
        try {
            const response = await axios.get(`${this.endpoint}/tx/${txid}`);
            return response.data;
        } catch (error) {
            if (error.response.status === 404) {
                return null;
            }
            throw error;
        }
    }

    static async getTxStatus(txid) {
        try {
            const response = await axios.get(`${this.endpoint}/tx/${txid}/status`);
            return response.data;
        } catch (error) {
            if (error.response.status === 404) {
                return null;
            }
            throw error;
        }
    }

    static async getTxHex(txid) {
        try {
            const response = await axios.get(`${this.endpoint}/tx/${txid}/hex`);
            return response.data;
        } catch (error) {
            if (error.response.status === 404) {
                return null;
            }
            throw error;
        }
    }



}


