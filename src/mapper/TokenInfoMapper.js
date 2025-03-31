import TokenInfo from '../models/TokenInfo.js';
import {Op} from "sequelize";

export default class TokenInfoMapper {

    static async getAllTokens(mintActive = null) {
        const whereClause = {};

        if (mintActive) {
            whereClause.mintActive = { [Op.eq]: mintActive };
        }

        return await TokenInfo.findAll({
            where: whereClause,
            order: [["id", "ASC"]]
        });
    }

    static async upsertToken(tokenInfo) {
        return await TokenInfo.upsert(tokenInfo);
    }

    static async bulkUpsertTokens(tokenInfos) {
        if (!tokenInfos || tokenInfos.length === 0) {
            return [];
        }

        const uniqueKey = 'id';
        return await TokenInfo.bulkCreate(tokenInfos, {
            updateOnDuplicate: Object.keys(tokenInfos[0]).filter(key => key !== uniqueKey),
            returning: false
        });
    }

}
