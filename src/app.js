import Koa from 'koa';
import cors from 'koa2-cors';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import * as util from 'util'
import AlkanesService from "./service/AlkanesService.js";
import UnisatAPI from "./lib/UnisatAPI.js";
import {jobMintStatus, jobs} from "./job/index.js";
import MarketService from "./service/MarketService.js";
import MarketListingMapper from "./mapper/MarketListingMapper.js";
import TokenStatsService from "./service/TokenStatsService.js";
import MarketEventMapper from "./mapper/MarketEventMapper.js";
import TokenInfoMapper from "./mapper/TokenInfoMapper.js";
import TokenInfoService from "./service/TokenInfoService.js";
import BaseService from "./service/BaseService.js";
import MempoolService from "./service/MempoolService.js";
import * as mempool from "./mempool/index.js";
import MintService from "./service/MintService.js";
import MintOrderMapper from "./mapper/MintOrderMapper.js";
import {Constants} from "./conf/constants.js";
import UserService from "./service/UserService.js";
import jwt from 'jsonwebtoken';
import * as logger from './conf/logger.js';
import BaseUtil from './utils/BaseUtil.js';

const app = new Koa();
const router = new Router();

BigInt.prototype.toJSON = function () {
    return this.toString();
};

//  捕获未知异常
process.on('uncaughtException', function (err) {
    logger.error(`got an uncaughtException: ${err}`, err);
});

const AUTH_PATHS = [
    Constants.API.INSCRIBE.ACCELERATE_MERGE_ORDER,
    Constants.API.INSCRIBE.CANCEL_MERGE_ORDER,
];

async function jwtAuth(ctx, next) {
    if (!AUTH_PATHS.includes(ctx.path)) {
        return await next();
    }

    const token = (ctx.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
        ctx.body = {
            code: 40101,
            msg: 'Authentication required: missing token.',
            data: null
        };
        return;
    }

    try {
        jwt.verify(token, Constants.JWT.SECRET);
        await next();
    } catch (err) {
        ctx.body = {
            code: 40101,
            msg: 'Token invalid or expired, please login again.',
            data: null
        };
    }
}

app.use(
    cors({
        origin: "*", // 允许所有来源
        exposeHeaders: ["Authorization", "X-Request-Id"],
        maxAge: 3600, // OPTIONS 预检请求的缓存时间（秒）
        credentials: false, // 不允许携带 Cookie
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // 允许的 HTTP 方法
        allowHeaders: ["Content-Type", "Authorization", "Accept", "wallet-type"], // 允许的请求头
    })
);

// 增加请求体的大小限制为 '50mb'
app.use(bodyParser({
    jsonLimit: '50mb',    // 设置 JSON 体积的最大值
    formLimit: '50mb',   // 设置表单体积的最大值
    textLimit: '50mb',   // 设置文本体积的最大值
}));

// logger
app.use(async (ctx, next) => {
    logger.putContext({'traceId': BaseUtil.genId()});
    try {
        const start = Date.now();
        const bodyParams = JSON.stringify(ctx.request.body) || '';
        await next();
        const ms = Date.now() - start;
        const content = JSON.stringify(ctx.response.body) || '';
        const walletType = ctx.request.headers['wallet-type'] || '';
        logger.info(`request ${ctx.method} ${ctx.url} cost: ${ms}ms ${walletType} params: ${ctx.querystring} body: ${bodyParams} response: ${content}`);
    } finally {
        logger.clearContext();
    }
});

router
    // 基础接口
    .post('/config', async ctx => {
        try {
            const config = await BaseService.getConfig();
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': config
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/broadcast', async ctx => {
        try {
            const params = ctx.request.body;
            const { txid, error } = await UnisatAPI.unisatPush(params.psbt);
            if (error) {
                ctx.body = {
                    'code': 1,
                    'msg': error
                }
            } else {
                ctx.body = {
                    'code': 0,
                    'msg': 'ok',
                    'data': txid
                }
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    // 废弃接口
    .post('/balance', async ctx => {
        try {
            const params = ctx.request.body;
            const balance = await BaseService.getBalanceByMempool(params.address);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': balance
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/tokens', async ctx => {
        try {
            const alkanesList = await AlkanesService.getAllAlkanes();
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': alkanesList
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/deploy', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await AlkanesService.deployToken(params.fundAddress, params.fundPublicKey, params.toAddress, params.name,
                params.symbol, params.cap, params.perMint, params.premine, params.feerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/alkanesBalance', async ctx => {
        try {
            const params = ctx.request.body;
            const alkanesList = await UserService.getAlkanesBalance(params.address);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': alkanesList
            }
            // ctx.body = {
            //     'code': 1,
            //     'msg': 'Waiting for RPC to complete synchronization, please be patient.'
            // }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/transfer', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await AlkanesService.transferToken(params.fundAddress, params.fundPublicKey, params.assetAddress,
                params.id, params.feerate, params.transferList);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
            // ctx.body = {
            //     'code': 1,
            //     'msg': 'Not supported at the moment, please try again later.'
            // }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/createMint', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await AlkanesService.transferMintFee(params.fundAddress, params.fundPublicKey, params.toAddress,
                params.id, params.mints, params.postage, params.feerate, params.model);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
            // ctx.body = {
            //     'code': 1,
            //     'msg': 'Waiting for RPC to complete synchronization, please be patient.'
            // }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/startMint', async ctx => {
        try {
            const params = ctx.request.body;
            const txidList = await AlkanesService.startMint(params.fundAddress, params.toAddress,
                params.id, params.mints, params.postage, params.feerate, params.model, params.psbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': txidList
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    // 用户接口
    .post(Constants.API.USER.NONCE, async ctx => {
        const { address } = ctx.request.body;
        try {
            const result = await UserService.nonce(address);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.USER.LOGIN, async ctx => {
        const { address, signature } = ctx.request.body;
        try {
            const result = await UserService.login(address, signature);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.USER.BTC_BALANCE, async ctx => {
        try {
            const params = ctx.request.body;
            const balance = await BaseService.getBalanceByMempool(params.address);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': balance
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.USER.ALKANES_BALANCE, async ctx => {
        try {
            const params = ctx.request.body;
            const alkanesList = await UserService.getAlkanesBalance(params.address);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': alkanesList
            }
            // ctx.body = {
            //     'code': 1,
            //     'msg': 'Waiting for RPC to complete synchronization, please be patient.'
            // }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.USER.TRANSFER_ALKANES, async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await AlkanesService.transferToken(params.fundAddress, params.fundPublicKey, params.assetAddress,
                params.id, params.feerate, params.transferList);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
            // ctx.body = {
            //     'code': 1,
            //     'msg': 'Not supported at the moment, please try again later.'
            // }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    // Token接口
    .post(Constants.API.TOKEN.ALL, async ctx => {
        try {
            const alkanesList = await AlkanesService.getAllAlkanes();
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': alkanesList
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.TOKEN.PRICE, async ctx => {
        try {
            const params = ctx.request.body;
            const tokenList = await TokenInfoMapper.getTokenPrice(params.ids);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenList
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.TOKEN.PAGE, async ctx => {
        try {
            const params = ctx.request.body;
            const tokenList = await TokenInfoService.getTokenPage(params.name, params.mintActive, params.noPremine, params.orderType, params.page, params.size);
            for (const row of tokenList.records) {
                row.mempool = await MempoolService.getMempoolData(row.id);
            }
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenList
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.TOKEN.INFO, async ctx => {
        try {
            const params = ctx.request.body;
            const tokenInfo = await TokenInfoMapper.getById(params.id);
            if (tokenInfo) {
                tokenInfo.dataValues.mempool = await MempoolService.getMempoolData(params.id);
            }
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenInfo
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.TOKEN.MEMPOOL, async ctx => {
        try {
            const params = ctx.request.body;
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': await MempoolService.getMempoolData(params.id)
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    // 市场接口
    .post(Constants.API.MARKET.ASSETS, async ctx => {
        try {
            const params = ctx.request.body;
            const assetsList = await MarketService.assets(params.alkanesId, params.assetAddress);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': assetsList
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.LISTING, async ctx => {
        try {
            const params = ctx.request.body;
            const listingPage = await MarketListingMapper.getAllListing(params.alkanesId, params.sellerAddress, params.page, params.size, params.orderType);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': listingPage
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.CREATE_UNSIGNED_LISTING, async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MarketService.createUnsignedListing(params.assetAddress, params.assetPublicKey, params.fundAddress, params.listingList);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.PUT_SIGNED_LISTING, async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedListing(params.signedPsbt, false);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.CREATE_UNSIGNED_UPDATE, async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MarketService.createUnsignedUpdate(params.alkanesId, params.listingList, params.assetAddress, params.assetPublicKey, params.fundAddress);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.PUT_SIGNED_UPDATE, async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedListing(params.signedPsbt, true);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.CREATE_UNSIGNED_DELISTING, async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MarketService.createUnsignedDelisting(params.alkanesId, params.listingIds, params.fundAddress, params.fundPublicKey, params.assetAddress, params.assetPublicKey, params.feerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.PUT_SIGNED_DELISTING, async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedDelisting(params.signedPsbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.CREATE_UNSIGNED_BUYING, async ctx => {
        try {
            const params = ctx.request.body;
            const result = await MarketService.createUnsignedBuying(params.alkanesId, params.listingIds, params.fundAddress, params.fundPublicKey, params.assetAddress, params.feerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
            // ctx.body = {
            //     'code': 1,
            //     'msg': 'Waiting for RPC to complete synchronization, please be patient.'
            // }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.PUT_SIGNED_BUYING, async ctx => {
        try {
            const params = ctx.request.body;
            const txid = await MarketService.putSignedBuying(params.signedPsbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': txid
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.EVENTS, async ctx => {
        try {
            const params = ctx.request.body;
            const eventPage = await MarketEventMapper.getAllEvents(params.alkanesId, params.type, params.address, params.page, params.size);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': eventPage
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.MARKET.TOKEN_STATS, async ctx => {
        try {
            const params = ctx.request.body;
            const tokenStats = await TokenStatsService.queryTokenStats(params.alkanesId, params.type);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenStats
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    // 铸造接口
    .post(Constants.API.INSCRIBE.EST_CREATE_MERGE_ORDER, async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MintService.estCreateMergeOrder(params.fundAddress, params.fundPublicKey, params.toAddress, params.id, params.mints, params.postage, params.feerate, params.maxFeerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.PRE_CREATE_MERGE_ORDER, async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MintService.preCreateMergeOrder(params.fundAddress, params.fundPublicKey, params.toAddress, params.id, params.mints, params.postage, params.feerate, params.maxFeerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.CREATE_MERGE_ORDER, async ctx => {
        try {
            const params = ctx.request.body;
            const result = await MintService.createMergeOrder(params.orderId, params.psbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.ACCELERATE_MERGE_ORDER, async ctx => {
        try {
            const params = ctx.request.body;
            const result = await MintService.accelerateMergeOrder(params.orderId, params.feerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.PRE_CANCEL_MERGE_ORDER, async ctx => {
        try {
            const params = ctx.request.body;
            const { mintOrder, refundValue } = await MintService.preCancelMergeOrder(params.orderId);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': {
                    ...mintOrder,
                    refundValue
                }
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.CANCEL_MERGE_ORDER, async ctx => {
        try {
            const params = ctx.request.body;
            const result = await MintService.cancelMergeOrder(params.orderId);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.ORDER_PAGE, async ctx => {
        try {
            const params = ctx.request.body;
            const result = await MintOrderMapper.orderPage(params.page, params.size, params.receiveAddress);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post(Constants.API.INSCRIBE.ORDER_INFO, async ctx => {
        try {
            const params = ctx.request.body;
            const result = await MintService.orderInfo(params.orderId);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        } catch (e) {
            logger.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    });

app.use(bodyParser());
app.use(jwtAuth);

if (process.env.port) {
    app.use(router.routes());
    app.listen(process.env.port, () => {
        logger.info(`Server started on port ${process.env.port}`);
    });
}

if (process.env.jobEnable === 'true') {
    jobs();
    logger.info(`Jobs started.`)
}

if (process.env.jobMintStatusEnable === 'true') {
    jobMintStatus();
    logger.info(`jobMintStatus started.`)
}

if (process.env.mempoolEnable === 'true') {
    mempool.start();
    logger.info(`Mempool started.`)
}