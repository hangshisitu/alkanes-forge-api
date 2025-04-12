import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";

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

    static async getBalance(address) {
        const balanceInfo = await UnisatAPI.getBalance(address);
        return {
            confirmed: balanceInfo.btcSatoshi,
            pending: balanceInfo.btcPendingSatoshi,
            total: balanceInfo.btcSatoshi + balanceInfo.btcPendingSatoshi,
        }
    }

    static async getBalanceByMempool(address) {
        const balanceInfo = await MempoolUtil.getAddress(address);
        return {
            confirmed: balanceInfo.chain_stats.funded_txo_sum,
            pending: balanceInfo.mempool_stats.funded_txo_sum,
            total: balanceInfo.chain_stats.funded_txo_sum + balanceInfo.mempool_stats.funded_txo_sum,
        }
    }
}