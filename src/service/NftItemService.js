import NftItem from '../models/NftItem.js';
import Sequelize, {Op} from "sequelize";
import * as RedisHelper from "../lib/RedisHelper.js";
import AddressBalanceMapper from '../mapper/AddressBalanceMapper.js';
import BaseUtil from '../utils/BaseUtil.js';
import NftItemAttribute from '../models/NftItemAttribute.js';

export default class NftItemService {

    static getItemCacheKey(collectionId, holderAddress, name, page, size) {
        return `nft-items:${collectionId}:${holderAddress || 'all'}:${name || 'all'}:${page}:${size}`;
    }

    static async bulkUpsertNftItem(infos) {
        await NftItem.bulkCreate(infos, {
            updateOnDuplicate: ['id']
        });
    }

    static async getItemById(id) {
        const item = await NftItem.findByPk(id, {
            attributes: {
                exclude: ['updateHeight', 'createdAt', 'updatedAt']
            },
            raw: true
        });
        item.attributes = await NftItemAttribute.findAll({
            where: {
                itemId: id
            },
            attributes: {
                exclude: ['id', 'collectionId', 'createdAt', 'updatedAt', 'itemId']
            },
            raw: true
        });
        return item;
    }

    static async getItemPage(collectionId, holderAddress, name, page, size) {
        const cacheKey = NftItemService.getItemCacheKey(collectionId, holderAddress, name, page, size);
        // 查缓存
        const cacheData = await RedisHelper.get(cacheKey);
        if (cacheData) {
            return JSON.parse(cacheData);
        }
        const order = [
            [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'ASC'],
            [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'ASC'],
        ];
        const where = {
            collectionId,
            id: {
                [Op.notIn]: Sequelize.literal('(SELECT item_id FROM nft_market_listing WHERE status = 1 AND collection_id = :collectionId)')
            }
        };
        if (holderAddress) {
            where.holder = holderAddress;
        }
        // 要排除在NftMarketListing已上架的item
        if (name) {
            where[Op.or] = [
                { id: { [Op.like]: `%${name}%` } },
                { name: { [Op.like]: `%${name}%` } }
            ];
        }
        const { rows, count } = await NftItem.findAndCountAll({
            where,
            order,
            offset: (page - 1) * size,
            limit: size,
            raw: true,
            replacements: { collectionId }
        });
        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };
        // 写缓存，10秒有效期
        await RedisHelper.setEx(cacheKey, 10, JSON.stringify(result));
        return result;
    }

    static async getItemsByIds(ids) {
        return await NftItem.findAll({
            where: {
                id: { [Op.in]: ids }
            }
        });
    }

    static async updateHolder(address, alkanesId, block) {
        await NftItem.update({
            holder: address,
            updateHeight: block
        }, { where: { id: alkanesId } });
    }
    
    static async indexNftItemHolder() {
        const nftItems = await NftItem.findAll({
            where: {
                holder: null
            }
        });
        if (nftItems.length === 0) {
            return;
        }
        const collectionIds = new Set();
        await BaseUtil.concurrentExecute(nftItems, async (nftItem) => {
            const addressBalance = await AddressBalanceMapper.getNftItemHolder(nftItem.id);
            if (addressBalance) {
                await NftItem.update({
                    holder: addressBalance.address,
                    updateHeight: addressBalance.updateBlock
                }, { where: { id: nftItem.id } });
                collectionIds.add(nftItem.collectionId);
            }
        });
        return [...collectionIds];
    }

    static async findMaxItemId() {
        const maxIdItem = await NftItem.findOne({
            attributes: ['id'],
            order: [
                [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'DESC'],
                [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'DESC'],
            ],
            raw: true
        });
        return maxIdItem?.id;
    }
}
