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
 * /indexer/outpoints:
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
 *               limit:
 *                 type: integer
 *                 description: Maximum number of outpoints to return
 *               spent:
 *                 type: boolean
 *                 description: Whether to include spent outpoints
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
    const { address, alkanesId, limit, spent } = ctx.request.body;
    const result = await IndexerService.getAddressAlkanesOutpoints(address, alkanesId, limit, spent);
    return result;
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
    }
]




