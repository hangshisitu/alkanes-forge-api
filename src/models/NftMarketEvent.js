import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const NftMarketEvent = sequelize.define('NftMarketEvent', {
    id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '主键'
    },
    type: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '事件类型(1:上架 2:售出 3:下架 4:改价 5:转移)'
    },
    listingId: {
        type: DataTypes.STRING(16),
        comment: '挂单ID'
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
    itemImage: {
        type: DataTypes.STRING(128),
        comment: 'nft item 图片'
    },
    listingPrice: {
        type: DataTypes.DECIMAL(36, 18),
        comment: '单价(单位: satoshi)',
        get() {
            const value = this.getDataValue('listingPrice');
            return value ? Number(value) : 0;
        }
    },
    listingAmount: {
        type: DataTypes.DECIMAL(36, 0),
        comment: '总价(单位: satoshi)',
        get() {
            const value = this.getDataValue('listingAmount');
            return value ? Number(value) : 0;
        }
    },
    listingOutput: {
        type: DataTypes.STRING(70),
        comment: '挂单的output(txid:vout)'
    },
    sellerAddress: {
        type: DataTypes.STRING(128),
        comment: '卖家出售地址'
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
    txConfirmedHeight: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '交易确认高度'
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
    tableName: 'nft_market_event',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 字段名下划线风格
    comment: 'nft交易市场事件表'
});

export default NftMarketEvent;
