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
import * as logger from '../conf/logger.js';
import MempoolService from "./MempoolService.js";
import R2Service from "./R2Service.js";
import TokenInfo from "../models/TokenInfo.js";
import NftCollectionService from "./NftCollectionService.js";
import NftItemService from "./NftItemService.js";
import NftAttributeService from "./NftAttributeService.js";

let tokenListCache = null;

export default class TokenInfoService {

    static async refreshTokenInfo(blockHeight) {
        // 1. 获取所有现有token
        const tokenList = await TokenInfoMapper.getAllTokens();
        logger.info(`found existing tokens: ${tokenList.length}`);

        // 2. 获取需要更新的活跃token
        const nftCollectionList = await NftCollectionService.getAllNftCollection();
        const activeTokens = tokenList.filter(token => {
            return (token.isSync) || nftCollectionList.find(nftCollection => nftCollection.id === token.id);
        });
        logger.info(`found active tokens: ${activeTokens.length}`);

        // 3. 并行获取活跃token的最新数据
        const alkaneList = [];
        const failedTokens = [];

        for await (const result of asyncPool(
            config.concurrencyLimit,
            activeTokens,
            async (token) => {
                const fieldsToQuery = ['101', '102', '103'];
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
                        data.progress = AlkanesService.calculateProgress(token.id, data.minted, data.cap);
                        data.mintActive = data.progress >= 100 ? 0 : 1;
                    }

                    // 合并原有字段
                    return { ...token, mintActive: token.actualMintActive, ...data };
                } catch (error) {
                    logger.error(`Failed to fetch token ${token.id}:`, error);
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
            logger.warn(`Failed to update ${failedTokens.length} tokens:`, failedTokens.join(', '));
        }
        logger.info(`updated active tokens: ${alkaneList.length}`);

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
        if (lastIndex > 0) {
            // 获取nft item的最大id
            const maxItemId = await NftItemService.findMaxItemId();
            lastIndex = Math.max(lastIndex, (parseInt(maxItemId?.split(':')[1]) || 0) + 1);
        }

        // 5. 查找新token
        const newAlkaneList = [];
        const newNftCollectionList = [];
        const newNftItemList = [];
        const maxNewTokensToCheck = 999999;
        const existingIds = new Set(tokenList.map(t => t.id));
        const activeIds = new Set(alkaneList.map(t => t.id));
        let tryMore = 10;

        for (let i = lastIndex; i < lastIndex + maxNewTokensToCheck; i++) {
            const tokenId = `2:${i}`;

            if (existingIds.has(tokenId) || activeIds.has(tokenId)) {
                continue;
            }

            try {
                logger.info(`sync new token: ${tokenId}`);
                const alkanes = await BaseUtil.retryRequest(
                    () => AlkanesService.getAlkanesById(tokenId),
                    2, 500
                );

                if (Object.keys(alkanes).length === 1) { // 只有id
                    if (--tryMore <= 0) {
                        break;
                    }
                    continue;
                }
                tryMore = 10;

                if (!alkanes.name) {
                    continue;
                }

                if (alkanes.collectionIdentifier) { // nft合集id
                    newNftCollectionList.push({
                        id: alkanes.collectionIdentifier,
                        identifier: alkanes.collectionIdentifier,
                    });
                    if (alkanes.cap <= 0) {
                        newNftItemList.push(alkanes);
                        continue;
                    }
                }

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

                const nftCollection = nftCollectionList.find(nftCollection => nftCollection.id === tokenId);
                
                if (nftCollection) {
                    if (nftCollection.totalSupply != null) {
                        alkanes.totalSupply = nftCollection.totalSupply;
                        alkanes.minted = nftCollection.minted;
                        alkanes.cap = nftCollection.minted;
                        alkanes.progress = AlkanesService.calculateProgress(tokenId, alkanes.minted, nftCollection.totalSupply);
                        alkanes.mintActive = alkanes.progress >= 100 ? 0 : 1;
                    }
                }

                newAlkaneList.push(alkanes);
                existingIds.add(tokenId);
            } catch (error) {
                logger.error(`Error checking new token ${tokenId}:`, error);
                break; // 遇到错误停止检查新token
            }
        }
        logger.info(`found new tokens: ${newAlkaneList.length}, new nft item: ${newNftItemList.length}`);

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
            token.image = token.image || TokenInfoService.getDefaultTokenImage(token.name);
        });

        // 9. 更新数据库和缓存
        await TokenInfoMapper.bulkUpsertTokensInBatches(allTokens);

        // 10. 更新nft合集和nft item
        if (newNftCollectionList.length > 0) {
            const tokens = await TokenInfoMapper.getAllTokens();
            const nftCollections = [];
            for (const token of tokens) {
                const nftCollection = newNftCollectionList.find(nftCollection => nftCollection.id === token.id);
                if (nftCollection) {
                    nftCollections.push({
                        id: token.id,
                        identifier: nftCollection?.identifier,
                        name: token.name,
                        image: nftCollection?.image || token.image,
                        originalImage: nftCollection?.originalImage || token.originalImage,
                        symbol: token.symbol,
                        data: token.data,
                        contentType: token.contentType,
                        minted: await NftItemService.getNftItemCount(token.id),
                        totalSupply: token.totalSupply || nftCollection.totalSupply,
                        updateHeight: blockHeight,
                    });
                }
            }
            await NftCollectionService.bulkUpsertNftCollection(nftCollections);
            const nftItems = newNftItemList.map(item => {
                return {
                    id: item.id,
                    collectionId: item.collectionIdentifier,
                    name: item.name,
                    image: item.image,
                    originalImage: item.originalImage,
                    symbol: item.symbol,
                    data: item.data,
                    contentType: item.contentType,
                    updateHeight: blockHeight,
                }
            });
            await NftItemService.bulkUpsertNftItem(nftItems);
            const nftItemAttributes = newNftItemList.map(item => {
                let attributes = item.attributes;
                if (!attributes) {
                    return;
                }
                attributes = JSON.parse(attributes);
                return Object.keys(attributes).map(traitType => {
                    return {
                        collectionId: item.collectionIdentifier,
                        itemId: item.id,
                        traitType,
                        value: attributes[traitType],
                    }
                });
            }).flat().filter(item => item != null);
            if (nftItemAttributes.length > 0) {
                await NftAttributeService.bulkUpsertNftItemAttributes(nftItemAttributes);
                const nftCollectionIds = new Set(nftItemAttributes.map(item => item.collectionId));
                for (const nftCollectionId of nftCollectionIds) {
                    await NftAttributeService.refreshNftCollectionAttributes(nftCollectionId);
                }
            }
        }

        await RedisHelper.set(Constants.REDIS_KEY.TOKEN_INFO_UPDATED_HEIGHT, blockHeight);
        await RedisHelper.set(Constants.REDIS_KEY.TOKEN_INFO_LIST, JSON.stringify(allTokens));

        return allTokens.length;
    }

    static async refreshTokenStats() {
        // 定义时间范围的标签和单位，用于遍历处理各时间段的价格变化
        const timeframes = [
            { label: '24h', interval: 24, unit: 'HOUR'},
            { label: '7d', interval: 7, unit: 'DAY'},
            { label: '30d', interval: 30, unit: 'DAY'}
        ];

        try {
            // Step 1: 查询 24 小时内所有 Token 的交易统计数据
            const statsMap24h = await MarketEventMapper.getStatsMapForHours(24);

            if (Object.keys(statsMap24h).length === 0) {
                logger.info('No 24-hour trading data found. Skipping updates.');
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
                        SELECT alkanes_id, MIN(stats_date) AS minStatsTime
                        FROM token_stats
                        WHERE stats_date >= DATE_SUB(NOW(), INTERVAL ${timeframe.interval} ${timeframe.unit}) 
                        GROUP BY alkanes_id
                    ) ts2 ON ts1.alkanes_id = ts2.alkanes_id AND ts1.stats_date = ts2.minStatsTime;
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
                logger.info('Token stats updated successfully.');
            } else {
                logger.info('No updates required for token stats.');
            }

        } catch (error) {
            logger.error('Error refreshing token stats:', error);
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
            logger.error(`Error updating floor price for ${alkanesId}:`, error);
        }
    }

    static getDefaultTokenImage(tokenName) {
        try {
            // 确保代币名称为字符串并去除多余空格
            const trimmedName = tokenName.trim();

            // 检查代币名称的首字母
            if (/^[A-Za-z]/.test(trimmedName)) {
                // 如果以字母开头，返回带字母的默认图片路径
                const firstLetter = trimmedName.charAt(0).toUpperCase(); // 获取首字母，大写
                return `https://static.okx.com/cdn/web3/currency/token/default-logo/token_custom_logo_default_${firstLetter}.png`;
            }
            // 否则，返回未知代币的默认图片路径
        } catch (err) {
            logger.error(`getDefaultTokenImage for ${tokenName} error`, err);
        }
        return Constants.TOKEN_DEFAULT_IMAGE;
    }

    static async refreshTokenListCache() {
        while (true) {
            try {
                tokenListCache = await TokenInfoMapper.getAllTokens();
            } catch (error) {
                logger.error('Error refreshing token list cache:', error);
            }
            await BaseUtil.sleep(10000);
        }
    }

    static sortTokenList(tokenList, callback = null, idReverse = false, sortId = true) {
        return tokenList.sort((a, b) => {
            const x = callback ? callback(a, b) : 0;
            if (x === 0 && sortId) {
                const [aBlock, aTx] = a.id.split(':').map(Number);
                const [bBlock, bTx] = b.id.split(':').map(Number);
                
                if (idReverse) {
                    if (aBlock !== bBlock) {
                        return bBlock - aBlock;
                    }
                    return bTx - aTx;
                } else {
                    if (aBlock !== bBlock) {
                        return aBlock - bBlock;
                    }
                    return aTx - bTx;
                }
            }
            return x;
        });
    }

    static async getTokenPage(name, mintActive, noPremine, orderType, page, size) {
        let tokenList = [...tokenListCache];
        if (name) {
            tokenList = tokenList.filter(token => token.id.includes(name) || token.name.toLowerCase().includes(name.toLowerCase()));
        }
        if (mintActive != null) {
            tokenList = tokenList.filter(token => {
                if (mintActive) {
                    return +token.mintActive === +mintActive || +token.progress < 100;
                } else {
                    return +token.mintActive === +mintActive && +token.progress === 100;
                }
            });
        }
        if (noPremine) {
            tokenList = tokenList.filter(token => +token.premine === 0);
        }

        const ORDER_TYPE = Constants.TOKEN_INFO_ORDER_TYPE;
        // 根据不同的排序类型设置排序条件
        switch (orderType) {
            // 进度排序
            case ORDER_TYPE.PROGRESS_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.progress - a.progress);
                break;
            case ORDER_TYPE.PROGRESS_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.progress - b.progress);
                break;

            // ID 排序 - 这里不需要追加 ID 排序
            case ORDER_TYPE.ID_ASC:
                tokenList = this.sortTokenList(tokenList);
                break;
            case ORDER_TYPE.ID_DESC:
                tokenList = this.sortTokenList(tokenList, null, true);
                break;

            // 交易量排序 - 升序
            case ORDER_TYPE.VOLUME_24H_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.tradingVolume24h - b.tradingVolume24h);
                break;
            case ORDER_TYPE.VOLUME_7D_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.tradingVolume7d - b.tradingVolume7d);
                break;
            case ORDER_TYPE.VOLUME_30D_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.tradingVolume30d - b.tradingVolume30d);
                break;
            case ORDER_TYPE.VOLUME_TOTAL_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.totalTradingVolume - b.totalTradingVolume);
                break;

            // 交易量排序 - 降序
            case ORDER_TYPE.VOLUME_24H_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.tradingVolume24h - a.tradingVolume24h);
                break;
            case ORDER_TYPE.VOLUME_7D_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.tradingVolume7d - a.tradingVolume7d);
                break;
            case ORDER_TYPE.VOLUME_30D_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.tradingVolume30d - a.tradingVolume30d);
                break;
            case ORDER_TYPE.VOLUME_TOTAL_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.totalTradingVolume - a.totalTradingVolume);
                break;

            // 涨跌幅排序 - 升序
            case ORDER_TYPE.PRICE_CHANGE_24H_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.priceChange24h - b.priceChange24h);
                break;
            case ORDER_TYPE.PRICE_CHANGE_7D_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.priceChange7d - b.priceChange7d);
                break;
            case ORDER_TYPE.PRICE_CHANGE_30D_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.priceChange30d - b.priceChange30d);
                break;

            // 涨跌幅排序 - 降序
            case ORDER_TYPE.PRICE_CHANGE_24H_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.priceChange24h - a.priceChange24h);
                break;
            case ORDER_TYPE.PRICE_CHANGE_7D_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.priceChange7d - a.priceChange7d);
                break;
            case ORDER_TYPE.PRICE_CHANGE_30D_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.priceChange30d - a.priceChange30d);
                break;

            // 交易笔数排序 - 升序
            case ORDER_TYPE.TRADES_COUNT_24H_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.tradingCount24h - b.tradingCount24h);
                break;
            case ORDER_TYPE.TRADES_COUNT_7D_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.tradingCount7d - b.tradingCount7d);
                break;
            case ORDER_TYPE.TRADES_COUNT_30D_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.tradingCount30d - b.tradingCount30d);
                break;
            case ORDER_TYPE.TRADES_COUNT_TOTAL_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.totalTradingCount - b.totalTradingCount);
                break;

            // 交易笔数排序 - 降序
            case ORDER_TYPE.TRADES_COUNT_24H_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.tradingCount24h - a.tradingCount24h);
                break;
            case ORDER_TYPE.TRADES_COUNT_7D_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.tradingCount7d - a.tradingCount7d);
                break;
            case ORDER_TYPE.TRADES_COUNT_30D_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.tradingCount30d - a.tradingCount30d);
                break;
            case ORDER_TYPE.TRADES_COUNT_TOTAL_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.totalTradingCount - a.totalTradingCount);
                break;

            // 根据市值排序
            case ORDER_TYPE.MARKET_CAP_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.marketCap - a.marketCap);
                break;
            case ORDER_TYPE.MARKET_CAP_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.marketCap - b.marketCap);
                break;

            // 根据地板价排序
            case ORDER_TYPE.FLOOR_PRICE_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.floorPrice - a.floorPrice);
                break;
            case ORDER_TYPE.FLOOR_PRICE_ASC:
                tokenList = this.sortTokenList(tokenList, (a, b) => a.floorPrice - b.floorPrice);
                break;
            
            case ORDER_TYPE.MEMPOOL_TX_COUNT_DESC:
                const keys = await RedisHelper.scan(`${Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX}*`, 1000, false);
                const mempoolDatas = {};
                for(const key of keys) {
                    const alkanesId = key.replace(RedisHelper.genKey(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX), '');
                    mempoolDatas[alkanesId] = await MempoolService.getMempoolData(alkanesId);
                }
                tokenList = this.sortTokenList(tokenList, (a, b) => {
                    const x = (mempoolDatas[b.id]?.count || 0) - (mempoolDatas[a.id]?.count || 0);
                    if (x === 0) {
                        return b.progress - a.progress;
                    }
                    return x;
                }, false, true);
                break
            
            case ORDER_TYPE.HOLDERS_COUNT_DESC:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.holders - a.holders);
                break;

            // 默认排序 - 进度降序
            default:
                tokenList = this.sortTokenList(tokenList, (a, b) => b.progress - a.progress);
                break;
        }

        // 根据page和size返回分页数据
        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const rows = tokenList.slice(startIndex, endIndex).map(row => {
            return {
                ...row, 
                originalImage: undefined, 
                updateHeight: undefined, 
                createdAt: undefined, 
                updatedAt: undefined,
                isNftCollection: NftCollectionService.isCollection(row.id)
            };
        });

        return {
            page,
            size,
            total: tokenList.length,
            pages: Math.ceil(tokenList.length / size),
            records: rows,
        };
    }

    static async amendTokenInfo() {
        const tokenList = await TokenInfoMapper.getAllTokens();
        const updateTokens = [];
        for (const token of tokenList) {
            const text = token.data;
            if (!text) {
                continue;
            }
            if (text.startsWith('data:image/')) {
                updateTokens.push({
                    id: token.id,
                    image: await R2Service.uploadBuffer({ buffer: Buffer.from(text.split(',')[1], 'base64'), filename: `${token.id}.png`, prefix: config.r2.prefix, type: 'image/png' }),
                });
            } else if (text.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && text.endsWith('</svg>')) {
                updateTokens.push({
                    id: token.id,
                    image: await R2Service.uploadText({ text, filename: `${token.id}.svg`, prefix: config.r2.prefix, type: 'image/svg+xml' }),
                });
            } else {
                updateTokens.push({
                    id: token.id,
                    data: await R2Service.uploadText({ text, filename: `${token.id}.txt`, prefix: config.r2.prefix, type: 'text/plain' })
                });
            }
        }
        if (updateTokens.length > 0) {
            for (const token of updateTokens) {
                const update = {};
                if (token.image) {
                    update.image = token.image;
                    update.originImage = token.originImage;
                    update.data = token.data;
                } else if (token.data) {
                    update.data = token.data;
                }
                await TokenInfo.update(update, {
                    where: { id: token.id }
                });
                logger.info(`${token.id} updated`);
            }
        }
    }

    static async getTokenInfo(alkanesId) {
        const token = tokenListCache ? tokenListCache.find(t => t.id === alkanesId) : null;
        if (!token) {
            return await TokenInfoMapper.getTokenInfo(alkanesId);
        }
        return token;
    }

    static async getTokenList(alkanesIds) {
        const tokenList = tokenListCache ? tokenListCache.filter(t => alkanesIds.includes(t.id)) : await TokenInfoMapper.getTokenList(alkanesIds);
        return tokenList;
    }
}

TokenInfoService.refreshTokenListCache();