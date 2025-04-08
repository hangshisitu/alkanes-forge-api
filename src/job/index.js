import schedule from 'node-schedule';
import * as RedisHelper from "../lib/RedisHelper.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import asyncPool from "tiny-async-pool";
import config from "../conf/config.js";
import AlkanesService from "../service/AlkanesService.js";

// 添加重试请求的辅助函数
async function retryRequest(requestFn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
            }
        }
    }
    return lastError;
}

let isRefreshToken = false;
function refreshToken() {
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshToken) {
            return;
        }

        const updateRedisKey = `token-update-height`;
        try {
            isRefreshToken = true;
            const startTime = Date.now();

            // 1. 获取区块链高度并检查是否需要更新
            const updateHeight = await RedisHelper.get(updateRedisKey);
            const blockHeight = await retryRequest(
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
            console.log(`refresh token start, update height: ${updateHeight} block height: ${blockHeight}`);

            // 2. 获取所有现有token
            const tokenList = await TokenInfoMapper.getAllTokens();
            console.log(`found existing tokens: ${tokenList.length}`);

            if (!tokenList) {
                console.log('Failed to get existing tokens');
                return;
            }

            // 3. 获取需要更新的活跃token
            const activeTokens = tokenList.filter(token => token.mintActive);
            console.log(`found active tokens: ${activeTokens.length}`);

            // 4. 并行获取活跃token的最新数据（带重试）
            const alkaneList = [];
            const failedTokens = [];

            for await (const result of asyncPool(
                config.concurrencyLimit,
                activeTokens.map(t => t.id),
                async (tokenId) => {
                    try {
                        const data = await retryRequest(
                            () => AlkanesService.getAlkanesById(tokenId),
                            3, 500
                        );
                        if (data === null) {
                            failedTokens.push(tokenId);
                        }
                        return data;
                    } catch (error) {
                        console.error(`Failed to fetch token ${tokenId}:`, error.message);
                        failedTokens.push(tokenId);
                        return null;
                    }
                }
            )) {
                if (result !== null) {
                    alkaneList.push(result);
                }
            }

            if (failedTokens.length > 0) {
                console.warn(`Failed to update ${failedTokens.length} tokens:`, failedTokens.join(', '));
            }
            console.log(`updated active tokens: ${alkaneList.length}`);

            // 5. 确定新token的搜索范围
            let lastIndex = 0;
            if (tokenList.length > 0) {
                const lastToken = tokenList[tokenList.length - 1];
                const parts = lastToken.id.split(':');
                if (parts.length === 2 && !isNaN(parts[1])) {
                    lastIndex = parseInt(parts[1]) + 1;
                }
            }

            // 6. 查找新token
            const newAlkaneList = [];
            const maxNewTokensToCheck = 1000;
            const existingIds = new Set(tokenList.map(t => t.id));
            const activeIds = new Set(alkaneList.map(t => t.id));

            for (let i = lastIndex; i < lastIndex + maxNewTokensToCheck; i++) {
                const tokenId = `2:${i}`;

                if (existingIds.has(tokenId) || activeIds.has(tokenId)) {
                    continue;
                }

                try {
                    const alkanes = await retryRequest(
                        () => AlkanesService.getAlkanesById(tokenId),
                        2, 500
                    );

                    if (alkanes === null) {
                        break;
                    }

                    if (alkanes.cap < 1e36) {
                        newAlkaneList.push(alkanes);
                        existingIds.add(tokenId);
                    }
                } catch (error) {
                    console.error(`Error checking new token ${tokenId}:`, error.message);
                    break; // 遇到错误停止检查新token
                }
            }
            console.log(`found new tokens: ${newAlkaneList.length}`);

            // 7. 合并所有token数据
            const tokenMap = new Map();
            tokenList.forEach(token => tokenMap.set(token.id, token));
            alkaneList.forEach(token => {
                tokenMap.set(token.id, {
                    ...tokenMap.get(token.id),
                    ...token
                });
            });
            newAlkaneList.forEach(token => {
                if (!tokenMap.has(token.id)) {
                    tokenMap.set(token.id, token);
                }
            });

            // 8. 数据验证和处理
            const allTokens = Array.from(tokenMap.values()).sort((a, b) => {
                const aParts = a.id.split(':');
                const bParts = b.id.split(':');
                const aNum = aParts.length === 2 ? parseInt(aParts[1]) : 0;
                const bNum = bParts.length === 2 ? parseInt(bParts[1]) : 0;
                return aNum - bNum;
            });

            // 9. 更新数据库和缓存
            await TokenInfoMapper.bulkUpsertTokens(allTokens);
            await RedisHelper.set(updateRedisKey, blockHeight);
            await RedisHelper.set('alkanesList', JSON.stringify(allTokens));

            console.log(`refresh token finish. Total tokens: ${allTokens.length}, cost ${Date.now() - startTime}ms.`);
        } catch (err) {
            console.error('refresh token error:', err.message);
        } finally {
            isRefreshToken = false;
        }
    });
}


export function jobs() {
    refreshToken();
}
