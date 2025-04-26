import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const MintOrder = sequelize.define('MintOrder', {
    id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '主键'
    },
    model: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'normal',
        comment: '铸造模式(normal/merge)'
    },
    alkanesId: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '资产唯一标识',
        field: 'alkanes_id'
    },
    alkanesName: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '代币名称',
        field: 'alkanes_name'
    },
    mintAddress: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '铸造脚本地址',
        field: 'mint_address'
    },
    paymentAddress: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '付款地址',
        field: 'payment_address'
    },
    receiveAddress: {
        type: DataTypes.STRING(128),
        defaultValue: '',
        comment: '接收地址',
        field: 'receive_address'
    },
    paymentHash: {
        type: DataTypes.STRING(64),
        defaultValue: '',
        comment: '付款交易哈希',
        field: 'payment_hash'
    },
    feerate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: '铸造速率',
        field: 'feerate'
    },
    latestFeerate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: '最新的铸造速率',
        field: 'latest_feerate'
    },
    maxFeerate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: '最大可加速速率',
        field: 'max_feerate'
    },
    postage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '预留聪数量',
        field: 'postage'
    },
    prepaid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '预存金额(聪,用于加速)',
        field: 'prepaid'
    },
    change: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '找零金额(聪,预存剩余)',
        field: 'change'
    },
    networkFee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '网络费(聪)',
        field: 'network_fee'
    },
    serviceFee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '服务费(聪)',
        field: 'service_fee'
    },
    totalFee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总费用(聪)',
        field: 'total_fee'
    },
    mintAmount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '铸造数量',
        field: 'mint_amount'
    },
    submittedAmount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已提交数量',
        field: 'submitted_amount'
    },
    completedAmount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已完成数量',
        field: 'completed_amount'
    },
    mintStatus: {
        type: DataTypes.STRING(16),
        defaultValue: '',
        comment: '订单状态(unpaid/partial/minting/completed)',
        field: 'mint_status'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间',
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '更新时间',
        field: 'updated_at'
    }
}, {
    tableName: 'mint_order',
    timestamps: false,        // 不自动维护createdAt/updatedAt
    underscored: true,        // Sequelize自动使用下划线，但此处主要靠field映射
    comment: '铸造订单表'
});

export default MintOrder;