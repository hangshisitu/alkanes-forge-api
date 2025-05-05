import sequelize from '../lib/SequelizeHelper.js';
import AddressBalance from '../models/AddressBalance.js';

export default class AddressBalanceMapper {

    static async updateAddressBalance(address, alkanesId, balance, block) {
        await AddressBalance.upsert({
            address,
            alkanesId,
            balance,
            updateBlock: block,
        }, {
            conflictFields: ['address', 'alkanesId']
        });
    }
}