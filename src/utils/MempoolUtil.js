import mempoolJS from "@mempool/mempool.js";
import config, {network} from '../conf/config.js'
import axios from "axios";

const mempoolHost = config['mempoolHost'];
const strNetwork = network.bech32 === 'tb' ? 'testnet' : 'bitcoin'
console.info(`mempoolHost: ${mempoolHost} network: ${strNetwork}`)

const {bitcoin: {addresses}} = mempoolJS({
    hostname: mempoolHost,
    network: strNetwork
});

const {bitcoin: {transactions}} = mempoolJS({
    hostname: mempoolHost,
    network: strNetwork
});

const {bitcoin: {fees}} = mempoolJS({
    hostname: mempoolHost,
    network: strNetwork
});

const {bitcoin: {mempool}} = mempoolJS({
    hostname: mempoolHost,
    network: strNetwork
});

const {bitcoin: {blocks}} = mempoolJS({
    hostname: mempoolHost,
    network: strNetwork
});
    
export default class MempoolUtil {
    static async getUtxoByAddress(address) {
        const start = new Date().getTime()
        const utxoList = await addresses.getAddressTxsUtxo({address});
        const end = new Date().getTime()
        console.info(`getUtxoByAddress address: ${address} cost: ${end - start}ms`)
        return utxoList;
    }


    static async getAddressTxs(address) {
        const start = new Date().getTime()
        const txs = await addresses.getAddressTxs({address});
        const end = new Date().getTime()
        console.info(`getAddressTxs cost: ${end - start}ms`)
        return txs;
    }

    static async getAddressTxsChain(address, last_seen_txid) {
        console.info(`address ${address} ${last_seen_txid}`)
        const start = new Date().getTime()
        const url = `https://${mempoolHost}${strNetwork === "testnet" ? "/testnet" : ""}/api/address/${address}/txs/chain/${last_seen_txid}`
        console.info(`url: ${url}`)
        const resp = await axios.get(url, {
            timeout: 10000
        })

        // const txs = await addresses.getAddressTxsChain({address,last_seen_txid});
        const end = new Date().getTime()
        console.info(`getAddressTxsChain cost: ${end - start}ms`)
        return resp.data;
    }

    static async getTxHex(txid) {
        const start = new Date().getTime()
        console.debug(`getTxHex start`)
        const txHex = await transactions.getTxHex({txid});
        const end = new Date().getTime()
        console.debug(`getTxHex cost: ${end - start}ms`)
        return txHex;
    }

    static async getTx(txid) {
        const start = new Date().getTime()
        console.debug(`getTx start`)
        const tx = await transactions.getTx({txid});
        const end = new Date().getTime()
        console.debug(`getTx cost: ${end - start}ms`)
        return tx;
    }

    static async getTxOutspend(txid, vout) {
        const start = new Date().getTime()
        console.info(`getTxOutspend start`)
        const txOutspend = await transactions.getTxOutspend({
            txid,
            vout
        });
        const end = new Date().getTime()
        console.info(`getTxOutspend  txId: ${txid} vout: ${vout} ${JSON.stringify(txOutspend)} cost: ${end - start}ms`)
        return txOutspend;
    }

    static async getTxOutspends(txid) {
        const start = new Date().getTime()
        const txOutspend = await transactions.getTxOutspends({txid});
        const end = new Date().getTime()
        console.info(`getTxOutspend  txId: ${txid} ${JSON.stringify(txOutspend)} cost: ${end - start}ms`)
        return txOutspend;
    }

    static async getTxStatus(txid) {
        const start = Date.now()
        const txStatus = await transactions.getTxStatus({txid});
        console.info(`getTxStatus  txId: ${txid} ${JSON.stringify(txStatus)} cost: ${Date.now() - start}ms`)
        return txStatus;
    }

    static async getTxStatusEx(txid) {
        const start = new Date().getTime()
        const url = `https://${mempoolHost}${strNetwork === "testnet" ? "/testnet" : ""}/api/tx/${txid}/status`
        console.info(`url: ${url}`)
        const resp = await axios.get(url, {
            timeout: 10000
        })

        const end = new Date().getTime()
        console.info(`getTxStatus  txId: ${txid} ${JSON.stringify(resp.data)} cost: ${Date.now() - start}ms`)
        return resp.data;
    }

    static async postTx(txHex) {
        const start = Date.now()
        const txid = await transactions.postTx({txHex})
        console.info(`postTx  txId: ${txid} cost: ${Date.now() - start}ms`)
        return txid
    }

    static async postTxEx(txHex) {
        const start = new Date().getTime()
        const url = `https://${mempoolHost}${strNetwork === "testnet" ? "/testnet" : ""}/api/tx`
        const resp = await axios.post(url, txHex, {
            timeout: 10000
        })

        const end = new Date().getTime()
        console.info(`postTxEx cost: ${end - start}ms, txid: ${resp.data}`)
        return resp.data;
    }

    static async getFeeRate() {
        const start = Date.now()
        const feeRate = await fees.getFeesRecommended();
        console.info(`getFeeRate  feeRate: ${JSON.stringify(feeRate)} cost: ${Date.now() - start}ms`)
        return feeRate;
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
}