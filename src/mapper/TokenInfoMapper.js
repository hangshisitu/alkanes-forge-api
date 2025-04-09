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
            order: [["id", "ASC"]],
            raw: true
        });
    }

    static async bulkUpsertTokens(tokenInfos) {
        if (!tokenInfos || tokenInfos.length === 0) {
            return [];
        }

        for (const tokenInfo of tokenInfos) {
            try {
                await TokenInfo.upsert(tokenInfo);
            } catch (err) {
                console.log(`bulkUpsertToken error, tokenInfo: ${JSON.stringify(tokenInfo)}`, err.message);
                throw new Error(`Update tokens error: ${err.message}`);
            }
        }

        // const uniqueKey = 'id';
        // try {
        //     return await TokenInfo.bulkCreate(tokenInfos, {
        //         updateOnDuplicate: Object.keys(tokenInfos[0]).filter(key => key !== uniqueKey),
        //         returning: false
        //     });
        // } catch (err) {
        //     console.log(`bulkUpsertTokens error, tokenInfos: ${JSON.stringify(tokenInfos)}`, err.message);
        //     throw new Error(`Update tokens error: ${err.message}`);
        // }
    }

}
