import redisClient from './RedisHelper.js';
import BaseUtil from "../utils/BaseUtil.js";
import * as logger from '../conf/logger.js';

class RedisLock {
    constructor(key, ttl = 30) {
        this.key = key;
        this.ttl = ttl;
        this.value = BaseUtil.genId();
        this.renewalTimer = null;
    }

    /**
     * 获取锁
     * @returns {Promise<boolean>} 是否成功获取锁
     */
    async lock() {
        const result = await redisClient.set(
            this.key,
            this.value,
            {
                PX: this.ttl * 1000, // 转换为毫秒
                NX: true // 只在键不存在时设置
            }
        );
        return result === 'OK';
    }

    /**
     * 释放锁
     * @returns {Promise<boolean>} 是否成功释放锁
     */
    async unlock() {
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        const result = await redisClient.eval(script, {
            keys: [this.key],
            arguments: [this.value]
        });
        return result === 1;
    }

    /**
     * 续期锁
     * @returns {Promise<boolean>} 是否成功续期
     */
    async renew() {
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
            else
                return 0
            end
        `;
        const result = await redisClient.eval(script, {
            keys: [this.key],
            arguments: [this.value, String(this.ttl * 1000)]
        });
        return result === 1;
    }

    /**
     * 启动自动续期
     * @param {number} interval 续期间隔（秒），默认为 TTL 的 1/3
     */
    startRenewal(interval = this.ttl / 3) {
        if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
        }

        this.renewalTimer = setInterval(async () => {
            try {
                const renewed = await this.renew();
                if (!renewed) {
                    logger.warn(`Lock renewal failed for key: ${this.key}`);
                    this.stopRenewal();
                } else {
                    logger.info(`Lock renewed for key: ${this.key}`);
                }
            } catch (error) {
                logger.error(`Error renewing lock: ${error.message}`, error);
                this.stopRenewal();
            }
        }, interval * 1000);
    }

    /**
     * 停止自动续期
     */
    stopRenewal() {
        if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
            this.renewalTimer = null;
        }
    }
}

/**
 * 使用分布式锁的包装函数
 * @param {string} key 锁的键
 * @param {Function} fn 要执行的异步函数
 * @param {Object} options 选项
 * @param {number} options.ttl 锁的过期时间（秒）
 * @param {number} options.retryTimes 重试次数
 * @param {number} options.retryDelay 重试延迟（毫秒）
 * @returns {Promise<any>} 函数执行结果
 */
export async function withLock(key, fn, options = {}) {
    const {
        ttl = 30,
        retryTimes = 3,
        retryDelay = 1000,
        throwErrorIfFailed = true
    } = options;

    const lock = new RedisLock(key, ttl);
    let acquired = false;

    try {
        // 尝试获取锁
        for (let i = 0; i < retryTimes; i++) {
            acquired = await lock.lock();
            if (acquired) break;
            if (i < retryTimes - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        if (!acquired) {
            if (throwErrorIfFailed) {
                throw new Error(`Failed to acquire lock for key: ${key}`);
            }
            return [false, null];
        }

        // 启动自动续期
        lock.startRenewal();

        // 执行函数
        return [true, await fn()];
    } finally {
        // 停止续期并释放锁
        lock.stopRenewal();
        if (acquired) {
            await lock.unlock();
        }
    }
}
