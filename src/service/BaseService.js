import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import config from "../conf/config.js";

export default class BaseService {

    static async getConfig() {
        const mempoolHeight = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT);
        const indexHeight = await RedisHelper.get(Constants.REDIS_KEY.INDEX_BLOCK_HEIGHT);
        const btcPrice = await RedisHelper.get(Constants.REDIS_KEY.BTC_PRICE_USD);
        const fees = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_FEES_RECOMMENDED);
        const mempoolBlocks = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_FEES_MEMPOOL_BLOCKS);
        const block = mempoolBlocks ? JSON.parse(mempoolBlocks)[0] : null;
        return {
            mempoolHeight,
            indexHeight,
            btcPrice,
            fees: JSON.parse(fees),
            blockFee: {
                medianFee: block?.medianFee,
                feeRange: block?.feeRange,
            },
            market: {
                takerFee: config.market.takerFee,
                makerFee: config.market.makerFee,
            }
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
        const balance =  {
            confirmed: balanceInfo.chain_stats.funded_txo_sum - balanceInfo.chain_stats.spent_txo_sum,
            pending: balanceInfo.mempool_stats.funded_txo_sum - balanceInfo.mempool_stats.spent_txo_sum
        }
        balance.total = balance.confirmed + balance.pending;
        return balance;
    }
}