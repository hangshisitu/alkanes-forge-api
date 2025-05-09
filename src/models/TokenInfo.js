import sequelize from '../lib/SequelizeHelper.js'
import {DataTypes} from 'sequelize'
import config from '../conf/config.js'

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
    image: {
        type: DataTypes.STRING,
        comment: '代币图片',
    },
    originalImage: {
        type: DataTypes.STRING,
        comment: '部署的图片',
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
        comment: 'Mint状态(0:否,1:是)',
        get() {
            const mintActive = this.getDataValue('mintActive');
            const reserveNumber = this.getDataValue('reserveNumber');
            if (reserveNumber !== config.reserveNumber) {
                return 0;
            }
            return mintActive;
        }
    },
    actualMintActive: {
        type: DataTypes.VIRTUAL,
        comment: '实际Mint状态(0:否,1:是)',
        get() {
            return this.getDataValue('mintActive');
        }
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
    updateHeight: {
        type: DataTypes.INTEGER,
        comment: '最后更新区块号'
    },
    data: {
        type: DataTypes.TEXT,
        comment: '部署元数据'
    },
    reserveNumber: {
        type: DataTypes.INTEGER,
        comment: '合约id'
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
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
    },
    isSync: {
        type: DataTypes.VIRTUAL,
        comment: '是否同步',
        get() {
            const mintActive = this.getDataValue('mintActive');
            const mintAmount = this.getDataValue('mintAmount');
            return mintActive === 1 && mintAmount > 0;
        },
        set(_) {
          throw new Error('isSync 是虚拟字段，只读');
        }
    },
}, {
    tableName: 'token_info',
    timestamps: false, // 禁用自动时间戳
    underscored: true, // 将驼峰式字段转换为下划线风格
    comment: '代币信息'
});

export default TokenInfo;

