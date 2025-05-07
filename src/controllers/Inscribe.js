import MintService from '../service/MintService.js';
import MintOrderMapper from '../mapper/MintOrderMapper.js';
import AlkanesService from '../service/AlkanesService.js';
import {Constants} from '../conf/constants.js';

/**
 * @swagger
 * /inscribe/estCreateMergeOrder:
 *   post:
 *     summary: Estimate cost for creating a merge order
 *     tags: [Inscribe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fundAddress
 *               - toAddress
 *               - id
 *               - mints
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               toAddress:
 *                 type: string
 *                 description: Destination address
 *               id:
 *                 type: string
 *                 description: Token ID
 *               mints:
 *                 type: array
 *                 description: List of mints to merge
 *               postage:
 *                 type: number
 *                 description: Postage amount
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *               maxFeerate:
 *                 type: number
 *                 description: Maximum fee rate
 *     responses:
 *       200:
 *         description: Cost estimation successful
 */
async function estCreateMergeOrder(ctx) {
    const { fundAddress, toAddress, id, mints, postage, feerate, maxFeerate } = ctx.request.body;
    return await MintService.estCreateMergeOrder(fundAddress, toAddress, id, mints, postage, feerate, maxFeerate);
}

/**
 * @swagger
 * /inscribe/preCreateMergeOrder:
 *   post:
 *     summary: Prepare for creating a merge order
 *     tags: [Inscribe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fundAddress
 *               - fundPublicKey
 *               - toAddress
 *               - id
 *               - mints
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               fundPublicKey:
 *                 type: string
 *                 description: Public key for funding address
 *               toAddress:
 *                 type: string
 *                 description: Destination address
 *               id:
 *                 type: string
 *                 description: Token ID
 *               mints:
 *                 type: array
 *                 description: List of mints to merge
 *               postage:
 *                 type: number
 *                 description: Postage amount
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *               maxFeerate:
 *                 type: number
 *                 description: Maximum fee rate
 *     responses:
 *       200:
 *         description: Preparation successful
 */
async function preCreateMergeOrder(ctx) {
    const { fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate, maxFeerate } = ctx.request.body;
    const userAddress = ctx.state.address;
    return await MintService.preCreateMergeOrder(fundAddress, fundPublicKey, userAddress, toAddress, id, mints, postage, feerate, maxFeerate);
}

/**
 * @swagger
 * /inscribe/createMergeOrder:
 *   post:
 *     summary: Create a merge order
 *     tags: [Inscribe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - psbt
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *               psbt:
 *                 type: string
 *                 description: Partially signed Bitcoin transaction
 *     responses:
 *       200:
 *         description: Order created successfully
 */
async function createMergeOrder(ctx) {
    const { orderId, psbt } = ctx.request.body;
    const userAddress = ctx.state.address;
    return await MintService.createMergeOrder(orderId, userAddress, psbt);
}

/**
 * @swagger
 * /inscribe/accelerateMergeOrder:
 *   post:
 *     summary: Accelerate a merge order
 *     tags: [Inscribe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - feerate
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *               feerate:
 *                 type: number
 *                 description: New fee rate
 *     responses:
 *       200:
 *         description: Order accelerated successfully
 */
async function accelerateMergeOrder(ctx) {
    const { orderId, feerate } = ctx.request.body;
    const userAddress = ctx.state.address;
    return await MintService.accelerateMergeOrder(orderId, feerate, userAddress);
}

/**
 * @swagger
 * /inscribe/preCancelMergeOrder:
 *   post:
 *     summary: Prepare for canceling a merge order
 *     tags: [Inscribe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *     responses:
 *       200:
 *         description: Preparation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mintOrder:
 *                   type: object
 *                 refundValue:
 *                   type: number
 */
async function preCancelMergeOrder(ctx) {
    const { orderId } = ctx.request.body;
    const { mintOrder, refundValue } = await MintService.preCancelMergeOrder(orderId);
    return {
        ...mintOrder,
        refundValue
    }
}

/**
 * @swagger
 * /inscribe/cancelMergeOrder:
 *   post:
 *     summary: Cancel a merge order
 *     tags: [Inscribe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *     responses:
 *       200:
 *         description: Order canceled successfully
 */
async function cancelMergeOrder(ctx) {
    const { orderId } = ctx.request.body;
    const userAddress = ctx.state.address;
    return await MintService.cancelMergeOrder(orderId, userAddress);
}

/**
 * @swagger
 * /inscribe/orderPage:
 *   post:
 *     summary: Get paginated list of orders
 *     tags: [Inscribe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *               receiveAddress:
 *                 type: string
 *                 description: Filter by receive address
 *     responses:
 *       200:
 *         description: List of orders
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
async function orderPage(ctx) {
    const { page, size, receiveAddress } = ctx.request.body;
    return await MintOrderMapper.orderPage(page, size, receiveAddress);
}

/**
 * @swagger
 * /inscribe/orderInfo:
 *   post:
 *     summary: Get detailed information about a specific order
 *     tags: [Inscribe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *     responses:
 *       200:
 *         description: Order information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
async function orderInfo(ctx) {
    const { orderId } = ctx.request.body;
    return await MintOrderMapper.orderInfo(orderId);
}

/**
 * @swagger
 * /inscribe/deployToken:
 *   post:
 *     summary: Deploy a new token
 *     tags: [Inscribe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fundAddress
 *               - fundPublicKey
 *               - toAddress
 *               - name
 *               - symbol
 *               - cap
 *               - perMint
 *               - premine
 *               - feerate
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               fundPublicKey:
 *                 type: string
 *                 description: Public key for funding address
 *               toAddress:
 *                 type: string
 *                 description: Destination address
 *               name:
 *                 type: string
 *                 description: Token name
 *               symbol:
 *                 type: string
 *                 description: Token symbol
 *               cap:
 *                 type: number
 *                 description: Token supply cap
 *               perMint:
 *                 type: number
 *                 description: Amount per mint
 *               premine:
 *                 type: number
 *                 description: Premine amount
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *     responses:
 *       200:
 *         description: Token deployed successfully
 */
async function deployToken(ctx) {
    const { fundAddress, fundPublicKey, toAddress, name, symbol, cap, perMint, premine, feerate } = ctx.request.body;
    return await AlkanesService.deployToken(fundAddress, fundPublicKey, toAddress, name, symbol, cap, perMint, premine, feerate);
}

export default [
    {
        path: Constants.API.INSCRIBE.EST_CREATE_MERGE_ORDER,
        method: 'post',
        handler: estCreateMergeOrder
    },
    {
        path: Constants.API.INSCRIBE.PRE_CREATE_MERGE_ORDER,
        method: 'post',
        handler: preCreateMergeOrder
    },
    {
        path: Constants.API.INSCRIBE.CREATE_MERGE_ORDER,
        method: 'post',
        handler: createMergeOrder
    },
    {
        path: Constants.API.INSCRIBE.ACCELERATE_MERGE_ORDER,
        method: 'post',
        handler: accelerateMergeOrder
    },
    {
        path: Constants.API.INSCRIBE.PRE_CANCEL_MERGE_ORDER,
        method: 'post',
        handler: preCancelMergeOrder
    },
    {
        path: Constants.API.INSCRIBE.CANCEL_MERGE_ORDER,
        method: 'post',
        handler: cancelMergeOrder
    },
    {
        path: Constants.API.INSCRIBE.ORDER_PAGE,
        method: 'post',
        handler: orderPage
    },
    {
        path: Constants.API.INSCRIBE.ORDER_INFO,
        method: 'post',
        handler: orderInfo
    },
    {
        path: Constants.API.INSCRIBE.DEPLOY_TOKEN,
        method: 'post',
        handler: deployToken
    }
]



