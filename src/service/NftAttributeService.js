import NftItemAttribute from '../models/NftItemAttribute.js';
import NftCollectionAttribute from '../models/NftCollectionAttribute.js';
import sequelize from '../lib/SequelizeHelper.js';

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
            attributes: {
                exclude: ['id', 'collectionId', 'createdAt', 'updatedAt', 'itemId']
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
            select trait_type, value, count(1) as cnt from nft_item_attribute
            where collection_id = :collectionId
            group by trait_type, value
        `, {
            replacements: { collectionId },
            raw: true
        });
        if (results?.[0]?.length <= 0) {
            return;
        }
        const attributes = results[0].map(result => ({
            collectionId,
            traitType: result.trait_type,
            value: result.value,
            count: result.cnt
        }));
        await NftCollectionAttribute.bulkCreate(attributes, {
            updateOnDuplicate: ['count']
        });
    }

    static async getItemIdsByAttributes(collectionId, attributes) {
        return await NftItemAttribute.findAll({
            where: {
                collection_id: collectionId,
                trait_type: attributes.map(attribute => attribute.trait_type),
                value: attributes.map(attribute => attribute.value)
            },
            attributes: ['item_id'],
            raw: true
        });
    }

}


