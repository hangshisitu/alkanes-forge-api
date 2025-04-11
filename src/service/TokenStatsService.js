import TokenStatsMapper from '../mapper/TokenStatsMapper.js';
import MarketEventMapper from "../mapper/MarketEventMapper.js";
import {nanoid} from "nanoid";
import {Constants} from "../conf/constants.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import BigNumber from "bignumber.js";

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
        const tokenList = await TokenInfoMapper.getAllTokens();
        for (const token of tokenList) {
            const trades = await MarketEventMapper.queryTradesInLastHour(token.id, startTime, endTime);
            if (trades.length === 0) {
                continue;
            }

            const averagePrice = trades.reduce((sum, trade) => sum + trade.listingPrice, 0) / trades.length;
            const totalAmount = trades.reduce((sum, trade) => sum + trade.tokenAmount, 0);
            const totalVolume = trades.reduce((sum, trade) => sum + trade.listingAmount, 0);
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

            const marketCap = new BigNumber(averagePrice)
                .multipliedBy(token.totalSupply)
                .dividedBy(10 ** 8)
                .integerValue(BigNumber.ROUND_CEIL)
                .toNumber();
            await TokenInfoMapper.updateMarketCap(token.id, marketCap);

            console.log(`UTC startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}, stats: ${JSON.stringify(stats)}`);
        }
    }


}
