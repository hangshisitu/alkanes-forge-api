import sequelize from "../lib/SequelizeHelper.js";
import {QueryTypes} from "sequelize";
import TokenStatsMapper from "../mapper/TokenStatsMapper.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import MarketListingMapper from "../mapper/MarketListingMapper.js";
import BigNumber from "bignumber.js";
import asyncPool from "tiny-async-pool";
import config from "../conf/config.js";
import BaseUtil from "../utils/BaseUtil.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";
import AlkanesService from "./AlkanesService.js";

export default class TokenInfoService {

    static async refreshTokenInfo(blockHeight) {
        // 1. 获取所有现有token
        const tokenList = await TokenInfoMapper.getAllTokens();
        console.log(`found existing tokens: ${tokenList.length}`);

        if (!tokenList) {
            console.log('Failed to get existing tokens');
            return;
        }

        // 2. 获取需要更新的活跃token
        const activeTokens = tokenList.filter(token => token.mintActive);
        console.log(`found active tokens: ${activeTokens.length}`);

        // 3. 并行获取活跃token的最新数据
        const alkaneList = [];
        const failedTokens = [];

        for await (const result of asyncPool(
            config.concurrencyLimit,
            activeTokens.map(t => t.id),
            async (tokenId) => {
                try {
                    const data = await BaseUtil.retryRequest(
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

        // 4. 确定新token的搜索范围
        let lastIndex = 0;
        if (tokenList.length > 0) {
            const lastToken = tokenList[tokenList.length - 1];
            const parts = lastToken.id.split(':');
            if (parts.length === 2 && !isNaN(parts[1])) {
                lastIndex = parseInt(parts[1]) + 1;
            }
        }

        // 5. 查找新token
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
                const alkanes = await BaseUtil.retryRequest(
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

        // 6. 合并所有token数据
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

        // 7. 数据验证和处理
        const allTokens = Array.from(tokenMap.values()).sort((a, b) => {
            const aParts = a.id.split(':');
            const bParts = b.id.split(':');
            const aNum = aParts.length === 2 ? parseInt(aParts[1]) : 0;
            const bNum = bParts.length === 2 ? parseInt(bParts[1]) : 0;
            return aNum - bNum;
        });

        allTokens.forEach(token => token.updateHeight = blockHeight);

        // 8. 更新数据库和缓存
        await TokenInfoMapper.bulkUpsertTokensInBatches(allTokens);
        await RedisHelper.set(Constants.REDIS_KEY.TOKEN_INFO_UPDATED_HEIGHT, blockHeight);
        await RedisHelper.set(Constants.REDIS_KEY.TOKEN_INFO_LIST, JSON.stringify(allTokens));

        return allTokens.length;
    }

    static async refreshTokenStats() {
        const timeframes = [
            { label: '24h', interval: 24, unit: 'HOUR' },
            { label: '7d', interval: 7, unit: 'DAY' },
            { label: '30d', interval: 30, unit: 'DAY' }
        ];

        try {
            // 获取每个 alkanes_id 的最新成交价
            const latestPrices = await sequelize.query(`
                SELECT me1.alkanes_id AS alkanesId, me1.listing_price AS latestPrice
                FROM market_event me1
                INNER JOIN (
                    SELECT alkanes_id, MAX(created_at) as latest_time
                    FROM market_event
                    WHERE type = 2 and created_at < now()
                    GROUP BY alkanes_id
                ) me2 ON me1.alkanes_id = me2.alkanes_id AND me1.created_at = me2.latest_time
                WHERE me1.type = 2;
            `, { type: QueryTypes.SELECT });

            const latestPriceMap = {};
            latestPrices.forEach(row => {
                latestPriceMap[row.alkanesId] = row.latestPrice;
            });

            // 使用 Map 来合并更新数据
            const updateMap = new Map();
            // 遍历每个时间段
            for (const timeframe of timeframes) {
                // 获取历史价格
                const historicalPrices = await sequelize.query(`
                    SELECT ts1.alkanes_id AS alkanesId, 
                           MAX(ts1.average_price) AS historicalPrice
                    FROM token_stats ts1
                    WHERE ts1.stats_date >= DATE_SUB(NOW(), INTERVAL ${timeframe.interval} ${timeframe.unit})
                      AND ts1.stats_date < NOW()
                    GROUP BY ts1.alkanes_id;
                `, { type: QueryTypes.SELECT });

                // 处理每个代币的统计
                for (const row of historicalPrices) {
                    const alkanesId = row.alkanesId;
                    const historicalPrice = parseFloat(row.historicalPrice);
                    const recentPrice = parseFloat(latestPriceMap[alkanesId] || 0);

                    // 计算价格变化
                    let priceChange = 0;
                    if (historicalPrice > 0 && recentPrice > 0) {
                        priceChange = ((recentPrice - historicalPrice) / historicalPrice) * 100;
                    }

                    // 获取或创建更新对象
                    const existingUpdate = updateMap.get(alkanesId) || { id: alkanesId };

                    // 更新价格变化
                    existingUpdate[`priceChange${timeframe.label}`] = priceChange;

                    // 存回 Map
                    updateMap.set(alkanesId, existingUpdate);
                }
            }
            if (updateMap.size < 1) {
                return;
            }

            const updateBatch = Array.from(updateMap.values());
            const alkanesIds = updateBatch.map(item => item.id);

            // 查询24小时数据
            const statsMapTotal = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds);
            const statsMap24h = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds, 24);
            const statsMap7d = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds, 24 * 7);
            const statsMap30d = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds, 24 * 30);

            // 合并总交易统计
            const tokenStatsList = updateBatch.map(item => {
                return {
                    ...item,
                    tradingVolume24h: statsMap24h[item.id]?.totalVolume || 0,
                    tradingCount24h: statsMap24h[item.id]?.tradeCount || 0,
                    tradingVolume7d: statsMap7d[item.id]?.totalVolume || 0,
                    tradingCount7d: statsMap7d[item.id]?.tradeCount || 0,
                    tradingVolume30d: statsMap30d[item.id]?.totalVolume || 0,
                    tradingCount30d: statsMap30d[item.id]?.tradeCount || 0,
                    totalTradingVolume: statsMapTotal[item.id]?.totalVolume || 0,
                    totalTradingCount: statsMapTotal[item.id]?.tradeCount || 0,
                };
            });

            await TokenInfoMapper.batchUpdateTokenStatsInBatches(tokenStatsList);
        } catch (error) {
            console.error('Error refreshing token stats:', error);
        }
    }

    static async refreshTokenFPAndMCap(alkanesId) {
        try {
            const floorListing = await MarketListingMapper.getFloorPriceByAlkanesId(alkanesId);
            if (!floorListing) {
                return;
            }
            const newFloorPrice = floorListing.listingPrice;

            // 查询对应的 Token 信息
            const tokenInfo = await TokenInfoMapper.getById(alkanesId);
            if (!tokenInfo) {
                return;
            }
            const existFloorPrice = tokenInfo.floorPrice;

            if (existFloorPrice > 0 && existFloorPrice <= newFloorPrice) {
                return;
            }

            if (!tokenInfo) {
                console.log(`No token found for alkanesId: ${alkanesId}`);
                return null;
            }

            const marketCap = new BigNumber(newFloorPrice).multipliedBy(tokenInfo.totalSupply);
            await TokenInfoMapper.updateFPAndMCap(alkanesId, newFloorPrice, marketCap);
        } catch (error) {
            console.error(`Error updating floor price and market cap for ${alkanesId}:`, error.message);
        }
    }

}