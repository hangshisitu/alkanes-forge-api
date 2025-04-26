import schedule from 'node-schedule';
import * as RedisHelper from "../lib/RedisHelper.js";
import config from "../conf/config.js";
import AlkanesService from "../service/AlkanesService.js";
import BaseUtil from "../utils/BaseUtil.js";
import DateUtil from "../utils/DateUtil.js";
import TokenStatsService from "../service/TokenStatsService.js";
import {Constants} from "../conf/constants.js";
import TokenInfoService from "../service/TokenInfoService.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import * as MempoolIndex from "../mempool/index.js";
import MintService from "../service/MintService.js";

let isRefreshBlockConfig = false;
function refreshBlockHeight() {
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshBlockConfig) {
            return;
        }

        try {
            isRefreshBlockConfig = true;
            const startTime = Date.now();
            console.log(`isRefreshBlockConfig start ...`);

            const mempoolHeight = await MempoolUtil.getBlocksTipHeight();
            await RedisHelper.set(Constants.REDIS_KEY.MEMPOOL_BLOCK_HEIGHT, mempoolHeight);

            const indexHeight = await BaseUtil.retryRequest(
                () => AlkanesService.metashrewHeight(config.alkanesUrl),
                3, 500
            );
            await RedisHelper.set(Constants.REDIS_KEY.INDEX_BLOCK_HEIGHT, indexHeight);

            const fees = await MempoolUtil.getFeesRecommended();
            await RedisHelper.set(Constants.REDIS_KEY.MEMPOOL_FEES_RECOMMENDED, JSON.stringify(fees));

            const blocks = await MempoolUtil.getFeesMempoolBlocks();
            await RedisHelper.set(Constants.REDIS_KEY.MEMPOOL_FEES_MEMPOOL_BLOCKS, JSON.stringify(blocks));

            const btcPrice = await MempoolUtil.getBtcPrice();
            await RedisHelper.set(Constants.REDIS_KEY.BTC_PRICE_USD, btcPrice);

            console.log(`isRefreshBlockConfig finish. mempoolHeight: ${mempoolHeight}, indexHeight: ${indexHeight} btcPrice: ${btcPrice} fees: ${JSON.stringify(fees)} cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            console.error('isRefreshBlockConfig error:', err.message);
        } finally {
            isRefreshBlockConfig = false;
        }
    });
}

let isRefreshTokenInfo = false;
function refreshTokenInfo() {
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshTokenInfo) {
            return;
        }

        try {
            isRefreshTokenInfo = true;
            const startTime = Date.now();

            const updateHeight = await RedisHelper.get(Constants.REDIS_KEY.TOKEN_INFO_UPDATED_HEIGHT);
            const indexHeight = await RedisHelper.get(Constants.REDIS_KEY.INDEX_BLOCK_HEIGHT);

            if (updateHeight && parseInt(updateHeight) === parseInt(indexHeight)) {
                return;
            }

            console.log(`refreshTokenInfo start, update height: ${updateHeight} index height: ${indexHeight}`);
            const allTokens = await TokenInfoService.refreshTokenInfo(indexHeight);
            console.log(`refreshTokenInfo finish. total tokens: ${allTokens}, cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            console.error('refreshTokenInfo error:', err.message);
        } finally {
            isRefreshTokenInfo = false;
        }
    });
}


let isRefreshStatsForTimeRange = false;
function refreshStatsForTimeRange() {
    schedule.scheduleJob('0 * * * *', async () => {
        if (isRefreshStatsForTimeRange) {
            return;
        }

        try {
            isRefreshStatsForTimeRange = true;
            const execStartTime = Date.now();

            const now = new Date();
            const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 1);
            const startTime = new Date(lastHour);
            startTime.setMinutes(0, 0, 0); // 上一个小时的开始
            const endTime = new Date(lastHour);
            endTime.setMinutes(59, 59, 999); // 上一个小时的结束

            console.log(`refreshStatsForTimeRange start, startTime: ${DateUtil.formatDate(startTime)}, endTime: ${DateUtil.formatDate(endTime)}`);
            await TokenStatsService.refreshStatsForTimeRange(startTime, endTime);
            console.log(`refreshStatsForTimeRange finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            console.error('refreshStatsForTimeRange error:', err.message);
        } finally {
            isRefreshStatsForTimeRange = false;
        }
    });
}


let isRefreshTokenStats = false;
function refreshTokenStats() {
    schedule.scheduleJob(' */3 * * * *', async () => {
        if (isRefreshTokenStats) {
            return;
        }

        try {
            isRefreshTokenStats = true;
            const execStartTime = Date.now();

            console.log(`refreshTokenStats start`);
            await TokenInfoService.refreshTokenStats();
            console.log(`refreshTokenStats finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            console.error('refreshTokenStats error:', err.message);
        } finally {
            isRefreshTokenStats = false;
        }
    });
}

let isRefreshMergeMintOrder = false;
function refreshMergeMintOrder() {
    MempoolIndex.onNewBlock(() => {
        MintService.batchHandleMergeOrder();
    });
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshMergeMintOrder) {
            return;
        }

        try {
            isRefreshMergeMintOrder = true;
            const execStartTime = Date.now();
            
            console.log(`refreshMergeMintOrder start`);
            await MintService.batchHandleMergeOrder();
            console.log(`refreshMergeMintOrder finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            console.error('refreshMergeMintOrder error', err);
        } finally {
            isRefreshMergeMintOrder = false;
        }
    });
}

export function jobs() {
    refreshBlockHeight();
    refreshTokenInfo();
    refreshStatsForTimeRange();
    refreshTokenStats();
    refreshMergeMintOrder();
    // 最后启动内存池监控
    MempoolIndex.start(true);
}
