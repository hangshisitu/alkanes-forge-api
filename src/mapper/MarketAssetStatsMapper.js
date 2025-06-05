import sequelize from '../lib/SequelizeHelper.js';

export default class MarketAssetStatsMapper {

    static async getAllFloorPriceByTimeId(startTimeId, endTimeId) {
        const sql = `
            select alkanes_id as alkanesId, sum(floor_price) / count(1) as floorPrice
            FROM market_asset_stats 
            where 
                time_id >= :startTimeId and 
                time_id < :endTimeId
            group by alkanes_id
        `;
        const result = await sequelize.query(sql, {
            replacements: { startTimeId, endTimeId },
            type: sequelize.QueryTypes.SELECT,
            raw: true
        });
        return result.reduce((acc, curr) => {
            acc[curr.alkanesId] = curr.floorPrice;
            return acc;
        }, {});
    }

}