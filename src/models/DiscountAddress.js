import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const DiscountAddress = sequelize.define('DiscountAddress', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    address: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '地址',
    },
    takerFee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '买方手续费比例, 千分位',
    },
    mintDiscount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '铸造折扣, 百分位',
    },
    transferDiscount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '转账手续费折扣, 百分位',
    },
    launchDiscount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'launch手续费折扣, 百分位',
    },
    boundAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '绑定时间',
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '创建时间',
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '更新时间',
    },
}, {
    tableName: 'discount_address',
    timestamps: false,
    underscored: true,
    comment: '折扣地址',
});

export default DiscountAddress;