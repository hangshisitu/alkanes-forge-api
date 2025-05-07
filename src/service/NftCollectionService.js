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
import NftMarketListingMapper from '../mapper/NftMarketListingMapper.js';
import NftCollectionAttribute from '../models/NftCollectionAttribute.js';

let nftCollectionListCache = null;

export default class NftCollectionService {

    static async getCollectionById(id) {
        const collection = await NftCollection.findByPk(id, {
            attributes: {
                exclude: ['updateHeight', 'createdAt', 'updatedAt']
            },
            raw: true
        });
        collection.attributes = await NftCollectionAttribute.findAll({
            where: {
                collectionId: id
            },
            attributes: {
                exclude: ['id', 'collectionId', 'createdAt', 'updatedAt']
            },
            raw: true
        });
        return collection;
    }

    static async getAllNftCollection() {
        const nftCollectionList = await NftCollection.findAll();
        return nftCollectionList;
    }

    static async bulkUpsertNftCollection(infos) {
        await NftCollection.bulkCreate(infos, {
            updateOnDuplicate: ['id']
        });
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
                return; // 如果没有 24 小时的交易数据，直接跳过更新流程
            }

            // 获取合集 ID 列表（从 24 小时的统计数据中提取）
            const collectionIds = Object.keys(statsMap24h);

            // Step 2: 查询每个合集的最新成交价格（listing_price）
            const latestPrices = await sequelize.query(`
                SELECT me1.collection_id AS collectionId, me1.listing_price AS latestPrice
                FROM nft_market_event me1
                INNER JOIN (
                    SELECT collection_id, MAX(created_at) as latest_time
                    FROM nft_market_event
                    WHERE type = 2 AND created_at < NOW()
                    GROUP BY collection_id
                ) me2 ON me1.collection_id = me2.collection_id AND me1.created_at = me2.latest_time
                WHERE me1.type = 2;
            `, { type: QueryTypes.SELECT });

            const latestPriceMap = {};
            latestPrices.forEach(row => {
                latestPriceMap[row.collectionId] = parseFloat(row.latestPrice); // 转换价格为浮点数
            });

            // 使用 Map 保存更新数据
            const updateMap = new Map();

            // Step 3: 遍历其他时间段（7 天、30 天）
            for (const timeframe of timeframes) {
                // 查询历史价格
                const historicalPrices = await sequelize.query(`
                    SELECT ts1.id AS collectionId, 
                           ts1.average_price AS historicalPrice
                    FROM nft_collection_stats ts1
                    INNER JOIN (
                        SELECT collection_id, MIN(stats_date) AS minStatsTime
                        FROM nft_collection_stats
                        WHERE stats_date >= DATE_SUB(NOW(), INTERVAL ${timeframe.interval} ${timeframe.unit}) 
                        GROUP BY collection_id
                    ) ts2 ON ts1.collection_id = ts2.collection_id AND ts1.stats_date = ts2.minStatsTime;
                `, { type: QueryTypes.SELECT });

                // 计算每个代币的涨跌幅
                historicalPrices.forEach(row => {
                    const collectionId = row.collectionId;
                    const historicalPrice = parseFloat(row.historicalPrice);
                    const recentPrice = parseFloat(latestPriceMap[collectionId] || 0);

                    // 获取或创建更新对象
                    const existingUpdate = updateMap.get(collectionId) || { id: collectionId };

                    // 涨跌幅计算逻辑
                    if (historicalPrice > 0 && recentPrice > 0) {
                        existingUpdate[`priceChange${timeframe.label}`] = ((recentPrice - historicalPrice) / historicalPrice) * 100; // 添加涨跌幅
                    }

                    // 存入更新 Map
                    updateMap.set(collectionId, existingUpdate);
                });
            }

            // Step 4: 合并其他统计结果，更新 7d 和 30d 的交易额和交易次数
            const statsMap7d = await NftMarketEventMapper.getStatsMapByCollectionIds(collectionIds, 24 * 7);
            const statsMap30d = await NftMarketEventMapper.getStatsMapByCollectionIds(collectionIds, 24 * 30);
            const statsMapTotal = await NftMarketEventMapper.getStatsMapByCollectionIds(collectionIds);

            // 构建完整的更新数据基于 statsMap24h
            const collectionStatsList = Object.keys(statsMap24h).map(collectionId => {
                const item = {
                    id: collectionId,
                    tradingVolume24h: statsMap24h[collectionId].totalVolume,
                    tradingCount24h: statsMap24h[collectionId].tradeCount,
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
                const existingUpdate = updateMap.get(collectionId);
                if (existingUpdate) {
                    Object.assign(item, existingUpdate); // 合并涨跌幅信息
                }

                return item;
            });

            // Step 5: 批量更新代币的统计信息，包含交易量和交易次数
            if (collectionStatsList.length > 0) {
                await NftCollectionMapper.batchUpdateNftCollectionStatsInBatches(collectionStatsList);
                logger.info('Nft collection stats updated successfully.');
            } else {
                logger.info('No updates required for nft collection stats.');
            }

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

}

NftCollectionService.refreshNftCollectionListCache();





