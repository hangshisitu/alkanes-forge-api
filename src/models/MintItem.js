import sequelize from '../lib/SequelizeHelper.js';
import { DataTypes } from 'sequelize';

const MintOrder = sequelize.define('MintItem', {
    id: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: '主键'
    },
    orderId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: '',
        comment: '订单ID',
        field: 'order_id'
    },
    inputUtxo: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: 'UTXO信息(txid:vout:value)',
        field: 'input_utxo'
    },
    txSize: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: '0',
        comment: '铸造交易大小',
        field: 'tx_size'
    },
    batchIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: '0',
        comment: '铸造批次顺序',
        field: 'batch_index'
    },
    mintIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: '0',
        comment: '铸造索引顺序',
        field: 'mint_index'
    },
    receiveAddress: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '接收地址',
        field: 'receive_address'
    },
    mintHash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '铸造哈希',
        field: 'mint_hash'
    },
    psbt: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
        comment: '铸造交易PSBT',
        field: 'psbt'
    },
    mintStatus: {
        type: DataTypes.STRING(16),
        defaultValue: '',
        comment: '铸造状态(waiting/minting/completed)',
        field: 'mint_status'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间',
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '更新时间',
        field: 'updated_at'
    }
}, {
    tableName: 'mint_item',
    timestamps: false,        // 不自动维护createdAt/updatedAt
    underscored: true,        // Sequelize自动使用下划线，但此处主要靠field映射
    comment: '铸造明细表'
});

export default MintOrder;