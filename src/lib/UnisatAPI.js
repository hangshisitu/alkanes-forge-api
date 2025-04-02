import * as bitcoin from "bitcoinjs-lib";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils.js";
import axios from "axios";
import {convertKeyPair, getOutputSize, utxo2PsbtInputEx} from "../utils/psbtUtil.js";
import {re} from "mathjs";

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

        const addressToIndexes = [];
        for (let i = 0; i < inputList.length; i++) {
            const input = inputList[i];
            if (!addressToIndexes[input.address]) {
                addressToIndexes[input.address] = [];
            }
            addressToIndexes[input.address].push(i);

            const vin = await utxo2PsbtInputEx(input);
            psbt.addInput(vin);
        }

        const signingIndexesArr = [];
        for (const [address, indexes] of Object.entries(addressToIndexes)) {
            signingIndexesArr.push({
                address,
                signingIndexes: indexes,
            });
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

        return {
            hex: psbt.toHex(),
            base64: psbt.toBase64(),
            signingIndexes: signingIndexesArr
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
        const utxoList = await UnisatAPI.getUtxoList(address, filterConfirmed);
        if (utxoList === null || utxoList.length === 0) {
            throw new Error('Insufficient utxo balance');
        }

        let totalInputValue = 0;
        const inputList = [];
        let needAmount = amount;
        for (const utxo of utxoList) {
            if (utxo.value <= 546) {
                continue;
            }

            inputList.push(utxo);
            totalInputValue += utxo.value;
            if (totalInputValue >= needAmount) {
                break;
            }

            needAmount += Math.ceil(this.getInputSize(address) * feerate);
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
        if (hex_data.startsWith('cH')) {
            const psbt = bitcoin.Psbt.fromBase64(hex_data);
            psbt.finalizeAllInputs();
            hex_data = psbt.toHex();
        }
        if (hex_data.startsWith('7073')) {
            const psbt = bitcoin.Psbt.fromHex(hex_data);
            const tx = psbt.extractTransaction();
            hex_data = tx.toHex();
        }

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
                console.error(`tx push error, hex: ${hex_data}`, err.message);
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
        throw new Error('tx push error');
    }

    static estTxSize(inputs, outputs) {
        let baseSize = 4 + 4; // version + locktime
        let witnessSize = 0;
        const isSegWit = inputs.some(i => i.address?.startsWith('bc1') || i.address?.startsWith('3'));

        // 输入输出数量（VarInt）
        baseSize += this.varIntSize(inputs.length) + this.varIntSize(outputs.length);

        // ============= 输入计算 =============
        for (const input of inputs) {
            baseSize += this.getInputSize(input.address);
        }

        // ============= 输出计算 =============
        for (const output of outputs) {
            baseSize += 8; // value（8字节）

            let scriptSize;
            if (output.script) {
                scriptSize = output.script.length + 1; // OP_RETURN 直接使用 script 长度
            } else {
                scriptSize = UnisatAPI.getOutputSize(output.address);
            }

            baseSize += this.varIntSize(scriptSize) + scriptSize;
        }

        // SegWit标记（如果有SegWit输入）
        if (isSegWit) baseSize += 2;

        // 最终 vsize = baseSize + (witnessSize / 4)
        return Math.ceil(baseSize + (witnessSize / 4));
    }

    static varIntSize(n) {
        return n < 0xfd ? 1 : 3;
    }

    static getInputSize(address) {
        let baseSize = 32 + 4 + 4; // txid + vout + sequence

        if (address.startsWith('bc1p')) { // P2TR
            baseSize += 1; // 空 scriptSig（1字节）
            baseSize += (1 + (1 + 64) + (1 + 33)) / 4; // Schnorr 签名 + 控制块
        }
        else if (address.startsWith('bc1q')) { // P2WPKH
            baseSize += 1; // 空 scriptSig（1字节）
            baseSize += ( 1 + (1 + 72) + (1 + 33)) / 4; // DER 签名 + 压缩公钥
        }
        else if (address.startsWith('3')) { // P2SH（可能是嵌套SegWit）
            const redeemScriptSize = 22; // 默认 P2SH-P2WPKH 的 redeemScript 是 22 字节
            baseSize += 1 + redeemScriptSize; // scriptSig 长度 + redeemScript
            baseSize += (1 + (1 + 72) + (1 + 33)) / 4; // 见证数据（DER 签名 + 压缩公钥）
        }
        else { // P2PKH（Legacy）
            const scriptSigSize =  107; // 默认估算
            baseSize += this.varIntSize(scriptSigSize) + scriptSigSize;
        }

        return baseSize;
    }

    static getOutputSize(address) {
        let scriptSize;
        if (address.startsWith('bc1p')) {
            scriptSize = 34; // P2TR
        } else if (address.startsWith('bc1q')) {
            scriptSize = 22; // P2WPKH
        } else if (address.startsWith('3')) {
            scriptSize = 23; // P2SH
        } else {
            scriptSize = 25; // P2PKH
        }
        return scriptSize;
    }

    static async blockHeight() {
        const response = await axios.get(`https://mempool.space/api/v1/blocks/tip/height`);
        return response.data;
    }

}