import MarketListing from "../models/MarkeListing.js";
import {Constants} from "../conf/constants.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import { Op } from "sequelize";
import sequelize from "../lib/SequelizeHelper.js";
import Sequelize from "sequelize";

export default class MarketListingMapper {

    static getListingCacheKey(alkanesId, sellerAddress, page, size, orderType) {
        return `listings:${alkanesId}:${sellerAddress || 'all'}:${page}:${size}:${orderType}`;
    }

    static async deleteListingCache(alkanesId) {
        await RedisHelper.scan(`listings:${alkanesId}:*`, 1000, true);
    }

    /**
     * 分页查询交易数据
     * @param alkanesId
     * @param sellerAddress
     * @param page      页码
     * @param size      每页数量
     * @param orderType 排序：1:根据价格升序，2:根据价格倒序，3:根据总价升序，4:根据总价倒序
     * @returns {Promise<{total: *, pages: number, size, records: *, page}>}
     */
    static async getAllListing(alkanesId, sellerAddress, page, size, orderType) {
        const cacheKey = MarketListingMapper.getListingCacheKey(alkanesId, sellerAddress, page, size, orderType);
        // 查缓存
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }

        const whereClause = {
            alkanesId: alkanesId,
            status: Constants.LISTING_STATUS.LIST
        };

        if (sellerAddress) {
            whereClause.sellerAddress = sellerAddress;
        }

        let order = ["listingPrice", "ASC"];
        if (orderType === Constants.LISTING_ORDER_TYPE.PRICE_DESC) {
            order = ["listingPrice", "DESC"];
        } else if (orderType === Constants.LISTING_ORDER_TYPE.TOTAL_AMOUNT_ASC) {
            order = ["listingAmount", "ASC"];
        } else if (orderType === Constants.LISTING_ORDER_TYPE.TOTAL_AMOUNT_DESC) {
            order = ["listingAmount", "DESC"];
        }

        const { count, rows } = await MarketListing.findAndCountAll({
            attributes: ['id', 'sellerAddress', 'tokenAmount', 'listingPrice', 'listingAmount', 'updatedAt'],
            where: whereClause,
            order: [order, ["updatedAt", "DESC"], ["id", "ASC"]],
            limit: size,
            offset: (page - 1) * size
        });

        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };

        // 写缓存，3秒有效期
        await RedisHelper.setEx(cacheKey, 3, JSON.stringify(result));
        return result;
    }

    static async getUserListing(sellerAddress, alkanesId) {
        return await MarketListing.findAll({
            attributes: ["listingOutput"],
            where: {
                alkanesId: alkanesId,
                sellerAddress: sellerAddress,
                status: Constants.LISTING_STATUS.LIST,
            }
        });
    }

    static async getByOutputs(listingOutputList, transaction = null) {
        return await MarketListing.findAll({
            attributes: ["id", "alkanesId", "tokenAmount", "listingPrice", "listingAmount", "sellerAmount", "sellerAddress", "listingOutput", "psbtData", "status"],
            where: {
                listingOutput: listingOutputList
            },
            lock: transaction ? Sequelize.Transaction.LOCK.UPDATE : null,
            transaction
        });
    }

    static async getByIds(alkanesId, ids, status = Constants.LISTING_STATUS.LIST) {
        return await MarketListing.findAll({
            attributes: ["id", "tokenAmount", "listingPrice", "listingAmount", "sellerAmount", "sellerAddress", "sellerRecipient", "psbtData", "listingOutput"],
            where: {
                id: ids,
                alkanesId: alkanesId,
                status: status,
            }
        });
    }

    static async getFloorPriceByAlkanesId(alkanesId) {
        return await MarketListing.findOne({
            attributes: ['listingPrice'],
            where: {
                alkanesId: alkanesId,
                status: Constants.LISTING_STATUS.LIST
            },
            order: [['listingPrice', 'ASC']],
            raw: true
        })
    }

    static async bulkUpdateListing(listingOutputList, status, buyerAddress, txHash, walletType, alkanesId = null, transaction = null) {
        await MarketListing.update(
            {
                status: status,
                buyerAddress: buyerAddress,
                txHash: txHash,
                source: walletType
            },
            {
                where: {
                    listingOutput: listingOutputList,
                    status: Constants.LISTING_STATUS.LIST
                },
                transaction
            }
        );
        if (alkanesId) {
            await MarketListingMapper.deleteListingCache(alkanesId);
        }
    }

    static async bulkRollbackListingFromSold(listingOutputList, status, buyerAddress, txHash, walletType, alkanesId = null) {
        if (!listingOutputList || listingOutputList.length === 0) {
            return;
        }

        await MarketListing.update(
            {
                status: status,
                buyerAddress: buyerAddress,
                txHash: txHash,
                source: walletType
            },
            {
                where: {
                    listingOutput: listingOutputList,
                    status: Constants.LISTING_STATUS.SOLD
                }
            }
        );
        if (alkanesId) {
            await MarketListingMapper.deleteListingCache(alkanesId);
        }
    }

    static async bulkUpsertListing(listingList) {
        if (!listingList || listingList.length === 0) {
            return [];
        }

        const uniqueKey = 'listing_output';
        const updatableFields = Object.keys(listingList[0]).filter(key => key !== uniqueKey);
        const ret = await MarketListing.bulkCreate(listingList, {
            updateOnDuplicate: updatableFields,
            returning: false
        });
        // 从listingList获取所有alkanesId并去重后删除缓存
        const alkanesIdList = [...new Set(listingList.map(listing => listing.alkanesId))];
        for (const alkanesId of alkanesIdList) {
            await MarketListingMapper.deleteListingCache(alkanesId);
        }
        return ret;
    }

    static async findByOutput(output, status = Constants.LISTING_STATUS.LIST) {
        return await MarketListing.findOne({
            where: {
                listingOutput: output,
                status: status
            }
        });
    }

    static async updateListing(id, data, acceptStatus = Constants.LISTING_STATUS.LIST) {
        return await MarketListing.update(data, {
            where: {
                id: id,
                status: acceptStatus
            }
        });
    }

    static async updateListingByListingOutput(listingOutput, data) {
        return await MarketListing.update(data, {
            where: {
                listingOutput: listingOutput,
            }
        });
    }

    static async getByTxids(txids) {
        return await MarketListing.findAll({
            where: {
                txHash: txids
            },
            raw: true
        });
    }

    static async getAllFloorPrice() {
        const listings = await MarketListing.findAll({
            attributes: ['alkanesId', [sequelize.fn('min', sequelize.col('listing_price')), 'listingPrice']],
            where: {status: Constants.LISTING_STATUS.LIST},
            group: ['alkanesId'],
            raw: true
        });
        return listings;
    }

}
