import MarketListing from "../models/MarkeListing.js";

export default class MarketListingMapper {

    /**
     * 分页查询交易数据
     * @param alkanesId
     * @param page      页码
     * @param size      每页数量
     * @param orderType 排序：1:根据价格升序，2:根据价格倒序，3:根据总价升序，4:根据总价倒序
     * @returns {Promise<{total: *, pages: number, size, records: *, page}>}
     */
    static async getAllListing(alkanesId, page, size, orderType) {
        const whereClause = {
            alkanesId: alkanesId
        };

        let order = ["listingPrice", "ASC"];
        if (orderType === 2) {
            order = ["listingPrice", "DESC"];
        } else if (orderType === 3) {
            order = ["listingAmount", "ASC"];
        } else if (orderType === 4) {
            order = ["listingAmount", "DESC"];
        }

        const { count, rows } = await MarketListing.findAndCountAll({
            attributes: ['id', 'tokenAmount', 'listingPrice', 'listingAmount'],
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

    static async getByIds(alkanesId, ids, status = 1) {
        return await MarketListing.findAll({
            attributes: ["tokenAmount", "listingAmount", "sellerAmount", "sellerAddress", "sellerRecipient", "psbtData"],
            where: {
                id: ids,
                alkanesId: alkanesId,
                status: status,
            }
        });
    }

    static async getByOutput(listingOutput) {
        return await MarketListing.findOne({
            where: {
                listingOutput: listingOutput
            },
        });
    }

    static async upsertListing(marketListing) {
        return await MarketListing.upsert(marketListing);
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
