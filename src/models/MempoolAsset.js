import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const MempoolAsset = sequelize.define('MempoolAsset', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: '主键'
    },
    txid: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    vin: {
        type: DataTypes.INTEGER,
        comment: '输入索引'
    },
    assetAddress: {
        type: DataTypes.STRING,
        comment: '资产地址'
    },
    assetTxid: {
        type: DataTypes.STRING,
        comment: '资产交易id'
    },
    assetVout: {
        type: DataTypes.INTEGER,
        comment: '资产vout'
    },
    feeRate: {
        type: DataTypes.DECIMAL(16, 5),
        comment: '交易费率'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
}, {
    tableName: 'mempool_asset',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 字段名下划线风格
    comment: 'mempool资产表'
});

export default MempoolAsset;