import {customAlphabet} from "nanoid";

export default class BaseUtil {

    static async retryRequest(requestFn, maxRetries = 3, delayMs = 1000) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
                }
            }
        }
        throw lastError;
    }

    static splitArray(array, size) {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
            const chunk = array.slice(i, i + size);
            result.push(chunk);
        }
        return result;
    }

    static splitByBatchSize(total, batchSize) {
        const result = [];
        let remaining = total;

        while (remaining > 0) {
            const group = Math.min(batchSize, remaining);
            result.push(group);
            remaining -= group;
        }

        return result;
    }

    static divCeil(a, b, decimal = 2) {
        const factor = Math.pow(10, decimal);
        const result = a / b;
        // 先放大，向上取整，再缩小
        return Math.ceil(result * factor) / factor;
    }

    static genId(size = 24) {
        const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const alphanum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const firstChar = customAlphabet(letters, 1)();          // 首位只用字母
        const rest = customAlphabet(alphanum, size - 1)();        // 剩余可以含数字
        return firstChar + rest;
    }

    static async concurrentExecute(collection, handler, concurrency = process.env.NODE_ENV === 'pro' ? 16 : 4, errors = null) {
        if (!concurrency || concurrency <= 0) {
            concurrency = process.env.NODE_ENV === 'pro' ? 16 : 4;
        }
        async function execute() {
            const results = [];
            while (true) {
                if (errors?.length > 0) {
                    break;
                }
                const element = collection.shift();
                if (!element) {
                    break;
                }
                try {
                    results.push(await handler(element));
                } catch (error) {
                    errors?.push([error, element]);
                    if (errors) {
                        break;
                    }
                }
            }
            return results;
        }

        const promises = [];

        for (let i = 0; i < concurrency; i ++) {
            promises.push(execute());
        }

        const results = await Promise.all(promises);
        return results.flat();
    }

    static async concurrentExecuteQueue(queue, handler, concurrency = process.env.NODE_ENV === 'pro' ? 16 : 4) {
        
        async function execute() {
            while (true) {
                const element = await queue.get();
                if (!element) {
                    continue;
                }
                await handler(element);
            }
        }
        
        const promises = [];
        for (let i = 0; i < concurrency; i ++) {
            promises.push(execute());
        }
        await Promise.all(promises);
    }
    

}