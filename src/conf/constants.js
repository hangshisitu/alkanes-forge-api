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

    TOKEN_STATS_TIME_FRAME: {
        HOUR: 1,    // 24小时
        DAY7: 2,    // 7天
        DAY30: 3,   // 30天
    },

    REDIS_KEY: {
        TOKEN_INFO_UPDATED_HEIGHT: 'token_info_updated_height'
    }
});
