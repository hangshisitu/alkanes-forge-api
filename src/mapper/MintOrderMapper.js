import MintOrder from "../models/MintOrder.js";
import Sequelize, {Op} from "sequelize";
import {Constants} from "../conf/constants.js";

export default class MintOrderMapper {

    static async orderPage(page, size, userAddress) {
        if (!userAddress) {
            throw new Error('Please enter the Receive Address and try again.');
        }

        const whereClause = {
            userAddress: userAddress,
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

    static async getByIdInLock(id, transaction) {
        return await MintOrder.findByPk(id, {
            attributes: {
                exclude: ['createdAt', 'updatedAt']
            },
            raw: true,
            transaction,
            lock: Sequelize.Transaction.LOCK.UPDATE
        });
    }

    static async getById(id) {
        return await MintOrder.findByPk(id, {
            attributes: {
                exclude: ['createdAt', 'updatedAt']
            },
            raw: true
        });
    }

    static async updateOrder(orderId, paymentHash, submittedAmount, mintStatus, options = {transaction: null, acceptStatus: null}) {
        const where = {
            id: orderId
        };
        if (options.acceptStatus) {
            where.mintStatus = options.acceptStatus;
        }
        await MintOrder.update(
            {
                paymentHash: paymentHash,
                submittedAmount: submittedAmount,
                mintStatus: mintStatus
            },
            {
                where,
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

    static async getMintingOrders(minId, size) {
        return await MintOrder.findAll({
            where: {
                mintStatus: {
                    [Op.in]: [Constants.MINT_ORDER_STATUS.MINTING, Constants.MINT_ORDER_STATUS.PARTIAL]
                },
                id: {
                    [Op.gt]: minId
                }
            },
            order: [["id", "ASC"]],
            limit: size,
            offset: 0
        });
    }

    static async updateStatus(id, acceptStatus, newStatus, completedAmount = null) {
        const updateData = { mintStatus: newStatus };
        if (completedAmount !== null) {
            updateData.completedAmount = completedAmount;
        }
        await MintOrder.update(
            updateData,
            { where: { id, mintStatus: acceptStatus } }
        );
    }

    static async updateCompletedAmount(id, completedAmount) {
        await MintOrder.update(
            { completedAmount },
            { where: { id } }
        );
    }

    static async getAllMintingOrders() {
        return await MintOrder.findAll({
            where: {
                mintStatus: {
                    [Op.in]: [Constants.MINT_ORDER_STATUS.MINTING, Constants.MINT_ORDER_STATUS.PARTIAL]
                },
            }
        });
    }

    static async getAllOrdersByMintStatus(mintStatus, checkPaymentHash = false) {
        const where = { mintStatus };
        if (checkPaymentHash) {
            where.paymentHash = {
                [Op.not]: ""
            };
        }
        return await MintOrder.findAll({
            where,
            order: [["latestFeerate", "DESC"]]
        });
    }

    static async updateUnpaidOrderPaymentHash(orderId, paymentHash) {
        await MintOrder.update(
            { paymentHash },
            { 
                where: { 
                    id: orderId,
                    mintStatus: Constants.MINT_ORDER_STATUS.UNPAID
                } 
            }
        );
    }
}
