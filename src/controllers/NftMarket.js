import NftMarketService from '../service/NftMarketService.js';
import NftCollectionStatsService from '../service/NftCollectionStatsService.js';
import { Constants } from '../conf/constants.js';

/**
 * @swagger
 * /nft/market/assets:
 *   post:
 *     summary: Get NFT assets for a collection
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *               - assetAddress
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
 *               assetAddress:
 *                 type: string
 *                 description: Asset address
 *     responses:
 *       200:
 *         description: List of NFT assets
 */
async function assets(ctx) {
    const { collectionId, assetAddress } = ctx.request.body;
    return await NftMarketService.assets(collectionId, assetAddress);
}

/**
 * @swagger
 * /nft/market/listing:
 *   post:
 *     summary: Get paginated list of NFT listings
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
 *               name:
 *                 type: string
 *                 description: Filter by name
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
 *         description: List of NFT listings
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
    const { collectionId, name, orderType, page, size } = ctx.request.body;
    return await NftMarketService.getListingPage(collectionId, name, orderType, page, size);
}

/**
 * @swagger
 * /nft/market/createUnsignedListing:
 *   post:
 *     summary: Create unsigned listing transaction
 *     tags: [NFT Market]
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
 *                     value:
 *                       type: number
 *                     listingAmount:
 *                       type: number
 *     responses:
 *       200:
 *         description: Unsigned transaction created successfully
 */
async function createUnsignedListing(ctx) {
    const { assetAddress, assetPublicKey, fundAddress, listingList } = ctx.request.body;
    return await NftMarketService.createUnsignedListing(assetAddress, assetPublicKey, fundAddress, listingList);
}

/**
 * @swagger
 * /nft/market/putSignedListing:
 *   post:
 *     summary: Submit signed listing transaction
 *     tags: [NFT Market]
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
    return await NftMarketService.putSignedListing(signedPsbt, false);
}

/**
 * @swagger
 * /nft/market/createUnsignedUpdate:
 *   post:
 *     summary: Create unsigned update transaction
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *               - listingList
 *               - assetAddress
 *               - assetPublicKey
 *               - fundAddress
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
 *               listingList:
 *                 type: array
 *                 description: List of listings to update
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     amount:
 *                       type: number
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
    const { collectionId, listingList, assetAddress, assetPublicKey, fundAddress } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await NftMarketService.createUnsignedUpdate(collectionId, listingList, assetAddress, assetPublicKey, fundAddress, walletType);
}

/**
 * @swagger
 * /nft/market/putSignedUpdate:
 *   post:
 *     summary: Submit signed update transaction
 *     tags: [NFT Market]
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
    return await NftMarketService.putSignedListing(signedPsbt, true);
}

/**
 * @swagger
 * /nft/market/createUnsignedDelisting:
 *   post:
 *     summary: Create unsigned delisting transaction
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *               - listingIds
 *               - fundAddress
 *               - fundPublicKey
 *               - assetAddress
 *               - assetPublicKey
 *               - feerate
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
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
    const { collectionId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate } = ctx.request.body;
    const walletType = ctx.get('wallet-type') || '';
    return await NftMarketService.createUnsignedDelisting(collectionId, listingIds, fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, walletType);
}

/**
 * @swagger
 * /nft/market/putSignedDelisting:
 *   post:
 *     summary: Submit signed delisting transaction
 *     tags: [NFT Market]
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
    return await NftMarketService.putSignedDelisting(signedPsbt, walletType);
}

/**
 * @swagger
 * /nft/market/createUnsignedBuying:
 *   post:
 *     summary: Create unsigned buying transaction
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *               - listingIds
 *               - fundAddress
 *               - fundPublicKey
 *               - assetAddress
 *               - feerate
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
 *               listingIds:
 *                 type: array
 *                 description: List of listing IDs to buy
 *                 items:
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
    const { collectionId, listingIds, fundAddress, fundPublicKey, assetAddress, feerate } = ctx.request.body;
    return await NftMarketService.createUnsignedBuying(collectionId, listingIds, fundAddress, fundPublicKey, assetAddress, feerate);
}

/**
 * @swagger
 * /nft/market/putSignedBuying:
 *   post:
 *     summary: Submit signed buying transaction
 *     tags: [NFT Market]
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
    return await NftMarketService.putSignedBuying(signedPsbt, walletType);
}

/**
 * @swagger
 * /nft/market/events:
 *   post:
 *     summary: Get NFT market events
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
 *               address:
 *                 type: string
 *                 description: Filter by address
 *               types:
 *                 type: array
 *                 description: Filter by event types
 *                 items:
 *                   type: string
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
    const { collectionId, address, types, page, size } = ctx.request.body;
    return await NftMarketService.getEventPage(collectionId, address, types, page, size);
}

/**
 * @swagger
 * /nft/market/collectionStats:
 *   post:
 *     summary: Get collection statistics
 *     tags: [NFT Market]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *               - type
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Collection ID
 *               type:
 *                 type: string
 *                 description: Statistics type
 *     responses:
 *       200:
 *         description: Collection statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
async function collectionStats(ctx) {
    const { collectionId, type } = ctx.request.body;
    return await NftCollectionStatsService.queryCollectionStats(collectionId, type);
}

export default [
    {
        path: Constants.API.NFT_MARKET.ASSETS,
        method: 'post',
        handler: assets
    },
    {
        path: Constants.API.NFT_MARKET.LISTING,
        method: 'post',
        handler: listingPage
    },
    {
        path: Constants.API.NFT_MARKET.CREATE_UNSIGNED_LISTING,
        method: 'post',
        handler: createUnsignedListing
    },
    {
        path: Constants.API.NFT_MARKET.PUT_SIGNED_LISTING,
        method: 'post',
        handler: putSignedListing
    },
    {
        path: Constants.API.NFT_MARKET.CREATE_UNSIGNED_UPDATE,
        method: 'post',
        handler: createUnsignedUpdate
    },
    {
        path: Constants.API.NFT_MARKET.PUT_SIGNED_UPDATE,
        method: 'post',
        handler: putSignedUpdate
    },
    {
        path: Constants.API.NFT_MARKET.CREATE_UNSIGNED_DELISTING,
        method: 'post',
        handler: createUnsignedDelisting
    },
    {
        path: Constants.API.NFT_MARKET.PUT_SIGNED_DELISTING,
        method: 'post',
        handler: putSignedDelisting
    },
    {
        path: Constants.API.NFT_MARKET.CREATE_UNSIGNED_BUYING,
        method: 'post',
        handler: createUnsignedBuying
    },
    {
        path: Constants.API.NFT_MARKET.PUT_SIGNED_BUYING,
        method: 'post',
        handler: putSignedBuying
    },
    {
        path: Constants.API.NFT_MARKET.EVENTS,
        method: 'post',
        handler: events
    },
    {
        path: Constants.API.NFT_MARKET.COLLECTION_STATS,
        method: 'post',
        handler: collectionStats
    }
]
























