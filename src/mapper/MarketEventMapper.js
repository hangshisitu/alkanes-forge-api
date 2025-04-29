import MarketEvent from "../models/MarkeEvent.js";
import {Op, QueryTypes} from "sequelize";
import {Constants} from "../conf/constants.js";
import sequelize from "../lib/SequelizeHelper.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import * as logger from '../conf/logger.js';

export default class MarketEventMapper {

    static getEventCacheKey(alkanesId, type, address, page, size) {
        return `events:${alkanesId}:${type}:${address}:${page}:${size}`;
    }

    static async getAllEvents(alkanesId, type, address, page, size) {
        const cacheKey = MarketEventMapper.getEventCacheKey(alkanesId, type, address, page, size);
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }

        const whereClause = {
            alkanesId: alkanesId
        };

        if (type) {
            whereClause.type = type;
        }

        if (address) {
            whereClause[Op.or] = [
                { sellerAddress: address },
                { buyerAddress: address }
            ];
        }
        whereClause.createdAt = {
            [Op.lt]: new Date(),
        };

        const { count, rows } = await MarketEvent.findAndCountAll({
            attributes: ['type', 'tokenAmount', 'listingPrice', 'listingAmount', 'sellerAddress', 'buyerAddress', 'txHash', 'updatedAt'],
            where: whereClause,
            order: [["updatedAt", "DESC"], ["id", "ASC"]],
            limit: size,
            offset: (page - 1) * size
        });

        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };

        // 写缓存，10秒有效期
        await RedisHelper.setEx(cacheKey, 10, JSON.stringify(result));
        return result;
    }

    /**
     * 查询 24 小时内所有代币的交易统计
     * @param {number} [hoursRange] 距离当前时间的小时数（可选）
     *
     * @returns {Promise<Map>} { alkanesId => { totalVolume, tradeCount } }
     */
    static async getStatsMapForHours(hoursRange= 24) {
        try {
            const date = new Date();
            date.setHours(date.getHours() - hoursRange); // 计算 24 小时前的时间

            const stats = await sequelize.query(`
                SELECT 
                    alkanes_id AS alkanesId,
                    SUM(listing_amount) AS totalVolume,
                    COUNT(*) AS tradeCount
                FROM market_event
                WHERE created_at >= :startDate
                    AND type = 2
                GROUP BY alkanes_id;
            `, {
                replacements: { startDate: date },
                type: QueryTypes.SELECT,
                raw: true
            });

            // 将查询结果转化为 Map 格式
            return stats.reduce((acc, item) => {
                acc[item.alkanesId] = {
                    totalVolume: item.totalVolume || 0,
                    tradeCount: item.tradeCount || 0
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error in getStatsMapFor24Hours:', error);
            throw error;
        }
    }

    static async queryTradesInLastHour(alkanesId, startTime, endTime) {
        return await MarketEvent.findAll({
            where: {
                alkanesId: alkanesId,
                type: Constants.MARKET_EVENT.SOLD,
                updatedAt: {
                    [Op.between]: [startTime, endTime],
                },
            },
        });
    }

    static async upsertEvent(event) {
        return await MarketEvent.upsert(event);
    }

    static async bulkUpsertEvent(eventList) {
        if (!eventList || eventList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['listingOutput', 'type'];
        return await MarketEvent.bulkCreate(eventList, {
            updateOnDuplicate: Object.keys(eventList[0]).filter(key => !uniqueKeyFields.includes(key)),
            returning: false
        });
    }

}
