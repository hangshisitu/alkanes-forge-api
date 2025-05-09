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
import IndexerService from '../service/IndexerService.js';
import NftItemService from '../service/NftItemService.js';
import NftCollectionService from '../service/NftCollectionService.js';
import NftCollectionStatsService from '../service/NftCollectionStatsService.js';

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
            logger.error(`isRefreshBlockConfig error: ${err.message}`);
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
            logger.error(`refreshTokenInfo error: ${err.message}`, err);
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
            logger.error(`refreshStatsForTimeRange error: ${err.message}`);
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
            logger.error(`refreshTokenStats error: ${err.message}`);
        } finally {
            isRefreshTokenStats = false;
        }
    });
}


let isRefreshPartialMergeMintOrder = false;
function refreshPartialMergeMintOrder() {
    MempoolIndex.onNewBlock(async block => {
        logger.info(`refreshPartialMergeMintOrder onNewBlock, block: ${block?.height}`);
        MintService.batchHandlePartialMergeOrder();
    });
    schedule.scheduleJob('*/10 * * * * *', async () => {
        if (isRefreshPartialMergeMintOrder) {
            return;
        }

        try {
            isRefreshPartialMergeMintOrder = true;
            const execStartTime = Date.now();
            
            logger.info(`refreshPartialMergeMintOrder start`);
            await MintService.batchHandlePartialMergeOrder();
            logger.info(`refreshPartialMergeMintOrder finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`refreshPartialMergeMintOrder error, error: ${err.message}`, err);
        } finally {
            isRefreshPartialMergeMintOrder = false;
        }
    });
}

let isRefreshMintingMergeMintOrder = false;
function refreshMintingMergeMintOrder() {
    MempoolIndex.onNewBlock(async block => {
        logger.info(`refreshMintingMergeMintOrder onNewBlock, block: ${block?.height}`);
        if (block?.id) {
            await MintService.updateMintItemByBlock(block.id);
        }
        MintService.batchHandleMintingMergeOrder();
    });
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshMintingMergeMintOrder) {
            return;
        }

        try {
            isRefreshMintingMergeMintOrder = true;
            const execStartTime = Date.now();
            logger.info(`refreshMintingMergeMintOrder start`);
            await MintService.batchHandleMintingMergeOrder();
            logger.info(`refreshMintingMergeMintOrder finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`refreshMintingMergeMintOrder error, error: ${err.message}`, err);
        } finally {
            isRefreshMintingMergeMintOrder = false;
        }
    });
}

let isIndexBlock = false;
function indexBlock() {
    schedule.scheduleJob('*/5 * * * * *', async () => {
        if (isIndexBlock) {
            return;
        }

        try {
            isIndexBlock = true;
            const execStartTime = Date.now();
            logger.info(`indexBlock start`);
            await IndexerService.indexBlock();
            logger.info(`indexBlock finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`indexBlock error, error: ${err.message}`, err);
        } finally {
            isIndexBlock = false;
        }
    });
}
let isIndexTx = false;
function indexTx() {
    schedule.scheduleJob('*/5 * * * * *', async () => {
        if (isIndexTx) {
            return;
        }

        try {
            isIndexTx = true;
            const execStartTime = Date.now();
            logger.info(`indexTx start`);
            await IndexerService.indexTx();
            logger.info(`indexTx finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`indexTx error, error: ${err.message}`, err);
        } finally {
            isIndexTx = false;
        }
    });
}

let isIndexNftItemHolder = false;
function indexNftItemHolder() {
    schedule.scheduleJob('*/10 * * * * *', async () => {
        if (isIndexNftItemHolder) {
            return;
        }

        try {
            isIndexNftItemHolder = true;
            const execStartTime = Date.now();
            logger.info(`indexNftItemHolder start`);
            const effectCollectionIds = await NftItemService.indexNftItemHolder();
            if (effectCollectionIds?.length > 0) {
                await NftCollectionService.refreshCollectionHolderAndItemCount(effectCollectionIds);
            }
            logger.info(`indexNftItemHolder finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`indexNftItemHolder error, error: ${err.message}`, err);
        } finally {
            isIndexNftItemHolder = false;
        }
    });
}

let isRefreshNftCollectionStats = false;
function refreshNftCollectionStats() {
    schedule.scheduleJob('*/10 * * * * *', async () => {
        if (isRefreshNftCollectionStats) {
            return;
        }

        try {
            isRefreshNftCollectionStats = true;
            const execStartTime = Date.now();
            logger.info(`refreshNftCollectionStats start`);
            await NftCollectionService.refreshNftCollectionStats();
            logger.info(`refreshNftCollectionStats finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`refreshNftCollectionStats error, error: ${err.message}`, err);
        } finally {
            isRefreshNftCollectionStats = false;
        }
    });
}

let isRefreshNftCollectionStatsForTimeRange = false;
function refreshNftCollectionStatsForTimeRange() {
    schedule.scheduleJob('*/10 * * * * *', async () => {
        if (isRefreshNftCollectionStatsForTimeRange) {
            return;
        }

        try {
            isRefreshNftCollectionStatsForTimeRange = true;
            const execStartTime = Date.now();

            const now = new Date();
            const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 1);
            const startTime = new Date(lastHour);
            startTime.setMinutes(0, 0, 0); // 上一个小时的开始
            const endTime = new Date(lastHour);
            endTime.setMinutes(59, 59, 999); // 上一个小时的结束

            logger.info(`refreshNftCollectionStatsForTimeRange start, startTime: ${DateUtil.formatDate(startTime)}, endTime: ${DateUtil.formatDate(endTime)}`);
            await NftCollectionStatsService.refreshNftCollectionStatsForTimeRange(startTime, endTime);
            logger.info(`refreshNftCollectionStatsForTimeRange finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            logger.error(`refreshNftCollectionStatsForTimeRange error, error: ${err.message}`, err);
        } finally {
            isRefreshNftCollectionStatsForTimeRange = false;
        }
    });
}


export function jobs() {
    refreshBlockHeight();
    refreshTokenInfo();
    refreshStatsForTimeRange();
    refreshTokenStats();
    refreshNftCollectionStatsForTimeRange();
    refreshNftCollectionStats();
    indexNftItemHolder();
}

export function jobMintStatus() {
    refreshPartialMergeMintOrder();
    refreshMintingMergeMintOrder();
    // 最后启动内存池监控
    MempoolIndex.start(true);
}

export function jobIndexer() {
    indexBlock();
    indexTx();
}
