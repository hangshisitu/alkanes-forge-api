import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import {convertKeyPair} from "../utils/psbtUtil.js";

export default class AddressUtil {

    static fromP2wpkhAddress(privateKey) {
        bitcoin.initEccLib(ecc);
        const rootKey = convertKeyPair(privateKey);
        return bitcoin.payments.p2wpkh({network: bitcoin.networks.bitcoin, pubkey: rootKey.publicKey}).address;
    }

}