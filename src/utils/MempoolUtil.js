import mempoolJS from "@mempool/mempool.js";
import config from '../conf/config.js'
import axios from "axios";
import UnisatAPI from "../lib/UnisatAPI.js";
import * as logger from '../conf/logger.js';

let mempoolHost = config['mempoolHost'];
if (config.networkName === 'testnet4') {
    mempoolHost = `${mempoolHost}/testnet4`
}
const {bitcoin: {addresses}} = mempoolJS({
    hostname: mempoolHost,
    network: config.networkName
});

const {bitcoin: {transactions}} = mempoolJS({
    hostname: mempoolHost,
    network: config.networkName
});

const {bitcoin: {fees}} = mempoolJS({
    hostname: mempoolHost,
    network: config.networkName
});

const {bitcoin: {mempool}} = mempoolJS({
    hostname: mempoolHost,
    network: config.networkName
});

const {bitcoin: {blocks}} = mempoolJS({
    hostname: mempoolHost,
    network: config.networkName
});
    
export default class MempoolUtil {
    static async getAddress(address) {
        return await addresses.getAddress({address});
    }

    static async getUtxoByAddress(address, confirmed = false) {
        try {
            const start = new Date().getTime()
            const utxoList = await addresses.getAddressTxsUtxo({address});
            const end = new Date().getTime()
            logger.info(`getUtxoByAddress address: ${address} cost: ${end - start}ms`)

            let filteredUtxoList = utxoList;
            if (confirmed) {
                filteredUtxoList = utxoList.filter(utxo => utxo.status.confirmed);
            }

            filteredUtxoList.sort((a, b) => b.value - a.value);
            return filteredUtxoList.map(utxo => {
                return {
                    txid: utxo.txid,
                    vout: utxo.vout,
                    value: utxo.value,
                    address: address,
                    height: utxo.status.block_height,
                    status: utxo.status.confirmed
                }
            });
        } catch (err) {
            return UnisatAPI.getAllUtxo(address, confirmed);
        }
    }


    static async getAddressTxs(address) {
        return await addresses.getAddressTxs({address});
    }

    static async getAddressTxsChain(address, last_seen_txid) {
        const url = `https://${mempoolHost}${strNetwork === "testnet" ? "/testnet" : ""}/api/address/${address}/txs/chain/${last_seen_txid}`
        const resp = await axios.get(url, {
            timeout: 10000
        })
        return resp.data;
    }

    static async getTxHex(txid) {
        return await transactions.getTxHex({txid});
    }

    static async getTxHexEx(txid) {
        try {
            return await transactions.getTxHex({txid});
        } catch (err) {
            if (err.response.status === 404) {
                return null;
            }
            throw err;
        }
    }

    static async getTx(txid) {
        return await transactions.getTx({txid});
    }

    static async getTxEx(txid) {
        try {
            return await transactions.getTx({txid});
        } catch (err) {
            if (err.response.status === 404) {
                return null;
            }
            throw err;
        }
    }

    static async getTxRbf(txid) {
        const url = `https://${mempoolHost}/api/v1/tx/${txid}/rbf`
        try {
            const resp = await axios.get(url, {
                timeout: 10000
            })
            return resp.data;
        } catch (err) {
            if (err.response.status === 404) {
                return null;
            }
            throw err;
        }
    }

    static async getTxOutspend(txid, vout) {
        return await transactions.getTxOutspend({
            txid,
            vout
        });
    }

    static async getTxOutspends(txid) {
        return await transactions.getTxOutspends({txid});
    }

    static async getTxStatus(txid) {
        const txStatus = await transactions.getTxStatus({txid});
        return txStatus.confirmed;
    }

    static async getTxStatusEx(txid) {
        const url = `https://${mempoolHost}/api/tx/${txid}/status`
        const resp = await axios.get(url, {
            timeout: 10000
        })
        return resp.data;
    }

    static async postTxEx(txHex) {
        const url = `https://${mempoolHost}/api/tx`
        const resp = await axios.post(url, txHex, {
            timeout: 10000
        })
        return resp.data;
    }

    static async getFeesRecommended() {
        return await fees.getFeesRecommended();
    }

    static async getFeesMempoolBlocks() {
        return await fees.getFeesMempoolBlocks();
    }

    static async postTx(hex) {
        try {
            let host = `https://${mempoolHost}`;
            if (config.networkName !== 'testnet4' && config.networkName !== 'mainnet' ) {
                host = `https://${mempoolHost}/${config.networkName}`;
            }
            const response = await axios.post(`${host}/api/tx`, hex, {
                headers: {
                    'Content-Type': 'text/plain',
                },
                timeout: 10000
            });
            return response.data;
        } catch (err) {
            const errMessage = err.response?.data || err.message;
            throw new Error(errMessage);
        }
    }

    static async getMempoolRecent() {
        return await mempool.getMempoolRecent()
    }

    static async getMempoolTxids() {
        return await mempool.getMempoolTxids()
    }

    static async getBlocksTipHeight(){
        return await blocks.getBlocksTipHeight()
    }

    static async getBtcPrice(){
        if (process.env.NODE_ENV !== 'pro') {
            return 103179;
        }
        const response = await axios.get(`https://${mempoolHost}/api/v1/prices`);
        return response.data['USD'];
    }

    static async getBlockTxIds(hash) {
        try {
            return await blocks.getBlockTxids({hash});
        } catch (err) {
            if (err.response.status === 404) {
                return [];
            }
            throw err;
        }
    }

    static async getBlockHash(height) {
        let host = `https://${mempoolHost}`;
        if (config.networkName !== 'testnet4' && config.networkName !== 'mainnet' ) {
            host = `https://${mempoolHost}/${config.networkName}`;
        }
        const url = `${host}/api/block-height/${height}`
        const resp = await axios.get(url, {
            timeout: 10000
        })
        return resp.data;
    }

    static async getOutspend(txid, vout) {
        return await transactions.getTxOutspend({txid, vout});
    }

    static async getCurrentHeight() {
        return await blocks.getBlocksTipHeight();
    }
}