import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const LaunchCollection = sequelize.define('LaunchCollection', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        comment: '主键'
    },
    collectionId: {
        type: DataTypes.STRING,
        comment: '合集标识'
    },
    name: {
        type: DataTypes.STRING,
        comment: '名称'
    },
    minted: {
        type: DataTypes.DECIMAL,
        comment: '累计铸造次数'
    },
    totalSupply: {
        type: DataTypes.DECIMAL,
        comment: '总供应量'
    },
    progress: {
        type: DataTypes.FLOAT,
        comment: '铸造进度',
        get() {
            const totalSupply = this.getDataValue('totalSupply');
            if (totalSupply == null || totalSupply === 0) {
                return 0;
            }
            const minted = this.getDataValue('minted');
            return Number((minted / totalSupply * 100).toFixed(2));
        }   
    },
    mintActive: {
        type: DataTypes.INTEGER,
        comment: 'Mint状态(0:否,1:是)'
    },
    updateHeight: {
        type: DataTypes.INTEGER,
        comment: '最后更新区块号'
    },
    description: {
        type: DataTypes.TEXT,
        comment: '描述'
    },
    twitter: {
        type: DataTypes.STRING,
        comment: 'twitter id'
    },
    discord: {
        type: DataTypes.STRING,
        comment: 'discord邀请链接'
    },
    website: {
        type: DataTypes.STRING,
        comment: '官方网站'
    },
    telegram: {
        type: DataTypes.STRING,
        comment: '电报链接'
    },
    startBlock: {
        field: 'start_block',
        type: DataTypes.INTEGER,
        comment: '开始区块'
    },
    endBlock: {
        field: 'end_block',
        type: DataTypes.INTEGER,
        comment: '结束区块'
    },
    image: {
        field: 'image',
        type: DataTypes.STRING,
        comment: 'logo'
    },
    launchImage: {
        field: 'launch_image',
        type: DataTypes.STRING,
        comment: 'Launch图片'
    },
    launchBanner: {
        field: 'launch_banner',
        type: DataTypes.STRING,
        comment: 'Launch海报'
    },
    launchStages: {
        field: 'launch_stages',
        type: DataTypes.STRING,
        comment: 'Launch阶段(JSON格式)'
    },
    paymentAddress: {
        field: 'payment_address',
        type: DataTypes.STRING,
        comment: 'BTC收款地址'
    },
    launchWhitelist: {
        field: 'launch_whitelist',
        type: DataTypes.STRING,
        comment: 'Launch白名单(JSON格式)'
    },
    launchRank: {
        field: 'launch_rank',
        type: DataTypes.INTEGER,
        comment: 'Launch排名'
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
    tableName: 'launch_collection',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'Launch集合信息'
});

export default LaunchCollection;
















