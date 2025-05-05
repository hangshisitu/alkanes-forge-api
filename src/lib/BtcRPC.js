import config from '../conf/config.js';
import axios from 'axios';
import { Block, Transaction } from 'bitcoinjs-lib';
import * as logger from '../conf/logger.js';

class BtcRPC {
    constructor() {
        this.host = config.btc.host;
        this.username = config.btc.username;
        this.password = config.btc.password;
    }

    async call(method, params = []) {
        try {
            const response = await axios.post(this.host, {
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            }, {
                auth: {
                    username: this.username,
                    password: this.password
                }
            });

            if (response.data.error) {
                throw new Error(`RPC Error: ${response.data.error.message}`);
            }

            return response.data.result;
        } catch (error) {
            logger.error(`BTC RPC call failed: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Get block hex by block hash
     * @param {string} blockHash - The hash of the block to retrieve
     * @returns {Promise<string>} - The block hex string
     */
    async getBlockHex(blockHash) {
        return this.call('getblock', [blockHash, 0]);
    }

    /**
     * Convert block hex to block object
     * @param {string} blockHex - The hex string of the block
     * @returns {Block} - The block object
     */
    hexToBlock(blockHex) {
        const buffer = Buffer.from(blockHex, 'hex');
        return Block.fromBuffer(buffer);
    }

    /**
     * Get block object by block hash
     * @param {string} blockHash - The hash of the block to retrieve
     * @returns {Promise<Block>} - The block object
     */
    async getBlock(blockHash) {
        const blockHex = await this.getBlockHex(blockHash);
        return this.hexToBlock(blockHex);
    }

    /**
     * Get detailed transaction information from a block
     * @param {string} blockHash - The hash of the block to retrieve
     * @returns {Promise<Object>} - Detailed transaction information
     */
    async getBlockTransactions(blockHash) {
        // Get block with full transaction data
        const blockData = await this.call('getblock', [blockHash, 2]);
        
        return blockData.tx;
    }
}

export default new BtcRPC(); 