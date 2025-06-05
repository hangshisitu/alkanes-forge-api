import sequelize from '../lib/SequelizeHelper.js';
import {DataTypes} from 'sequelize';

const MarketAssetStats = sequelize.define('MarketAssetStats', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
    },
    timeId: {
        type: DataTypes.STRING,
        comment: '时间id, 由年月日时分生成'
    },
    alkanesId: {
        type: DataTypes.STRING,
        comment: '资产id'
    },
    isNft: {
        type: DataTypes.BOOLEAN,
        comment: '是否为nft',
        defaultValue: false
    },
    floorPrice: {
        type: DataTypes.DECIMAL(65, 18),
        comment: '地板价'
    },
    avgPrice: {
        type: DataTypes.DECIMAL(65, 18),
        comment: '成交平均价'
    },
    amount: {
        type: DataTypes.DECIMAL(65, 18),
        comment: '交易量(单位: 代币/nft数量)'
    },
    volume: {
        type: DataTypes.DECIMAL(65, 18),
        comment: '交易额(单位: satoshi)'
    },
    tradeCount: {
        type: DataTypes.INTEGER,
        comment: '交易笔数'
    },
    startTime: {
        type: DataTypes.DATE,
        comment: '开始时间'
    },
    endTime: {
        type: DataTypes.DATE,
        comment: '结束时间'
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
    tableName: 'market_asset_stats',
    timestamps: false,
    underscored: true,
    comment: '市场资产统计表'
});

export default MarketAssetStats;