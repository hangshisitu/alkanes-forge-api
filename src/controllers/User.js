import UserService from "../service/UserService.js";
import BaseService from "../service/BaseService.js";
import AlkanesService from "../service/AlkanesService.js";
import {Constants} from "../conf/constants.js";

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
    const {address} = ctx.request.body;
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
    const {address, signature} = ctx.request.body;
    return await UserService.login(address, signature);
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
    const {address} = ctx.request.body;
    return await BaseService.getBalanceByMempool(address);
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
 *               alkanesIds:
 *                 type: array
 *                 description: Alkanes ID to check balance
 *                 items:
 *                   type: string
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
    const {address, alkanesIds} = ctx.request.body;
    return await UserService.getAlkanesBalance(address, alkanesIds, true);
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
 *               outpoints:
 *                 type: array
 *                 description: List of outpoints
 *                 items:
 *                   type: object
 *                   properties:
 *                     txid:
 *                       type: string
 *                     vout:
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
    const {
        fundAddress,
        fundPublicKey,
        assetAddress,
        assetPublicKey,
        id,
        feerate,
        transferList,
        outpoints
    } = ctx.request.body;
    return await AlkanesService.transferToken(
        fundAddress,
        fundPublicKey,
        assetAddress,
        assetPublicKey,
        id,
        feerate,
        transferList,
        outpoints
    );
}

/**
 * @swagger
 * /user/assetsByUtxo:
 *   post:
 *     summary: Get assets by UTXO
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - txid
 *               - vout
 *             properties:
 *               address:
 *                 type: string
 *                 description: Address to check assets
 *               txid:
 *                 type: string
 *                 description: Transaction ID of the UTXO
 *               vout:
 *                 type: number
 *                 description: Output index of the UTXO
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       address:
 *                         type: string
 *                       balance:
 *                         type: number
 *                       txid:
 *                         type: string
 *                       vout:
 *                         type: number
 *                       value:
 *                         type: number
 *                       alkanesId:
 *                         type: string
 */
async function assetsByUtxo(ctx) {
    const { address, txid, vout } = ctx.request.body;
    return await UserService.getAssetsByUtxo(address, { txid, vout });
}

/**
 * @swagger
 * /user/splitAlkanesUtxo:
 *   post:
 *     summary: Split Alkanes UTXO
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
 *               - assetPublicKey
 *               - txid
 *               - vout
 *               - toAddresses
 *               - feerate
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
 *               assetPublicKey:
 *                 type: string
 *                 description: Public key for the asset address
 *               txid:
 *                 type: string
 *                 description: Transaction ID of the UTXO
 *               vout:
 *                 type: number
 *                 description: Output index of the UTXO
 *               toAddresses:
 *                 type: array
 *                 description: List of addresses to split the UTXO
 *                 items:
 *                   type: string
 *               feerate:
 *                 type: number
 *                 description: Fee rate for the transaction
 *     responses:
 *       200:
 *         description: Split initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 txid:
 *                   type: string
 *                   description: Transaction ID
 *                   example: "0x1234567890abcdef"
 */
async function splitAlkanesUtxo(ctx) {
    const { fundAddress, fundPublicKey, assetAddress, assetPublicKey, txid, vout, toAddresses, feerate } = ctx.request.body;
    return await AlkanesService.splitAlkanesUtxo(fundAddress, fundPublicKey, assetAddress, assetPublicKey, txid, vout, toAddresses, feerate);
}

/**
 * @swagger
 * /user/combineAlkanesUtxo:
 *   post:
 *     summary: Combine Alkanes UTXO
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
 *               - assetPublicKey
 *               - utxos
 *               - toAddress
 *               - feerate
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
 *               assetPublicKey:
 *                 type: string
 *                 description: Public key for the asset address
 *               utxos:
 *                 type: array
 *                 description: List of UTXOs
 *                 items:
 *                   type: object
 *                   properties:
 *                     txid:
 *                       type: string
 *                     vout:
 *                       type: number
 *               toAddress:
 *                 type: string
 *                 description: Address to send the combined UTXO
 *               feerate:
 *                 type: number
 *                 description: Fee rate for the transaction
 *             responses:
 *               200:
 *                 description: Combine initiated successfully
 *                 content:
 *                   application/json:
 *                     schema:
 *                       type: object
 *                       properties:
 *                         txid:
 *                           type: string
 *                           description: Transaction ID
 */
async function combineAlkanesUtxo(ctx) {
    const { fundAddress, fundPublicKey, assetAddress, assetPublicKey, utxos, toAddress, feerate } = ctx.request.body;
    return await AlkanesService.combineAlkanesUtxo(fundAddress, fundPublicKey, assetAddress, assetPublicKey, utxos, toAddress, feerate);
}

export default [
    {
        path: Constants.API.USER.NONCE,
        method: "post",
        handler: nonce,
    },
    {
        path: Constants.API.USER.LOGIN,
        method: "post",
        handler: login,
    },
    {
        path: Constants.API.USER.BTC_BALANCE,
        method: "post",
        handler: btcBalance,
    },
    {
        path: Constants.API.USER.ALKANES_BALANCE,
        method: "post",
        handler: alkanesBalance,
    },
    {
        path: Constants.API.USER.TRANSFER_ALKANES,
        method: "post",
        handler: transferAlkanes,
    },
    {
        path: Constants.API.USER.ASSETS_BY_UTXO,
        method: "post",
        handler: assetsByUtxo,
    },
    {
        path: Constants.API.USER.SPLIT_ALKANES_UTXO,
        method: "post",
        handler: splitAlkanesUtxo,
    },
    {
        path: Constants.API.USER.COMBINE_ALKANES_UTXO,
        method: "post",
        handler: combineAlkanesUtxo,
    },
];
