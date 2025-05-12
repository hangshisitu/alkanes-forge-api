import {Constants} from "../conf/constants.js";
import LaunchService from "../service/LaunchService.js";

/**
 * @swagger
 * /launch/detail:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get launch detail by ID
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
 *                 description: Collection ID
 *     responses:
 *       200:
 *         description: Launch detail retrieved successfully
 */
async function detail(ctx) {
    const {id} = ctx.request.body;
    return await LaunchService.getDetail(id);
}

/**
 * @swagger
 * /launch/createOrder:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Create a new mint order
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
 *               - postage
 *               - feerate
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Fund address
 *               fundPublicKey:
 *                 type: string
 *                 description: Fund public key
 *               toAddress:
 *                 type: string
 *                 description: Destination address
 *               id:
 *                 type: string
 *                 description: Order ID
 *               mints:
 *                 type: array
 *                 description: Mint details
 *               postage:
 *                 type: number
 *                 description: Postage amount
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *     responses:
 *       200:
 *         description: Order created successfully
 */
async function createOrder(ctx) {
    const {collectionId, fundAddress, fundPublicKey, assetAddress, assetPublicKey, toAddress, feerate, paymentType, paymentAssets, paymentAmount} = ctx.request.body;
    const userAddress = ctx.state.address;
    return await LaunchService.createOrder(collectionId, userAddress, fundAddress, fundPublicKey, assetAddress, assetPublicKey, toAddress, feerate, paymentType, paymentAssets, paymentAmount)
}

/**
 * @swagger
 * /launch/startOrder:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Start a mint order
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
 *               - postage
 *               - feerate
 *               - psbt
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Fund address
 *               toAddress:
 *                 type: string
 *                 description: Destination address
 *               id:
 *                 type: string
 *                 description: Order ID
 *               mints:
 *                 type: array
 *                 description: Mint details
 *               postage:
 *                 type: number
 *                 description: Postage amount
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *               psbt:
 *                 type: string
 *                 description: Partially signed Bitcoin transaction
 *     responses:
 *       200:
 *         description: Order started successfully
 */
async function startOrder(ctx) {
    const {orderId, psbt} = ctx.request.body;
    return await LaunchService.startOrder(orderId, psbt)
}

/**
 * @swagger
 * /launch/orderPage:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get paginated order list
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *               - page
 *               - size
 *             properties:
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *               alkanesId:
 *                 type: string
 *                 description: Optional Alkanes ID to filter orders
 *     responses:
 *       200:
 *         description: Order list retrieved successfully
 */
async function orderPage(ctx) {
    let {page, size, alkanesId, collectionId} = ctx.request.body;
    collectionId = collectionId ?? alkanesId;
    const userAddress = ctx.state.address;
    return await LaunchService.getOrderPage(userAddress, page, size, collectionId)
}

/**
 * @swagger
 * /launch/banner:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get banner collections
 *     responses:
 *       200:
 *         description: Banner collections retrieved successfully
 */
async function bannerCollections(ctx) {
    return await LaunchService.getBannerCollections();
}

/**
 * @swagger
 * /launch/minting:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get minting collections with pagination
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - page
 *               - size
 *             properties:
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: Minting collections retrieved successfully
 */
async function mintingCollections(ctx) {
    const {page, size} = ctx.request.body;
    return await LaunchService.getMintingCollections(page, size);
}

/**
 * @swagger
 * /launch/upcoming:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get upcoming collections with pagination
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - page
 *               - size
 *             properties:
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: Upcoming collections retrieved successfully
 */
async function upcomingCollections(ctx) {
    const {page, size} = ctx.request.body;
    return await LaunchService.getUpcomingCollections(page, size);
}

/**
 * @swagger
 * /launch/completed:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get completed collections with pagination
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - page
 *               - size
 *             properties:
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: Completed collections retrieved successfully
 */
async function completedCollections(ctx) {
    const {page, size} = ctx.request.body;
    return await LaunchService.getCompletedCollections(page, size);
}

/**
 * @swagger
 * /launch/mintLimit:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Get mint limit
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - launchId
 *               - receiveAddress
 *             properties:
 *               launchId:
 *                 type: string
 *                 description: Collection ID
 *               receiveAddress:
 *                 type: string
 *                 description: Receive address
 *     responses:
 *       200:
 *         description: Mint limit retrieved successfully
 */
async function mintLimit(ctx) {
    const {launchId, receiveAddress} = ctx.request.body;
    return await LaunchService.getMintLimit(receiveAddress, launchId);
}

/**
 * @swagger
 * /launch/checkWhitelist:
 *   post:
 *     tags:
 *       - Launch
 *     summary: Check whitelist
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - launchId
 *               - stage
 *               - receiveAddress
 *             properties:
 *               launchId:
 *                 type: string
 *                 description: Collection ID
 *               stage:
 *                 type: string
 *                 description: Stage
 *               receiveAddress:
 *                 type: string
 *                 description: Receive address
 *     responses:
 *       200:
 *         description: Whitelist checked successfully
 */
async function checkWhitelist(ctx) {
    const {launchId, stage, receiveAddress} = ctx.request.body;
    return await LaunchService.checkWhitelist(receiveAddress, launchId, stage);
}


export default [
    {
        path: Constants.API.LAUNCH.DETAIL,
        method: 'post',
        handler: detail
    },
    {
        path: Constants.API.LAUNCH.CREATE_ORDER,
        method: 'post',
        handler: createOrder
    },
    {
        path: Constants.API.LAUNCH.START_ORDER,
        method: 'post',
        handler: startOrder
    },
    {
        path: Constants.API.LAUNCH.BANNER_COLLECTIONS,
        method: 'post',
        handler: bannerCollections
    },
    {
        path: Constants.API.LAUNCH.MINTING_COLLECTIONS,
        method: 'post',
        handler: mintingCollections
    },
    {
        path: Constants.API.LAUNCH.UPCOMING_COLLECTIONS,
        method: 'post',
        handler: upcomingCollections
    },
    {
        path: Constants.API.LAUNCH.COMPLETED_COLLECTIONS,
        method: 'post',
        handler: completedCollections
    },
    {
        path: Constants.API.LAUNCH.ORDER_PAGE,
        method: 'post',
        handler: orderPage
    },
    {
        path: Constants.API.LAUNCH.MINT_LIMIT,
        method: 'post',
        handler: mintLimit
    },
    {
        path: Constants.API.LAUNCH.CHECK_WHITELIST,
        method: 'post',
        handler: checkWhitelist
    }
]