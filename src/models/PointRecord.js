
import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const PointRecord = sequelize.define('PointRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    block: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '区块高度'
    },
    txid: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '交易id'
    },
    address: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '用户地址'
    },
    source: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '来源, buy: 购买, mint: 铸造'
    },
    amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '金额, stats'
    },
    point: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '积分数量'
    },
    alkanesId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '资产唯一标识'
    },
    isNft: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        comment: '是否为NFT'
    },
    itemId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'nft的id, isNft为true时记录'
    },
    relatedId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '关联资产id, source是trade时, 关联资产id为listingOutput, 来源是mint时, 关联资产id为mint订单id'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '创建时间'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '更新时间'
    }
}, {
    tableName: 'point_record',
    timestamps: false,
    underscored: true,
    comment: '积分记录表'
});

export default PointRecord;




