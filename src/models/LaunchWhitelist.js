import {DataTypes} from 'sequelize';
import sequelize from '../lib/SequelizeHelper.js';

const LaunchWhitelist = sequelize.define('LaunchWhitelist', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
    },
    launchId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'launch合集ID'
    },
    stage: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '阶段'
    },
    address: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: '',
        comment: '白名单地址'
    },
    proof: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '',
        comment: '白名单证明'
    },
    index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '序号'
    },
    limit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '数量限制'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
    }
}, {
    tableName: 'launch_whitelist',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'Launch白名单信息'
});

export default LaunchWhitelist;