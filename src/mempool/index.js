import ReconnectingWebSocket from 'reconnecting-websocket';
import ElectrsAPI from '../lib/ElectrsApi.js';
import * as RedisHelper from '../lib/RedisHelper.js';
import MempoolTx from '../models/MempoolTx.js';
import axios from 'axios';
import config from "../conf/config.js";
import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "../utils/PsbtUtil.js";

const message_key = 'mempool:message';
const txid_key = 'mempool:txid';
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
    for (let i = 0; i < blockTxids.length; i += 100) {
        const txids = blockTxids.slice(i, i + 100);
        await delete_mempool_txs(txids);
    }
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
        for (const mempoolTx of txs) {
            const txid = mempoolTx.txid;
            const status = await ElectrsAPI.getTxStatus(txid);
            if (!status) {
                txids.push(txid);
            } else if (status.confirmed) {
                txids.push(txid);
            }
            if (txids.length >= size) {
                await delete_mempool_txs(txids);
                txids = [];
            }
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
        const response = await axios.post(`${config.protoruneParseEndpoint}/decode`, hex);
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
                continue;
            }
            const tx = bitcoin.Transaction.fromHex(hex);
            if (!tx.outs.find(o => o.script.toString('hex').startsWith('6a5d'))) {
                continue;
            }
            const result = await parse_tx_hex(hex);
            console.log(`handle mempool tx: ${txid}, opreturn result: ${JSON.stringify(result)}`);
            if (result?.status !== 'success') {
                console.error(`parse tx [${txid}] error`, result);
                continue;
            }
            for (const protostone of result.protostones ?? []) {
                let message = protostone.message;
                if (!message) {
                    continue;
                }
                message = JSON.parse(message);
                let address = null;
                const mempoolTxs = [];
                let i = 0;
                while (i < message.length) {
                    const code = message[i];
                    if (code === 2 && message[i + 2] === 77) {
                        if (!address) {
                            address = PsbtUtil.script2Address(tx.outs[0].script);
                        }
                        mempoolTxs.push({
                            txid,
                            alkanesId: `2:${message[i + 1]}`,
                            op: 'mint',
                            address,
                            feeRate: Math.round(tx.fee / (tx.weight / 4) * 100) / 100,
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

async function handle_mempool_message() {
    while (true) {
        try {
            let data = await RedisHelper.rpop(message_key);
            if (!data) {
                await DateUtil.sleep(500);
                continue;
            }
            data = JSON.parse(data);
            if (data.block) { // 出新块, 将已确认的从数据库中删除
                await remove_by_block_height(data.block.id);
                for (const tx of data['projected-block-transactions'].blockTransactions) {
                    await RedisHelper.zadd(txid_key, Date.now(), tx[0]);
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

function connect_mempool(onmessage) {
    const rws = new ReconnectingWebSocket('wss://mempool.space/api/v1/ws', undefined, {
        WebSocket,
        startClosed: true
    });
    rws.onopen = () => {
        try_scan_mempool_tx();        
        console.log('Connected');
        rws.send(`{"action":"init"}`);
        rws.send(`{"action":"want","data":["blocks","mempool-blocks"]}`);
        rws.send(`{"track-rbf-summary":true}`);
        rws.send(`{"track-mempool-block":0}`);
    };
    rws.onmessage = (event) => {
        try {
            // console.log(`receive message: ${event.data}`);
            onmessage(event.data);
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


async function main() {
    const concurrent = process.env.NODE_ENV === 'pro' ? 16 : 1;
    for (let i = 0; i < concurrent; i++) {
        handle_mempool_tx().catch(err => {
            console.error(`[${i}]handle mempool tx error`, err);
        });
    }
    handle_mempool_message().catch(err => {
        console.error('handle mempool message queue error', err);
    });
    connect_mempool(async data => {
        await RedisHelper.lpush(message_key, data);
    });
}

// main().catch(err => {
//     console.error('process error', err);
// });


const hex = await ElectrsAPI.getTxHex('a6048373e61433200a51cb257d7697f5f6e3ca4a34ae12d70ea064cb9213a8c3');

const tx = bitcoin.Transaction.fromHex(hex);
const output = tx.outs[0];
// const scriptType = bitcoin.script.classifyOutput(output.script);
// console.log(scriptType);
console.log(PsbtUtil.script2Address(output.script));






