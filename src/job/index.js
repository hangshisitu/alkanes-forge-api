import schedule from 'node-schedule';
import * as RedisHelper from "../lib/RedisHelper.js";
import config from "../conf/config.js";
import AlkanesService from "../service/AlkanesService.js";
import BaseUtil from "../utils/BaseUtil.js";
import DateUtil from "../utils/DateUtil.js";
import TokenStatsService from "../service/TokenStatsService.js";
import {Constants} from "../conf/constants.js";


let isRefreshTokenInfo = false;
function refreshTokenInfo() {
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshTokenInfo) {
            return;
        }

        try {
            isRefreshTokenInfo = true;
            const startTime = Date.now();

            // 获取区块链高度并检查是否需要更新
            const updateHeight = await RedisHelper.get(Constants.REDIS_KEY.TOKEN_INFO_UPDATED_HEIGHT);
            const blockHeight = await BaseUtil.retryRequest(
                () => AlkanesService.metashrewHeight(config.alkanesUrl),
                3, 500
            );

            if (!blockHeight) {
                console.log('failed to get block height');
                return;
            }

            if (updateHeight && parseInt(updateHeight) === blockHeight) {
                return;
            }

            console.log(`refresh token info start, update height: ${updateHeight} block height: ${blockHeight}`);
            const allTokens = await AlkanesService.refreshTokenInfo(blockHeight);
            console.log(`refresh token info finish. total tokens: ${allTokens}, cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            console.error('refresh token info error:', err);
        } finally {
            isRefreshTokenInfo = false;
        }
    });
}


let isRefreshTokenStats = false;
function refreshTokenStats() {
    schedule.scheduleJob('0 * * * *', async () => {
        if (isRefreshTokenStats) {
            return;
        }

        try {
            isRefreshTokenStats = true;
            const execStartTime = Date.now();

            const now = new Date();
            const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 1);
            const startTime = new Date(lastHour);
            startTime.setMinutes(0, 0, 0); // 上一个小时的开始
            const endTime = new Date(lastHour);
            endTime.setMinutes(59, 59, 999); // 上一个小时的结束

            console.log(`refresh token stats start, startTime: ${DateUtil.formatDate(startTime)}, endTime: ${DateUtil.formatDate(endTime)}`);
            await TokenStatsService.refreshStatsForTimeRange(startTime, endTime);
            console.log(`refresh token stats finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            console.error('refresh token stats error:', err);
        } finally {
            isRefreshTokenStats = false;
        }
    });
}


let isRefreshTokenPriceChange = false;
function refreshTokenPriceChange() {
    // */5 * * * *
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshTokenPriceChange) {
            return;
        }

        try {
            isRefreshTokenPriceChange = true;
            const execStartTime = Date.now();

            console.log(`refresh token price change start`);
            await TokenStatsService.refreshPriceChanges();
            console.log(`refresh token price change finish, cost ${Date.now() - execStartTime}ms.`);
        } catch (err) {
            console.error('refresh token price chang error:', err);
        } finally {
            isRefreshTokenPriceChange = false;
        }
    });
}

/**
 * 脚本：刷新某段时间的历史统计数据
 */
async function refreshHistoricalStats(startDate, endDate) {
    // 确保传入的时间格式是有效的 Date 对象
    startDate = new Date(startDate); // 转换为 Date 对象
    endDate = new Date(endDate); // 转换为 Date 对象

    // 确保所有输入时间都以 UTC 时间计算
    let currentTime = new Date(Date.UTC(
        startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(),
        startDate.getUTCHours(), 0, 0, 0
    ));
    const endTime = new Date(Date.UTC(
        endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(),
        endDate.getUTCHours(), 0, 0, 0
    ));

    const tasks = []; // 存储所有批次的处理任务
    while (currentTime < endTime) {
        const startTime = new Date(currentTime); // 当前小时的开始时间
        const nextHour = new Date(currentTime);
        nextHour.setUTCHours(nextHour.getUTCHours() + 1);

        // 创建处理当前时间段的任务，并加入到任务列表中
        tasks.push(async () => {
            await TokenStatsService.refreshStatsForTimeRange(startTime, nextHour);
        });

        // 跳到下一小时
        currentTime = nextHour;
    }

    const subLists = BaseUtil.splitArray(tasks, 24);
    for (const subList of subLists) {
        await Promise.all(subList.map(async (task) => {
            try {
                await task();
            } catch (error) {
                console.error("Error executing task:", error);
            }
        }));
    }

    console.log("Finished refreshing historical stats.");
}

export function jobs() {
    refreshTokenInfo();
    refreshTokenStats();
    refreshTokenPriceChange();
    // refreshHistoricalStats('2025-08-09T07:00:00.000Z', '2026-01-15T00:00:00Z').then(() => {
    //     console.log("Refresh historical stats finished.");
    // }).catch(error => {
    //     console.error("Error in refreshHistoricalStats:", error);
    // });
}
