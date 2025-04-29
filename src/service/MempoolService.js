import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";

const DEFAULT_MEMPOOL_DATA = {
    count: 0,
    addressCount: 0,
    nextBlockCount: 0,
    feeRateRanges: [],
    medianFeeRate: 0,
};

export default class MempoolService {

    static async getMempoolData(alkanesId) {
        return JSON.parse(await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX + alkanesId)) || DEFAULT_MEMPOOL_DATA;
    }

}