import ReconnectingWebSocket from 'reconnecting-websocket';
import MempoolTx from '../models/MempoolTx.js';
import MempoolTxMapper from '../mapper/MempoolTxMapper.js';
import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import MempoolUtil from '../utils/MempoolUtil.js';
import WebSocket from 'ws';
import {Op} from "sequelize";
import {Queue} from "../utils/index.js";
import * as logger from '../conf/logger.js';
import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";
import BaseUtil from '../utils/BaseUtil.js';
import decodeProtorune from '../lib/ProtoruneDecoder.js';
import MempoolAsset from '../models/MempoolAsset.js';
import MarketService from '../service/MarketService.js';
import NftMarketService from '../service/NftMarketService.js';
import IndexerService from '../service/IndexerService.js';
import schedule from 'node-schedule';

const new_block_callbacks = [];
const concurrent = process.env.NODE_ENV === 'pro' ? 16 : 1;
const blocks = process.env.NODE_ENV === 'pro' ? 8 : 1
const block_message_queues = {};
for (let i = 0; i < blocks; i++) {
    block_message_queues[i] = new Queue();
}

async function delete_mempool_txs(txids) {
    if (!txids?.length) {
        return;
    }
    return await MempoolTx.destroy({
        where: { txid: txids }
    });
    // logger.info(`delete mempool txs: ${JSON.stringify(txids)}`);
}

async function delete_mempool_assets(txids) {
    if (!txids?.length) {
        return;
    }
    return await MempoolAsset.destroy({
        where: { txid: txids }
    });
}

async function remove_by_block_height(hash) {
    const blockTxids = await MempoolUtil.getBlockTxIds(hash);
    if (!blockTxids?.length) {
        return;
    }
    const counts = await BaseUtil.concurrentExecute(BaseUtil.splitArray(blockTxids, 100), async (txids) => {
        const count1 = await delete_mempool_assets(txids);
        const count2 = await delete_mempool_txs(txids);
        return count1 + count2;
    });
    return counts.reduce((a, b) => +b + a, 0);
}

async function detect_tx_status(txs) {
    const ret_txids = [];
    while (true) {
        const tx = txs.shift();
        if (!tx) {
            break;
        }
        const txid = tx.txid;
        try {
            const mempoolTx = await MempoolUtil.getTxEx(txid);
            if (!mempoolTx) {
                ret_txids.push(txid);
            } else if (mempoolTx.status.confirmed) {
                ret_txids.push(txid);
            }
        } catch (e) {
            logger.error(`detect tx status error: ${txid}`, e);
            await BaseUtil.sleep(3000);
            continue;
        }
    }
    return ret_txids;
}

async function scan_mempool_asset() {
    const size = 100;
    let minId = 0;
    while (true) {
        const assets = await MempoolAsset.findAll({
            offset: 0,
            limit: size,
            where: {
                id: {
                    [Op.gt]: minId
                }
            },
            order: [
                ['id', 'ASC']
            ]
        });
        if (assets.length === 0) {
            break;
        }
        minId = assets[assets.length - 1].id;
        const promises = [];
        for (let i = 0; i < concurrent; i++) {
            promises.push(detect_tx_status(assets));
        }
        const results = await Promise.all(promises);
        const txids = results.flat();
        if (txids.length) {
            await delete_mempool_txs(txids);
        }
    }
}


async function scan_mempool_tx() {
    const size = 100;
    let minId = 0;
    while (true) {
        const txs = await MempoolTx.findAll({
            offset: 0,
            limit: size,
            where: {
                id: {
                    [Op.gt]: minId
                }
            },
            order: [
                ['id', 'ASC']
            ]
        });
        if (txs.length === 0) {
            break;
        }
        minId = txs[txs.length - 1].id;
        const promises = [];
        for (let i = 0; i < concurrent; i++) {
            promises.push(detect_tx_status(txs));
        }
        const results = await Promise.all(promises);
        const txids = results.flat();
        if (txids.length) {
            await delete_mempool_txs(txids);
        }
    }
}

async function try_scan_mempool() {
    try {
        await Promise.all([
            scan_mempool_tx(),
            scan_mempool_asset()
        ]);
    } catch (err) {
        logger.error('scan mempool tx error', err);
    }
}

async function handle_mempool_txs(txids) {
    const promises = [];
    let count = 0;
    for (let i = 0; i < concurrent; i++) {
        promises.push((async () => {
            while (true) {
                const txid = txids.shift();
                if (!txid) {
                    break;
                }
                try {
                    if (await handle_mempool_tx(txid)) {
                        count++;
                    }
                } catch (e) {
                    logger.error(`handle mempool tx error: ${txid}`, e);
                }
            }
        })());
    }
    await Promise.all(promises);
    return count;
}

async function handle_mempool_mint(txid, protostones) {
    const mempoolTxs = [];
    for (const protostone of protostones ?? []) {
        const message = protostone.message;
        if (!message) {
            continue;
        }
        const mintData = BaseUtil.decodeLEB128Array(JSON.parse(message));
        if (mintData.length < 3) {
            continue;
        }
        if (await MempoolTx.findOne({
            where: {
                txid
            }
        })) {
            break;
        }
        logger.info(`handle mempool tx: ${txid}, protostone message: ${JSON.stringify(mintData)}`);
        let feeRate = null;
        let i = 0;
        let address = null;
        while (i < mintData.length) {
            const code = mintData[i];
            if (code === 2 && (mintData[i + 2] === 77 || mintData[i + 2] === 78)) {
                if (!feeRate) {
                    const electrsTx = await MempoolUtil.getTxEx(txid);
                    if (!electrsTx || electrsTx.status.confirmed) {
                        await MempoolTx.destroy({
                            where: { txid }
                        });
                        break;
                    }
                    feeRate = Math.round(electrsTx.fee / (electrsTx.weight / 4) * 100) / 100;
                    address = electrsTx.vout.find(v => v.scriptpubkey_address)?.scriptpubkey_address;
                }
                mempoolTxs.push({
                    txid,
                    alkanesId: `2:${mintData[i + 1]}`,
                    op: 'mint',
                    address,
                    feeRate,
                });
                i += 3;
            } else {
                i++;
            }
        }
    }
    if (mempoolTxs.length > 0) {
        return bulkInsertMempoolTxs(mempoolTxs);
    }
    return 0;
}

async function handle_mempool_asset(txid, protostones) {
    if (!protostones?.some(p => p.edicts?.length > 0)) {
        return 0;
    }
    const electrsTx = await MempoolUtil.getTxEx(txid);
    if (!electrsTx || electrsTx.status.confirmed) {
        await MempoolTx.destroy({
            where: { txid }
        });
        return 0;
    }
    for (const [idx, vin] of electrsTx.vin.entries()) {
        vin.idx = idx;
    }
    const feeRate = Math.round(electrsTx.fee / (electrsTx.weight / 4) * 100) / 100;
    let mempoolAssets = await BaseUtil.concurrentExecute(electrsTx.vin, async (vin) => {
        const records = await IndexerService.getOutpointByOutput(vin.txid, vin.vout);
        if (!records?.length) {
            return null;
        }
        return {
            txid,
            vin: vin.idx,
            assetAddress: vin.prevout.scriptpubkey_address,
            assetTxid: vin.txid,
            assetVout: vin.vout,
            feeRate
        };
    });
    mempoolAssets = mempoolAssets.filter(asset => asset !== null);
    if (mempoolAssets.length) {
        await Promise.all([
            MempoolAsset.bulkCreate(mempoolAssets, {
                ignoreDuplicates: true,
                returning: false
            }),
            BaseUtil.concurrentExecute(mempoolAssets, async (asset) => {
                await MarketService.delistingByOutput(txid, {
                    txid: asset.assetTxid,
                    vout: asset.assetVout
                });
            }),
            BaseUtil.concurrentExecute(mempoolAssets, async (asset) => {
                await NftMarketService.delistingByOutput(txid, {
                    txid: asset.assetTxid,
                    vout: asset.assetVout
                });
            })
        ]);
        return mempoolAssets.length;
    }
    return 0;
}

async function handle_mempool_tx(txid) {
    const hex = await MempoolUtil.getTxHexEx(txid);
    if (!hex) {
        logger.info(`no hex found: ${txid}, delete from db`);
        const count = await MempoolTx.destroy({
            where: { txid }
        });
        return count > 0;
    }
    const tx = bitcoin.Transaction.fromHex(hex);
    if (!tx.outs.find(o => o.script.toString('hex').startsWith('6a5d'))) {
        return false;
    }
    const result = await decodeProtorune(hex);
    if (result?.status !== 'success') {
        logger.error(`parse tx [${txid}] error`, result);
        return false;
    }
    const [mintTxCount, assetTxCount] = await Promise.all([
        handle_mempool_mint(txid, result.protostones),
        handle_mempool_asset(txid, result.protostones)
    ]);
    return +mintTxCount + +assetTxCount;
}

async function bulkInsertMempoolTxs(mempoolTxs) {
    if (!mempoolTxs || mempoolTxs.length === 0) {
        return 0;
    }
    return await MempoolTx.bulkCreate(mempoolTxs, {
        ignoreDuplicates: true,
        returning: false
    });
}

function safe_call(callback, ...args) {
    try {
        callback(...args);
    } catch (e) {
        logger.error(`safe call error`, e);
    }
}

async function handle_new_block(block, handle_db = true) {
    for (const callback of new_block_callbacks) {
        safe_call(callback, block);
    }
    if (handle_db) {
        return await remove_by_block_height(block.id);
    }
}

async function handle_removed_txs(txids) {
    const promises = [];
    const txs = txids.map(txid => {
        return {txid};
    });
    for (let i = 0; i < concurrent; i++) {
        promises.push(detect_tx_status(txs));
    }
    const results = await Promise.all(promises);
    const remove_txids = results.flat();
    if (remove_txids.length) {
        const [count1, count2] = await Promise.all([
            delete_mempool_txs(remove_txids),
            delete_mempool_assets(remove_txids)
        ]);
        return +count1 + +count2;
    }
    return 0;
}

async function flat_rbf_latest(replaces, txids) {
    if (!replaces?.length) {
        return;
    }
    replaces.forEach(replace => {
        txids.push(replace.tx.txid);
        flat_rbf_latest(replace.replaces, txids);
    });

}

async function refresh_cache() {
    logger.info('refresh mempool data cache');
    const existKeys = await RedisHelper.scan(`${Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX}*`, 1000, false);
    const keys = [];
    const mempoolDatas = await MempoolTxMapper.getAllAlkanesIdMempoolData();
    for (const alkanesId in mempoolDatas) {
        keys.push(RedisHelper.genKey(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX + alkanesId));
        await RedisHelper.set(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX + alkanesId, JSON.stringify(mempoolDatas[alkanesId]));
    }
    await RedisHelper.del(existKeys.filter(key => !keys.includes(key)), false);
}

async function handle_mempool_message(block_index) {
    const queue = block_message_queues[block_index];
    while (true) {
        try {
            let data = await queue.get();
            if (!data) {
                await BaseUtil.sleep(500);
                continue;
            }
            data = JSON.parse(data);
            let updated = false;
            if (block_index === 0 && data.block) { // 出新块, 将已确认的从数据库中删除
                const count = await handle_new_block(data.block);
                if (count > 0) {
                    logger.info(`handle new block: ${data.block.height}, effect: ${count}`);
                    updated = true;
                }
            }
            const delta = data['projected-block-transactions']?.delta;
            if (delta) {
                if (delta.removed?.length) {
                    const count = await handle_removed_txs(delta.removed);
                    if (count > 0) {
                        logger.info(`handle removed txs: ${count}`);
                        updated = true;
                    }
                }
                if (delta.changed?.length) {
                    let count = 0;
                    for (const item of delta.changed) {
                        const txid = item[0];
                        const feeRate = item[1];
                        const c = await MempoolTx.update({
                            feeRate
                        }, {
                            where: { 
                                txid,
                                feeRate: {
                                    [Op.lt]: feeRate
                                }
                            }
                        });
                        count += +c;
                    }
                    if (count > 0) {
                        updated = true;
                        logger.info(`handle mempool changed txs: ${count}`);
                    }
                }
                if (delta.added?.length) {
                    const count = await handle_mempool_txs(delta.added.map(item => item[0]));
                    if (count > 0) {
                        logger.info(`handle mempool added txs: ${count}`);
                        updated = true;
                    }
                }
            }
            const rbfLatest = data.rbfLatest;
            if (rbfLatest?.length) {
                const txids = [];
                rbfLatest.forEach(item => {
                    flat_rbf_latest(item.replaces, txids);
                });
                if (txids.length) {
                    const count = await delete_mempool_txs(txids);
                    if (count > 0) {
                        updated = true;
                    }
                    logger.info(`handle rbf latest txs: ${txids.length}, effect: ${count}`);
                    await MarketService.rollbackListingFromSold(txids);
                    await NftMarketService.rollbackListingFromSold(txids);
                }
            }
            if (updated) {
                await refresh_cache();
            }
        } catch (e) {
            logger.error('parse mempool message occur error', e);
            await BaseUtil.sleep(3000);
        }
    }
}

function connect_mempool(block, onmessage, monitor_new_block_only = false) {
    let connect_count = 0;
    const rws = new ReconnectingWebSocket('wss://idclub.mempool.space/api/v1/ws', undefined, {
        WebSocket,
        startClosed: true
    });
    rws.onopen = () => {
        if (connect_count > 0 && block === 0) {
            if (monitor_new_block_only) {
                handle_new_block(null, false);
            } else {
                try_scan_mempool();  
            }
        }
        connect_count ++;      
        logger.info(`connect mempool block: ${block}, connect_count: ${connect_count}`);
        rws.send(`{"action":"init"}`);
        rws.send(`{"track-mempool-block":${block}}`);
        rws.send(`{"action":"want","data":["blocks","mempool-blocks"]}`);
        if (block === 0 && !monitor_new_block_only) {
            rws.send(`{"track-rbf":"all"}`);
        }
    };
    rws.onmessage = (event) => {
        try {
            onmessage(event.data);
        } catch(e) {
            logger.error(`handle ${event} error`, e);
        }
    };
    rws.onerror = (event) => {
        logger.error(`handle ws error`, event);
    };
    rws.onclose = () => {
        logger.error('disconnect from mempool');
    };
    rws.reconnect();
    return rws;
}

async function scan_mempool_periodically() {
    while (true) {
        await BaseUtil.sleep(60000);
        try {
            await try_scan_mempool();
        } catch (e) {
            logger.error('scan mempool error', e);
        }
    }
}

let isScanRbf = false;
function scanRbf() {
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isScanRbf) {
            return;
        }

        try {
            isScanRbf = true;
            logger.info('scan rbf start');
            const startTime = Date.now();

            const rbfLatest = await MempoolUtil.getRbfLatest();
            const txids = [];
            rbfLatest.forEach(item => {
                flat_rbf_latest(item.replaces, txids);
            });
            if (txids.length > 0) {
                await MarketService.rollbackListingFromSold(txids);
                await NftMarketService.rollbackListingFromSold(txids);
            }
            logger.info(`scan rbf finish. cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            logger.error(`scan rbf error: ${err.message}`, err);
        } finally {
            isScanRbf = false;
        }
    });
}


export function start(monitor_new_block_only = false, scan_rbf = false) {
    if (scan_rbf) {
        scanRbf();
    }
    if (!monitor_new_block_only) {
        try_scan_mempool().finally(() => {
            for (let i = 0; i < blocks; i++) {
                handle_mempool_message(i).catch(err => {
                    logger.error('handle mempool message queue error', err);
                });
                connect_mempool(i, data => {
                    block_message_queues[i].put(data);
                });
            }
            scan_mempool_periodically();
        });
        return;
    }
    connect_mempool(0, async data => {
        data = JSON.parse(data);
        if (data.block) { // 出新块
            await handle_new_block(data.block, false);
        }
    }, true);
}

export function onNewBlock(callback) {
    new_block_callbacks.push(callback);
}
