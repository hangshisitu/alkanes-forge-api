import config from "../conf/config.js";
import UnisatAPI from "./UnisatAPI.js";
import axios from "axios";
import asyncPool from 'tiny-async-pool';
import {encipher, encodeRunestoneProtostone, ProtoStone} from "alkanes";
import * as bitcoin from "bitcoinjs-lib";
import { createHash } from "crypto";
import BigNumber from "bignumber.js";
import { u128, u32 } from '@magiceden-oss/runestone-lib/dist/src/integer/index.js';
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid.js'
import AddressUtil from "./AddressUtil.js";
import * as RedisHelper from "../lib/RedisHelper.js";

// 0: Initialize(token_units, value_per_mint, cap, name, symbol)
// token_units : Initial pre-mine tokens to be received on deployer's address
// value_per_mint: Amount of tokens to be received on each successful mint
// cap: Max amount of times the token can be minted
// name: Token name
// symbol: Token symbol
// 77: MintTokens()
// 88: SetNameAndSymbol(name, symbol)
// 99: GetName() -> String
// 100: GetSymbol() -> String
// 101: GetTotalSupply() -> u128
// 102: GetCap() -> u128
// 103: GetMinted() -> u128
// 104: GetValuePerMint() -> u128
// 1000: GetData() -> Vec
const opcodes = ['99', '100', '101', '102', '103', '104', '1000']
const opcodesHRV = [
    'name',
    'symbol',
    'totalSupply',
    'cap',
    'minted',
    'mintAmount',
    'data',
]

export default class AlkanesAPI {

    static async getAlkanesByUtxo(utxo) {
        const alkaneList = await AlkanesAPI._call('alkanes_protorunesbyoutpoint', [
            {
                txid: Buffer.from(utxo.txid, 'hex').reverse().toString('hex'),
                vout: utxo.vout,
                protocolTag: '1',
            },
        ])

        return alkaneList.map((alkane) => ({
            id: `${parseInt(alkane.token.id.block, 16).toString()}:${parseInt(alkane.token.id.tx, 16).toString()}`,
            name: alkane.token.name,
            symbol: alkane.token.symbol,
            value: parseInt(alkane.value, 16).toString(), // 固定8位精度
        }))
    }

    static async getAlkanesByAddress(address, id) {
        try {
            const utxos = await UnisatAPI.getAllUtxo(address);

            if (!utxos || utxos.length === 0) {
                return [];
            }

            const alkaneList = [];
            for await (const result of asyncPool(config.concurrencyLimit, utxos, AlkanesAPI.getAlkanesByUtxo)) {
                if (result !== null && result.length > 0) {
                    alkaneList.push(...result);
                }
            }

            if (id) {
                return alkaneList.filter(alkanes => alkanes.id === id);
            }

            const result = alkaneList.reduce((acc, {id, name, symbol, value}) => {
                const key = id;
                if (!acc[key]) {
                    acc[key] = {id, name, symbol, value: '0'};
                }
                acc[key].value = (BigInt(acc[key].value) + BigInt(value)).toString();
                return acc;
            }, {});
            return Object.values(result);
        } catch (error) {
            console.error('Error in getAlkanesByAddress:', error);
            throw error;
        }
    }

    static async getAlkanesByTarget(address, id, amount) {
        try {
            const utxoList = await UnisatAPI.getAllUtxo(address);

            if (!utxoList || utxoList.length === 0) {
                throw new Error('Insufficient alkanes balance');
            }

            const alkaneList = [];
            let totalBalance = new BigNumber(0);
            for (const utxo of utxoList) {
                const alkanes = await AlkanesAPI.getAlkanesByUtxo(utxo);
                for (const alkane of alkanes) {
                    if (alkane.id !== id) {
                        continue;
                    }
                    alkane.utxo = utxo;
                    alkaneList.push(alkane);
                    totalBalance = totalBalance.plus(new BigNumber(alkane.value).toNumber());
                }

                if (totalBalance.gte(amount)) {
                    break;
                }
            }

            if (totalBalance.lt(amount)) {
                throw new Error(`Insufficient alkanes balance: ${totalBalance.dividedBy(1e8).toString(8)} target: ${amount.dividedBy(1e8).toString(8)}`);
            }
            return alkaneList;
        } catch (error) {
            console.error('getAlkanesByTarget error:', error);
            throw new Error('Get alkanes balance error');
        }
    }

    static async getAlkanesByIndex(block, index) {
        const alkaneData = {
            id: `${block}:${index}`
        };

        let hasValidResult = false;
        try {
            const opcodeResults = await Promise.all(
                opcodes.map(async (opcode, opcodeIndex) => {
                    try {
                        const result = await AlkanesAPI.simulate({
                            target: {block: block.toString(), tx: index.toString()},
                            inputs: [opcode],
                        });

                        if (result) {
                            return {
                                opcode,
                                result,
                                opcodeIndex,
                                opcodeHRV: opcodesHRV[opcodeIndex],
                            };
                        }
                    } catch (error) {
                        // ignore
                    }
                    return null;
                })
            );

            const validResults = opcodeResults.filter((item) => {
                return (
                    item !== null &&
                    item !== undefined &&
                    item.opcodeHRV !== undefined
                );
            });

            validResults.forEach(({result, opcodeHRV}) => {
                if (!opcodeHRV) return;

                if (['name', 'symbol', 'data'].includes(opcodeHRV)) {
                    alkaneData[opcodeHRV] = result.string || '';
                } else {
                    alkaneData[opcodeHRV] = Number(result.le || 0);
                }
                hasValidResult = true;
            });

            if (hasValidResult) {
                alkaneData.mintActive = Number(alkaneData.minted || 0) < Number(alkaneData.cap || 0);
                alkaneData.percentageMinted = Math.floor((alkaneData.minted || 0) / (alkaneData.cap || 1) * 100);

                if (alkaneData.name === 'DIESEL') {
                    alkaneData.mintActive = true;
                    alkaneData.mintAmount = 3.125 * 1e8;
                    alkaneData.cap = 6050000;
                    alkaneData.minted = Math.ceil(alkaneData.totalSupply / alkaneData.mintAmount);
                }
                return alkaneData;
            }
        } catch (error) {
            console.log(`Error processing alkane at index ${index}:`, error);
        }
        return null;
    }

    static async getAllAlkanes(block, maxIndex = 1000) {
        // 构造缓存键
        const cacheKey = `alkanes:${block}`;

        // 先尝试从缓存获取
        const cachedData = await RedisHelper.get(cacheKey);
        if (cachedData) {
            return JSON.parse(cachedData);
        }

        const alkanesList = [];
        for (let i = 0; i < maxIndex; i++) {
            const alkanes = await AlkanesAPI.getAlkanesByIndex(2, i);
            if (!alkanes) {
                break;
            }

            if (alkanes.name && alkanes.symbol) {
                alkanesList.push(alkanes);
            }
        }

        // 存入缓存
        await RedisHelper.setEx(cacheKey, 30 * 60, JSON.stringify(alkanesList));

        return alkanesList;
    }

    static async transferMintFee(segwitAddress, taprootAddress, id, mints, feerate) {
        const protostone = AlkanesAPI.getMintProtostone(id);

        const outputList = [];
        outputList.push({
            address: taprootAddress,
            value: 330
        });
        outputList.push({
            script: protostone,
            value: 0
        });
        const mintFee = Math.ceil(UnisatAPI.estTxSize([{address: segwitAddress}], outputList) * feerate) + 330;

        const privateKey = AlkanesAPI.generatePrivateKeyFromString(`${segwitAddress}-${id}-${mints}`);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);
        const fundOutputList = [];
        for (let i = 0; i < mints; i++) {
            fundOutputList.push({
                address: mintAddress,
                value: mintFee
            });
        }
        // 手续费
        fundOutputList.push({
            address: config.platformAddress,
            value: 300 * mints
        });
        const transferFee = Math.ceil(UnisatAPI.estTxSize([{address: segwitAddress}], [...fundOutputList, {address: segwitAddress}]) * feerate);

        const totalFee = mints * mintFee + transferFee;
        const utxoList = await UnisatAPI.getUtxoByTarget(segwitAddress, totalFee);

        return UnisatAPI.createUnSignPsbt(utxoList, fundOutputList, segwitAddress, feerate, bitcoin.networks.bitcoin);
    }

    static async startMint(segwitAddress, taprootAddress, id, mints, feerate, txid) {
        const protostone = AlkanesAPI.getMintProtostone(id);

        const outputList = [];
        outputList.push({
            address: taprootAddress,
            value: 330
        });
        outputList.push({
            script: protostone,
            value: 0
        });
        const mintFee = Math.ceil(UnisatAPI.estTxSize([{address: segwitAddress}], outputList) * feerate) + 330;

        const txidList = [];
        const privateKey = AlkanesAPI.generatePrivateKeyFromString(`${segwitAddress}-${id}-${mints}`);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);
        for (let i = 0; i < mints; i++) {
            const inputList = [{
                txid: txid,
                vout: i,
                value: mintFee,
                address: mintAddress
            }];
            const ret = await UnisatAPI.transfer(privateKey, inputList, outputList, mintAddress, feerate, bitcoin.networks.bitcoin, false, false);
            console.log(`mint index ${i} tx: ${ret.data}`);
            txidList.push(ret.data);
        }
        return txidList;
    }

    static async deployToken(segwitAddress, taprootAddress, name, symbol, cap, perMint, premine, feerate) {
        const calldata = [
            BigInt(6),
            BigInt(797), // free_mint.wasm contract
            BigInt(0),
            BigInt(premine || 0),
            BigInt(new BigNumber(perMint).multipliedBy(1e8).toString()),
            BigInt(cap),
            BigInt(
                '0x' +
                Buffer.from(name.split('').reverse().join('')).toString(
                    'hex'
                )
            ),
            BigInt(0),
            BigInt(
                '0x' +
                Buffer.from(
                    symbol.split('').reverse().join('')
                ).toString('hex')
            ),
        ]

        const protostone = encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: encipher(calldata),
                }),
            ],
        }).encodedRunestone;

        const outputList = [];
        outputList.push({
            address: taprootAddress,
            value: 330
        });
        outputList.push({
            script: protostone,
            value: 0
        });
        outputList.push({
            address: config.platformAddress,
            value: 3000
        });

        const txSize = UnisatAPI.estTxSize([{address: segwitAddress}], [...outputList, {address: taprootAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const inputList = await UnisatAPI.getUtxoByTarget(segwitAddress, txFee);

        return UnisatAPI.createUnSignPsbt(inputList, outputList, segwitAddress, feerate, bitcoin.networks.bitcoin);
    }

    static async transferToken(segwitAddress, taprootAddress, toAddress, id, amount, feerate, alkanesList) {
        if (alkanesList === null || alkanesList.length === 0) {
            alkanesList = await AlkanesAPI.getAlkanesByTarget(taprootAddress, id, amount);
        }

        const protostone = encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [
                        {
                            id: new ProtoruneRuneId(
                                u128(BigInt(id.split(':')[0])),
                                u128(BigInt(id.split(':')[1]))
                            ),
                            amount: u128(BigInt(amount)),
                            output: u32(BigInt(1)),
                        },
                    ],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: Buffer.from([]),
                }),
            ],
        }).encodedRunestone;

        const outputList = [];
        outputList.push({
            address: taprootAddress,
            value: 330
        });
        outputList.push({
            address: toAddress,
            value: 330
        });
        outputList.push({
            script: protostone,
            value: 0
        });
        outputList.push({
            address: config.platformAddress,
            value: 3000
        });

        const txSize = UnisatAPI.estTxSize([{address: segwitAddress}], [...outputList, {address: taprootAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(segwitAddress, txFee);

        const inputList = [];
        for (const alkanes of alkanesList) {
            inputList.push(alkanes.utxo);
        }
        inputList.push(...utxoList);

        return UnisatAPI.createUnSignPsbt(inputList, outputList, segwitAddress, feerate, bitcoin.networks.bitcoin, true);
    }

    static async simulate(request, decoder) {
        const params = {
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: '20000',
            txindex: 0,
            inputs: [],
            pointer: 0,
            refundPointer: 0,
            vout: 0,
            ...request,
        };
        const ret = await this._call('alkanes_simulate', [params]);
        const data = ret?.status === 0 ? ret.execution.data : null;
        if (decoder) {
            const operationType = Number(request.inputs[0])
            return decoder(ret, operationType)
        }
        return AlkanesAPI.parseSimulateReturn(data);
    }

    static async _call(method, params = []) {
        const payload = {
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: 1
        };

        try {
            const response = await axios.post(config.alkanesUrl, payload, {
                headers: {
                    'content-type': 'application/json',
                }
            });

            if (response.error) throw new Error(response.error.message)
            return response.data.result
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Request Timeout:', error)
                throw new Error('Request timed out')
            } else {
                console.error('Request Error:', error)
                throw error
            }
        }
    }

    static parseSimulateReturn(v) {
        if (v === '0x') {
            return undefined
        }
        const stripHexPrefix = (v) => (v.startsWith('0x') ? v.slice(2) : v)
        const addHexPrefix = (v) => '0x' + stripHexPrefix(v)

        let decodedString;
        try {
            decodedString = Buffer.from(stripHexPrefix(v), 'hex').toString('utf8')
            if (/[\uFFFD]/.test(decodedString)) {
                throw new Error('Invalid UTF-8 string')
            }
        } catch (err) {
            decodedString = addHexPrefix(v)
        }

        return {
            string: decodedString,
            bytes: addHexPrefix(v),
            le: BigInt(
                addHexPrefix(
                    Buffer.from(
                        Array.from(Buffer.from(stripHexPrefix(v), 'hex')).reverse()
                    ).toString('hex')
                )
            ).toString(),
            be: BigInt(addHexPrefix(v)).toString(),
        }
    }

    static getMintProtostone(id) {
        const calldata = [BigInt(id.split(':')[0]), BigInt(id.split(':')[1]), BigInt(77)];
        return encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    pointer: 0,
                    refundPointer: 0,
                    calldata: encipher(calldata),
                }),
            ],
        }).encodedRunestone;
    }

    static generatePrivateKeyFromString(inputString) {
        const hash = createHash("sha256").update(inputString).digest("hex");
        const privateKey = Buffer.from(hash, "hex");
        return privateKey.toString("hex");
    }

}

