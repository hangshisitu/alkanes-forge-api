import Koa from 'koa';
import cors from 'koa2-cors';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import DateUtil from "./lib/DateUtil.js";
import * as util from 'util'
import AlkanesAPI from "./lib/AlkanesAPI.js";
import UnisatAPI from "./lib/UnisatAPI.js";
import {jobs} from "./job/index.js";

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
        allowHeaders: ["Content-Type", "Authorization", "Accept"], // 允许的请求头
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
    await next();
    const rt = ctx.response.get('X-Response-Time');
    console.log(`${DateUtil.now()} - ${ctx.method} ${ctx.url} - ${rt} - ${JSON.stringify(ctx.request.body)}`);
});

// x-response-time
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.set('X-Response-Time', `${ms}ms`);
});

router
    .post('/tokens', async ctx => {
        try {
            const alkanesList = await AlkanesAPI.getAllAlkanes();
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
            const psbt = await AlkanesAPI.deployToken(params.segwitAddress, params.taprootAddress, params.name,
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
            const params = ctx.request.body;
            const alkanesList = await AlkanesAPI.getAlkanesByAddress(params.address);
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
    .post('/transfer', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await AlkanesAPI.transferToken(params.segwitAddress, params.taprootAddress, params.toAddress,
                params.id, params.amount, params.feerate);
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
    .post('/createMint', async ctx => {
        try {
            const params = ctx.request.body;
            const psbt = await AlkanesAPI.transferMintFee(params.segwitAddress, params.taprootAddress,
                params.id, params.mints, params.postage, params.feerate);
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
    .post('/startMint', async ctx => {
        try {
            const params = ctx.request.body;
            const txidList = await AlkanesAPI.startMint(params.segwitAddress, params.taprootAddress,
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
    .post('/getAlkanesByUtxo', async ctx => {
        try {
            const params = ctx.request.body;
            const alkaneList = await AlkanesAPI.getAlkanesByUtxo(params.utxo);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': alkaneList
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
            const result = await UnisatAPI.unisatPush(params.psbt);
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result.data
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