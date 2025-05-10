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
                updatedAt: {
                    [Op.between]: [startTime, endTime],
                },
            },
            raw: true,
        });
    }
    

    static async getStatsMapForHours(hoursRange= 24) {
        try {
            const date = new Date();
            date.setHours(date.getHours() - hoursRange); // 计算 24 小时前的时间

            const stats = await sequelize.query(`
                SELECT 
                    collection_id AS collectionId,
                    SUM(listing_amount) AS totalVolume,
                    COUNT(*) AS tradeCount
                FROM nft_market_event
                WHERE created_at >= :startDate
                    AND type = 2
                GROUP BY collection_id;
            `, {
                replacements: { startDate: date },
                type: QueryTypes.SELECT,
                raw: true
            });

            // 将查询结果转化为 Map 格式
            return stats.reduce((acc, item) => {
                acc[item.collectionId] = {
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

    static async bulkUpsertEvent(eventList) {
        if (!eventList || eventList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['listing_output', 'type'];
        const updatableFields = Object.keys(eventList[0]).filter(key => !uniqueKeyFields.includes(key));
        return await NftMarketEvent.bulkCreate(eventList, {
            updateOnDuplicate: updatableFields,
            returning: false
        });
    }
}

