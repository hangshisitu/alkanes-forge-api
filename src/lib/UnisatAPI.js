import * as bitcoin from "bitcoinjs-lib";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils.js";
import axios from "axios";
import {convertKeyPair, getOutputSize, utxo2PsbtInputEx} from "../utils/psbtUtil.js";

export default class UnisatAPI {

    static unisatUrl = 'https://open-api.unisat.io';
    static unisatToken = '0430a4cb33e4e75316a673a56d9ce874ff504e1eb3eb30994289350a5e866893';

    static async transfer(privateKey, inputList, outputList, changeAddress, feerate, network, isP2tr = false, checkFee = true) {
        const keyPair = convertKeyPair(privateKey);
        const hex = await this.createPsbt(keyPair, inputList, outputList, changeAddress, feerate, network, isP2tr, checkFee);
        return await this.unisatPush(hex);
    }

    static async createPsbt(keyPair, inputList, outputList, changeAddress, feerate, network, isP2tr = false, checkFee = false) {
        const myXOnlyPubkey = toXOnly(keyPair.publicKey);
        const tweakedChildNode = keyPair.tweak(
            bitcoin.crypto.taggedHash('TapTweak', myXOnlyPubkey)
        );

        const psbt = new bitcoin.Psbt({network});
        if (checkFee) {
            psbt.setMaximumFeeRate(500000000);
        } else {
            psbt.setMaximumFeeRate(50000);
        }
        for (const input of inputList) {
            const vin = {hash: input.txid, index: input.vout, sequence: 0xfffffffd};
            const script = bitcoin.address.toOutputScript(input.address, network);

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
                const txHex = await this.getTxHex(input.txid);
                vin.nonWitnessUtxo = Buffer.from(txHex, 'hex');
            }
            psbt.addInput(vin);
        }

        // 处理输出
        if (outputList.length === 0) {
            const totalInputValue = inputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const txFee = this.estTxFee(inputList.length, 1, feerate, inputList[0].address.startsWith('bc1q'));
            psbt.addOutput({
                address: changeAddress,
                value: totalInputValue - txFee
            });
            checkFee = false;
        } else {
            for (const output of outputList) {
                psbt.addOutput(output);
            }
        }

        try {
            for (let i = 0; i < inputList.length; i++) {
                const input = inputList[i];
                const privateKey = inputList[i].privateKey;
                if (privateKey) {
                    const keyPair = convertKeyPair(privateKey);
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
            const fee = Math.ceil((tx.virtualSize() + getOutputSize(changeAddress)) * feerate);
            const changeValue = totalInputValue - totalOutputValue - fee;

            if (changeValue > 1000) {
                outputList.push({
                    address: changeAddress,
                    value: changeValue
                });
                return this.createPsbt(keyPair, inputList, outputList, changeAddress, feerate, network, isP2tr, false);
            }
        }

        return tx.toHex();
    }

    static async createUnSignPsbt(inputList, outputList, changeAddress, feerate, network, checkFee = true) {
        const psbt = new bitcoin.Psbt({network});
        if (checkFee) {
            psbt.setMaximumFeeRate(500000000);
        } else {
            psbt.setMaximumFeeRate(50000);
        }
        for (const input of inputList) {
            const vin = await utxo2PsbtInputEx(input);
            psbt.addInput(vin);
        }

        // 处理输出
        if (outputList.length === 0) {
            const totalInputValue = inputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const txFee = this.estTxFee(inputList.length, 1, feerate, inputList[0].address.startsWith('bc1q'));
            psbt.addOutput({
                address: changeAddress,
                value: totalInputValue - txFee
            });
            checkFee = false;
        } else {
            for (const output of outputList) {
                psbt.addOutput(output);
            }
        }

        if (checkFee) {
            const totalInputValue = inputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const txSize = UnisatAPI.estTxSize(inputList, [...outputList, {address: changeAddress}]);
            const fee = Math.ceil(txSize * feerate);
            const changeValue = totalInputValue - totalOutputValue - fee;

            if (changeValue > 1000) {
                outputList.push({
                    address: changeAddress,
                    value: changeValue
                });
                return this.createUnSignPsbt(inputList, outputList, changeAddress, feerate, network, false);
            }
        }

        return psbt.toHex();
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

    static async getUtxoByTarget(address, amount) {
        const utxoList = await UnisatAPI.getUtxoList(address);
        if (utxoList === null || utxoList.length === 0) {
            throw new Error('Insufficient utxo balance');
        }

        let totalInputValue = 0;
        const inputList = [];
        for (const utxo of utxoList) {
            inputList.push(utxo);
            totalInputValue += utxo.value;
            if (totalInputValue >= amount) {
                break;
            }
        }
        if (totalInputValue < amount) {
            throw new Error('Insufficient utxo balance');
        }
        return inputList;
    }

    static async getUtxoList(address, confirmed = false, page = 1, size = 1000) {
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.get(`${this.unisatUrl}/v1/indexer/address/${address}/utxo-data?cursor=${(page - 1) * size}&size=${size}`, {
                    headers: {
                        'Authorization': `Bearer ${this.unisatToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                const utxoArray = response.data.data.utxo;
                const utxoList = [];
                for (const utxo of utxoArray) {
                    let status = true;
                    if (confirmed && utxo.height > 1000000) {
                        status = await this.checkConfirm(utxo.txid);
                        if (!status) {
                            console.log(`${address} utxo ${utxo.txid}:${utxo.vout} is unconfirmed`)
                        }
                    }
                    utxoList.push({
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.satoshi,
                        address: utxo.address,
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
                const response = await axios.get(`${this.unisatUrl}/v1/indexer/tx/${txid}`, {
                    headers: {
                        'Authorization': `Bearer ${this.unisatToken}`,
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


    static async unisatPush(hex_data) {
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.post(`${this.unisatUrl}/v1/indexer/local_pushtx`, {
                    txHex: hex_data
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.unisatToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                const result = response.data;
                if (result.code !== 0) {
                    throw new Error(result.msg);
                }
                return result;
            } catch (err) {
                console.error(`unisat push error: ${err.message}`);
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
        throw new Error('unist push tx error');
    }

    static estTxFee(inputs, outputs, feerate, bc1q = false) {
        if (bc1q) {
            return Math.ceil((24 + 67.75 * inputs + outputs * 43) * feerate);
        }
        return Math.ceil((inputs * 57.5 + outputs * 43 + 10) * feerate);
    }

    static estTxSize(inputs, outputs) {
        let txSize = 4; // version (4 bytes)
        txSize += 1 + inputs.length; // inputs count (varint)
        txSize += 1 + outputs.length; // outputs count (varint)
        txSize += 4; // locktime (4 bytes)

        // 计算输入大小
        for (const input of inputs) {
            // 基础部分 (non-witness): prevTxHash (32) + index (4) + sequence (4) + scriptSigLen (1)
            txSize += 32 + 4 + 4 + 1; // 41 bytes

            // Witness 部分 (SegWit 折扣)
            if (input.address.startsWith('bc1q')) {
                // P2WPKH: 72 (签名) + 33 (公钥) = 105 bytes
                // 虚拟大小贡献: (105) / 4 = 26.25 → 计入 26.25
                txSize += 105 / 4;
            } else if (input.address.startsWith('bc1p')) {
                // P2TR: 64 bytes (Schnorr 签名)
                // 虚拟大小贡献: (64) / 4 = 16 → 计入 16
                txSize += 64 / 4;
            } else {
                // P2PKH (Legacy): scriptSig ~107 bytes (无折扣)
                txSize += 107;
            }
        }

        // 计算输出大小（无折扣）
        for (const output of outputs) {
            txSize += 8; // value (8 bytes)
            if (output.address) {
                const scriptPubKey = bitcoin.address.toOutputScript(output.address);
                txSize += scriptPubKey.length;
            } else if (output.script) {
                txSize += output.script.length;
            }
        }

        return Math.ceil(txSize);
    }

}