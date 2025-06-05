import NftMarketListing from "../models/NftMarketListing.js";
import {Constants} from "../conf/constants.js";
import { Op } from 'sequelize';
import sequelize from "../lib/SequelizeHelper.js";
import Sequelize from "sequelize";

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
            attributes: ["id", "itemId", "listingPrice", "listingAmount", "sellerAmount", "sellerAddress", "sellerRecipient", "psbtData", "listingOutput"],
            where: {
                id: ids,
                collectionId: collectionId,
                status: status,
            }
        });
    }

    static async bulkUpdateListing(listingOutputList, status, buyerAddress, txHash, walletType, transaction = null) {
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
                },
                transaction: transaction
            }
        );
    }

    static async bulkRollbackListingFromSold(listingOutputList, status, buyerAddress, txHash, walletType) {
        if (!listingOutputList || listingOutputList.length === 0) {
            return;
        }
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
                    status: Constants.LISTING_STATUS.SOLD
                }
            }
        );
    }

    static async getByOutputs(listingOutputList, transaction = null) {
        return await NftMarketListing.findAll({
            attributes: ["id", "collectionId", "itemId", "itemName", "listingPrice", "listingAmount", "sellerAmount", "sellerAddress", "listingOutput", "psbtData", "status"],
            where: {
                listingOutput: listingOutputList
            },
            lock: transaction ? Sequelize.Transaction.LOCK.UPDATE : null,
            transaction: transaction
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

    static async findByOutput(output, status = Constants.LISTING_STATUS.LIST) {
        return await NftMarketListing.findOne({
            where: {
                listingOutput: output,
                status: status
            }
        });
    }

    static async updateListing(id, data, acceptStatus = Constants.LISTING_STATUS.LIST) {
        return await NftMarketListing.update(data, {
            where: {
                id: id,
                status: acceptStatus
            }
        });
    }

    static async updateListingByListingOutput(listingOutput, data) {
        return await NftMarketListing.update(data, {
            where: {
                listingOutput: listingOutput,
            }
        });
    }

    static async getByTxids(txids) {
        return await NftMarketListing.findAll({
            where: {
                txHash: txids
            },
            raw: true
        });
    }

    static async getAllFloorPrice() {
        return await NftMarketListing.findAll({
            attributes: ['collectionId', [sequelize.fn('min', sequelize.col('listing_price')), 'listingPrice']],
            where: {status: Constants.LISTING_STATUS.LIST},
            group: ['collectionId'],
            raw: true
        });
    }
}
