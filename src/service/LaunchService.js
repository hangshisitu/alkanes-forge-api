import {Constants} from '../conf/constants.js';
import LaunchCollectionMapper from '../mapper/LaunchCollectionMapper.js';
import LaunchCollection from '../models/LaunchCollection.js';
import * as logger from '../conf/logger.js';
import BaseUtil from '../utils/BaseUtil.js';
import MempoolService from './MempoolService.js';
import AlkanesService from './AlkanesService.js';
import AddressUtil from "../lib/AddressUtil.js";
import FeeUtil from "../utils/FeeUtil.js";
import PsbtUtil from '../utils/PsbtUtil.js';
import UnisatAPI from '../lib/UnisatAPI.js';
import config from '../conf/config.js';
import LaunchOrderMapper from '../mapper/LaunchOrderMapper.js';
import * as bitcoin from "bitcoinjs-lib";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import {LEAF_VERSION_TAPSCRIPT} from "bitcoinjs-lib/src/payments/bip341.js";
import IndexerService from "./IndexerService.js";
import BigNumber from "bignumber.js";
import TokenInfoService from './TokenInfoService.js';
import LaunchOrder from '../models/LaunchOrder.js';
import MempoolUtil from '../utils/MempoolUtil.js';
import NftItemService from './NftItemService.js';
import LaunchWhitelistMapper from '../mapper/LaunchWhitelistMapper.js';
import LaunchCollectionVote from '../models/LaunchCollectionVote.js';
import LaunchCollectionTeamMember from '../models/LaunchCollectionTeamMember.js';
import sequelize from '../lib/SequelizeHelper.js';
import {Op} from 'sequelize';
import * as RedisHelper from '../lib/RedisHelper.js';

let launchCollectionListCache = null;

export default class LaunchService {

    static async transferToLaunch(collection) {
        const stages = JSON.parse(collection.launchStages || '[]');
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        const status = await this.getLaunchStatus(mempoolHeight, collection);
        stages.forEach(stage => {
            stage.current = false;
        });
        if (status === 'minting') {
            for (const stage of stages) {
                stage.current = stage.startBlock <= mempoolHeight && (stage.endBlock === 0 || stage.endBlock >= mempoolHeight);
                stage.end = stage.endBlock !== 0 && stage.endBlock < mempoolHeight;
            }
        }
        return {
            id: collection.id,
            name: collection.name,
            logo: collection.image,
            cover: collection.launchImage,
            banner: collection.launchBanner,
            stages: stages,
            identifier: collection.collectionId,
            minted: collection.minted,
            totalSupply: collection.totalSupply,
            progress: collection.progress,
            startBlock: collection.startBlock,
            endBlock: collection.endBlock,
            mintActive: collection.mintActive,
            description: collection.description,
            funding: collection.funding,
            twitter: collection.twitter,
            discord: collection.discord,
            website: collection.website,
            telegram: collection.telegram,
            mempool: collection.mempool,
            status: status
        }
    }

    static async getDetail(id, needMempool = true) {
        const collection = await LaunchCollectionMapper.findById(id);
        if (!collection) {
            throw new Error('Collection not found');
        }
        if (needMempool && collection.collectionId) {
            collection.mempool = await MempoolService.getMempoolData(collection.collectionId);
        }
        const totalSupply = collection.totalSupply;
        if (totalSupply == null || totalSupply === 0) {
            collection.progress = 0;
        } else {
            collection.progress = Number((collection.minted / totalSupply * 100).toFixed(2));
        }
        const retCollection = await this.transferToLaunch(collection);
        const teamMembers = await LaunchCollectionTeamMember.findAll({
            attributes: ['name', 'head', 'title', 'description', 'twitter'],
            where: {
                launchId: id
            },
            raw: true
        });
        retCollection.teamMembers = teamMembers;
        retCollection.voteInfo = await this.getVoteInfo(id);
        return retCollection;
    }

    static async getAllLaunchCollection() {
        return await LaunchCollection.findAll({
            raw: true
        });
    }

    static async refreshLaunchCollectionCache() {
        while (true) {
            try {
                launchCollectionListCache = await this.getAllLaunchCollection();
            } catch (error) {
                logger.error('Error refreshing launch collection cache:', error);
            }
            await BaseUtil.sleep(10000);
        }
    }

    static async getAllLaunchCollectionCache() {
        return launchCollectionListCache ?? await this.getAllLaunchCollection();
    }

    static async getLaunchStatus(block, collection) {
        if (!collection.audited) {
            return 'reviewing';
        }
        if (!collection.mintActive || collection.progress >= 100) {
            return 'completed';
        }
        if (block == null) {
            block = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        }
        const startBlock = collection.startBlock;
        const endBlock = collection.endBlock;
        if (startBlock - 1 > block) { // 未开始
            return 'upcoming';
        } else if (endBlock > 0 && endBlock < block) { // 已结束, endBlock为0时表示没有结束时间, 打完为止
            return 'completed';
        } else { // 进行中
            return 'minting';
        }
    }

    static async getBannerCollections() {
        const collections = await this.getAllLaunchCollectionCache();
        await this.updateCollectionsProgress(collections);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        const retCollections = collections
            .filter(collection => collection.launchRank > 0)
            .sort((a, b) => a.launchRank - b.launchRank);
        const retLaunchCollections = [];
        for (const collection of retCollections) {
            const launch = await this.transferToLaunch(collection);
            launch.status = await this.getLaunchStatus(mempoolHeight, collection);
            retLaunchCollections.push(launch);
        }
        const voteInfos = await this.getVoteInfos(retLaunchCollections.map(collection => collection.id));
        retLaunchCollections.forEach(collection => {
            collection.voteInfo = voteInfos[collection.id];
        });
        return retLaunchCollections;
    }

    static async updateCollectionsProgress(collections) {
        collections?.forEach(collection => {
            const totalSupply = collection.totalSupply;
            if (totalSupply == null || totalSupply === 0) {
                collection.progress = 0;
            } else {
                collection.progress = Number((collection.minted / totalSupply * 100).toFixed(2));
            }
        });
    }

    static async getLaunchCollections(page, size) {
        const collections = await this.getAllLaunchCollectionCache();
        await this.updateCollectionsProgress(collections);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        let filteredCollections = [...collections];
        for (const collection of filteredCollections) {
            collection.status = await this.getLaunchStatus(mempoolHeight, collection);
        }
        filteredCollections = filteredCollections.filter(collection => collection.status !== 'completed').sort((a, b) => {
            const aStatus = a.status;
            const bStatus = b.status;
            if (aStatus === bStatus) {
                if (aStatus === 'reviewing') {
                    return a.createdAt.getTime() - b.createdAt.getTime();
                } else if (aStatus === 'upcoming') {
                    return a.startBlock - b.startBlock;
                } else if (aStatus === 'minting') {
                    return a.endBlock - b.endBlock;
                }
                return 0;
            }
            if (aStatus === 'minting') {
                return -1; // 排在前面
            }
            if (aStatus === 'upcoming') {
                if (bStatus === 'minting') {
                    return 1;
                }
                return -1; // 排在前面
            }
            if (aStatus === 'reviewing') {
                if (bStatus === 'minting' || bStatus === 'upcoming') {
                    return 1;
                }
                return -1; // 排在前面
            }
            return 0;
        });
        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const pageCollections = filteredCollections.slice(startIndex, endIndex);
        for (const collection of pageCollections) {
            if (collection.collectionId) {
                collection.mempool = await MempoolService.getMempoolData(collection.collectionId);
            }
        }
        const rows = [];
        for (const collection of pageCollections) {
            const launch = await this.transferToLaunch(collection);
            launch.status = await this.getLaunchStatus(mempoolHeight, collection);
            rows.push(launch);
        }
        const voteInfos = await this.getVoteInfos(rows.map(collection => collection.id));
        rows.forEach(collection => {
            collection.voteInfo = voteInfos[collection.id];
        });
        return {
            page,
            size,
            total: filteredCollections.length,
            pages: Math.ceil(filteredCollections.length / size),
            records: rows
        };
    }

    static async getMintingCollections(page, size) {
        const collections = await this.getAllLaunchCollectionCache();
        await this.updateCollectionsProgress(collections);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        let filteredCollections = collections.filter(collection => collection.audited).sort((a, b) => {
            return a.endBlock - b.endBlock;
        });
        for (const collection of filteredCollections) {
            collection.status = await this.getLaunchStatus(mempoolHeight, collection);
        }
        filteredCollections = filteredCollections.filter(collection => collection.status === 'minting');

        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const pageCollections = filteredCollections.slice(startIndex, endIndex);
        for (const collection of pageCollections) {
            if (collection.collectionId) {
                collection.mempool = await MempoolService.getMempoolData(collection.collectionId);
            }
        }
        const rows = [];
        for (const collection of pageCollections) {
            const launch = await this.transferToLaunch(collection);
            launch.status = await this.getLaunchStatus(mempoolHeight, collection);
            rows.push(launch);
        }
        const voteInfos = await this.getVoteInfos(rows.map(collection => collection.id));
        rows.forEach(collection => {
            collection.voteInfo = voteInfos[collection.id];
        });
        return {
            page,
            size,
            total: filteredCollections.length,
            pages: Math.ceil(filteredCollections.length / size),
            records: rows
        };
    }

    static async getUpcomingCollections(page, size) {
        const collections = await this.getAllLaunchCollectionCache();
        await this.updateCollectionsProgress(collections);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        let filteredCollections = collections.filter(collection => collection.audited).sort((a, b) => {
            return a.startBlock - b.startBlock;
        });
        for (const collection of filteredCollections) {
            collection.status = await this.getLaunchStatus(mempoolHeight, collection);
        }
        filteredCollections = filteredCollections.filter(collection => collection.status === 'upcoming');

        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const rows = [];
        for (const collection of filteredCollections.slice(startIndex, endIndex)) {
            const launch = await this.transferToLaunch(collection);
            launch.status = await this.getLaunchStatus(mempoolHeight, collection);
            rows.push(launch);
        }
        const voteInfos = await this.getVoteInfos(rows.map(collection => collection.id));
        rows.forEach(collection => {
            collection.voteInfo = voteInfos[collection.id];
        });

        return {
            page,
            size,
            total: filteredCollections.length,
            pages: Math.ceil(filteredCollections.length / size),
            records: rows
        };
    }

    static async getCompletedCollections(page, size) {
        const collections = await this.getAllLaunchCollectionCache();
        await this.updateCollectionsProgress(collections);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        let filteredCollections = collections.filter(collection => collection.audited).sort((a, b) => {
            return a.endBlock - b.endBlock;
        });
        for (const collection of filteredCollections) {
            collection.status = await this.getLaunchStatus(mempoolHeight, collection);
        }
        filteredCollections = filteredCollections.filter(collection => collection.status === 'completed');

        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const rows = [];
        for (const collection of filteredCollections.slice(startIndex, endIndex)) {
            const launch = await this.transferToLaunch(collection);
            launch.status = await this.getLaunchStatus(mempoolHeight, collection);
            rows.push(launch);
        }
        const voteInfos = await this.getVoteInfos(rows.map(collection => collection.id));
        rows.forEach(collection => {
            collection.voteInfo = voteInfos[collection.id];
        });

        return {
            page,
            size,
            total: filteredCollections.length,
            pages: Math.ceil(filteredCollections.length / size),
            records: rows
        };
    }

    static async getAuditCollections(page, size) {
        const collections = await this.getAllLaunchCollectionCache();
        await this.updateCollectionsProgress(collections);
        const filteredCollections = collections.filter(collection => !collection.audited).sort((a, b) => {
            return a.createdAt.getTime() - b.createdAt.getTime();
        });

        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const pageCollections = filteredCollections.slice(startIndex, endIndex);
        const rows = [];
        for (const collection of pageCollections) {
            const launch = await this.transferToLaunch(collection);
            launch.status = await this.getLaunchStatus(null, collection);
            rows.push(launch);
        }
        const voteInfos = await this.getVoteInfos(rows.map(collection => collection.id));
        rows.forEach(collection => {
            collection.voteInfo = voteInfos[collection.id];
        });
        return {
            page,
            size,
            total: filteredCollections.length,
            pages: Math.ceil(filteredCollections.length / size),
            records: rows
        };
    }

    static async updateCollectionsMinted(infos, options = {transaction: null}) {
        await LaunchCollectionMapper.bulkUpdateCollectionsMinted(infos, options);
    }

    static async createOrder(collectionId, userAddress, fundAddress, fundPublicKey, assetAddress, assetPublicKey, toAddress, feerate, paymentType, paymentAssets, paymentAmount) {
        const collection = await LaunchCollectionMapper.findByCollectionId(collectionId);
        if (!collection) {
            throw new Error('Collection not found');
        }
        if (collection.mintActive === 0) {
            throw new Error('Collection cannot be minting now');
        }

        let psbt;
        const orderId = BaseUtil.genId();
        const privateKey = AddressUtil.generatePrivateKeyFromString(orderId);
        const stages = JSON.parse(collection.launchStages);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        const currentStage = LaunchService.getCurrentStage(mempoolHeight, stages);
        const {available} = await this.getMintLimit0(toAddress, collection.id, collection.collectionId, stages, currentStage.name);
        if (available === 0) {
            throw new Error('Minted count exceeds limit.');
        }

        const order = {
            id: orderId,
            alkanesId: collectionId,
            userAddress: userAddress,
            paymentAddress: fundAddress,
            receiveAddress: toAddress,
            paymentType: paymentType,
            paymentAssets: paymentAssets,
            paymentAmount: paymentAmount,
            paymentVout: 0,
            paymentValue: 0,
            feerate: feerate,
            postage: 546, // 暂时固定
            mints: 1, // 暂时固定
            mintStage: currentStage.name,
            mintStatus: Constants.MINT_ORDER_STATUS.UNPAID
        };
        // 白名单机制
        if (currentStage.type === 'private') {
            // 查询白名单信息
            const whitelist = await LaunchWhitelistMapper.findAddressStageWhitelist(collection.id, currentStage.name, toAddress);
            if (!whitelist) {
                throw new Error(`Address ${toAddress} is not in the whitelist of stage ${currentStage.name}`);
            }

            const publicKey = AddressUtil.convertKeyPair(privateKey).publicKey.toString('hex');
            const payment = LaunchService.generatePayment(publicKey, toAddress, whitelist.index, whitelist.limit, whitelist.proof);
            order.mintAddress = payment.address;

            const tapLeafScript = [
                {
                    leafVersion: LEAF_VERSION_TAPSCRIPT,
                    script: payment.redeem.output,
                    controlBlock: payment.witness[payment.witness.length - 1],
                    stack: payment.witness.slice(0, -2),
                },
            ]

            // BTC付款
            if (paymentType.toUpperCase() === 'BTC') {
                const outputList = [];

                // 计算铸造花费的Gas，预留到脚本地址
                const mintProtostone = AlkanesService.getMintProtostone(collection.collectionId, 78, Constants.MINT_MODEL.NORMAL);
                const mintSize = FeeUtil.estTxSize([{address: payment.address, tapLeafScript}], [{address: toAddress}, {address: collection.paymentAddress}, {script: mintProtostone}]);
                const mintFee = Math.ceil(mintSize * feerate) + 546;
                outputList.push({
                    address: payment.address,
                    value: paymentAmount + mintFee
                });
                order.paymentValue = paymentAmount + mintFee;

                // 手续费地址
                outputList.push({
                    address: config.revenueAddress.launch,
                    value: 1000
                });

                const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
                const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
                const txFee = Math.floor(txSize * feerate);
                const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + totalOutputValue + 1000, feerate);
                utxoList.map(utxo => utxo.pubkey = fundPublicKey);

                psbt = await PsbtUtil.createUnSignPsbt(utxoList, outputList, fundAddress, feerate);
            }
            // Alkanes付款
            else {
                const needAmount = new BigNumber(paymentAmount).multipliedBy(10 ** 8);
                order.paymentAmount = needAmount.toFixed();
                const outpointList = await IndexerService.getOutpointListByTarget(assetAddress, paymentAssets, needAmount);
                const totalInputAmount = outpointList.reduce((accumulator, currentValue) => accumulator.plus(new BigNumber(currentValue.balance)), new BigNumber(0));
                const changeAmount = totalInputAmount.minus(needAmount);

                const outputList = [];
                const transferList = [];
                // 如果需要找零，付款转到第1个输出，找零到第0个输出
                if (changeAmount > 0) {
                    outputList.push({
                        address: assetAddress,
                        value: 330
                    });
                    transferList.push({
                        amount: needAmount,
                        output: 1
                    })
                }
                // 如果不需要找零，转到第0个输出
                else {
                    transferList.push({
                        amount: needAmount,
                        output: 0
                    })
                }

                // 计算铸造花费的Gas，预留到脚本地址
                const mintProtostone = AlkanesService.getPayMintProtostone(collectionId, paymentAssets, changeAmount);
                const mintSize = FeeUtil.estTxSize([{address: payment.address, tapLeafScript}], [{address: assetAddress}, {script: mintProtostone}]);
                const mintFee = Math.ceil(mintSize * feerate) + 546;
                outputList.push({
                    address: payment.address,
                    value: mintFee
                })
                order.paymentVout = changeAmount > 0 ? 1 : 0;
                order.paymentValue = mintFee;

                // 手续费地址
                outputList.push({
                    address: config.revenueAddress.launch,
                    value: 1000
                })

                // 转账脚本
                const transferProtostone = AlkanesService.getTransferProtostone(paymentAssets, transferList);
                outputList.push({
                    script: transferProtostone,
                    value: 0
                })

                const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
                const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
                const txFee = Math.floor(txSize * feerate);
                const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + totalOutputValue + 1000, feerate);
                utxoList.map(utxo => utxo.pubkey = fundPublicKey);

                const inputList = [];
                for (const outpoint of outpointList) {
                    const utxo = {
                        txid: outpoint.txid,
                        vout: outpoint.vout,
                        value: parseInt(outpoint.value),
                        address: assetAddress,
                        pubkey: assetPublicKey
                    };
                    inputList.push(utxo);
                }
                inputList.push(...utxoList);
                psbt = await PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
            }
        }
        // 公售
        else {
            // BTC付款
            if (paymentType.toUpperCase() === 'BTC') {
                const outputList = [];

                // 接收铸造资产
                outputList.push({
                    address: toAddress,
                    value: 546
                })
                // 收款地址
                outputList.push({
                    address: collection.paymentAddress,
                    value: paymentAmount
                });
                // 手续费地址
                outputList.push({
                    address: config.revenueAddress.launch,
                    value: 1000
                });

                // 铸造脚本
                const mintProtostone = AlkanesService.getMintProtostone(collection.collectionId, 78, Constants.MINT_MODEL.NORMAL);
                outputList.push({
                    script: mintProtostone,
                    value: 0
                });

                const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
                const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
                const txFee = Math.floor(txSize * feerate);
                const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + totalOutputValue + 1000, feerate);
                utxoList.map(utxo => utxo.pubkey = fundPublicKey);

                psbt = await PsbtUtil.createUnSignPsbt(utxoList, outputList, fundAddress, feerate);
            }
            // Alkanes付款
            else {
                const needAmount = new BigNumber(paymentAmount).multipliedBy(10 ** 8);
                order.paymentAmount = needAmount.toFixed();
                const outpointList = await IndexerService.getOutpointListByTarget(assetAddress, paymentAssets, needAmount);
                const totalInputAmount = outpointList.reduce((accumulator, currentValue) => accumulator.plus(new BigNumber(currentValue.balance)), new BigNumber(0));
                const changeAmount = totalInputAmount.minus(needAmount);

                const outputList = [];
                // 接收铸造资产
                outputList.push({
                    address: toAddress,
                    value: 330
                });

                // 找零未花费的费用（Alkanes）
                if (changeAmount > 0) {
                    outputList.push({
                        address: assetAddress,
                        value: 330
                    });
                }

                // 手续费地址
                outputList.push({
                    address: config.revenueAddress.launch,
                    value: 1000
                });

                // 铸造脚本
                const protostone = AlkanesService.getPayMintProtostone(collectionId, paymentAssets, changeAmount);
                outputList.push({
                    script: protostone,
                    value: 0
                });

                const totalOutputValue = outputList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
                const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
                const txFee = Math.floor(txSize * feerate);
                const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + totalOutputValue + 1000, feerate);
                utxoList.map(utxo => utxo.pubkey = fundPublicKey);

                const inputList = [];
                for (const outpoint of outpointList) {
                    const utxo = {
                        txid: outpoint.txid,
                        vout: outpoint.vout,
                        value: parseInt(outpoint.value),
                        address: assetAddress,
                        pubkey: assetPublicKey
                    };
                    inputList.push(utxo);
                }
                inputList.push(...utxoList);
                psbt = await PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
            }
        }

        await LaunchOrderMapper.createOrder(order);
        return {
            orderId,
            ...psbt
        };
    }

    static async startOrder(orderId, psbt) {
        const order = await LaunchOrderMapper.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }
        if (order.mintStatus !== Constants.MINT_ORDER_STATUS.UNPAID) {
            throw new Error('Order is not unpaid');
        }

        const collection = await LaunchCollectionMapper.findByCollectionId(order.alkanesId);
        if (!collection) {
            throw new Error('Collection not found');
        }

        const privateKey = AddressUtil.generatePrivateKeyFromString(orderId);
        const stages = JSON.parse(collection.launchStages);
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        const currentStage = LaunchService.getCurrentStage(mempoolHeight, stages);

        let whitelistIndex, whitelistLimit, whitelistProof;
        if (currentStage.type === 'private') {
            const whitelist = await LaunchWhitelistMapper.findAddressStageWhitelist(collection.id, currentStage.name, order.receiveAddress);
            if (!whitelist) {
                throw new Error(`Address ${order.receiveAddress} is not in the whitelist of stage ${currentStage.name}`);
            }
            whitelistIndex = whitelist.index;
            whitelistLimit = whitelist.limit;
            whitelistProof = whitelist.proof;
        }

        const {txid, error} = await UnisatAPI.unisatPush(psbt);
        if (error) {
            throw new Error(error);
        }
        const existOrder = await LaunchOrderMapper.findByPaymentHash(txid);
        if (existOrder && existOrder.id !== orderId) {
            throw new Error('Order already exists, please refresh and retry');
        }

        let mintHash = txid;
        // 白名单，需要使用脚本地址发送铸造交易
        if (currentStage.type === 'private') {
            const publicKey = AddressUtil.convertKeyPair(privateKey).publicKey.toString('hex');

            const payment = LaunchService.generatePayment(publicKey, order.receiveAddress, whitelistIndex, whitelistLimit, whitelistProof);
            const tapLeafScript = [
                {
                    leafVersion: LEAF_VERSION_TAPSCRIPT,
                    script: payment.redeem.output,
                    controlBlock: payment.witness[payment.witness.length - 1],
                },
            ]

            const inputList = [
                {
                    txid: txid,
                    vout: order.paymentVout,
                    value: order.paymentValue,
                    address: order.mintAddress,
                    pubkey: publicKey,
                    privateKey,
                    tapLeafScript
                }
            ];

            const outputList = [];
            outputList.push({
                address: order.receiveAddress,
                value: 546
            })

            // BTC付款
            if (order.paymentType.toUpperCase() === 'BTC') {
                outputList.push({
                    address: collection.paymentAddress,
                    value: order.paymentAmount
                })

                const protostone = AlkanesService.getMintProtostone(order.alkanesId, 78, Constants.MINT_MODEL.NORMAL);
                outputList.push({
                    script: protostone,
                    value: 0
                });

                const txRet = await UnisatAPI.transfer(privateKey, inputList, outputList, order.mintAddress, 0, true, false);
                mintHash = txRet.txid;
                await LaunchOrderMapper.updateOrder(orderId, txid, mintHash, Constants.MINT_ORDER_STATUS.MINTING);
            }
            // Alkanes付款
            else {
                const protostone = AlkanesService.getPayMintProtostone(order.alkanesId, order.paymentAssets, 0);
                outputList.push({
                    script: protostone,
                    value: 0
                });

                const txRet = await UnisatAPI.transfer(privateKey, inputList, outputList, order.mintAddress, 0, true, false);
                mintHash = txRet.txid;
                await LaunchOrderMapper.updateOrder(orderId, txid, mintHash, Constants.MINT_ORDER_STATUS.MINTING);
            }
        }
        // 公售，广播就已经开始铸造
        else {
            await LaunchOrderMapper.updateOrder(orderId, txid, txid, Constants.MINT_ORDER_STATUS.MINTING);
        }

        return [mintHash];
    }

    static async getOrderPage(userAddress, page, size, collectionId) {
        const result =  await LaunchOrderMapper.getOrderPage(userAddress, page, size, collectionId);
        result.records = result.records.map(record => {
            const r = record.toJSON();
            if (r.paymentType === Constants.PAYMENT_TYPE.BTC) {
                r.paymentTokenName = 'BTC';
            }
            return r;
        });
        const alkanesIds = result.records.filter(record => record.paymentType === Constants.PAYMENT_TYPE.ALKANES).map(record => record.paymentAssets);
        if (alkanesIds.length > 0) {
            const tokenList = await TokenInfoService.getTokenList([...new Set(alkanesIds)]);
            result.records.forEach(record => {
                const token = tokenList.find(token => token.id === record.paymentAssets);
                if (token) {
                    record.paymentTokenName = token.name;
                }
            });
        }
        return result;
    }

    static generatePayment(pubkey, acceptAddress, index, limit, proof) {
        const internalPubkey = toXOnly(Buffer.from(pubkey, "hex"));
        const acceptOutputScript = bitcoin.address.toOutputScript(
            acceptAddress,
            config.network
        );

        //把index按小端子节序转成4字节的buffer
        const indexBuffer = Buffer.alloc(4);
        indexBuffer.writeUInt32LE(index, 0);

        const length = acceptOutputScript.length + 16 + proof.length / 2
        const lengthBuffer = Buffer.alloc(2);
        lengthBuffer.writeUInt16LE(length, 0);

        const limitBuffer = Buffer.alloc(4);
        limitBuffer.writeUInt32LE(limit, 0);

        let scriptASM = `${internalPubkey.toString('hex')} OP_CHECKSIG OP_0 OP_IF ${Buffer.from('BIN', 'ascii').toString("hex")} ${lengthBuffer.toString('hex')} ${acceptOutputScript.toString("hex")}${indexBuffer.toString("hex")}${limitBuffer.toString("hex")}${proof} OP_ENDIF`;

        const script = bitcoin.script.fromASM(scriptASM);
        const scriptTree = {output: script};
        const redeem = {
            output: script,
            redeemVersion: LEAF_VERSION_TAPSCRIPT,
        };

        return bitcoin.payments.p2tr({
            internalPubkey: internalPubkey,
            scriptTree,
            redeem,
            network: config.network,
        });
    }

    static async getCurrentStage(mempoolHeight, stages) {
        if (!Array.isArray(stages)) {
            throw new Error("Invalid input");
        }
        const checkHeight = mempoolHeight + 1;
        const currentStage = stages.find(stage =>
            checkHeight >= stage.startBlock && checkHeight <= stage.endBlock
        );
        if (!currentStage) {
            const firstStage = stages[0];
            const lastStage = stages[stages.length - 1];
            if (checkHeight < firstStage.startBlock) {
                throw new Error("All stages have not started yet.");
            } else if (checkHeight > lastStage.endBlock) {
                if (lastStage.endBlock === 0) {
                    return lastStage;
                }
                throw new Error("All stages have ended.");
            } else {
                throw new Error("Not in any available stage.");
            }
        }
        return currentStage;
    }

    static async refreshLaunchOrder() {
        const orders = await LaunchOrder.findAll({
            where: {
                mintStatus: Constants.MINT_ORDER_STATUS.MINTING
            }
        });
        console.log(`refreshLaunchOrder: orders count ${orders.length}`);
        await BaseUtil.concurrentExecute(orders, async (order) => {
            await LaunchService.processLaunchOrder(order);
        });
    }

    static async processLaunchOrder(order) {
        const txid = order.mintHash;
        const tx = await MempoolUtil.getTxEx(txid);
        if (!tx) {
            logger.warn(`refreshLaunchOrder: orderId ${order.id} txid ${txid} not found`);
            return;
        }
        if (tx.status.confirmed) {
            const mintResult = {
                success: true,
                data: [],
            };
            // 取trace
            const traces = await AlkanesService.trace(txid, tx.vout.length + 1);
            if (!traces?.length) {
                logger.warn(`refreshLaunchOrder: orderId ${order.id} txid ${txid} vout ${tx.vout.length + 1} traces not found`);
                return;
            }
            const events = traces.filter(trace => trace.event === 'return');
            const revertEvent = events.find(event => event.data.status === 'revert');
            if (revertEvent) {
                mintResult.success = false;
                mintResult.message = Buffer.from(revertEvent.data.response.data.slice(2).slice(8), 'hex').toString('utf8');
                await LaunchOrderMapper.updateOrderMintResult(order.id, JSON.stringify(mintResult));
                console.log(`orderId ${order.id} mint failed, message ${mintResult.message}`);
                return;
            }
            const successEvent = events.find(event => event.data.status === 'success');
            const data = successEvent.data;
            const status = data.status;
            if (status !== 'success') {
                mintResult.success = false;
                mintResult.message = Buffer.from(data.response.data.slice(2).slice(8), 'hex').toString('utf8');
            } else {
                const alkanes = data.response.alkanes;
                const alkanesIds = alkanes.map(alkane => {
                    const { block, tx } = alkane.id;
                    return `${parseInt(block, 16)}:${parseInt(tx, 16)}`;
                });
                const nftItems = await NftItemService.getItemsByIds(alkanesIds);
                const fileds = ['99', '100', '1000', '1001', '1002'];
                const errors = [];
                for (let i = 0; i < alkanes.length; i++) {
                    const alkane = alkanes[i];
                    try {
                        console.log(`Processing alkane ${i + 1}/${alkanes.length} for order ${order.id}`);
                        const { block, tx } = alkane.id;
                        const alkanesId = `${parseInt(block, 16)}:${parseInt(tx, 16)}`;
                        const nftItem = nftItems.find(item => item.id === alkanesId);
                        if (nftItem) {
                            const alkanes = await AlkanesService.getAlkanesById(alkanesId, ['1002']);
                            mintResult.data.push({
                                alkanesId,
                                symbol: nftItem.symbol,
                                name: nftItem.name,
                                image: nftItem.image,
                                data: nftItem.data,
                                attributes: JSON.parse(alkanes.attributes)
                            });
                        } else {
                            const alkanes = await AlkanesService.getAlkanesById(alkanesId, fileds);
                            if (!alkanes?.name || !alkanes?.data) {
                                throw new Error(`refreshLaunchOrder: orderId ${order.id} txid ${txid} alkane ${alkane.id} name or data not found, alkanes: ${JSON.stringify(alkanes)}`);
                            }
                            mintResult.data.push({
                                alkanesId,
                                symbol: alkanes.symbol,
                                name: alkanes.name,
                                image: alkanes.image,
                                data: alkanes.data,
                                attributes: JSON.parse(alkanes.attributes)
                            });
                        }
                    } catch (error) {
                        logger.error(`refreshLaunchOrder: orderId ${order.id} txid ${txid} alkane ${alkane.id} error ${error.message}`, error);
                        throw error; // 如果需要停止处理，保留这行；如果希望继续处理其他alkane，可以注释掉这行
                    }
                }
            }
            console.log(`orderId ${order.id} mint success, message ${JSON.stringify(mintResult)}`);
            await LaunchOrderMapper.updateOrderMintResult(order.id, JSON.stringify(mintResult));
        }
    }

    static async getMintLimit0(receiveAddress, launchId, alkanesId, stages, stageName = null) {
        let currentStage = null;
        if (!stageName) {
            if (!stages?.length) {
                return {
                    limit: -1,
                    available: -1,
                }
            }
            const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
            currentStage = LaunchService.getCurrentStage(mempoolHeight, stages);
        } else {
            currentStage = stages.find(stage => stage.name === stageName);
        }
        const limit = currentStage.limit;
        if (!limit) {
            return {
                limit: -1,
                available: -1,
            }
        }
        const orders = await LaunchOrderMapper.findStageMintByAddress(receiveAddress, currentStage.name, alkanesId);
        const mints = orders.filter(order => {
            const mintResult = order.mintResult;
            if (!mintResult) {
                return true;
            }
            const result = JSON.parse(mintResult);
            return result.success;
        }).reduce((acc, order) => +order.mints + acc, 0);
        if (currentStage.type === 'public') {
            return {
                limit,
                minted: mints,
                available: Math.max(limit - mints, 0),
            }
        }
        const hasWhitelist = await LaunchWhitelistMapper.hasStageWhitelist(launchId, currentStage.name);
        if (!hasWhitelist) { // 当前阶段没有白名单
            return {
                limit,
                minted: mints,
                available: Math.max(limit - mints, 0),
            }
        }
        const whitelist = await LaunchWhitelistMapper.findAddressStageWhitelist(launchId, currentStage.name, receiveAddress);
        if (!whitelist) { // 必须有白名单
            return {
                limit: currentStage.limit,
                minted: mints,
                available: 0,
                whitelist: false,
            }
        }
        return {
            limit: whitelist.limit,
            minted: mints,
            available: Math.max(whitelist.limit - mints, 0),
            whitelist: true,
        }
    }

    static async getMintLimit(receiveAddress, launchId) {
        const collection = await this.getDetail(launchId, false);
        if (!collection) {
            throw new Error('Collection not found');
        }
        return this.getMintLimit0(receiveAddress, collection.id, collection.identifier, collection.stages);
    }

    static async checkWhitelist(receiveAddress, launchId, stage) {
        const collection = await this.getDetail(launchId, false);
        if (!collection) {
            throw new Error('Collection not found');
        }
        const matchStage = collection.stages.find(o => o.name === stage);
        if (!matchStage) {
            throw new Error('Stage not found');
        }
        if (matchStage.type === 'public') {
            return true;
        }
        if (!await LaunchWhitelistMapper.hasStageWhitelist(launchId, stage)) {
            return false;
        }
        const whitelist = await LaunchWhitelistMapper.findAddressStageWhitelist(launchId, stage, receiveAddress);
        if (!whitelist) {
            return false;
        }
        return true;
    }

    static async vote(launchId, vote, userAddress, content, images) {
        const collection = await this.getDetail(launchId, false);
        if (!collection) {
            throw new Error('Collection not found');
        }
        if (collection.audited) {
            throw new Error('Collection can not vote now');
        }
        if (images && Array.isArray(images)) {
            images = JSON.stringify(images);
        }
        await LaunchCollectionVote.create({
            launchId,
            address: userAddress,
            vote,
            content,
            images
        }, {
            ignoreDuplicates: true
        });
    }

    static async getAddressVote(launchId, userAddress) {
        const vote = await LaunchCollectionVote.findOne({
            attributes: ['vote'],
            where: {
                launchId,
                address: userAddress
            },
            raw: true
        });
        return vote;
    }

    static async getVoteInfo(launchId) {
        const vote = await sequelize.query(`
            SELECT
                vote,
                COUNT(*) as count
            FROM launch_collection_vote
            WHERE launch_id = :launchId
            GROUP BY vote
        `, {
            raw: true,
            replacements: {
                launchId
            },
            type: sequelize.QueryTypes.SELECT
        });
        const ret = vote.reduce((acc, vote) => {
            acc[vote.vote] = vote.count;
            return acc;
        }, {});
        if (!ret[Constants.VOTE.OPPOSE]) {
            ret[Constants.VOTE.OPPOSE] = 0;
        }
        if (!ret[Constants.VOTE.AGREE]) {
            ret[Constants.VOTE.AGREE] = 0;
        }
        if (!ret[Constants.VOTE.NEUTRAL]) {
            ret[Constants.VOTE.NEUTRAL] = 0;
        }
        return ret;
    }

    static async getVoteInfos(launchIds) {
        if (!launchIds?.length) {
            return {};
        }
        const votes = await sequelize.query(`
            SELECT
                launch_id as launchId,
                vote,
                COUNT(*) as count
            FROM launch_collection_vote
            WHERE launch_id IN (:launchIds)
            GROUP BY launch_id, vote
        `, {
            raw: true,
            replacements: {
                launchIds
            },
            type: sequelize.QueryTypes.SELECT
        });
        const ret = votes.reduce((acc, vote) => {
            acc[vote.launchId] = acc[vote.launchId] ?? {};
            acc[vote.launchId][vote.vote] = vote.count;
            return acc;
        }, {});
        for (const launchId of launchIds) {
            if (ret[launchId]) {
                if (!ret[launchId][Constants.VOTE.OPPOSE]) {
                    ret[launchId][Constants.VOTE.OPPOSE] = 0;
                }
                if (!ret[launchId][Constants.VOTE.AGREE]) {
                    ret[launchId][Constants.VOTE.AGREE] = 0;
                }
                if (!ret[launchId][Constants.VOTE.NEUTRAL]) {
                    ret[launchId][Constants.VOTE.NEUTRAL] = 0;
                }
            } else {
                ret[launchId] = {
                    [Constants.VOTE.OPPOSE]: 0,
                    [Constants.VOTE.AGREE]: 0,
                    [Constants.VOTE.NEUTRAL]: 0,
                };
            }
        }
        return ret;
    }

    static async getVoteDetails(launchId, lastId, size) {
        const where = {
            launchId,
            id: {
                [Op.gt]: lastId || 0
            }
        };
        const rows = await LaunchCollectionVote.findAll({
            where,
            order: [['id', 'ASC']],
            limit: size + 1,
            raw: true
        });
        return {
            records: rows.slice(0, size),
            hasMore: rows.length > size
        };
    }

    static async modifyLaunchBlock(launchId, startBlock, endBlock, stage) {
        const collection = await LaunchCollectionMapper.findById(launchId);
        if (!collection) {
            throw new Error('Collection not found');
        }
        const data = {};
        if (startBlock != null) {
            data.startBlock = startBlock;
        }
        if (endBlock != null) {
            data.endBlock = endBlock;
        }
        const stages = JSON.parse(collection.launchStages);
        stages.forEach(o => {
            if (o.name === stage.name) {
                if (stage.startBlock != null) {
                    o.startBlock = stage.startBlock;
                }
                if (stage.endBlock != null) {
                    o.endBlock = stage.endBlock;
                }
            }
        });
        data.launchStages = JSON.stringify(stages);
        await LaunchCollectionMapper.updateById(launchId, data);
        await this.refreshLaunchCollectionCache();
    }
}

LaunchService.refreshLaunchCollectionCache();
