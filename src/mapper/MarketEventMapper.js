import MarketEvent from "../models/MarkeEvent.js";
import {Op} from "sequelize";
import {Constants} from "../conf/constants.js";

export default class MarketEventMapper {

    static async getAllEvents(alkanesId, type, address, page, size) {
        const whereClause = {
            alkanesId: alkanesId
        };

        if (type) {
            whereClause.type = type;
        }

        if (address) {
            whereClause[Op.or] = [
                { sellerAddress: address },
                { buyerAddress: address }
            ];
        }
        whereClause.createdAt = {
            [Op.lt]: new Date(),
        };

        const { count, rows } = await MarketEvent.findAndCountAll({
            attributes: ['type', 'tokenAmount', 'listingPrice', 'listingAmount', 'sellerAddress', 'buyerAddress', 'txHash', 'updatedAt'],
            where: whereClause,
            order: [["updatedAt", "DESC"], ["id", "ASC"]],
            limit: size,
            offset: (page - 1) * size
        });

        return {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };
    }

    static async queryTradesInLastHour(alkanesId, startTime, endTime) {
        return await MarketEvent.findAll({
            where: {
                alkanesId: alkanesId,
                type: Constants.MARKET_EVENT.SOLD,
                updatedAt: {
                    [Op.between]: [startTime, endTime],
                },
            },
        });
    }

    static async upsertEvent(event) {
        return await MarketEvent.upsert(event);
    }

    static async bulkUpsertEvent(eventList) {
        if (!eventList || eventList.length === 0) {
            return [];
        }

        const uniqueKeyFields = ['listingOutput', 'type'];
        return await MarketEvent.bulkCreate(eventList, {
            updateOnDuplicate: Object.keys(eventList[0]).filter(key => !uniqueKeyFields.includes(key)),
            returning: false
        });
    }

}
