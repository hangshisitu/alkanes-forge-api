export const Constants = Object.freeze({
    LISTING_STATUS: {
        LIST: 1,    // 已上架
        SOLD: 2,    // 已售出
        DELIST: 3,  // 已下架
    },

    MARKET_EVENT: {
        ALL: 0,     // 全部
        LIST: 1,    // 上架
        SOLD: 2,    // 售出
        DELIST: 3,  // 下架
        UPDATE: 4,  // 改价
        TRANSFER: 5,// 转移
    },

    LISTING_ORDER_TYPE: {
        PRICE_ASC: 1,       // 根据价格升序
        PRICE_DESC: 2,      // 根据价格倒序
        TOTAL_AMOUNT_ASC: 3,// 根据总价升序
        TOTAL_AMOUNT_DESC: 4// 根据总价倒序
    },

    TOKEN_INFO_ORDER_TYPE: {
        PROGRESS_DESC: 'progressDesc',  // 根据进度倒序
        PROGRESS_ASC: 'progressAsc',    // 根据进度升序
        ID_ASC: 'idAsc',                // 根据ID升序
        ID_DESC: 'idDesc',              // 根据ID倒序

        // 交易量排序字段 - 升序
        VOLUME_24H_ASC: 'volume24hAsc',
        VOLUME_7D_ASC: 'volume7dAsc',
        VOLUME_30D_ASC: 'volume30dAsc',
        VOLUME_TOTAL_ASC: 'volumeTotalAsc',

        // 交易量排序字段 - 降序
        VOLUME_24H_DESC: 'volume24hDesc',
        VOLUME_7D_DESC: 'volume7dDesc',
        VOLUME_30D_DESC: 'volume30dDesc',
        VOLUME_TOTAL_DESC: 'volumeTotalDesc',

        // 涨跌幅排序字段 - 升序
        PRICE_CHANGE_24H_ASC: 'priceChange24hAsc',
        PRICE_CHANGE_7D_ASC: 'priceChange7dAsc',
        PRICE_CHANGE_30D_ASC: 'priceChange30dAsc',

        // 涨跌幅排序字段 - 降序
        PRICE_CHANGE_24H_DESC: 'priceChange24hDesc',
        PRICE_CHANGE_7D_DESC: 'priceChange7dDesc',
        PRICE_CHANGE_30D_DESC: 'priceChange30dDesc',

        // 交易笔数排序字段 - 升序
        TRADES_COUNT_24H_ASC: 'tradesCount24hAsc',
        TRADES_COUNT_7D_ASC: 'tradesCount7dAsc',
        TRADES_COUNT_30D_ASC: 'tradesCount30dAsc',
        TRADES_COUNT_TOTAL_ASC: 'tradesCountTotalAsc',

        // 交易笔数排序字段 - 降序
        TRADES_COUNT_24H_DESC: 'tradesCount24hDesc',
        TRADES_COUNT_7D_DESC: 'tradesCount7dDesc',
        TRADES_COUNT_30D_DESC: 'tradesCount30dDesc',
        TRADES_COUNT_TOTAL_DESC: 'tradesCountTotalDesc',

        // 市值排序
        MARKET_CAP_DESC: 'marketCapDesc',
        MARKET_CAP_ASC: 'marketCapAsc',

        // 价格排序
        FLOOR_PRICE_DESC: 'floorPriceDesc',
        FLOOR_PRICE_ASC: 'floorPriceAsc',
    },

    TOKEN_STATS_TIME_FRAME: {
        HOUR: 1,    // 24小时
        DAY7: 2,    // 7天
        DAY30: 3,   // 30天
    },

    // 铸造模式选项
    MINT_MODEL: {
        NORMAL: 'normal',    // 1个utxo 1张
        MERGE: 'merge',    // 24张合并成1个utxo
    },

    // 铸造订单状态
    MINT_ORDER_STATUS: {
        UNPAID: 'unpaid',    // 未付款
        PARTIAL: 'partial',    // 部分铸造中
        MINTING: 'minting',    // 全部铸造中
        COMPLETED: 'completed',    // 全部铸造完成
        CANCELLED: 'cancelled',    // 已取消
    },

    // 铸造状态
    MINT_STATUS: {
        WAITING: 'waiting',    // 等待
        MINTING: 'minting',    // 铸造中
        COMPLETED: 'completed',    // 已完成
    },

    REDIS_KEY: {
        TOKEN_INFO_LIST: 'token_info_list',
        TOKEN_INFO_UPDATED_HEIGHT: 'token_info_updated_height',
        MEMPOOL_BLOCK_HEIGHT: 'mempool_block_height',
        INDEX_BLOCK_HEIGHT: 'index_block_height',

        BTC_PRICE_USD: 'btc_price_usd',
        MEMPOOL_FEES_RECOMMENDED: 'mempool_fees_recommended',
        MEMPOOL_FEES_MEMPOOL_BLOCKS: 'mempool_fees_mempool_blocks'
    }
});
