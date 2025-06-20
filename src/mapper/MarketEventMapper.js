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
            attributes: ['type', 'tokenAmount', 'listingPrice', 'listingAmount', 'sellerAddress', 'buyerAddress', 'txHash', 'createdAt', 'txConfirmedHeight'],
            where: whereClause,
            order: [["createdAt", "DESC"], ["id", "ASC"]],
            limit: size,
            offset: (page - 1) * size
        });

        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows.map(row => {
                row = row.toJSON();
                return {
                    ...row,
                    createdAt: null,
                    updatedAt: row.createdAt
                }
            }),
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
        const date = new Date();
        date.setHours(date.getHours() - hoursRange); // 计算 24 小时前的时间

        return await this.getStatsMapForTimeRange(date, new Date());
    }

    static async getStatsMapForTimeRange(startTime, endTime) {
        try {
            const stats = await sequelize.query(`
                SELECT 
                    alkanes_id AS alkanesId,
                    SUM(listing_amount) AS totalVolume,
                    CAST(SUM(listing_amount) AS DECIMAL(65,18)) / CAST(SUM(token_amount) AS DECIMAL(65,18)) AS avgPrice,
                    SUM(token_amount) AS totalTokenAmount,
                    COUNT(*) AS tradeCount
                FROM market_event
                WHERE created_at >= :startDate
                    AND created_at < :endDate
                    AND type = 2
                GROUP BY alkanes_id;
            `, {
                replacements: { startDate: startTime, endDate: endTime },
                type: QueryTypes.SELECT,
                raw: true
            });

            // 将查询结果转化为 Map 格式
            return stats.reduce((acc, item) => {
                acc[item.alkanesId] = {
                    totalVolume: item.totalVolume || 0,
                    avgPrice: item.avgPrice || 0,
                    totalTokenAmount: item.totalTokenAmount || 0,
                    tradeCount: item.tradeCount || 0
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error in getStatsMapForTimeRange:', error);
            throw error;
        }
    }

    static async getTokenStatsForTimeRange(alkanesId, startTime, endTime) {
        try {
            const stats = await sequelize.query(`
                SELECT 
                    SUM(listing_amount) AS totalVolume,
                    CAST(SUM(listing_amount) AS DECIMAL(65,18)) / CAST(SUM(token_amount) AS DECIMAL(65,18)) AS avgPrice,
                    SUM(token_amount) AS totalTokenAmount,
                    COUNT(*) AS tradeCount
                FROM market_event
                WHERE created_at >= :startDate
                    AND created_at < :endDate
                    AND type = 2
                    AND alkanes_id = :alkanesId
            `, {
                replacements: { startDate: startTime, endDate: endTime, alkanesId: alkanesId },
                type: QueryTypes.SELECT,
                raw: true
            });
            const stat = stats[0];
            return {
                totalVolume: stat?.totalVolume || 0,
                avgPrice: stat?.avgPrice || 0,
                totalTokenAmount: stat?.totalTokenAmount || 0,
                tradeCount: stat?.tradeCount || 0
            }
        } catch (error) {
            logger.error('Error in getTokenStatsForTimeRange:', error);
            throw error;
        }
    }
    

    static async queryTradesInLastHour(alkanesId, startTime, endTime) {
        return await MarketEvent.findAll({
            where: {
                alkanesId: alkanesId,
                type: Constants.MARKET_EVENT.SOLD,
                createdAt: {
                    [Op.between]: [startTime, endTime],
                },
            },
        });
    }

    static async upsertEvent(event) {
        return await MarketEvent.upsert(event);
    }

    static async bulkUpsertEvent(eventList, transaction = null) {
        if (!eventList || eventList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['listing_output', 'type'];
        const updatableFields = Object.keys(eventList[0]).filter(key => !uniqueKeyFields.includes(key));
        return await MarketEvent.bulkCreate(eventList, {
            updateOnDuplicate: updatableFields,
            returning: false,
            transaction
        });
    }

    static async updateEventTxHash(oldTxid, newTxid, transaction = null) {
        if (!oldTxid || !newTxid) {
            return [];
        }
        return await MarketEvent.update({
            txHash: newTxid
        }, {
            where: {
                txHash: oldTxid
            }, transaction
        });
    }

    static async bulkDeleteSoldEvent(listingOutputList) {
        return await MarketEvent.destroy({
            where: {
                listingOutput: { [Op.in]: listingOutputList },
                type: Constants.MARKET_EVENT.SOLD
            }
        });
    }

    static async getPendingSoldEvents(page, size) {
        return await MarketEvent.findAll({
            where: {
                type: Constants.MARKET_EVENT.SOLD,
                txConfirmedHeight: 0
            },
            order: [["createdAt", "DESC"], ["id", "ASC"]],
            limit: size,
            offset: (page - 1) * size
        }, {
            raw: true
        });
    }

    static async updateEventById(id, data, transaction = null) {
        return await MarketEvent.update(data, {
            where: { id },
            transaction
        });
    }

    static async deleteEventById(id) {
        return await MarketEvent.destroy({
            where: { id }
        });
    }

    static async rollbackConfirmed(blockHeight) {
        return await MarketEvent.update({
            txConfirmedHeight: 0
        }, {
            where: {
                txConfirmedHeight: { [Op.gte]: blockHeight },
                type: Constants.MARKET_EVENT.SOLD
            }
        });
    }

    static async getSoldEventByListingOutput(listingOutput) {
        return await MarketEvent.findOne({
            where: {
                listingOutput: listingOutput,
                type: Constants.MARKET_EVENT.SOLD
            },
            raw: true
        });
    }

    static async getSoldEventByListingOutputs(listingOutputs) {
        return await MarketEvent.findAll({
            where: {
                listingOutput: { [Op.in]: listingOutputs },
                type: Constants.MARKET_EVENT.SOLD
            },
            raw: true
        });
    }

    static async getUserTrades(alkanesId, userAddress, page, size) {
        const { count, rows } = await MarketEvent.findAndCountAll({
            where: {
                alkanesId: alkanesId,
                type: Constants.MARKET_EVENT.SOLD,
                [Op.or]: [
                    { buyerAddress: userAddress },
                    { sellerAddress: userAddress }
                ]
            },
            order: [["createdAt", "DESC"], ["id", "ASC"]],
            limit: size,
            offset: (page - 1) * size,
        });
        return {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows.map(row => {
                row = row.toJSON();
                return {
                    ...row,
                    createdAt: null,
                    updatedAt: row.createdAt
                }
            }),
        };
    }

    static async getSoldEventsByTxId(txid) {
        return await MarketEvent.findAll({
            where: {
                txHash: txid,
                type: Constants.MARKET_EVENT.SOLD
            },
            raw: true,
        });
    }

    static async getSoldEventsByBlock(block) {
        return await MarketEvent.findAll({
            where: {
                txConfirmedHeight: block,
            },
            raw: true,
        });
    }
}
