import Koa from 'koa';
import cors from 'koa2-cors';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import * as util from 'util'
import AlkanesService from "./service/AlkanesService.js";
import UnisatAPI from "./lib/UnisatAPI.js";
import {jobs} from "./job/index.js";
import MarketService from "./service/MarketService.js";
import MarketListingMapper from "./mapper/MarketListingMapper.js";
import TokenStatsService from "./service/TokenStatsService.js";
import MarketEventMapper from "./mapper/MarketEventMapper.js";
import TokenInfoMapper from "./mapper/TokenInfoMapper.js";
import BaseService from "./service/BaseService.js";

const app = new Koa();
const router = new Router();

BigInt.prototype.toJSON = function () {
    return this.toString();
};

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
    const start = Date.now();
    const bodyParams = JSON.stringify(ctx.request.body) || '';
    await next();
    const ms = Date.now() - start;
    const content = JSON.stringify(ctx.response.body) || '';
    const walletType = ctx.request.headers['wallet-type'] || '';
    console.log(`request ${ctx.method} ${ctx.url} cost: ${ms}ms ${walletType} params: ${ctx.querystring} boday: ${bodyParams} response: ${content}`)
});

router
    .post('/tokens', async ctx => {
        try {
            const alkanesList = await AlkanesService.getAllAlkanes();
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': alkanesList
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
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
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/alkanesBalance', async ctx => {
        try {
            // const params = ctx.request.body;
            // const alkanesList = await AlkanesService.getAlkanesByAddress(params.address);
            // ctx.body = {
            //     'code': 0,
            //     'msg': 'ok',
            //     'data': alkanesList
            // }
            ctx.body = {
                'code': 1,
                'msg': 'Not supported at the moment, please try again later.'
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/transfer', async ctx => {
        try {
            // const params = ctx.request.body;
            // const psbt = await AlkanesService.transferToken(params.fundAddress, params.fundPublicKey, params.assetAddress,
            //     params.id, params.feerate, params.transferList);
            // ctx.body = {
            //     'code': 0,
            //     'msg': 'ok',
            //     'data': psbt
            // }
            ctx.body = {
                'code': 1,
                'msg': 'Not supported at the moment, please try again later.'
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/createMint', async ctx => {
        try {
            // const params = ctx.request.body;
            // const psbt = await AlkanesService.transferMintFee(params.fundAddress, params.fundPublicKey, params.toAddress,
            //     params.id, params.mints, params.postage, params.feerate);
            // ctx.body = {
            //     'code': 0,
            //     'msg': 'ok',
            //     'data': psbt
            // }

            ctx.body = {
                'code': 1,
                'msg': 'Not supported at the moment, please try again later.'
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
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
                params.id, params.mints, params.postage, params.feerate, params.psbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': txidList
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/broadcast', async ctx => {
        try {
            const params = ctx.request.body;
            const txid = await UnisatAPI.unisatPush(params.psbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': txid
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    .post('/indexHeight', async ctx => {
        try {
            const height = BaseService.getIndexHeight();
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': height
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/config', async ctx => {
        try {
            const config = await BaseService.getConfig();
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': config
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
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
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    .post('/token/page', async ctx => {
        try {
            const params = ctx.request.body;
            const tokenList = await TokenInfoMapper.findTokenPage(params.name, params.mintActive, params.orderType, params.page, params.size);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenList
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/token/info', async ctx => {
        try {
            const params = ctx.request.body;
            const tokenInfo = await TokenInfoMapper.getById(params.id);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenInfo
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

    .post('/market/assets', async ctx => {
        try {
            const params = ctx.request.body;
            const assetsList = await MarketService.assets(params.alkanesId, params.assetAddress);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': assetsList
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/listing', async ctx => {
        try {
            const params = ctx.request.body;
            const listingPage = await MarketListingMapper.getAllListing(params.alkanesId, params.sellerAddress, params.page, params.size, params.orderType);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': listingPage
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/createUnsignedListing', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MarketService.createUnsignedListing(params.assetAddress, params.assetPublicKey, params.fundAddress, params.listingList);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/putSignedListing', async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedListing(params.signedPsbt, false);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/createUnsignedUpdate', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MarketService.createUnsignedUpdate(params.alkanesId, params.listingList, params.assetAddress, params.assetPublicKey, params.fundAddress);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/putSignedUpdate', async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedListing(params.signedPsbt, true);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/createUnsignedDelisting', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await MarketService.createUnsignedDelisting(params.alkanesId, params.listingIds, params.fundAddress, params.fundPublicKey, params.assetAddress, params.assetPublicKey, params.feerate);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': psbt
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/putSignedDelisting', async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedDelisting(params.signedPsbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/createUnsignedBuying', async ctx => {
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
            //     'msg': 'Sandshrew RPC is down, cannot list for now, price overflow, purchase suspended.'
            // }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/putSignedBuying', async ctx => {
        try {
            const params = ctx.request.body;
            await MarketService.putSignedBuying(params.signedPsbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': ''
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/events', async ctx => {
        try {
            const params = ctx.request.body;
            const eventPage = await MarketEventMapper.getAllEvents(params.alkanesId, params.type, params.address, params.page, params.size);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': eventPage
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })
    .post('/market/tokenStats', async ctx => {
        try {
            const params = ctx.request.body;
            const tokenStats = await TokenStatsService.queryTokenStats(params.alkanesId, params.type);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': tokenStats
            }
        } catch (e) {
            console.error(`${util.inspect(e)}`)
            ctx.body = {
                'code': 1,
                'msg': e.message
            }
        }
    })

app.use(bodyParser());

if (process.env.port) {
    app.use(router.routes());
    app.listen(process.env.port, () => {
        console.log(`Server started on port ${process.env.port}`);
    });
}

if (process.env.jobEnable === 'true') {
    jobs();
    console.log(`Jobs started.`)
}