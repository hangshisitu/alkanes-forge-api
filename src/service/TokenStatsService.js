import TokenStatsMapper from '../mapper/TokenStatsMapper.js';
import MarketEventMapper from "../mapper/MarketEventMapper.js";
import {Constants} from "../conf/constants.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import BigNumber from "bignumber.js";
import BaseUtil from "../utils/BaseUtil.js";
import * as logger from '../conf/logger.js';

export default class TokenStatsService {

    static async queryTokenStats(alkanesId, timeFrame) {
        const now = new Date();
        let startDate;

        if (timeFrame === Constants.TOKEN_STATS_TIME_FRAME.DAY7) {
            startDate = new Date();
            startDate.setDate(now.getDate() - 7);
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
        const additionalStartTime = new Date(startTime.getTime() - 1000 * 60 * 60); // 往前再推一小时
        const tokenList = await TokenInfoMapper.getAllTokens();
        for (const token of tokenList) {
            const trades = await MarketEventMapper.queryTradesInLastHour(token.id, additionalStartTime, endTime);
            if (trades.length === 0) {
                continue;
            }

            const totalAmount = trades.reduce((sum, trade) => new BigNumber(trade.tokenAmount).plus(sum), new BigNumber(0));
            const totalVolume = trades.reduce((sum, trade) => new BigNumber(trade.listingAmount).plus(sum), new BigNumber(0));
            const averagePrice = totalVolume.dividedBy(totalAmount);
            const tradeCount = trades.length;

            const stats = {
                id: BaseUtil.genId(),
                alkanesId: token.id,
                statsDate: startTime,
                averagePrice: averagePrice.toFixed(),
                totalAmount: totalAmount.toFixed(),
                totalVolume: totalVolume.toFixed(),
                tradeCount
            };

            await TokenStatsMapper.upsertStats(stats);

            const marketCap = new BigNumber(averagePrice)
                .multipliedBy(token.totalSupply)
                .dividedBy(10 ** 8)
                .integerValue(BigNumber.ROUND_CEIL)
                .toNumber();
            await TokenInfoMapper.updateMarketCap(token.id, marketCap);

            logger.info(`UTC startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}, stats: ${JSON.stringify(stats)}`);
        }
    }


}
