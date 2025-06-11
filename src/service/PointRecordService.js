import config from '../conf/config.js';
import BaseUtil from '../utils/BaseUtil.js';
import PointRecordMapper from '../mapper/PointRecordMapper.js';
import {Constants} from '../conf/constants.js';
import NftCollectionService from './NftCollectionService.js';
import TokenInfoService from './TokenInfoService.js';
import MarketEventMapper from '../mapper/MarketEventMapper.js';
import NftMarketEventMapper from '../mapper/NftMarketEventMapper.js';
import NftItemService from './NftItemService.js';

const SATS_PER_POINT = 100;

export default class PointRecordService {

    static calculateTradePoint(amount) {
        return parseInt(`${amount / SATS_PER_POINT}`) || 0;
    }

    static async addTokenTradePointRecord(event, block, transaction = null) {
        if (block < config.point.startBlock) {
            return;
        }
        if (event.type === Constants.MARKET_EVENT.SOLD) {
            await PointRecordMapper.createPointRecord({
                block: block,
                txid: event.txHash,
                address: event.buyerAddress,
                source: Constants.POINT_SOURCE.BUY,
                point: this.calculateTradePoint(event.listingAmount),
                amount: event.listingAmount,
                alkanesId: event.alkanesId,
                isNft: false,
                relatedId: event.listingOutput,
            }, transaction);
        }
    }

    static async addNftTradePointRecord(event, block, transaction = null) {
        if (block < config.point.startBlock) {
            return;
        }
        if (event.type === Constants.MARKET_EVENT.SOLD) {
            await PointRecordMapper.createPointRecord({
                block: block,
                txid: event.txHash,
                address: event.buyerAddress,
                source: Constants.POINT_SOURCE.BUY,
                point: this.calculateTradePoint(event.listingPrice),
                amount: event.listingPrice,
                alkanesId: event.collectionId,
                isNft: true,
                itemId: event.itemId,
                relatedId: event.listingOutput,
            }, transaction);
        }
    }

    // 用户积分总计
    static async getUserPoint(address) {
        const {point, rank, totalPoint, totalAmount} = await PointRecordMapper.getUserPoint(address);
        return {
            point: point ?? 0,
            startBlock: config.point.startBlock,
            rank: rank ?? 0,
            totalPoint: totalPoint ?? 0,
            totalAmount: totalAmount ?? 0,
        };
    }

    // 用户积分明细分页
    static async getUserPointDetail(address, page, size) {
        const {rows, count} = await PointRecordMapper.getUserPointDetail(address, page, size);
        const nftRows = rows.filter(row => row.isNft);
        if (nftRows.length > 0) {
            const collections = await NftCollectionService.getCollectionByIds(nftRows.map(row => row.alkanesId));
            const soldEvents = await NftMarketEventMapper.getSoldEventByListingOutputs(nftRows.map(row => row.relatedId));
            const items = await NftItemService.getItemsByIds(nftRows.map(row => row.itemId));
            nftRows.forEach(row => {
                row.collection = collections.find(collection => collection.id === row.alkanesId);
                row.event = soldEvents.find(event => event.listingOutput === row.relatedId);
                row.item = items.find(item => item.id === row.itemId);
            });
        }
        const tokenRows = rows.filter(row => !row.isNft);
        if (tokenRows.length > 0) {
            const tokenInfos = await TokenInfoService.getTokenList(tokenRows.map(row => row.alkanesId));
            const soldEvents = await MarketEventMapper.getSoldEventByListingOutputs(tokenRows.map(row => row.relatedId));
            tokenRows.forEach(row => {
                row.tokenInfo = tokenInfos.find(tokenInfo => tokenInfo.id === row.alkanesId);
                row.event = soldEvents.find(event => event.listingOutput === row.relatedId);
            });
        }
        return {
            records: rows,
            total: count,
            pages: Math.ceil(count / size),
            page,
            size
        };
    }

    static async getPointRank() {
        return await PointRecordMapper.getPointRank();
    }
}






