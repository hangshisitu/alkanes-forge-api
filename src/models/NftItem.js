import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const NftItem = sequelize.define('NftItem', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        comment: '主键，自增ID'
    },
    collectionId: {
        type: DataTypes.STRING,
        comment: 'NFT集合ID'
    },
    name: {
        type: DataTypes.STRING,
        comment: '名称'
    },
    image: {
        type: DataTypes.STRING,
        comment: 'NFT 图片',
    },
    originalImage: {
        type: DataTypes.STRING,
        comment: 'NFT 原始图片',
    },
    symbol: {
        type: DataTypes.STRING,
        comment: '符号',
    },
    holder: {
        type: DataTypes.STRING,
        defaultValue: '',
        comment: '持有人'
    },
    updateHeight: {
        type: DataTypes.INTEGER,
        comment: '最后更新区块号'
    },
    data: {
        type: DataTypes.TEXT,
        comment: '部署元数据'
    },
    contentType: {
        type: DataTypes.STRING,
        comment: '内容类型'
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
    tableName: 'nft_item',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'NFT信息'
});

export default NftItem;
















