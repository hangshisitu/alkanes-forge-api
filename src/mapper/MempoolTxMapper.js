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
}
