import schedule from 'node-schedule';
import * as RedisHelper from "../lib/RedisHelper.js";
import config from "../conf/config.js";
import AlkanesService from "../service/AlkanesService.js";
import BaseUtil from "../utils/BaseUtil.js";
import DateUtil from "../utils/DateUtil.js";
import TokenStatsService from "../service/TokenStatsService.js";
import {Constants} from "../conf/constants.js";
import TokenInfoService from "../service/TokenInfoService.js";


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

            console.log(`refreshTokenInfo start, update height: ${updateHeight} block height: ${blockHeight}`);
            const allTokens = await TokenInfoService.refreshTokenInfo(blockHeight);
            console.log(`refreshTokenInfo finish. total tokens: ${allTokens}, cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            console.error('refreshTokenInfo error:', err);
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
            console.error('refreshStatsForTimeRange error:', err);
        } finally {
            isRefreshStatsForTimeRange = false;
        }
    });
}


let isRefreshTokenStats = false;
function refreshTokenStats() {
    schedule.scheduleJob('*/5 * * * *', async () => {
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
            console.error('refreshTokenStats error:', err);
        } finally {
            isRefreshTokenStats = false;
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
        // tasks.push(async () => {
        //     await TokenStatsService.refreshStatsForTimeRange(startTime, nextHour);
        // });

        await TokenStatsService.refreshStatsForTimeRange(startTime, nextHour);

        // 跳到下一小时
        currentTime = nextHour;
    }

    // const subLists = BaseUtil.splitArray(tasks, 24);
    // for (const subList of subLists) {
    //     await Promise.all(subList.map(async (task) => {
    //         try {
    //             await task();
    //         } catch (error) {
    //             console.error("Error executing task:", error);
    //         }
    //     }));
    // }

    console.log("Finished refreshing historical stats.");
}

export function jobs() {
    refreshTokenInfo();
    refreshStatsForTimeRange();
    refreshTokenStats();
    refreshHistoricalStats('2025-07-17T16:00:00.000Z', '2026-01-15T00:00:00Z').then(() => {
        console.log("Refresh historical stats finished.");
    }).catch(error => {
        console.error("Error in refreshHistoricalStats:", error);
    });
}
