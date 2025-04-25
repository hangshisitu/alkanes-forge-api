import MempoolTx from "../models/MempoolTx.js";
import {Op, QueryTypes} from "sequelize";
import {Constants} from "../conf/constants.js";
import sequelize from "../lib/SequelizeHelper.js";

export default class MempoolTxMapper {

    static async upsertMempoolTx(tx) {
        await MempoolTx.upsert(tx);
    }

    static async deleteByTxids(txids) {
        await MempoolTx.destroy({
            where: { txid: txids }
        });
    }

    static async countByAlkanesId(alkanesId, minFeeRate = 0) {
        const result = await MempoolTx.findOne({
            attributes: [
                'alkanesId', 
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'], 
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('address'))), 'addressCount'],
                [sequelize.fn('COUNT', sequelize.literal(`CASE WHEN fee_rate >= ${minFeeRate} THEN 1 END`)), 'nextBlockCount']
            ],
            where: { alkanesId }
        });
        return result;
    }

    static async groupCountByAlkanesId(alkanesIds) {
        if (!alkanesIds.length) {
            return [];
        }
        const result = await MempoolTx.findAll({
            attributes: [
                'alkanesId', 
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'], 
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('address'))), 'addressCount']
            ],
            where: { alkanesId: alkanesIds },
            group: ['alkanesId']
        });
        return result;
    }

    static async findPageByAlkanesId(alkanesId, page, size) {
        const { count, rows } = await MempoolTx.findAndCountAll({
            where: { alkanesId },
            order: [['feeRate', 'DESC']],
            offset: (page - 1) * size,
            limit: size
        });

        return {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows,
        };
    }

    static async getAlkanesIdMempoolData(alkanesId, minFeeRate) {
        let data = await this.countByAlkanesId(alkanesId, minFeeRate);
        data = data.dataValues;
        if (data.count > 0) {
            // 需要执行原始sql, 将alkanesId传入
            const result = await sequelize.query(`
                SELECT
                    CONCAT(
                        FLOOR(fee_rate),
                        '~',
                        FLOOR(fee_rate) + 1
                    ) AS fee_rate_range,
                    COUNT(*) AS cnt
                FROM mempool_tx
                where 
                    alkanes_id = :alkanesId
                GROUP BY
                    FLOOR(fee_rate)
                ORDER BY
                    FLOOR(fee_rate);
            `, {
                replacements: { alkanesId },
                type: QueryTypes.SELECT
            });

            // 根据原始区间数量动态调整合并策略
            let mergedRanges = [];
            if (result.length <= 3) {
                // 当区间数量小于等于3时，保持不变
                mergedRanges = result.map(x => {
                    return {
                        feeRateRange: x.fee_rate_range,
                        count: x.cnt
                    };
                });
            } else if (result.length <= 10) {
                // 当区间数量在4-10之间时，合并为原来的一半
                const rangeSize = 2;
                for (let i = 0; i < result.length; i += rangeSize) {
                    const endIndex = Math.min(i + rangeSize, result.length);
                    const currentRanges = result.slice(i, endIndex);
                    
                    const startRange = currentRanges[0].fee_rate_range.split('~')[0];
                    const endRange = currentRanges[currentRanges.length - 1].fee_rate_range.split('~')[1];
                    
                    const totalCount = currentRanges.reduce((sum, range) => sum + parseInt(range.cnt), 0);
                    
                    mergedRanges.push({
                        feeRateRange: `${startRange}~${endRange}`,
                        count: totalCount
                    });
                }
            } else {
                // 当区间数量大于10时，合并为最多10个区间
                const targetRangeCount = 10;
                const rangeSize = Math.ceil(result.length / targetRangeCount);
                
                for (let i = 0; i < result.length; i += rangeSize) {
                    const endIndex = Math.min(i + rangeSize, result.length);
                    const currentRanges = result.slice(i, endIndex);
                    
                    const startRange = currentRanges[0].fee_rate_range.split('~')[0];
                    const endRange = currentRanges[currentRanges.length - 1].fee_rate_range.split('~')[1];
                    
                    const totalCount = currentRanges.reduce((sum, range) => sum + parseInt(range.cnt), 0);
                    
                    mergedRanges.push({
                        feeRateRange: `${startRange}~${endRange}`,
                        count: totalCount
                    });
                }
            }

            return {
                ...data,
                feeRateRanges: mergedRanges,
            };
        }
        return data;
    }

}
