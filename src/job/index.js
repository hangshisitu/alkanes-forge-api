import schedule from 'node-schedule';
import * as RedisHelper from "../lib/RedisHelper.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import asyncPool from "tiny-async-pool";
import config from "../conf/config.js";
import AlkanesService from "../service/AlkanesService.js";

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

            const updateHeight = await RedisHelper.get(updateRedisKey);
            const blockHeight = await AlkanesService.metashrewHeight(config.alkanesUrl);

            if (updateHeight && parseInt(updateHeight) === blockHeight) {
                return;
            }
            console.log(`refresh token start, update height: ${updateHeight} block height: ${blockHeight}`);

            // 1. 获取所有现有token
            const tokenList = await TokenInfoMapper.getAllTokens();
            console.log(`found existing tokens: ${tokenList.length}`);

            // 2. 获取需要更新的活跃token
            const activeTokens = tokenList.filter(token => token.mintActive);
            console.log(`found active tokens: ${activeTokens.length}`);

            // 3. 并行获取活跃token的最新数据
            const alkaneList = [];
            for await (const result of asyncPool(
                config.concurrencyLimit,
                activeTokens.map(t => t.id),
                AlkanesService.getAlkanesById
            )) {
                if (result !== null) {
                    alkaneList.push(result);
                }
            }
            console.log(`updated active tokens: ${alkaneList.length}`);

            // 4. 确定新token的搜索范围
            let lastIndex = 0;
            if (tokenList.length > 0) {
                const lastToken = tokenList[tokenList.length - 1];
                lastIndex = parseInt(lastToken.id.split(':')[1]) + 1;
            }

            // 5. 查找真正的新token
            const newAlkaneList = [];
            const maxNewTokensToCheck = 1000;
            const existingIds = new Set(tokenList.map(t => t.id));
            const activeIds = new Set(alkaneList.map(t => t.id));

            for (let i = lastIndex; i < lastIndex + maxNewTokensToCheck; i++) {
                const tokenId = `2:${i}`;

                // 跳过已存在的token（包括活跃token）
                if (existingIds.has(tokenId) || activeIds.has(tokenId)) {
                    continue;
                }

                const alkanes = await AlkanesService.getAlkanesById(tokenId);
                if (alkanes === null) {
                    // 遇到null表示后面没有更多token了
                    break;
                }

                if (alkanes.cap < 1e36) {
                    newAlkaneList.push(alkanes);
                    // 避免重复查询
                    existingIds.add(tokenId);
                }
            }
            console.log(`found new tokens: ${newAlkaneList.length}`);

            // 6. 合并所有token（优先级：活跃更新 > 新token > 现有token）
            const tokenMap = new Map();

            // 首先放入所有现有token（保持非活跃token状态）
            tokenList.forEach(token => tokenMap.set(token.id, token));

            // 然后用活跃token的更新数据覆盖（保留原有非活跃字段）
            alkaneList.forEach(token => {
                tokenMap.set(token.id, {
                    ...tokenMap.get(token.id), // 保留可能存在的额外字段
                    ...token                   // 用新数据覆盖
                });
            });

            // 最后添加真正的新token
            newAlkaneList.forEach(token => {
                if (!tokenMap.has(token.id)) {
                    tokenMap.set(token.id, token);
                }
            });

            // 7. 转换为数组并排序
            const allTokens = Array.from(tokenMap.values()).sort((a, b) => {
                const aNum = parseInt(a.id.split(':')[1]);
                const bNum = parseInt(b.id.split(':')[1]);
                return aNum - bNum;
            });

            // 8. 验证无重复
            const idSet = new Set(allTokens.map(t => t.id));
            if (idSet.size !== allTokens.length) {
                const duplicates = allTokens.filter(t => !idSet.delete(t.id)).map(t => t.id);
                console.error(`发现重复ID: ${duplicates.join(', ')}`);
                throw new Error('数据去重失败');
            }

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
