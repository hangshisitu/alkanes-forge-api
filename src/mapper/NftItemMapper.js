import NftItem from "../models/NftItem.js";
import { Op } from 'sequelize';
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

    static async countCollectionHolder(collectionIds) {
        return await NftItem.findAll({
            where: {
                collectionId: { [Op.in]: collectionIds }
            },
            attributes: ['collectionId', [sequelize.fn('COUNT', sequelize.col('id')), 'holderCount']],
            group: ['collectionId'],
            raw: true,
        });
    }
}
