import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const TokenStats = sequelize.define('TokenStats', {
    id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '主键'
    },
    alkanesId: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '代币ID'
    },
    statsDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '统计日期(小时)'
    },
    averagePrice: {
        type: DataTypes.DECIMAL(36, 18),
        comment: '平均价(单位: satoshi)'
    },
    totalAmount: {
        type: DataTypes.DECIMAL(36, 6),
        comment: '交易额(单位: satoshi)'
    },
    totalVolume: {
        type: DataTypes.DECIMAL(36, 8),
        comment: '交易量(代币数量)'
    },
    tradeCount: {
        type: DataTypes.INTEGER,
        comment: '交易笔数'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
    }
}, {
    tableName: 'token_stats',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 字段名下划线风格
    comment: '交易市场统计表'
});

export default TokenStats;