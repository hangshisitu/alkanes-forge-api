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

export default class IndexerService {

    static async index({current, previous}) {
        await this.indexBlock(previous);
        await this.indexBlock(current);        
    }

    static async indexBlock({ height, outpoint_balances }) {
        const indexBlock = await IndexBlock.findOne({
            where: {
                block: height
            }
        });
        const blockHash = await MempoolUtil.getBlockHash(height);
        if (indexBlock) {
            if (blockHash === indexBlock.blockHash) {
                return;
            }
            logger.warn(`index block ${height} hash mismatch, new ${blockHash}, old ${indexBlock.blockHash}, reorg detected`);
        }
        await OutpointRecordMapper.deleteAfter(height);
        await IndexBlockMapper.deleteAfter(height);
        if (outpoint_balances.length > 0) {
            const txs = {};
            const errors =[];
            const txids = await MempoolUtil.getBlockTxIds(blockHash);
            await BaseUtil.concurrentExecute(outpoint_balances, async (outpoint_balance) => {
                const { balances, txid, vout } = outpoint_balance;
                try {
                    const txIdx = txids.indexOf(txid);
                    let tx = txs[txid];
                    if (!tx) {
                        tx = await MempoolUtil.getTx(txid);
                        txs[txid] = tx;
                    }
                    const address = tx.vout[vout].scriptpubkey_address;
                    for (const { rune_id, balance } of balances) {
                        const alkanesIdCount = balances.length;
                        await OutpointRecord.create({
                            block: height,
                            txIdx,
                            txid,
                            vout,
                            address,
                            alkanesId: rune_id,
                            balance,
                            alkanesIdCount,
                            spent: false,
                            blockTime: tx.status.block_time
                        });
                    }
                } catch (e) {
                    logger.error(`index block ${height} tx ${txid} vout ${vout} failed, ${e.message}`, e);
                    throw e;
                }
            }, null, errors);
            if (errors.length > 0) {
                throw new Error(`index block ${height} failed, ${errors.length} errors`);
            }
        }
        await IndexBlock.create({
            block: height,
            blockHash
        });
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
        const addressAlkanesBalances = await OutpointRecord.findAll({
            where: {
                address: {
                    [Op.in]: Object.keys(effectAddressAlkanes),
                },
                alkanesId: {
                    [Op.in]: Object.values(effectAddressAlkanes).map(set => [...set]).flat(),
                },
                spent: false,
                block: {
                    [Op.lte]: block,
                },
            },
            group: ['address', 'alkanesId'],
            attributes: ['address', 'alkanesId', [sequelize.fn('sum', sequelize.col('balance')), 'balance']],
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
    }

    static async getHolderPage(alkanesId, page, size) {
        const tokenInfo = await TokenInfoService.getTokenInfo(alkanesId);
        if (!tokenInfo) {
            throw new Error(`token ${alkanesId} not found`);
        }
        const holders = await sequelize.query(`
            select address, balance, balance / :permint as cnt 
            from address_balance 
            where alkanes_id = :alkanesId 
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
            raw: true,
        });
        const total = await AddressBalance.count({
            where: {
                alkanesId,
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

}




