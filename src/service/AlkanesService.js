import config from "../conf/config.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import axios from "axios";
import asyncPool from "tiny-async-pool";
import {encipher, encodeRunestoneProtostone, ProtoStone} from "alkanes";
import BigNumber from "bignumber.js";
import {u128, u32} from '@magiceden-oss/runestone-lib/dist/src/integer/index.js';
import {ProtoruneRuneId} from 'alkanes/lib/protorune/protoruneruneid.js'
import AddressUtil from "../lib/AddressUtil.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import FeeUtil from "../utils/FeeUtil.js";
import {Constants} from "../conf/constants.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import * as logger from '../conf/logger.js';
import R2Service from "./R2Service.js";
import BaseUtil from "../utils/BaseUtil.js";
import {NetworkError} from "../lib/error.js";
import IndexerService from "./IndexerService.js";

// 0: Initialize(token_units, value_per_mint, cap, name, symbol)
// token_units : Initial pre-mine tokens to be received on deployer's address
// value_per_mint: Amount of tokens to be received on each successful mint
// cap: Max amount of times the token can be minted
// name: Token name
// symbol: Token symbol
// 77: MintTokens()
// 88: SetNameAndSymbol(name, symbol)
// 99: GetName() -> String
// 100: GetSymbol() -> String
// 101: GetTotalSupply() -> u128
// 102: GetCap() -> u128
// 103: GetMinted() -> u128
// 104: GetValuePerMint() -> u128
// 1000: GetData() -> Vec

// 998: GetCollectionIdentifier
// 999: GetCollectionAlkaneId
// 1001: GetContentType,
// 1002: GetAttributes,
const opcodes = ['99', '100', '101', '102', '103', '104', '998', '999', '1000', '1001', '1002']
const opcodesHRV = [
    'name',
    'symbol',
    'totalSupply',
    'cap',
    'minted',
    'mintAmount',
    'collectionIdentifier',
    'collectionAlkaneId',
    'data',
    'contentType',
    'attributes',
]

export default class AlkanesService {

    static async trace(txid, vout, alkanesUrl = config.alkanesUtxoUrl) {
        try {
            return await AlkanesService._call('alkanes_trace', [
                {
                    txid: Buffer.from(txid, 'hex').reverse().toString('hex'),
                    vout: vout,
                },
            ], alkanesUrl);
        } catch (err) {
            logger.error(`trace error, txid: ${txid}, vout: ${vout}, error: ${err.message}`, err);
            throw new Error('Trace Error');
        }
    }

    static async alkanesidtooutpoint(block, tx, alkanesUrl = config.alkanesUtxoUrl) {
        return await AlkanesService._call('alkanes_alkanesidtooutpoint', [
            {
                block: block,
                tx: tx,
            },
        ], alkanesUrl);
    }

    static async getAlkanesByUtxo(utxo, maxHeight = 0, alkanesUrl = config.alkanesUtxoUrl, timeout = 0) {
        if (utxo.height < config.startHeight) {
            return [];
        }
        if (maxHeight > 0 && utxo.height > maxHeight) {
            return [];
        }
        try {
            const alkaneList = await AlkanesService._call('alkanes_protorunesbyoutpoint', [
                {
                    txid: Buffer.from(utxo.txid, 'hex').reverse().toString('hex'),
                    vout: utxo.vout,
                    protocolTag: '1',
                },
            ], config.alkanesUtxoUrl, timeout)

            return alkaneList.map((alkane) => ({
                id: `${parseInt(alkane.token.id.block, 16).toString()}:${parseInt(alkane.token.id.tx, 16).toString()}`,
                name: alkane.token.name,
                symbol: alkane.token.symbol,
                value: new BigNumber(alkane.value), // 固定8位精度
            }))
        } catch (err) {
            logger.error(`getAlkanesByUtxo error, utxo: ${JSON.stringify(utxo)}, error: ${err.message}`, err);
            throw new Error('Get Alkane Balance Error');
        }
    }

    static async getAlkanesUtxoByAddress(address, alkanesId, maxHeight = 0, allowMultiple = false) {
        const result = await AlkanesService._call('alkanes_protorunesbyaddress', [
            {
                address: address,
                protocolTag: '1'
            },
            maxHeight
        ], config.alkanesAddressUrl);

        const utxoList = [];
        for (const outpoint of result.outpoints) {
            if (outpoint.runes.length > 1 && !allowMultiple) {
                continue;
            }

            if (outpoint.runes.length > 1) {
                outpoint.runes = outpoint.runes.filter(rune => {
                    const id = `${new BigNumber(rune.rune.id.block).toNumber()}:${new BigNumber(rune.rune.id.tx).toNumber()}`;
                    if (Array.isArray(alkanesId) && !alkanesId.includes(id)) {
                        return true;
                    } else if (alkanesId === id) {
                        return true;
                    }
                    return false;
                });
            }

            const rune = outpoint.runes[0];
            const balance = new BigNumber(rune.balance);
            if (new BigNumber(rune.balance).lt(0)) {
                continue;
            }

            const id = `${new BigNumber(rune.rune.id.block).toNumber()}:${new BigNumber(rune.rune.id.tx).toNumber()}`;
            if (Array.isArray(alkanesId)) {
                if (!alkanesId.includes(id)) {
                    continue;
                }
            } else if (alkanesId && alkanesId !== id) {
                continue;
            }

            const txid = Buffer.from(outpoint.outpoint.txid, 'hex').reverse().toString('hex');
            const spendInfo = await MempoolUtil.getTxOutspend(txid, outpoint.outpoint.vout);
            if (spendInfo.spent) {
                continue;
            }

            utxoList.push({
                address: address,
                txid: txid,
                vout: outpoint.outpoint.vout,
                value: outpoint.output.value,
                alkanesId: id,
                name: rune.rune.name,
                symbol: rune.rune.symbol,
                balance,
                tokenAmount: balance.dividedBy(10 ** 8).toFixed()
            })
        }

        return utxoList;
    }

    static async getAlkanesByAddress(address) {
        const result = await AlkanesService._call('alkanes_protorunesbyaddress', [
            {
                address: address,
                protocolTag: '1'
            }
        ], config.alkanesAddressUrl);

        const outpoints = result.outpoints;

        // 过滤 balance > 0 的记录
        const filtered = outpoints
            .filter(outpoint =>
                outpoint.runes.some(rune => new BigNumber(rune.balance).gt(0))
            )
            .map(outpoint => outpoint.runes)
            .flat();

        // 按 id.block:id.tx 分组
        const grouped = filtered.reduce((acc, entry) => {
            const id = `${new BigNumber(entry.rune.id.block).toNumber()}:${new BigNumber(entry.rune.id.tx).toNumber()}`;
            const balance = new BigNumber(entry.balance);

            if (!acc[id]) {
                acc[id] = {
                    id: id,
                    name: entry.rune.name,
                    symbol: entry.rune.symbol,
                    balance: new BigNumber(0), // 初始化为 BigNumber
                };
            }

            acc[id].balance = acc[id].balance.plus(balance);
            return acc;
        }, {});

        return Object.values(grouped).map(item => ({
            id: item.id,
            name: item.name,
            symbol: item.symbol,
            balance: new BigNumber(item.balance).dividedBy(10 ** 8).toFixed()
        }));
    }

    static async getAlkanesByTarget(address, id, amount) {
        const utxoList = await MempoolUtil.getUtxoByAddress(address, true);
        if (!utxoList || utxoList.length === 0) {
            throw new Error('Insufficient alkanes balance');
        }

        const alkaneList = [];
        let totalBalance = new BigNumber(0);
        try {
            for (const utxo of utxoList) {
                const alkanes = await AlkanesService.getAlkanesByUtxo(utxo, 0, config.alkanesUrl);
                for (const alkane of alkanes) {
                    if (alkane.id !== id) {
                        continue;
                    }
                    alkane.utxo = utxo;
                    alkaneList.push(alkane);
                    totalBalance = totalBalance.plus(new BigNumber(alkane.value));
                }

                if (totalBalance.gte(amount)) {
                    break;
                }
            }
        } catch (error) {
            logger.error('getAlkanesByTarget error:', error);
            throw new Error('Get alkanes balance error');
        }

        if (totalBalance.lt(amount)) {
            throw new Error(`Insufficient alkanes balance: ${totalBalance.dividedBy(1e8).toFixed()} target: ${new BigNumber(amount).dividedBy(1e8).toFixed()}`);
        }
        return alkaneList;
    }

    static async getAlkanesUtxoById(address, id, maxHeight) {
        try {
            const utxoList = await MempoolUtil.getUtxoByAddress(address, true);
            if (!utxoList || utxoList.length === 0) {
                return [];
            }

            const errors = [];
            const alkaneList = [];
            // 使用 asyncPool 对 utxoList 进行并发处理
            for await (const result of asyncPool(
                config.concurrencyLimit, // 并发限制
                utxoList,         // 需要处理的 UTXO 列表
                async (utxo) => {
                    try {
                        const alkanes = await AlkanesService.getAlkanesByUtxo(utxo, maxHeight)
                        if (!alkanes?.length) {
                            return null;
                        }

                        return alkanes
                            .filter((alkane) => alkane.id === id)
                            .map((alkane) => ({
                                txid: utxo.txid,
                                vout: utxo.vout,
                                value: utxo.value,
                                tokenAmount: new BigNumber(alkane.value)
                                    .dividedBy(10 ** 8)
                                    .toFixed(),
                            }));
                    } catch (error) {
                        logger.error(`Failed to process utxo ${utxo.txid}:`, error);
                        errors.push(`${utxo.txid}:${utxo.vout}`);
                        return null;
                    }
                }
            )) {
                if (result !== null) {
                    alkaneList.push(...result);
                }
            }

            if (errors.length > 0) {
                throw new Error('check utxo balance error');
            }

            return alkaneList;
        } catch (error) {
            logger.error('getAlkanesUtxoById error:', error);
            throw new Error('Get alkanes balance error');
        }
    }

    static async getAlkanesById(id, opcodesToQuery = opcodes) {
        const opcodeToHRV = {};
        opcodes.forEach((opcode, idx) => opcodeToHRV[opcode] = opcodesHRV[idx]);
        const tokenInfo = {id};

        try {
            const errors = [];
            const opcodeResults = await BaseUtil.concurrentExecute(opcodesToQuery, async (opcode) => {
                try {
                    const result = await AlkanesService.simulate({
                        target: {block: id.split(':')[0], tx: id.split(':')[1]},
                        inputs: [opcode],
                    });
                    if (result) {
                        return {
                            opcode,
                            result,
                            opcodeHRV: opcodeToHRV[opcode],
                        };
                    }
                } catch (error) {
                    // 可选：log
                    if (error instanceof NetworkError) {
                        logger.error(`Get alkanes ${id} network error occurred.`);
                        throw error;
                    }
                }
                return null;
            }, 4, errors);
            if (errors.length > 0) {
                throw new Error(`Get alkanes info error, errors: ${errors.length}`);
            }

            // 收集返回结果
            const contentType = opcodeResults.find(x => x?.opcodeHRV === 'contentType')?.result?.string;
            for (const item of opcodeResults) {
                if (!item || !item.opcodeHRV) {
                    continue;
                }
                const {result, opcodeHRV} = item;
                if (!['totalSupply', 'cap', 'minted', 'mintAmount'].includes(opcodeHRV)) {
                    const text = (result.string || '').trim();
                    if (opcodeHRV === 'data' && text) {
                        if (text.startsWith('data:image/')) {
                            tokenInfo.image = tokenInfo.originalImage = tokenInfo.data = await R2Service.uploadBuffer({
                                buffer: Buffer.from(text.split(',')[1], 'base64'),
                                filename: `${id}.png`,
                                prefix: config.r2.prefix,
                                type: 'image/png'
                            });
                        } else if (
                            contentType?.toLowerCase() === 'image/svg+xml' || 
                            (text.toLowerCase().startsWith('<?xml version="1.0" encoding="UTF-8"?>'.toLowerCase()) && text.toLowerCase().endsWith('</svg>')) ||
                            (text.toLowerCase().startsWith('<svg ') && text.toLowerCase().endsWith('</svg>'))
                        ) {
                            tokenInfo.image = tokenInfo.originalImage = tokenInfo.data = await R2Service.uploadText({
                                text,
                                filename: `${id}.svg`,
                                prefix: config.r2.prefix,
                                type: 'image/svg+xml'
                            });
                        } else if (contentType?.toLowerCase() === 'text/html') {
                            tokenInfo.data = await R2Service.uploadText({
                                text,
                                filename: `${id}.html`,
                                prefix: config.r2.prefix,
                                type: 'text/html'
                            });
                        } else {
                            if (text.startsWith('0x')) {
                                const {type, mimeType, image} = BaseUtil.detectFileType(text) ?? {};
                                if (type) {
                                    tokenInfo.data = await R2Service.uploadBuffer({
                                        buffer: Buffer.from(text.slice(2), 'hex'),
                                        filename: `${id}.${type}`,
                                        prefix: config.r2.prefix,
                                        type: mimeType
                                    });
                                    if (image){
                                        tokenInfo.image = tokenInfo.originalImage = tokenInfo.data;
                                    }
                                    continue;
                                }
                            }
                            tokenInfo.data = await R2Service.uploadText({
                                text,
                                filename: `${id}.txt`,
                                prefix: config.r2.prefix,
                                type: 'text/plain'
                            });
                        }
                        continue;
                    }
                    tokenInfo[opcodeHRV] = text;
                    continue;
                }
                tokenInfo[opcodeHRV] = new BigNumber(result.le || 0);
            }
            return tokenInfo;

        } catch (error) {
            logger.error(`Get alkanes ${id} error:`, error);
            return null;
        }
    }

    static async getAllAlkanes() {
        const cachedData = await RedisHelper.get(Constants.REDIS_KEY.TOKEN_INFO_LIST);
        if (cachedData) {
            const updateHeight = await RedisHelper.get(Constants.REDIS_KEY.TOKEN_INFO_UPDATED_HEIGHT);
            const alkanesList = JSON.parse(cachedData);
            if (alkanesList && alkanesList.length > 0) {
                return {
                    alkanesList,
                    updateHeight
                };
            }
        }
        throw new Error('Get alkanes error');
    }

    static async transferMintFee(fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate) {
        const protostone = AlkanesService.getMintProtostone(id, 77, Constants.MINT_MODEL.NORMAL);

        const outputList = [];
        outputList.push({
            address: toAddress,
            value: postage
        });
        outputList.push({
            script: protostone,
            value: 0
        });

        const privateKey = AddressUtil.generatePrivateKeyFromString(`${fundAddress}-${toAddress}-${id}-${mints}`);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);
        const mintSize = FeeUtil.estTxSize([{address: mintAddress}], outputList);
        const mintFee = Math.ceil(mintSize * feerate) + postage;

        const fundOutputList = [];
        for (let i = 0; i < mints; i++) {
            fundOutputList.push({
                address: mintAddress,
                value: mintFee
            });
        }
        // 手续费
        const serviceFee = Math.max(Math.min(300 * mints, 5000), 1000);
        fundOutputList.push({
            address: config.revenueAddress.inscribe,
            value: serviceFee
        });
        let transferFee = Math.ceil(FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]) * feerate);

        const totalFee = mints * mintFee + transferFee + serviceFee;
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, totalFee, feerate, true);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        return PsbtUtil.createUnSignPsbt(utxoList, fundOutputList, fundAddress, feerate);
    }

    static async startMint(fundAddress, toAddress, id, mints, postage, feerate, psbt) {
        const {txid, error} = await UnisatAPI.unisatPush(psbt);
        if (error) {
            throw new Error(error);
        }

        const protostone = AlkanesService.getMintProtostone(id, 77, Constants.MINT_MODEL.NORMAL);

        const outputList = [];
        outputList.push({
            address: toAddress,
            value: postage
        });
        outputList.push({
            script: protostone,
            value: 0
        });

        const txidList = [];
        const privateKey = AddressUtil.generatePrivateKeyFromString(`${fundAddress}-${toAddress}-${id}-${mints}`);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);
        const mintFee = Math.ceil(FeeUtil.estTxSize([{address: mintAddress}], outputList) * feerate) + postage;

        for (let i = 0; i < mints; i++) {
            const inputList = [{
                txid: txid,
                vout: i,
                value: mintFee,
                address: mintAddress
            }];
            const {
                txid: mintTxid,
                error
            } = await UnisatAPI.transfer(privateKey, inputList, outputList, mintAddress, feerate, false, false);
            if (error) {
                throw new Error(error);
            }

            logger.info(`mint index ${i} tx: ${mintTxid}`);
            txidList.push(mintTxid);
        }
        return txidList;
    }

    static async deployToken(fundAddress, fundPublicKey, toAddress, name, symbol, cap, perMint, premine, feerate) {
        const protostone = AlkanesService.getDeployProtostone(name, symbol, cap, premine, perMint);

        const outputList = [];
        outputList.push({
            address: toAddress,
            value: 330
        });
        outputList.push({
            script: protostone,
            value: 0
        });
        outputList.push({
            address: config.revenueAddress.inscribe,
            value: 3000
        });

        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + 3000, feerate);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        return PsbtUtil.createUnSignPsbt(utxoList, outputList, fundAddress, feerate);
    }

    static async combineAlkanesUtxo(fundAddress, fundPublicKey, assetAddress, assetPublicKey, utxos, toAddress, feerate) {
        const outpoints = [];
        for (const {txid, vout} of utxos) {
            const records = await IndexerService.getOutpointsByOutput(txid, vout);
            outpoints.push(...records);
        }
        if (outpoints.length === 0) {
            throw new Error('Assets not found');
        }
        const outputList = [{
            address: toAddress,
            value: 546
        }];
        const alkanesIdList = [...new Set(outpoints.map(outpoint => outpoint.alkanesId))];

        const transferList = [];
        for (const alkanesId of alkanesIdList) {
            transferList.push({
                id: alkanesId,
                amount: 0,
                output: 0
            });
        }
        const protostone = AlkanesService.getBatchTransferProtostone(transferList);
        outputList.push({
            script: protostone,
            value: 0
        });
        const outputDistinctOutpoints = outpoints.reduce((acc, curr) => {
            const output = `${curr.txid}:${curr.vout}`;
            if (!acc[output]) {
                acc[output] = curr;
            }
            return acc;
        }, {});
        const assetUtxos = Object.values(outputDistinctOutpoints).map(outpoint => ({
            txid: outpoint.txid,
            vout: outpoint.vout,
            value: parseInt(outpoint.value),
            address: assetAddress,
            pubkey: assetPublicKey
        }))
        const assetValues = assetUtxos.reduce((acc, curr) => acc + curr.value, 0);
        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const needValue = txFee + 3000;
        const diff = needValue - assetValues;
        let utxoList = [];
        if (diff > 0) { // 资产utxo的聪不够付款
            utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, diff, feerate);
            utxoList.map(utxo => utxo.pubkey = fundPublicKey);
        }
        
        const inputList = [...assetUtxos, ...utxoList];
        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
    }

    static async splitAlkanesUtxo(fundAddress, fundPublicKey, assetAddress, assetPublicKey, txid, vout, toAddresses, feerate) {
        const outpoints = await IndexerService.getOutpointsByOutput(txid, vout);
        if (outpoints.length === 0) {
            throw new Error('Assets not found');
        }
        await IndexerService.checkOutpointRecordsSpent(outpoints);
        if (outpoints.spent) {
            throw new Error('Assets already spent');
        }
        if (outpoints.length <= 1) {
            throw new Error('Assets no need to split');
        }
        if (outpoints[0].address !== assetAddress) {
            throw new Error('Asset address mismatch');
        }
        if (outpoints[0].alkanesIdCount !== toAddresses.length) {
            throw new Error('Address count not match assets count');
        }
        const assetUtxo = {
            txid: outpoints[0].txid,
            vout: outpoints[0].vout,
            value: parseInt(outpoints[0].value),
            address: assetAddress,
            pubkey: assetPublicKey,
        };
        const outputList = [];
        const transferList = [];
        for (const [index, toAddress] of toAddresses.entries()) {
            outputList.push({
                address: toAddress,
                value: 546
            });
            transferList.push({
                id: outpoints[index].alkanesId,
                amount: 0,
                output: index
            });
        }
        const protostone = AlkanesService.getBatchTransferProtostone(transferList);
        outputList.push({
            script: protostone,
            value: 0
        });
        const transferFee = 1000;
        outputList.push({
            address: config.revenueAddress.transfer,
            value: transferFee
        });
        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + transferFee + 3000, feerate);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        const inputList = [assetUtxo, ...utxoList];
        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
    }

    static async transferToken(fundAddress, fundPublicKey, assetAddress, assetPublicKey, id, feerate, transferAmountList, outpoints = null) {
        const outputList = [];
        const transferList = [];
        let needAmount = new BigNumber(0);
        for (const [index, transferInfo] of transferAmountList.entries()) {
            outputList.push({
                address: transferInfo.address,
                value: 546
            });

            const amount = new BigNumber(transferInfo.amount).multipliedBy(1e8);
            transferList.push({
                amount: amount.toNumber(),
                output: index
            });
            needAmount = needAmount.plus(amount);
        }
        let outpointList = await IndexerService.getOutpointListByTarget(assetAddress, id, outpoints ? new BigNumber(0) : needAmount);
        if (outpoints) {
            outpointList = outpointList.filter(outpoint => outpoints.some(utxo => utxo.txid === outpoint.txid && utxo.vout === outpoint.vout));
            if (outpointList.length !== outpoints.length) {
                throw new Error('Asset mismatch, please refresh and try again');
            }
        }
        const totalInputAmount = outpointList.reduce((accumulator, currentValue) => accumulator.plus(new BigNumber(currentValue.balance)), new BigNumber(0));
        const changeAmount = totalInputAmount.minus(needAmount);
        // 如果有找零，所有转账的输出后移，找零默认到第一个输出
        if (changeAmount > 0) {
            outputList.unshift({
                address: assetAddress,
                value: 330
            });
            transferList.forEach(out => out.output += 1);
        }

        const protostone = AlkanesService.getTransferProtostone(id, transferList);
        outputList.push({
            script: protostone,
            value: 0
        });

        const transferFee = 1000;
        outputList.push({
            address: config.revenueAddress.transfer,
            value: transferFee
        });

        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + transferFee + 3000, feerate);
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

        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
    }

    static async simulate(request, decoder, height = '20000') {
        const params = {
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: height,
            txindex: 0,
            inputs: [],
            pointer: 0,
            refundPointer: 0,
            vout: 0,
            ...request,
        };
        const ret = await this._call('alkanes_simulate', [params], config.alkanesUrl);
        if (decoder) {
            const operationType = Number(request.inputs[0])
            return decoder(ret, operationType)
        }
        const data = ret?.status === 0 ? ret.execution.data : null;
        if (data == null) { // 没有值
            return undefined;
        }
        if (request.inputs[0] === '999') {
            return AlkanesService.decodeAlkaneId(data);
        }
        return AlkanesService.parseSimulateReturn(data);
    }

    static async metashrewHeight(alkanesUrl = config.alkanesUrl) {
        for (let i = 0; i < 3; i++) {
            try {
                let blockHeight = await AlkanesService._call('metashrew_height', [], alkanesUrl);
                if (blockHeight) {
                    return parseInt(blockHeight) - 1;
                }
            } catch (err) {
                logger.error(`check metashrew_height error`, err);
            }
        }
        throw new Error('check metashrew_height error');
    }

    static async _call(method, params = [], rpcUrl, timeout = 0) {
        const payload = {
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: 1
        };

        try {
            const response = await axios.post(rpcUrl, payload, {
                headers: {
                    'content-type': 'application/json',
                },
                timeout: timeout
            });
            if (response.data.error) { // alkanes rpc代理的底层rpc调用错误时响应是正常, 但会包含错误信息, 也归属网络错误
                throw new NetworkError(500, `rpc call error, payload: ${JSON.stringify(payload)}, message: ${JSON.stringify(response.data.error)}`);
            }
            const result = response.data.result;
            if (result?.execution?.error) {
                // console.log(`rpc call error, payload: ${JSON.stringify(payload)}, message: ${result.execution.error}`)
            }
            return result;
        } catch (error) {
            if (error instanceof NetworkError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                logger.error(`RPC call timeout, method: ${method} params: ${JSON.stringify(params)}`, error);
                throw new NetworkError(502, error);
            } else if (error.response?.status && error.response?.status !== 200) {
                // logger.error(`RPC call error, method: ${method} params: ${JSON.stringify(params)}`, error);
                throw new NetworkError(error.response?.status, error);
            } else {
                // logger.error(`RPC call error, method: ${method} params: ${JSON.stringify(params)}`, error);
                throw error;
            }
        }
    }

    static parseSimulateReturn(v) {
        if (v === '0x') {
            return undefined
        }
        const stripHexPrefix = (v) => (v.startsWith('0x') ? v.slice(2) : v)
        const addHexPrefix = (v) => '0x' + stripHexPrefix(v)

        let decodedString;
        try {
            decodedString = Buffer.from(stripHexPrefix(v), 'hex').toString('utf8')
            if (/[\uFFFD]/.test(decodedString)) {
                throw new Error('Invalid UTF-8 string')
            }
        } catch (err) {
            decodedString = addHexPrefix(v)
        }

        return {
            string: decodedString,
            bytes: addHexPrefix(v),
            le: BigInt(
                addHexPrefix(
                    Buffer.from(
                        Array.from(Buffer.from(stripHexPrefix(v), 'hex')).reverse()
                    ).toString('hex')
                )
            ).toString(),
            be: BigInt(addHexPrefix(v)).toString(),
        }
    }

    static decodeAlkaneId(hexString) {
        // Remove 0x prefix if present
        const cleanHex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;

        // Split into block and tx parts (each 16 bytes)
        const blockHex = cleanHex.slice(0, 32);
        const txHex = cleanHex.slice(32);

        // Convert from little-endian hex to BigInt
        const block = BigInt('0x' + blockHex.match(/../g).reverse().join(''));
        const tx = BigInt('0x' + txHex.match(/../g).reverse().join(''));

        return {
            string: `${block}:${tx}`
        };
    }


    static getMintProtostone(id, opcode = 77, model = Constants.MINT_MODEL.NORMAL) {
        const protostones = [];
        const calldata = [BigInt(id.split(':')[0]), BigInt(id.split(':')[1]), BigInt(opcode)];

        if (model === Constants.MINT_MODEL.MERGE) {
            protostones.push(ProtoStone.message({
                protocolTag: 1n,
                pointer: 0,
                refundPointer: 0,
                calldata: Buffer.from([]),
            }));
        }
        protostones.push(ProtoStone.message({
            protocolTag: 1n,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher(calldata),
        }));

        return encodeRunestoneProtostone({
            protostones: protostones,
        }).encodedRunestone;
    }

    static getPayMintProtostone(mintId, paymentId, changeAmount) {
        const protostones = [];
        const calldata = [BigInt(mintId.split(':')[0]), BigInt(mintId.split(':')[1]), BigInt(77)];

        const edicts = [];
        if (changeAmount > 0) {
            edicts.push({
                id: new ProtoruneRuneId(
                    u128(BigInt(paymentId.split(':')[0])),
                    u128(BigInt(paymentId.split(':')[1]))
                ),
                amount: u128(BigInt(changeAmount)),
                output: u32(BigInt(1)),
            });
        }

        protostones.push(ProtoStone.message({
            protocolTag: 1n,
            edicts: edicts,
            pointer: 0,
            refundPointer: 0,
            calldata: encipher(calldata),
        }));
        return encodeRunestoneProtostone({
            protostones: protostones,
        }).encodedRunestone;
    }

    static getBatchTransferProtostone(transferList) {
        const edicts = [];
        for (const transfer of transferList) {
            const id = transfer.id;
            edicts.push({
                id: new ProtoruneRuneId(
                    u128(BigInt(id.split(':')[0])),
                    u128(BigInt(id.split(':')[1]))
                ),
                amount: u128(BigInt(transfer.amount)), // 如果是0或者大于输入数量，则得到输入的全部数量；如果小于则发送全部可用数量
                output: u32(BigInt(transfer.output)), // 指向接收的output index
            });
        }

        return encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    edicts: edicts,
                    pointer: 0, // 如果存在剩余的代币数量，会转到这里指定的output index
                    refundPointer: 0,
                    calldata: Buffer.from([]),
                }),
            ],
        }).encodedRunestone;
    }

    static getTransferProtostone(id, transferList) {
        const edicts = [];
        for (const transfer of transferList) {
            edicts.push({
                id: new ProtoruneRuneId(
                    u128(BigInt(id.split(':')[0])),
                    u128(BigInt(id.split(':')[1]))
                ),
                amount: u128(BigInt(transfer.amount)), // 如果是0或者大于输入数量，则得到输入的全部数量；如果小于则发送全部可用数量
                output: u32(BigInt(transfer.output)), // 指向接收的output index
            });
        }

        return encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    edicts: edicts,
                    pointer: 0, // 如果存在剩余的代币数量，会转到这里指定的output index
                    refundPointer: 0,
                    calldata: Buffer.from([]),
                }),
            ],
        }).encodedRunestone;
    }

    static getDeployProtostone(name, symbol, cap, premine, perMint) {
        const tokenName = AlkanesService.packUTF8(name);
        const tokenSymbol = AlkanesService.packUTF8(symbol);
        if (tokenName.length > 2) {
            throw new Error('Token name too long');
        }
        if (tokenSymbol.length > 1) {
            throw new Error('Token symbol too long');
        }
        const calldata = [
            BigInt(6),
            BigInt(config.reserveNumber),
            BigInt(0),
            BigInt(new BigNumber(premine).multipliedBy(1e8).toFixed()),
            BigInt(new BigNumber(perMint).multipliedBy(1e8).toFixed()),
            BigInt(cap),
            BigInt('0x' + tokenName[0]),
            BigInt(tokenName.length > 1 ? '0x' + tokenName[1] : 0)
        ];
        if (tokenSymbol.length > 0 && tokenSymbol[0] !== '') {
            calldata.push(BigInt('0x' + tokenSymbol[0]));
        }

        return encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: encipher(calldata),
                }),
            ],
        }).encodedRunestone;
    }

    static calculateProgress(id, minted, cap) {
        if (!cap || cap.isZero()) return 0;
        const progress = parseFloat((minted.div(cap).multipliedBy(100)).toFixed(2));
        if (progress > 100) {
            logger.error(`calculate ${id} progress invalid, cap: ${cap} minted: ${minted} error`);
            throw new Error(`Progress calculate error`);
        }
        return progress;
    }

    static async getMaxHeight() {
        const height = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        return height - config.maxHeightGap;
    }

    static packUTF8(s) {
        const result = [''];
        let b = 0;
        for (let i = 0; i < s.length; i++) {
            const length = Buffer.from(s[i]).length;
            if (b + length > 15) {
                b = 0;
                result.push('');
                i--;
            } else {
                b += length;
                result[result.length - 1] += s[i];
            }
        }
        return result.map((v) => v && Buffer.from(Array.from(Buffer.from(v)).reverse()).toString('hex') || '')
    }
}

