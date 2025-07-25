import IndexBlock from '../models/IndexBlock.js';
import MempoolUtil from '../utils/MempoolUtil.js';
import OutpointRecordMapper from '../mapper/OutpointRecordMapper.js';
import PointRecordMapper from '../mapper/PointRecordMapper.js';
import IndexBlockMapper from '../mapper/IndexBlockMapper.js';
import BaseUtil from '../utils/BaseUtil.js';
import * as logger from '../conf/logger.js';
import OutpointRecord from '../models/OutpointRecord.js';
import BtcRPC from '../lib/BtcRPC.js';
import { Op } from 'sequelize';
import sequelize from '../lib/SequelizeHelper.js';
import AddressBalanceMapper from '../mapper/AddressBalanceMapper.js';
import AddressBalance from '../models/AddressBalance.js';
import TokenInfoService from '../service/TokenInfoService.js';
import NftItemService from '../service/NftItemService.js';
import MarketService from './MarketService.js';
import NftMarketService from './NftMarketService.js';
import TokenInfoMapper from '../mapper/TokenInfoMapper.js';
import config from '../conf/config.js';
import AlkanesService from './AlkanesService.js';
import decodeProtorune from '../lib/ProtoruneDecoder.js';
import NftCollectionService from './NftCollectionService.js';
import Sequelize from 'sequelize';
import BigNumber from 'bignumber.js';
import MarketEventMapper from '../mapper/MarketEventMapper.js';
import NftMarketEventMapper from '../mapper/NftMarketEventMapper.js';

export default class IndexerService {

    static async index({current, previous}) {
        // 废弃        
    }

    static async cleanByBlock(block, isReorg = false) {
        if (isReorg) {
            await MarketService.rollbackConfirmedEvents(block);
            await NftMarketService.rollbackConfirmedEvents(block);
            await PointRecordMapper.deleteAfter(block);
        }
        await OutpointRecordMapper.deleteAfter(block);
        await IndexBlockMapper.deleteAfter(block);
    }

    static async indexBlock() {
        while (true) {
            logger.putContext({traceId: BaseUtil.genId()});
            try {
                const indexBlock = await IndexBlock.findOne({
                    order: [['block', 'DESC']],
                });
                let block = config.startHeight;
                if (indexBlock) {
                    const blockHash = await MempoolUtil.getBlockHash(indexBlock.block);
                    block = indexBlock.block;
                    if (blockHash !== indexBlock.blockHash) {
                        await this.cleanByBlock(block, true);
                        logger.warn(`index block ${block} hash mismatch, new ${blockHash}, old ${indexBlock.blockHash}, reorg detected`);
                        continue;
                    }
                    block = indexBlock.block + 1;
                }
                const maxHeight = await AlkanesService.metashrewHeight(config.alkanesIndexerUrl);
                if (block > maxHeight) {
                    break;
                }
                logger.putContext({block});
                logger.info(`index block ${block}`);
                await this.cleanByBlock(block);
                const blockHash = await MempoolUtil.getBlockHash(block);
                const blockDetails = await BtcRPC.getBlockDetails(blockHash);
                const txs = blockDetails.tx;
                const blockTime = blockDetails.time;
                const txids = txs.map(tx => tx.txid);
                const errors = [];
                let handledTxs = 0;
                let handledVouts = 0;
                await BaseUtil.concurrentExecute(txs, async (tx) => {
                    const txid = tx.txid;
                    try {
                        if (!tx.vout.find(o => o.scriptPubKey.hex.startsWith('6a5d'))) {
                            return;
                        }
                        const result = await decodeProtorune(tx.hex, 0, true);
                        if (!result.protostones?.length) { // 没有protostone
                            return;
                        }
                        handledTxs++;
                        const txIdx = txids.indexOf(txid);
                        let mempoolTx = null;
                        const voutErrors = [];
                        await BaseUtil.concurrentExecute(tx.vout, async (outpoint) => {
                            if (outpoint.scriptPubKey.hex.startsWith('6a5d')) {
                                return;
                            }
                            const vout = outpoint.n;
                            try {
                                handledVouts++;
                                const outpoint_balances = await AlkanesService.getAlkanesByUtxo({
                                    txid,
                                    vout,
                                    height: block,
                                }, block, config.alkanesIndexerUrl, 1000 * 30);
                                const alkanesIdCount = outpoint_balances.length;
                                if (alkanesIdCount === 0) {
                                    return;
                                }
                                const records = [];
                                for (const outpoint_balance of outpoint_balances) {
                                    if (!mempoolTx) {
                                        mempoolTx = await MempoolUtil.getTx(txid);
                                    }
                                    const balance = outpoint_balance.value;
                                    records.push({
                                        block,
                                        txIdx,
                                        txid,
                                        vout,
                                        value: mempoolTx.vout[vout].value,
                                        address: mempoolTx.vout[vout].scriptpubkey_address,
                                        alkanesId: outpoint_balance.id,
                                        balance: balance.toFixed(),
                                        alkanesIdCount,
                                        spent: false,
                                        blockTime,
                                    });
                                }
                                await OutpointRecord.bulkCreate(records);
                            } catch (e) {
                                logger.error(`index block ${block} tx ${txid} vout ${vout} failed, ${e.message}`, e);
                                throw e;
                            }
                        }, null, voutErrors);
                        if (voutErrors.length > 0) {
                            throw new Error(`index block ${block} tx ${txid} failed, ${voutErrors.length} vout errors`);
                        }
                    } catch (e) {
                        logger.error(`index block ${block} tx ${txid} failed, ${e.message}`, e);
                        throw e;
                    }
                }, null, errors);
                if (errors.length > 0) {
                    throw new Error(`index block ${block} failed, ${errors.length} errors`);
                }
                await IndexBlock.create({
                    block,
                    blockHash
                });
                logger.info(`index block ${block} success, handledTxs: ${handledTxs}, handledVouts: ${handledVouts}`);
            } finally {
                logger.clearContext();
            }
        }
    }

    static async indexTx() {
        while (true) {
            const indexBlock = await IndexBlock.findOne({
                where: {
                    outpointIndexed: false,
                },
                order: [['block', 'ASC']],
            });
            if (!indexBlock) {
                break;
            }
            const block = indexBlock.block;
            logger.putContext({block, traceId: BaseUtil.genId()});
            try {
                logger.info(`indexTx block ${block}`);
                // 将spendBy记录为这个区块之后的所有OutpointRecord标记为未花费(区块重组时才会有作用)
                await OutpointRecord.update({
                    spent: false,
                    spendBy: null,
                    spendByInput: null,
                }, {
                    where: {
                        spendBy: {
                            [Op.gte]: parseInt(`${block}00000`),
                        }
                    },
                });
                // 更新当前区块花费的outpoint记录
                const blockHash = await MempoolUtil.getBlockHash(block);
                const txs = await BtcRPC.getBlockTransactions(blockHash);
                const vins = txs.map((tx, txIdx) => {
                    if (txIdx === 0) { // coinbase tx
                        return [];
                    }
                    const txid = tx.txid;
                    const hasOpReturn = tx.vout.some(v => v.scriptPubKey.hex.startsWith('6a5d'));
                    return tx.vin.map((v, vinIdx) => {
                        return {
                            txIdx,
                            txid,
                            inputTxid: v.txid,
                            inputVout: v.vout,
                            inputIndex: vinIdx,
                            hasOpReturn,
                        }
                    });
                }).flat();
                const errors = [];
                let effectTxids = await BaseUtil.concurrentExecute(BaseUtil.splitArray([...new Set(vins.map(vin => vin.inputTxid))], 100), async (inputTxids) => {
                    try {
                        const outpointRecords = await OutpointRecord.findAll({
                            where: {
                                txid: {
                                    [Op.in]: inputTxids,
                                },
                            },
                            attributes: ['txid'],
                            raw: true,
                        });
                        return outpointRecords.map(record => {
                            return record.txid;
                        });
                    } catch (e) {
                        logger.error(`get outpoint records failed, ${e.message}`, e);
                        throw e;
                    }
                }, null, errors);
                if (errors.length > 0) {
                    throw new Error(`get input txids outpoint records failed, ${errors.length} errors`);
                }
                effectTxids = new Set(effectTxids.flat());
                const effectVins = vins.filter(vin => effectTxids.has(vin.inputTxid));

                const effectCounts = await BaseUtil.concurrentExecute(effectVins, async (vin) => {
                    const { txIdx, txid, inputTxid, inputVout, inputIndex } = vin;
                    try {
                        const stxIdx = `${txIdx}`.padStart(5, '0');
                        return await OutpointRecord.update({
                            spent: true,
                            spendBy: parseInt(`${block}${stxIdx}`),
                            spendByInput: `${txid}:${inputIndex}`,
                        }, {
                            where: {
                                txid: inputTxid,
                                vout: inputVout,
                            },
                        });
                    } catch (e) {
                        logger.error(`handle block ${block} input ${txid}:${inputIndex} spend info failed, ${e.message}`, e);
                        throw e;
                    }
                }, null, errors);
                if (errors.length > 0) {
                    throw new Error(`handle block ${block} spend info failed, ${errors.length} errors`);
                }
                const effectCount = effectCounts.reduce((acc, curr) => +curr + acc, 0);
                logger.info(`handle block ${block} spend info success, effect count: ${effectCount}`);

                await this.updateAddressesBalance(block);

                await IndexBlock.update({
                    outpointIndexed: true,
                    txIndexed: true,
                }, {
                    where: {
                        block,
                    },
                });
                logger.info(`indexTx block ${block} success`);
            } finally {
                logger.clearContext();
            }
        }
    }

    static async updateAddressesBalance(block) {
        // 找出受影响的address
        const effectOutpointRecords = await OutpointRecord.findAll({
            attributes: ['address', 'alkanesId'],
            group: ['address', 'alkanesId'],
            raw: true,
            where: {
                [Op.or]: [
                    {
                        spendBy: {
                            [Op.gte]: parseInt(`${block}00000`),
                        }
                    },
                    {
                        block
                    }
                ]
            },
        });
        const effectBalances = await AddressBalance.findAll({
            attributes: ['address', 'alkanesId'],
            group: ['address', 'alkanesId'],
            raw: true,
            where: {
                updateBlock: {
                    [Op.gte]: block,
                },
            },
        });
        //从effectOutpointRecords和effectBalances找出每个address的哪些alkanesId需要更新(每个address有多个alkanesId)
        const effectAddressAlkanes = effectOutpointRecords.reduce((acc, record) => {
            acc[record.address] = acc[record.address] || new Set();
            acc[record.address].add(record.alkanesId);
            return acc;
        }, {});
        effectBalances.reduce((acc, balance) => {
            acc[balance.address] = acc[balance.address] || new Set();
            acc[balance.address].add(balance.alkanesId);
            return acc;
        }, effectAddressAlkanes);


        // 更新受影响的address的balance
        if (Object.keys(effectAddressAlkanes).length === 0) {
            logger.info(`block ${block} no effect address alkanes`);
            return;
        }
        const effectAlkanesIds = [...new Set(Object.values(effectAddressAlkanes).map(set => [...set]).flat())];
        const nftItems = await NftItemService.getItemsByIds(effectAlkanesIds);
        const addressAlkanesBalances = await OutpointRecord.findAll({
            where: {
                address: {
                    [Op.in]: Object.keys(effectAddressAlkanes),
                },
                alkanesId: {
                    [Op.in]: effectAlkanesIds,
                },
                spent: false,
                block: {
                    [Op.lte]: block,
                },
            },
            group: ['address', 'alkanesId'],
            attributes: ['address', 'alkanesId', [sequelize.fn('sum', sequelize.literal('CAST(balance AS DECIMAL(64,0))')), 'balance']],
            raw: true,
        });

        // Create a map of existing address-alkanesId combinations
        const existingCombinations = new Set();
        addressAlkanesBalances.forEach(record => {
            existingCombinations.add(`${record.address}-${record.alkanesId}`);
        });

        // Add zero balance records for missing combinations
        Object.entries(effectAddressAlkanes).forEach(([address, alkanesIds]) => {
            alkanesIds.forEach(alkanesId => {
                if (!existingCombinations.has(`${address}-${alkanesId}`)) {
                    addressAlkanesBalances.push({
                        address,
                        alkanesId,
                        balance: 0
                    });
                }
            });
        });

        const errors = [];
        await BaseUtil.concurrentExecute(addressAlkanesBalances, async (addressAlkanesBalance) => {
            const { address, alkanesId, balance } = addressAlkanesBalance;
            try {
                // Convert balance to string without scientific notation using BigInt
                const balanceStr = BigInt(balance).toString();
                await AddressBalanceMapper.updateAddressBalance(address, alkanesId, balanceStr, block);
            } catch (e) {
                logger.error(`block ${block} update address ${address} alkanesId ${alkanesId} balance ${balance} failed, ${e.message}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`block ${block} update addresses balance failed, ${errors.length} errors`);
        }
        await BaseUtil.concurrentExecute(effectAlkanesIds, async (alkanesId) => {
            try {
                const total = await AddressBalance.count({
                    where: {
                        alkanesId,
                        balance: {
                            [Op.gt]: 0,
                        },
                    },
                });
                await TokenInfoMapper.updateHolders(alkanesId, total);
            } catch (e) {
                logger.error(`block ${block} update alkanesId ${alkanesId} holders failed, ${e.message}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`block ${block} update alkanesId holders failed, ${errors.length} errors`);
        }
        
        const nftItemBalances = addressAlkanesBalances.filter(item => {
            return nftItems.find(nftItem => nftItem.id === item.alkanesId) && item.balance > 0;
        });
        nftItems.forEach(nftItem => {
            if (!nftItemBalances.find(item => item.alkanesId === nftItem.id)) {
                nftItemBalances.push({
                    address: '',
                    alkanesId: nftItem.id,
                    balance: 0,
                });
            }
        });
        if (nftItemBalances.length > 0) {
            const errors = [];
            await BaseUtil.concurrentExecute(nftItemBalances, async (nftItemBalance) => {
                const { address, alkanesId } = nftItemBalance;
                try {
                    await NftItemService.updateHolder(address, alkanesId, block);
                } catch (e) {
                    logger.error(`block ${block} update address ${address} alkanesId ${alkanesId} failed, ${e.message}`, e);
                    throw e;
                }
            }, null, errors);
            if (errors.length > 0) {
                throw new Error(`block ${block} update nft item holder failed, ${errors.length} errors`);
            }
            await NftCollectionService.refreshCollectionHolderAndItemCountByItemIds([...new Set(nftItemBalances.map(item => item.alkanesId))]);
        }
    }

    static async getHolderPage(alkanesId, page, size) {
        const tokenInfo = await TokenInfoService.getTokenInfo(alkanesId);
        if (!tokenInfo) {
            throw new Error(`token ${alkanesId} not found`);
        }
        const holders = await sequelize.query(`
            select address, balance, CAST(balance as DECIMAL(64,0)) / CAST(:mintAmount as DECIMAL(64,0)) as cnt 
            from address_balance 
            where alkanes_id = :alkanesId and CAST(balance as DECIMAL(64,0)) > 0
            order by CAST(balance as DECIMAL(64,0)) desc
            limit :size offset :offset
        `, {
            replacements: {
                alkanesId,
                mintAmount: tokenInfo.mintAmount,
                size,
                offset: (page - 1) * size,
            },
            type: sequelize.QueryTypes.SELECT,
            raw: true,
        });
        const total = await AddressBalance.count({
            where: {
                alkanesId,
                balance: {
                    [Op.gt]: 0,
                },
            },
        });
        return {
            page,
            size,
            total,
            pages: Math.ceil(total / size),
            records: holders,
        };
    }

    static async getAddressAlkanesOutpoints(address, alkanesId, multiple = null, spent = null, page = 1, pageSize = 10) {
        const where = {
            address,
            alkanesId,
        };
        if (spent != null) {
            where.spent = spent;
        }
        if (multiple === false) {
            where.alkanesIdCount = 1;
        } else if (multiple === true) {
            where.alkanesIdCount = {
                [Op.gt]: 1,
            };
        }
        const {rows, count} = await OutpointRecord.findAndCountAll({
            where,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            order: [
                [sequelize.literal('CAST(balance AS DECIMAL(64,0))'), 'DESC'],
                ['block', 'ASC'],
                ['txIdx', 'ASC'],
                ['vout', 'ASC'],
            ],
            raw: true,
        });
        if (spent != null) {
            await this.checkOutpointRecordsSpent(rows);
        }
        return {
            page,
            pageSize,
            pages: Math.ceil(count / pageSize),
            total: count,
            records: rows.filter(row => {
                if (spent == null) {
                    return true;
                }
                return !!row.spent === spent;
            }),
        };
    }

    static async getOutpointsByAlkanesIds(alkanesIds, spent = false) {
        const where = {
            alkanesId: { [Op.in]: alkanesIds },
        };
        if (spent != null) {
            where.spent = spent;
        }
        return await OutpointRecord.findAll({
            where,
            raw: true,
        });
    }

    static async getAddressBalances(address) {
        return await AddressBalance.findAll({
            where: {
                address,
            },
            order: [
                [Sequelize.literal('CAST(SUBSTRING_INDEX(alkanes_id, ":", 1) AS UNSIGNED)'), 'ASC'],
                [Sequelize.literal('CAST(SUBSTRING_INDEX(alkanes_id, ":", -1) AS UNSIGNED)'), 'ASC']
            ],
            raw: true,
        });
    }

    static async getOutpointsByOutput(txid, vout) {
        return await OutpointRecord.findAll({
            where: {
                txid,
                vout,
            },
            raw: true,
        });
    }

    static async getOutpointByOutput(txid, vout) {
        return await OutpointRecord.findOne({
            where: {
                txid,
                vout,
            },
            raw: true,
        });
    }

    static async getOutpointRecords(address, alkanesId, spent = null, page = 1, pageSize = 10) {
        const where = {};
        const isCollection = NftCollectionService.isCollection(alkanesId);
        where.alkanesId = isCollection ? {
            [Op.in]: Sequelize.literal(`(SELECT id FROM nft_item WHERE collection_id = '${alkanesId}')`)
        } : alkanesId;
        if (address != null) {
            where.address = address;
        }
        if (spent != null) {
            where.spent = spent;
        }
        const {rows, count} = await OutpointRecord.findAndCountAll({
            where,
            order: [
                ['block', 'DESC'],
                ['txIdx', 'DESC'],
                ['vout', 'DESC'],
            ],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            raw: true,
        });
        const nftItems = isCollection ? await NftItemService.getItemsByIds(rows.map(row => row.alkanesId)) : null;
        return {
            page,
            pageSize,
            pages: Math.ceil(count / pageSize),
            total: count,
            records: rows.map((row) => {
                row.isNft = isCollection;
                row.nftItem = nftItems?.find(item => item.id === row.alkanesId);
                return row;
            }),
        };
    }

    static async checkOutpointRecordsSpent(outpointRecords) {
        const errors = [];
        await BaseUtil.concurrentExecute(outpointRecords, async (outpoint) => {
            if (outpoint.checked) {
                return;
            }
            if (outpoint.spent) {
                outpoint.checked = true;
                return;
            }
            try {
                const outspend = await MempoolUtil.getOutspend(outpoint.txid, outpoint.vout);
                if (outspend.spent) {
                    outpoint.spent = true;
                }
                outpoint.checked = true;
            } catch (e) {
                logger.error(`update outpoint checked failed, ${outpoint.txid} ${outpoint.vout}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`update outpoint checked failed, ${errors.length} errors`);
        }
    }

    static async getOutpointListByTarget(address, id, amount, multiple = false) {
        const where = {
            address,
            spent: false,
            alkanesId: id,
        };
        if (!multiple) {
            where.alkanesIdCount = 1;
        }
        const outpointList = await OutpointRecord.findAll({
            where,
            order: [
                [Sequelize.literal('CAST(balance AS DECIMAL(64,0))'), 'DESC']
            ],
            raw: true,
        });
        const retOutpointList = [];
        let totalBalance = new BigNumber(0);
        for (const outpoint of outpointList) {
            retOutpointList.push(outpoint);
            if (retOutpointList.filter(o => !o.checked).length >= 16) { // 所需额度比较小的时候, 这里比较浪费资源
                await this.checkOutpointRecordsSpent(retOutpointList);
                totalBalance = retOutpointList.reduce((acc, outpoint) => {
                    if (!outpoint.spent) {
                        return acc.plus(new BigNumber(outpoint.balance));
                    }
                    return acc;
                }, new BigNumber(0));
                if (amount.gt(0) && totalBalance.gte(amount)) {
                    break;
                }
            }
        }
        if (retOutpointList.filter(o => !o.checked).length > 0) {
            await this.checkOutpointRecordsSpent(retOutpointList);
            totalBalance = retOutpointList.reduce((acc, outpoint) => {
                if (!outpoint.spent) {
                    return acc.plus(new BigNumber(outpoint.balance));
                }
                return acc;
            }, new BigNumber(0));
        }
        if (totalBalance.lt(amount)) {
            throw new Error(`Insufficient alkanes balance: ${totalBalance.dividedBy(1e8).toFixed()} target: ${new BigNumber(amount).dividedBy(1e8).toFixed()}`);
        }
        if (amount.lte(0)) {
            return retOutpointList.filter(o => !o.spent);
        }
        // 重新计算totalBalance
        totalBalance = new BigNumber(0);
        const finalRetOutpointList = [];
        for (const outpoint of retOutpointList) {
            if (!outpoint.spent) {
                totalBalance = totalBalance.plus(new BigNumber(outpoint.balance));
                finalRetOutpointList.push(outpoint);
                if (totalBalance.gte(amount)) {
                    break;
                }
            }
        }
        return finalRetOutpointList;
    }

    static async getBlockMarketTxsByType(block, type) {
        const errors = [];
        if (type === 'token') {
            const events = await MarketEventMapper.getSoldEventsByBlock(block);
            const results = await BaseUtil.concurrentExecute([...new Set(events.map(event => event.txHash))], async (txid) => {
                return await this.getMarketTxByType(txid, type);
            }, null, errors);
            if (errors.length > 0) {
                throw new Error(`get block market txs failed, ${errors.length} errors`);
            }
            return results.flat().flat();
        } else if (type === 'nft') {
            const events = await NftMarketEventMapper.getSoldEventsByBlock(block);
            const results = await BaseUtil.concurrentExecute([...new Set(events.map(event => event.txHash))], async (txid) => {
                return await this.getMarketTxByType(txid, type);
            }, null, errors);
            if (errors.length > 0) {
                throw new Error(`get block market txs failed, ${errors.length} errors`);
            }
            return results.flat().flat();
        }
        return [];
    }

    static async getMarketTxByType(txid, type) {
        if (type === 'token') {
            const events = await MarketEventMapper.getSoldEventsByTxId(txid);
            if (!events.length) {
                return [];
            }
            const alkanesId = events[0].alkanesId;
            const tokenInfo = await TokenInfoService.getTokenInfo(alkanesId);
            const marketTxs = [];
            for (const event of events) {
                const existingMarketTx = marketTxs.find(o => o.sellerAddress === event.sellerAddress);
                if (existingMarketTx?.sellerAddress) {
                    existingMarketTx.tokenAmount = existingMarketTx.tokenAmount.plus(new BigNumber(event.tokenAmount));
                    existingMarketTx.satsAmount = existingMarketTx.satsAmount.plus(new BigNumber(event.listingAmount));
                } else {
                    marketTxs.push({
                        txid,
                        alkanesId,
                        name: tokenInfo.name,
                        symbol: tokenInfo.symbol,
                        image: tokenInfo.image,
                        isNft: false,
                        tokenAmount: new BigNumber(event.tokenAmount),
                        satsAmount: new BigNumber(event.listingAmount),
                        sellerAddress: event.sellerAddress,
                        buyerAddress: event.buyerAddress,
                    });
                }
            }
            marketTxs.forEach(tx => {
                tx.satsPerToken = tx.satsAmount.dividedBy(tx.tokenAmount).toFixed();
                tx.tokenAmount = tx.tokenAmount.toFixed();
                tx.satsAmount = tx.satsAmount.toFixed();
            });
            return marketTxs;
        } else {
            const events = await NftMarketEventMapper.getSoldEventsByTxId(txid);
            if (!events.length) {
                return [];
            }
            const collectionId = events[0].collectionId;
            const collectionInfo = await NftCollectionService.getCollectionById(collectionId);
            const marketTxs = [];
            for (const event of events) {
                const item = await NftItemService.getItemById(event.itemId);
                marketTxs.push({
                    txid,
                    alkanesId: collectionId,
                    name: collectionInfo.name,
                    symbol: collectionInfo.symbol,
                    image: collectionInfo.image,
                    isNft: true,
                    tokenAmount: `1`,
                    satsAmount: new BigNumber(event.listingPrice).toFixed(),
                    sellerAddress: event.sellerAddress,
                    buyerAddress: event.buyerAddress,
                    satsPerToken: new BigNumber(event.listingPrice).toFixed(),
                    item: {
                        id: item.id,
                        name: item.name,
                        symbol: item.symbol,
                        image: item.image,
                        contentType: item.contentType,
                        // attributes: item.attributes,
                    }
                });
            }
            return marketTxs;
        }
    }

    static async getMarketTx(txid) {
        const errors = [];
        const results = await BaseUtil.concurrentExecute(['token', 'nft'], async (type) => {
            try {
                return await this.getMarketTxByType(txid, type);
            } catch (e) {
                logger.error(`get market tx failed, ${e.message}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`get market tx failed, ${errors.length} errors`);
        }
        return results.flat();
    }

    static async getMarketTxs(block) {
        const errors = [];
        const results = await BaseUtil.concurrentExecute(['token', 'nft'], async (type) => {
            try {
                return await this.getBlockMarketTxsByType(block, type);
            } catch (e) {
                logger.error(`get block market txs failed, ${e.message}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`get market tx failed, ${errors.length} errors`);
        }
        return results.flat().reduce((acc, tx) => {
            acc[tx.txid] = acc[tx.txid] || [];
            acc[tx.txid].push(tx);
            return acc;
        }, {});
    }

    static async getOutpoint(txid, vout) {
        return await OutpointRecord.findAll({
            where: {
                txid,
                vout,
            },
            raw: true,
        });
    }

    static async getOutpoints(block, txid, alkanesId) {
        if (!block && !txid) {
            throw new Error('block, txid at least one is required');
        }
        const where = {};
        if (block) {
            where.block = block;
        }
        if (txid) {
            where.txid = txid;
        }
        if (alkanesId) {
            where.alkanesId = alkanesId;
        }
        return await OutpointRecord.findAll({
            where,
            order: [
                ['block', 'DESC'],
                ['txIdx', 'DESC'],
                ['vout', 'DESC'],
            ],
            raw: true,
        });
    }

    static async getAlkanesData(alkanesId, block) {
        const result = await AlkanesService.simulate({
            target: {block: alkanesId.split(':')[0], tx: alkanesId.split(':')[1]},
            inputs: ['1000'],
            height: `${block}`,
        });
        const text = (result.string || '').trim();
        if (text.startsWith('data:image/')) {
            return text;
        } else if (
            (text.toLowerCase().startsWith('<?xml version="1.0" encoding="UTF-8"?>'.toLowerCase()) && text.toLowerCase().endsWith('</svg>')) ||
            (text.toLowerCase().startsWith('<svg ') && text.toLowerCase().endsWith('</svg>'))
        ) {
            return text;
        } else if (text.startsWith('0x')) {
            const {type, mimeType, image} = BaseUtil.detectFileType(text) ?? {};
            if (type && image) {
                // 将image转换为base64
                const base64 = Buffer.from(text.slice(2), 'hex').toString('base64');
                return `data:${mimeType};base64,${base64}`;
            }
        }
        logger.error(`can not detect alkanes data type, ${alkanesId} ${block}`);
        return null;
    }

    static async amendBlock(block) {
        const blockHash = await MempoolUtil.getBlockHash(block);
        const blockDetails = await BtcRPC.getBlockDetails(blockHash);
        const txs = blockDetails.tx;
        const blockTime = blockDetails.time;
        const txids = txs.map(tx => tx.txid);
        const errors = [];
        await BaseUtil.concurrentExecute(txs, async (tx) => {
            const txid = tx.txid;
            try {
                if (!tx.vout.find(o => o.scriptPubKey.hex.startsWith('6a5d'))) {
                    return;
                }
                const result = await decodeProtorune(tx.hex, 0, true);
                if (!result.protostones?.length) { // 没有protostone
                    return;
                }
                const txIdx = txids.indexOf(txid);
                let mempoolTx = null;
                const voutErrors = [];
                await BaseUtil.concurrentExecute(tx.vout, async (outpoint) => {
                    if (outpoint.scriptPubKey.hex.startsWith('6a5d')) {
                        return;
                    }
                    const vout = outpoint.n;
                    try {
                        const outpoint_balances = await AlkanesService.getAlkanesByUtxo({
                            txid,
                            vout,
                            height: block,
                        }, block, config.alkanesIndexerUrl, 1000 * 30);
                        const dbOutpoints = await OutpointRecord.findAll({
                            where: {
                                txid,
                                vout,
                            },
                            raw: true,
                        });
                        const alkanesIdCount = outpoint_balances.length;
                        if (alkanesIdCount === 0) {
                            if (dbOutpoints.length > 0) {
                                logger.info(`amend block ${block} tx ${txid} vout ${vout} outpoint count is 0, destroy ${dbOutpoints.length} outpoints`);
                                await OutpointRecord.destroy({
                                    where: {
                                        txid,
                                        vout,
                                    },
                                });
                                for (const dbOutpoint of dbOutpoints) {
                                    const balance = await OutpointRecordMapper.getBalance(dbOutpoint.address, dbOutpoint.alkanesId);
                                    const existingBalance = await AddressBalanceMapper.getAddressBalance(dbOutpoint.address, dbOutpoint.alkanesId);
                                    if (existingBalance?.balance !== balance) {
                                        await AddressBalanceMapper.updateAddressBalance(dbOutpoint.address, dbOutpoint.alkanesId, balance, block);
                                        await NftItemService.updateItemHolder(dbOutpoint.alkanesId);
                                    }
                                }
                            }
                            return;
                        }
                        if (dbOutpoints.length === alkanesIdCount) {
                            return;
                        }
                        logger.info(`amend block ${block} tx ${txid} vout ${vout} outpoint count mismatch, ${dbOutpoints.length} ${alkanesIdCount}`);
                        await OutpointRecord.destroy({
                            where: {
                                txid,
                                vout,
                            },
                        });
                        const spendInfo = await MempoolUtil.getTxOutspend(txid, vout);
                        const spent = spendInfo.spent;
                        let spendBy = null;
                        let spendByInput = null;
                        if (spent && spendInfo.status?.confirmed) {
                            const stxIdx = `${txIdx}`.padStart(5, '0');
                            spendBy = parseInt(`${block}${stxIdx}`);
                            spendByInput = `${spendInfo.txid}:${spendInfo.vin}`;
                        }
                        const records = [];
                        for (const outpoint_balance of outpoint_balances) {
                            if (!mempoolTx) {
                                mempoolTx = await MempoolUtil.getTx(txid);
                            }
                            const balance = outpoint_balance.value;
                            const address = mempoolTx.vout[vout].scriptpubkey_address;
                            const alkanesId = outpoint_balance.id;
                            records.push({
                                block,
                                txIdx,
                                txid,
                                vout,
                                value: mempoolTx.vout[vout].value,
                                address,
                                alkanesId,
                                balance: balance.toFixed(),
                                alkanesIdCount,
                                spent: spendInfo.spent,
                                spendBy,
                                spendByInput,
                                blockTime,
                            });
                            const balanceStr = await OutpointRecordMapper.getBalance(address, alkanesId);
                            const existingBalance = await AddressBalanceMapper.getAddressBalance(address, alkanesId);
                            if (existingBalance?.balance !== balanceStr) {
                                await AddressBalanceMapper.updateAddressBalance(address, alkanesId, balanceStr, block);
                                await NftItemService.updateItemHolder(alkanesId);
                            }
                        }
                        await OutpointRecord.bulkCreate(records);
                    } catch (e) {
                        logger.error(`index block ${block} tx ${txid} vout ${vout} failed, ${e.message}`, e);
                        throw e;
                    }
                }, null, voutErrors);
                if (voutErrors.length > 0) {
                    throw new Error(`index block ${block} tx ${txid} failed, ${voutErrors.length} vout errors`);
                }
            } catch (e) {
                logger.error(`index block ${block} tx ${txid} failed, ${e.message}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`amend block ${block} failed, ${errors.length} errors`);
        }
    }
}