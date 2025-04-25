import MintItem from "../models/MintItem.js";
import sequelize from "../lib/SequelizeHelper.js";
import {QueryTypes} from "sequelize";
import {Constants} from "../conf/constants.js";

export default class MintItemMapper {

    static async bulkUpsertItem(itemList) {
        if (!itemList || itemList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['input_utxo'];
        return await MintItem.bulkCreate(itemList, {
            updateOnDuplicate: Object.keys(itemList[0]).filter(key => !uniqueKeyFields.includes(key)),
            returning: false
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
            `, {
            replacements: {
                orderId,
                mintStatus: Constants.MINT_STATUS.MINTING
            },
            type: QueryTypes.SELECT,
            raw: true
        });
    }

    static async batchUpdateHash(mintItems) {
        await Promise.all(
            mintItems.map(item =>
                MintItem.update(
                    { mintHash: item.mintHash },
                    { where: { id: item.id } }
                )
            )
        );
    }
}
