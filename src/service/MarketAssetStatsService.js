import MarketAssetStats from '../models/MarketAssetStats.js';
import MarketListingMapper from '../mapper/MarketListingMapper.js';
import NftMarketListingMapper from '../mapper/NftMarketListingMapper.js';
import MarketEventMapper from '../mapper/MarketEventMapper.js';
import NftMarketEventMapper from '../mapper/NftMarketEventMapper.js';
import MarketAssetStatsMapper from '../mapper/MarketAssetStatsMapper.js';

export default class MarketAssetStatsService {

    static getTenMinutesTimeRange(endTime) {
        const minutes = endTime.getMinutes();
        const roundedMinutes = Math.floor(minutes / 10) * 10;
        
        // 设置当前时间到最近的10分钟整数倍
        endTime.setMinutes(roundedMinutes, 0, 0);
        
        // 计算前一个10分钟时间段的结束时间
        endTime = new Date(endTime);
        // 计算前一个10分钟时间段的开始时间
        const startTime = new Date(endTime);
        startTime.setMinutes(startTime.getMinutes() - 10);

        return {
            startTime,
            endTime
        }
    }

    static getTimeId(time) {
        return `${time.getFullYear()}${(time.getMonth() + 1).toString().padStart(2, '0')}${time.getDate().toString().padStart(2, '0')}${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
    }

    static async refreshMarketAssetStats() {
        const { startTime, endTime } = this.getTenMinutesTimeRange(new Date());

        const tokenListings = await MarketListingMapper.getAllFloorPrice();
        const nftListings = await NftMarketListingMapper.getAllFloorPrice();

        const tokenStats = await MarketEventMapper.getStatsMapForTimeRange(startTime, endTime);
        const nftStats = await NftMarketEventMapper.getStatsMapForTimeRange(startTime, endTime);

        const id = this.getTimeId(startTime);

        const marketAssetStatsList = tokenListings.map(tokenListing => {
            const tokenStat = tokenStats[tokenListing.alkanesId];
            return {
                timeId: id,
                alkanesId: tokenListing.alkanesId,
                isNft: false,
                floorPrice: tokenListing.listingPrice,
                avgPrice: tokenStat?.avgPrice || 0,
                amount: tokenStat?.totalTokenAmount || 0,
                volume: tokenStat?.totalVolume || 0,
                tradeCount: tokenStat?.tradeCount || 0,
                startTime,
                endTime
            }
        });
        marketAssetStatsList.push(...nftListings.map(nftListing => {
            const nftStat = nftStats[nftListing.collectionId];
            return {
                timeId: id,
                alkanesId: nftListing.collectionId,
                isNft: true,
                floorPrice: nftListing.listingPrice,
                avgPrice: nftStat?.avgPrice || 0,
                amount: nftStat?.tradeCount || 0,
                volume: nftStat?.totalVolume || 0,
                tradeCount: nftStat?.tradeCount || 0,
                startTime,
                endTime
            }
        }));

        await MarketAssetStats.bulkCreate(marketAssetStatsList, {
            updateOnDuplicate: ['floorPrice', 'avgPrice', 'amount', 'volume', 'tradeCount'],
            returning: false,
        });
    }

    static async getFloorPriceChangeByDayDuration(dayDuration) {
        const now = new Date();
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        let recentStartTimeId;
        let recentEndTimeId;
        let previousStartTimeId;
        let previousEndTimeId;
        if (dayDuration === 1) {
            recentStartTimeId = this.getTimeId(new Date(now.getTime() - 1000 * 60 * 60)); // 最近1小时
            recentEndTimeId = this.getTimeId(now);
            previousStartTimeId = this.getTimeId(new Date(now.getTime() - 1000 * 60 * 60 * 24));
            previousEndTimeId = this.getTimeId(new Date(now.getTime() - 1000 * 60 * 60 * 23));
        } else if (dayDuration > 1) {
            now.setHours(0);
            recentStartTimeId = this.getTimeId(new Date(now.getTime() - 1000 * 60 * 60 * 24)); // 最近1天
            recentEndTimeId = this.getTimeId(now);
            previousStartTimeId = this.getTimeId(new Date(now.getTime() - 1000 * 60 * 60 * 24 * dayDuration));
            previousEndTimeId = this.getTimeId(new Date(now.getTime() - 1000 * 60 * 60 * 24 * (dayDuration - 1)));
        } else {
            throw new Error('dayDuration must be greater than 0');
        }
        const recentFloorPriceMap = await MarketAssetStatsMapper.getAllFloorPriceByTimeId(recentStartTimeId, recentEndTimeId);
        const previousFloorPriceMap = await MarketAssetStatsMapper.getAllFloorPriceByTimeId(previousStartTimeId, previousEndTimeId);
        const alkanesIds = [...new Set([...Object.keys(recentFloorPriceMap), ...Object.keys(previousFloorPriceMap)])];
        return alkanesIds.map(alkanesId => {
            const recentFloorPrice = recentFloorPriceMap[alkanesId] || 0;
            const previousFloorPrice = previousFloorPriceMap[alkanesId] || 0;
            let change = 0;
            if (recentFloorPrice > 0 && previousFloorPrice > 0) {
                change = ((recentFloorPrice - previousFloorPrice) * 100 / previousFloorPrice).toFixed(2);
            } else if (recentFloorPrice > 0) {
                change = 100;
            } else if (previousFloorPrice > 0) {
                change = -100;
            }
            return {
                alkanesId,
                recentFloorPrice,
                previousFloorPrice,
                change
            }
        });
    }
}