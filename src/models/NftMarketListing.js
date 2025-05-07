import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const NftMarketListing = sequelize.define('NftMarketListing', {
    id: {
        type: DataTypes.STRING(16),
        primaryKey: true,
        comment: '主键'
    },
    collectionId: {
        type: DataTypes.STRING(16),
        comment: '合集ID'
    },
    itemId: {
        type: DataTypes.STRING(16),
        comment: 'nft item ID'
    },
    itemName: {
        type: DataTypes.STRING(128),
        comment: 'nft item 名称'
    },
    listingPrice: {
        type: DataTypes.DECIMAL(36, 18),
        comment: '单价(单位: satoshi)'
    },
    sellerAmount: {
        type: DataTypes.DECIMAL(36, 0),
        comment: '卖家实收金额(单位: satoshi)',
        get() {
            const value = this.getDataValue('sellerAmount');
            return value ? Number(value) : 0;
        }
    },
    listingOutput: {
        type: DataTypes.STRING(70),
        comment: '挂单的output(txid:vout)'
    },
    psbtData: {
        type: DataTypes.TEXT,
        comment: 'PSBT原始数据'
    },
    sellerAddress: {
        type: DataTypes.STRING(128),
        comment: '卖家出售地址'
    },
    sellerRecipient: {
        type: DataTypes.STRING(128),
        comment: '卖家收款地址'
    },
    buyerAddress: {
        type: DataTypes.STRING(128),
        defaultValue: '',
        comment: '买家地址'
    },
    txHash: {
        type: DataTypes.STRING(64),
        defaultValue: '',
        comment: '链上交易哈希'
    },
    source: {
        type: DataTypes.STRING(32),
        defaultValue: '',
        comment: '交易来源'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1:已上架 2:已售出 3:已下架'
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
    tableName: 'nft_market_listing',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 字段名下划线风格
    comment: 'nft交易市场挂单表'
});

export default NftMarketListing;
