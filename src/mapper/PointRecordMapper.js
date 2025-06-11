import Sequelize, {Op} from "sequelize";
import {Constants} from "../conf/constants.js";
import PointRecord from "../models/PointRecord.js";


export default class PointRecordMapper {

    static async deleteAfter(block) {
        await PointRecord.destroy({
            where: {
                block: {[Op.gte]: block}
            }
        });
    }

    static async createPointRecord(pointRecord, transaction = null) {
        return await PointRecord.create(
            pointRecord,
            {
                updateOnDuplicate: ['point', 'block', 'txid', 'address', 'amount'],
                transaction,
            }
        );
    }

    static async getUserPoint(address) {
        // 获取用户的积分并且需要算出根据point求和后的排名
        const result = await PointRecord.findAll({
            attributes: [
                'address',
                [Sequelize.fn('SUM', Sequelize.col('point')), 'point'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount'],
                [Sequelize.literal(`(
                    SELECT COUNT(*) + 1
                    FROM (
                        SELECT SUM(point) as total_point
                        FROM point_record
                        GROUP BY address
                        HAVING SUM(point) > (
                            SELECT SUM(point)
                            FROM point_record
                            WHERE address = '${address}'
                            GROUP BY address
                        )
                    ) as higher_scores
                )`), 'rank']
            ],
            where: {
                address
            },
            group: ['address'],
            raw: true
        });
        const ret = result[0] || { address, point: '0', amount: '0', rank: 0};
        const totalInfo = await PointRecord.findOne({
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('point')), 'point'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount'],
            ],
            raw: true
        });
        ret.totalPoint = BigInt(totalInfo?.point ?? 0).toString();
        ret.totalAmount = BigInt(totalInfo?.amount ?? 0).toString();
        return ret;
    }
    
    static async getUserPointDetail(address, page, size) {
        return await PointRecord.findAndCountAll({
            where: {
                address
            },
            offset: (page - 1) * size,
            limit: size,
            order: [['block', 'DESC'], ['id', 'DESC']],
            raw: true
        });
    }

    static async getPointRank() {
        // 从point_record表中根据address求和point根据求和后的point倒序排序返回前100个
        return await PointRecord.findAll({
            attributes: [
                'address', 
                [Sequelize.fn('SUM', Sequelize.col('point')), 'point'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount'],
            ],
            group: ['address'],
            order: [[Sequelize.fn('SUM', Sequelize.col('point')), 'DESC']],
            limit: 100
        }, {
            raw: true
        });
    }
}

