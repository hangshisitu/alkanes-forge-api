import TokenStats from '../models/TokenStats.js';
import Sequelize, { Op } from 'sequelize';
import sequelize from "../lib/SequelizeHelper.js";

export default class TokenStatsMapper {

    static async queryStatsInHourFrame(alkanesId, startDate, endDate) {
        return await TokenStats.findAll({
            where: {
                alkanes_id: alkanesId,
                stats_date: {
                    [Op.gte]: startDate,
                    [Op.lt]: endDate,
                },
            },
            order: [['statsDate', 'ASC']],
            attributes: ['statsDate', 'averagePrice', 'totalAmount'],
        });
    }

    static async queryStatsInDayFrame(alkanesId, startDate, endDate) {
        const aggregationQuery = `
            SELECT 
              DATE_FORMAT(stats_date, '%Y-%m-%d') AS stats_date, 
              AVG(average_price) AS average_price, 
              SUM(total_amount) AS total_amount
            FROM 
              token_stats
            WHERE 
              alkanes_id = :alkanesId AND
              stats_date >= :startDate AND 
              stats_date < :endDate
            GROUP BY 
              DATE_FORMAT(stats_date, '%Y-%m-%d')
            ORDER BY 
              stats_date ASC;
        `;
        return await sequelize.query(aggregationQuery, {
            replacements: { alkanesId, startDate, endDate },
            type: Sequelize.QueryTypes.SELECT,
        });
    }

    static async upsertStats(tokenStats) {
        return await TokenStats.upsert(tokenStats);
    }

}