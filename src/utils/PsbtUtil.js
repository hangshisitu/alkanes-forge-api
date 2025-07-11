import * as bitcoin from "bitcoinjs-lib"
import * as psbtUtils from 'bitcoinjs-lib/src/psbt/psbtutils.js'
import * as ecc from "tiny-secp256k1";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import FeeUtil from "./FeeUtil.js";
import MempoolUtil from "./MempoolUtil.js";
import config from "../conf/config.js";
import BaseUtil from "./BaseUtil.js";

bitcoin.initEccLib(ecc);

export default class PsbtUtil {

    static async createUnSignPsbt(inputList, outputList, changeAddress, feerate, checkFee = true) {
        const psbt = new bitcoin.Psbt({network: config.network});
        if (checkFee) {
            psbt.setMaximumFeeRate(500000000);
        } else {
            psbt.setMaximumFeeRate(50000);
        }

        const inputToSign = [];
        const addressToIndexes = [];
        for (let i = 0; i < inputList.length; i++) {
            const input = inputList[i];
            if (!addressToIndexes[input.address]) {
                addressToIndexes[input.address] = [];
            }
            addressToIndexes[input.address].push(i);

            const vin = await PsbtUtil.utxo2PsbtInputEx(input);
            psbt.addInput(vin);

            inputToSign.push({
                address: input.address,
                index: i
            })
        }

        const signingIndexesArr = [];
        for (const [address, indexes] of Object.entries(addressToIndexes)) {
            signingIndexesArr.push({
                address,
                signingIndexes: indexes,
            });
        }

        if (outputList.length === 0) {
            throw new Error('The output is empty');
        }

        for (const output of outputList) {
            psbt.addOutput(output);
        }

        if (checkFee) {
            const totalInputValue = inputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
            const txSize = FeeUtil.estTxSize(inputList, [...outputList, {address: changeAddress}]);
            const fee = Math.ceil(txSize * feerate);
            const changeValue = totalInputValue - totalOutputValue - fee;

            if (changeValue > 546) {
                outputList.push({
                    address: changeAddress,
                    value: changeValue
                });
                return this.createUnSignPsbt(inputList, outputList, changeAddress, feerate, false);
            } else if (changeValue < 0) {
                throw new Error('Insufficient utxo balance');
            }
        }

        const inputSum = inputList.reduce((sum, input) => sum + input.value, 0);
        const outputSum = outputList.reduce((sum, output) => sum + output.value, 0);
        const fee = inputSum - outputSum;

        return {
            fee: fee,
            hex: psbt.toHex(),
            base64: psbt.toBase64(),
            signingIndexes: signingIndexesArr,
            inputToSign: inputToSign
        };
    }

    static script2Address(output) {
        if (psbtUtils.isP2TR(output)) {
            const {address} = bitcoin.payments.p2tr({network: config.network, output})
            return address;

        } else if (psbtUtils.isP2WPKH(output)) {
            const {address} = bitcoin.payments.p2wpkh({network: config.network, output})
            return address;
        } else if (psbtUtils.isP2SHScript(output)) {
            const {address} = bitcoin.payments.p2sh({network: config.network, output})
            return address;

        } else if (psbtUtils.isP2PKH(output)) {
            const {address} = bitcoin.payments.p2pkh({network: config.network, output})
            return address;
        } else if (psbtUtils.isP2WSHScript(output)) {
            const {address} = bitcoin.payments.p2wsh({network: config.network, output})
            return address;
        } else if (psbtUtils.isP2MS(output)) {
            const {address} = bitcoin.payments.p2ms({network: config.network, output})
            return address;
        } else if (psbtUtils.isP2PK(output)) {
            const {address} = bitcoin.payments.p2pk({network: config.network, output})
            return address;
        }
        throw new Error("unknow script")
    }

    static async utxo2PsbtInputEx(utxo) {
        const input = {hash: utxo.txid, index: utxo.vout, value: parseInt(utxo.value), address: utxo.address};
        let txHex = utxo.txHex
        let outScript
        if (!input.value || !input.address) {
            if (!txHex) {
                txHex = await MempoolUtil.getTxHex(utxo.txid);
            }
            const tx = bitcoin.Transaction.fromHex(txHex);
            input.value = tx.outs[utxo.vout].value
            outScript = tx.outs[utxo.vout].script
            input.address = PsbtUtil.script2Address(outScript)
        }
        if (!outScript) {
            outScript = bitcoin.address.toOutputScript(input.address, config.network)
        }

        if (psbtUtils.isP2TR(outScript) || psbtUtils.isP2WPKH(outScript) || psbtUtils.isP2WSHScript(outScript)) {
            input.witnessUtxo = {script: outScript, value: input.value}
            if (psbtUtils.isP2TR(outScript)) {
                if (utxo.pubkey) {
                    input.tapInternalKey = toXOnly(Buffer.from(utxo.pubkey, 'hex'))
                } else {
                    input.tapInternalKey = outScript.subarray(2)
                }
            }
        } else if (psbtUtils.isP2SHScript(outScript)) {
            input.witnessUtxo = {script: outScript, value: input.value};
            if (utxo.pubkey) {
                input.redeemScript = bitcoin.payments.p2wpkh({
                    network: config.network,
                    pubkey: Buffer.from(utxo.pubkey, 'hex')
                }).output;
            }
        } else {
            if (!txHex) {
                txHex = await MempoolUtil.getTxHex(utxo.txid);
            }
            input.nonWitnessUtxo = Buffer.from(txHex, 'hex');
        }
        return input;
    }

    static extractInputFromPsbt(psbt, index) {
        const input = psbt.data.inputs[index];
        const txid = psbt.txInputs[index].hash.reverse().toString('hex');
        const vout = psbt.txInputs[index].index;

        let value;
        if (input.witnessUtxo) {
            value = input.witnessUtxo.value;
        } else {
            const prevTx = bitcoin.Transaction.fromBuffer(input.nonWitnessUtxo);
            value = prevTx.outs[vout].value;
        }

        const script = input.witnessUtxo?.script.toString('hex') ||
            input.nonWitnessUtxo?.outs[vout].script.toString('hex');
        return {
            txid: txid,
            vout: vout,
            value: value,
            address: PsbtUtil.script2Address(Buffer.from(script, 'hex'))
        };
    }

    static fromPsbt(psbt) {
        if (psbt.startsWith('cH')) {
            return bitcoin.Psbt.fromBase64(psbt, {network: config.network});
        }
        return bitcoin.Psbt.fromHex(psbt, {network: config.network});
    }


    static validatePsbtSignatures(psbt) {
        for (let i = 0; i < psbt.inputCount; i++) {
            const input = psbt.data.inputs[i];
            PsbtUtil.checkInput(input);
        }
    }

    static checkInput(input) {
        let isSigned = false;
        // 1. 检查 partialSig（用于 P2PKH、P2SH-P2PKH）
        if (input.partialSig && input.partialSig.length > 0) {
            isSigned = true;
        }

        // 2. 检查 taproot 签名（单签模式 - tapKeySig）
        if (input.tapKeySig) {
            isSigned = true;
        }

        // 3. 检查 taproot 多签（复杂模式 - tapScriptSig）
        if (input.tapScriptSig && input.tapScriptSig.length > 0) {
            isSigned = true;
        }

        if (input.finalScriptSig || input.finalScriptWitness) {
            isSigned = true;
        }

        // 只要有一项不符合，直接抛出异常
        if (!isSigned) {
            throw new Error(`PSBT input is not signed`);
        }
    }

    static convertPsbtHex(hex_data) {
        let tx;
        if (hex_data.startsWith('cH')) {
            const psbt = bitcoin.Psbt.fromBase64(hex_data, {network: config.network});
            tx = this.finalizeAndExtract(psbt);
        } else if (hex_data.startsWith('7073')) {
            const psbt = bitcoin.Psbt.fromHex(hex_data, {network: config.network});
            tx = this.finalizeAndExtract(psbt);
        } else {
            tx = bitcoin.Transaction.fromHex(hex_data);
        }

        const hex = tx.toHex();
        const txid = tx.getId();
        const txSize = BaseUtil.divCeil(tx.weight(), 4);

        return {
            txid,
            hex,
            txSize
        };
    }

    static finalizeAndExtract(psbt) {
        psbt.data.inputs.forEach((input, i) => {
            if (!input.finalScriptSig && !input.finalScriptWitness) {
                try {
                    psbt.finalizeInput(i);
                } catch (e) {
                    throw new Error(`Failed to finalize input #${i}: ${e.message}`);
                }
            }
        });
        return psbt.extractTransaction();
    }

    static removePartialSignature(psbt) {
        for (const i in psbt.data.inputs) {
            try {
                psbt.clearFinalizedInput(i);
            } catch (Error) {
                //无需清理
            }

            const input = psbt.data.inputs[i];
            delete input.tapKeySig;
            delete input.partialSig;
            delete input.tapScriptSig;
            delete input.finalScriptSig;
            delete input.finalScriptWitness;
        }
    }

    static fillListingSign(param) {
        let map = new Map();
        for (const s in param.assetPsbtList) {
            const psbt = this.fromPsbt(param.assetPsbtList[s]);
            const key = psbt.txInputs[0].hash + "|" + psbt.txInputs[0].index;
            map.set(key, psbt.data.inputs[0]);
        }

        const dstPsbt = this.fromPsbt(param.dstPsbt);
        for (const i in dstPsbt.txInputs) {
            const key = dstPsbt.txInputs[i].hash + "|" + dstPsbt.txInputs[i].index;
            if (map.has(key)) {
                dstPsbt.data.inputs[i] = map.get(key);
            }
        }
        return dstPsbt.toBase64();
    }

    static checkPushConflict(error) {
        return !!(error && (error.includes('txn-mempool-conflict')
            || error.includes("bad-txns-spends-conflicting-tx")
            || error.includes('bad-txns-inputs-missingorspent')
            || error.includes('rejecting replacement')
            || error.includes('replacement-adds-unconfirmed')));
    }
}
