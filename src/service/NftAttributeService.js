import NftItemAttribute from '../models/NftItemAttribute.js';
import NftCollectionAttribute from '../models/NftCollectionAttribute.js';
import sequelize from '../lib/SequelizeHelper.js';
import BaseUtil from '../utils/BaseUtil.js';

export default class NftAttributeService {

    static async getNftAttributes(collectionId) {
        return await NftCollectionAttribute.findAll({
            where: {
                collectionId
            },
            raw: true,
        });
    }

    static async getNftItemAttributes(itemId) {
        return await NftItemAttribute.findAll({
            where: {
                itemId
            },
            raw: true,
        });
    }

    static async bulkUpsertNftItemAttributes(nftItemAttributes) {
        if (nftItemAttributes.length <= 0) {
            return;
        }
        await NftItemAttribute.bulkCreate(nftItemAttributes, {
            updateOnDuplicate: ['value'],
        });
    }

    static async refreshNftCollectionAttributes(collectionId) {
        const results = await sequelize.query(`
            select item_id, trait_type, value, count(1) as cnt from nft_item_attribute
            where collection_id = :collectionId
            group by item_id, trait_type, value
        `, {
            replacements: { collectionId }
        }, {
            raw: true
        });
        const attributes = results.map(result => ({
            collectionId,
            itemId: result.item_id,
            traitType: result.trait_type,
            value: result.value,
            count: result.cnt
        }));
        await NftCollectionAttribute.bulkCreate(attributes, {
            updateOnDuplicate: ['count']
        });
    }

}


