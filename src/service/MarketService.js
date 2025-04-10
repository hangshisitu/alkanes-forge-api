import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import FeeUtil from "../utils/FeeUtil.js";
import config from "../conf/config.js";
import AlkanesService from "./AlkanesService.js";
import {nanoid} from "nanoid";
import MarketListingMapper from "../mapper/MarketListingMapper.js";
import BigNumber from "bignumber.js";
import {Constants} from "../conf/constants.js";
import MarketEventMapper from "../mapper/MarketEventMapper.js";
import TokenInfoService from "./TokenInfoService.js";

export default class MarketService {

    static async assets(alkanesId, assetAddress) {
        const alkanesList = await AlkanesService.getAlkanesUtxoById(assetAddress, alkanesId);
        const listingList = await MarketListingMapper.getUserListing(assetAddress, alkanesId);

        const listingOutputs = new Set(listingList.map(listing => listing.listingOutput));
        return alkanesList.filter(utxo => {
            return !listingOutputs.has(`${utxo.txid}:${utxo.vout}`);
        });
    }

    static async createUnsignedListing(assetAddress, assetPublicKey, fundAddress, listingList) {
        const psbt = new bitcoin.Psbt({network: bitcoin.networks.bitcoin});

        const signingIndexes = [];
        for (const [index, listing] of listingList.entries()) {
            const utxo = {
                txid: listing.txid,
                vout: listing.vout,
                value: listing.value,
                address: assetAddress,
                pubkey: assetPublicKey
            }

            const vin = await PsbtUtil.utxo2PsbtInputEx(utxo);
            vin.sighashType = bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;
            vin.sequence = 0xffffffff;
            psbt.addInput(vin);

            const makerFee = MarketService.getMakerFee(listing.listingAmount);
            const sellAmount = listing.listingAmount - makerFee;
            psbt.addOutput({
                address: fundAddress,
                value: sellAmount
            });

            if (listing.listingAmount < 2000) {
                throw new Error('Below the minimum sale amount: 2000 sats');
            }
            signingIndexes.push(index);
        }

        return {
            hex: psbt.toHex(),
            base64: psbt.toBase64(),
            signingIndexes: [{
                address: assetAddress,
                signingIndexes: signingIndexes
            }]
        };
    }

    static async putSignedListing(signedPsbt, isUpdate = false) {
        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);

        const listingList = [];
        const eventList = [];
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            const sellerAmount = originalPsbt.txOutputs[i].value;

            const alkanes = await MarketService.checkAlkanes(sellerInput);
            const tokenAmount = new BigNumber(alkanes.value).div(10 ** 8)
                .decimalPlaces(8, BigNumber.ROUND_DOWN);

            let listingAmount = this.reverseListingAmount(sellerAmount);
            const listingPrice = new BigNumber(listingAmount).div(tokenAmount)
                .decimalPlaces(18, BigNumber.ROUND_DOWN);

            const psbt = new bitcoin.Psbt({network: bitcoin.networks.bitcoin});
            psbt.addInput({
                hash: originalPsbt.txInputs[i].hash,
                index: originalPsbt.txInputs[i].index,
                ...originalPsbt.data.inputs[i]
            });
            psbt.addOutput({
                address: originalPsbt.txOutputs[i].address,
                value: originalPsbt.txOutputs[i].value
            });

            const marketListing = {
                id: nanoid(),
                alkanesId: alkanes.id,
                tokenAmount: tokenAmount,
                listingPrice: listingPrice,
                listingAmount: listingAmount,
                sellerAmount: sellerAmount,
                listingOutput: `${sellerInput.txid}:${sellerInput.vout}`,
                psbtData: psbt.toHex(),
                sellerAddress: sellerInput.address,
                sellerRecipient: originalPsbt.txOutputs[i].address,
                status: Constants.LISTING_STATUS.LIST
            }
            listingList.push(marketListing);

            const marketEvent = {
                id: nanoid(),
                type: isUpdate ? Constants.MARKET_EVENT.UPDATE : Constants.MARKET_EVENT.LIST,
                alkanesId: alkanes.id,
                tokenAmount: tokenAmount,
                listingPrice: listingPrice,
                listingAmount: listingAmount,
                listingOutput: `${sellerInput.txid}:${sellerInput.vout}`,
                sellerAddress: sellerInput.address
            };
            eventList.push(marketEvent);
        }

        await MarketListingMapper.bulkUpsertListing(listingList);
        await MarketEventMapper.bulkUpsertEvent(eventList);

        setImmediate(() => {
            TokenInfoService.refreshTokenFPAndMCap(listingList[0].alkanesId)
                .catch(err => console.error('Floor price update failed:', err));
        });
    }

    static async createUnsignedUpdate(alkanesId, listingList, assetAddress, assetPublicKey, fundAddress) {
        const listingIds = [];
        const listingMap = new Map();
        for (const listing of listingList) {
            listingIds.push(listing.id);
            listingMap.set(listing.id, listing.amount);
        }

        const existListingList = await MarketListingMapper.getByIds(alkanesId, listingIds);
        if (existListingList === null || existListingList.length === 0) {
            throw new Error('Not found listing, Please refresh and retry.');
        }

        const signingIndexes = [];
        const psbt = new bitcoin.Psbt({network: bitcoin.networks.bitcoin});
        for (const [index, listing] of existListingList.entries()) {
            const originalPsbt = PsbtUtil.fromPsbt(listing.psbtData);
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);
            sellerInput.pubkey = assetPublicKey;

            const vin = await PsbtUtil.utxo2PsbtInputEx(sellerInput);
            vin.sighashType = bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;
            vin.sequence = 0xffffffff;
            psbt.addInput(vin);

            const listingAmount = listingMap.get(listing.id);
            const makerFee = MarketService.getMakerFee(listingAmount);
            const sellAmount = listingAmount - makerFee;
            psbt.addOutput({
                address: fundAddress,
                value: sellAmount
            });

            if (listing.listingAmount < 2000) {
                throw new Error('Below the minimum sale amount: 2000 sats');
            }
            signingIndexes.push(index);
        }

        return {
            hex: psbt.toHex(),
            base64: psbt.toBase64(),
            signingIndexes: [{
                address: assetAddress,
                signingIndexes: signingIndexes
            }]
        };
    }

    static async createUnsignedDelisting(alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate) {
        const listingList = await MarketListingMapper.getByIds(alkanesId, listingIds);
        if (listingList === null || listingList.length === 0) {
            throw new Error('Not found listing, Please refresh and retry.');
        }

        const inputList = [];
        for (const listing of listingList) {
            const originalPsbt = PsbtUtil.fromPsbt(listing.psbtData);
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);
            sellerInput.pubkey = assetPublicKey;
            inputList.push(sellerInput);
        }

        const outputList = [];
        outputList.push({
            address: assetAddress,
            value: 546
        });

        const protostone = AlkanesService.getTransferProtostone(alkanesId, [{amount: 0, output: 0}]);
        outputList.push({
            script: protostone,
            value: 0
        });

        const txSize = FeeUtil.estTxSize([...inputList, {address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee, feerate);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);
        inputList.push(...utxoList);

        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate, bitcoin.networks.bitcoin);
    }

    static async putSignedDelisting(signedPsbt) {
        const txid = await UnisatAPI.unisatPush(signedPsbt);
        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);

        const listingOutputList = [];
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            listingOutputList.push(`${sellerInput.txid}:${sellerInput.vout}`);
        }

        const listingList = await MarketListingMapper.getByOutputs(listingOutputList);
        const eventList = [];
        for (const listing of listingList) {
            const marketEvent = {
                id: nanoid(),
                type: Constants.MARKET_EVENT.DELIST,
                alkanesId: listing.alkanesId,
                tokenAmount: listing.tokenAmount,
                listingPrice: listing.listingPrice,
                listingAmount: listing.listingAmount,
                listingOutput: listing.listingOutput,
                sellerAddress: listing.sellerAddress,
                txHash: txid
            };
            eventList.push(marketEvent);
        }

        await MarketListingMapper.bulkUpdateListing(listingOutputList, Constants.LISTING_STATUS.DELIST, '', txid);
        await MarketEventMapper.bulkUpsertEvent(eventList);

        setImmediate(() => {
            TokenInfoService.refreshTokenFPAndMCap(listingList[0].alkanesId)
                .catch(err => console.error('Floor price update failed:', err));
        });
    }

    static async createUnsignedBuying(alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, feerate) {
        const utxoList = await UnisatAPI.getUtxoList(fundAddress);
        const dummyCount = 2;
        const dummyUtxoList = UnisatAPI.pickDummyList(utxoList, dummyCount);
        if (dummyUtxoList.length < dummyCount) {
            throw new Error('Not enough Dummy, Please refresh and retry.');
        }

        const listingList = await MarketListingMapper.getByIds(alkanesId, listingIds);
        if (listingList === null || listingList.length === 0) {
            throw new Error('Not found listing, Please refresh and retry.');
        }

        const sellerAddressList = listingList.map(listing => {
            return {
                address: listing.sellerAddress
            };
        });
        const sellerRecipientList = listingList.map(listing => {
            return {
                address: listing.sellerRecipient
            };
        });
        const totalListingAmount = listingList.reduce((accumulator, currentValue) => accumulator + currentValue.listingAmount, 0);
        const totalMakerFee = listingList.reduce((accumulator, currentValue) => accumulator + (currentValue.listingAmount - currentValue.sellerAmount), 0);
        const totalTakerFee = listingList.reduce((accumulator, currentValue) => accumulator + MarketService.getTakerFee(currentValue.listingAmount), 0);

        const protostone = AlkanesService.getTransferProtostone(alkanesId, [{amount: 0, output: 1}]);

        // 输入: dummyCount + 出售地址 + 1付款
        const inputAddresses = [...dummyUtxoList, ...sellerAddressList, {address: fundAddress}];
        // 输出: 1合并dummy + 1接收地址 + 收款地址 +1转账脚本 +1手续费 + dummyCount + 1找零
        const outputAddresses = [{address: fundAddress}, {address: assetAddress}, ...sellerRecipientList, {script: protostone}, {address: config.market.platformAddress}, ...dummyUtxoList, {address: fundAddress}];
        let txFee = Math.ceil(FeeUtil.estTxSize(inputAddresses, outputAddresses) * feerate);

        const totalAmount = Math.ceil(totalListingAmount + totalMakerFee + totalTakerFee + txFee);
        const paymentUtxoList = UnisatAPI.pickUtxoByTarget(fundAddress, totalAmount, feerate, utxoList);

        // 如果付款的utxo大于1个，需要重新计算Gas
        if (paymentUtxoList.length > 1) {
            for (let i = 1; i < paymentUtxoList.length; i++) {
                inputAddresses.push({address: fundAddress});
            }
            txFee = Math.ceil(FeeUtil.estTxSize(inputAddresses, outputAddresses) * feerate);
        }

        let totalInputValue = 0;
        let totalOutputValue = 0;
        const signingIndexes = [];
        const buyingPsbt = new bitcoin.Psbt({network: bitcoin.networks.bitcoin});

        let inputDummyValue = 0;
        for (const dummyUtxo of dummyUtxoList) {
            const vin = await PsbtUtil.utxo2PsbtInputEx(dummyUtxo);
            buyingPsbt.addInput(vin);

            inputDummyValue += dummyUtxo.value;
            signingIndexes.push(signingIndexes.length);
        }
        totalInputValue += inputDummyValue;

        const recipientOutputList = [];
        const psbtList = listingList.map(listing => listing.psbtData);
        for (const psbt of psbtList) {
            const originalPsbt = PsbtUtil.fromPsbt(psbt);
            buyingPsbt.addInput({
                hash: originalPsbt.txInputs[0].hash,
                index: originalPsbt.txInputs[0].index,
                ...originalPsbt.data.inputs[0]
            });

            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);
            totalInputValue += sellerInput.value;

            recipientOutputList.push({
                address: originalPsbt.txOutputs[0].address,
                value: originalPsbt.txOutputs[0].value
            })
        }

        for (let paymentUtxo of paymentUtxoList) {
            const vin = await PsbtUtil.utxo2PsbtInputEx(paymentUtxo);
            buyingPsbt.addInput(vin);

            totalInputValue += paymentUtxo.value;

            signingIndexes.push(signingIndexes.length + psbtList.length);
        }

        buyingPsbt.addOutput({
            address: fundAddress,
            value: inputDummyValue
        });
        totalOutputValue += inputDummyValue;

        // 接收资产的output
        buyingPsbt.addOutput({
            address: assetAddress,
            value: config.market.postage
        });
        totalOutputValue += config.market.postage;

        // 接收付款的output
        for (const output of recipientOutputList) {
            buyingPsbt.addOutput(output);
            totalOutputValue += output.value;
        }

        // 资产输出脚本
        buyingPsbt.addOutput({
            script: protostone,
            value: 0
        });

        // 平台手续费
        buyingPsbt.addOutput({
            address: config.market.platformAddress,
            value: totalMakerFee + totalTakerFee
        });
        totalOutputValue += totalMakerFee + totalTakerFee;

        // 新增dummy输出
        for (let i = 0; i < dummyCount; i++) {
            buyingPsbt.addOutput({
                address: fundAddress,
                value: config.market.dummyValue
            });

            totalOutputValue += config.market.dummyValue;
        }

        const changeValue = totalInputValue - totalOutputValue - txFee;
        if (changeValue < 0) {
            throw new Error('Insufficient utxo balance');
        }
        if (changeValue > config.market.dummyValue) {
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

    static async putSignedBuying(signedPsbt) {
        const txid = await UnisatAPI.unisatPush(signedPsbt);
        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);

        let buyerAddress = '';
        const listingOutputList = [];
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            listingOutputList.push(`${sellerInput.txid}:${sellerInput.vout}`);

            buyerAddress = sellerInput.address;
        }

        const listingList = await MarketListingMapper.getByOutputs(listingOutputList);
        const eventList = [];
        for (const listing of listingList) {
            const marketEvent = {
                id: nanoid(),
                type: Constants.MARKET_EVENT.SOLD,
                alkanesId: listing.alkanesId,
                tokenAmount: listing.tokenAmount,
                listingPrice: listing.listingPrice,
                listingAmount: listing.listingAmount,
                listingOutput: listing.listingOutput,
                sellerAddress: listing.sellerAddress,
                buyerAddress: buyerAddress,
                txHash: txid
            };
            eventList.push(marketEvent);
        }

        await MarketListingMapper.bulkUpdateListing(listingOutputList, Constants.LISTING_STATUS.SOLD, buyerAddress, txid);
        await MarketEventMapper.bulkUpsertEvent(eventList);

        setImmediate(() => {
            TokenInfoService.refreshTokenFPAndMCap(listingList[0].alkanesId)
                .catch(err => console.error('Floor price update failed:', err));
        });
    }

    static async checkDummy(fundAddress, fundPublicKey, feerate) {
        const utxoList = await UnisatAPI.getUtxoList(fundAddress);
        const dummyCount = 2;
        const dummyUtxoList = UnisatAPI.pickDummyList(utxoList, dummyCount);
        if (dummyUtxoList.length >= dummyCount) {
            return {
                dummyList: dummyUtxoList
            };
        }

        const outputList = [];
        for (let i = 0; i < (dummyCount - dummyUtxoList.length); i++) {
            outputList.push({
                address: fundAddress,
                value: config.market.dummyValue
            });
        }

        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const totalFee = txFee + outputList.length * config.market.dummyValue;

        const filterUtxoList = UnisatAPI.pickUtxoByTarget(fundAddress, totalFee, feerate, utxoList);
        const psbt = await PsbtUtil.createUnSignPsbt(filterUtxoList, outputList, fundAddress, feerate, bitcoin.networks.bitcoin);
        return {
            dummyList: [],
            ...psbt
        }
    }

    static async checkAlkanes(utxo) {
        const alkanesList = await AlkanesService.getAlkanesByUtxo(utxo);
        if (alkanesList === null || alkanesList.length < 1) {
            throw new Error('No Alkanes assets found');
        }
        if (alkanesList.length > 1) {
            throw new Error('Multiple Alkanes assets exist');
        }
        return alkanesList[0];
    }

    static reverseListingAmount(sellAmount) {
        const rate = config.market.makerFee / 1000;
        const listingAmount = sellAmount / (1 - rate);
        const makerFee = listingAmount * rate;
        if (makerFee >= config.market.minimumFee) {
            return Math.ceil(listingAmount);
        }
        return sellAmount + config.market.minimumFee;
    }

    static getMakerFee(listingAmount) {
        return Math.max(Math.ceil(listingAmount * config.market.makerFee / 1000), config.market.minimumFee);
    }

    static getTakerFee(listingAmount) {
        return Math.max(Math.ceil(listingAmount * config.market.takerFee / 1000), config.market.minimumFee);
    }

}