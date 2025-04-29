import MempoolTx from "../models/MempoolTx.js";
import {Op, QueryTypes} from "sequelize";
import {Constants} from "../conf/constants.js";
import sequelize from "../lib/SequelizeHelper.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import BaseUtil from "../utils/BaseUtil.js";
import * as logger from "../conf/logger.js"

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

    static getAlkanesMempoolFeeRange(alkanesStats) {
        let mergedRanges = [];
        if (alkanesStats.length <= 3) {
            // 当区间数量小于等于3时，保持不变
            mergedRanges = alkanesStats.map(x => {
                return {
                    feeRateRange: x.fee_rate_range,
                    count: x.cnt
                };
            });
        } else if (alkanesStats.length <= 10) {
            // 当区间数量在4-10之间时，合并为原来的一半
            const rangeSize = 2;
            for (let i = 0; i < alkanesStats.length; i += rangeSize) {
                const endIndex = Math.min(i + rangeSize, alkanesStats.length);
                const currentRanges = alkanesStats.slice(i, endIndex);

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
            const rangeSize = Math.ceil(alkanesStats.length / targetRangeCount);

            for (let i = 0; i < alkanesStats.length; i += rangeSize) {
                const endIndex = Math.min(i + rangeSize, alkanesStats.length);
                const currentRanges = alkanesStats.slice(i, endIndex);

                const startRange = currentRanges[0].fee_rate_range.split('~')[0];
                const endRange = currentRanges[currentRanges.length - 1].fee_rate_range.split('~')[1];

                const totalCount = currentRanges.reduce((sum, range) => sum + parseInt(range.cnt), 0);

                mergedRanges.push({
                    feeRateRange: `${startRange}~${endRange}`,
                    count: totalCount
                });
            }
        }
        return mergedRanges;
    }

    static async getAlkanesMedianFeeRate(alkanesId, offset) {
        const medianResult = await sequelize.query(`
            SELECT fee_rate
            FROM mempool_tx
            WHERE alkanes_id = :alkanesId
            ORDER BY fee_rate
            LIMIT 1 OFFSET :offset
        `, {
            replacements: { alkanesId, offset},
            type: QueryTypes.SELECT
        });
        return medianResult[0]?.fee_rate || 0;
    }

    static async getAllAlkanesIdMempoolData() {
        const mempoolBlocks = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_FEES_MEMPOOL_BLOCKS);
        const block = mempoolBlocks ? JSON.parse(mempoolBlocks)[0] : null;
        const minFeeRate = block?.feeRange?.[0] || 99999;
        const stats = await sequelize.query(`
            SELECT
                alkanes_id,
                sum(case when fee_rate >= ${minFeeRate} then 1 else 0 end) as next_block_count,
                CONCAT(
                    FLOOR(fee_rate),
                    '~',
                    FLOOR(fee_rate) + 1
                ) AS fee_rate_range,
                COUNT(*) AS cnt,
				(SELECT COUNT(DISTINCT address) FROM mempool_tx WHERE alkanes_id = t.alkanes_id) AS address_count
            FROM mempool_tx as t
            GROUP BY
                t.alkanes_id, FLOOR(fee_rate)
            ORDER BY
                t.alkanes_id, FLOOR(fee_rate);
        `, { type: QueryTypes.SELECT });
        logger.info(`getAllAlkanesIdMempoolData query stats: ${stats.length}`);
        const mempoolDatas = {};
        const statsMap = stats.reduce((acc, stat) => {
            acc[stat.alkanes_id] = acc[stat.alkanes_id] || [];
            acc[stat.alkanes_id].push(stat);
            return acc;
        }, {});
        for (const alkanesId of Object.keys(statsMap)) {
            const alkanesStats = statsMap[alkanesId];
            const count = alkanesStats.reduce((sum, stat) => sum + parseInt(stat.cnt), 0);
            const addressCount = alkanesStats[0].address_count;
            const nextBlockCount = alkanesStats.reduce((sum, stat) => sum + parseInt(stat.next_block_count), 0);

            const mergedRanges = this.getAlkanesMempoolFeeRange(alkanesStats);

            mempoolDatas[alkanesId] = {
                alkanesId,
                count,
                addressCount,
                nextBlockCount,
                feeRateRanges: mergedRanges,
            };
        }
        const medianFeeRates = await BaseUtil.concurrentExecute(Object.values(mempoolDatas), async (data) => {
            return {
                alkanesId: data.alkanesId,
                medianFeeRate: await this.getAlkanesMedianFeeRate(data.alkanesId, Math.floor(data.count / 2))
            };
        });
        logger.info(`getAllAlkanesIdMempoolData query medianFeeRate: ${medianFeeRates.length}`);
        for (const data of medianFeeRates) {
            mempoolDatas[data.alkanesId].medianFeeRate = data.medianFeeRate;
        }
        return mempoolDatas;
    }

    static async getAlkanesIdMempoolData(alkanesId, minFeeRate) {
        const alkanesStats = await sequelize.query(`
            SELECT
                alkanes_id,
                sum(case when fee_rate >= ${minFeeRate} then 1 else 0 end) as next_block_count,
                CONCAT(
                    FLOOR(fee_rate),
                    '~',
                    FLOOR(fee_rate) + 1
                ) AS fee_rate_range,
                COUNT(*) AS cnt,
				(SELECT COUNT(DISTINCT address) FROM mempool_tx WHERE alkanes_id = t.alkanes_id) AS address_count
            FROM mempool_tx as t
            WHERE t.alkanes_id = :alkanesId
            GROUP BY
                FLOOR(fee_rate)
            ORDER BY
                FLOOR(fee_rate);
        `, {
            replacements: { alkanesId },
            type: QueryTypes.SELECT
        });

        const count = alkanesStats.reduce((sum, stat) => sum + parseInt(stat.cnt), 0);
        const addressCount = alkanesStats[0].address_count;
        const nextBlockCount = alkanesStats.reduce((sum, stat) => sum + parseInt(stat.next_block_count), 0);

        const mergedRanges = this.getAlkanesMempoolFeeRange(alkanesStats);
        const medianFeeRate = count > 0 ? await this.getAlkanesMedianFeeRate(alkanesId, Math.floor(count / 2)) : 0;
        return {
            alkanesId,
            count,
            addressCount,
            nextBlockCount,
            feeRateRanges: mergedRanges,
            medianFeeRate
        };
    }

}
