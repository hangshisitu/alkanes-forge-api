import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const NftItemAttribute = sequelize.define('NftItemAttribute', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: '主键，自增ID'
    },
    collectionId: {
        type: DataTypes.STRING,
        comment: 'NFT集合ID'
    },
    itemId: {
        type: DataTypes.STRING,
        comment: 'NFT ID'
    },
    traitType: {
        type: DataTypes.STRING,
        comment: '属性名称'
    },
    value: {
        type: DataTypes.STRING,
        comment: '属性值',
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
    tableName: 'nft_item_attribute',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'NFT属性信息'
});

export default NftItemAttribute;
















