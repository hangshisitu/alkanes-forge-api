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
                const effectCount = effectCounts.reduce((acc, curr) => acc + curr, 0);
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
        const effectAddresses = await OutpointRecord.distinct('address', {
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
        const updatedAddresses = await AddressBalance.distinct('address', {
            where: {
                updateBlock: {
                    [Op.gte]: block,
                },
            },
        });
        effectAddresses.push(...updatedAddresses);
        // 更新受影响的address的balance
        if (effectAddresses.length === 0) {
            return;
        }
        const addressAlkanesBalances = await OutpointRecord.findAll({
            where: {
                address: {
                    [Op.in]: effectAddresses,
                },
                spent: false,
            },
            group: ['address', 'alkanesId'],
            attributes: ['address', 'alkanesId', [sequelize.fn('sum', sequelize.col('balance')), 'balance']],
        });
        const errors = [];
        await BaseUtil.concurrentExecute(addressAlkanesBalances, async (addressAlkanesBalance) => {
            const { address, alkanesId, balance } = addressAlkanesBalance;
            try {
                await AddressBalanceMapper.updateAddressBalance(address, alkanesId, balance, block);
            } catch (e) {
                logger.error(`block ${block} update address ${address} alkanesId ${alkanesId} balance ${balance} failed, ${e.message}`, e);
                throw e;
            }
        }, null, errors);
        if (errors.length > 0) {
            throw new Error(`block ${block} update addresses balance failed, ${errors.length} errors`);
        }
    }

}





