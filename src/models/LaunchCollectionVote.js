import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const LaunchCollectionVote = sequelize.define('LaunchCollectionVote', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
    },
    launchId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '合集标识'
    },
    address: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '投票地址'
    },
    vote: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '投票, agree: 支持, oppose: 反对, neutral: 弃权'
    },
    content: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '投票内容'
    },
    images: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '投票图片'
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
    tableName: 'launch_collection_vote',
    timestamps: false,
    underscored: true,
    comment: 'Launch集合投票'
});

export default LaunchCollectionVote;