import BaseUtil from "../utils/BaseUtil.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import BigNumber from "bignumber.js";
import AlkanesService from "./AlkanesService.js";
import jwt from 'jsonwebtoken';
import {Constants} from "../conf/constants.js";
import * as bitcoin from "bitcoinjs-lib";
import config from "../conf/config.js";
import * as logger from '../conf/logger.js';
import IndexerService from "./IndexerService.js";
import TokenInfoService from "./TokenInfoService.js";
import NftItemService from "./NftItemService.js";
import NftCollectionService from "./NftCollectionService.js";

const SIGN_MESSAGE = 'idclub.io wants you to sign in with your Bitcoin account:\n' +
    '{address}\n' +
    '\n' +
    'Welcome to iDclub. Signing is the only way we can truly know that you are the owner of the wallet you are connecting. Signing is a safe, gas-less transaction that does not in any way give iDclub permission to perform any transactions with your wallet.\n' +
    '\n' +
    'Nonce: {nonce}'

export default class UserService {

    static async nonce(address) {
        const nonce = BaseUtil.genId(32);
        await RedisHelper.setEx(`nonce:${address}`, 60 * 5, nonce);
        const message = SIGN_MESSAGE.replace('{address}', address).replace('{nonce}', nonce);
        return {
            message,
            nonce
        }
    }

    static async login(address, signature) {
        const nonce = await RedisHelper.get(`nonce:${address}`);
        if (!nonce) {
            throw new Error('Nonce has expired, please try again');
        }

        const message = SIGN_MESSAGE.replace('{address}', address).replace('{nonce}', nonce);
        const result = BaseUtil.verifySignature(address, message, signature);
        if (!result) {
            throw new Error('Signature verification failed');
        }

        return jwt.sign(
            {address},
            Constants.JWT.SECRET,
            {expiresIn: Constants.JWT.TOKEN_EXPIRE}
        );
    }

    static async getAssetsByUtxo(address, {txid, vout}) {
        let outpoints = await IndexerService.getOutpointsByOutput(txid, vout);
        outpoints = outpoints.filter(outpoint => outpoint.address === address && outpoint.spent === 0);
        if (outpoints.length === 0) {
            return [];
        }
        const alkanesIds = outpoints.map(outpoint => outpoint.alkanesId);
        const tokenList = await TokenInfoService.getTokenList(alkanesIds);
        let nftItems = [];
        let collections = {};
        if (tokenList.length !== alkanesIds.length) {
            nftItems = await NftItemService.getItemsByIds(alkanesIds);
            if (nftItems.length > 0) {
                collections = (await NftCollectionService.getCollectionByIds(nftItems.map(item => item.collectionId))).reduce((acc, collection) => {
                    acc[collection.id] = collection;
                    return acc;
                }, {});
            }
        }
        return outpoints.map(outpoint => {
            const token = tokenList.find(token => token.id === outpoint.alkanesId);
            const item = nftItems.find(item => item.id === outpoint.alkanesId);
            const isNft = !!item;
            const collectionId = item?.collectionId;
            return {
                nft: isNft,
                collection: isNft ? collections[collectionId] : null,
                id: token?.id ?? item?.id,
                symbol: token?.symbol ?? item?.symbol,
                name: token?.name ?? item?.name,
                image: token?.image ?? item?.image,
                balance: BigInt(outpoint.balance).toString(),
                txid: outpoint.txid,
                vout: outpoint.vout,
                value: BigInt(outpoint.value).toString(),
            }
        });
    }

    static async getAlkanesBalance(address, filterAlkanesIds, byIndexer = false) {
        if (byIndexer) {
            let addressBalances = await IndexerService.getAddressBalances(address);
            addressBalances = addressBalances.filter(addressBalance => addressBalance.balance > 0);
            if (addressBalances.length === 0) {
                return [];
            }
            const alkanesIds = addressBalances.map(addressBalance => addressBalance.alkanesId);
            const tokenList = await TokenInfoService.getTokenList(alkanesIds);
            let nftItems = [];
            let collections = {};
            if (tokenList.length !== alkanesIds.length) {
                nftItems = await NftItemService.getItemsByIds(alkanesIds);
                if (nftItems.length > 0) { // 从outpoint_record表中获取itemId的真实holder, 如果holder和address不相等, 从addressBalances
                    const outpointRecords = await IndexerService.getOutpointsByAlkanesIds(nftItems.map(item => item.id));
                    nftItems = nftItems.filter(item => {
                        const match = outpointRecords.find(record => record.alkanesId === item.id)?.address === address;
                        if (!match) { // 如果holder和address不相等, 从addressBalances删除
                            addressBalances = addressBalances.filter(addressBalance => addressBalance.alkanesId !== item.id);
                        }
                        return match;
                    });
                }
                if (nftItems.length > 0) {
                    collections = (await NftCollectionService.getCollectionByIds(nftItems.map(item => item.collectionId))).reduce((acc, collection) => {
                        acc[collection.id] = collection;
                        return acc;
                    }, {});
                }
            }
            return addressBalances.map(addressBalance => {
                const token = tokenList.find(token => token.id === addressBalance.alkanesId);
                const item = nftItems.find(item => item.id === addressBalance.alkanesId);
                const isNft = !!item;
                const collectionId = item?.collectionId;
                const floorPrice = isNft ? collections[collectionId]?.floorPrice ?? 0 : token?.floorPrice ?? 0;
                const priceChange24h = isNft ? collections[collectionId]?.priceChange24h ?? 0 : token?.priceChange24h ?? 0;
                const totalValue = isNft ? floorPrice.toString() : new BigNumber(addressBalance.balance).dividedBy(10**8).multipliedBy(floorPrice).toString()
                return {
                    nft: isNft,
                    collection: isNft ? collections[collectionId] : null,
                    id: token?.id ?? item?.id,
                    symbol: token?.symbol ?? item?.symbol,
                    name: token?.name ?? item?.name,
                    image: token?.image ?? item?.image,
                    balance: new BigNumber(addressBalance.balance).dividedBy(10**8).toFixed(),
                    floorPrice: floorPrice.toString(),
                    priceChange24h: priceChange24h.toString(),
                    totalValue
                }
            }).filter(item => !filterAlkanesIds || filterAlkanesIds.includes(item.id) || filterAlkanesIds.includes(item.collection?.id));
        }
        try {
            bitcoin.address.toOutputScript(address, config.network)
        } catch (err) {
            throw new Error('Invalid address, please try again');
        }

        const alkanesList = await AlkanesService.getAlkanesByAddress(address);
        if (!alkanesList || alkanesList.length === 0) {
            return [];
        }
        const alkanesIds = alkanesList.map(alkanes => alkanes.id);
        const tokenList = await TokenInfoMapper.getTokenPrice(alkanesIds);
        const tokenMap = new Map(tokenList.map(token => [token.id, token]));
        return alkanesList.map(alkanes => {
            const token = tokenMap.get(alkanes.id);
            if (!token) {
                logger.error(`not found token: ${alkanes.id}`);
            }
            return {
                ...alkanes,
                image: token?.image || Constants.TOKEN_DEFAULT_IMAGE,
                floorPrice: token?.floorPrice || 0,
                priceChange24h: token?.priceChange24h || 0,
                totalValue: new BigNumber(alkanes.balance).multipliedBy(token?.floorPrice || 0).toString()
            }
        });
    }
}