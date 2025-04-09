import TokenStatsMapper from '../mapper/TokenStatsMapper.js';
import AlkanesService from "./AlkanesService.js";
import MarketEventMapper from "../mapper/MarketEventMapper.js";
import {nanoid} from "nanoid";
import {Constants} from "../conf/constants.js";
import sequelize from "../lib/SequelizeHelper.js";
import {QueryTypes} from "sequelize";

export default class TokenStatsService {

    static async queryTokenStats(alkanesId, timeFrame) {
        const now = new Date();
        let startDate;

        if (timeFrame === Constants.TOKEN_STATS_TIME_FRAME.DAY7) {
            startDate = new Date();
            startDate.setHours(now.getDate() - 7);
        } else if (timeFrame === Constants.TOKEN_STATS_TIME_FRAME.DAY30) {
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
        } else {
            startDate = new Date();
            startDate.setHours(now.getHours() - 24);
        }

        if (timeFrame === Constants.TOKEN_STATS_TIME_FRAME.HOUR) {
            return TokenStatsMapper.queryStatsInHourFrame(alkanesId, startDate, now);
        }
        return TokenStatsMapper.queryStatsInDayFrame(alkanesId, startDate, now);
    };

    static async refreshStatsForTimeRange(startTime, endTime) {
        const { alkanesList } = await AlkanesService.getAllAlkanes();
        for (const token of alkanesList) {
            const trades = await MarketEventMapper.queryTradesInLastHour(token.id, startTime, endTime);
            if (trades.length === 0) {
                continue;
            }

            const averagePrice = trades.reduce((sum, trade) => sum + trade.listingPrice, 0) / trades.length;
            const totalVolume = trades.reduce((sum, trade) => sum + trade.tokenAmount, 0);
            const totalAmount = trades.reduce((sum, trade) => sum + trade.listingAmount, 0);
            const tradeCount = trades.length;

            const stats = {
                id: nanoid(),
                alkanesId: token.id,
                statsDate: startTime,
                averagePrice,
                totalAmount,
                totalVolume,
                tradeCount
            };

            await TokenStatsMapper.upsertStats(stats);
            console.log(`UTC startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}, stats: ${JSON.stringify(stats)}`);
        }
    }

    static async refreshPriceChanges() {
        const timeframes = [
            { label: '24h', interval: '24 HOUR' },
            { label: '7d', interval: '7 DAY' },
            { label: '30d', interval: '30 DAY' }
        ];

        // 获取每个 alkanes_id 的最新成交价
        const latestPrices = await sequelize.query(`
            SELECT me1.alkanes_id AS alkanesId, me1.listing_price AS latestPrice
            FROM market_event me1
            INNER JOIN (
                SELECT alkanes_id, MAX(created_at) as latest_time
                FROM market_event
                WHERE type = 2 and created_at < now()
                GROUP BY alkanes_id
            ) me2 ON me1.alkanes_id = me2.alkanes_id AND me1.created_at = me2.latest_time
            WHERE me1.type = 2;
        `, { type: QueryTypes.SELECT });

        // 创建一个字典来存储最新价格
        const latestPriceMap = {};
        latestPrices.forEach(row => {
            latestPriceMap[row.alkanesId] = row.latestPrice;
        });

        for (const timeframe of timeframes) {
            // 获取每个代币在时间段开始时的价格
            const historicalPrices = await sequelize.query(`
                SELECT ts1.alkanes_id AS alkanesId, ts1.average_price AS historicalPrice
                FROM token_stats ts1
                INNER JOIN (
                    SELECT alkanes_id, MIN(stats_date) as earliest_date
                    FROM token_stats
                    WHERE stats_date >= DATE_SUB(NOW(), INTERVAL ${timeframe.interval})
                    GROUP BY alkanes_id
                ) ts2 ON ts1.alkanes_id = ts2.alkanes_id AND ts1.stats_date = ts2.earliest_date;
            `, { type: QueryTypes.SELECT });

            // 将历史价格映射到字典以便快速查找
            const historicalPriceMap = {};
            historicalPrices.forEach(row => {
                historicalPriceMap[row.alkanesId] = row.historicalPrice;
            });

            // 批量准备更新数据
            const updatePromises = [];

            for (const alkanesId in latestPriceMap) {
                const recentPrice = latestPriceMap[alkanesId];
                const historicalPrice = historicalPriceMap[alkanesId];

                // 只有当有历史价格时才计算涨跌幅
                if (historicalPrice) {
                    let priceChange = 0;
                    if (historicalPrice > 0) {
                        priceChange = ((recentPrice - historicalPrice) / historicalPrice) * 100;
                    }

                    // 添加到批量更新队列
                    updatePromises.push(
                        sequelize.query(`
                        UPDATE token_info
                        SET price_change_${timeframe.label} = :priceChange
                        WHERE id = :alkanesId
                    `, {
                            replacements: {
                                priceChange: priceChange,
                                alkanesId: alkanesId,
                            }
                        })
                    );
                }
            }

            // 并行执行所有更新
            await Promise.all(updatePromises);
        }

        console.log(`Price changes refreshed for all timeframes`);
    }

}
