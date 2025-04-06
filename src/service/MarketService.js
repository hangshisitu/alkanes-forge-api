import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import FeeUtil from "../utils/FeeUtil.js";
import config from "../conf/config.js";
import AlkanesService from "./AlkanesService.js";
import {nanoid} from "nanoid";
import MarketListingMapper from "../mapper/MarketListingMapper.js";

export default class MarketService {

    static async createUnsignedListing(assetAddress, assetPublicKey, fundAddress, listingList) {
        const psbt = new bitcoin.Psbt({network: bitcoin.networks.bitcoin});

        for (const listing of listingList) {
            const vin = await PsbtUtil.utxo2PsbtInputEx({
                txid: listing.txid,
                vout: listing.vout,
                value: listing.value,
                address: assetAddress,
                pubkey: assetPublicKey
            });
            vin.sighashType = bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;
            vin.sequence = 0xffffffff;
            psbt.addInput(vin);

            psbt.addOutput({
                address: fundAddress,
                value: listing.price
            });

            if (listing.price < 10000) {
                throw new Error('Below the minimum sale amount: 10,000 sats');
            }
        }

        return {
            hex: psbt.toHex(),
            base64: psbt.toBase64(),
            signingIndexes: [{
                address: assetAddress,
                signingIndexes: [0]
            }]
        };
    }

    static async putSignedListing(signedPsbt) {
        const psbt = PsbtUtil.fromPsbt(signedPsbt);
        const sellerInput = PsbtUtil.extractInputFromPsbt(psbt, 0);
        const listingPrice = psbt.txOutputs[0].value;

        // 查找alkanes数据
        const alkanesList = await AlkanesService.getAlkanesByUtxo(sellerInput);
        if (alkanesList === null || alkanesList.length < 1) {
            throw new Error('No Alkanes assets found');
        }
        if (alkanesList.length > 1) {
            throw new Error('Multiple Alkanes assets exist');
        }
        const alkanes = alkanesList[0];

        const id = nanoid();
        const marketListing = {
            id: id,
            alkaneId: alkanes.id,
            tokenAmount: alkanes.value,
            listingPrice: listingPrice,
            listingOutput: `${sellerInput.txid}:${sellerInput.vout}`,
            psbtData: psbt.toHex(),
            sellerAddress: sellerInput.address,
            status: 1
        }
        await MarketListingMapper.upsertListing(marketListing);
        return id;
    }

    static async genUnsignedBuying(id, amount, listingPsbt, fundAddress, fundPublicKey, assetAddress, feerate) {
        const utxoList = await UnisatAPI.getUtxoList(fundAddress);
        const dummyUtxoList = UnisatAPI.pickDummyList(utxoList);

        const originalPsbt = PsbtUtil.fromPsbt(listingPsbt);
        const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);
        const sellerOutputAddress = originalPsbt.txOutputs[0].address;
        const sellerOutputValue = originalPsbt.txOutputs[0].value;

        const protostone = AlkanesService.getTransferProtostone(id, [{amount: amount, output: 1}]);

        // 输入: 2dummy + 1挂单 + 1付款
        const inputAddresses = [...dummyUtxoList, sellerInput, {address: fundAddress}];
        // 输出: 1合并dummy + 1资产 +1收款 +1转账脚本 +1手续费 + 2dummy + 1找零
        const outputAddresses = [{address: fundAddress}, {address: assetAddress}, {address: sellerOutputAddress}, {script: protostone}, {address: config.platformAddress}, {address: fundAddress}, {address: fundAddress}, {address: fundAddress}];
        let txFee = Math.ceil(FeeUtil.estTxSize(inputAddresses, outputAddresses) * feerate);

        const platformFee = Math.max(Math.ceil(sellerOutputValue * 0.02), 1000);
        const totalFee = Math.ceil(txFee + sellerOutputValue + platformFee);
        const paymentUtxoList = UnisatAPI.pickUtxoByTarget(fundAddress, totalFee, feerate, utxoList);

        // 如果付款的utxo大于1个，需要重新计算Gas
        if (paymentUtxoList.length > 1) {
            for (let i = 1; i < paymentUtxoList.length; i++) {
                inputAddresses.push({address: fundAddress});
            }
            txFee = Math.ceil(FeeUtil.estTxSize(inputAddresses, outputAddresses) * feerate);
        }

        let totalInputValue = 0;
        let totalOutputValue = 0;
        const signingIndexes = [0, 1];
        const buyingPsbt = new bitcoin.Psbt({network: bitcoin.networks.bitcoin});

        let inputDummyValue = 0;
        for (const dummyUtxo of dummyUtxoList) {
            const vin = await PsbtUtil.utxo2PsbtInputEx(dummyUtxo);
            buyingPsbt.addInput(vin);

            inputDummyValue += dummyUtxo.value;
        }
        totalInputValue += inputDummyValue;

        buyingPsbt.addInput({
            hash: originalPsbt.txInputs[0].hash,
            index: originalPsbt.txInputs[0].index,
            ...originalPsbt.data.inputs[0]
        });
        totalInputValue += sellerInput.value;

        for (let paymentUtxo of paymentUtxoList) {
            const vin = await PsbtUtil.utxo2PsbtInputEx(paymentUtxo);
            buyingPsbt.addInput(vin);

            totalInputValue += paymentUtxo.value;

            signingIndexes.push(signingIndexes.length + 1);
        }

        buyingPsbt.addOutput({
            address: fundAddress,
            value: inputDummyValue
        });
        totalOutputValue += inputDummyValue;

        buyingPsbt.addOutput({
            address: assetAddress,
            value: sellerInput.value
        });
        totalOutputValue += sellerInput.value;

        buyingPsbt.addOutput({
            address: sellerOutputAddress,
            value: sellerOutputValue
        });
        totalOutputValue += sellerOutputValue;

        buyingPsbt.addOutput({
            script: protostone,
            value: 0
        });

        buyingPsbt.addOutput({
            address: config.platformAddress,
            value: platformFee
        });
        totalOutputValue += platformFee;

        for (let i = 0; i < 2; i++) {
            buyingPsbt.addOutput({
                address: fundAddress,
                value: 600
            });

            totalOutputValue += 600;
        }

        const changeValue = totalInputValue - totalOutputValue - txFee;
        if (changeValue < 600) {
            throw new Error('Insufficient utxo balance');
        }
        if (changeValue > 600) {
            buyingPsbt.addOutput({
                address: fundAddress,
                value: changeValue
            });
        }

        return {
            hex: buyingPsbt.toHex(),
            base64: buyingPsbt.toBase64(),
            signingIndexes: [{
                address: fundAddress,
                signingIndexes: signingIndexes
            }]
        };
    }

}