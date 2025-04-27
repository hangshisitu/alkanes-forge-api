import ReconnectingWebSocket from 'reconnecting-websocket';
import MempoolTx from '../models/MempoolTx.js';
import axios from 'axios';
import config from "../conf/config.js";
import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import MempoolUtil from '../utils/MempoolUtil.js';
import WebSocket from 'ws';
import {Op} from "sequelize";
import {Queue} from "../utils/index.js";

const new_block_callbacks = [];
const concurrent = process.env.NODE_ENV === 'pro' ? 16 : 1;
const blocks = process.env.NODE_ENV === 'pro' ? 8 : 1
const block_message_queues = {};
for (let i = 0; i < blocks; i++) {
    block_message_queues[i] = new Queue();
}

class DateUtil {
    static now() {
        const now = new Date();

        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    static diffMinutes(storedTimeString) {
        const storedTime = new Date(storedTimeString);
        const currentTime = new Date();
        const timeDifference = currentTime - storedTime;
        return timeDifference / (1000 * 60);
    }

    static async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

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
    await MempoolTx.destroy({
        where: { txid: txids }
    });
    console.log(`delete mempool txs: ${JSON.stringify(txids)}`);
}

async function remove_by_block_height(hash) {
    const blockTxids = await MempoolUtil.getBlockTxIds(hash);
    if (!blockTxids?.length) {
        return;
    }
    for (let i = 0; i < blockTxids.length; i += 100) {
        const txids = blockTxids.slice(i, i + 100);
        await delete_mempool_txs(txids);
    }
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
            console.error(`detect tx status error: ${txid}`, e);
            await DateUtil.sleep(3000);
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
        console.error('scan mempool tx error', err);
    }
}

async function parse_tx_hex(hex) {
    try {
        const response = await axios.post(`${config.api.protoruneParseEndpoint}/decode`, hex);
        return response.data;
    } catch (error) {
        console.error(`parse tx hex error`, error);
    }
}

async function handle_mempool_txs(txids) {
    const promises = [];
    for (let i = 0; i < concurrent; i++) {
        promises.push((async () => {
            while (true) {
                const txid = txids.shift();
                if (!txid) {
                    break;
                }
                try {
                    await handle_mempool_tx(txid);
                } catch (e) {
                    console.error(`handle mempool tx error: ${txid}`, e);
                }
            }
        })());
    }
    await Promise.all(promises);
}

async function handle_mempool_tx(txid) {
    const hex = await MempoolUtil.getTxHexEx(txid);
    if (!hex) {
        console.error(`no hex found: ${txid}, delete from db`);
        await MempoolTx.destroy({
            where: { txid }
        });
        return;
    }
    const tx = bitcoin.Transaction.fromHex(hex);
    if (!tx.outs.find(o => o.script.toString('hex').startsWith('6a5d'))) {
        return;
    }
    const result = await parse_tx_hex(hex);
    if (result?.status !== 'success') {
        console.error(`parse tx [${txid}] error`, result);
        return;
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
        console.log(`handle mempool tx: ${txid}, protostone message: ${JSON.stringify(mintData)}`);
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
    }
}

function safe_call(callback, ...args) {
    try {
        callback(...args);
    } catch (e) {
        console.error(`safe call error`, e);
    }
}

async function handle_new_block(block, handle_db = true) {
    for (const callback of new_block_callbacks) {
        safe_call(callback, block);
    }
    if (handle_db) {
        await remove_by_block_height(block.id);
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

async function handle_mempool_message(block_index) {
    const queue = block_message_queues[block_index];
    while (true) {
        try {
            let data = await queue.get();
            if (!data) {
                await DateUtil.sleep(500);
                continue;
            }
            data = JSON.parse(data);
            if (block_index === 0 && data.block) { // 出新块, 将已确认的从数据库中删除
                await handle_new_block(data.block);
            }
            const delta = data['projected-block-transactions']?.delta;
            if (delta) {
                // 跟踪了rbf, 不需要处理removed的交易
                // if (delta.removed?.length) {
                //     await handle_removed_txs(delta.removed);
                // }
                if (delta.changed?.length) {
                    delta.changed.forEach(async item => {
                        const txid = item[0];
                        const feeRate = item[1];
                        await MempoolTx.update({
                            feeRate
                        }, {
                            where: { 
                                txid,
                                feeRate: {
                                    [Op.lt]: feeRate
                                }
                            }
                        });
                    });
                }
                if (delta.added?.length) {
                    await handle_mempool_txs(delta.added.map(item => item[0]));
                }
            }
            const rbfLatest = data.rbfLatest;
            if (rbfLatest?.length) {
                const txids = [];
                rbfLatest.forEach(item => {
                    flat_rbf_latest(item.replaces, txids);
                });
                if (txids.length) {
                    await delete_mempool_txs(txids);
                    console.log(`handle rbf latest txs: ${txids.length}`);
                }
            }
        } catch (e) {
            console.error('parse mempool message occur error', e);
            await DateUtil.sleep(3000);
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
        console.log(`connect mempool block: ${block}, connect_count: ${connect_count}`);
        rws.send(`{"action":"init"}`);
        rws.send(`{"track-mempool-block":${block}}`);
        rws.send(`{"action":"want","data":["blocks","mempool-blocks"]}`);
        if (block === 0 && !monitor_new_block_only) {
            rws.send(`{"track-rbf":"all"}`);
        }
    };
    rws.onmessage = (event) => {
        try {
            // console.log(`receive message: ${event.data}`);
            onmessage(event.data);
        } catch(e) {
            console.error(`handle ${event} error`, e);
        }
    };
    rws.onerror = (event) => {
        console.error(`handle ws error`, event);
    };
    rws.onclose = () => {
        console.error('disconnect from mempool');
    };
    rws.reconnect();
    return rws;
}


export function start(monitor_new_block_only = false) {
    if (!monitor_new_block_only) {
        try_scan_mempool_tx().finally(() => {
            for (let i = 0; i < blocks; i++) {
                handle_mempool_message(i).catch(err => {
                    console.error('handle mempool message queue error', err);
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

// start();


// const hex = await ElectrsAPI.getTxHex('12e2dd1714b79b9e9f0a812f1615b0d9ddab1c90ec817cc357691e5461553fd3');
// console.log(await parse_tx_hex(hex));
// console.log(111,hex);
// const tx = bitcoin.Transaction.fromHex(hex);
// const output = tx.outs[0];
// // const scriptType = bitcoin.script.classifyOutput(output.script);
// // console.log(scriptType);
// console.log(PsbtUtil.script2Address(output.script));

// console.log(decodeLEB128Array([2,234,3,77,0,0,0,0,0,0,0,0,0,0,0]));

// await scan_mempool_tx();