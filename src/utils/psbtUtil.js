import * as bitcoin from "bitcoinjs-lib"
import * as psbtUtils from 'bitcoinjs-lib/src/psbt/psbtutils.js'
import {network} from '../conf/config.js'
import * as MempoolUtils from './mempooUtil.js'
import {ECPairFactory} from "ecpair";
import * as ecc from "tiny-secp256k1";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

export function script2Address(output) {
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
    throw new BaseError("unknow script")
}

export async function utxo2PsbtInputEx(utxo) {
    const input = {hash: utxo.txid, index: utxo.vout, value: parseInt(utxo.value), address: utxo.address};
    let txHex = utxo.txHex
    let outScript
    if (!input.value || !input.address) {
        if (!txHex) {
            txHex = await MempoolUtils.getTxHex(utxo.txid);
        }
        const tx = bitcoin.Transaction.fromHex(txHex);
        input.value = tx.outs[utxo.vout].value
        outScript = tx.outs[utxo.vout].script
        input.address = script2Address(outScript)
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
        input.witnessUtxo = {script: outScript, value: input.value}
    } else {
        if (!txHex) {
            txHex = await MempoolUtils.getTxHex(utxo.txid);
        }
        input.nonWitnessUtxo = Buffer.from(txHex, 'hex');
    }
    return input;
}

export function convertKeyPair(privateKey) {
    let keyPair;
    if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
        keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));
    } else {
        keyPair = ECPair.fromWIF(privateKey);
    }
    return keyPair;
}

export function getOutputSize(address) {
    if (address.startsWith("bc1q") || address.startsWith("tp1q")) {
        return 31;
    } else if (address.startsWith("3")) {
        return 32;
    } else if (address.startsWith("1")) {
        return 34;
    }
    return 43;
}