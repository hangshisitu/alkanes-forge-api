import MarketListing from "../models/MarkeListing.js";
import {Constants} from "../conf/constants.js";

export default class MarketListingMapper {

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
            order: [order, ["updatedAt", "DESC"]],
            limit: size,
            offset: (page - 1) * size
        });

        return {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };
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

    static async getByOutputs(listingOutputList) {
        return await MarketListing.findAll({
            attributes: ["alkanesId", "tokenAmount", "listingAmount", "sellerAmount", "sellerAddress", "listingOutput"],
            where: {
                listingOutput: listingOutputList
            }
        });
    }

    static async getByIds(alkanesId, ids, status = Constants.LISTING_STATUS.LIST) {
        return await MarketListing.findAll({
            attributes: ["id", "tokenAmount", "listingAmount", "sellerAmount", "sellerAddress", "sellerRecipient", "psbtData"],
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

    static async bulkUpdateListing(listingOutputList, status, buyerAddress, txHash) {
        await MarketListing.update(
            {
                status: status,
                buyerAddress: buyerAddress,
                txHash: txHash
            },
            {
                where: {
                    listingOutput: listingOutputList
                }
            }
        );
    }

    static async bulkUpsertListing(listingList) {
        if (!listingList || listingList.length === 0) {
            return [];
        }

        const uniqueKey = 'listing_output';
        return await MarketListing.bulkCreate(listingList, {
            updateOnDuplicate: Object.keys(listingList[0]).filter(key => key !== uniqueKey),
            returning: false
        });
    }

}
