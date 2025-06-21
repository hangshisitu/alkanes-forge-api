import NftItemAttribute from '../models/NftItemAttribute.js';
import NftCollectionAttribute from '../models/NftCollectionAttribute.js';
import sequelize from '../lib/SequelizeHelper.js';
import * as RedisHelper from '../lib/RedisHelper.js';
import { Op, Sequelize } from 'sequelize';

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

    static async bulkUpsertNftItemAttributes(nftItemAttributes, options = {transaction: null}) {
        if (nftItemAttributes.length <= 0) {
            return;
        }
        const uniqueKeyFields = ['itemId', 'traitType'];
        const updatableFields = Object.keys(nftItemAttributes[0]).filter(key => !uniqueKeyFields.includes(key));
        await NftItemAttribute.bulkCreate(nftItemAttributes, {
            updateOnDuplicate: updatableFields,
            transaction: options.transaction
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

    static async getItemIdsByAttributes(collectionId, attributes, filterModel = 'or') {
        if (filterModel !== 'or' && filterModel !== 'and') {
            filterModel = 'or';
        }
        attributes = attributes.map(attribute => `${attribute.trait_type}:${attribute.value}`);
        const where = {
            collection_id: collectionId,
            [Op.and]: [
                Sequelize.literal(
                    `CONCAT(trait_type, ':', value) IN (${attributes.map(val => `'${val}'`).join(',')})`
                )
            ]
        };
        let having = null;
        if (filterModel === 'and') {
            having = Sequelize.literal(`COUNT(DISTINCT CONCAT(trait_type, ':', value)) = ${attributes.length}`)
        }
        return await NftItemAttribute.findAll({
            where,
            attributes: ['item_id'],
            group: ['item_id'],
            having,
            raw: true
        });
    }

}


