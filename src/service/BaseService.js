import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";

export default class BaseService {

    static async getIndexHeight() {
        return await RedisHelper.get(Constants.REDIS_KEY.INDEX_BLOCK_HEIGHT);
    }

    static async getConfig() {
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        const indexHeight = await RedisHelper.get(Constants.REDIS_KEY.INDEX_BLOCK_HEIGHT);
        const btcPrice = await RedisHelper.get(Constants.REDIS_KEY.BTC_PRICE_USD);
        const fees = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_FEES_RECOMMENDED);
        return {
            mempoolHeight,
            indexHeight,
            btcPrice,
            fees: JSON.parse(fees)
        }
    }
}