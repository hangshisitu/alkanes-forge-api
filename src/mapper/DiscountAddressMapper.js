import DiscountAddress from '../models/DiscountAddress.js';

export default class DiscountAddressMapper {

    static async getDiscountAddress(address) {
        const discountAddress = await DiscountAddress.findOne(
            { 
                where: { address },
            },
            { raw: true }
        );
        return discountAddress;
    }

    static async updateDiscountAddress(address, data) {
        await DiscountAddress.update(data, { where: { address } });
    }

    static async createDiscountAddress(data) {
        await DiscountAddress.create(data, {
            ignoreDuplicates: true,
        });
    }
}