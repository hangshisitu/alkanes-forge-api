import LaunchOrder from '../models/LaunchOrder.js';
import {Constants} from '../conf/constants.js';
import {Op} from 'sequelize';

export default class LaunchOrderMapper {

    static async createOrder(order) {
        await LaunchOrder.create(order);
    }

    static async findById(id) {
        return await LaunchOrder.findByPk(id, {raw: true});
    }

    static async updateOrder(orderId, paymentHash, mintHash, mintStatus, options = {transaction: null, acceptStatus: null}) {
        const where = {
            id: orderId
        };
        if (options.acceptStatus) {
            where.mintStatus = options.acceptStatus;
        }
        await LaunchOrder.update(
            {
                paymentHash: paymentHash,
                mintStatus: mintStatus,
                mintHash: mintHash
            },
            {
                where,
                transaction: options.transaction
            },
        );
    }

    static async updateOrderMintResult(orderId, mintResult) {
        await LaunchOrder.update(
            {
                mintResult: mintResult,
                mintStatus: Constants.MINT_ORDER_STATUS.COMPLETED
            },
            {
                where: {
                    id: orderId
                }
            }
        );
    }

    static async getOrderPage(userAddress, page, size, alkanesId) {
        const {count, rows} = await LaunchOrder.findAndCountAll({
            where: {
                userAddress, 
                alkanesId,
                mintStatus: {
                    [Op.not]: Constants.MINT_ORDER_STATUS.UNPAID
                }
            },
            order: [
                ['createdAt', 'DESC']
            ],
            offset: (page - 1) * size,
            limit: size
        }, {raw: true});
        return {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };
    }

    static async findStageMintByAddress(receiveAddress, stage, alkanesId) {
        return await LaunchOrder.findAll({
            where: {
                alkanesId,
                receiveAddress,
                mintStage: stage,
                paymentHash: {
                    [Op.not]: ''
                },
            },
            raw: true,
        });
    }

    static async findByPaymentHash(paymentHash) {
        return await LaunchOrder.findOne({
            where: {
                paymentHash
            },
            raw: true
        });
    }
}
