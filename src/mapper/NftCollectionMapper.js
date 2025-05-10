import NftCollection from '../models/NftCollection.js';
import sequelize from '../lib/SequelizeHelper.js';
import { QueryTypes } from 'sequelize';

export default class NftCollectionMapper {

    static async getAllNftCollection() {
        return await NftCollection.findAll({
            raw: true
        });
    }


    static async batchUpdateNftCollectionStatsInBatches(collectionStatsList, batchSize = 100) {
        for (let i = 0; i < collectionStatsList.length; i += batchSize) {
            const batch = collectionStatsList.slice(i, i + batchSize);
            await this.batchUpdateNftCollectionStats(batch);
        }
    }

    static async batchUpdateNftCollectionStats(collectionStatsList) {
        const upsertQuery = `
            INSERT INTO token_info (id, 
            price_change_24h, price_change_7d, price_change_30d,
                 trading_volume_24h, trading_volume_7d, trading_volume_30d,
                 total_trading_volume, trading_count_24h, trading_count_7d,
                 trading_count_30d, total_trading_count)
            VALUES ${collectionStatsList.map((stats, index) => `(
                '${stats.id}',
                ${stats.priceChange24h || 0}, 
                ${stats.priceChange7d || 0}, 
                ${stats.priceChange30d || 0}, 
                ${stats.tradingVolume24h || 0}, 
                ${stats.tradingVolume7d || 0}, 
                ${stats.tradingVolume30d || 0}, 
                ${stats.totalTradingVolume || 0}, 
                ${stats.tradingCount24h || 0}, 
                ${stats.tradingCount7d || 0}, 
                ${stats.tradingCount30d || 0}, 
                ${stats.totalTradingCount || 0}
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
    }

    static async updateMarketCap(id, marketCap) {
        await NftCollection.update(
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

    static async updateFloorPrice(id, floorPrice) {
        await NftCollection.update(
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
}
