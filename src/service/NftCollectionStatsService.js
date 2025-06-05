import NftCollectionMapper from '../mapper/NftCollectionMapper.js';
import NftMarketEventMapper from '../mapper/NftMarketEventMapper.js';
import NftCollectionStatsMapper from '../mapper/NftCollectionStatsMapper.js';
import NftMarketListingMapper from '../mapper/NftMarketListingMapper.js';
import BaseUtil from '../utils/BaseUtil.js';
import * as logger from '../conf/logger.js';
import BigNumber from "bignumber.js";
import {Constants} from '../conf/constants.js';

export default class NftCollectionStatsService {

    static async refreshNftCollectionStatsForTimeRange(startTime, endTime) {
        const additionalStartTime = new Date(startTime.getTime() - 1000 * 60 * 60); // 往前再推一小时
        const nftCollectionList = await NftCollectionMapper.getAllNftCollection();
        for (const nftCollection of nftCollectionList) {
            const trades = await NftMarketEventMapper.queryTradesInLastHour(nftCollection.id, additionalStartTime, endTime);
            if (trades.length === 0) {
                continue;
            }

            const averagePrice = trades.reduce((sum, trade) => new BigNumber(trade.listingPrice).plus(sum), new BigNumber(0)).dividedBy(new BigNumber(trades.length));
            const totalAmount = trades.filter(trade => trade.createdAt >= startTime).reduce((sum, trade) => new BigNumber(trade.tokenAmount).plus(sum), new BigNumber(0));
            const totalVolume = trades.filter(trade => trade.createdAt >= startTime).reduce((sum, trade) => new BigNumber(trade.listingAmount).plus(sum), new BigNumber(0));
            const tradeCount = trades.filter(trade => trade.createdAt >= startTime).length;

            const stats = {
                id: BaseUtil.genId(),
                collectionId: nftCollection.id,
                statsDate: startTime,
                averagePrice: averagePrice.toFixed(),
                totalAmount: totalAmount.toFixed(),
                totalVolume: totalVolume.toFixed(),
                tradeCount
            };

            await NftCollectionStatsMapper.upsertStats(stats);

            const floorListing = await NftMarketListingMapper.getFloorPriceByCollectionId(nftCollection.id);
            if (!floorListing) {
                continue;
            }

            const last24Hours = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
            const recentTrades = await NftMarketEventMapper.queryTradesInLastHour(nftCollection.id, last24Hours, endTime);
            
            if (recentTrades.length < 5) { // 不足以判断地板价是否有异常值, 直接使用地板价
                const marketCap = new BigNumber(floorListing.listingPrice)
                    .multipliedBy(nftCollection.totalSupply)
                    .integerValue(BigNumber.ROUND_CEIL)
                    .toNumber();
                await NftCollectionMapper.updateMarketCap(nftCollection.id, marketCap);
                logger.info(`UTC startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}, stats: ${JSON.stringify(stats)}, floorPrice: ${floorListing.listingPrice}, using floor price due to insufficient trades`);
                continue;
            }

            const prices = recentTrades.map(trade => Number(trade.listingPrice)).sort((a, b) => a - b);
            const medianPrice = prices.length % 2 === 0 
                ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2 
                : prices[Math.floor(prices.length / 2)];

            const floorPrice = Number(floorListing.listingPrice);
            const isOutlier = floorPrice < (medianPrice * 0.5);

            const marketCap = new BigNumber(isOutlier ? medianPrice : floorPrice)
                .multipliedBy(nftCollection.totalSupply)
                .integerValue(BigNumber.ROUND_CEIL)
                .toNumber();
            await NftCollectionMapper.updateMarketCap(nftCollection.id, marketCap);

            logger.info(`UTC startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}, stats: ${JSON.stringify(stats)}, floorPrice: ${floorPrice}, medianPrice: ${medianPrice}, isOutlier: ${isOutlier}`);
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
            startDate.setHours(now.getHours() - 26);
        }

        if (timeFrame === Constants.NFT_COLLECTION_STATS_TIME_FRAME.HOUR) {
            return NftCollectionStatsMapper.queryStatsInHourFrame(collectionId, startDate, now);
        }
        return NftCollectionStatsMapper.queryStatsInDayFrame(collectionId, startDate, now);
    };

}



