import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const IndexBlock = sequelize.define('IndexBlock', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: '主键'
    },
    block: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '区块高度'
    },
    blockHash: {
        type: DataTypes.STRING(256),
        allowNull: false,
        comment: '区块hash'
    },
    outpointIndexed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'outpoint 索引状态'
    },
    txIndexed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'tx 索引状态'
    }
}, {
    tableName: 'index_block',
    timestamps: false,        // 不自动维护createdAt/updatedAt
    underscored: true,        // Sequelize自动使用下划线，但此处主要靠field映射
    comment: 'index block 记录表'
});

export default IndexBlock;