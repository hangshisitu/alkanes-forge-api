import IndexBlock from '../models/IndexBlock.js';
import MempoolUtil from '../utils/MempoolUtil.js';
import OutpointRecordMapper from '../mapper/OutpointRecordMapper.js';
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
import TokenInfoMapper from '../mapper/TokenInfoMapper.js';
import config from '../conf/config.js';
import AlkanesService from './AlkanesService.js';
import decodeProtorune from '../lib/ProtoruneDecoder.js';
import NftCollectionService from './NftCollectionService.js';
import Sequelize from 'sequelize';

export default class IndexerService {

    static async index({current, previous}) {
        // 废弃        
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
                        await OutpointRecordMapper.deleteAfter(block);
                        await IndexBlockMapper.deleteAfter(block);
                        logger.warn(`index block ${block} hash mismatch, new ${blockHash}, old ${indexBlock.blockHash}, reorg detected`);
                        continue;
                    }
                    block = indexBlock.block + 1;
                }
                const maxHeight = await AlkanesService.metashrewHeight();
                if (block > maxHeight) {
                    break;
                }
                logger.putContext({block});
                logger.info(`index block ${block}`);
                await OutpointRecordMapper.deleteAfter(block);
                await IndexBlockMapper.deleteAfter(block);
                const blockHash = await MempoolUtil.getBlockHash(block);
                const txs = await BtcRPC.getBlockTransactions(blockHash);
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
                        if (!result?.protostones?.length) { // 没有protostone
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
                                });
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
                                        balance: balance.toString(),
                                        alkanesIdCount,
                                        spent: false,
                                        blockTime: mempoolTx.status.block_time
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
                const effectCounts = await BaseUtil.concurrentExecute(vins, async (vin) => {
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
            attributes: ['address', 'alkanesId', [sequelize.fn('sum', sequelize.literal('CAST(balance AS UNSIGNED)')), 'balance']],
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
            await NftCollectionService.refreshCollectionHolderAndItemCount([...new Set(nftItemBalances.map(item => item.alkanesId))]);
        }
    }

    static async getHolderPage(alkanesId, page, size) {
        const tokenInfo = await TokenInfoService.getTokenInfo(alkanesId);
        if (!tokenInfo) {
            throw new Error(`token ${alkanesId} not found`);
        }
        const holders = await sequelize.query(`
            select address, balance, CAST(balance as UNSIGNED) / :permint as cnt 
            from address_balance 
            where alkanes_id = :alkanesId and balance > 0
            group by address
            order by cnt desc
            limit :size offset :offset
        `, {
            replacements: {
                alkanesId,
                permint: tokenInfo.mintAmount,
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

    static async getAddressAlkanesOutpoints(address, alkanesId, limit = 10, spent = false) {
        const where = {
            address,
            alkanesId,
        };
        if (spent != null) {
            where.spent = spent;
        }
        const outpoints = await OutpointRecord.findAll({
            where,
            limit: limit + 1,
            order: [['block', 'ASC']],
        });
        return {
            outpoints: outpoints.slice(0, limit),
            hasMore: outpoints.length > limit,
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

}


async function amendBalance() {
    let minId = 0;
    const addressBalances = [];
    while (true) {
        console.log(`minId: ${minId}`);
        const batchAddressBalances = await AddressBalance.findAll({
            where: {
                id: {
                    [Op.gt]: minId
                }
            },
            raw: true,
            limit: 1000,
            order: [['id', 'ASC']],
        });
        minId = batchAddressBalances[batchAddressBalances.length - 1].id;
        addressBalances.push(...batchAddressBalances);
        if (batchAddressBalances.length < 1000) {
            break;
        }
    }
    const total = addressBalances.length;
    let count = 0;
    const block = 895621;
    const errors = [];
    await BaseUtil.concurrentExecute(addressBalances, async addressBalance => {
        try {
            let newAddressBalance = await OutpointRecord.findOne({
                where: {
                    address: addressBalance.address,
                    alkanesId: addressBalance.alkanesId,
                    spent: false,
                },
                attributes: ['address', 'alkanesId', [sequelize.fn('sum', sequelize.literal('CAST(balance AS UNSIGNED)')), 'balance']],
                raw: true,
            });
            if (!newAddressBalance?.address) {
                newAddressBalance = {
                    address: addressBalance.address,
                    alkanesId: addressBalance.alkanesId,
                    balance: 0,
                }
            }
            newAddressBalance.balance = BigInt(newAddressBalance.balance).toString();
            if (addressBalance.balance !== newAddressBalance.balance) {
                newAddressBalance.updateBlock = block;
                const effectCount = await AddressBalance.update(newAddressBalance, {
                    where: {
                        address: addressBalance.address,
                        alkanesId: addressBalance.alkanesId,
                    },
                });
                if (+effectCount !== 1) {
                    throw new Error(`amend balance failed, ${JSON.stringify(addressBalance)}`);
                }
            }
            console.log(`progress: ${++count}/${total}`);
        } catch(e) {
            logger.error(`amend balance failed, ${JSON.stringify(addressBalance)}`, e);
            throw e;
        }
    }, 16, errors);
    if (errors.length > 0) {
        throw new Error(`amend balance failed, ${errors.length} errors`);
    }
}

// await amendBalance();

