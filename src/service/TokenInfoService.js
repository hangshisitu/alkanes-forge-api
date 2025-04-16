import sequelize from "../lib/SequelizeHelper.js";
import {QueryTypes} from "sequelize";
import TokenStatsMapper from "../mapper/TokenStatsMapper.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import MarketListingMapper from "../mapper/MarketListingMapper.js";
import asyncPool from "tiny-async-pool";
import config from "../conf/config.js";
import BaseUtil from "../utils/BaseUtil.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import {Constants} from "../conf/constants.js";
import AlkanesService from "./AlkanesService.js";
import MarketEventMapper from "../mapper/MarketEventMapper.js";

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
            activeTokens,
            async (token) => {
                const fieldsToQuery = ['101', '103'];
                try {
                    const data = await BaseUtil.retryRequest(
                        () => AlkanesService.getAlkanesById(token.id, fieldsToQuery),
                        3, 500
                    );
                    if (data === null) {
                        failedTokens.push(token.id);
                        return null;
                    }

                    // 外部做业务逻辑
                    // 这里只是示例，可依业务需要再加
                    if (token.id === '2:0' && data.totalSupply !== undefined) {
                        data.mintAmount = 3.125 * 1e8;
                        data.cap = 500000;
                        data.minted = Math.ceil(data.totalSupply / data.mintAmount);
                        data.premine = 440000 * 1e8;
                    } else if (
                        data.totalSupply !== undefined &&
                        data.minted !== undefined
                    ) {
                        data.premine = data.totalSupply - data.minted * token.mintAmount;
                        data.progress = AlkanesService.calculateProgress(token.id, data.minted, token.cap);
                        data.mintActive = data.progress >= 100 ? 0 : 1;
                    }

                    // 合并原有字段
                    return { ...token, ...data };
                } catch (error) {
                    console.error(`Failed to fetch token ${token.id}:`, error.message);
                    failedTokens.push(token.id);
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
            lastIndex = Math.max(
                ...tokenList
                    .map(token => {
                        const parts = token.id.split(':');
                        return (parts.length === 2 && !isNaN(parts[1])) ? parseInt(parts[1]) : -1;
                    })
                    .filter(n => n >= 0),
                0 // 防止tokenList为空时Math.max()为-Infinity
            ) + 1;
        }

        // 5. 查找新token
        const newAlkaneList = [];
        const maxNewTokensToCheck = 1;
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
                    if (
                        alkanes.totalSupply !== undefined &&
                        alkanes.minted !== undefined &&
                        alkanes.mintAmount !== undefined
                    ) {
                        alkanes.premine = alkanes.totalSupply - alkanes.minted * alkanes.mintAmount;
                    }

                    if (alkanes.minted !== undefined && alkanes.cap !== undefined) {
                        alkanes.progress = AlkanesService.calculateProgress(tokenId, alkanes.minted, alkanes.cap);
                        alkanes.mintActive = alkanes.progress >= 100 ? 0 : 1;
                    }

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

        // 设置更新区块与默认图片
        allTokens.forEach(token => {
            token.updateHeight = blockHeight;
            token.image = TokenInfoService.getDefaultTokenImage(token.name);
        });

        // 9. 更新数据库和缓存
        await TokenInfoMapper.bulkUpsertTokensInBatches(allTokens);
        await RedisHelper.set(Constants.REDIS_KEY.TOKEN_INFO_UPDATED_HEIGHT, blockHeight);
        await RedisHelper.set(Constants.REDIS_KEY.TOKEN_INFO_LIST, JSON.stringify(allTokens));

        return allTokens.length;
    }

    static async refreshTokenStats() {
        // 定义时间范围的标签和单位，用于遍历处理各时间段的价格变化
        const timeframes = [
            { label: '7d', interval: 7, unit: 'DAY' },
            { label: '30d', interval: 30, unit: 'DAY' }
        ];

        try {
            // Step 1: 查询 24 小时内所有 Token 的交易统计数据
            const statsMap24h = await MarketEventMapper.getStatsMapForHours(24);

            if (Object.keys(statsMap24h).length === 0) {
                console.log('No 24-hour trading data found. Skipping updates.');
                return; // 如果没有 24 小时的交易数据，直接跳过更新流程
            }

            // 获取代币 ID 列表（从 24 小时的统计数据中提取）
            const alkanesIds = Object.keys(statsMap24h);

            // Step 2: 查询每个代币的最新成交价格（listing_price）
            const latestPrices = await sequelize.query(`
                SELECT me1.alkanes_id AS alkanesId, me1.listing_price AS latestPrice
                FROM market_event me1
                INNER JOIN (
                    SELECT alkanes_id, MAX(created_at) as latest_time
                    FROM market_event
                    WHERE type = 2 AND created_at < NOW()
                    GROUP BY alkanes_id
                ) me2 ON me1.alkanes_id = me2.alkanes_id AND me1.created_at = me2.latest_time
                WHERE me1.type = 2;
            `, { type: QueryTypes.SELECT });

            const latestPriceMap = {};
            latestPrices.forEach(row => {
                latestPriceMap[row.alkanesId] = parseFloat(row.latestPrice); // 转换价格为浮点数
            });

            // 使用 Map 保存更新数据
            const updateMap = new Map();

            // Step 3: 遍历其他时间段（7 天、30 天）
            for (const timeframe of timeframes) {
                // 查询历史价格
                const historicalPrices = await sequelize.query(`
                    SELECT ts1.alkanes_id AS alkanesId, 
                           ts1.average_price AS historicalPrice
                    FROM token_stats ts1
                    INNER JOIN (
                        SELECT alkanes_id, MAX(stats_date) AS latestStatsTime
                        FROM token_stats
                        WHERE stats_date >= DATE_SUB(NOW(), INTERVAL ${timeframe.interval + 1} ${timeframe.unit}) 
                              AND stats_date < DATE_SUB(NOW(), INTERVAL ${timeframe.interval - 1} ${timeframe.unit})
                        GROUP BY alkanes_id
                    ) ts2 ON ts1.alkanes_id = ts2.alkanes_id AND ts1.stats_date = ts2.latestStatsTime;
                `, { type: QueryTypes.SELECT });

                // 计算每个代币的涨跌幅
                historicalPrices.forEach(row => {
                    const alkanesId = row.alkanesId;
                    const historicalPrice = parseFloat(row.historicalPrice);
                    const recentPrice = parseFloat(latestPriceMap[alkanesId] || 0);

                    // 获取或创建更新对象
                    const existingUpdate = updateMap.get(alkanesId) || { id: alkanesId };

                    // 涨跌幅计算逻辑
                    if (historicalPrice > 0 && recentPrice > 0) {
                        existingUpdate[`priceChange${timeframe.label}`] = ((recentPrice - historicalPrice) / historicalPrice) * 100; // 添加涨跌幅
                    }

                    // 存入更新 Map
                    updateMap.set(alkanesId, existingUpdate);
                });
            }

            // Step 4: 合并其他统计结果，更新 7d 和 30d 的交易额和交易次数
            const statsMap7d = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds, 24 * 7);
            const statsMap30d = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds, 24 * 30);
            const statsMapTotal = await TokenStatsMapper.getStatsMapByAlkanesIds(alkanesIds);

            // 构建完整的更新数据基于 statsMap24h
            const tokenStatsList = Object.keys(statsMap24h).map(alkanesId => {
                const item = {
                    id: alkanesId,
                    tradingVolume24h: statsMap24h[alkanesId].totalVolume,
                    tradingCount24h: statsMap24h[alkanesId].tradeCount,
                    tradingVolume7d: statsMap7d[alkanesId]?.totalVolume || 0,
                    tradingCount7d: statsMap7d[alkanesId]?.tradeCount || 0,
                    tradingVolume30d: statsMap30d[alkanesId]?.totalVolume || 0,
                    tradingCount30d: statsMap30d[alkanesId]?.tradeCount || 0,
                    totalTradingVolume: statsMapTotal[alkanesId]?.totalVolume || 0,
                    totalTradingCount: statsMapTotal[alkanesId]?.tradeCount || 0
                };
                item.tradingVolume7d = Math.max(item.tradingVolume7d, item.tradingVolume24h);
                item.tradingCount7d = Math.max(item.tradingCount7d, item.tradingCount24h);
                item.tradingVolume30d = Math.max(item.tradingVolume30d, item.tradingVolume24h);
                item.tradingCount30d = Math.max(item.tradingCount30d, item.tradingCount24h);
                item.totalTradingVolume = Math.max(item.totalTradingVolume, item.tradingVolume24h);
                item.totalTradingCount = Math.max(item.totalTradingCount, item.tradingCount24h);

                // 添加涨跌幅信息
                const existingUpdate = updateMap.get(alkanesId);
                if (existingUpdate) {
                    Object.assign(item, existingUpdate); // 合并涨跌幅信息
                }

                return item;
            });

            // Step 5: 批量更新代币的统计信息，包含交易量和交易次数
            if (tokenStatsList.length > 0) {
                await TokenInfoMapper.batchUpdateTokenStatsInBatches(tokenStatsList);
                console.log('Token stats updated successfully.');
            } else {
                console.log('No updates required for token stats.');
            }

        } catch (error) {
            console.error('Error refreshing token stats:', error);
        }
    }

    static async refreshTokenFloorPrice(alkanesId) {
        try {
            const floorListing = await MarketListingMapper.getFloorPriceByAlkanesId(alkanesId);
            if (!floorListing) {
                return;
            }
            const newFloorPrice = floorListing.listingPrice;

            await TokenInfoMapper.updateFloorPrice(alkanesId, newFloorPrice);
        } catch (error) {
            console.error(`Error updating floor price for ${alkanesId}:`, error.message);
        }
    }

    static getDefaultTokenImage(tokenName) {
        // 确保代币名称为字符串并去除多余空格
        const trimmedName = tokenName.trim();

        // 检查代币名称的首字母
        if (/^[A-Za-z]/.test(trimmedName)) {
            // 如果以字母开头，返回带字母的默认图片路径
            const firstLetter = trimmedName.charAt(0).toUpperCase(); // 获取首字母，大写
            return `https://static.okx.com/cdn/web3/currency/token/default-logo/token_custom_logo_default_${firstLetter}.png`;
        }
        // 否则，返回未知代币的默认图片路径
        return 'https://static.okx.com/cdn/web3/currency/token/default-logo/token_custom_logo_unknown.png';
    }
}