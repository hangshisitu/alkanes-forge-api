import AlkanesService from '../service/AlkanesService.js';
import TokenInfoMapper from '../mapper/TokenInfoMapper.js';
import TokenInfoService from '../service/TokenInfoService.js';
import MempoolService from '../service/MempoolService.js';
import * as RedisHelper from '../lib/RedisHelper.js';
import { Constants } from '../conf/constants.js';

/**
 * @swagger
 * /token/all:
 *   post:
 *     summary: Get all Alkanes tokens
 *     tags: [Token]
 *     responses:
 *       200:
 *         description: List of all Alkanes tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   symbol:
 *                     type: string
 */
async function all(ctx) {
    const result = await AlkanesService.getAllAlkanes();
    return result;
}

/**
 * @swagger
 * /token/prices:
 *   post:
 *     summary: Get token prices by IDs
 *     tags: [Token]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of token IDs
 *     responses:
 *       200:
 *         description: Token prices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: number
 */
async function price(ctx) {
    const { ids } = ctx.request.body;
    const result = await TokenInfoMapper.getTokenPrice(ids);
    return result;
}

/**
 * @swagger
 * /token/page:
 *   post:
 *     summary: Get paginated list of tokens with filters
 *     tags: [Token]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Filter by token name
 *               mintActive:
 *                 type: boolean
 *                 description: Filter by mint active status
 *               noPremine:
 *                 type: boolean
 *                 description: Filter by no premine status
 *               orderType:
 *                 type: string
 *                 description: Order type for sorting
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: Paginated token list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 records:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 pages:
 *                   type: integer
 */
async function page(ctx) {
    const { name, mintActive, noPremine, orderType, page, size } = ctx.request.body;
    const tokenList = await TokenInfoService.getTokenPage(name, mintActive, noPremine, orderType, page, size);
    for (const row of tokenList.records) {
        row.mempool = await MempoolService.getMempoolData(row.id);
    }
    return tokenList;
}

/**
 * @swagger
 * /token/info:
 *   post:
 *     summary: Get detailed information about a specific token
 *     tags: [Token]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: Token ID
 *     responses:
 *       200:
 *         description: Token information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 symbol:
 *                   type: string
 *                 mempool:
 *                   type: object
 */
async function info(ctx) {
    const { id } = ctx.request.body;
    const tokenInfo = await TokenInfoMapper.getById(id);
    if (tokenInfo) {
        tokenInfo.dataValues.mempool = await MempoolService.getMempoolData(id);
    }
    return tokenInfo;
}

/**
 * @swagger
 * /token/mempool:
 *   post:
 *     summary: Get mempool information for a token
 *     tags: [Token]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: Token ID
 *     responses:
 *       200:
 *         description: Mempool information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mempool:
 *                   type: object
 *                 minimumFeeRate:
 *                   type: number
 */
async function mempool(ctx) {
    const { id } = ctx.request.body;
    const mempoolInfo = await MempoolService.getMempoolData(id);
    const mempoolBlocks = await RedisHelper.get(Constants.REDIS_KEY.MEMPOOL_FEES_MEMPOOL_BLOCKS);
    const block = mempoolBlocks ? JSON.parse(mempoolBlocks)[0] : null;
    return {
        ...mempoolInfo,
        minimumFeeRate: block?.feeRange[0]
    }
}

export default [
    {
        path: Constants.API.TOKEN.ALL,
        method: 'post',
        handler: all
    },
    {
        path: Constants.API.TOKEN.PRICE,
        method: 'post',
        handler: price
    },
    {
        path: Constants.API.TOKEN.PAGE,
        method: 'post',
        handler: page
    },
    {
        path: Constants.API.TOKEN.INFO,
        method: 'post',
        handler: info
    },
    {
        path: Constants.API.TOKEN.MEMPOOL,
        method: 'post',
        handler: mempool
    }
]














