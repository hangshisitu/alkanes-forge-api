import ReconnectingWebSocket from 'reconnecting-websocket';
import ElectrsAPI from '../lib/ElectrsApi.js';
import * as RedisHelper from '../lib/RedisHelper.js';
import MempoolTx from '../models/MempoolTx.js';
import axios from 'axios';
import config from "../conf/config.js";
import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";
import WebSocket from 'ws';

const message_key = 'mempool:message';
const txid_key = 'mempool:txid';
const new_block_callbacks = [];

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
    await RedisHelper.zrem(txid_key, txids);
    await MempoolTx.destroy({
        where: { txid: txids }
    });
}

async function remove_by_block_height(hash) {
    const blockTxids = await ElectrsAPI.getBlockTxids(hash);
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
            const status = await ElectrsAPI.getTxStatus(txid);
            if (!status) {
                ret_txids.push(txid);
            } else if (status.confirmed) {
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
    let offset = 0;
    const size = 100;
    let txids = [];
    while (true) {
        const txs = await MempoolTx.findAll({
            offset: offset,
            limit: size
        });
        if (txs.length === 0) {
            break;
        }
        const concurrent = process.env.NODE_ENV === 'pro' ? 16 : 1;
        const promises = [];
        for (let i = 0; i < concurrent; i++) {
            promises.push(detect_tx_status(txs));
        }
        const results = await Promise.all(promises);
        txids = results.flat();
        if (txids.length >= size) {
            await delete_mempool_txs(txids);
            txids = [];
        }
        offset += size;
    }
    await delete_mempool_txs(txids);
}

async function try_scan_mempool_tx() {
    try {
        await scan_mempool_tx();
    } catch (err) {
        console.error('scan mempool tx error', err);
        await DateUtil.sleep(3000);
        await try_scan_mempool_tx();
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

async function handle_mempool_tx() {
    while (true) {
        const results = await RedisHelper.zpopmin(txid_key);
        if (!results?.length) {
            await DateUtil.sleep(500);
            continue;
        }

        const txid = results[0].value;

        try {
            const hex = await ElectrsAPI.getTxHex(txid);
            if (!hex) {
                await MempoolTx.destroy({
                    where: { txid }
                });
                continue;
            }
            const tx = bitcoin.Transaction.fromHex(hex);
            if (!tx.outs.find(o => o.script.toString('hex').startsWith('6a5d'))) {
                continue;
            }
            const result = await parse_tx_hex(hex);
            if (result?.status !== 'success') {
                console.error(`parse tx [${txid}] error`, result);
                continue;
            }
            for (const protostone of result.protostones ?? []) {
                const message = protostone.message;
                if (!message) {
                    continue;
                }
                const mintData = decodeLEB128Array(JSON.parse(message));
                if (mintData.length < 3) {
                    continue;
                }
                console.log(`handle mempool tx: ${txid}, protostone message: ${JSON.stringify(mintData)}`);
                let address = null;
                let feeRate = null;
                const mempoolTxs = [];
                let i = 0;
                while (i < mintData.length) {
                    const code = mintData[i];
                    if (code === 2 && mintData[i + 2] === 77) {
                        if (!address) {
                            address = PsbtUtil.script2Address(tx.outs[0].script);
                        }
                        if (!feeRate) {
                            const electrsTx = await ElectrsAPI.getTx(txid);
                            if (!electrsTx) {
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
                        i ++;
                    }
                }
                if (mempoolTxs.length > 0) {
                    await MempoolTx.bulkCreate(mempoolTxs, {
                        ignoreDuplicates: true,
                    });
                }
            }
        } catch (e) {
            console.error(`handle mempool tx error: ${txid}`, e);
            continue;
        }
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

async function handle_mempool_message() {
    while (true) {
        try {
            let data = await RedisHelper.rpop(message_key);
            if (!data) {
                await DateUtil.sleep(500);
                continue;
            }
            const idx = data.indexOf(':');
            const ws_block = parseInt(data.substring(0, idx));
            data = JSON.parse(data.substring(idx + 1));
            if (ws_block === 0 && data.block) { // 出新块, 将已确认的从数据库中删除
                await handle_new_block(data.block);
                const txs = data['projected-block-transactions']?.blockTransactions;
                if (txs?.length) {
                    for (const tx of data['projected-block-transactions'].blockTransactions) {
                        await RedisHelper.zadd(txid_key, Date.now(), tx[0]);
                    }
                }
            }
            const delta = data['projected-block-transactions']?.delta;
            if (delta) {
                for (const tx of delta.added) {
                    await RedisHelper.zadd(txid_key, Date.now(), tx[0]);
                }
                for (const tx of delta.changed) {
                    await RedisHelper.zadd(txid_key, Date.now(), tx[0]);
                }
                for (const txid of delta.removed) {
                    await RedisHelper.zadd(txid_key, Date.now(), txid);
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
        rws.send(`{"action":"want","data":["blocks","mempool-blocks"]}`);
        rws.send(`{"track-rbf-summary":true}`);
        rws.send(`{"track-mempool-block":${block}}`);
    };
    rws.onmessage = (event) => {
        try {
            // console.log(`receive message: ${event.data}`);
            onmessage(`${block}:${event.data}`);
        } catch(e) {
            console.error(`handle ${event} error`, e);
        }
    };
    rws.onclose = () => {
        console.error('disconnect from mempool');
    };
    rws.reconnect();
    return rws;
}


export function start(monitor_new_block_only = false) {
    if (!monitor_new_block_only) {
        const concurrent = process.env.NODE_ENV === 'pro' ? 16 : 1;
        for (let i = 0; i < concurrent; i++) {
            handle_mempool_tx().catch(err => {
                console.error(`[${i}]handle mempool tx error`, err);
            });
        }
        handle_mempool_message().catch(err => {
            console.error('handle mempool message queue error', err);
        });
        const blocks = process.env.NODE_ENV === 'pro' ? 8 : 1
        try_scan_mempool_tx().finally(() => {
            for (let i = 0; i < blocks; i++) {
                connect_mempool(i, async data => {
                    await RedisHelper.lpush(message_key, data);
                });
            }
        });
        return;
    }
    connect_mempool(0, async data => {
        data = JSON.parse(data.substring(data.indexOf(':') + 1));
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



