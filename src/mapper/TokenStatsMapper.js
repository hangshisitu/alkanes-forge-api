import TokenStats from '../models/TokenStats.js';
import {Op, QueryTypes} from 'sequelize';
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
            attributes: ['statsDate', 'averagePrice', 'totalVolume'],
        });
    }

    static async queryStatsInDayFrame(alkanesId, startDate, endDate) {
        return await sequelize.query(`
            SELECT 
              DATE_FORMAT(stats_date, '%Y-%m-%d') AS statsDate, 
              AVG(average_price) AS averagePrice, 
              SUM(total_volume) AS totalVolume
            FROM 
              token_stats
            WHERE 
              alkanes_id = :alkanesId AND
              stats_date >= :startDate AND 
              stats_date < :endDate
            GROUP BY 
              statsDate
            ORDER BY 
              statsDate ASC;
          `, {
            replacements: {
                alkanesId: alkanesId,
                startDate: startDate,
                endDate: endDate
            },
            type: QueryTypes.SELECT
        });
    }

    /**
     * 获取交易统计（支持时间范围和总统计）
     * @param {string[]} alkanesIds 代币ID数组
     * @param {number} [hoursRange] 距离当前时间的小时数（可选）
     * @returns {Promise<Object>} 交易统计映射
     */
    static async getStatsMapByAlkanesIds(alkanesIds, hoursRange) {
        let whereClause = 'WHERE alkanes_id IN (:alkanesIds)';
        const replacements = { alkanesIds: alkanesIds };

        if (hoursRange) {
            const date = new Date();
            date.setHours(date.getHours() - hoursRange);

            whereClause += ' AND stats_date >= :startDate';
            replacements.startDate = date;
        }

        const stats = await sequelize.query(`
            SELECT 
                alkanes_id AS alkanesId,
                SUM(total_volume) AS totalVolume, 
                SUM(trade_count) AS tradeCount
            FROM token_stats
            ${whereClause}
            GROUP BY alkanes_id;
        `, {
            replacements,
            type: QueryTypes.SELECT,
            raw: true
        });

        return stats.reduce((acc, item) => {
            acc[item.alkanesId] = {
                totalVolume: item.totalVolume || 0,
                tradeCount: item.tradeCount || 0
            };
            return acc;
        }, {});
    }

    static async upsertStats(tokenStats) {
        return await TokenStats.upsert(tokenStats);
    }

}