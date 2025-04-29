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
import * as logger from '../conf/logger.js';

let isRefreshBlockConfig = false;
function refreshBlockHeight() {
    schedule.scheduleJob('*/10 * * * * *', async () => {
        if (isRefreshBlockConfig) {
            return;
        }

        try {
            isRefreshBlockConfig = true;
            const startTime = Date.now();
            logger.info(`isRefreshBlockConfig start ...`);

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

            logger.info(`isRefreshBlockConfig finish. mempoolHeight: ${mempoolHeight}, indexHeight: ${indexHeight} btcPrice: ${btcPrice} fees: ${JSON.stringify(fees)} cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            logger.error('isRefreshBlockConfig error:', err.message);
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

            logger.info(`refreshTokenInfo start, update height: ${updateHeight} index height: ${indexHeight}`);
            const allTokens = await TokenInfoService.refreshTokenInfo(indexHeight);
            logger.info(`refreshTokenInfo finish. total tokens: ${allTokens}, cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            logger.error('refreshTokenInfo error:', err.message);
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

            logger.info(`refreshStatsForTimeRange start, startTime: ${DateUtil.formatDate(startTime)}, endTime: ${DateUtil.formatDate(endTime)}`);
            await TokenStatsService.refreshStatsForTimeRange(startTime, endTime);
            logger.info(`refreshStatsForTimeRange finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error('refreshStatsForTimeRange error:', err.message);
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

            logger.info(`refreshTokenStats start`);
            await TokenInfoService.refreshTokenStats();
            logger.info(`refreshTokenStats finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error('refreshTokenStats error:', err.message);
        } finally {
            isRefreshTokenStats = false;
        }
    });
}

let isRefreshMergeMintOrder = false;
function refreshMergeMintOrder(mintStatus) {
    MempoolIndex.onNewBlock(async block => {
        logger.info(`refreshMergeMintOrder onNewBlock, block: ${block?.height}, mintStatus: ${mintStatus}`);
        if (block?.id && mintStatus === Constants.MINT_ORDER_STATUS.MINTING) {
            await MintService.updateMintItemByBlock(block.id);
        }
        MintService.batchHandleMergeOrder(mintStatus);
    });
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshMergeMintOrder) {
            return;
        }

        try {
            isRefreshMergeMintOrder = true;
            const execStartTime = Date.now();
            
            logger.info(`refreshMergeMintOrder start, mintStatus: ${mintStatus}`);
            await MintService.batchHandleMergeOrder(mintStatus);
            logger.info(`refreshMergeMintOrder finish, mintStatus: ${mintStatus}, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`refreshMergeMintOrder error, mintStatus: ${mintStatus}`, err);
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
}

export function jobMintStatus() {
    refreshMergeMintOrder(Constants.MINT_ORDER_STATUS.PARTIAL);
    refreshMergeMintOrder(Constants.MINT_ORDER_STATUS.MINTING);
    // 最后启动内存池监控
    MempoolIndex.start(true);
}
