import * as RedisHelper from "../lib/RedisHelper.js";
import NftMarketEvent from "../models/NftMarketEvent.js";
import { Op } from 'sequelize';
import NftMarketListing from '../models/NftMarketListing.js';
import NftItem from '../models/NftItem.js';
import {Constants} from "../conf/constants.js";
import NftItemMapper from "../mapper/NftItemMapper.js";
import IndexerService from "./IndexerService.js";
import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import FeeUtil from "../utils/FeeUtil.js";
import config from "../conf/config.js";
import AlkanesService from "./AlkanesService.js";
import BigNumber from "bignumber.js";
import BaseUtil from "../utils/BaseUtil.js";
import NftMarketListingMapper from "../mapper/NftMarketListingMapper.js";
import NftMarketEventMapper from "../mapper/NftMarketEventMapper.js";
import NftCollectionService from "./NftCollectionService.js";
import MempoolUtil from "../utils/MempoolUtil.js";

export default class NftMarketService {

    static async assets(collectionId, assetAddress, byIndexer = false) {
        if (!byIndexer) {
            const maxHeight = await AlkanesService.getMaxHeight();
            const items = await NftItemMapper.getCollectionItems(collectionId);
            if (items.length <= 0) {
                return [];
            }
            const alkanesIds = items.map(item => item.id);
            const alkanesList = await AlkanesService.getAlkanesUtxoByAddress(assetAddress, alkanesIds, maxHeight);
            if (alkanesList.length <= 0) {
                return [];
            }
            const listingList = await NftMarketListingMapper.getUserListing(assetAddress, alkanesList.map(utxo => utxo.alkanesId));

            const listingOutputs = new Set(listingList.map(listing => listing.listingOutput));
            return alkanesList.filter(utxo => {
                return !listingOutputs.has(`${utxo.txid}:${utxo.vout}`);
            });
        }
        const items = await NftItemMapper.getAddressCollectionItems(assetAddress, collectionId);
        if (items.length <= 0) {
            return [];
        }
        let outpoints = await IndexerService.getOutpointsByAlkanesIds(items.map(item => item.id));
        outpoints = outpoints.filter(outpoint => {
            return outpoint.address === assetAddress;
        });
        return outpoints.map(outpoint => {
            const item = items.find(item => item.id === outpoint.alkanesId);
            if (!item) {
                return null;
            }
            return {
                address: assetAddress,
                txid: outpoint.txid,
                vout: outpoint.vout,
                value: outpoint.value,
                alkanesId: outpoint.alkanesId,
                name: item.name,
                symbol: item.symbol,
                tokenAmount: outpoint.balance
            }
        }).filter(item => item != null);
    }

    static getEventCacheKey(collectionId, sellerAddress, types, page, size) {
        return `nft-events:${collectionId}:${sellerAddress || 'all'}:${types || 'all'}:${page}:${size}`;
    }

    static async getEventPage(collectionId, sellerAddress, types, page, size) {
        const cacheKey = this.getEventCacheKey(collectionId, sellerAddress, types, page, size);
        // 查缓存
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }

        const whereClause = {
            collectionId: collectionId
        };
        if (types != null) {
            whereClause.type = {
                [Op.in]: types.split(',').map(type => parseInt(type))
            };
        }
        if (sellerAddress) {
            whereClause.sellerAddress = sellerAddress;
        }

        const { rows, count } = await NftMarketEvent.findAndCountAll({
            where: whereClause,
            offset: (page - 1) * size,
            limit: size
        });
        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };
        // 写缓存，10秒有效期
        await RedisHelper.setEx(cacheKey, 10, JSON.stringify(result));
        return result;
    }


    static getListingCacheKey(collectionId, name, orderType, page, size) {
        return `nft-listings:${collectionId}:${name || 'all'}:${orderType}:${page}:${size}`;
    }

    static async deleteListingCache(collectionId) {
        await RedisHelper.scan(`nft-listings:${collectionId}:*`, 1000, true);
        await this.refreshCollectionListing(collectionId);
    }

    static async getListingPage(collectionId, name, orderType, page, size) {
        const cacheKey = this.getListingCacheKey(collectionId, name, orderType, page, size);
        // 查缓存
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }
        // orderType取值: listingPriceAsc, listingPriceDesc
        // 如果name为null, 则直接NftMarketListing分页查询, 然后根据查询结果从NftItem表中取出item
        // 如果name不为null, 则需要在关联NftItem表的name模糊查询, 然后根据查询结果从NftItem表中取出item
        
        const whereClause = {
            collectionId: collectionId,
            status: Constants.LISTING_STATUS.LIST // 1:已上架
        };

        let order = ["listingPrice", "ASC"];
        if (orderType === Constants.LISTING_ORDER_TYPE.PRICE_DESC) {
            order = ["listingPrice", "DESC"];
        }
        if (name) {
            whereClause.itemName = {
                [Op.like]: `%${name}%`
            };
        }

        const { count, rows } = await NftMarketListing.findAndCountAll({
            where: whereClause,
            order: order,
            limit: size,
            offset: (page - 1) * size
        });

        // 获取所有itemId
        const itemIds = rows.map(row => row.itemId);
        
        // 从NftItem表中取出item信息
        const items = await NftItem.findAll({
            where: {
                id: itemIds
            }
        });

        // 将item信息合并到listing中
        const records = rows.map(row => {
            const item = items.find(item => item.id === row.itemId);
            return {
                ...row.toJSON(),
                item: item ? item.toJSON() : null
            };
        });

        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records
        };

        // 写缓存，3秒有效期
        await RedisHelper.setEx(cacheKey, 3, JSON.stringify(result));
        return result;
    }

    static getMakerFee(listingAmount) {
        return Math.max(Math.ceil(listingAmount * config.market.makerFee / 1000), config.market.minimumFee);
    }

    static getTakerFee(listingAmount) {
        return Math.max(Math.ceil(listingAmount * config.market.takerFee / 1000), config.market.minimumFee);
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

    static async createUnsignedListing(assetAddress, assetPublicKey, fundAddress, listingList) {
        const psbt = new bitcoin.Psbt({network: config.network});

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

            const makerFee = this.getMakerFee(listing.listingAmount);
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
        PsbtUtil.validatePsbtSignatures(originalPsbt);

        const listingList = [];
        const eventList = [];
        const maxHeight = await AlkanesService.getMaxHeight();
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            const sellerAmount = originalPsbt.txOutputs[i].value || 0;
            if (sellerAmount < (2000 - config.market.minimumFee)) {
                throw new Error('Below the minimum sale amount: 2000 sats');
            }
            PsbtUtil.checkInput(originalPsbt.data.inputs[i]);

            const alkanes = await this.checkAlkanes(sellerInput, maxHeight);
            if (alkanes.value < 1) {
                throw new Error('Not found alkanes value.');
            }

            let listingAmount = this.reverseListingAmount(sellerAmount);
            const listingPrice = new BigNumber(listingAmount);

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
            const itemId = alkanes.id;
            const item = await NftItem.findOne({
                where: {
                    id: itemId
                }
            });   

            const marketListing = {
                id: BaseUtil.genId(),
                collectionId: item.collectionId,
                itemId,
                itemName: item.name,
                sellerAmount: sellerAmount,
                listingOutput: `${sellerInput.txid}:${sellerInput.vout}`,
                psbtData: psbt.toHex(),
                sellerAddress: sellerInput.address,
                sellerRecipient: originalPsbt.txOutputs[i].address,
                status: Constants.LISTING_STATUS.LIST
            }
            listingList.push(marketListing);

            const marketEvent = {
                id: BaseUtil.genId(),
                type: isUpdate ? Constants.MARKET_EVENT.UPDATE : Constants.MARKET_EVENT.LIST,
                listingId: marketListing.id,
                collectionId: item.collectionId,
                itemId,
                itemName: item.name,
                listingPrice: listingPrice,
                listingAmount: listingAmount,
                listingOutput: `${sellerInput.txid}:${sellerInput.vout}`,
                sellerAddress: sellerInput.address
            };
            eventList.push(marketEvent);
        }

        await NftMarketListingMapper.bulkUpsertListing(listingList);
        await NftMarketEventMapper.bulkUpsertEvent(eventList);
        await this.deleteListingCache(listingList[0].collectionId);

        await NftCollectionService.refreshCollectionFloorPrice(listingList[0].collectionId);
    }

    
    static async createUnsignedUpdate(collectionId, listingList, assetAddress, assetPublicKey, fundAddress, walletType) {
        const listingIds = [];
        const listingMap = new Map();
        for (const listing of listingList) {
            listingIds.push(listing.id);
            listingMap.set(listing.id, listing.amount);
        }

        const existListingList = await NftMarketListingMapper.getByIds(collectionId, listingIds);
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

            const alkanes = await this.checkAlkanes(sellerInput, 0);
            if (alkanes.value < 1) {
                failedList.push(`${sellerInput.txid}:${sellerInput.vout}`);
                continue;
            }

            const vin = await PsbtUtil.utxo2PsbtInputEx(sellerInput);
            vin.sighashType = bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;
            vin.sequence = 0xffffffff;
            psbt.addInput(vin);

            const listingAmount = listingMap.get(listing.id);
            const makerFee = this.getMakerFee(listingAmount);
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
            await NftMarketListingMapper.bulkUpdateListing(failedList, Constants.LISTING_STATUS.DELIST, '', '', walletType, collectionId);
            await this.deleteListingCache(collectionId);
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


    static async createUnsignedDelisting(collectionId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, walletType) {
        const listingList = await NftMarketListingMapper.getByIds(collectionId, listingIds);
        if (listingList === null || listingList.length === 0) {
            throw new Error('Not found listing, Please refresh and retry.');
        }

        const failedList = [];
        const inputList = [];
        for (const listing of listingList) {
            const originalPsbt = PsbtUtil.fromPsbt(listing.psbtData);
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);

            const alkanes = await this.checkAlkanes(sellerInput, 0);
            if (alkanes.value < 1) {
                failedList.push(`${sellerInput.txid}:${sellerInput.vout}`);
                continue;
            }

            sellerInput.pubkey = assetPublicKey;
            inputList.push(sellerInput);
        }

        if (failedList.length > 0) {
            await NftMarketListingMapper.bulkUpdateListing(failedList, Constants.LISTING_STATUS.DELIST, '', '', walletType);
            await this.deleteListingCache(collectionId);
            throw new Error('The assets have been transferred, please refresh and try again.');
        }

        const outputList = [];
        const transferList = [];
        for (let i = 0; i < listingList.length; i++) {
            outputList.push({
                address: assetAddress,
                value: 546
            });
            transferList.push({
                id: listingList[i].itemId,
                amount: 0,
                output: i
            });
        }

        const protostone = AlkanesService.getBatchTransferProtostone(transferList);
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
        if (error) {
            throw new Error(error);
        }

        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);

        const listingOutputList = [];
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            listingOutputList.push(`${sellerInput.txid}:${sellerInput.vout}`);
        }

        const listingList = await NftMarketListingMapper.getByOutputs(listingOutputList);
        const eventList = [];
        for (const listing of listingList) {
            const marketEvent = {
                id: BaseUtil.genId(),
                type: Constants.MARKET_EVENT.DELIST,
                listingId: listing.id,
                collectionId: listing.collectionId,
                itemId: listing.itemId,
                itemName: listing.itemName,
                listingPrice: listing.listingPrice,
                listingAmount: listing.listingAmount,
                listingOutput: listing.listingOutput,
                sellerAddress: listing.sellerAddress,
                txHash: txid
            };
            eventList.push(marketEvent);
        }

        await NftMarketListingMapper.bulkUpdateListing(listingOutputList, Constants.LISTING_STATUS.DELIST, '', txid, walletType);
        await this.deleteListingCache(listingList[0].collectionId);
        await NftMarketEventMapper.bulkUpsertEvent(eventList);

        await NftCollectionService.refreshCollectionFloorPrice(listingList[0].collectionId);
    }


    static async createUnsignedBuying(collectionId, listingIds, fundAddress, fundPublicKey, assetAddress, feerate) {
        const listingList = await NftMarketListingMapper.getByIds(collectionId, listingIds);
        if (listingList === null || listingList.length !== listingIds.length) {
            throw new Error('Some items in your order are already purchased or delisted.');
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
        const totalTakerFee = listingList.reduce((accumulator, currentValue) => accumulator + this.getTakerFee(currentValue.listingAmount), 0);

        const outputList = [];
        const transferList = [];
        for (let i = 0; i < listingList.length; i++) {
            outputList.push({
                address: assetAddress,
                value: config.market.postage
            });
            transferList.push({
                id: listingList[i].itemId,
                amount: 0,
                output: i
            });
        }
        const protostone = AlkanesService.getBatchTransferProtostone(transferList);

        // 输入: dummyCount + 出售地址 + 1付款
        const inputAddresses = [...sellerAddressList, {address: fundAddress}];
        // 输出: 1合并dummy + 1接收地址 + 收款地址 +1转账脚本 +1手续费 + dummyCount + 1找零
        const outputAddresses = [{address: fundAddress}, {address: assetAddress}, ...sellerRecipientList, {script: protostone}, {address: config.revenueAddress.market}, {address: fundAddress}];
        let txFee = Math.ceil(FeeUtil.estTxSize(inputAddresses, outputAddresses) * feerate);

        const totalAmount = Math.ceil(totalListingAmount + totalMakerFee + totalTakerFee + txFee);
        const paymentUtxoList = await UnisatAPI.getUtxoByTarget(fundAddress, totalAmount, feerate);
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
        for (const output of outputList) {
            buyingPsbt.addOutput(output);
            totalOutputValue += output.value;
        }

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

        return {
            hex: buyingPsbt.toHex(),
            base64: buyingPsbt.toBase64(),
            signingIndexes: [{
                address: fundAddress,
                signingIndexes: signingIndexes
            }]
        };
    }

    static async putSignedBuying(signedPsbt, walletType) {
        const {txid, error} = await UnisatAPI.unisatPush(signedPsbt);
        if (error && (error.includes('bad-txns-inputs-missingorspent')
            || error.includes('TX decode failed')
            || error.includes('txn-mempool-conflict'))) {
            await this.checkListingSpent(signedPsbt, walletType);
            throw new Error('Some items in your order are already purchased or delisted.');
        }

        const originalPsbt = PsbtUtil.fromPsbt(signedPsbt);

        let buyerAddress = originalPsbt.txOutputs[0].address;
        const listingOutputList = [];
        for (let i = 0; i < originalPsbt.inputCount; i++) {
            const sellerInput = PsbtUtil.extractInputFromPsbt(originalPsbt, i);
            listingOutputList.push(`${sellerInput.txid}:${sellerInput.vout}`);
        }

        const listingList = await NftMarketListingMapper.getByOutputs(listingOutputList);
        const eventList = [];
        for (const listing of listingList) {
            const marketEvent = {
                id: BaseUtil.genId(),
                type: Constants.MARKET_EVENT.SOLD,
                collectionId: listing.collectionId,
                itemId: listing.itemId,
                itemName: listing.itemName,
                listingPrice: listing.listingPrice,
                listingAmount: listing.listingAmount,
                listingOutput: listing.listingOutput,
                sellerAddress: listing.sellerAddress,
                buyerAddress: buyerAddress,
                txHash: txid
            };
            eventList.push(marketEvent);
        }

        await NftMarketListingMapper.bulkUpdateListing(listingOutputList, Constants.LISTING_STATUS.SOLD, buyerAddress, txid, walletType);
        await this.deleteListingCache(listingList[0].collectionId);
        await NftMarketEventMapper.bulkUpsertEvent(eventList);

        await NftCollectionService.refreshCollectionFloorPrice(listingList[0].collectionId);
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
            await NftMarketListingMapper.bulkUpdateListing(outputList, Constants.LISTING_STATUS.DELIST, '', txid, walletType);
        }

        // 将listingOutputMap的所有value合并成一个array
        const outputList = [];
        for (const outputList of listingOutputMap.values()) {
            outputList.push(...outputList);
        }
        if (outputList.length > 0) {
            const listingList = await NftMarketListingMapper.getByOutputs(outputList);
            await this.deleteListingCache(listingList[0].collectionId);
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

    static async refreshCollectionListing(collectionId) {
        const count = await NftMarketListingMapper.countListingByCollectionId(collectionId);
        await NftCollectionService.updateCollectionListing(collectionId, count);
    }

}

