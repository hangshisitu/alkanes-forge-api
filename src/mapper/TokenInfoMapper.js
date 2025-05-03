import TokenInfo from '../models/TokenInfo.js';
import Sequelize, {Op, QueryTypes} from "sequelize";
import sequelize from "../lib/SequelizeHelper.js";
import {Constants} from "../conf/constants.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import BigNumber from "bignumber.js";
import MempoolTxMapper from "./MempoolTxMapper.js";
import * as logger from '../conf/logger.js';

export default class TokenInfoMapper {

    static getTokenPageCacheKey(name, mintActive, noPremine, orderType, page, size) {
        return `tokenPage:${encodeURIComponent(name||'')}:${String(mintActive)}:${String(noPremine)}:${orderType}:${page}:${size}`;
    }

    static async getAllTokens(mintActive = null) {
        const whereClause = {};

        if (mintActive) {
            whereClause.mintActive = { [Op.eq]: mintActive };
        }

        return await TokenInfo.findAll({
            where: whereClause,
            order: [["id", "ASC"]],
            raw: true
        });
    }

    static async findTokenPage(name, mintActive, noPremine, orderType, page, size) {
        const cacheKey = TokenInfoMapper.getTokenPageCacheKey(name, mintActive, noPremine, orderType, page, size);
        // 查缓存
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }

        const whereClause = {};

        if (name) {
            whereClause[Op.or] = [
                { id: { [Op.like]: `%${name}%` } },
                { name: { [Op.like]: `%${name}%` } }
            ];
        }

        if (mintActive != null) {
            whereClause.mintActive = mintActive;
            if (!mintActive) {
                whereClause.progress = 100;
            }
        }

        if (noPremine) {
            whereClause.premine = 0;
        }

        const order = [];

        // 获取常量对象的实际值进行比较
        const ORDER_TYPE = Constants.TOKEN_INFO_ORDER_TYPE;

        // ID 排序逻辑
        const addIdAscOrder = () => {
            order.push([Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'ASC']);
            order.push([Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'ASC']);
        };

        // 根据不同的排序类型设置排序条件
        switch (orderType) {
            // 进度排序
            case ORDER_TYPE.PROGRESS_DESC:
                order.push(['progress', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.PROGRESS_ASC:
                order.push(['progress', 'ASC']);
                addIdAscOrder();
                break;

            // ID 排序 - 这里不需要追加 ID 排序
            case ORDER_TYPE.ID_ASC:
                order.push([Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'ASC']);
                order.push([Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'ASC']);
                break;
            case ORDER_TYPE.ID_DESC:
                order.push([Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'DESC']);
                order.push([Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'DESC']);
                break;

            // 交易量排序 - 升序
            case ORDER_TYPE.VOLUME_24H_ASC:
                order.push(['tradingVolume24h', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.VOLUME_7D_ASC:
                order.push(['tradingVolume7d', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.VOLUME_30D_ASC:
                order.push(['tradingVolume30d', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.VOLUME_TOTAL_ASC:
                order.push(['totalTradingVolume', 'ASC']);
                addIdAscOrder();
                break;

            // 交易量排序 - 降序
            case ORDER_TYPE.VOLUME_24H_DESC:
                order.push(['tradingVolume24h', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.VOLUME_7D_DESC:
                order.push(['tradingVolume7d', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.VOLUME_30D_DESC:
                order.push(['tradingVolume30d', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.VOLUME_TOTAL_DESC:
                order.push(['totalTradingVolume', 'DESC']);
                addIdAscOrder();
                break;

            // 涨跌幅排序 - 升序
            case ORDER_TYPE.PRICE_CHANGE_24H_ASC:
                order.push(['priceChange24h', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.PRICE_CHANGE_7D_ASC:
                order.push(['priceChange7d', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.PRICE_CHANGE_30D_ASC:
                order.push(['priceChange30d', 'ASC']);
                addIdAscOrder();
                break;

            // 涨跌幅排序 - 降序
            case ORDER_TYPE.PRICE_CHANGE_24H_DESC:
                order.push(['priceChange24h', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.PRICE_CHANGE_7D_DESC:
                order.push(['priceChange7d', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.PRICE_CHANGE_30D_DESC:
                order.push(['priceChange30d', 'DESC']);
                addIdAscOrder();
                break;

            // 交易笔数排序 - 升序
            case ORDER_TYPE.TRADES_COUNT_24H_ASC:
                order.push(['tradingCount24h', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.TRADES_COUNT_7D_ASC:
                order.push(['tradingCount7d', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.TRADES_COUNT_30D_ASC:
                order.push(['tradingCount30d', 'ASC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.TRADES_COUNT_TOTAL_ASC:
                order.push(['totalTradingCount', 'ASC']);
                addIdAscOrder();
                break;

            // 交易笔数排序 - 降序
            case ORDER_TYPE.TRADES_COUNT_24H_DESC:
                order.push(['tradingCount24h', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.TRADES_COUNT_7D_DESC:
                order.push(['tradingCount7d', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.TRADES_COUNT_30D_DESC:
                order.push(['tradingCount30d', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.TRADES_COUNT_TOTAL_DESC:
                order.push(['totalTradingCount', 'DESC']);
                addIdAscOrder();
                break;

            // 根据市值排序
            case ORDER_TYPE.MARKET_CAP_DESC:
                order.push(['marketCap', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.MARKET_CAP_ASC:
                order.push(['marketCap', 'ASC']);
                addIdAscOrder();
                break;

            // 根据地板价排序
            case ORDER_TYPE.FLOOR_PRICE_DESC:
                order.push(['floorPrice', 'DESC']);
                addIdAscOrder();
                break;
            case ORDER_TYPE.FLOOR_PRICE_ASC:
                order.push(['floorPrice', 'ASC']);
                addIdAscOrder();
                break;

            // 默认排序 - 进度降序
            default:
                order.push(['progress', 'DESC']);
                addIdAscOrder();
                break;
        }

        const { count, rows } = await TokenInfo.findAndCountAll({
            attributes: {
                exclude: ['originalImage', 'updateHeight', 'createdAt', 'updatedAt']
            },
            where: whereClause,
            order: order,
            limit: size,
            offset: (page - 1) * size
        });

        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows.map(row => {
                return {...row, originalImage: undefined, updateHeight: undefined, createdAt: undefined, updatedAt: undefined};
            }),
        };

        // 写缓存，10秒有效期
        await RedisHelper.setEx(cacheKey, 10, JSON.stringify(result));
        return result;
    }

    static async getTokenPrice(ids) {
        const cacheKey = 'token:price:data';
        let tokenList;

        // 1. 尝试从缓存读取
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            tokenList = JSON.parse(cacheData);
        } else {
            tokenList = await TokenInfo.findAll({
                attributes: ['id', 'name', 'image', 'floorPrice', 'priceChange24h', 'marketCap'],
                raw: true
            });
            // 缓存全部token信息，单位：秒（如10s）
            await RedisHelper.setEx(cacheKey, 10, JSON.stringify(tokenList));
        }

        // 2. 若ids传入，需要进行过滤
        if (Array.isArray(ids) && ids.length > 0) {
            tokenList = tokenList.filter(token => ids.includes(token.id));
        }

        // 3. 新增 floorPriceUSD 和 marketCapUSD
        const btcPrice = await RedisHelper.get(Constants.REDIS_KEY.BTC_PRICE_USD);
        const btcPriceNumber = new BigNumber(btcPrice);
        tokenList = tokenList.map(token => {
            const floorPriceUSD = new BigNumber(token.floorPrice).multipliedBy(btcPriceNumber).dividedBy(10**8).decimalPlaces(18, BigNumber.ROUND_CEIL);
            const marketCapUSD = new BigNumber(token.marketCap).multipliedBy(btcPriceNumber).dividedBy(10**8).decimalPlaces(0, BigNumber.ROUND_CEIL);
            return {
                ...token,
                floorPriceUSD: floorPriceUSD.toFixed().replace(/\.?0+$/, ''),
                marketCapUSD: marketCapUSD.toFixed().replace(/\.?0+$/, '')
            };
        });

        return tokenList;
    }

    static async getById(id) {
        return TokenInfo.findByPk(id, {
            attributes: {
                exclude: ['updateHeight', 'createdAt', 'updatedAt']
            }
        });
    }

    static async updateFloorPrice(id, floorPrice) {
        await TokenInfo.update(
            {
                floorPrice: floorPrice
            },
            {
                where: {
                    id: id
                }
            }
        );
    }

    static async updateMarketCap(id, marketCap) {
        await TokenInfo.update(
            {
                marketCap: marketCap
            },
            {
                where: {
                    id: id
                }
            }
        );
    }

    static async bulkUpsertTokens(tokenInfos) {
        if (!tokenInfos || tokenInfos.length === 0) {
            return [];
        }

        try {
            const upsertQuery = `
            INSERT INTO token_info 
            (id, name, image, symbol, cap, premine, minted, mint_amount, 
             total_supply, progress, mint_active, update_height) 
            VALUES 
            ${tokenInfos.map(token => `(
                '${token.id}', 
                ${token.name ? `'${token.name}'` : "''"}, 
                ${token.image ? `'${token.image}'` : "''"}, 
                ${token.symbol ? `'${token.symbol}'` : "''"},
                ${token.data ? `'${token.data}'` : "''"},
                ${token.cap || 0}, 
                ${token.premine || 0}, 
                ${token.minted || 0}, 
                ${token.mintAmount || 0}, 
                ${token.totalSupply || 0}, 
                ${token.progress || 0}, 
                ${token.mintActive || 0}, 
                ${token.updateHeight || 0}
            )`).join(',')}
            ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                symbol = VALUES(symbol),
                data = VALUES(data),
                cap = VALUES(cap),
                premine = VALUES(premine),
                minted = VALUES(minted),
                mint_amount = VALUES(mint_amount),
                total_supply = VALUES(total_supply),
                progress = VALUES(progress),
                mint_active = VALUES(mint_active),
                update_height = VALUES(update_height)
            `;

            await sequelize.query(upsertQuery, {
                type: QueryTypes.INSERT
            });
        } catch (err) {
            logger.error('Batch update tokenInfo error:', err);
            throw new Error(`Batch update tokenInfo error: ${err.message}`);
        }
    }

    static async bulkUpsertTokensInBatches(tokenInfos, batchSize = 100) {
        for (let i = 0; i < tokenInfos.length; i += batchSize) {
            const batch = tokenInfos.slice(i, i + batchSize);
            await this.bulkUpsertTokens(batch);
        }
        return tokenInfos;
    }

    static async batchUpdateTokenStats(tokenStatsList) {
        try {
            const upsertQuery = `
                INSERT INTO token_info
                (id, price_change_24h, price_change_7d, price_change_30d,
                 trading_volume_24h, trading_volume_7d, trading_volume_30d,
                 total_trading_volume, trading_count_24h, trading_count_7d,
                 trading_count_30d, total_trading_count)
                VALUES ${tokenStatsList.map(data => `(
                    '${data.id}', 
                    ${data.priceChange24h || 0}, 
                    ${data.priceChange7d || 0}, 
                    ${data.priceChange30d || 0}, 
                    ${data.tradingVolume24h || 0}, 
                    ${data.tradingVolume7d || 0}, 
                    ${data.tradingVolume30d || 0}, 
                    ${data.totalTradingVolume || 0}, 
                    ${data.tradingCount24h || 0}, 
                    ${data.tradingCount7d || 0}, 
                    ${data.tradingCount30d || 0}, 
                    ${data.totalTradingCount || 0}
            )`).join(',')}
                ON DUPLICATE KEY UPDATE
                    price_change_24h = VALUES(price_change_24h),
                    price_change_7d = VALUES(price_change_7d),
                    price_change_30d = VALUES(price_change_30d),
                    trading_volume_24h = VALUES(trading_volume_24h),
                    trading_volume_7d = VALUES(trading_volume_7d),
                    trading_volume_30d = VALUES(trading_volume_30d),
                    total_trading_volume = VALUES(total_trading_volume),
                    trading_count_24h = VALUES(trading_count_24h),
                    trading_count_7d = VALUES(trading_count_7d),
                    trading_count_30d = VALUES(trading_count_30d),
                    total_trading_count = VALUES(total_trading_count)
            `;

            await sequelize.query(upsertQuery, {
                type: QueryTypes.INSERT
            });
        } catch (error) {
            logger.error('Batch update tokenStats error:', error);
            throw new Error('Batch update tokenStats error');
        }
    }

    static async batchUpdateTokenStatsInBatches(tokenStatsList, batchSize = 100) {
        for (let i = 0; i < tokenStatsList.length; i += batchSize) {
            const batch = tokenStatsList.slice(i, i + batchSize);
            await this.batchUpdateTokenStats(batch);
        }
    }

}
