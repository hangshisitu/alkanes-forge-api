import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";
import BaseService from "./BaseService.js";

export default class MempoolService {
    
    static async getMempoolData(alkanesId) {
        const config = await BaseService.getConfig();
        const mempool = JSON.parse(await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX + alkanesId)) || {};
        mempool.config = config;
        return mempool;
    }

}