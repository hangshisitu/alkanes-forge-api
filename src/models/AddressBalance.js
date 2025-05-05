import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const AddressBalance = sequelize.define('AddressBalance', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: '主键'
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
    updateBlock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '更新区块'
    },
    updateAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '更新时间'
    }
}, {
    tableName: 'address_balance',
    timestamps: false,        // 不自动维护createdAt/updatedAt
    underscored: true,        // Sequelize自动使用下划线，但此处主要靠field映射
    comment: '地址余额表'
});

export default AddressBalance;