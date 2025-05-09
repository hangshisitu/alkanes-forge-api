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
            updateOnDuplicate: ['collection_id', 'item_id', 'trait_type']
        });
    }

    static async refreshNftCollectionAttributes(collectionId) {
        const results = await sequelize.query(`
            select item_id, trait_type, trait_value, count(1) as cnt from nft_item_attributes
            where collection_id = :collectionId
            group by item_id, trait_type, trait_value
        `, {
            replacements: { collectionId }
        }, {
            raw: true
        });
        const attributes = results.map(result => ({
            collectionId,
            itemId: result.item_id,
            traitType: result.trait_type,
            traitValue: result.trait_value,
            count: result.cnt
        }));
        await NftCollectionAttribute.bulkCreate(attributes, {
            updateOnDuplicate: ['collection_id', 'item_id', 'trait_type', 'trait_value']
        });
    }

}


