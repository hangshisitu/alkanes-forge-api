import NftMarketListing from "../models/NftMarketListing.js";
import {Constants} from "../conf/constants.js";
import { Op } from 'sequelize';

export default class NftMarketListingMapper {

    static async bulkUpsertListing(listingList) {
        if (!listingList || listingList.length === 0) {
            return [];
        }

        const uniqueKey = 'listing_output';
        const ret = await NftMarketListing.bulkCreate(listingList, {
            updateOnDuplicate: Object.keys(listingList[0]).filter(key => key !== uniqueKey),
            returning: false
        });
        return ret;
    }

    static async getFloorPriceByCollectionId(collectionId) {
        return await NftMarketListing.findOne({
            attributes: ['listingPrice'],
            where: {
                collectionId: collectionId,
                status: Constants.LISTING_STATUS.LIST
            },
            order: [['listingPrice', 'ASC']],
            limit: 1,
            raw: true
        })
    }

    static async getByIds(collectionId, ids, status = Constants.LISTING_STATUS.LIST) {
        return await NftMarketListing.findAll({
            attributes: ["id", "itemId", "listingPrice", "listingAmount", "sellerAmount", "sellerAddress", "sellerRecipient", "psbtData"],
            where: {
                id: ids,
                collectionId: collectionId,
                status: status,
            }
        });
    }

    static async bulkUpdateListing(listingOutputList, status, buyerAddress, txHash, walletType) {
        await NftMarketListing.update(
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
                }
            }
        );
    }

    static async getByOutputs(listingOutputList) {
        return await NftMarketListing.findAll({
            attributes: ["id", "collectionId", "itemId", "itemName", "listingPrice", "listingAmount", "sellerAmount", "sellerAddress", "listingOutput"],
            where: {
                listingOutput: listingOutputList
            }
        });
    }

    static async getUserListing(address, itemIds) {
        return await NftMarketListing.findAll({
            where: {
                sellerAddress: address,
                itemId: itemIds
            }
        });
    }

    static async getListingItems(itemIds) {
        return await NftMarketListing.findAll({
            where: {
                itemId: { [Op.in]: itemIds },
                status: Constants.LISTING_STATUS.LIST
            },
            raw: true
        });
    }

    static async getListingItem(itemId) {
        return await NftMarketListing.findOne({
            where: {
                itemId: itemId,
                status: Constants.LISTING_STATUS.LIST
            },
            raw: true
        });
    }
    

    static async countListingByCollectionId(collectionId) {
        return await NftMarketListing.count({
            where: {
                collectionId: collectionId,
                status: Constants.LISTING_STATUS.LIST
            }
        });
    }
    
}
