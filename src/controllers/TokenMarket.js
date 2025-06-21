import MarketService from '../service/MarketService.js';
import { Constants } from '../conf/constants.js';
import MarketListingMapper from '../mapper/MarketListingMapper.js';
import MarketEventMapper from '../mapper/MarketEventMapper.js';
import TokenStatsService from '../service/TokenStatsService.js';

/**
 * @swagger
 * /market/assets:
 *   post:
 *     summary: Get token assets
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alkanesId
 *               - assetAddress
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *     responses:
 *       200:
 *         description: List of token assets
 */
async function assets(ctx) {
    const { alkanesId, assetAddress } = ctx.request.body;
    return await MarketService.assets(alkanesId, assetAddress);
}

/**
 * @swagger
 * /market/listing:
 *   post:
 *     summary: Get paginated list of token listings
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               sellerAddress:
 *                 type: string
 *                 description: Filter by seller address
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *               orderType:
 *                 type: string
 *                 description: Order type for sorting
 *     responses:
 *       200:
 *         description: List of token listings
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
async function listingPage(ctx) {
    const { alkanesId, sellerAddress, page, size, orderType } = ctx.request.body;
    return await MarketListingMapper.getAllListing(alkanesId, sellerAddress, page, size, orderType);
}

/**
 * @swagger
 * /market/createUnsignedListing:
 *   post:
 *     summary: Create unsigned listing transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetAddress
 *               - assetPublicKey
 *               - fundAddress
 *               - listingList
 *             properties:
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *               assetPublicKey:
 *                 type: string
 *                 description: Asset public key
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               listingList:
 *                 type: array
 *                 description: List of listings
 *                 items:
 *                   type: object
 *                   properties:
 *                     txid:
 *                       type: string
 *                     vout:
 *                       type: number
 *                     listingAmount:
 *                       type: number
 *                     value:
 *                       type: number
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 */
async function createUnsignedListing(ctx) {
    const { assetAddress, assetPublicKey, fundAddress, listingList } = ctx.request.body;
    return await MarketService.createUnsignedListing(assetAddress, assetPublicKey, fundAddress, listingList);
}

/**
 * @swagger
 * /market/putSignedListing:
 *   post:
 *     summary: Submit signed listing transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedPsbt
 *             properties:
 *               signedPsbt:
 *                 type: string
 *                 description: Signed PSBT transaction
 *     responses:
 *       200:
 *         description: Listing submitted successfully
 */
async function putSignedListing(ctx) {
    const { signedPsbt } = ctx.request.body;
    return await MarketService.putSignedListing(signedPsbt, false);
}

/**
 * @swagger
 * /market/createUnsignedUpdate:
 *   post:
 *     summary: Create unsigned update transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alkanesId
 *               - listingList
 *               - assetAddress
 *               - assetPublicKey
 *               - fundAddress
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               listingList:
 *                 type: array
 *                 description: List of listings to update
 *                 items:
 *                   type: object
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *               assetPublicKey:
 *                 type: string
 *                 description: Asset public key
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 */
async function createUnsignedUpdate(ctx) {
    const { alkanesId, listingList, assetAddress, assetPublicKey, fundAddress } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await MarketService.createUnsignedUpdate(alkanesId, listingList, assetAddress, assetPublicKey, fundAddress, walletType);
}

/**
 * @swagger
 * /market/putSignedUpdate:
 *   post:
 *     summary: Submit signed update transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedPsbt
 *             properties:
 *               signedPsbt:
 *                 type: string
 *                 description: Signed PSBT transaction
 *     responses:
 *       200:
 *         description: Update submitted successfully
 */
async function putSignedUpdate(ctx) {
    const { signedPsbt } = ctx.request.body;
    return await MarketService.putSignedListing(signedPsbt, true);
}

/**
 * @swagger
 * /market/createUnsignedDelisting:
 *   post:
 *     summary: Create unsigned delisting transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alkanesId
 *               - listingIds
 *               - fundAddress
 *               - fundPublicKey
 *               - assetAddress
 *               - assetPublicKey
 *               - feerate
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               listingIds:
 *                 type: array
 *                 description: List of listing IDs to delist
 *                 items:
 *                   type: string
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               fundPublicKey:
 *                 type: string
 *                 description: Funding public key
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *               assetPublicKey:
 *                 type: string
 *                 description: Asset public key
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 */
async function createUnsignedDelisting(ctx) {
    const { alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await MarketService.createUnsignedDelisting(alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, walletType);
}

/**
 * @swagger
 * /market/putSignedDelisting:
 *   post:
 *     summary: Submit signed delisting transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedPsbt
 *             properties:
 *               signedPsbt:
 *                 type: string
 *                 description: Signed PSBT transaction
 *     responses:
 *       200:
 *         description: Delisting submitted successfully
 */
async function putSignedDelisting(ctx) {
    const { signedPsbt } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await MarketService.putSignedDelisting(signedPsbt, walletType);
}

/**
 * @swagger
 * /market/createUnsignedBuying:
 *   post:
 *     summary: Create unsigned buying transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alkanesId
 *               - listingIds
 *               - fundAddress
 *               - fundPublicKey
 *               - assetAddress
 *               - feerate
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               listingIds:
 *                 type: array
 *                 description: List of listing IDs to buy
 *                 items:
 *                   type: string
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               fundPublicKey:
 *                 type: string
 *                 description: Funding public key
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 */
async function createUnsignedBuying(ctx) {
    const { alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, feerate } = ctx.request.body;
    return await MarketService.createUnsignedBuying(alkanesId, listingIds, fundAddress, fundPublicKey, assetAddress, Math.max(1.2, feerate));
}

/**
 * @swagger
 * /market/putSignedBuying:
 *   post:
 *     summary: Submit signed buying transaction
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedPsbt
 *             properties:
 *               signedPsbt:
 *                 type: string
 *                 description: Signed PSBT transaction
 *     responses:
 *       200:
 *         description: Buying transaction submitted successfully
 */
async function putSignedBuying(ctx) {
    const { signedPsbt } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await MarketService.putSignedBuying(signedPsbt, walletType);
}

/**
 * @swagger
 * /market/events:
 *   post:
 *     summary: Get token market events
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               type:
 *                 type: string
 *                 description: Event type
 *               address:
 *                 type: string
 *                 description: Filter by address
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: List of market events
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
async function events(ctx) {
    const { alkanesId, type, address, page, size } = ctx.request.body;
    return await MarketEventMapper.getAllEvents(alkanesId, type, address, page, size);
}

/**
 * @swagger
 * /market/tokenStats:
 *   post:
 *     summary: Get token statistics
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alkanesId
 *               - type
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               type:
 *                 type: string
 *                 description: Statistics type
 *     responses:
 *       200:
 *         description: Token statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
async function tokenStats(ctx) {
    const { alkanesId, type } = ctx.request.body;
    return await TokenStatsService.queryTokenStats(alkanesId, type);
}

/**
 * @swagger
 * /market/preAccelerateTrade:
 *   post:
 *     summary: Pre-accelerate trade
 *     tags: [Token Market]
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
 *               - txid
 *               - feerate
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Funding address
 *               fundPublicKey:
 *                 type: string
 *                 description: Funding public key
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *               txid:
 *                 type: string
 *                 description: Transaction ID
 *               feerate:
 *                 type: number
 *                 description: Fee rate
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 */
async function preAccelerateTrade(ctx) {
    const { fundAddress, fundPublicKey, assetAddress, txid, feerate } = ctx.request.body;
    const userAddress = ctx.state.address;
    return await MarketService.preAccelerateTrade(fundAddress, fundPublicKey, assetAddress, txid, feerate, userAddress);
}

/**
 * @swagger
 * /market/accelerateTrade:
 *   post:
 *     summary: Accelerate trade
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedPsbt
 *             properties:
 *               signedPsbt:
 *                 type: string
 *                 description: Signed PSBT transaction
 *     responses:
 *       200:
 *         description: Accelerated trade submitted successfully
 */
async function accelerateTrade(ctx) {
    const { signedPsbt } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await MarketService.putSignedBuying(signedPsbt, walletType, true);
}

/**
 * @swagger
 * /market/userTrades:
 *   post:
 *     summary: Get user trades
 *     tags: [Token Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: List of user trades
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
async function userTrades(ctx) {
    const { alkanesId, page, size } = ctx.request.body;
    const userAddress = ctx.state.address;
    return await MarketService.getUserTrades(alkanesId, userAddress, page, size);
}

export default [
    {
        path: Constants.API.MARKET.ASSETS,
        method: 'post',
        handler: assets
    },
    {
        path: Constants.API.MARKET.LISTING,
        method: 'post',
        handler: listingPage
    },
    {
        path: Constants.API.MARKET.CREATE_UNSIGNED_LISTING,
        method: 'post',
        handler: createUnsignedListing
    },
    {
        path: Constants.API.MARKET.PUT_SIGNED_LISTING,
        method: 'post',
        handler: putSignedListing
    },
    {
        path: Constants.API.MARKET.CREATE_UNSIGNED_UPDATE,
        method: 'post',
        handler: createUnsignedUpdate
    },
    {
        path: Constants.API.MARKET.PUT_SIGNED_UPDATE,
        method: 'post',
        handler: putSignedUpdate
    },
    {
        path: Constants.API.MARKET.CREATE_UNSIGNED_DELISTING,
        method: 'post',
        handler: createUnsignedDelisting
    },
    {
        path: Constants.API.MARKET.PUT_SIGNED_DELISTING,
        method: 'post',
        handler: putSignedDelisting
    },
    {
        path: Constants.API.MARKET.CREATE_UNSIGNED_BUYING,
        method: 'post',
        handler: createUnsignedBuying
    },
    {
        path: Constants.API.MARKET.PUT_SIGNED_BUYING,
        method: 'post',
        handler: putSignedBuying
    },
    {
        path: Constants.API.MARKET.EVENTS,
        method: 'post',
        handler: events
    },
    {
        path: Constants.API.MARKET.TOKEN_STATS,
        method: 'post',
        handler: tokenStats
    },
    {
        path: Constants.API.MARKET.PRE_ACCELERATE_TRADE,
        method: 'post',
        handler: preAccelerateTrade
    },
    {
        path: Constants.API.MARKET.ACCELERATE_TRADE,
        method: 'post',
        handler: accelerateTrade
    },
    {
        path: Constants.API.MARKET.USER_TRADES,
        method: 'post',
        handler: userTrades
    }
]
