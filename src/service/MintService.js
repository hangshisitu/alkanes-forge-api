import AlkanesService from "./AlkanesService.js";
import AddressUtil from "../lib/AddressUtil.js";
import FeeUtil from "../utils/FeeUtil.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import config from "../conf/config.js";
import {Constants} from "../conf/constants.js";
import MintOrderMapper from "../mapper/MintOrderMapper.js";
import MintItemMapper from "../mapper/MintItemMapper.js";
import BaseUtil from "../utils/BaseUtil.js";
import MempoolUtil from "../utils/MempoolUtil.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import sequelize from "../lib/SequelizeHelper.js";
import * as RedisLock from "../lib/RedisLock.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import {Queue} from "../utils/index.js";
import * as logger from '../conf/logger.js';

const broadcastQueue = new Queue();

export default class MintService {

    // 公共内部函数：计算订单各项费用与输出列表
    static async calcMergeOrderOutputs(fundAddress, toAddress, id, mints, postage, feerate, maxFeerate) {
        const tokenInfo = await TokenInfoMapper.getById(id);
        if (!tokenInfo || tokenInfo.mintActive === 0) {
            logger.error(`calc merge order outputs token ${id} minting is unavailable.`);
            throw new Error(`Token ${id} minting is unavailable`);
        }
        const mintProtostone = AlkanesService.getMintProtostone(id, Constants.MINT_MODEL.NORMAL);
        const transferProtostone = AlkanesService.getMintProtostone(id, Constants.MINT_MODEL.MERGE);

        const orderId = BaseUtil.genId();
        const privateKey = MintService.getMintPrivateKey(orderId);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);

        const mintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: mintAddress}, {script: transferProtostone}]);
        const mintFee = Math.ceil(mintSize * feerate);

        const lastMintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: toAddress}, {script: transferProtostone}]);
        const lastMintFee = Math.ceil(lastMintSize * feerate) + postage;

        const batchList = BaseUtil.splitByBatchSize(mints, Constants.MINT_AMOUNT_PER_BATCH);
        const diffFeerate = maxFeerate - feerate;

        const fundOutputList = [];
        // 第一组
        const firstBatchFee = Math.ceil(mintFee * (batchList[0] - 2)) + lastMintFee;
        const receiveAddress = mints === 1 ? toAddress : mintAddress;
        fundOutputList.push({
            address: receiveAddress,
            value: firstBatchFee,
        });

        for (let i = 1; i < batchList.length; i++) {
            let batchMintFee = mintFee * (batchList[i] - 1) + lastMintFee;
            let prepaid = 0;
            if (diffFeerate > 0.1) {
                // 计算加速所需花费
                const batchMintSize = mintSize * (batchList[i] - 1) + lastMintSize;
                const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress);
                prepaid = Math.ceil(diffFeerate * (batchMintSize + additionalSize));
            }
            fundOutputList.push({
                address: mintAddress,
                value: batchMintFee,
                prepaid: prepaid
            });
        }

        fundOutputList.push({
            script: mintProtostone,
            value: 0
        });
        // 手续费
        const serviceFee = MintService.calculateServiceFee(batchList);
        fundOutputList.push({
            address: config.revenueAddress.inscribe,
            value: serviceFee,
        });
        return {
            batchList,
            mintAddress,
            orderId,
            fundOutputList,
            mintFee,
            mintSize,
            lastMintFee,
            lastMintSize,
            transferProtostone,
            mintProtostone,
            serviceFee,
            diffFeerate
        };
    }

    // 费用测算函数
    static async estCreateMergeOrder(fundAddress, toAddress, id, mints, postage, feerate, maxFeerate = 0) {
        const {
            batchList,
            fundOutputList,
            mintSize,
            lastMintSize,
            serviceFee,
            diffFeerate
        } = await MintService.calcMergeOrderOutputs(fundAddress, toAddress, id, mints, postage, feerate, maxFeerate, Constants.MINT_AMOUNT_PER_BATCH);

        // 交易打包相关费用估算
        const transferSize = FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]);
        const totalTxSize = mintSize * (batchList[0] - 2) + lastMintSize + transferSize;

        // 需要单独计算第一批的加速费
        let prepaid = 0;
        if (diffFeerate > 0.1) {
            const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress);
            prepaid = Math.ceil(diffFeerate * (totalTxSize + additionalSize));
        }

        // 预存的加速飞
        let totalPrepaid = fundOutputList.reduce((sum, output) => sum + (output.prepaid || 0), 0);
        totalPrepaid += prepaid;

        // 所有需要支付的费用
        const totalFee = fundOutputList.reduce((sum, output) => sum + output.value, 0);
        const transferFee = Math.ceil(FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]) * feerate);

        const totalPostage = postage * batchList.length;
        // 扣掉服务费与预留聪就是网络费
        const networkFee = totalFee - serviceFee - totalPostage + transferFee;

        return {
            serviceFee,
            networkFee,
            totalPrepaid,
            totalFee: serviceFee + networkFee + totalPrepaid + totalPostage
        };
    }

    // 订单实际构建函数
    static async preCreateMergeOrder(fundAddress, fundPublicKey, userAddress, toAddress, id, mints, postage, feerate, maxFeerate = 0) {
        const {
            batchList,
            mintAddress,
            orderId,
            fundOutputList,
            mintSize,
            lastMintSize,
            serviceFee,
            diffFeerate
        } = await MintService.calcMergeOrderOutputs(fundAddress, toAddress, id, mints, postage, feerate, maxFeerate);

        // 交易打包相关费用估算
        const transferSize = FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]);
        const totalTxSize = mintSize * (batchList[0] - 2) + lastMintSize + transferSize;

        // 需要单独计算第一批的加速费
        let prepaid = 0;
        if (diffFeerate > 0.1) {
            const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress);
            prepaid = Math.ceil(diffFeerate * (totalTxSize + additionalSize));
            fundOutputList[0].prepaid = prepaid;
        }

        // 将预付费追加到付款输出
        fundOutputList.map(output => output.value += (output.prepaid || 0));

        let transferFee = Math.ceil(FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]) * feerate);
        const totalFee = fundOutputList.reduce((sum, output) => sum + output.value, 0);
        const needAmount = totalFee + transferFee + 3000; // 预留空间

        // 查找UTXO
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, needAmount, feerate, true);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        // 如果实际付款的UTXO超过1个，需要追加对应的加速费
        if (utxoList.length > 1) {
            const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress) * (utxoList.length - 1);
            const additionalPrepaid = Math.ceil(additionalSize * diffFeerate);

            // 追加第一批加速费
            fundOutputList[0].prepaid += additionalPrepaid;
            fundOutputList[0].value += additionalPrepaid;
        }

        // 总加速费
        let totalPrepaid = fundOutputList.reduce((sum, output) => sum + (output.prepaid || 0), 0);
        // 网络费 = 所有支出费用 - 服务费 - 加速费 - 预留聪
        let networkFee = fundOutputList.reduce((sum, output) => sum + output.value, 0);
        networkFee = networkFee - serviceFee - totalPrepaid - postage * batchList.length;

        const psbt = await PsbtUtil.createUnSignPsbt(utxoList, fundOutputList, fundAddress, feerate);
        // 追加订单付款的这一笔Gas费
        networkFee += psbt.fee;

        // 保存订单
        const tokenInfo = await TokenInfoMapper.getById(id);
        const mintOrder = {
            id: orderId,
            model: Constants.MINT_MODEL.MERGE,
            alkanesId: id,
            alkanesName: tokenInfo.name,
            mintAddress: mintAddress,
            userAddress: userAddress,
            paymentAddress: fundAddress,
            receiveAddress: toAddress,
            feerate: feerate,
            latestFeerate: feerate,
            maxFeerate: maxFeerate || feerate,
            prepaid: totalPrepaid,
            change: totalPrepaid,
            postage: postage,
            serviceFee: serviceFee,
            networkFee: networkFee,
            totalFee: totalFee + psbt.fee,
            mintAmount: mints,
            mintStatus: Constants.MINT_ORDER_STATUS.UNPAID
        }
        await MintOrderMapper.createOrder(mintOrder);

        psbt.orderId = orderId;
        psbt.prepaid = totalPrepaid;
        psbt.serviceFee = serviceFee;
        psbt.networkFee = networkFee;
        psbt.totalFee = serviceFee + networkFee + totalPrepaid + postage * batchList.length;
        return psbt;
    }

    static async createMergeOrder(orderId, userAddress, psbt) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            logger.error(`create merge order ${orderId} not found.`);
            throw new Error('Not found order, please refresh and try again.');
        }

        if (mintOrder.userAddress !== userAddress) {
            throw new Error("You cannot operate on another user's order.");
        }

        const mintTxs = [];
        const {txid, hex, txSize, error} = await UnisatAPI.unisatPush(psbt);
        if (error) {
            logger.error(`push tx for merge order ${orderId} error: ${error}`);
            throw new Error(error);
        }

        mintTxs.push({
            mintHash: txid,
            txSize: txSize,
            mintStatus: Constants.MINT_STATUS.WAITING
        });

        const privateKey = MintService.getMintPrivateKey(orderId);
        const mintAddress = mintOrder.mintAddress;

        const transferProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.MERGE);
        const transferSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: mintAddress}, {script: transferProtostone}]);
        let transferFee = Math.ceil(transferSize * mintOrder.feerate);

        const originalPsbt = PsbtUtil.fromPsbt(psbt);
        const paymentUtxo = PsbtUtil.extractInputFromPsbt(originalPsbt, 0);
        const originalTx = originalPsbt.extractTransaction();

        let fundValue = originalPsbt.txOutputs[0].value;
        let receiveAddress = mintAddress;
        let changeValue = 0;

        let inputTxid = txid;
        const itemList = [{
            id: BaseUtil.genId(),
            orderId: orderId,
            inputUtxo: `${paymentUtxo.txid}:${paymentUtxo.vout}:${paymentUtxo.value}`,
            batchIndex: 0,
            mintIndex: 0,
            receiveAddress: receiveAddress,
            txSize: BaseUtil.divCeil(originalTx.weight(), 4),
            mintHash: txid,
            psbt: hex,
            mintStatus: Constants.MINT_STATUS.MINTING
        }];

        const maxMintAmount = Math.min(mintOrder.mintAmount, Constants.MINT_AMOUNT_PER_BATCH);
        for (let i = 1; i < maxMintAmount; i++) {
            const inputUtxo = {
                txid: inputTxid,
                vout: 0,
                value: fundValue,
                address: mintAddress
            };

            // 在前面使用脚本地址递归，最后一笔转给目标地址
            if (i === maxMintAmount - 1) {
                receiveAddress = mintOrder.receiveAddress;

                // 重新计算费用
                const transferSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: receiveAddress}, {script: transferProtostone}]);
                transferFee = Math.ceil(transferSize * mintOrder.feerate);

                // 如果有预存，需要找零回去
                if (mintOrder.prepaid > 0) {
                    const changeFee = FeeUtil.getOutputFee(mintOrder.paymentAddress, mintOrder.feerate);
                    changeValue = fundValue - transferFee - changeFee - mintOrder.postage;
                }
                fundValue = mintOrder.postage;
            } else {
                fundValue -= transferFee;
            }

            const outputList = [];
            outputList.push({
                address: receiveAddress,
                value: fundValue
            });
            outputList.push({
                script: transferProtostone,
                value: 0
            });
            if (changeValue > 1000) {
                outputList.push({
                    address: mintOrder.paymentAddress,
                    value: changeValue
                });
            }

            const txInfo = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(privateKey), [inputUtxo], outputList, mintAddress, mintOrder.feerate, false, false);
            inputTxid = txInfo.txid;

            mintTxs.push({
                mintHash: inputTxid,
                txSize: txInfo.txSize,
                mintStatus: Constants.MINT_STATUS.WAITING
            });

            itemList.push({
                id: BaseUtil.genId(),
                orderId: orderId,
                inputUtxo: `${inputUtxo.txid}:${inputUtxo.vout}:${inputUtxo.value}`,
                txSize: txInfo.txSize,
                psbt: txInfo.hex,
                batchIndex: 0,
                mintIndex: i,
                receiveAddress: receiveAddress,
                mintHash: inputTxid,
                mintStatus: Constants.MINT_STATUS.WAITING
            });
        }

        const submittedAmount = mintTxs.length;
        const mintStatus = submittedAmount === mintOrder.mintAmount ? Constants.MINT_ORDER_STATUS.MINTING : Constants.MINT_ORDER_STATUS.PARTIAL;
        await sequelize.transaction(async (transaction) => {
            await MintOrderMapper.updateOrder(orderId, txid, submittedAmount, mintStatus, {transaction});
            await MintItemMapper.bulkUpsertItem(itemList, {transaction});
        });
        broadcastQueue.put([itemList, Constants.MINT_MODEL.MERGE]);

        return {
            id: orderId,
            alkanesId: mintOrder.alkanesId,
            alkanesName: mintOrder.alkanesName,
            paymentAddress: mintOrder.paymentAddress,
            receiveAddress: mintOrder.receiveAddress,
            paymentHash: mintOrder.paymentHash,
            feerate: mintOrder.feerate,
            latestFeerate: mintOrder.latestFeerate,
            maxFeerate: mintOrder.maxFeerate,
            postage: mintOrder.postage,
            prepaid: mintOrder.prepaid,
            change: mintOrder.change,
            networkFee: mintOrder.networkFee,
            serviceFee: mintOrder.serviceFee,
            totalFee: mintOrder.totalFee,
            mintAmount: mintOrder.mintAmount,
            submittedAmount: submittedAmount,
            completedAmount: 0,
            mintStatus: mintStatus,
            mintTxs: mintTxs
        };
    }

    static async orderInfo(orderId) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            throw new Error('Not found order, please refresh and try again.');
        }

        const mintTxs = await MintItemMapper.selectMintTxs(orderId);
        mintTxs.sort((a, b) => {
            if (a.batchIndex !== b.batchIndex) {
                return a.batchIndex - b.batchIndex; // 先按批次升序排序
            }
            return a.mintIndex - b.mintIndex; // 批次相同，再按mintIndex升序排序
        });
        return {
            ...mintOrder,
            mintTxs
        }
    }

    static async preCancelMergeOrder(orderId) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            logger.error(`pre cancel merge order ${orderId} not found.`);
            throw new Error('Not found order, please refresh and try again.');
        }
        if (mintOrder.mintStatus !== Constants.MINT_ORDER_STATUS.PARTIAL) {
            logger.error(`pre cancel merge order ${orderId} mint status is not partial.`);
            throw new Error('All minting has been broadcast, no refundable amount.');
        }

        const mintTxs = await MintItemMapper.selectMintTxs(orderId, Constants.MINT_STATUS.MINTING);
        if (!mintTxs || mintTxs.length === 0 || mintTxs.length > Constants.MINT_AMOUNT_PER_BATCH) {
            logger.error(`pre cancel merge order ${orderId} mint txs is not valid.`);
            throw new Error('All minting has been broadcast, no refundable amount.');
        }

        const txSize = mintTxs.reduce((sum, output) => sum + output.txSize, 0);
        // 第一笔转账Mint + 最后一笔合并Mint
        const payTxSize = mintTxs
            .map(output => output.txSize)
            .sort((a, b) => b - a)      // 从大到小排序
            .slice(0, 2)                // 取前两个
            .reduce((sum, v) => sum + v, 0);  // 求和
        const networkFee = Math.ceil((txSize - payTxSize) * (mintOrder.latestFeerate + 0.5));

        const tx = await MempoolUtil.getTx(mintOrder.paymentHash);
        const inputList = [];
        let totalInputValue = 0;
        for (let i = 0; i < tx.vout.length; i++) {
            if (tx.vout[i].scriptpubkey_address !== mintOrder.mintAddress) {
                break;
            }

            inputList.push({
                txid: mintOrder.paymentHash,
                vout: i,
                value: tx.vout[i].value,
                address: mintOrder.mintAddress
            });
            totalInputValue += tx.vout[i].value;
        }
        let refundValue = totalInputValue - networkFee;
        refundValue = refundValue < 546 ? 0 : refundValue;

        return {
            mintOrder: mintOrder,
            inputList,
            refundValue
        }
    }

    static async cancelMergeOrder(orderId, userAddress) {
        const {mintOrder, inputList, refundValue} = await MintService.preCancelMergeOrder(orderId);
        if (refundValue === 0) {
            logger.error(`cancel merge order ${orderId} refund value is 0.`);
            throw new Error('No refundable amount.');
        }

        if (mintOrder.userAddress !== userAddress) {
            throw new Error("You cannot operate on another user's order.");
        }

        const transferProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.MERGE);
        const outputList = [];
        outputList.push({
            address: mintOrder.receiveAddress,
            value: mintOrder.postage
        })
        outputList.push({
            address: mintOrder.paymentAddress,
            value: refundValue
        })
        outputList.push({
            script: transferProtostone,
            value: 0
        })

        const privateKey = MintService.getMintPrivateKey(orderId);
        const {
            txid,
            error
        } = await UnisatAPI.transfer(privateKey, inputList, outputList, mintOrder.mintAddress, 0, false, false);
        if (error) {
            logger.error(`cancel merge order ${orderId} transfer error: ${error}`);
            throw new Error(error);
        }

        await MintOrderMapper.updateOrder(orderId, mintOrder.paymentHash, 2, Constants.MINT_ORDER_STATUS.CANCELLED);
        return txid;
    }

    static async accelerateMergeOrder(orderId, feerate, userAddress) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            logger.error(`accelerate merge order ${orderId} not found.`);
            throw new Error('Not found order, please refresh and try again.');
        }
        if (mintOrder.userAddress !== userAddress) {
            throw new Error("You cannot operate on another user's order.");
        }

        const subOrders = await MintItemMapper.selectMintingItems(orderId);
        if (!subOrders || subOrders.length === 0) {
            logger.error(`accelerate merge order ${orderId} mint is completed.`);
            throw new Error('Mint is completed, please refresh and try again.');
        }

        if (feerate > mintOrder.maxFeerate) {
            logger.error(`accelerate merge order ${orderId} feerate ${feerate} > maxFeerate ${mintOrder.maxFeerate}`);
            throw new Error(`Exceeding the maximum accelerator rate: ${mintOrder.maxFeerate}`);
        }

        const privateKey = MintService.getMintPrivateKey(orderId);
        const transferProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.MERGE);

        const mintItems = [];
        let totalChangeValue = 0;
        for (const subOrder of subOrders) {
            // 检查是否已确认
            const txStatus = await MempoolUtil.getTxStatus(subOrder.mintHash);
            if (txStatus) {
                continue;
            }

            const totalTxSize = subOrder.totalTxSize;
            const originalFee = totalTxSize * mintOrder.feerate;
            const newFee = totalTxSize * feerate;
            const additionalFee = Math.ceil(newFee - originalFee);

            const inputArray = subOrder.inputUtxo.split(':');
            const inputUtxo = {
                txid: inputArray[0],
                vout: parseInt(inputArray[1]),
                value: parseInt(inputArray[2]),
                address: mintOrder.mintAddress
            }

            const outputList = [{
                address: mintOrder.receiveAddress,
                value: mintOrder.postage
            }];
            outputList.push({
                script: transferProtostone,
                value: 0
            });

            const changeValue = inputUtxo.value - mintOrder.postage - additionalFee;
            if (changeValue > 1000) {
                outputList.push({
                    address: mintOrder.paymentAddress,
                    value: changeValue
                });
                totalChangeValue += changeValue;
            }

            const {txid, hex, error} = await UnisatAPI.transfer(privateKey, [inputUtxo], outputList, mintOrder.paymentAddress, mintOrder.feerate, false, false);
            if (MintService.shouldThrowError(error)) {
                throw new Error(error);
            }

            logger.info(`pre accelerate order ${orderId} ${subOrder.batchIndex} ${txid}`);
            const item = {
                id: subOrder.id,
                mintHash: txid,
                psbt: hex,
            };
            mintItems.push(item);

            // 如果第一批未结束，其他暂不需要加速
            if (subOrder.batchIndex === 0) {
                break;
            }
        }

        await sequelize.transaction(async (transaction) => {
            await MintItemMapper.batchUpdateHash(mintItems, {transaction});
            await MintOrderMapper.updateOrderFeerate(orderId, totalChangeValue, feerate, {transaction});
        });
    }

    static async submitBatchItems(items, model = Constants.MINT_MODEL.MERGE, ignoreStatus = false, accelerate = false) {
        if (model === Constants.MINT_MODEL.MERGE) { // 顺序广播
            for (const item of items) {
                const {orderId, batchIndex, mintIndex} = item;
                if (!ignoreStatus && item.mintStatus !== Constants.MINT_STATUS.WAITING) {
                    continue;
                }
                const {txid, error} = await UnisatAPI.unisatPush(item.psbt);
                if (MintService.shouldThrowError(error)) {
                    logger.error(`${accelerate ? 'accelerate' : 'submit'} batch order ${orderId} batch ${batchIndex} mint ${mintIndex} item ${item.id} error: ${error}`);
                    throw new Error(error);
                }
                logger.info(`${accelerate ? 'accelerate' : ''} minted batch order ${orderId} batch ${batchIndex} mint ${mintIndex} tx ${txid}`);
                await MintItemMapper.updateItemStatus(item.id, Constants.MINT_STATUS.WAITING, Constants.MINT_STATUS.MINTING);
            }
        } else if (model === Constants.MINT_MODEL.NORMAL) { // 并发广播
            await BaseUtil.concurrentExecute(items, async item => {
                if (!ignoreStatus && item.mintStatus !== Constants.MINT_STATUS.WAITING) {
                    return;
                }
                const {error} = await UnisatAPI.unisatPush(item.psbt);
                if (MintService.shouldThrowError(error)) {
                    logger.error(`${accelerate ? 'accelerate' : 'submit'} batch order ${item.orderId} item ${item.id} error: ${error}`);
                    return;
                }
                await MintItemMapper.updateItemStatus(item.id, Constants.MINT_STATUS.WAITING, Constants.MINT_STATUS.MINTING);
            }, 4);
        } else {
            throw new Error(`Invalid model: ${model}`);
        }
    }

    static async submitRemain0(mintOrder, tx) {
        // 提交剩余的交易
        await RedisLock.withLock(RedisHelper.genKey(`submitRemain0:${mintOrder.id}`), async () => {
            logger.info(`submit remain for merge order ${mintOrder.id}, status: ${mintOrder.mintStatus}`);
            const totalItemList = [];
            if (mintOrder.mintStatus === Constants.MINT_ORDER_STATUS.PARTIAL) {
                const orderId = mintOrder.id;
                const batchList = BaseUtil.splitByBatchSize(mintOrder.mintAmount, Constants.MINT_AMOUNT_PER_BATCH);
                for (let i = 1; i < batchList.length; i++) {
                    const inputUtxo = {
                        txid: mintOrder.paymentHash,
                        vout: i,
                        value: tx.vout[i].value
                    };
                    const itemList = await MintService.submitBatch(mintOrder, inputUtxo, i, batchList[i]);
                    totalItemList.push(...itemList);
                }

                await sequelize.transaction(async (transaction) => {
                    await MintOrderMapper.updateOrder(orderId, mintOrder.paymentHash, Math.min(mintOrder.submittedAmount + totalItemList.length, mintOrder.mintAmount), Constants.MINT_ORDER_STATUS.MINTING, {
                        transaction,
                        acceptStatus: Constants.MINT_STATUS.PARTIAL
                    });
                    await MintItemMapper.bulkUpsertItem(totalItemList, {transaction});
                });
                logger.info(`update order ${orderId} status to ${Constants.MINT_ORDER_STATUS.MINTING}`);
            } else {
                const itemList = await MintItemMapper.getMintItemsByOrderId(mintOrder.id);
                totalItemList.push(...itemList.filter(item => item.batchIndex > 0));
            }

            const groupedItems = {};
            for (const item of totalItemList) {
                if (!groupedItems[item.batchIndex]) {
                    groupedItems[item.batchIndex] = [];
                }
                groupedItems[item.batchIndex].push(item);
            }

            await BaseUtil.concurrentExecute(Object.values(groupedItems), async items => {
                try {
                    await MintService.submitBatchItems(items.sort((a, b) => a.mintIndex - b.mintIndex), Constants.MINT_MODEL.MERGE);
                } catch (e) {
                    logger.error(`submit batch order ${mintOrder.id} batch ${items[0].batchIndex} error`, e);
                }
            });
        }, {
            throwErrorIfFailed: false,
        });
    }

    static async submitBatch(mintOrder, inputUtxo, batchIndex, mintAmount) {
        const mintAddress = mintOrder.mintAddress;
        const privateKey = MintService.getMintPrivateKey(mintOrder.id);
        const mintProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.NORMAL);
        const transferProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.MERGE);

        let fundValue = inputUtxo.value;
        let inputTxid = inputUtxo.txid;
        const itemList = [];
        for (let i = 0; i < mintAmount; i++) {
            const vout = i === 0 ? inputUtxo.vout : 0;
            const mintUtxo = {
                txid: inputTxid,
                vout: vout,
                value: fundValue,
                address: mintAddress
            };

            let protostone;
            let mintSize;
            let receiveAddress;
            if (i === 0) {
                protostone = mintProtostone;
                receiveAddress = mintAddress;
                mintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: mintAddress}, {script: mintProtostone}]);
            } else {
                protostone = transferProtostone;
                receiveAddress = mintAddress;
                mintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: mintAddress}, {script: transferProtostone}]);
            }

            // 最后一次Mint，需要转到目标接收地址
            let accelerateFee = 0;
            let changeValue = 0;
            if (i === mintAmount - 1) {
                receiveAddress = mintOrder.receiveAddress;
                mintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: receiveAddress}, {script: transferProtostone}]);
                const mintFee = Math.ceil(mintSize * mintOrder.latestFeerate);

                // 如果有预设加速速率，需要找零回去
                if (mintOrder.latestFeerate < mintOrder.maxFeerate) {
                    accelerateFee = FeeUtil.getOutputFee(mintOrder.paymentAddress, mintOrder.latestFeerate);
                    changeValue = fundValue - mintFee - accelerateFee - mintOrder.postage;
                }
                fundValue = mintOrder.postage;
            } else {
                const mintFee = Math.ceil(mintSize * mintOrder.latestFeerate);
                fundValue -= mintFee + accelerateFee;
            }

            const outputList = [];
            outputList.push({
                address: receiveAddress,
                value: fundValue
            });
            outputList.push({
                script: protostone,
                value: 0
            });
            if (changeValue > 1000) {
                outputList.push({
                    address: mintOrder.paymentAddress,
                    value: changeValue
                });
            }
            const txInfo = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(privateKey), [mintUtxo], outputList, mintAddress, mintOrder.feerate, false, false);
            inputTxid = txInfo.txid;

            itemList.push({
                id: BaseUtil.genId(),
                orderId: mintOrder.id,
                inputUtxo: `${mintUtxo.txid}:${mintUtxo.vout}:${mintUtxo.value}`,
                txSize: txInfo.txSize,
                batchIndex: batchIndex,
                mintIndex: i,
                receiveAddress: receiveAddress,
                mintHash: inputTxid,
                psbt: txInfo.hex,
                mintStatus: Constants.MINT_STATUS.WAITING
            });
        }
        return itemList;
    }

    static calculateServiceFee(batchList) {
        const totalCount = batchList.reduce((sum, cur) => sum + cur, 0);
        let perBatchFee;

        if (batchList.length === 1) {
            // 只有一个批次
            perBatchFee = count => Math.min(300 * count, 5000);
        } else if (batchList.length >= 40 || totalCount >= 1000) {
            // 1000张/40批
            perBatchFee = () => 3000;
        } else if (batchList.length >= 20 || totalCount >= 500) {
            // 500张/20批
            perBatchFee = () => 3500;
        } else if (batchList.length >= 4 || totalCount >= 100) {
            // 100张/4批
            perBatchFee = () => 4000;
        } else {
            // 不足4批，仍按单价计费（但主逻辑上下很难出现此分支）
            perBatchFee = count => Math.min(300 * count, 5000);
        }

        // 合计
        let serviceFee = 0;
        for (const batchNumbers of batchList) {
            serviceFee += perBatchFee(batchNumbers);
        }
        return serviceFee;
    }

    static shouldThrowError(error) {
        if (!error) return false;
        return !(
            (error.includes('Transaction') && error.includes('already'))
            || error.includes('bad-txns-inputs-missingorspent')
            || error.includes('txn-mempool-conflict')
        );
    }

    static async tryFixMintItemHash(error, item) {
        if (error.includes('bad-txns-inputs-missingorspent')) {
            logger.info(`[fix]check order ${item.orderId} item ${item.id} tx ${item.mintHash}`);
            const [inputTxid, inputVout,] = item.inputUtxo.split(':');
            const outspend = await MempoolUtil.getOutspend(inputTxid, inputVout);
            if (outspend?.spent) {
                const actualTxid = outspend.txid;
                if (actualTxid !== item.mintHash) {
                    logger.info(`[fix]update order ${item.orderId} item ${item.id} tx ${item.mintHash} to ${actualTxid}`);
                    await MintItemMapper.updateItemMintHash(item.id, actualTxid, {
                        acceptStatus: Constants.MINT_STATUS.MINTING,
                        mintStatus: outspend.status?.confirmed ? Constants.MINT_STATUS.COMPLETED : Constants.MINT_STATUS.MINTING
                    });
                }
            }
        }
    }

    static async checkRbf(order) {
        const rbf = await MempoolUtil.getTxRbf(order.paymentHash);
        const rbfTxid = rbf?.replacements?.tx?.txid;
        if (rbfTxid) {
            logger.error(`tx ${order.paymentHash} for order ${order.id} rbf by ${rbfTxid}.`);
            await MintOrderMapper.updateStatus(order.id, order.mintStatus, Constants.MINT_ORDER_STATUS.CANCELLED);
            return true;
        }
        return false;
    }

    static async checkMergeOrderBatch(orderId, batchIndex) {
        const itemList = await MintItemMapper.getMintItemsByOrderId(orderId, batchIndex);
        if (itemList.length === 0) {
            return;
        }
        await BaseUtil.concurrentExecute(itemList, async (item) => {
            if (item.mintStatus === Constants.MINT_STATUS.COMPLETED) {
                return;
            }
            if (item.mintStatus === Constants.MINT_STATUS.WAITING) {
                const {error} = await UnisatAPI.unisatPush(item.psbt);
                if (MintService.shouldThrowError(error)) {
                    logger.error(`submit batch order ${orderId} batch ${batchIndex} mint ${item.mintIndex} item ${item.id} error: ${error}`);
                    throw new Error(error);
                }
                logger.info(`minted batch order ${orderId} batch 0 mint ${item.mintIndex} item ${item.id}`);
                await MintItemMapper.updateItemStatus(item.id, Constants.MINT_STATUS.WAITING, Constants.MINT_STATUS.MINTING);
                return;
            }
            const tx = await MempoolUtil.getTxEx(item.mintHash);
            if (!tx) {
                logger.info(`re-broadcast order ${item.orderId} batch ${batchIndex} item ${item.id} tx ${item.mintHash}`);
                const {error} = await UnisatAPI.unisatPush(item.psbt);
                if (MintService.shouldThrowError(error)) {
                    logger.error(`re-broadcast order ${item.orderId} batch ${batchIndex} item ${item.id} tx ${item.mintHash} error`, error);
                }
                await MintService.tryFixMintItemHash(error, item);
                return;
            }
            if (tx.status.confirmed) {
                await MintItemMapper.updateItemStatus(item.id, Constants.MINT_STATUS.MINTING, Constants.MINT_STATUS.COMPLETED);
            }
        });
    }

    static async batchHandlePartialMergeOrder() {
        const orderList = await MintOrderMapper.getAllOrdersByMintStatus(Constants.MINT_ORDER_STATUS.PARTIAL);
        if (orderList.length === 0) {
            return;
        }

        await BaseUtil.concurrentExecute(orderList, async (order) => {
            logger.putContext({traceId: BaseUtil.genId(), orderId: order.id, mintStatus: Constants.MINT_ORDER_STATUS.PARTIAL});
            try {
                logger.info(`start handle merge order partial ${order.id}`);
                const tx = await MempoolUtil.getTxEx(order.paymentHash);
                if (!tx) {
                    if (!await MintService.checkRbf(order)) {
                        logger.error(`tx ${order.paymentHash} for order ${order.id} not found.`);
                    }
                    return;
                }

                if (!tx.status.confirmed) {
                    return;
                }

                await MintService.submitRemain0(order, tx);
            } catch (err) {
                logger.error(`handle merge order ${order.id} error`, err);
            } finally {
                logger.clearContext();
            }
        });
    }

    static async batchHandleMintingMergeOrder() {
        const orderList = await MintOrderMapper.getAllOrdersByMintStatus(Constants.MINT_ORDER_STATUS.MINTING);
        if (orderList.length === 0) {
            return;
        }

        await BaseUtil.concurrentExecute(orderList, async (order) => {
            logger.putContext({traceId: BaseUtil.genId(), orderId: order.id, mintStatus: Constants.MINT_ORDER_STATUS.MINTING});
            try {
                logger.info(`start handle merge minting order ${order.id}`);
                // 如果只有一个批次，直接检查铸造状态
                if (order.mintAmount <= Constants.MINT_AMOUNT_PER_BATCH) {
                    const tx = await MempoolUtil.getTxEx(order.paymentHash);
                    if (!tx) {
                        if (!await MintService.checkRbf(order)) {
                            logger.error(`tx ${order.paymentHash} for order ${order.id} not found.`);
                        }
                        return;
                    }

                    if (!tx.status.confirmed) {
                        return;
                    }

                    // 检查批次确认状态
                    await MintService.checkMergeOrderBatch(order.id, 0);
                    const completedCount = await MintItemMapper.getCompletedMintCount(order.id);
                    if (completedCount >= order.mintAmount) {
                        logger.info(`completed merge minting order ${order.id}, mint amount: ${order.mintAmount}`);
                        await MintOrderMapper.updateStatus(order.id, Constants.MINT_ORDER_STATUS.MINTING, Constants.MINT_ORDER_STATUS.COMPLETED, completedCount);
                    } else if (completedCount > 0) {
                        await MintOrderMapper.updateCompletedAmount(order.id, completedCount);
                    }
                    return;
                }

                // 多个批次，检查剩下批次的铸造状态
                const batch = BaseUtil.splitByBatchSize(order.mintAmount, Constants.MINT_AMOUNT_PER_BATCH).length;
                const batchIndexes = [];
                for (let i = 0; i < batch; i++) {
                    batchIndexes.push(i);
                }
                await BaseUtil.concurrentExecute(batchIndexes, async index => {
                    await MintService.checkMergeOrderBatch(order.id, index);
                });
                const completedCount = await MintItemMapper.getCompletedMintCount(order.id);
                if (completedCount >= order.mintAmount) {
                    logger.info(`completed merge minting order ${order.id}, mint amount: ${order.mintAmount}`);
                    await MintOrderMapper.updateStatus(order.id, Constants.MINT_ORDER_STATUS.MINTING, Constants.MINT_ORDER_STATUS.COMPLETED, completedCount);
                } else if (completedCount > 0) {
                    await MintOrderMapper.updateCompletedAmount(order.id, completedCount);
                }
            } catch (err) {
                logger.error(`handle merge minting order ${order.id} error`, err);
            } finally {
                logger.clearContext();
            }
        });
    }

    static async updateMintItemByBlock(blockHash) {
        try {
            const txids = await MempoolUtil.getBlockTxIds(blockHash);
            const effectCounts = await BaseUtil.concurrentExecute(BaseUtil.splitArray(txids, 100), async (txids) => {
                return await MintItemMapper.updateItemStatusByTxids(txids, Constants.MINT_STATUS.MINTING, Constants.MINT_STATUS.COMPLETED);
            });
            logger.info(`update mint item by block ${blockHash} effect count: ${effectCounts.reduce((sum, cur) => +cur + sum, 0)}`);
        } catch (err) {
            logger.error(`update mint item by block ${blockHash} error`, err);
        }
    }

    static async handleBroadcastQueue() {
        await BaseUtil.concurrentExecuteQueue(broadcastQueue, async ([items, model]) => {
            await MintService.submitBatchItems(items, model);
        });
    }
    
    static getMintPrivateKey(orderId) {
        return AddressUtil.generatePrivateKeyFromString(`idclub:alkanes:${orderId}`);
    }

}

MintService.handleBroadcastQueue();
