import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const MempoolTx = sequelize.define('MempoolTx', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: '主键'
    },
    txid: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    alkanesId: {
        type: DataTypes.STRING(16),
        comment: '资产唯一标识'
    },
    tokenAmount: {
        type: DataTypes.DECIMAL(36, 0),
        comment: '代币数量(支持小数)'
    },
    op: {
        type: DataTypes.STRING,
        comment: '操作类型, 如mint, transfer, burn'
    },
    address: {
        type: DataTypes.STRING,
        comment: '地址'
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
    tableName: 'mempool_tx',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 字段名下划线风格
    comment: 'mempool交易表'
});

export default MempoolTx;