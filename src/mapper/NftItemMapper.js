import NftItem from "../models/NftItem.js";
import { literal, Op } from 'sequelize';
import sequelize from '../lib/SequelizeHelper.js';
export default class NftItemMapper {

    static async getAddressCollectionItems(address, collectionId) {
        return await NftItem.findAll({
            where: {
                holder: address,
                collectionId
            },
            raw: true,
        });
    }

    static async getCollectionItems(collectionId) {
        return await NftItem.findAll({
            where: {
                collectionId
            },
            raw: true,
        });
    }

    static async countCollectionHolderAndItem(collectionIds) {
        return await NftItem.findAll({
            where: {
                collectionId: { [Op.in]: collectionIds }
            },
            attributes: [
                'collectionId', 
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', 
                    sequelize.literal(`CASE WHEN holder != '' THEN holder END`)
                )), 'holderCount'], 
                [sequelize.fn('COUNT', sequelize.col('id')), 'itemCount']
            ],
            group: ['collectionId'],
            raw: true,
        });
    }

    static async getHolderPage(collectionId, page, size) {
        const holders = await sequelize.query(`
            select holder, count(1) as cnt 
            from nft_item 
            where collection_id = :collectionId and holder != ''
            group by holder
            order by cnt desc
            limit :size offset :offset
        `, {
            replacements: {
                collectionId,
                size,
                offset: (page - 1) * size,
            },
            type: sequelize.QueryTypes.SELECT,
            raw: true,
        });
        const total = await sequelize.query(`
            select count(distinct holder) as total 
            from nft_item 
            where collection_id = :collectionId and holder != ''
        `, {
            replacements: {
                collectionId
            },
            type: sequelize.QueryTypes.SELECT,
            raw: true,
        });
        const totalCount = total[0].total;
        return {
            page,
            size,
            total: totalCount,
            pages: Math.ceil(totalCount / size),
            records: holders,
        };
    }
}
