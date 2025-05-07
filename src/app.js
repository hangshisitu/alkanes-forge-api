import Koa from 'koa';
import cors from 'koa2-cors';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import * as util from 'util'
import {jobMintStatus, jobs, jobIndexer} from "./job/index.js";
import ControllerPaths from './controllers/index.js';
import * as mempool from "./mempool/index.js";
import {Constants} from "./conf/constants.js";
import jwt from 'jsonwebtoken';
import * as logger from './conf/logger.js';
import BaseUtil from './utils/BaseUtil.js';
import { swaggerSpec } from './lib/swagger.js';
import { koaSwagger } from 'koa2-swagger-ui';

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
    Constants.API.INSCRIBE.PRE_CREATE_MERGE_ORDER,
    Constants.API.INSCRIBE.CREATE_MERGE_ORDER,
    Constants.API.INSCRIBE.ACCELERATE_MERGE_ORDER,
    Constants.API.INSCRIBE.CANCEL_MERGE_ORDER,
    Constants.API.METHANE.COMMUNITY_CHECK,
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
        const decode = jwt.verify(token, Constants.JWT.SECRET);
        ctx.state.address = decode.address;
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

async function safe_request(func, ctx) {
    try {
        const result = await func(ctx);
        if (typeof result === 'function') {
            ctx.body = {
                'code': 0,
                'msg': 'ok',
            };
            result(ctx.body);
        } else {
            ctx.body = {
                'code': 0,
                'msg': 'ok',
                'data': result
            }
        }
    } catch (e) {
        logger.error(`${ctx.method} ${ctx.url} error: ${util.inspect(e)}`)
        ctx.body = {
            'code': 1,
            'msg': e.message
        }
    }
}

ControllerPaths.forEach(path => {
    router[path.method](`${path.path}`, async ctx => {
        await safe_request(path.handler, ctx);
    });
});

if (process.env.NODE_ENV !== 'pro') {
    // 添加Swagger UI路由
    router.get('/swagger', koaSwagger({
        routePrefix: false,
        swaggerOptions: {
        url: '/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
            'SwaggerUIStandalonePreset'
        ],
        },
    }));
    
    router.get('/swagger.json', async (ctx) => {
        ctx.set('Content-Type', 'application/json');
        ctx.body = swaggerSpec;
    });
}


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

if (process.env.indexerEnable === 'true') {
    jobIndexer();
    logger.info(`jobIndexer started.`)
}