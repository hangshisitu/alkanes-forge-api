import OutpointRecord from '../models/OutpointRecord.js';
import { Op } from 'sequelize';
import sequelize from '../lib/SequelizeHelper.js';

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

    static async getBalance(address, alkanesId) {
        const [result] = await sequelize.query(
            `SELECT SUM(CAST(balance AS DECIMAL(64,0))) as total 
             FROM outpoint_record
             WHERE address = :address 
             AND alkanes_id = :alkanesId
             and spent = 0`
             ,
            {
                replacements: {
                    address,
                    alkanesId
                },
                type: sequelize.QueryTypes.SELECT,
                raw: true
            }
        );
        return BigInt(result?.total || 0).toString();
    }
}