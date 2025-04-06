import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const TokenInfo = sequelize.define('TokenInfo', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        comment: '主键，自增ID'
    },
    name: {
        type: DataTypes.STRING,
        comment: '名称'
    },
    symbol: {
        type: DataTypes.STRING,
        comment: '符号',
    },
    cap: {
        type: DataTypes.DECIMAL,
        comment: '总铸造次数'
    },
    premine: {
        type: DataTypes.DECIMAL,
        comment: '预铸造次数'
    },
    minted: {
        type: DataTypes.DECIMAL,
        comment: '累计铸造次数'
    },
    mintAmount: {
        type: DataTypes.DECIMAL,
        comment: '单次铸造数量'
    },
    totalSupply: {
        type: DataTypes.DECIMAL,
        comment: '总供应量'
    },
    progress: {
        type: DataTypes.FLOAT,
        comment: '铸造进度'
    },
    mintActive: {
        type: DataTypes.INTEGER,
        comment: 'Mint状态(0:否,1:是)'
    },
    updateHeight: {
        type: DataTypes.INTEGER,
        comment: '最后更新区块号'
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
    tableName: 'token_info',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: '代币信息'
});

export default TokenInfo;

