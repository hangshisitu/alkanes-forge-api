import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const OutpointRecord = sequelize.define('OutpointRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: '主键'
    },
    block: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '区块高度'
    },
    txIdx: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '交易序号'
    },
    txid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '交易id'
    },
    vout: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'vout序号'
    },
    value: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: 'utxo聪数'
    },
    address: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '地址'
    },
    alkanesId: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '资产唯一标识'
    },
    balance: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '余额'
    },
    alkanesIdCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '资产数量'
    },
    spent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否花费'
    },
    spendBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '花费区块交易, height+txIdx'
    },
    spendByInput: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: '花费input, txid+vin'
    },
    blockTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '区块时间'
    },
    updateAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '更新时间'
    }
}, {
    tableName: 'outpoint_record',
    timestamps: false,        // 不自动维护createdAt/updatedAt
    underscored: true,        // Sequelize自动使用下划线，但此处主要靠field映射
    comment: 'alkanes outpoint 记录表'
});

export default OutpointRecord;