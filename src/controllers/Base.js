import BaseService from '../service/BaseService.js';
import UnisatAPI from '../lib/UnisatAPI.js';

/**
 * @swagger
 * /config:
 *   post:
 *     summary: Get system configuration
 *     tags: [Base]
 *     responses:
 *       200:
 *         description: System configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
async function config(ctx) {
    return await BaseService.getConfig();
}

/**
 * @swagger
 * /broadcast:
 *   post:
 *     summary: Broadcast a transaction
 *     tags: [Base]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - psbt
 *             properties:
 *               psbt:
 *                 type: string
 *                 description: Partially signed Bitcoin transaction
 *     responses:
 *       200:
 *         description: Transaction broadcast result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   description: Status code (0 for success, 1 for error)
 *                 msg:
 *                   type: string
 *                   description: Error message if any
 *                 data:
 *                   type: string
 *                   description: Transaction ID if successful
 */
async function broadcast(ctx) {
    const params = ctx.request.body;
    const { txid, error } = await UnisatAPI.unisatPush(params.psbt);
    return (body) => {
        if (error) {
            body.code = 1;
            body.msg = error;
        } else {
            body.data = txid;
        }
    }
}

export default [
    {
        path: '/config',
        method: 'post',
        handler: config
    },
    {
        path: '/broadcast',
        method: 'post',
        handler: broadcast
    },
]