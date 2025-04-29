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

    static async getMempoolDataByKey(key) {
        return JSON.parse(await RedisHelper.get(key)) || DEFAULT_MEMPOOL_DATA;
    }
    
    static async getMempoolData(alkanesId) {
        return await MempoolService.getMempoolDataByKey(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX + alkanesId);
    }

}