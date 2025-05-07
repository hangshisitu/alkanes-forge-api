import NftCollectionStats from '../models/NftCollectionStats.js';
import {QueryTypes, Op} from 'sequelize';
import sequelize from '../lib/SequelizeHelper.js';

export default class NftCollectionStatsMapper {

    static async upsertStats(stats) {
        return await NftCollectionStats.upsert(stats);
    }

    static async queryStatsInHourFrame(collectionId, startDate, endDate) {
        return await NftCollectionStats.findAll({
            where: {
                collection_id: collectionId,
                stats_date: {
                    [Op.gte]: startDate,
                    [Op.lt]: endDate,
                },
            },
            order: [['statsDate', 'ASC']],
            attributes: ['statsDate', 'averagePrice', 'totalVolume'],
            raw: true,
        });
    }
    
    static async queryStatsInDayFrame(collectionId, startDate, endDate) {
        return await sequelize.query(`
            SELECT 
              DATE_FORMAT(stats_date, '%Y-%m-%d') AS statsDate, 
              AVG(average_price) AS averagePrice, 
              SUM(total_volume) AS totalVolume
            FROM 
              nft_collection_stats
            WHERE 
              collection_id = :collectionId AND
              stats_date >= :startDate AND 
              stats_date < :endDate
            GROUP BY 
              statsDate
            ORDER BY 
              statsDate ASC;
          `, {
            replacements: {
                collectionId: collectionId,
                startDate: startDate,
                endDate: endDate
            },
            type: QueryTypes.SELECT,
            raw: true,
        });
    }
}


