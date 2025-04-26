import MintOrder from "../models/MintOrder.js";
import Sequelize, {Op} from "sequelize";
import {Constants} from "../conf/constants.js";

export default class MintOrderMapper {

    static async orderPage(page, size, receiveAddress) {
        if (!receiveAddress) {
            throw new Error('Please enter the Receive Address and try again.');
        }

        const whereClause = {
            receiveAddress: receiveAddress,
            mintStatus: {[Op.ne]: Constants.MINT_ORDER_STATUS.UNPAID}
        };

        const { count, rows } = await MintOrder.findAndCountAll({
            where: whereClause,
            order: [["updatedAt", "DESC"], ["id", "ASC"]],
            attributes: {
                exclude: ['mintAddress', 'updatedAt']
            },
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

    static async createOrder(order) {
        await MintOrder.create(order);
    }

    static async getById(id) {
        return await MintOrder.findByPk(id, {
            attributes: {
                exclude: ['createdAt', 'updatedAt']
            },
            raw: true
        });
    }

    static async updateOrder(orderId, paymentHash, submittedAmount, mintStatus, options = {transaction: null}) {
        await MintOrder.update(
            {
                paymentHash: paymentHash,
                submittedAmount: submittedAmount,
                mintStatus: mintStatus
            },
            {
                where: {
                    id: orderId
                },
                transaction: options.transaction
            },
        );
    }

    static async updateOrderFeerate(orderId, change, latestFeerate, options = {transaction: null}) {
        await MintOrder.update(
            {
                change: change,
                latestFeerate: latestFeerate
            },
            {
                where: {
                    id: orderId
                },
                transaction: options.transaction
            }
        );
    }
}
