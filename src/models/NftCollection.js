import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'

const NftCollection = sequelize.define('NftCollection', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        comment: '主键，自增ID'
    },
    identifier: {
        type: DataTypes.STRING,
        comment: '合集标识'
    },
    name: {
        type: DataTypes.STRING,
        comment: '名称'
    },
    image: {
        type: DataTypes.STRING,
        comment: 'NFT icon',
    },
    originalImage: {
        type: DataTypes.STRING,
        comment: 'NFT 原始icon',
    },
    symbol: {
        type: DataTypes.STRING,
        comment: '符号',
    },
    contentType: {
        type: DataTypes.STRING,
        comment: '内容类型'
    },
    minted: {
        type: DataTypes.DECIMAL,
        comment: '累计铸造次数'
    },
    premine: {
        type: DataTypes.DECIMAL,
        comment: '预铸造数量'
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
    holders: {
        type: DataTypes.INTEGER,
        comment: '持有人'
    },
    floorPrice: {
        type: DataTypes.DECIMAL(36, 18),
        comment: '地板价',
    },
    marketCap: {
        type: DataTypes.DECIMAL(36, 0),
        comment: '总市值',
    },
    priceChange24h: {
        field: 'price_change_24h',
        type: DataTypes.DECIMAL(36, 2),
        comment: '24小时涨跌幅',
    },
    priceChange7d: {
        field: 'price_change_7d',
        type: DataTypes.DECIMAL(36, 2),
        comment: '7天涨跌幅',
    },
    priceChange30d: {
        field: 'price_change_30d',
        type: DataTypes.DECIMAL(36, 2),
        comment: '30天涨跌幅',
    },
    tradingVolume24h: {
        field: 'trading_volume_24h',
        type: DataTypes.DECIMAL(36, 0),
        comment: '24小时交易额',
    },
    tradingVolume7d: {
        field: 'trading_volume_7d',
        type: DataTypes.DECIMAL(36, 0),
        comment: '7天交易额',
    },
    tradingVolume30d: {
        field: 'trading_volume_30d',
        type: DataTypes.DECIMAL(36, 0),
        comment: '30天交易额',
    },
    totalTradingVolume: {
        type: DataTypes.DECIMAL(36, 0),
        comment: '总交易额',
    },
    tradingCount24h: {
        field: 'trading_count_24h',
        type: DataTypes.INTEGER,
        comment: '24小时交易笔数',
    },
    tradingCount7d: {
        field: 'trading_count_7d',
        type: DataTypes.INTEGER,
        comment: '7天交易笔数',
    },
    tradingCount30d: {
        field: 'trading_count_30d',
        type: DataTypes.INTEGER,
        comment: '30天交易笔数',
    },
    totalTradingCount: {
        type: DataTypes.INTEGER,
        comment: '总交易笔数',
    },
    listing: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '上架数量'
    },
    updateHeight: {
        type: DataTypes.INTEGER,
        comment: '最后更新区块号'
    },
    data: {
        type: DataTypes.TEXT,
        comment: '部署元数据'
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
    isLaunch: {
        type: DataTypes.BOOLEAN,
        comment: '是否Launch(0:否,1:是)'
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
    tableName: 'nft_collection',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: 'NFT集合信息'
});

export default NftCollection;
















