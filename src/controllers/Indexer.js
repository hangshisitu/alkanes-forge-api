import IndexerService from '../service/IndexerService.js';
import { Constants } from '../conf/constants.js';

/**
 * @swagger
 * /indexer/push:
 *   post:
 *     summary: Push data to indexer
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Data to be indexed
 *     responses:
 *       200:
 *         description: Data indexed successfully
 */
async function push(ctx) {
    await IndexerService.index(ctx.request.body);
    return '';
}

/**
 * @swagger
 * /indexer/holderPage:
 *   post:
 *     summary: Get paginated list of token holders
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alkanesId
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
 *         description: List of token holders
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
    const { alkanesId, page, size } = ctx.request.body;
    const result = await IndexerService.getHolderPage(alkanesId, page, size);
    return result;
}

/**
 * @swagger
 * /indexer/addressAlkanesOutpoints:
 *   post:
 *     summary: Get Alkanes outpoints for an address
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - alkanesId
 *             properties:
 *               address:
 *                 type: string
 *                 description: Wallet address
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               multiple:
 *                 type: boolean
 *                 description: Whether to include multiple assets
 *               spent:
 *                 type: boolean
 *                 description: Whether to include spent outpoints
 *               page:
 *                 type: integer
 *                 description: Page number
 *               pageSize:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: List of Alkanes outpoints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 outpoints:
 *                   type: array
 *                   items:
 *                     type: object
 *                 hasMore:
 *                   type: boolean
 */
async function addressAlkanesOutpoints(ctx) {
    const { address, alkanesId, multiple, spent, page, size } = ctx.request.body;
    const result = await IndexerService.getAddressAlkanesOutpoints(address, alkanesId, multiple, spent, page, size);
    return result;
}

/**
 * @swagger
 * /indexer/outpointRecords:
 *   post:
 *     summary: Get paginated outpoint records for an address
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - alkanesId
 *               - page
 *               - pageSize
 *             properties:
 *               address:
 *                 type: string
 *                 description: Wallet address
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *               spent:
 *                 type: boolean
 *                 description: Whether to include spent outpoints
 *               page:
 *                 type: integer
 *                 description: Page number
 *               pageSize:
 *                 type: integer
 *                 description: Number of items per page
 *     responses:
 *       200:
 *         description: List of outpoint records
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
async function outpointRecords(ctx) {
    const { address, alkanesId, spent, page, pageSize } = ctx.request.body;
    const result = await IndexerService.getOutpointRecords(address, alkanesId, spent, page, pageSize);
    return result;
}

/**
 * @swagger
 * /indexer/marketTx:
 *   post:
 *     summary: Get market transactions for a given txid
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txid
 *             properties:
 *               txid:
 *                 type: string
 *                 description: Transaction ID
 *     responses:
 *       200:
 *         description: List of market transactions
 */
async function marketTx(ctx) {
    const { txid } = ctx.request.body;
    return await IndexerService.getMarketTx(txid);
}

/**
 * @swagger
 * /indexer/marketTxs:
 *   post:
 *     summary: Get market transactions for a given block
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - block
 *             properties:
 *               block:
 *                 type: integer
 *                 description: Block number
 *     responses:
 *       200:
 *         description: List of market transactions
 */
async function marketTxs(ctx) {
    const { block } = ctx.request.body;
    return await IndexerService.getMarketTxs(block);
}

/**
 * @swagger
 * /indexer/outpoint:
 *   post:
 *     summary: Get outpoint for a given txid and vout
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txid
 *               - vout
 *             properties:
 *               txid:
 *                 type: string
 *                 description: Transaction ID
 *               vout:
 *                 type: integer
 *                 description: Output index
 *     responses:
 *       200:
 *         description: Outpoint
 */
async function outpoint(ctx) {
    const { txid, vout } = ctx.request.body;
    return await IndexerService.getOutpoint(txid, vout);
}

/**
 * @swagger
 * /indexer/outpoints:
 *   post:
 *     summary: Get outpoints for a given txid, block and alkanesId, (block, txid at least one is required)
 *     tags: [Indexer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - block
 *               - txid
 *             optional:
 *               - alkanesId
 *             properties:
 *               block:
 *                 type: integer
 *                 description: Block number
 *               txid:
 *                 type: string
 *                 description: Transaction ID
 *               alkanesId:
 *                 type: string
 *                 description: Alkanes token ID
 *     responses:
 *       200:
 *         description: List of outpoints
 */
async function outpoints(ctx) {
    const { block, txid, alkanesId } = ctx.request.body;
    return await IndexerService.getOutpoints(block, txid, alkanesId);
}

async function alkanesImage(ctx) {
    const { alkanesId, block } = ctx.request.query;
    const image = await IndexerService.getAlkanesData(alkanesId, block);
    if (image) {
        return image;
    } else {
        ctx.status = 404;
    }
}

export default [
    {
        path: Constants.API.INDEXER.PUSH,
        method: 'post',
        handler: push
    },
    {
        path: Constants.API.INDEXER.HOLDER_PAGE,
        method: 'post',
        handler: holderPage
    },
    {
        path: Constants.API.INDEXER.ADDRESS_ALKANES_OUTPOINTS,
        method: 'post',
        handler: addressAlkanesOutpoints
    },
    {
        path: Constants.API.INDEXER.OUTPOINT_RECORDS,
        method: 'post',
        handler: outpointRecords
    },
    {
        path: Constants.API.INDEXER.MARKET_TX,
        method: 'post',
        handler: marketTx
    },
    {
        path: Constants.API.INDEXER.OUTPOINT,
        method: 'post',
        handler: outpoint
    },
    {
        path: Constants.API.INDEXER.OUTPOINTS,
        method: 'post',
        handler: outpoints
    },
    {
        path: Constants.API.INDEXER.MARKET_TXS,
        method: 'post',
        handler: marketTxs
    },
    {
        path: Constants.API.INDEXER.ALKANES_IMAGE,
        method: 'get',
        handler: alkanesImage
    }
]



