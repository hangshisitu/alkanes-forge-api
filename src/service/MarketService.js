import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import FeeUtil from "../utils/FeeUtil.js";
import config from "../conf/config.js";
import AlkanesService from "./AlkanesService.js";
import MarketListingMapper from "../mapper/MarketListingMapper.js";
import BigNumber from "bignumber.js";
import {Constants} from "../conf/constants.js";
import MarketEventMapper from "../mapper/MarketEventMapper.js";
import TokenInfoService from "./TokenInfoService.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import BaseUtil from "../utils/BaseUtil.js";
import IndexerService from "./IndexerService.js";
import * as logger from "../conf/logger.js";
import sequelize from "../lib/SequelizeHelper.js";
import PointRecordService from "./PointRecordService.js";
import DiscountAddressMapper from "../mapper/DiscountAddressMapper.js";

export default class MarketService {

    static async assets(alkanesId, assetAddress) {
        const outpointList = await IndexerService.getOutpointListByTarget(assetAddress, alkanesId, new BigNumber(0), true);
        if (outpointList.length === 0) {
            return [];
        }
        const listingList = await MarketListingMapper.getUserListing(assetAddress, alkanesId);
        const listingOutputs = new Set(listingList.map(listing => listing.listingOutput));
        const tokenInfo = await TokenInfoService.getTokenInfo(alkanesId);
        return outpointList.filter(outpoint => {
            return !listingOutputs.has(`${outpoint.txid}:${outpoint.vout}`);
        }).map(outpoint => {
            return {
                address: assetAddress,
                txid: outpoint.txid,
                vout: outpoint.vout,
                block: outpoint.block,
                value: parseInt(outpoint.value),
                alkanesId: outpoint.alkanesId,
                alkanesIdCount: outpoint.alkanesIdCount,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                balance: outpoint.balance,
                tokenAmount: new BigNumber(outpoint.balance).dividedBy(10 ** 8).toFixed()
            };
        });
    }

    static async createUnsignedListing(assetAddress, assetPublicKey, fundAddress, listingList) {
        const psbt = new bitcoin.Psbt({network: config.network});

        const signingIndexes = [];
        for (const [index, listing] of listingList.entries()) {
            if (parseInt(listing.listingAmount) > 10000000) {
                throw new Error('Maximum price: 0.1 BTC');
            }
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

    static async checkSpendable(utxo) {
        const spendInfo = await MempoolUtil.getTxOutspend(utxo.txid, utxo.vout);
        return !spendInfo.spent;
    }

    static async putSignedListing(signedPsbt, isUpdate = false) {
        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);
        PsbtUtil.validatePsbtSignatures(originalPsbt);

        const listingList = [];
        const failedList = [];
        const eventList = [];
        const maxHeight = await AlkanesService.getMaxHeight();
        let alkanesId = null;
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            const sellerAmount = originalPsbt.txOutputs[i].value || 0;
            if (sellerAmount < (2000 - config.market.minimumFee)) {
                throw new Error('Below the minimum sale amount: 2000 sats');
            }
            PsbtUtil.checkInput(originalPsbt.data.inputs[i]);
            const output = `${sellerInput.txid}:${sellerInput.vout}`;
            const alkanes = await MarketService.checkAlkanes(sellerInput, maxHeight);
            alkanesId = alkanes.id;
            if (alkanes.value < 1) {
                failedList.push(output);
                continue;
            }
            const spendable = await this.checkSpendable(sellerInput);
            if (!spendable) {
                failedList.push(output);
                continue;
            }

            const tokenAmount = new BigNumber(alkanes.value).div(10 ** 8)
                .decimalPlaces(8, BigNumber.ROUND_DOWN);

            let listingAmount = this.reverseListingAmount(sellerAmount);
            const listingPrice = new BigNumber(listingAmount).div(tokenAmount)
                .decimalPlaces(18, BigNumber.ROUND_DOWN);

            const psbt = new bitcoin.Psbt({network: config.network});
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
                id: BaseUtil.genId(),
                alkanesId: alkanes.id,
                tokenAmount: tokenAmount,
                listingPrice: listingPrice,
                listingAmount: listingAmount,
                sellerAmount: sellerAmount,
                listingOutput: output,
                psbtData: psbt.toHex(),
                sellerAddress: sellerInput.address,
                sellerRecipient: originalPsbt.txOutputs[i].address,
                status: Constants.LISTING_STATUS.LIST
            }
            listingList.push(marketListing);

            const marketEvent = {
                id: BaseUtil.genId(),
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

        if (failedList.length > 0) {
            await MarketListingMapper.bulkUpdateListing(failedList, Constants.LISTING_STATUS.DELIST, '', '', '', alkanesId);
            throw new Error('The assets have been transferred, please refresh and try again.');
        }

        if (listingList.length > 0) {
            await MarketListingMapper.bulkUpsertListing(listingList);
            await MarketEventMapper.bulkUpsertEvent(eventList);
            await TokenInfoService.refreshTokenFloorPrice(listingList[0].alkanesId);
        }

        await TokenInfoService.refreshTokenFloorPrice(listingList[0].alkanesId);
    }

    static async createUnsignedUpdate(alkanesId, listingList, assetAddress, assetPublicKey, fundAddress, walletType) {
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

        const failedList = [];
        const signingIndexes = [];
        const psbt = new bitcoin.Psbt({network: config.network});
        for (const [index, listing] of existListingList.entries()) {
            const originalPsbt = PsbtUtil.fromPsbt(listing.psbtData);
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);
            sellerInput.pubkey = assetPublicKey;

            const alkanes = await MarketService.checkAlkanes(sellerInput, 0);
            if (alkanes.value < 1) {
                failedList.push(`${sellerInput.txid}:${sellerInput.vout}`);
                continue;
            }
            const spendable = await this.checkSpendable(sellerInput);
            if (!spendable) {
                failedList.push(`${sellerInput.txid}:${sellerInput.vout}`);
                continue;
            }

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

        if (failedList.length > 0) {
            await MarketListingMapper.bulkUpdateListing(failedList, Constants.LISTING_STATUS.DELIST, '', '', walletType, alkanesId);
            throw new Error('The assets have been transferred, please refresh and try again.');
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

    static async createUnsignedDelisting(alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, walletType) {
        const listingList = await MarketListingMapper.getByIds(alkanesId, listingIds);
        if (listingList === null || listingList.length === 0) {
            throw new Error('Not found listing, Please refresh and retry.');
        }

        const failedList = [];
        const inputList = [];
        for (const listing of listingList) {
            const originalPsbt = PsbtUtil.fromPsbt(listing.psbtData);
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);

            const alkanes = await MarketService.checkAlkanes(sellerInput, 0);
            if (alkanes.value < 1) {
                failedList.push(`${sellerInput.txid}:${sellerInput.vout}`);
                continue;
            }
            const spendable = await this.checkSpendable(sellerInput);
            if (!spendable) {
                failedList.push(`${sellerInput.txid}:${sellerInput.vout}`);
                continue;
            }

            sellerInput.pubkey = assetPublicKey;
            inputList.push(sellerInput);
        }

        if (failedList.length > 0) {
            await MarketListingMapper.bulkUpdateListing(failedList, Constants.LISTING_STATUS.DELIST, '', '', walletType, alkanesId);
            throw new Error('The assets have been transferred, please refresh and try again.');
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

        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
    }

    static async putSignedDelisting(signedPsbt, walletType) {
        const {txid, error} = await UnisatAPI.unisatPush(signedPsbt);
        if (error && (error.includes('txn-mempool-conflict')
            || error.includes("bad-txns-spends-conflicting-tx")
            || error.includes('bad-txns-inputs-missingorspent')
            || error.includes('replacement-adds-unconfirmed'))) {
            throw new Error('Assets have been transferred. Please refresh and try again shortly.');
        } else if (error) {
            throw new Error(error);
        }

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
                id: BaseUtil.genId(),
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

        await MarketListingMapper.bulkUpdateListing(listingOutputList, Constants.LISTING_STATUS.DELIST, '', txid, walletType, listingList[0].alkanesId);
        await MarketEventMapper.bulkUpsertEvent(eventList);

        await TokenInfoService.refreshTokenFloorPrice(listingList[0].alkanesId);
    }

    static async checkListingSpendable(listingOutputList, alkanesId) {
        const errors = [];
        let failedList = await BaseUtil.concurrentExecute(listingOutputList, async (listingOutput) => {
            const [txid, vout] = listingOutput.split(':');
            const spendable = await this.checkSpendable({txid, vout});
            if (!spendable) {
                return listingOutput;
            }
            return null;
        }, null, errors);
        if (errors.length > 0) {
            throw new Error('Listing spendable check failed, please refresh and try again.');
        }
        failedList = failedList.filter(listingOutput => listingOutput !== null);
        if (failedList.length > 0) {
            await MarketListingMapper.bulkUpdateListing(failedList, Constants.LISTING_STATUS.DELIST, '', '', '', alkanesId);
            throw new Error('The assets have been transferred, please refresh and try again.');
        }
    }

    static async createUnsignedBuying(alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, feerate, accelerate = false) {
        const listingList = await MarketListingMapper.getByIds(alkanesId, listingIds, accelerate ? Constants.LISTING_STATUS.SOLD : Constants.LISTING_STATUS.LIST);
        if (listingList === null || listingList.length !== listingIds.length) {
            throw new Error('Some items in your order are already purchased or delisted.');
        }

        if (!accelerate) {
            await this.checkListingSpendable(listingList.map(listing => listing.listingOutput), alkanesId);
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
        const discountAddress = await DiscountAddressMapper.getDiscountAddress(assetAddress);
        const totalTakerFee = listingList.reduce((accumulator, currentValue) => accumulator + MarketService.getTakerFee(discountAddress, currentValue.listingAmount), 0);

        const protostone = AlkanesService.getTransferProtostone(alkanesId, [{amount: 0, output: 0}]);

        // 输入: dummyCount + 出售地址 + 1付款
        const inputAddresses = [...sellerAddressList, {address: fundAddress}];
        // 输出: 1合并dummy + 1接收地址 + 收款地址 +1转账脚本 +1手续费 + dummyCount + 1找零
        const outputAddresses = [{address: fundAddress}, {address: assetAddress}, ...sellerRecipientList, {script: protostone}, {address: config.revenueAddress.market}, {address: fundAddress}];
        let txFee = Math.ceil(FeeUtil.estTxSize(inputAddresses, outputAddresses) * feerate);

        const totalAmount = Math.ceil(totalListingAmount + totalMakerFee + totalTakerFee + txFee);
        let cachedPaymentUtxoList = [];
        if (accelerate) { // 加速时, 先查出原来的txid用的哪些utxo付款, 然后从这些utxo中扣减, 如果value不足, 再从UnisatAPI补充
            const event = await MarketEventMapper.getSoldEventByListingOutput(listingList[0].listingOutput);
            let cachedTx = await MempoolUtil.getTxEx(event.txHash);
            if (!cachedTx) { // 不存在, 则是被替换了
                cachedTx = await MempoolUtil.getCachedTx(event.txHash);
            }
            const listingOutputList = listingList.map(listing => listing.listingOutput);
            cachedPaymentUtxoList = cachedTx.vin.filter(vin => {
                return !listingOutputList.includes(`${vin.txid}:${vin.vout}`);
            }).map(vin => {
                return {
                    txid: vin.txid,
                    vout: vin.vout,
                    value: vin.prevout.value,
                    address: fundAddress,
                    pubkey: fundPublicKey
                };
            });
        }
        const needAmount = totalAmount - cachedPaymentUtxoList.reduce((acc, curr) => {
            return +curr.value + acc;
        }, 0) + Math.ceil(FeeUtil.getInputSize(fundAddress) * feerate) * cachedPaymentUtxoList.length;
        const paymentUtxoList = [...cachedPaymentUtxoList];
        if (needAmount > 0) {
            const patchPaymentUtxoList = await UnisatAPI.getUtxoByTarget(fundAddress, needAmount, feerate, false, cachedPaymentUtxoList.map(utxo => {
                return `${utxo.txid}:${utxo.txid}`;
            }));
            paymentUtxoList.push(...patchPaymentUtxoList);
        }
        paymentUtxoList.forEach(utxo => utxo.pubkey = fundPublicKey);

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
        const buyingPsbt = new bitcoin.Psbt({network: config.network});

        // 先添加1个付款的utxo用于占位，让挂单与结算utxo的索引一致
        const firstPaymentUtxo = paymentUtxoList[0];
        const vin = await PsbtUtil.utxo2PsbtInputEx(firstPaymentUtxo);
        buyingPsbt.addInput(vin);
        totalInputValue += firstPaymentUtxo.value;
        signingIndexes.push(0);

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

        // 前面已经添加了1个，index从1开始
        for (let i = 1; i < paymentUtxoList.length; i++) {
            const paymentUtxo = paymentUtxoList[i];
            const vin = await PsbtUtil.utxo2PsbtInputEx(paymentUtxo);
            buyingPsbt.addInput(vin);

            totalInputValue += paymentUtxo.value;
            signingIndexes.push(signingIndexes.length + psbtList.length);
        }

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
            address: config.revenueAddress.market,
            value: totalMakerFee + totalTakerFee
        });
        totalOutputValue += totalMakerFee + totalTakerFee;

        const changeValue = totalInputValue - totalOutputValue - txFee;
        if (changeValue < 0) {
            throw new Error('Insufficient utxo balance');
        }
        if (changeValue > 546) {
            buyingPsbt.addOutput({
                address: fundAddress,
                value: changeValue
            });
        }

        // 将buyingPsbt的所有为部分签名类型的input的签名数据删除
        PsbtUtil.removePartialSignature(buyingPsbt);

        return {
            hex: buyingPsbt.toHex(),
            base64: buyingPsbt.toBase64(),
            signingIndexes: [{
                address: fundAddress,
                signingIndexes: signingIndexes
            }]
        };
    }

    static async preAccelerateTrade(fundAddress, fundPublicKey, assetAddress, txid, feerate, userAddress) {
        if (assetAddress !== userAddress) {
            throw new Error('Can not accelerate trade for other address');
        }
        const listingList = await MarketListingMapper.getByTxids([txid]);
        return await this.createUnsignedBuying(listingList[0].alkanesId, listingList.map(listing => listing.id), fundAddress, fundPublicKey, assetAddress, feerate, true);
    }

    static async putSignedBuying(signedPsbt, walletType, accelerate = false) {
        //从买家已签名的psbt中获取资产，再从数据库中获取对应的listing，最后把这些listing的卖家签名填到psbt中
        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);
        const listingOutputList = [];
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            listingOutputList.push(`${sellerInput.txid}:${sellerInput.vout}`);
        }
        let alkanesId = null;
        let txid = null;
        const buyerAddress = originalPsbt.txOutputs[0].address;
        await sequelize.transaction(async (transaction) => {
            const listingList = await MarketListingMapper.getByOutputs(listingOutputList, transaction);
            // 检查所有挂单状态是否为LIST
            if (!accelerate) {
                for (const listing of listingList) {
                    if (listing.status !== Constants.LISTING_STATUS.LIST) {
                        throw new Error('Some items in your order are already purchased or delisted.');
                    }
                }
            }
            signedPsbt = PsbtUtil.fillListingSign({
                assetPsbtList: listingList.map((l) => l.psbtData),
                dstPsbt: signedPsbt,
            });

            const txInfo = PsbtUtil.convertPsbtHex(signedPsbt);
            txid = txInfo.txid;
            alkanesId = listingList[0].alkanesId;

            const eventList = [];
            for (const listing of listingList) {
                const marketEvent = {
                    id: BaseUtil.genId(),
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

            await MarketListingMapper.bulkUpdateListing(listingOutputList, Constants.LISTING_STATUS.SOLD, buyerAddress, txid, walletType, alkanesId, transaction);
            if (!accelerate) {
                await MarketEventMapper.bulkUpsertEvent(eventList, transaction);
            } else {
                const existingEvent = await MarketEventMapper.getSoldEventByListingOutput(eventList[0].listingOutput);
                await MarketEventMapper.updateEventTxHash(existingEvent.txHash, txid, transaction);
            }

            const {error} = await UnisatAPI.unisatPush(signedPsbt);
            if (PsbtUtil.checkPushConflict(error)) {
                // await MarketService.checkListingSpent(signedPsbt, walletType);
                throw new Error('Some items in your order are already purchased or delisted.');
            } else if (error) {
                throw new Error(error);
            }
        });

        await TokenInfoService.refreshTokenFloorPrice(alkanesId);
        return txid;
    }

    static async checkListingSpent(signedPsbt, walletType) {
        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);

        const listingOutputMap = new Map();
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            const spendInfo = await MempoolUtil.getTxOutspend(sellerInput.txid, sellerInput.vout);

            if (spendInfo.spent) {
                if (!listingOutputMap.has(spendInfo.txid)) {
                    listingOutputMap.set(spendInfo.txid, []);
                }
                listingOutputMap.get(spendInfo.txid).push(`${sellerInput.txid}:${sellerInput.vout}`);
            }
        }

        for (const [txid, outputList] of listingOutputMap.entries()) {
            await MarketListingMapper.bulkUpdateListing(outputList, Constants.LISTING_STATUS.DELIST, '', txid, walletType);
        }

        // 将listingOutputMap的所有value合并成一个array
        const outputList = [];
        for (const outputList of listingOutputMap.values()) {
            outputList.push(...outputList);
        }
        if (outputList.length > 0) {
            const listingList = await MarketListingMapper.getByOutputs(outputList);
            // 遍历listingList, 获取所有alkanesId并去重后删除缓存
            const alkanesIdList = [...new Set(listingList.map(listing => listing.alkanesId))];
            for (const alkanesId of alkanesIdList) {
                await MarketListingMapper.deleteListingCache(alkanesId);
            }
        }
    }

    static async checkAlkanes(utxo, maxHeight) {
        const alkanesList = await AlkanesService.getAlkanesByUtxo(utxo, maxHeight, config.alkanesUrl);
        if (alkanesList === null || alkanesList.length < 1) {
            throw new Error('No Alkanes assets found');
        }
        if (alkanesList.length > 1) {
            throw new Error('Multiple Alkanes assets exist');
        }
        return alkanesList[0];
    }

    static reverseListingAmount(sellAmount) {
        if (config.market.makerFee === 0) {
            return sellAmount;
        }
        const rate = config.market.makerFee / 1000;
        const listingAmount = sellAmount / (1 - rate);
        const makerFee = listingAmount * rate;
        if (makerFee >= config.market.minimumFee) {
            return Math.ceil(listingAmount);
        }
        return sellAmount + config.market.minimumFee;
    }

    static getMakerFee(listingAmount) {
        if (config.market.makerFee === 0) {
            return 0;
        }
        return Math.max(Math.ceil(listingAmount * config.market.makerFee / 1000), config.market.minimumFee);
    }

    static getTakerFee(discountAddress, listingAmount) {
        if (discountAddress) {
            return Math.max(Math.ceil(listingAmount * discountAddress.takerFee / 1000), config.market.minimumFee);
        }
        return Math.max(Math.ceil(listingAmount * config.market.takerFee / 1000), config.market.minimumFee);
    }

    static async delistingByOutput(delistingTxid, {txid, vout}) {
        const listing = await MarketListingMapper.findByOutput(`${txid}:${vout}`);
        if (!listing) {
            return;
        }
        const updatedListing = await MarketListingMapper.updateListing(listing.id, {
            status: Constants.LISTING_STATUS.DELIST,
        }, Constants.LISTING_STATUS.LIST);
        if (+updatedListing <= 0) {
            return;
        }
        await MarketEventMapper.upsertEvent({
            id: BaseUtil.genId(),
            type: Constants.MARKET_EVENT.DELIST,
            alkanesId: listing.alkanesId,
            tokenAmount: listing.tokenAmount,
            listingPrice: listing.listingPrice,
            listingAmount: listing.listingAmount,
            listingOutput: listing.listingOutput,
            sellerAddress: listing.sellerAddress,
            txHash: delistingTxid
        });
    }

    static async rollbackListingFromSold(txids) {
        // txids是被rbf替换了的交易, 要检查listing中哪些挂单中使用txHash记录了是被这些交易购买的, 但是因为这些交易被替换了, 挂单的utxo可能回到了未花费状态, 需要对这些挂单进行状态回滚
        // 还要删除对应的market_event
        const listingList = await MarketListingMapper.getByTxids(txids);
        if (listingList.length <= 0) {
            return;
        }
        const errors = [];
        let needRollbackList = await BaseUtil.concurrentExecute(listingList, async (listing) => {
            // 检查listingOutput的花费状态
            const [txid, vout] = listing.listingOutput.split(':');
            const spendInfo = await MempoolUtil.getTxOutspend(txid, vout);
            if (spendInfo.spent) { // 已花费, 不处理
                return;
            }
            return listing;
        }, null, errors);
        if (errors.length > 0) {
            throw new Error('Failed to rollback listing');
        }
        needRollbackList = needRollbackList.filter(listing => listing != null);
        if (needRollbackList.length <= 0) {
            return;
        }
        // 将needRollbackList按alkanesId分组
        const needRollbackMap = new Map();
        for (const listing of needRollbackList) {
            if (!needRollbackMap.has(listing.alkanesId)) {
                needRollbackMap.set(listing.alkanesId, []);
            }
            needRollbackMap.get(listing.alkanesId).push(listing);
        }
        const markTime = new Date('2025-06-06 07:00:00');
        // 遍历needRollbackMap, 对每个alkanesId的listing进行状态回滚
        for (const [alkanesId, listingList] of needRollbackMap.entries()) {
            await MarketListingMapper.bulkRollbackListingFromSold(listingList.filter(listing => {
                return listing.updatedAt > markTime;
            }).map(listing => listing.listingOutput), Constants.LISTING_STATUS.LIST, '', '', '', alkanesId);
        }
        // 删除对应的market_event
        await MarketEventMapper.bulkDeleteSoldEvent(needRollbackList.map(listing => listing.listingOutput));
    }

    static async confirmPendingSoldEvents() {
        let page = 1;
        const size = 100;
        while (true) {
            logger.info(`token confirmPendingSoldEvents start page: ${page}`);
            const pendingSoldEvents = await MarketEventMapper.getPendingSoldEvents(page, size);
            const needRollbackBuyingTxids = new Set();
            await BaseUtil.concurrentExecute(pendingSoldEvents, async (event) => {
                try {
                    const [listingTxid, listingVout] = event.listingOutput.split(':');
                    const buyingTxid = event.txHash;
                    const spendInfo = await MempoolUtil.getTxOutspend(listingTxid, listingVout);
                    if (spendInfo.spent) { // 未被花费的不处理, 因为不确定是不是被替换了
                        if (spendInfo.txid === buyingTxid) {
                            // 更新listing的交易id和买家地址
                            await MarketListingMapper.updateListingByListingOutput(event.listingOutput, {
                                txHash: buyingTxid,
                                buyerAddress: event.buyerAddress,
                                status: Constants.LISTING_STATUS.SOLD
                            });
                            if (spendInfo.status?.confirmed) {
                                await sequelize.transaction(async (transaction) => {
                                    await MarketEventMapper.updateEventById(event.id, {
                                        txConfirmedHeight: spendInfo.status.block_height
                                    }, transaction);
                                    await PointRecordService.addTokenTradePointRecord(event, spendInfo.status.block_height, transaction);
                                });
                            }
                        } else {
                            // 如果花费utxo的交易被确认了, 通过buyingTxid回滚挂单
                            if (spendInfo.status?.confirmed) {
                                needRollbackBuyingTxids.add(buyingTxid);
                                await MarketEventMapper.deleteEventById(event.id);
                            }
                        }
                    }
                } catch (err) {
                    logger.error(`token confirmPendingSoldEvents error: ${err}`);
                    throw err;
                }
            });
            if (needRollbackBuyingTxids.size > 0) {
                await this.rollbackListingFromSold([...needRollbackBuyingTxids]);
            }
            if (pendingSoldEvents.length < size) {
                break;
            }
            page++;
        }
    }

    static async rollbackConfirmedEvents(block) {
        await MarketEventMapper.rollbackConfirmed(block);
    }

    static async getUserTrades(alkanesId, userAddress, page, size) {
        const result = await MarketEventMapper.getUserTrades(alkanesId, userAddress, page, size);
        const buyEventList = result.records.filter(event => event.txConfirmedHeight === 0).filter(event => event.buyerAddress === userAddress);
        if (buyEventList.length > 0) {
            const replacedInfos = await BaseUtil.concurrentExecute([...new Set(buyEventList.map(o => o.txHash))], async (txid) => {
                const rbf = await MempoolUtil.getTxRbf(txid);
                const replacements = rbf.replacements;
                if (!replacements?.tx || replacements.tx.txid === txid || replacements.tx.mined) {
                    return null;
                }
                return {
                    txid: txid,
                    feerate: replacements.tx.rate
                }
            });
            const replacedTxids = replacedInfos.map(o => o?.txid).filter(o => o != null);
            result.records.forEach(event => {
                if (replacedTxids.includes(event.txHash)) {
                    event.replaced = true;
                    event.replacedFeerate = replacedInfos.find(o => o?.txid === event.txHash).feerate;
                }
            });
        }
        return result;
    }
}