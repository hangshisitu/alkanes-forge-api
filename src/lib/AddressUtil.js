import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import {ECPairFactory} from "ecpair";

export default class AddressUtil {

    static fromP2wpkhAddress(privateKey) {
        bitcoin.initEccLib(ecc);

        const rootKey = AddressUtil.convertKeyPair(privateKey);
        return bitcoin.payments.p2wpkh({network: bitcoin.networks.bitcoin, pubkey: rootKey.publicKey}).address;
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

}