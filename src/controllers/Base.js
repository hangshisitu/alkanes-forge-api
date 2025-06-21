import BaseService from '../service/BaseService.js';
import UnisatAPI from '../lib/UnisatAPI.js';
import R2Service from '../service/R2Service.js';
import BaseUtil from '../utils/BaseUtil.js';

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

/**
 * @swagger
 * /uploadImage:
 *   post:
 *     summary: Upload an image
 *     tags: [Base]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             optional:
 *               - prefix
 *             properties:
 *               image:
 *                 type: string
 *                 description: image base64 encode content
 *               prefix:
 *                 type: string
 *                 description: upload to r2 directory prefix, default is 'images'
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Image URL
 */
async function uploadImage(ctx) {
    const params = ctx.request.body;
    const { image, prefix } = params;
    const buffer = Buffer.from(image.split(',')[1] ?? image, 'base64');
    const type = BaseUtil.detectImageType(buffer);
    if (type === 'unknown') {
        ctx.status = 400;
        ctx.body = { error: 'Unsupported image format' };
        return;
    }
    return await R2Service.uploadBuffer({ buffer, filename: `${Date.now()}${Math.floor(Math.random() * 10000)}.${type}`, prefix: prefix || 'images', type: `image/${type}` });
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
    {
        path: '/uploadImage',
        method: 'post',
        handler: uploadImage
    }
]