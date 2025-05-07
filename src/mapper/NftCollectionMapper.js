import NftCollection from '../models/NftCollection.js';
import sequelize from '../lib/SequelizeHelper.js';
import { QueryTypes } from 'sequelize';

export default class NftCollectionMapper {


    static async batchUpdateNftCollectionStatsInBatches(collectionStatsList, batchSize = 100) {
        for (let i = 0; i < collectionStatsList.length; i += batchSize) {
            const batch = collectionStatsList.slice(i, i + batchSize);
            await this.batchUpdateNftCollectionStats(batch);
        }
    }

    static async batchUpdateNftCollectionStats(collectionStatsList) {
        const upsertQuery = `
            INSERT INTO nft_collection_stats (id, trading_volume_24h, trading_count_24h, trading_volume_7d, trading_count_7d, trading_volume_30d, trading_count_30d, total_trading_volume, total_trading_count)
            VALUES ${collectionStatsList.map((stats, index) => `(
                ${stats.id},
                ${stats.tradingVolume24h},
                ${stats.tradingCount24h},
                ${stats.tradingVolume7d},
                ${stats.tradingCount7d},
                ${stats.tradingVolume30d},
                ${stats.tradingCount30d},
                ${stats.totalTradingVolume},
                ${stats.totalTradingCount}
            )`).join(',')}
            ON DUPLICATE KEY UPDATE
                trading_volume_24h = VALUES(trading_volume_24h),
                trading_count_24h = VALUES(trading_count_24h),
                trading_volume_7d = VALUES(trading_volume_7d),
                trading_count_7d = VALUES(trading_count_7d),
                trading_volume_30d = VALUES(trading_volume_30d),
                trading_count_30d = VALUES(trading_count_30d),
                total_trading_volume = VALUES(total_trading_volume),
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
