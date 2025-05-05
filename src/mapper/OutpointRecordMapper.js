import OutpointRecord from '../models/OutpointRecord.js';
import { Op } from 'sequelize';


export default class OutpointRecordMapper {

    static async deleteAfter(block) {
        await OutpointRecord.destroy({
            where: {
                block: {
                    [Op.gte]: block
                }
            }
        });
    }

    static async bulkUpsert(records) {
        await OutpointRecord.bulkCreate(records, {
            updateOnDuplicate: ['txid', 'vout', 'alkanesId'],
            returning: false
        });
    }
}