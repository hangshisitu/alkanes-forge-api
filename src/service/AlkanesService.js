import config from "../conf/config.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import axios from "axios";
import asyncPool from 'tiny-async-pool';
import {encipher, encodeRunestoneProtostone, ProtoStone} from "alkanes";
import * as bitcoin from "bitcoinjs-lib";
import {createHash} from "crypto";
import BigNumber from "bignumber.js";
import {u128, u32} from '@magiceden-oss/runestone-lib/dist/src/integer/index.js';
import {ProtoruneRuneId} from 'alkanes/lib/protorune/protoruneruneid.js'
import AddressUtil from "../lib/AddressUtil.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import FeeUtil from "../utils/FeeUtil.js";

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
const opcodes = ['99', '100', '101', '102', '103', '104']
const opcodesHRV = [
    'name',
    'symbol',
    'totalSupply',
    'cap',
    'minted',
    'mintAmount'
]

export default class AlkanesService {

    static async getAlkanesByUtxo(utxo) {
        if (utxo.height < 880000) {
            return [];
        }
        try {
            const alkaneList = await AlkanesService._call('alkanes_protorunesbyoutpoint', [
                {
                    txid: Buffer.from(utxo.txid, 'hex').reverse().toString('hex'),
                    vout: utxo.vout,
                    protocolTag: '1',
                },
            ], config.alkanesPublicUrl)

            return alkaneList.map((alkane) => ({
                id: `${parseInt(alkane.token.id.block, 16).toString()}:${parseInt(alkane.token.id.tx, 16).toString()}`,
                name: alkane.token.name,
                symbol: alkane.token.symbol,
                value: new BigNumber(alkane.value).toNumber(), // 固定8位精度
            }))
        } catch (err) {
            console.log(`getAlkanesByUtxo error, utxo: ${JSON.stringify(utxo)}`, err);
            throw new Error('Get Alkane Balance Error');
        }
    }

    static async getAlkanesByAddress(address, id) {
        try {
            const utxos = await UnisatAPI.getAllUtxo(address);

            if (!utxos || utxos.length === 0) {
                return [];
            }

            const alkaneList = [];
            for await (const result of asyncPool(config.concurrencyLimit, utxos, AlkanesService.getAlkanesByUtxo)) {
                if (result !== null && result.length > 0) {
                    alkaneList.push(...result);
                }
            }

            const filteredList = id ? alkaneList.filter(alkane => alkane.id === id) : alkaneList;
            const result = filteredList.reduce((acc, {id, name, symbol, value}) => {
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
            const utxoList = await UnisatAPI.getAllUtxo(address, true);

            if (!utxoList || utxoList.length === 0) {
                throw new Error('Insufficient alkanes balance');
            }

            const alkaneList = [];
            let totalBalance = new BigNumber(0);
            for (const utxo of utxoList) {
                const alkanes = await AlkanesService.getAlkanesByUtxo(utxo);
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

    static async getAlkanesById(id) {
        const tokenInfo = {
            id: id
        };

        let hasValidResult = false;
        try {
            const opcodeResults = await Promise.all(
                opcodes.map(async (opcode, opcodeIndex) => {
                    try {
                        const result = await AlkanesService.simulate({
                            target: {block: id.split(':')[0], tx: id.split(':')[1]},
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

                if (['name', 'symbol'].includes(opcodeHRV)) {
                    tokenInfo[opcodeHRV] = result.string || '';
                } else {
                    tokenInfo[opcodeHRV] = Number(result.le || 0);
                }
                hasValidResult = true;
            });

            if (hasValidResult) {
                if (tokenInfo.name === 'DIESEL') {
                    tokenInfo.mintAmount = 3.125 * 1e8;
                    tokenInfo.cap = 500000;
                    tokenInfo.minted = Math.ceil(tokenInfo.totalSupply / tokenInfo.mintAmount);
                    tokenInfo.premine = 440000 * 1e8;
                } else {
                    tokenInfo.premine = tokenInfo.totalSupply - tokenInfo.minted * tokenInfo.mintAmount;
                }

                tokenInfo.mintActive = Number(tokenInfo.minted || 0) < Number(tokenInfo.cap || 0) ? 1 : 0;
                tokenInfo.progress = (Math.ceil((tokenInfo.minted || 0) / (tokenInfo.cap || 1) * 10000) / 100).toFixed(2);
                return tokenInfo;
            }
        } catch (error) {
            console.log(`Error processing alkane at index ${index}:`, error);
        }
        return null;
    }

    static async getAllAlkanes() {
        const cachedData = await RedisHelper.get('alkanesList');
        if (cachedData) {
            const updateHeight = await RedisHelper.get(`token-update-height`);
            const alkanesList = JSON.parse(cachedData);
            if (alkanesList && alkanesList.length > 0) {
                return {
                    alkanesList,
                    updateHeight
                };
            }
        }
        return [];
    }

    static async transferMintFee(fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate) {
        const protostone = AlkanesService.getMintProtostone(id);

        const outputList = [];
        outputList.push({
            address: toAddress,
            value: postage
        });
        outputList.push({
            script: protostone,
            value: 0
        });

        const privateKey = AlkanesService.generatePrivateKeyFromString(`${fundAddress}-${toAddress}-${id}-${mints}`);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);
        const mintSize = FeeUtil.estTxSize([{address: mintAddress}], outputList);
        const mintFee = Math.ceil(mintSize * feerate) + postage;

        const fundOutputList = [];
        for (let i = 0; i < mints; i++) {
            fundOutputList.push({
                address: mintAddress,
                value: mintFee
            });
        }
        // 手续费
        const serviceFee = Math.max(Math.min(300 * mints, 5000), 1000);
        fundOutputList.push({
            address: config.platformAddress,
            value: serviceFee
        });
        let transferFee = Math.ceil(FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]) * feerate);

        const totalFee = mints * mintFee + transferFee + serviceFee;
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, totalFee, feerate, true);
        utxoList.map(utxo =>  utxo.pubkey = fundPublicKey);

        return PsbtUtil.createUnSignPsbt(utxoList, fundOutputList, fundAddress, feerate, bitcoin.networks.bitcoin);
    }

    static async startMint(fundAddress, toAddress, id, mints, postage, feerate, psbt) {
        const ret = await UnisatAPI.unisatPush(psbt);
        const txid = ret.data;

        const protostone = AlkanesService.getMintProtostone(id);

        const outputList = [];
        outputList.push({
            address: toAddress,
            value: postage
        });
        outputList.push({
            script: protostone,
            value: 0
        });

        const txidList = [];
        const privateKey = AlkanesService.generatePrivateKeyFromString(`${fundAddress}-${toAddress}-${id}-${mints}`);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);
        const mintFee = Math.ceil(FeeUtil.estTxSize([{address: mintAddress}], outputList) * feerate) + postage;

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

    static async deployToken(fundAddress, fundPublicKey, toAddress, name, symbol, cap, perMint, premine, feerate) {
        const calldata = [
            BigInt(6),
            BigInt(797), // free_mint.wasm contract
            BigInt(0),
            BigInt(new BigNumber(premine).multipliedBy(1e8).toFixed()),
            BigInt(new BigNumber(perMint).multipliedBy(1e8).toFixed()),
            BigInt(cap),
            BigInt(
                '0x' +
                Buffer.from(name.split('').reverse().join('')).toString('hex')
                // Buffer.from(Array.from(Buffer.from(name, 'utf8')).reverse()).toString('hex')
            ),
            BigInt(0),
        ]
        if (symbol) {
            calldata.push(BigInt(
                '0x' +
                Buffer.from(symbol.split('').reverse().join('')).toString('hex')
                // Buffer.from(Array.from(Buffer.from(symbol, 'utf8')).reverse()).toString('hex')
            ))
        }

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

        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + 3000, feerate);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        return PsbtUtil.createUnSignPsbt(utxoList, outputList, fundAddress, feerate, bitcoin.networks.bitcoin);
    }

    static async transferToken(fundAddress, fundPublicKey, assetAddress, toAddress, id, amount, feerate, alkanesList) {
        if (!alkanesList || alkanesList.length === 0) {
            alkanesList = await AlkanesService.getAlkanesByTarget(assetAddress, id, amount);
        }

        const outputList = [];
        outputList.push({
            address: toAddress,
            value: 330
        });

        const totalInputAmount = alkanesList.reduce((accumulator, currentValue) => accumulator + currentValue.value, 0);
        const changeAmount = totalInputAmount - amount;
        const transferList = [{amount: amount, output: 0}];
        if (changeAmount > 0) {
            transferList.push({amount: changeAmount, output: 1});
            outputList.push({
                address: assetAddress,
                value: 330
            });
        }
        const protostone = AlkanesService.getTransferProtostone(id, transferList);
        outputList.push({
            script: protostone,
            value: 0
        });

        outputList.push({
            address: config.platformAddress,
            value: 3000
        });

        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + 3000, feerate);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        const inputList = [];
        for (const alkanes of alkanesList) {
            inputList.push(alkanes.utxo);
        }
        inputList.push(...utxoList);

        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate, bitcoin.networks.bitcoin);
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
        const ret = await this._call('alkanes_simulate', [params], config.alkanesUrl);
        const data = ret?.status === 0 ? ret.execution.data : null;
        if (decoder) {
            const operationType = Number(request.inputs[0])
            return decoder(ret, operationType)
        }
        return AlkanesService.parseSimulateReturn(data);
    }

    static async metashrewHeight(alkanesUrl = config.alkanesPublicUrl) {
        for (let i = 0; i < 3; i++) {
            try {
                let blockHeight = await AlkanesService._call('metashrew_height', [], alkanesUrl);
                if (blockHeight) {
                    return parseInt(blockHeight) - 1;
                }
            } catch (err) {
                console.log(`check metashrew_height error`, err.message);
            }
        }
        throw new Error('check metashrew_height error');
    }

    static async _call(method, params = [], rpcUrl) {
        const payload = {
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: 1
        };

        try {
            const response = await axios.post(rpcUrl, payload, {
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

    static getTransferProtostone(id, transferList) {
        const edicts = [];
        for (const transfer of transferList) {
            edicts.push({
                id: new ProtoruneRuneId(
                    u128(BigInt(id.split(':')[0])),
                    u128(BigInt(id.split(':')[1]))
                ),
                amount: u128(BigInt(transfer.amount)), // 如果是0或者大于输入数量，则得到输入的全部数量；如果小于
                output: u32(BigInt(transfer.output)), // 指向接收的output index
            });
        }

        return encodeRunestoneProtostone({
            protostones: [
                ProtoStone.message({
                    protocolTag: 1n,
                    edicts: edicts,
                    pointer: 0, // 如果存在剩余的代币数量，会转到这里指定的output index
                    refundPointer: 0,
                    calldata: Buffer.from([]),
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

