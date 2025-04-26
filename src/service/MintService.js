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

const mintAmountPerBatch = 25;

export default class MintService {

    static async preCreateMergeOrder(fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate, maxFeerate = 0) {
        const tokenInfo = await TokenInfoMapper.getById(id);
        if (!tokenInfo || tokenInfo.mintActive === 0) {
            throw new Error(`Token ${id} minting is unavailable`);
        }

        const mintProtostone = AlkanesService.getMintProtostone(id, Constants.MINT_MODEL.NORMAL);
        const transferProtostone = AlkanesService.getMintProtostone(id, Constants.MINT_MODEL.MERGE);

        const orderId = BaseUtil.genId();
        const privateKey = AlkanesService.generatePrivateKeyFromString(orderId);
        const mintAddress = AddressUtil.fromP2wpkhAddress(privateKey);

        const mintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: mintAddress}, {script: transferProtostone}]);
        const mintFee = Math.ceil(mintSize * feerate);

        // 第一次Mint在转账交易完成，最后一笔Mint需要重新计算（接收地址类型变化会导致费用不一致）
        const lastMintSize = FeeUtil.estTxSize([{address: mintAddress}], [{address: toAddress}, {script: transferProtostone}]);
        const lastMintFee = Math.ceil(lastMintSize * feerate) + postage;

        const batchList = BaseUtil.splitByBatchSize(mints, mintAmountPerBatch);
        // 检查是否需要加速
        const diffFeerate = maxFeerate - feerate;

        const fundOutputList = [];
        const firstBatchFee = Math.ceil(mintFee * (batchList[0] - 2)) + lastMintFee;
        // 第一组
        fundOutputList.push({
            address: mintAddress,
            value: firstBatchFee
        });

        let totalPrepaid = 0;
        // 继续处理剩余组数
        for (let i = 1; i < batchList.length; i++) {
            let batchMintFee = mintFee * (batchList[i] - 1) + lastMintFee;
            if (diffFeerate > 0.1) {
                // 计算加速所需花费
                const batchMintSize = mintSize * (batchList[i] - 1) + lastMintSize;
                // 如果有预留，需要考虑找零的输出
                const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress);
                const prepaid = Math.ceil(diffFeerate * (batchMintSize + additionalSize));
                batchMintFee += prepaid;

                totalPrepaid += prepaid;
            }

            fundOutputList.push({
                address: mintAddress,
                value: batchMintFee
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
            value: serviceFee
        });

        const transferSize = FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]);

        // 1. 计算可加速部分的总Tx size
        const totalTxSize = mintSize * (batchList[0] - 2) + lastMintSize + transferSize;

        // 2. 计算预存金额
        let prepaid = 0;
        if (diffFeerate > 0.1) {
            // 如果有预留，需要考虑找零的输出
            const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress);
            prepaid = Math.ceil(diffFeerate * (totalTxSize + additionalSize));
        }

        let transferFee = Math.ceil(FeeUtil.estTxSize([{address: fundAddress}], [...fundOutputList, {address: fundAddress}]) * feerate);

        const totalFee = fundOutputList.reduce((sum, output) => sum + output.value, 0);
        const needAmount = totalFee + transferFee + 3000; // 预留3000空间，避免找零
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, needAmount, feerate, true);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        if (utxoList.length > 1) {
            const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress) * utxoList.length - 1;
            prepaid += Math.ceil(additionalSize * diffFeerate);
        }
        fundOutputList[0].value += prepaid;

        totalPrepaid += prepaid;
        let networkFee = fundOutputList.reduce((sum, output) => sum + output.value, 0);
        networkFee = networkFee - totalPrepaid - serviceFee - postage * batchList.length;

        const psbt = await PsbtUtil.createUnSignPsbt(utxoList, fundOutputList, fundAddress, feerate);
        networkFee += psbt.fee;

        const mintOrder = {
            id: orderId,
            model: Constants.MINT_MODEL.MERGE,
            alkanesId: id,
            alkanesName: tokenInfo.name,
            mintAddress: mintAddress,
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
        return psbt;
    }

    static async createMergeOrder(orderId, psbt) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            throw new Error('Not found order, please refresh and try again.');
        }

        const mintTxs = [];
        const {txid, txSize, error} = await UnisatAPI.unisatPush(psbt);
        if (error) {
            throw new Error(error);
        }

        mintTxs.push({
            mintHash: txid,
            txSize: txSize
        });

        const privateKey = AlkanesService.generatePrivateKeyFromString(orderId);
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
            mintStatus: Constants.MINT_STATUS.MINTING
        }];

        const maxMintAmount = Math.min(mintOrder.mintAmount, mintAmountPerBatch);
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
            inputTxid = PsbtUtil.convertPsbtHex(txInfo.hex).txid;

            mintTxs.push({
                mintHash: inputTxid,
                txSize: txInfo.txSize
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

        MintService.submitBatchItems(itemList, Constants.MINT_MODEL.MERGE);

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
        return {
            ...mintOrder,
            mintTxs
        }
    }

    static async preCancelMergeOrder(orderId) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            throw new Error('Not found order, please refresh and try again.');
        }
        if (mintOrder.mintStatus !== Constants.MINT_ORDER_STATUS.PARTIAL) {
            throw new Error('All minting has been broadcast, no refundable amount.');
        }

        const mintTxs = await MintItemMapper.selectMintTxs(orderId, Constants.MINT_STATUS.MINTING);
        if (!mintTxs || mintTxs.length === 0 || mintTxs.length > mintAmountPerBatch) {
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

    static async cancelMergeOrder(orderId) {
        const {mintOrder, inputList, refundValue} = await MintService.preCancelMergeOrder(orderId);
        if (refundValue === 0) {
            throw new Error('No refundable amount.');
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

        const privateKey = AlkanesService.generatePrivateKeyFromString(orderId);
        const {txid, error} = await UnisatAPI.transfer(privateKey, inputList, outputList, mintOrder.mintAddress, 0, false, false);
        if (error) {
            throw new Error(error);
        }

        await MintOrderMapper.updateOrder(orderId, mintOrder.paymentHash, 2, Constants.MINT_ORDER_STATUS.CANCELLED);
        return txid;
    }

    static async accelerateMergeOrder(orderId, feerate) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            throw new Error('Not found order, please refresh and try again.');
        }
        if (mintOrder.status === Constants.MINT_ORDER_STATUS.COMPLETED) {
            throw new Error('Mint is completed, please refresh and try again.');
        }

        const subOrders = await MintItemMapper.selectMintingItems(orderId);
        if (!subOrders || subOrders.length === 0) {
            throw new Error('Mint is completed, please refresh and try again.');
        }

        const privateKey = AlkanesService.generatePrivateKeyFromString(orderId);
        const transferProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.MERGE);

        const mintItems = [];
        for (const subOrder of subOrders) {
            // 检查是否已确认
            const txStatus = await MempoolUtil.getTxStatus(subOrder.mintHash);
            if (txStatus) {
                continue;
            }

            const totalTxSize = subOrder.totalTxSize;
            const maxFeerate = mintOrder.prepaid / totalTxSize + mintOrder.feerate;
            if (feerate > maxFeerate) {
                throw new Error(`Exceeding the maximum accelerator rate: ${maxFeerate}`);
            }

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
            }

            const txInfo = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(privateKey), [inputUtxo], outputList, mintOrder.paymentAddress, mintOrder.feerate, false, false);
            const txid = PsbtUtil.convertPsbtHex(txInfo.hex).txid;
            console.log(`accelerate order ${orderId} ${subOrder.batchIndex} ${txid}`);
            mintItems.push({
                id: subOrder.id,
                mintHash: PsbtUtil.convertPsbtHex(txInfo.hex).txid,
                psbt: txInfo.hex,
            });

            // 如果第一批未结束，其他暂不需要加速
            if (subOrder.batchIndex === 0) {
                break;
            }
        }

        await sequelize.transaction(async (transaction) => {
            await MintItemMapper.batchUpdateHash(mintItems, {transaction});
            await MintOrderMapper.updateOrderFeerate(orderId, feerate, {transaction});
        });

        const itemList = await MintItemMapper.getMintItemsByOrderId(orderId); // 如果第一批没确认, 则取到的是第一批, 如果确认了, 取到的是后面的N批
        
        const groupedItems = {};
        for (const item of itemList) {
            if (!groupedItems[item.batchIndex]) {
                groupedItems[item.batchIndex] = [];
            }
            groupedItems[item.batchIndex].push(item);
        }
        
        for (const batchIndex in groupedItems) {
            MintService.submitBatchItems(groupedItems[batchIndex].sort((a, b) => a.mintIndex - b.mintIndex), Constants.MINT_MODEL.MERGE, true);
        }
    }

    static async submitBatchItems(items, model = Constants.MINT_MODEL.MERGE, ignoreStatus = false) {
        if (model === Constants.MINT_MODEL.MERGE) { // 顺序广播
            for (const item of items) {
                const { orderId, batchIndex, mintIndex } = item;
                if (!ignoreStatus && item.mintStatus !== Constants.MINT_STATUS.WAITING) {
                    continue;
                }
                const {error} = await UnisatAPI.unisatPush(item.psbt);
                if (MintService.shouldThrowError(error)) {
                    console.error(`submit batch order ${orderId} batch ${batchIndex} mint ${mintIndex} item ${item.id} error: ${error}`);
                    throw new Error(error);
                }
                console.log(`minted batch order ${orderId} batch ${batchIndex} mint ${mintIndex} item ${item.id}`);
                await MintItemMapper.updateItemStatus(item.id, Constants.MINT_STATUS.WAITING, Constants.MINT_STATUS.MINTING);
            }
        } else if (model === Constants.MINT_MODEL.NORMAL) { // 并发广播
            await BaseUtil.concurrentExecute(items, async item => {
                if (!ignoreStatus && item.mintStatus !== Constants.MINT_STATUS.WAITING) {
                    return;
                }
                const {error} = await UnisatAPI.unisatPush(item.psbt);
                if (MintService.shouldThrowError(error)) {
                    console.error(`submit batch order ${item.orderId} item ${item.id} error: ${error}`);
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
            let totalItemList = [];
            if (mintOrder.status === Constants.MINT_ORDER_STATUS.PARTIAL) {
                const orderId = mintOrder.id;
                const batchList = BaseUtil.splitByBatchSize(mintOrder.mintAmount, mintAmountPerBatch);
                const totalItemList = [];
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
                    await MintOrderMapper.updateOrder(orderId, mintOrder.paymentHash, Math.min(mintOrder.submittedAmount + totalItemList.length, mintOrder.mintAmount), Constants.MINT_ORDER_STATUS.MINTING, {transaction, acceptStatus: Constants.MINT_STATUS.PARTIAL});
                    await MintItemMapper.bulkUpsertItem(totalItemList, {transaction});
                });
            } else {
                totalItemList = await MintItemMapper.getMintItemsByOrderId(mintOrder.id);
                totalItemList = totalItemList.filter(item => item.batchIndex > 0);
            }
            
            const groupedItems = {};
            for (const item of totalItemList) {
                if (!groupedItems[item.batchIndex]) {
                    groupedItems[item.batchIndex] = [];
                }
                groupedItems[item.batchIndex].push(item);
            }
            
            for (const batchIndex in groupedItems) {
                MintService.submitBatchItems(groupedItems[batchIndex].sort((a, b) => a.mintIndex - b.mintIndex), Constants.MINT_MODEL.MERGE);
            }
            
            const mintingItems = totalItemList.filter(item => item.mintStatus === Constants.MINT_STATUS.MINTING);
            if (mintingItems.length > 0) {
                const results = await BaseUtil.concurrentExecute(mintingItems, async (item) => {
                    try {
                        const txStatus = await MempoolUtil.getTxStatus(item.mintHash);
                        return {
                            id: item.id,
                            status: txStatus
                        }
                    } catch(e) {
                        return {
                            id: item.id,
                            status: false
                        }
                    }
                });
                const completedItemIds = [];
                for (const result of results) {
                    if (result.status) {
                        completedItemIds.push(result.id);
                    }
                }
                if (completedItemIds.length > 0) {
                    await MintItemMapper.updateItemStatus(completedItemIds, Constants.MINT_STATUS.MINTING, Constants.MINT_STATUS.COMPLETED);
                }
            }
            const completedMintCount = MintItemMapper.getCompletedMintCount(mintOrder.id);
            if (completedMintCount >= mintOrder.mintAmount) {
                await MintOrderMapper.updateStatus(mintOrder.id, Constants.MINT_ORDER_STATUS.MINTING, Constants.MINT_ORDER_STATUS.COMPLETED);
            }
        }, {
            throwErrorIfFailed: false
        });
    }

    static async submitRemain(orderId) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder || mintOrder.status === Constants.MINT_ORDER_STATUS.COMPLETED) {
            return;
        }

        const tx = await MempoolUtil.getTx(mintOrder.paymentHash);
        if (!tx.status.confirmed) {
            console.log(`order ${orderId} payment tx ${mintOrder.paymentHash} not confirmed.`);
            return;
        }

        await MintService.submitRemain0(mintOrder, tx);
    }

    static async submitBatch(mintOrder, inputUtxo, batchIndex, mintAmount) {
        const mintAddress = mintOrder.mintAddress;
        const privateKey = AlkanesService.generatePrivateKeyFromString(mintOrder.id);
        const mintProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.NORMAL);
        const transferProtostone = AlkanesService.getMintProtostone(mintOrder.alkanesId, Constants.MINT_MODEL.MERGE);

        let fundValue = inputUtxo.value;
        let inputTxid = inputUtxo.txid;
        const itemList = [];
        for (let i = 0; i < mintAmount; i++) {
            const vout =  i === 0 ? inputUtxo.vout : 0;
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
            inputTxid = PsbtUtil.convertPsbtHex(txInfo.hex).txid;

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
                mintStatus: Constants.MINT_STATUS.MINTING
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

    static async batchHandleMergeOrder() {
        let minId = 0;
        while (true) {
            // 分页获取状态处于MINTING和PARTIAL的订单
            const orderList = await MintOrderMapper.getMintingOrders(minId, 100);
            if (orderList.length === 0) {
                break;
            }
            minId = orderList[orderList.length - 1].id;
            await BaseUtil.concurrentExecute(orderList, async (order) => {
                try {
                    const tx = await MempoolUtil.getTx(order.paymentHash);
                    if (!tx.status.confirmed) {
                        return;
                    }
                    if (order.mintAmount <= mintAmountPerBatch) {
                        await MintItemMapper.updateStatusByOrderId(order.id, Constants.MINT_STATUS.MINTING, Constants.MINT_STATUS.COMPLETED);
                        await MintOrderMapper.updateStatus(order.id, Constants.MINT_ORDER_STATUS.MINTING, Constants.MINT_ORDER_STATUS.COMPLETED);
                        return;
                    }
                    if (order.mintStatus === Constants.MINT_ORDER_STATUS.PARTIAL) {
                        await MintService.submitRemain0(order, tx);
                    }
                } catch(err) {
                    console.error(`handle merge order ${order.id} first batch error: ${err}`);
                }
            });
        }
        
    }

}