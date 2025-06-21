import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'


const LaunchCollectionTeamMember = sequelize.define('LaunchCollectionTeamMember', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        comment: '主键'
    },
    launchId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '合集标识'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '名称'
    },
    head: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '头像'
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '头衔'
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '描述'
    },
    twitter: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '推特'
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
    tableName: 'launch_collection_team_member',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'Launch集合团队成员信息'
});

export default LaunchCollectionTeamMember;