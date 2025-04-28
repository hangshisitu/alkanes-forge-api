import * as bitcoin from "bitcoinjs-lib";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils.js";
import axios from "axios";
import FeeUtil from "../utils/FeeUtil.js";
import AddressUtil from "./AddressUtil.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import config from "../conf/config.js";
import BaseUtil from "../utils/BaseUtil.js";

export default class UnisatAPI {

    static async transfer(privateKey, inputList, outputList, changeAddress, feerate, isP2tr = false, checkFee = true) {
        const keyPair = AddressUtil.convertKeyPair(privateKey);
        const {hex, txSize} = await this.createPsbt(keyPair, inputList, outputList, changeAddress, feerate, isP2tr, checkFee);
        const {txid, error} = await UnisatAPI.unisatPush(hex);
        return {
            txid,
            error,
            txSize
        }
    }

    static async createPsbt(keyPair, inputList, outputList, changeAddress, feerate, isP2tr = false, checkFee = false) {
        const myXOnlyPubkey = toXOnly(keyPair.publicKey);
        const tweakedChildNode = keyPair.tweak(
            bitcoin.crypto.taggedHash('TapTweak', myXOnlyPubkey)
        );

        const psbt = new bitcoin.Psbt({network: config.network});
        if (checkFee) {
            psbt.setMaximumFeeRate(500000000);
        } else {
            psbt.setMaximumFeeRate(50000);
        }
        for (const input of inputList) {
            const vin = {hash: input.txid, index: input.vout, sequence: 0xfffffffd};
            const script = bitcoin.address.toOutputScript(input.address, config.network);

            // 处理不同类型的脚本
            if (psbtUtils.isP2TR(script)) {
                vin.witnessUtxo = {script: script, value: input.value};
                vin.tapInternalKey = myXOnlyPubkey;
            } else if (psbtUtils.isP2WPKH(script)) {
                vin.witnessUtxo = {script: script, value: input.value};
            } else if (psbtUtils.isP2WSHScript(script)) {
                vin.witnessUtxo = {script: script, value: input.value};
            } else if (psbtUtils.isP2SHScript(script)) {
                vin.witnessUtxo = {script: script, value: input.value};
            } else {
                const txHex = await MempoolUtil.getTxHex(input.txid);
                vin.nonWitnessUtxo = Buffer.from(txHex, 'hex');
            }
            psbt.addInput(vin);
        }

        if (outputList.length === 0) {
            throw new Error('The output is empty');
        }

        for (const output of outputList) {
            psbt.addOutput(output);
        }

        try {
            for (let i = 0; i < inputList.length; i++) {
                const input = inputList[i];
                const privateKey = inputList[i].privateKey;
                if (privateKey) {
                    const keyPair = AddressUtil.convertKeyPair(privateKey);
                    const myXOnlyPubkey = toXOnly(keyPair.publicKey);
                    const tweakedChildNode = keyPair.tweak(
                        bitcoin.crypto.taggedHash('TapTweak', myXOnlyPubkey)
                    );
                    if (input.address.startsWith('bc1p')) {
                        psbt.signInput(i, tweakedChildNode);
                    } else {
                        psbt.signInput(i, keyPair);
                    }
                } else if (isP2tr) {
                    psbt.signInput(i, tweakedChildNode);
                } else {
                    psbt.signInput(i, keyPair);
                }
            }

        } catch (error) {
            console.error('Error signing inputs:', error);
            throw new Error('Failed to sign inputs');
        }

        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();

        if (checkFee) {
            const totalInputValue = inputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const fee = Math.ceil((tx.virtualSize() + FeeUtil.getOutputSize(changeAddress)) * feerate);
            const changeValue = totalInputValue - totalOutputValue - fee;

            if (changeValue > 1000) {
                outputList.push({
                    address: changeAddress,
                    value: changeValue
                });
                return this.createPsbt(keyPair, inputList, outputList, changeAddress, feerate, isP2tr, false);
            }
        }

        return {
            txid: tx.getId(),
            hex: tx.toHex(),
            txSize: BaseUtil.divCeil(tx.weight(), 4)
        };
    }

    static async getAllUtxo(address, confirmed = false) {
        const allUtxoList = [];
        for (let i = 0; i < 10; i++) {
            const utxoList = await this.getUtxoList(address, confirmed, i+1, 1000);
            if (utxoList.length > 0) {
                allUtxoList.push(...utxoList);
            }
            if (utxoList.length < 1000) {
                break;
            }
        }
        return allUtxoList;
    }

    static async getUtxoByTarget(address, amount, feerate, filterConfirmed = false) {
        const utxoList = await UnisatAPI.getAllUtxo(address, filterConfirmed);
        if (utxoList === null || utxoList.length === 0) {
            throw new Error('Insufficient utxo balance');
        }

        return UnisatAPI.pickUtxoByTarget(address, amount, feerate, utxoList);
    }

    static pickUtxoByTarget(address, amount, feerate, utxoList) {
        utxoList.sort((a, b) => b.value - a.value);

        let totalInputValue = 0;
        const inputList = [];
        let needAmount = amount;
        for (const utxo of utxoList) {
            if (utxo.value <= 1000) {
                continue;
            }

            inputList.push(utxo);
            totalInputValue += utxo.value;
            if (totalInputValue >= needAmount) {
                break;
            }

            needAmount += Math.ceil(FeeUtil.getInputSize(address) * feerate);
        }
        if (totalInputValue < amount) {
            throw new Error('Insufficient utxo balance');
        }
        return inputList;
    }

    static async getBalance(address) {
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.get(`${config.api.unisatHost}/v1/indexer/address/${address}/balance`, {
                    headers: {
                        'Authorization': `Bearer ${config.api.unisatApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                return response.data.data;
            } catch (err) {
                console.error(`get balance ${address} error, errMsg: ${err.message}`);
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
        throw new Error(`get balance ${address} error`);
    }

    static async getUtxoList(address, confirmed = false, page = 1, size = 1000) {
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.get(`${config.api.unisatHost}/v1/indexer/address/${address}/utxo-data?cursor=${(page - 1) * size}&size=${size}`, {
                    headers: {
                        'Authorization': `Bearer ${config.api.unisatApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                const utxoArray = response.data.data.utxo;
                const utxoList = [];
                for (const utxo of utxoArray) {
                    let status = true;
                    if (confirmed && utxo.height > 1000000) {
                        status = await MempoolUtil.getTxStatus(utxo.txid);
                        if (!status) {
                            console.log(`${address} utxo ${utxo.txid}:${utxo.vout} is unconfirmed`)
                        }
                    }
                    utxoList.push({
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.satoshi,
                        address: utxo.address,
                        height: utxo.height,
                        status: status
                    });
                }
                utxoList.sort((a, b) => b.value - a.value);
                if (confirmed) {
                    return utxoList.filter(utxo => utxo.status);
                }
                return utxoList;
            } catch (err) {
                console.log(`request utxo-data error, hex: ${err.message}`);
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
        throw new Error(`request utxo-data err`);
    }

    static async checkConfirm(txid) {
        try {
            const tx = await this.getTx(txid);
            return tx?.confirmations > 0;
        } catch (err) {
            console.error(`check ${txid} confirm error: ${err.message}`);
        }
        return false;
    }

    static async getTx(txid) {
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.get(`${config.api.unisatHost}/v1/indexer/tx/${txid}`, {
                    headers: {
                        'Authorization': `Bearer ${config.api.unisatApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                return response.data.data;
            } catch (err) {
                console.error(`get tx ${txid} error, errMsg: ${err.message}`);
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
        throw new Error(`get tx ${txid} error`);
    }

    static async getUtxoInfo(txid, vout) {
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.get(`${config.api.unisatHost}/v1/indexer/utxo/${txid}/${vout}`, {
                    headers: {
                        'Authorization': `Bearer ${config.api.unisatApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                return response.data.data;
            } catch (err) {
                console.error(`get utxo info error, txid: ${txid} vout: ${vout} errMsg: ${err.message}`);
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
        throw new Error(`get utxo info error`);
    }

    static async unisatPush(hex_data) {
        const txInfo = PsbtUtil.convertPsbtHex(hex_data);
        let txid = txInfo.txid;
        const hex = txInfo.hex;

        let lastError = '';
        for (let i = 0; i < 2; i++) {
            try {
                txid = await MempoolUtil.postTx(hex);
                return {
                    txid,
                    hex,
                    txSize: txInfo.txSize
                }
            } catch (err) {
                lastError = err.message;
                if (lastError.includes('Transaction') && lastError.includes('already')) {
                    return {
                        txid,
                        hex,
                        txSize: txInfo.txSize
                    };
                }

                console.error(`${txid} tx push error, hex: ${hex_data}`, lastError);
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
        return {
            txid,
            hex,
            error: lastError
        }
    }

}