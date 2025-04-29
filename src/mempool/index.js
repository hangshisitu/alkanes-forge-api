import ReconnectingWebSocket from 'reconnecting-websocket';
import MempoolTx from '../models/MempoolTx.js';
import MempoolTxMapper from '../mapper/MempoolTxMapper.js';
import axios from 'axios';
import config from "../conf/config.js";
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

const new_block_callbacks = [];
const concurrent = process.env.NODE_ENV === 'pro' ? 16 : 1;
const blocks = process.env.NODE_ENV === 'pro' ? 8 : 1
let last_refresh_cache_time = 0;
const block_message_queues = {};
for (let i = 0; i < blocks; i++) {
    block_message_queues[i] = new Queue();
}


function decodeLEB128Array(bytes) {
    const result = [];
    let i = 0;

    while (i < bytes.length) {
        // 如果当前字节的最高位是 0，直接保留
        if ((bytes[i] & 0x80) === 0) {
            result.push(bytes[i]);
            i++;
        } else {
            // 否则进行 LEB128 解码
            let value = 0;
            let shift = 0;
            do {
                value |= (bytes[i] & 0x7F) << shift;
                shift += 7;
                i++;
            } while (i < bytes.length && (bytes[i - 1] & 0x80) !== 0);
            result.push(value);
        }
    }

    return result;
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

async function remove_by_block_height(hash) {
    const blockTxids = await MempoolUtil.getBlockTxIds(hash);
    if (!blockTxids?.length) {
        return;
    }
    let count = 0;
    for (let i = 0; i < blockTxids.length; i += 100) {
        const txids = blockTxids.slice(i, i + 100);
        count += await delete_mempool_txs(txids);
    }
    return count;
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

async function try_scan_mempool_tx() {
    try {
        await scan_mempool_tx();
    } catch (err) {
        logger.error('scan mempool tx error', err);
    }
}

async function parse_tx_hex(hex) {
    try {
        const response = await axios.post(`${config.api.protoruneParseEndpoint}/decode`, hex);
        return response.data;
    } catch (error) {
        logger.error(`parse tx hex error`, error);
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
    const result = await parse_tx_hex(hex);
    if (result?.status !== 'success') {
        logger.error(`parse tx [${txid}] error`, result);
        return false;
    }
    const mempoolTxs = [];
    for (const protostone of result.protostones ?? []) {
        const message = protostone.message;
        if (!message) {
            continue;
        }
        const mintData = decodeLEB128Array(JSON.parse(message));
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
        let address = null;
        let feeRate = null;
        let i = 0;
        while (i < mintData.length) {
            const code = mintData[i];
            if (code === 2 && mintData[i + 2] === 77) {
                if (!address) {
                    address = PsbtUtil.script2Address(tx.outs[0].script);
                }
                if (!feeRate) {
                    const electrsTx = await MempoolUtil.getTxEx(txid);
                    if (!electrsTx || electrsTx.status.confirmed) {
                        await MempoolTx.destroy({
                            where: { txid }
                        });
                        break;
                    }
                    feeRate = Math.round(electrsTx.fee / (electrsTx.weight / 4) * 100) / 100;
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
        await MempoolTx.bulkCreate(mempoolTxs, {
            ignoreDuplicates: true,
        });
        return true;
    }
    return false;
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
        await delete_mempool_txs(remove_txids);
    }
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
                // 跟踪了rbf, 不需要处理removed的交易
                // if (delta.removed?.length) {
                //     await handle_removed_txs(delta.removed);
                // }
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
                }
            }
            if (updated || Date.now() - last_refresh_cache_time >= 10000) {
                last_refresh_cache_time = Date.now();
                refresh_cache().catch(err => {
                    logger.error('refresh cache error', err);
                });
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
                try_scan_mempool_tx();  
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


export function start(monitor_new_block_only = false) {
    if (!monitor_new_block_only) {
        try_scan_mempool_tx().finally(() => {
            for (let i = 0; i < blocks; i++) {
                handle_mempool_message(i).catch(err => {
                    logger.error('handle mempool message queue error', err);
                });
                connect_mempool(i, data => {
                    block_message_queues[i].put(data);
                });
            }
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
