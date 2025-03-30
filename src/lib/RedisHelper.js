import {createClient} from 'redis';
import config from "../conf/config.js";

const redisClient = await createClient({url: config.redisUrl})
    .on('error', err => console.error(`Create Redis Client Error ${config.redisUrl}`, err))
    .connect();
const KEY_PREFIX = 'alkanes-api-' + (process.env.NODE_ENV || 'dev') + ':';

export async function get(key) {
    return await redisClient.get(genKey(key));
}

export async function set(key, value) {
    return await redisClient.set(genKey(key), value);
}

export async function setEx(key, ttl, value) {
    return await redisClient.setEx(genKey(key), ttl, value);
}

function genKey(key) {
    return KEY_PREFIX + key;
}

