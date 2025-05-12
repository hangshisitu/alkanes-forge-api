import NftItemAttribute from '../models/NftItemAttribute.js';
import NftCollectionAttribute from '../models/NftCollectionAttribute.js';
import sequelize from '../lib/SequelizeHelper.js';
import * as RedisHelper from '../lib/RedisHelper.js';

export default class NftAttributeService {


    static getCollectionAttributeCacheKey(collectionId) {
        return `nft-collection-attributes:${collectionId}`;
    }

    static async deleteCollectionAttributeCache(collectionId) {
        const cacheKey = this.getCollectionAttributeCacheKey(collectionId);
        await RedisHelper.del(cacheKey);
    }

    static async getNftAttributes(collectionId) {
        const cacheKey = this.getCollectionAttributeCacheKey(collectionId);
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }
        const attributes = await NftCollectionAttribute.findAll({
            where: {
                collectionId
            },
            raw: true,
        });
        // 600 seconds expire time
        await RedisHelper.setEx(cacheKey, 600, JSON.stringify(attributes));
        return attributes;
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
        await this.deleteCollectionAttributeCache(collectionId);
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


