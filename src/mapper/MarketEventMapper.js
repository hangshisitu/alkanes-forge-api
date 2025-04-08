import MarketEvent from "../models/MarkeEvent.js";

export default class MarketEventMapper {

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
