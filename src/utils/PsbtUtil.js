import * as bitcoin from "bitcoinjs-lib"
import * as psbtUtils from 'bitcoinjs-lib/src/psbt/psbtutils.js'
import {network} from '../conf/config.js'
import * as ecc from "tiny-secp256k1";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import FeeUtil from "./FeeUtil.js";
import MempoolUtil from "./MempoolUtil.js";

bitcoin.initEccLib(ecc);

export default class PsbtUtil {

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

            const vin = await PsbtUtil.utxo2PsbtInputEx(input);
            psbt.addInput(vin);
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
                return this.createUnSignPsbt(inputList, outputList, changeAddress, feerate, network, false);
            } else if (changeValue < 0) {
                throw new Error('Insufficient utxo balance');
            }
        }

        return {
            hex: psbt.toHex(),
            base64: psbt.toBase64(),
            signingIndexes: signingIndexesArr
        };
    }

    static script2Address(output) {
        if (psbtUtils.isP2TR(output)) {
            const {address} = bitcoin.payments.p2tr({network, output})
            return address;

        } else if (psbtUtils.isP2WPKH(output)) {
            const {address} = bitcoin.payments.p2wpkh({network, output})
            return address;
        } else if (psbtUtils.isP2SHScript(output)) {
            const {address} = bitcoin.payments.p2sh({network, output})
            return address;

        } else if (psbtUtils.isP2PKH(output)) {
            const {address} = bitcoin.payments.p2pkh({network, output})
            return address;
        } else if (psbtUtils.isP2WSHScript(output)) {
            const {address} = bitcoin.payments.p2wsh({network, output})
            return address;
        } else if (psbtUtils.isP2MS(output)) {
            const {address} = bitcoin.payments.p2ms({network, output})
            return address;
        } else if (psbtUtils.isP2PK(output)) {
            const {address} = bitcoin.payments.p2pk({network, output})
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
            outScript = bitcoin.address.toOutputScript(input.address, network)
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
            input.witnessUtxo = { script: outScript, value: input.value };
            if (utxo.pubkey) {
                input.redeemScript = bitcoin.payments.p2wpkh({ network, pubkey: Buffer.from(utxo.pubkey, 'hex') }).output;
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
            return bitcoin.Psbt.fromBase64(psbt);
        }
        return bitcoin.Psbt.fromHex(psbt);
    }

    static validatePsbtSignatures(psbt) {
        for (let i = 0; i < psbt.inputCount; i++) {
            const input = psbt.data.inputs[i];

            // 检查现存签名数据是否存在
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

            // 4. 检查是否有 witness 数据，用于 SegWit v0 类型（如 P2WPKH 或 P2WSH）
            if (input.witnessUtxo && input.witnessUtxo.script) {
                isSigned = true;
            }

            // 如果以上条件均未匹配到有效签名，则认为此输入未签名
            if (!isSigned) {
                return false;
            }
        }
        return true;
    }

    static convertPsbtHex(hex_data) {
        let txid;
        if (hex_data.startsWith('cH')) {
            const psbt = bitcoin.Psbt.fromBase64(hex_data);
            psbt.finalizeAllInputs();
            hex_data = psbt.toHex();

            txid = psbt.extractTransaction().getId();
        }
        if (hex_data.startsWith('7073')) {
            const psbt = bitcoin.Psbt.fromHex(hex_data);
            const tx = psbt.extractTransaction();
            hex_data = tx.toHex();

            txid = psbt.extractTransaction().getId();
        }
        return {
            txid,
            hex: hex_data
        }
    }
}

