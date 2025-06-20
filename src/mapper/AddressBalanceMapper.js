import sequelize from '../lib/SequelizeHelper.js';
import AddressBalance from '../models/AddressBalance.js';
import { Sequelize } from 'sequelize';
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

    static async getNftItemHolder(id) {
        const addressBalance = await AddressBalance.findOne({
            where: {
                alkanesId: id
            },
            order: [
                [Sequelize.literal('CAST(balance AS DECIMAL(64,0))'), 'DESC']
            ],
            limit: 1,
            raw: true
        });
        if (BigInt(addressBalance.balance) > 0) {
            return addressBalance;
        }
        return null;
    }

    static async getAddressBalance(address, alkanesId) {
        const addressBalance = await AddressBalance.findOne({
            where: {
                address,
                alkanesId
            },
            raw: true
        });
        return addressBalance;
    }
}
