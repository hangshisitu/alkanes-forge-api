import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import {ECPairFactory} from "ecpair";
import config from "../conf/config.js";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import {createHash} from "crypto";

export default class AddressUtil {

    static fromP2wpkhAddress(privateKey, network = config.network) {
        bitcoin.initEccLib(ecc);

        const rootKey = AddressUtil.convertKeyPair(privateKey);
        return bitcoin.payments.p2wpkh({network: network, pubkey: rootKey.publicKey}).address;
    }

    static fromP2trAddress(privateKey, network = config.network) {
        bitcoin.initEccLib(ecc);

        const rootKey = AddressUtil.convertKeyPair(privateKey);
        const {address} = bitcoin.payments.p2tr({network: network, internalPubkey: Buffer.from(toXOnly(rootKey.publicKey))});
        return address;
    }

    static generatePrivateKeyFromString(inputString) {
        const hash = createHash("sha256").update(inputString).digest("hex");
        const privateKey = Buffer.from(hash, "hex");
        return privateKey.toString("hex");
    }

    static convertKeyPair(privateKey) {
        const ECPair = ECPairFactory(ecc);

        let keyPair;
        if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
            keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));
        } else {
            keyPair = ECPair.fromWIF(privateKey);
        }
        return keyPair;
    }

    static toPublicKey(address) {
        return bitcoin.address.toOutputScript(address, config.network);
    }

}