import MintItem from "../models/MintItem.js";
import sequelize from "../lib/SequelizeHelper.js";
import {QueryTypes} from "sequelize";
import {Constants} from "../conf/constants.js";
import TokenInfo from "../models/TokenInfo.js";

export default class MintItemMapper {

    static async bulkUpsertItem(itemList, options = {transaction: null}) {
        if (!itemList || itemList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['input_utxo'];
        return await MintItem.bulkCreate(itemList, {
            updateOnDuplicate: Object.keys(itemList[0]).filter(key => !uniqueKeyFields.includes(key)),
            returning: false,
            transaction: options.transaction
        });
    }

    static async getMintItemsByOrderId(orderId, batchIndex = null) {
        const where = {orderId: orderId};
        if (batchIndex != null) {
            where.batchIndex = batchIndex;
        }
        return await MintItem.findAll({
            where
        });
    }

    static async selectMintingItems(orderId) {
        return await sequelize.query(`
              SELECT
                batch_index as batchIndex,
                SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY mint_index DESC), ',', 1) AS id,
                SUBSTRING_INDEX(GROUP_CONCAT(mint_hash ORDER BY mint_index DESC), ',', 1) AS mintHash,
                SUBSTRING_INDEX(GROUP_CONCAT(input_utxo ORDER BY mint_index DESC), ',', 1) AS inputUtxo,
                SUM(tx_size) AS totalTxSize
              FROM mint_item
              WHERE order_id = :orderId and mint_status = :mintStatus
              GROUP BY batch_index
              ORDER BY mint_index asc
            `, {
            replacements: {
                orderId,
                mintStatus: Constants.MINT_STATUS.MINTING
            },
            type: QueryTypes.SELECT,
            raw: true
        });
    }

    static async selectMintTxs(orderId, mintStatus) {
        const whereClause = {orderId: orderId};
        if (mintStatus) {
            whereClause.mintStatus = mintStatus;
        }
        return await MintItem.findAll({
            where: whereClause,
            order: [["txSize", "DESC"], ["mintIndex", "ASC"]],
            attributes: ['batchIndex', 'mintIndex', 'mintHash', 'txSize', 'mintStatus'],
            raw: true
        });
    }

    static async batchUpdateHash(mintItems, options = {transaction: null}) {
        await Promise.all(
            mintItems.map(item =>
                MintItem.update(
                    { mintHash: item.mintHash, psbt: item.psbt },
                    { where: { id: item.id }, transaction: options.transaction }
                )
            )
        );
    }

    static async updateItemStatus(itemId, acceptStatus, newStatus) {
        await MintItem.update(
            { mintStatus: newStatus },
            { where: { id: itemId, mintStatus: acceptStatus } }
        );
    }

    static async updateStatusByOrderId(orderId, acceptStatus, newStatus) {
        await MintItem.update(
            { mintStatus: newStatus },
            { where: { orderId, mintStatus: acceptStatus } }
        );
    }

    static async getCompletedMintCount(orderId) {
        return await MintItem.count({
            where: { orderId, mintStatus: Constants.MINT_STATUS.COMPLETED }
        });
    }

    static async updateItemStatusByTxids(txids, acceptStatus, newStatus) {
        await MintItem.update(
            { mintStatus: newStatus },
            { where: { mintHash: txids, mintStatus: acceptStatus } }
        );
    }
}
