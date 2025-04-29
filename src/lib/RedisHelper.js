import {createClient} from 'redis';
import config from "../conf/config.js";
import * as logger from '../conf/logger.js';

const redisClient = await createClient({url: config.redisUrl})
    .on('error', err => logger.error(`Create Redis Client Error ${config.redisUrl}`, err))
    .connect();
const KEY_PREFIX = 'alkanes-api-' + (process.env.NODE_ENV || 'dev') + ':';

export async function del(key, genKey = true) {
    if (Array.isArray(key)) {
        if (key.length === 0) {
            return 0;
        }
        return await redisClient.del(key.map(k => genKey ? genKey(k) : k));
    }
    return await redisClient.del(genKey ? genKey(key) : key);
}

export async function get(key) {
    return await redisClient.get(genKey(key));
}

export async function set(key, value) {
    return await redisClient.set(genKey(key), value);
}

export async function setEx(key, ttl, value) {
    return await redisClient.setEx(genKey(key), ttl, value);
}

export async function expire(key, ttl) {
    return await redisClient.expire(key, ttl);
}

export function genKey(key) {
    return KEY_PREFIX + key;
}

export async function scan(pattern, count = 1000, del_key = false) {
    // 遍历所有符合pattern的key, 如果del_key为true, 则删除每个key, 一直遍历到游标为0为止
    let cursor = 0;
    const ret_keys = [];
    const match = genKey(pattern);
    do {
        const result = await redisClient.scan(cursor, {MATCH: match, COUNT: count});
        cursor = result.cursor;
        const keys = result.keys;
        if (keys?.length > 0) {
            ret_keys.push(...keys);
            if (del_key) {
                logger.info(`Deleting keys: ${keys}`);
                await redisClient.del(keys);
            }
        }
    } while (cursor !== 0);
    return ret_keys;
}

export async function lpush(key, value) {
    return await redisClient.lPush(genKey(key), value);
}

export async function rpop(key) {
    return await redisClient.rPop(genKey(key));
}

export async function zadd(key, score, value) {
    return await redisClient.zAdd(genKey(key), {score, value});
}

export async function zrange(key, start, end) {
    return await redisClient.zRange(genKey(key), start, end);
}

export async function zpopmin(key, count = 1) {
    return await redisClient.zPopMinCount(genKey(key), count);
}

export async function zrem(key, value) {
    return await redisClient.zRem(genKey(key), value);
}

export default redisClient;