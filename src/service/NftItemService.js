import NftItem from '../models/NftItem.js';
import Sequelize, {Op} from "sequelize";
import * as RedisHelper from "../lib/RedisHelper.js";
import AddressBalanceMapper from '../mapper/AddressBalanceMapper.js';
import BaseUtil from '../utils/BaseUtil.js';
import NftAttributeService from './NftAttributeService.js';
import NftMarketListingMapper from '../mapper/NftMarketListingMapper.js';
import IndexerService from './IndexerService.js';
import AlkanesService from "./AlkanesService.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import FeeUtil from "../utils/FeeUtil.js";
import config from "../conf/config.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import MempoolUtil from '../utils/MempoolUtil.js';
import DiscountAddressMapper from '../mapper/DiscountAddressMapper.js';

export default class NftItemService {

    static getItemCacheKey(collectionId, holderAddress, listing, utxo, name, page, size) {
        return `nft-items:${collectionId}:${holderAddress || 'all'}:${listing ?? 'all'}:${utxo ?? 'all'}:${name || 'all'}:${page}:${size}`;
    }

    static async bulkUpsertNftItem(infos, options = {transaction: null}) {
        await NftItem.bulkCreate(infos, {
            ignoreDuplicates: true,
            transaction: options.transaction
        });
    }

    static async transfer(fundAddress, fundPublicKey, assetAddress, assetPublicKey, feerate, assetsList) {
        if (!assetsList || assetsList.length === 0) {
            throw new Error('No transfer request')
        }

        let index = 0;
        const inputList = [];
        const outputList = [];
        const transferList = [];
        const existsOutpoints = new Set();
        for (const assets of assetsList) {
            const outpoint = `${assets.txid}:${assets.vout}`;
            if (!existsOutpoints.has(outpoint)) {
                inputList.push({
                    txid: assets.txid,
                    vout: parseInt(assets.vout),
                    value: parseInt(assets.value),
                    address: assetAddress,
                    pubkey: assetPublicKey
                });

                existsOutpoints.add(outpoint);
            }

            transferList.push({
                id: assets.id,
                amount: 0,
                output: index
            });
            index++;

            outputList.push({
                address: assets.toAddress,
                value: 330
            });
        }

        const protostone = AlkanesService.getBatchTransferProtostone(transferList);
        outputList.push({
            script: protostone,
            value: 0
        });

        let transferFee = 1000;
        const discountAddress = await DiscountAddressMapper.getDiscountAddress(assetAddress);
        if (discountAddress) {
            transferFee = parseInt(`${transferFee * (discountAddress.transferDiscount / 100)}`);
        }
        outputList.push({
            address: config.revenueAddress.transfer,
            value: transferFee
        });

        const txSize = FeeUtil.estTxSize([{address: fundAddress}], [...outputList, {address: fundAddress}]);
        const txFee = Math.floor(txSize * feerate);
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, txFee + transferFee + 3000, feerate);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);
        inputList.push(...utxoList);

        return PsbtUtil.createUnSignPsbt(inputList, outputList, fundAddress, feerate);
    }

    static async getItemById(id) {
        const item = await NftItem.findByPk(id, {
            attributes: {
                exclude: ['updateHeight', 'createdAt', 'updatedAt']
            },
            raw: true
        });
        item.attributes = await NftAttributeService.getNftItemAttributes(id);
        const listing = await NftMarketListingMapper.getListingItem(id);
        item.listing = listing ? 1 : 0;
        item.listingId = listing?.id;
        item.listingPrice = listing?.listingPrice;
        item.sellerAmount = listing?.sellerAmount;
        item.listingOutput = listing?.listingOutput;
        return item;
    }

    static async getItemPage(collectionId, holderAddress, listing, utxo, attributes, name, page, size) {
        const cacheKey = NftItemService.getItemCacheKey(collectionId, holderAddress, listing, utxo, name, page, size);
        if (attributes?.length <= 0) {
            // 查缓存
            const cacheData = await RedisHelper.get(cacheKey);
            if (cacheData) {
                return JSON.parse(cacheData);
            }
        }
        const order = [
            [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'ASC'],
            [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'ASC'],
        ];
        const where = {
            collectionId,
        };
        if (listing === true) {
            where.id = {
                [Op.in]: Sequelize.literal('(SELECT item_id FROM nft_market_listing WHERE status = 1 AND collection_id = :collectionId)')
            }
        } else if (listing === false) {
            where.id = {
                [Op.notIn]: Sequelize.literal('(SELECT item_id FROM nft_market_listing WHERE status = 1 AND collection_id = :collectionId)')
            }
        }
        if (holderAddress) {
            where.holder = holderAddress;
        }
        // 要排除在NftMarketListing已上架的item
        if (name) {
            where[Op.or] = [
                { id: { [Op.like]: `%${name}%` } },
                { name: { [Op.like]: `%${name}%` } }
            ];
        }
        if (attributes?.length > 0) {
            // attributes 是数组，每个元素是对象，对象的属性是 trait_type 和 value
            // 需要根据 attributes 查询 item_id
            const itemIds = await NftAttributeService.getItemIdsByAttributes(collectionId, attributes);
            if (itemIds.length <= 0) {
                return {
                    page,
                    size,
                    total: 0,
                    pages: 0,
                    records: []
                };
            }
            where.id = {
                [Op.in]: itemIds.map(item => item.item_id)
            };
        }
        const { rows, count } = await NftItem.findAndCountAll({
            where,
            order,
            offset: (page - 1) * size,
            limit: size,
            raw: true,
            replacements: { collectionId }
        });
        const itemIds = rows.map(item => {
            return item.id
        });
        if (listing === false) {
            rows.forEach(item => {
                item.listing = 0;
            });
        } else {
            const listingItems = await NftMarketListingMapper.getListingItems(itemIds);
            rows.forEach(item => {
                const listingItem = listingItems.find(listing => listing.itemId === item.id);
                item.listing = listingItem ? 1 : 0;
                item.listingId = listingItem?.id;
                item.listingPrice = listingItem?.listingPrice;
                item.sellerAmount = listingItem?.sellerAmount;
                item.listingOutput = listingItem?.listingOutput;
            });
        }
        const removeItemIds = new Set();
        if (holderAddress) {
            const outpointRecords = await IndexerService.getOutpointsByAlkanesIds(itemIds);
            rows.forEach(item => {
                const outpointRecord = outpointRecords.find(record => record.alkanesId === item.id);
                if (!outpointRecord) {
                    item.spent = true;
                    removeItemIds.add(item.id);
                    return;
                }
                item.txid = outpointRecord?.txid;
                item.vout = outpointRecord?.vout;
                item.value = outpointRecord?.value;
                item.assetCount = outpointRecord?.alkanesIdCount;
                item.spent = false;
            });
            await BaseUtil.concurrentExecute(rows, async (item) => {
                if (removeItemIds.has(item.id)) {
                    return;
                }
                const outspend = await MempoolUtil.getOutspend(item.txid, item.vout);
                item.spent = outspend.spent;
            });
        }
        const result = {
            page,
            size,
            total: count,
            pages: Math.ceil(count / size),
            records: rows.filter(item => !removeItemIds.has(item.id)),
        };
        // 写缓存，10秒有效期
        if (attributes?.length <= 0) {
            await RedisHelper.setEx(cacheKey, 10, JSON.stringify(result));
        }
        return result;
    }

    static async getItemsByIds(ids) {
        return await NftItem.findAll({
            where: {
                id: { [Op.in]: ids }
            },
            raw: true,
        });
    }

    static async updateHolder(address, alkanesId, block) {
        await NftItem.update({
            holder: address,
            updateHeight: block
        }, { where: { id: alkanesId } });
    }
    
    static async indexNftItemHolder() {
        const nftItems = await NftItem.findAll({
            where: {
                holder: ''
            }
        });
        if (nftItems.length === 0) {
            return;
        }
        const collectionIds = new Set();
        await BaseUtil.concurrentExecute(nftItems, async (nftItem) => {
            const addressBalance = await AddressBalanceMapper.getNftItemHolder(nftItem.id);
            if (addressBalance) {
                await NftItem.update({
                    holder: addressBalance.address,
                    updateHeight: addressBalance.updateBlock
                }, { where: { id: nftItem.id } });
                collectionIds.add(nftItem.collectionId);
            }
        });
        return [...collectionIds];
    }

    static async findMaxItemId(prefix = '2') {
        const maxIdItem = await NftItem.findOne({
            attributes: ['id'],
            where: {
                id: {
                    [Op.like]: `${prefix}:%`
                }
            },
            order: [
                [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", 1) AS UNSIGNED)'), 'DESC'],
                [Sequelize.literal('CAST(SUBSTRING_INDEX(id, ":", -1) AS UNSIGNED)'), 'DESC'],
            ],
            raw: true
        });
        return maxIdItem?.id;
    }

    static async getNftItemCount(collectionId) {
        return await NftItem.count({
            where: {
                collectionId
            }
        });
    }

    static async getItemsByCollectionId(collectionId) {
        return await NftItem.findAll({
            where: {
                collectionId
            },
            raw: true,
        });
    }
}
