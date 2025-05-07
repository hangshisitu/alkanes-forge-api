import { Constants } from '../conf/constants.js';
import config from '../conf/config.js';

/**
 * @swagger
 * /methane/community/check:
 *   post:
 *     summary: Check community membership status
 *     tags: [Methane]
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
 *                 description: Wallet address to check
 *     responses:
 *       200:
 *         description: Community membership status
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               description: Community role if member, empty string if not a member
 */
async function communityCheck(ctx) {
    const { address } = ctx.request.body;
    return config.methaneCommittee[address] || ''
}

export default [
    {
        path: Constants.API.METHANE.COMMUNITY_CHECK,
        method: 'post',
        handler: communityCheck
    }
]
