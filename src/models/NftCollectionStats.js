import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const NftCollectionStats = sequelize.define('NftCollectionStats', {
    id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '主键'
    },
    collectionId: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '合集ID'
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
        comment: '交易量(代币数量)'
    },
    totalVolume: {
        type: DataTypes.DECIMAL(36, 8),
        comment: '交易额(单位: satoshi)'
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
    tableName: 'nft_collection_stats',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 字段名下划线风格
    comment: '合集统计表'
});

export default NftCollectionStats;