import {Op} from "sequelize";
import MarketListing from "../models/MarkeListing.js";

export default class MarketListingMapper {

    static async getAllListing(mintActive = null) {
        const whereClause = {};

        if (mintActive) {
            whereClause.mintActive = { [Op.eq]: mintActive };
        }

        return await MarketListing.findAll({
            where: whereClause,
            order: [["id", "ASC"]],
            raw: true
        });
    }

    static async upsertListing(marketListing) {
        return await MarketListing.upsert(marketListing);
    }

}
