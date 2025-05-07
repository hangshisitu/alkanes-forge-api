import NftCollectionMapper from '../mapper/NftCollectionMapper.js';
import NftMarketEventMapper from '../mapper/NftMarketEventMapper.js';
import NftCollectionStatsMapper from '../mapper/NftCollectionStatsMapper.js';
import BaseUtil from '../utils/BaseUtil.js';
import * as logger from '../conf/logger.js';
import BigNumber from "bignumber.js";
import {Constants} from '../conf/constants.js';

export default class NftCollectionStatsService {

    static async refreshNftCollectionStatsForTimeRange(startTime, endTime) {
        const nftCollectionList = await NftCollectionMapper.getAllNftCollection();
        for (const nftCollection of nftCollectionList) {
            const trades = await NftMarketEventMapper.queryTradesInLastHour(nftCollection.id, startTime, endTime);
            if (trades.length === 0) {
                continue;
            }

            const averagePrice = trades.reduce((sum, trade) => sum + trade.listingPrice, 0) / trades.length;
            const totalAmount = trades.reduce((sum, trade) => sum + trade.tokenAmount, 0);
            const totalVolume = trades.reduce((sum, trade) => sum + trade.listingAmount, 0);
            const tradeCount = trades.length;

            const stats = {
                id: BaseUtil.genId(),
                collectionId: nftCollection.id,
                statsDate: startTime,
                averagePrice,
                totalAmount,
                totalVolume,
                tradeCount
            };

            await NftCollectionStatsMapper.upsertStats(stats);

            const marketCap = new BigNumber(averagePrice)
                .multipliedBy(nftCollection.totalSupply)
                .dividedBy(10 ** 8)
                .integerValue(BigNumber.ROUND_CEIL)
                .toNumber();
            await NftCollectionMapper.updateMarketCap(nftCollection.id, marketCap);

            logger.info(`UTC startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}, stats: ${JSON.stringify(stats)}`);
        }
    }

    static async queryCollectionStats(collectionId, timeFrame) {
        const now = new Date();
        let startDate;

        if (timeFrame === Constants.NFT_COLLECTION_STATS_TIME_FRAME.DAY7) {
            startDate = new Date();
            startDate.setDate(now.getDate() - 7);
        } else if (timeFrame === Constants.NFT_COLLECTION_STATS_TIME_FRAME.DAY30) {
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
        } else {
            startDate = new Date();
            startDate.setHours(now.getHours() - 24);
        }

        if (timeFrame === Constants.NFT_COLLECTION_STATS_TIME_FRAME.HOUR) {
            return NftCollectionStatsMapper.queryStatsInHourFrame(collectionId, startDate, now);
        }
        return NftCollectionStatsMapper.queryStatsInDayFrame(collectionId, startDate, now);
    };

}



