import TokenStatsMapper from '../mapper/TokenStatsMapper.js';
import AlkanesService from "./AlkanesService.js";
import MarketEventMapper from "../mapper/MarketEventMapper.js";
import {nanoid} from "nanoid";
import {Constants} from "../conf/constants.js";

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
        for (const alkanes of alkanesList) {
            const trades = await MarketEventMapper.queryTradesInLastHour(alkanes.id, startTime, endTime);
            if (trades.length === 0) {
                continue;
            }

            const averagePrice = trades.reduce((sum, trade) => sum + trade.listingPrice, 0) / trades.length;
            const totalAmount = trades.reduce((sum, trade) => sum + trade.tokenAmount, 0);
            const totalVolume = trades.reduce((sum, trade) => sum + trade.listingAmount, 0);
            const tradeCount = trades.length;

            const stats = {
                id: nanoid(),
                alkanesId: alkanes.id,
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


}
