import sequelize from '../lib/SequelizeHelper.js';
import { QueryTypes } from 'sequelize';
import * as logger from '../conf/logger.js';
import { Constants } from '../conf/constants.js';
import { Op } from 'sequelize';
import NftMarketEvent from '../models/NftMarketEvent.js';

export default class NftMarketEventMapper {

    static async queryTradesInLastHour(collectionId, startTime, endTime) {
        return await NftMarketEvent.findAll({
            where: {
                collectionId: collectionId,
                type: Constants.MARKET_EVENT.SOLD,
                createdAt: {
                    [Op.between]: [startTime, endTime],
                },
            },
            raw: true,
        });
    }
    

    static async getStatsMapForHours(hoursRange= 24) {
        const date = new Date();
        date.setHours(date.getHours() - hoursRange); // 计算 24 小时前的时间
        return await this.getStatsMapForTimeRange(date, new Date());
    }

    static async getStatsMapForTimeRange(startTime, endTime) {
        try {
            const stats = await sequelize.query(`
                SELECT 
                    collection_id AS collectionId,
                    SUM(listing_price) AS totalVolume,
                    CAST(SUM(listing_price) AS DECIMAL(65,18)) / CAST(COUNT(*) AS DECIMAL(65,18)) AS avgPrice,
                    COUNT(*) AS tradeCount
                FROM nft_market_event
                WHERE created_at >= :startDate
                    AND created_at < :endDate
                    AND type = 2
                GROUP BY collection_id;
            `, {
                replacements: { startDate: startTime, endDate: endTime },
                type: QueryTypes.SELECT,
                raw: true
            });

            // 将查询结果转化为 Map 格式
            return stats.reduce((acc, item) => {
                acc[item.collectionId] = {
                    totalVolume: item.totalVolume || 0,
                    avgPrice: item.avgPrice || 0,
                    tradeCount: item.tradeCount || 0
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error in getStatsMapFor24Hours:', error);
            throw error;
        }
    }

    static async getNftStatsForTimeRange(collectionId, startTime, endTime) {
        try {
            const stats = await sequelize.query(`
                SELECT 
                    SUM(listing_price) AS totalVolume,
                    CAST(SUM(listing_price) AS DECIMAL(65,18)) / CAST(COUNT(*) AS DECIMAL(65,18)) AS avgPrice,
                    COUNT(*) AS tradeCount
                FROM nft_market_event
                WHERE created_at >= :startDate
                    AND created_at < :endDate
                    AND type = 2
                    AND collection_id = :collectionId
            `, {
                replacements: { startDate: startTime, endDate: endTime, collectionId: collectionId },
                type: QueryTypes.SELECT,
                raw: true
            });
            const stat = stats[0];
            return {
                totalVolume: stat?.totalVolume || 0,
                avgPrice: stat?.avgPrice || 0,
                tradeCount: stat?.tradeCount || 0
            }
        } catch (error) {
            logger.error('Error in getNftStatsForTimeRange:', error);
            throw error;
        }
    }

    static async bulkUpsertEvent(eventList, transaction = null) {
        if (!eventList || eventList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['listing_output', 'type'];
        const updatableFields = Object.keys(eventList[0]).filter(key => !uniqueKeyFields.includes(key));
        return await NftMarketEvent.bulkCreate(eventList, {
            updateOnDuplicate: updatableFields,
            returning: false,
            transaction: transaction
        });
    }

    static async upsertEvent(event) {
        return await NftMarketEvent.upsert(event);
    }

    static async bulkDeleteSoldEvent(listingOutputList) {
        return await NftMarketEvent.destroy({
            where: {
                listingOutput: listingOutputList,
                type: Constants.MARKET_EVENT.SOLD
            }
        });
    }

    static async getPendingSoldEvents(page, size) {
        return await NftMarketEvent.findAll({
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
        return await NftMarketEvent.update(data, {
            where: { id },
            transaction
        });
    }

    static async deleteEventById(id) {
        return await NftMarketEvent.destroy({
            where: { id }
        });
    }

    static async rollbackConfirmed(blockHeight) {
        return await NftMarketEvent.update({
            txConfirmedHeight: 0
        }, {
            where: {
                txConfirmedHeight: { [Op.gte]: blockHeight },
                type: Constants.MARKET_EVENT.SOLD
            }
        });
    }

    static async getSoldEventByListingOutput(listingOutput) {
        return await NftMarketEvent.findOne({
            where: {
                listingOutput: listingOutput,
                type: Constants.MARKET_EVENT.SOLD
            },
            raw: true
        });
    }

    static async getSoldEventByListingOutputs(listingOutputs) {
        return await NftMarketEvent.findAll({
            where: {
                listingOutput: { [Op.in]: listingOutputs },
                type: Constants.MARKET_EVENT.SOLD
            },
            raw: true
        });
    }
    static async updateEventTxHash(oldTxid, newTxid, transaction = null) {
        return await NftMarketEvent.update({
            txHash: newTxid
        }, {
            where: {
                txHash: oldTxid
            }, transaction
        });
    }

    static async getUserTrades(collectionId, userAddress, page, size) {
        const { count, rows } = await NftMarketEvent.findAndCountAll({
            where: {
                collectionId: collectionId,
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
        return await NftMarketEvent.findAll({
            where: {
                txHash: txid,
                type: Constants.MARKET_EVENT.SOLD
            },
            raw: true,
        });
    }
    
    static async getSoldEventsByBlock(block) {
        return await NftMarketEvent.findAll({
            where: {
                txConfirmedHeight: block,
            },
            raw: true,
        });
    }
    
}
