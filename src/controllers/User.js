import UserService from '../service/UserService.js';
import BaseService from '../service/BaseService.js';
import AlkanesService from '../service/AlkanesService.js';
import { Constants } from '../conf/constants.js';

/**
 * @swagger
 * /user/nonce:
 *   post:
 *     summary: Get nonce for user authentication
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 description: User's wallet address
 *     responses:
 *       200:
 *         description: Nonce generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce:
 *                   type: string
 */
async function nonce(ctx) {
    const { address } = ctx.request.body;
    const result = await UserService.nonce(address);
    return result;
}

/**
 * @swagger
 * /user/login:
 *   post:
 *     summary: User login with signature
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - signature
 *             properties:
 *               address:
 *                 type: string
 *                 description: User's wallet address
 *               signature:
 *                 type: string
 *                 description: Signature of the nonce
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 */
async function login(ctx) {
    const { address, signature } = ctx.request.body;
    const result = await UserService.login(address, signature);
    return result;
}

/**
 * @swagger
 * /user/btcBalance:
 *   post:
 *     summary: Get BTC balance for an address
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 description: BTC address to check balance
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   description: BTC balance in satoshis
 */
async function btcBalance(ctx) {
    const { address } = ctx.request.body;
    const result = await BaseService.getBalanceByMempool(address);
    return result;
}

/**
 * @swagger
 * /user/alkanesBalance:
 *   post:
 *     summary: Get Alkanes balance for an address
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 description: Alkanes address to check balance
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   description: Alkanes balance
 */
async function alkanesBalance(ctx) {
    const { address } = ctx.request.body;
    const result = await UserService.getAlkanesBalance(address, true);
    return result;
}

/**
 * @swagger
 * /user/transferAlkanes:
 *   post:
 *     summary: Transfer Alkanes tokens
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fundAddress
 *               - fundPublicKey
 *               - assetAddress
 *               - id
 *               - feerate
 *               - transferList
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               fundPublicKey:
 *                 type: string
 *                 description: Public key for funding address
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *               id:
 *                 type: string
 *                 description: Transaction ID
 *               feerate:
 *                 type: number
 *                 description: Fee rate for the transaction
 *               transferList:
 *                 type: array
 *                 description: List of transfers
 *                 items:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     amount:
 *                       type: number
 *     responses:
 *       200:
 *         description: Transfer initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 txid:
 *                   type: string
 *                   description: Transaction ID
 */
async function transferAlkanes(ctx) {
    const { fundAddress, fundPublicKey, assetAddress, id, feerate, transferList } = ctx.request.body;
    const result = await AlkanesService.transferToken(fundAddress, fundPublicKey, assetAddress, id, feerate, transferList);
    return result;
}

export default [
    {
        path: Constants.API.USER.NONCE,
        method: 'post',
        handler: nonce
    },
    {
        path: Constants.API.USER.LOGIN,
        method: 'post',
        handler: login
    },
    {
        path: Constants.API.USER.BTC_BALANCE,
        method: 'post',
        handler: btcBalance
    },
    {
        path: Constants.API.USER.ALKANES_BALANCE,
        method: 'post',
        handler: alkanesBalance
    },
    {
        path: Constants.API.USER.TRANSFER_ALKANES,
        method: 'post',
        handler: transferAlkanes
    }
]


