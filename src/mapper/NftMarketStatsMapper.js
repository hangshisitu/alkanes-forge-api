import sequelize from '../lib/SequelizeHelper.js';
import { QueryTypes } from 'sequelize';
import * as logger from '../conf/logger.js';

export default class NftMarketStatsMapper {

    static async getStatsMapByCollectionIds(collectionIds, hoursRange) {
        let whereClause = 'WHERE collection_id IN (:collectionIds)';
        const replacements = { collectionIds: collectionIds };

        if (hoursRange) {
            const date = new Date();
            date.setHours(date.getHours() - hoursRange);

            whereClause += ' AND stats_date >= :startDate';
            replacements.startDate = date;
        }

        const stats = await sequelize.query(`
            SELECT 
                collection_id AS collectionId,
                SUM(total_volume) AS totalVolume, 
                SUM(trade_count) AS tradeCount
            FROM nft_collection_stats
            ${whereClause}
            GROUP BY collection_id;
        `, {
            replacements,
            type: QueryTypes.SELECT,
            raw: true
        });

        return stats.reduce((acc, item) => {
            acc[item.collectionId] = {
                totalVolume: item.totalVolume || 0,
                tradeCount: item.tradeCount || 0
            };
            return acc;
        }, {});
    }

}