import NftCollectionService from '../service/NftCollectionService.js';
import NftItemService from '../service/NftItemService.js';
import { Constants } from '../conf/constants.js';
import MempoolService from '../service/MempoolService.js';

/**
 * @swagger
 * /nft/page:
 *   post:
 *     summary: Get paginated list of NFT collections with filters
 *     tags: [NFT]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Filter by collection name
 *               mintActive:
 *                 type: boolean
 *                 description: Filter by mint active status
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
 *         description: Paginated NFT collection list
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
    const { name, mintActive, orderType, page, size } = ctx.request.body;
    return await NftCollectionService.getCollectionPage(name, mintActive, orderType, page, size);
}

/**
 * @swagger
 * /nft/info:
 *   post:
 *     summary: Get detailed information about a specific NFT collection
 *     tags: [NFT]
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
 *         description: Collection information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 mempool:
 *                   type: object
 */
async function info(ctx) {
    const { id } = ctx.request.body;
    const collection = await NftCollectionService.getCollectionById(id);
    if (collection) {
        collection.mempool = await MempoolService.getMempoolData(id);
    }
    return collection;
}

/**
 * @swagger
 * /nft/item/page:
 *   post:
 *     summary: Get paginated list of NFT items with filters
 *     tags: [NFT]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: Filter by collection ID
 *               address:
 *                 type: string
 *                 description: Filter by owner address
 *               listing:
 *                 type: boolean
 *                 description: Filter by listing status
 *               utxo:
 *                 type: boolean
 *                 description: Filter if need utxo or not
 *               attributes:
 *                 type: array
 *                 description: Filter by attributes
 *                 items:
 *                   type: object
 *                   properties:
 *                     trait_type:
 *                       type: string
 *                     value:
 *                       type: string
 *               name:
 *                 type: string
 *                 description: Filter by item name
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: Paginated NFT item list
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
async function itemPage(ctx) {
    const { collectionId, address, listing, utxo, attributes, name, page, size } = ctx.request.body;
    return await NftItemService.getItemPage(collectionId, address, listing, utxo, attributes, name, page, size);
}

/**
 * @swagger
 * /nft/item/info:
 *   post:
 *     summary: Get detailed information about a specific NFT item
 *     tags: [NFT]
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
 *                 description: NFT item ID
 *     responses:
 *       200:
 *         description: NFT item information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 collectionId:
 *                   type: string
 *                 owner:
 *                   type: string
 */
async function itemInfo(ctx) {
    const { id } = ctx.request.body;
    return await NftItemService.getItemById(id);
}

/**
 * @swagger
 * /nft/item/transfer:
 *   post:
 *     summary: Transfer NFT assets
 *     tags: [NFT]
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
 *               - feerate
 *               - assetsList
 *             properties:
 *               fundAddress:
 *                 type: string
 *                 description: Fund address for the transfer
 *               fundPublicKey:
 *                 type: string
 *                 description: Public key for the fund address
 *               assetAddress:
 *                 type: string
 *                 description: Asset address for the transfer
 *               assetPublicKey:
 *                 type: string
 *                 description: Public key for the asset address
 *               feerate:
 *                 type: number
 *                 description: Fee rate for the transfer
 *               assetsList:
 *                 type: array
 *                 description: List of assets to transfer
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     txid:
 *                       type: string
 *                     vout:
 *                       type: number
 *                     value:
 *                       type: number
 *     responses:
 *       200:
 *         description: Transfer executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
async function transfer(ctx) {
    const { fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, assetsList } = ctx.request.body;
    return await NftItemService.transfer(fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, assetsList);
}

/**
 * @swagger
 * /nft/holderPage:
 *   post:
 *     summary: Get paginated list of NFT holders for a collection
 *     tags: [NFT]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionId
 *             properties:
 *               collectionId:
 *                 type: string
 *                 description: ID of the NFT collection
 *               page:
 *                 type: integer
 *                 description: Page number
 *               size:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: Paginated list of NFT holders
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
async function holderPage(ctx) {
    const { collectionId, page, size } = ctx.request.body;
    return await NftCollectionService.getHolderPage(collectionId, page, size);
}

export default [
    {
        path: Constants.API.NFT.PAGE,
        method: 'post',
        handler: page
    },
    {
        path: Constants.API.NFT.INFO,
        method: 'post',
        handler: info
    },
    {
        path: Constants.API.NFT.ITEM_PAGE,
        method: 'post',
        handler: itemPage
    },
    {
        path: Constants.API.NFT.ITEM_INFO,
        method: 'post',
        handler: itemInfo
    },
    {
        path: Constants.API.NFT.TRANSFER,
        method: 'post',
        handler: transfer
    },
    {
        path: Constants.API.NFT.HOLDER_PAGE,
        method: 'post',
        handler: holderPage
    }
]







