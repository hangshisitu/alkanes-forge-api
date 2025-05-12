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
        const blockData = await this.getBlockDetails(blockHash);
        
        return blockData.tx;
    }

    async getBlockDetails(blockHash) {
        return await this.call('getblock', [blockHash, 2]);
    }

    writeBigUInt64LE(buf, value, offset = 0) {
        // 如果Buffer原生支持writeBigUInt64LE且值是BigInt
        if (typeof buf.writeBigUInt64LE === 'function' && typeof BigInt === 'function') {
            const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);
            buf.writeBigUInt64LE(bigIntValue, offset);
            return;
        }
    
        // 手动实现64位整数写入
        const lo = Number(value & 0xffffffffn || value & 0xffffffff);
        const hi = Number(value >> 32n || value / 0x100000000);
    
        // 写入低32位
        buf.writeUInt32LE(lo, offset);
        // 写入高32位
        buf.writeUInt32LE(hi, offset + 4);
    }

    encodeVarInt(number) {
        if (number < 0xfd) {
            return Buffer.from([number]);
        } else if (number <= 0xffff) {
            const buf = Buffer.alloc(3);
            buf[0] = 0xfd;
            buf.writeUInt16LE(number, 1);
            return buf;
        } else if (number <= 0xffffffff) {
            const buf = Buffer.alloc(5);
            buf[0] = 0xfe;
            buf.writeUInt32LE(number, 1);
            return buf;
        } else {
            const buf = Buffer.alloc(9);
            buf[0] = 0xff;
            this.writeBigUInt64LE(buf, number, 1);
            return buf;
        }
    }

    /**
     * Get transaction hex from transaction json
     * @param {Object} txJson - The transaction json
     * @returns {string} - The transaction hex
     */
    getTransactionFromJson(txJson) {
        try {
            // 创建一个空的缓冲区数组
            const buffers = [];

            // 版本号 (4字节，小端序)
            const versionBuf = Buffer.alloc(4);
            versionBuf.writeUInt32LE(txJson.version, 0);
            buffers.push(versionBuf);

            // 检查是否是隔离见证交易
            const hasWitness = txJson.vin.some(input => input.txinwitness && input.txinwitness.length > 0);

            if (hasWitness) {
                // 添加隔离见证标记和标志
                buffers.push(Buffer.from([0x00, 0x01]));
            }

            // 输入数量 (可变长度整数)
            buffers.push(this.encodeVarInt(txJson.vin.length));

            // 添加所有输入
            for (const input of txJson.vin) {
                // txid (32字节，反转为小端序)
                const txid = Buffer.from(input.txid, 'hex').reverse();
                buffers.push(txid);

                // 输出索引 (4字节，小端序)
                const voutBuf = Buffer.alloc(4);
                voutBuf.writeUInt32LE(input.vout, 0);
                buffers.push(voutBuf);

                // 脚本长度和脚本
                const scriptSig = Buffer.from(input.scriptSig ? input.scriptSig.hex : '', 'hex');
                buffers.push(this.encodeVarInt(scriptSig.length));
                if (scriptSig.length > 0) {
                    buffers.push(scriptSig);
                }

                // 序列号 (4字节，小端序)
                const sequenceBuf = Buffer.alloc(4);
                sequenceBuf.writeUInt32LE(input.sequence, 0);
                buffers.push(sequenceBuf);
            }

            // 输出数量 (可变长度整数)
            buffers.push(this.encodeVarInt(txJson.vout.length));

            // 添加所有输出
            for (const output of txJson.vout) {
                // 金额 (8字节，小端序) - 注意RPC中value是BTC单位，需要转换为聪
                const valueSats = Math.round(output.value * 100000000);
                const valueBuf = Buffer.alloc(8);

                // 处理大数值
                if (valueSats <= Number.MAX_SAFE_INTEGER) {
                    this.writeBigUInt64LE(valueBuf, valueSats);
                } else {
                    valueBuf.writeBigUInt64LE(BigInt(valueSats), 0);
                }
                buffers.push(valueBuf);

                // 脚本长度和脚本
                const scriptPubKey = Buffer.from(output.scriptPubKey.hex, 'hex');
                buffers.push(this.encodeVarInt(scriptPubKey.length));
                buffers.push(scriptPubKey);
            }

            // 如果是隔离见证交易，添加见证数据
            if (hasWitness) {
                for (const input of txJson.vin) {
                    if (input.txinwitness && input.txinwitness.length > 0) {
                        // 见证项数量
                        buffers.push(this.encodeVarInt(input.txinwitness.length));

                        // 添加所有见证项
                        for (const witnessItem of input.txinwitness) {
                            const witnessData = Buffer.from(witnessItem, 'hex');
                            buffers.push(this.encodeVarInt(witnessData.length));
                            buffers.push(witnessData);
                        }
                    } else {
                        // 如果输入没有见证数据，添加0
                        buffers.push(Buffer.from([0x00]));
                    }
                }
            }

            // 锁定时间 (4字节，小端序)
            const lockTimeBuf = Buffer.alloc(4);
            lockTimeBuf.writeUInt32LE(txJson.locktime, 0);
            buffers.push(lockTimeBuf);

            // 合并所有缓冲区并转换为十六进制
            return Buffer.concat(buffers).toString('hex');
        } catch (error) {
            console.error('序列化交易出错:', error);
            throw new Error(`无法将交易序列化为十六进制: ${error.message}`);
            
        }
    }
}

export default new BtcRPC(); 