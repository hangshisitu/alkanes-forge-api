import IndexBlock from '../models/IndexBlock.js';
import { Op } from 'sequelize';

export default class IndexBlockMapper {

    static async deleteAfter(block) {
        await IndexBlock.destroy({
            where: {
                block: {
                    [Op.gte]: block
                }
            }
        });
    }
    
}


