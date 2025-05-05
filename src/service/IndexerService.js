import IndexBlock from '../models/IndexBlock.js';
import MempoolUtil from '../utils/MempoolUtil.js';
import OutpointRecordMapper from '../mapper/OutpointRecordMapper.js';
import IndexBlockMapper from '../mapper/IndexBlockMapper.js';
import BaseUtil from '../utils/BaseUtil.js';
import * as logger from '../conf/logger.js';

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
            const records = [];
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
                    const address = tx.vout[vout].scriptPubKey.scriptpubkey_address;
                    for (const { rune_id, balance } of balances) {
                        const alkanesIdCount = balances.length;
                        records.push({
                            block: height,
                            txIdx,
                            txid,
                            vout,
                            address,
                            balance,
                            alkanesId: rune_id,
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
            for (const batch of BaseUtil.splitArray(records, 100)) {
                await OutpointRecordMapper.bulkUpsert(batch);
            }
        }
        await IndexBlock.create({
            block: height,
            blockHash
        });
    }

}





