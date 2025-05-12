import NftCollection from '../models/NftCollection.js';
import BaseUtil from '../utils/BaseUtil.js';
import * as logger from '../conf/logger.js';
import {Constants} from '../conf/constants.js';
import MempoolService from './MempoolService.js';
import * as RedisHelper from '../lib/RedisHelper.js';
import NftMarketEventMapper from '../mapper/NftMarketEventMapper.js';
import sequelize from '../lib/SequelizeHelper.js';
import { QueryTypes } from 'sequelize';
import NftCollectionMapper from '../mapper/NftCollectionMapper.js';
import NftItemMapper from '../mapper/NftItemMapper.js';
import NftMarketListingMapper from '../mapper/NftMarketListingMapper.js';
import NftMarketStatsMapper from '../mapper/NftMarketStatsMapper.js';
import { Op } from 'sequelize';
import NftItemService from './NftItemService.js';
import NftAttributeService from './NftAttributeService.js';
import AlkanesService from './AlkanesService.js';
import LaunchService from './LaunchService.js';
import BigNumber from 'bignumber.js';

let nftCollectionListCache = null;

export default class NftCollectionService {

    static getCollectionCacheKey(collectionId) {
        return `nft-collection:${collectionId}`;
    }

    static async deleteCollectionCache(collectionId) {
        const cacheKey = this.getCollectionCacheKey(collectionId);
        await RedisHelper.del(cacheKey);
    }

    static async getCollectionById(id) {
        const cacheKey = this.getCollectionCacheKey(id);
        const cacheData = await RedisHelper.get(cacheKey);
        let collection = null;
        if (cacheData) {
            collection = JSON.parse(cacheData);
        } else {
            collection = await NftCollection.findByPk(id, {
                attributes: {
                    exclude: ['updateHeight', 'createdAt', 'updatedAt']
                },
                raw: true
            });
            if (collection) {
                await RedisHelper.setEx(cacheKey, 10, JSON.stringify(collection));
            }
        }
        if (collection) {
            collection.attributes = (await NftAttributeService.getNftAttributes(id)).reduce((acc, attr) => {
                acc[attr.traitType] = acc[attr.traitType] ?? [];
                acc[attr.traitType].push({value: attr.value, count: attr.count});
                return acc;
            }, {});
        }
        return collection;
    }

    static async findById(id) {
        return await NftCollection.findByPk(id, {
            attributes: {
                exclude: ['updateHeight', 'createdAt', 'updatedAt']
            },
            raw: true
        });
    }

    static async getAllNftCollection() {
        const nftCollectionList = await NftCollection.findAll({
            raw: true
        });
        return nftCollectionList;
    }

    static async bulkUpsertNftCollection(infos, options = {transaction: null}) {
        const uniqueKeyFields = ['id'];
        const updatableFields = Object.keys(infos[0]).filter(key => !uniqueKeyFields.includes(key));
        await NftCollection.bulkCreate(infos, {
            updateOnDuplicate: updatableFields,
            transaction: options.transaction
        });
        await LaunchService.updateCollectionsMinted(infos.map(info => ({
            collectionId: info.id,
            minted: info.minted,
            updateHeight: info.updateHeight
        })), {transaction: options.transaction});
    }

    static async refreshNftCollectionStats() {
        // 定义时间范围的标签和单位，用于遍历处理各时间段的价格变化
        const timeframes = [
            { label: '24h', interval: 24, unit: 'HOUR'},
            { label: '7d', interval: 7, unit: 'DAY'},
            { label: '30d', interval: 30, unit: 'DAY'}
        ];

        try {
            // Step 1: 查询 24 小时内所有合集的交易统计数据
            const statsMap24h = await NftMarketEventMapper.getStatsMapForHours(24);

            if (Object.keys(statsMap24h).length === 0) {
                logger.info('No 24-hour trading data found. Skipping updates.');
                return;
            }

            // 获取需要更新的合集 ID 列表
            const collectionIds = [...new Set([...Object.keys(statsMap24h), ...await NftCollectionMapper.getTradingCountGt0Ids('total_trading_count')])];

            // Step 2: 查询每个合集的最新成交价格（使用最近3小时的平均价格）
            const latestPrices = await sequelize.query(`
                SELECT 
                    me1.collection_id AS collectionId,
                    CAST(AVG(listing_price) as DECIMAL(65, 18)) AS latestPrice,
                    COUNT(*) as tradeCount
                FROM nft_market_event me1
                WHERE me1.type = 2 
                AND me1.created_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 3 HOUR), '%Y-%m-%d %H:00:00')
                AND me1.created_at < DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00')
                GROUP BY me1.collection_id
                HAVING COUNT(*) >= 3;  -- 确保至少有3笔交易
            `, { type: QueryTypes.SELECT });

            const latestPriceMap = {};
            latestPrices.forEach(row => {
                if (row.tradeCount >= 3) {  // 只使用有足够交易量的数据
                    latestPriceMap[row.collectionId] = parseFloat(row.latestPrice);
                }
            });

            // 使用 Map 保存更新数据
            const updateMap = new Map();

            // Step 3: 遍历其他时间段（7 天、30 天）
            for (const timeframe of timeframes) {
                // 查询历史价格（使用时间段内前3小时的平均价格）
                const historicalPrices = await sequelize.query(`
                    SELECT 
                        ts1.collection_id AS collectionId, 
                        CAST(AVG(ts1.average_price) as DECIMAL(65, 18)) AS historicalPrice,
                        COUNT(*) as dataPoints
                    FROM nft_collection_stats ts1
                    INNER JOIN (
                        SELECT collection_id, MIN(stats_date) AS minStatsTime
                        FROM nft_collection_stats
                        WHERE stats_date >= DATE_SUB(NOW(), INTERVAL ${timeframe.interval} ${timeframe.unit})
                        GROUP BY collection_id
                    ) ts2 ON ts1.collection_id = ts2.collection_id 
                    WHERE ts1.stats_date >= ts2.minStatsTime
                    AND ts1.stats_date <= DATE_ADD(ts2.minStatsTime, INTERVAL 3 HOUR)
                    GROUP BY ts1.collection_id
                    HAVING COUNT(*) >= 3;  -- 确保至少有3个数据点
                `, { type: QueryTypes.SELECT });

                // 计算每个代币的涨跌幅
                historicalPrices.forEach(row => {
                    const collectionId = row.collectionId;
                    const historicalPrice = parseFloat(row.historicalPrice);
                    const recentPrice = parseFloat(latestPriceMap[collectionId] || 0);

                    // 获取或创建更新对象
                    const existingUpdate = updateMap.get(collectionId) || { id: collectionId };

                    // 涨跌幅计算逻辑 - 添加合理性检查
                    if (historicalPrice > 0 && recentPrice > 0) {
                        const priceChange = ((recentPrice - historicalPrice) / historicalPrice) * 100;
                        
                        // 添加合理性检查：如果价格变化超过500%，则使用更保守的计算方式
                        if (Math.abs(priceChange) > 500) {
                            // 使用中位数价格计算
                            const medianPrice = (historicalPrice + recentPrice) / 2;
                            existingUpdate[`priceChange${timeframe.label}`] = ((recentPrice - medianPrice) / medianPrice) * 100;
                        } else {
                            existingUpdate[`priceChange${timeframe.label}`] = priceChange;
                        }
                    }

                    // 存入更新 Map
                    updateMap.set(collectionId, existingUpdate);
                });
            }

            // Step 4: 合并其他统计结果，更新 7d 和 30d 的交易额和交易次数
            const statsMap7d = await NftMarketStatsMapper.getStatsMapByCollectionIds(collectionIds, 24 * 7);
            const statsMap30d = await NftMarketStatsMapper.getStatsMapByCollectionIds(collectionIds, 24 * 30);
            const statsMapTotal = await NftMarketStatsMapper.getStatsMapByCollectionIds(collectionIds);

            // 构建完整的更新数据基于 statsMap24h
            const collectionStatsList = collectionIds.map(collectionId => {
                const item = {
                    id: collectionId,
                    tradingVolume24h: statsMap24h[collectionId]?.totalVolume || 0,
                    tradingCount24h: statsMap24h[collectionId]?.tradeCount || 0,
                    tradingVolume7d: statsMap7d[collectionId]?.totalVolume || 0,
                    tradingCount7d: statsMap7d[collectionId]?.tradeCount || 0,
                    tradingVolume30d: statsMap30d[collectionId]?.totalVolume || 0,
                    tradingCount30d: statsMap30d[collectionId]?.tradeCount || 0,
                    totalTradingVolume: statsMapTotal[collectionId]?.totalVolume || 0,
                    totalTradingCount: statsMapTotal[collectionId]?.tradeCount || 0
                };
                item.tradingVolume7d = Math.max(item.tradingVolume7d, item.tradingVolume24h);
                item.tradingCount7d = Math.max(item.tradingCount7d, item.tradingCount24h);
                item.tradingVolume30d = Math.max(item.tradingVolume30d, item.tradingVolume24h);
                item.tradingCount30d = Math.max(item.tradingCount30d, item.tradingCount24h);
                item.totalTradingVolume = Math.max(item.totalTradingVolume, item.tradingVolume24h);
                item.totalTradingCount = Math.max(item.totalTradingCount, item.tradingCount24h);

                // 添加涨跌幅信息
                let existingUpdate = updateMap.get(collectionId);
                if (!existingUpdate) {
                    existingUpdate = { id: collectionId };
                    timeframes.forEach(timeframe => {
                        existingUpdate[`priceChange${timeframe.label}`] = 0;
                    });
                }
                Object.assign(item, existingUpdate); // 合并涨跌幅信息

                return item;
            });

            // Step 5: 批量更新代币的统计信息，包含交易量和交易次数
            if (collectionStatsList.length > 0) {
                await NftCollectionMapper.batchUpdateNftCollectionStatsInBatches(collectionStatsList);
                logger.info('Nft collection stats updated successfully.');
            } else {
                logger.info('No updates required for nft collection stats.');
            }
            
            collectionIds.forEach(async (collectionId) => {
                await this.deleteCollectionCache(collectionId);
            });

        } catch (error) {
            logger.error('Error refreshing nft collection stats:', error);
        }
    }
    
    static async refreshNftCollectionListCache() {
        while (true) {
            try {
                nftCollectionListCache = await this.getAllNftCollection();
            } catch (error) {
                logger.error('Error refreshing nft collection list cache:', error);
            }
            await BaseUtil.sleep(10000);
        }
    }

    static async getAllNftCollectionByCache() {
        return nftCollectionListCache ?? await this.getAllNftCollection();
    }

    static sortNftCollectionList(nftCollectionList, callback = null, idReverse = false, sortId = true) {
        return nftCollectionList.sort((a, b) => {
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

    static async getCollectionPage(name, mintActive, orderType, page, size) {
        let nftCollectionList = [...nftCollectionListCache];

        if (name) {
            nftCollectionList = nftCollectionList.filter(nftCollection => nftCollection.id.includes(name) || nftCollection.name.toLowerCase().includes(name.toLowerCase()));
        }

        if (mintActive != null) {
            nftCollectionList = nftCollectionList.filter(nftCollection => nftCollection.mintActive === mintActive);
        }
        
        const ORDER_TYPE = Constants.NFT_COLLECTION_ORDER_TYPE;
        // 根据不同的排序类型设置排序条件
        switch (orderType) {
            // 进度排序
            case ORDER_TYPE.PROGRESS_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.progress - a.progress);
                break;
            case ORDER_TYPE.PROGRESS_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.progress - b.progress);
                break;

            // ID 排序 - 这里不需要追加 ID 排序
            case ORDER_TYPE.ID_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList);
                break;
            case ORDER_TYPE.ID_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, null, true);
                break;

            // 交易量排序 - 升序
            case ORDER_TYPE.VOLUME_24H_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.tradingVolume24h - b.tradingVolume24h);
                break;
            case ORDER_TYPE.VOLUME_7D_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.tradingVolume7d - b.tradingVolume7d);
                break;
            case ORDER_TYPE.VOLUME_30D_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.tradingVolume30d - b.tradingVolume30d);
                break;
            case ORDER_TYPE.VOLUME_TOTAL_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.totalTradingVolume - b.totalTradingVolume);
                break;

            // 交易量排序 - 降序
            case ORDER_TYPE.VOLUME_24H_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.tradingVolume24h - a.tradingVolume24h);
                break;
            case ORDER_TYPE.VOLUME_7D_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.tradingVolume7d - a.tradingVolume7d);
                break;
            case ORDER_TYPE.VOLUME_30D_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.tradingVolume30d - a.tradingVolume30d);
                break;
            case ORDER_TYPE.VOLUME_TOTAL_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.totalTradingVolume - a.totalTradingVolume);
                break;

            // 涨跌幅排序 - 升序
            case ORDER_TYPE.PRICE_CHANGE_24H_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.priceChange24h - b.priceChange24h);
                break;
            case ORDER_TYPE.PRICE_CHANGE_7D_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.priceChange7d - b.priceChange7d);
                break;
            case ORDER_TYPE.PRICE_CHANGE_30D_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.priceChange30d - b.priceChange30d);
                break;

            // 涨跌幅排序 - 降序
            case ORDER_TYPE.PRICE_CHANGE_24H_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.priceChange24h - a.priceChange24h);
                break;
            case ORDER_TYPE.PRICE_CHANGE_7D_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.priceChange7d - a.priceChange7d);
                break;
            case ORDER_TYPE.PRICE_CHANGE_30D_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.priceChange30d - a.priceChange30d);
                break;

            // 交易笔数排序 - 升序
            case ORDER_TYPE.TRADES_COUNT_24H_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.tradingCount24h - b.tradingCount24h);
                break;
            case ORDER_TYPE.TRADES_COUNT_7D_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.tradingCount7d - b.tradingCount7d);
                break;
            case ORDER_TYPE.TRADES_COUNT_30D_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.tradingCount30d - b.tradingCount30d);
                break;
            case ORDER_TYPE.TRADES_COUNT_TOTAL_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.totalTradingCount - b.totalTradingCount);
                break;

            // 交易笔数排序 - 降序
            case ORDER_TYPE.TRADES_COUNT_24H_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.tradingCount24h - a.tradingCount24h);
                break;
            case ORDER_TYPE.TRADES_COUNT_7D_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.tradingCount7d - a.tradingCount7d);
                break;
            case ORDER_TYPE.TRADES_COUNT_30D_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.tradingCount30d - a.tradingCount30d);
                break;
            case ORDER_TYPE.TRADES_COUNT_TOTAL_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.totalTradingCount - a.totalTradingCount);
                break;

            // 根据市值排序
            case ORDER_TYPE.MARKET_CAP_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.marketCap - a.marketCap);
                break;
            case ORDER_TYPE.MARKET_CAP_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.marketCap - b.marketCap);
                break;

            // 根据地板价排序
            case ORDER_TYPE.FLOOR_PRICE_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.floorPrice - a.floorPrice);
                break;
            case ORDER_TYPE.FLOOR_PRICE_ASC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => a.floorPrice - b.floorPrice);
                break;
            
            case ORDER_TYPE.MEMPOOL_TX_COUNT_DESC:
                const keys = await RedisHelper.scan(`${Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX}*`, 1000, false);
                const mempoolDatas = {};
                for(const key of keys) {
                    const alkanesId = key.replace(RedisHelper.genKey(Constants.REDIS_KEY.MEMPOOL_ALKANES_DATA_CACHE_PREFIX), '');
                    mempoolDatas[alkanesId] = await MempoolService.getMempoolData(alkanesId);
                }
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => {
                    const x = (mempoolDatas[b.id]?.count || 0) - (mempoolDatas[a.id]?.count || 0);
                    if (x === 0) {
                        return b.progress - a.progress;
                    }
                    return x;
                }, false, false);
                break
            
            case ORDER_TYPE.HOLDERS_COUNT_DESC:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.holders - a.holders);
                break;

            // 默认排序 - 进度降序
            default:
                nftCollectionList = this.sortNftCollectionList(nftCollectionList, (a, b) => b.progress - a.progress);
                break;
        }

        // 根据page和size返回分页数据
        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const rows = nftCollectionList.slice(startIndex, endIndex).map(row => {
            return {...row, originalImage: undefined, updateHeight: undefined, createdAt: undefined, updatedAt: undefined};
        });

        return {
            page,
            size,
            total: nftCollectionList.length,
            pages: Math.ceil(nftCollectionList.length / size),
            records: rows,
        };
        
    }

    static async refreshCollectionFloorPrice(collectionId) {
        try {
            const floorListing = await NftMarketListingMapper.getFloorPriceByCollectionId(collectionId);
            if (!floorListing) {
                return;
            }
            const newFloorPrice = floorListing.listingPrice;

            await NftCollectionMapper.updateFloorPrice(collectionId, newFloorPrice);
        } catch (error) {
            logger.error(`Error updating floor price for ${collectionId}:`, error);
        }
    }

    static async refreshCollectionHolderAndItemCountByCollectionIds(collectionIds) {
        const collectionHolderAndItemCounts = await NftItemMapper.countCollectionHolderAndItem(collectionIds);
        for (const collectionHolderAndItemCount of collectionHolderAndItemCounts) {
            await NftCollection.update({
                holders: collectionHolderAndItemCount.holderCount,
                // minted: collectionHolderAndItemCount.itemCount
            }, {
                where: {
                    id: collectionHolderAndItemCount.collectionId
                }
            });
        }
    }

    static async refreshCollectionHolderAndItemCountByItemIds(itemIds) {
        const items = await NftItemService.getItemsByIds(itemIds);
        await this.refreshCollectionHolderAndItemCountByCollectionIds([...new Set(items.map(item => item.collectionId))]);
    }

    static async updateCollectionListing(collectionId, listing) {
        await NftCollection.update({
            listing: listing
        }, {
            where: {
                id: collectionId
            }
        });
    }

    static async getCollectionByIds(collectionIds) {
        return await NftCollection.findAll({
            where: {
                id: { [Op.in]: collectionIds }
            }
        });
    }

    static isCollection(collectionId) {
        return nftCollectionListCache.some(collection => collection.id === collectionId);
    }

    static async refreshNftCollectionInfo() {
        const fieldsToQuery = ['101', '102', '103'];
        await BaseUtil.concurrentExecute(nftCollectionListCache, async (collection) => {
            try {
                if (collection.mintActive === 0) {
                    return;
                }
                const data = await BaseUtil.retryRequest(
                    () => AlkanesService.getAlkanesById(collection.id, fieldsToQuery),
                    3, 500
                    );
                if (data === null) {
                    return null;
                }
                if (
                    data.totalSupply !== undefined &&
                    data.minted !== undefined &&
                    data.cap !== undefined
                ) {
                    data.progress = AlkanesService.calculateProgress(collection.id, data.minted, data.cap);
                    data.mintActive = data.progress >= 100 ? 0 : 1;
                    for (const key in data) {
                        const value = data[key];
                        if (value instanceof BigNumber) {
                            data[key] = value.toFixed();
                        }
                    }

                    const update = {
                        minted: data.totalSupply,
                        cap: data.cap,
                        premine: data.premine || 0,
                        progress: data.progress,
                        mintActive: data.mintActive
                    };
                    await NftCollection.update(update, {
                        where: {
                            id: collection.id
                        }
                    });
                }
            } catch (error) {
                logger.error(`Failed to fetch collection ${collection.id}:`, error);
                return null;
            }
        });
    }

    static async getHolderPage(collectionId, page, size) {
        return NftItemMapper.getHolderPage(collectionId, page, size);
    }

}

NftCollectionService.refreshNftCollectionListCache();




