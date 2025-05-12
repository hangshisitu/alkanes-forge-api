import {DataTypes} from 'sequelize';
import sequelize from '../lib/SequelizeHelper.js';

const LaunchOrder = sequelize.define('LaunchOrder', {
    id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '主键'
    },
    alkanesId: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '合集的Alkanes标识'
    },
    mintAddress: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '铸造脚本地址'
    },
    userAddress: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '用户地址(关联订单)'
    },
    paymentAddress: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '付款地址'
    },
    receiveAddress: {
        type: DataTypes.STRING(128),
        allowNull: true,
        defaultValue: '',
        comment: '接收地址'
    },
    paymentHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '',
        comment: '付款哈希'
    },
    paymentVout: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: '',
        comment: '付款输出'
    },
    paymentValue: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: '',
        comment: '付款金额'
    },
    mintHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '',
        comment: '铸造哈希'
    },
    paymentType: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '',
        comment: '付款方式(BTC、Alkanes)'
    },
    paymentAssets: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '',
        comment: '付款资产(BTC、Alkanes ID)'
    },
    paymentAmount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '付款金额(BTC为聪，Alkanes为具体数量)'
    },
    feerate: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '交易费率'
    },
    postage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '预留聪'
    },
    mints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '铸造数量'
    },
    mintStage: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: '',
        comment: '铸造阶段'
    },
    mintStatus: {
        type: DataTypes.STRING(16),
        allowNull: true,
        defaultValue: '',
        comment: '订单状态(unpaid/minting/completed)'
    },
    mintResult: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: '',
        comment: '铸造结果(成功:success,失败:trace错误)'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
    }
}, {
    tableName: 'launch_order',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'Launch订单信息'
});

export default LaunchOrder;