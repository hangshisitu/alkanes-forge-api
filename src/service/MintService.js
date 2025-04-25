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

export default class MintService {

    static async preCreateMergeOrder(fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate, maxFeerate = 0) {
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

        const batchList = BaseUtil.splitByBatchSize(mints, 25);
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
        const serviceFee = Math.max(Math.min(300 * mints, 5000), 1000);
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

        const totalFee = mints * mintFee + transferFee + serviceFee + prepaid;
        const utxoList = await UnisatAPI.getUtxoByTarget(fundAddress, totalFee + 3000, feerate, true);
        utxoList.map(utxo => utxo.pubkey = fundPublicKey);

        if (utxoList.length > 1) {
            const additionalSize = FeeUtil.getAdditionalOutputSize(fundAddress) * utxoList.length - 1;
            prepaid += Math.ceil(additionalSize * diffFeerate);
        }
        fundOutputList[0].value += prepaid;

        totalPrepaid += prepaid;
        const mintOrder = {
            id: orderId,
            model: Constants.MINT_MODEL.MERGE,
            alkanesId: id,
            mintAddress: mintAddress,
            paymentAddress: fundAddress,
            receiveAddress: toAddress,
            feerate: feerate,
            latestFeerate: feerate,
            maxFeerate: maxFeerate || feerate,
            prepaid: totalPrepaid,
            change: totalPrepaid,
            postage: postage,
            mintAmount: mints,
            mintStatus: Constants.MINT_ORDER_STATUS.UNPAID
        }
        await MintOrderMapper.createOrder(mintOrder);

        const psbt = await PsbtUtil.createUnSignPsbt(utxoList, fundOutputList, fundAddress, feerate);
        psbt.orderId = orderId;
        return psbt;
    }

    static async createMergeOrder(orderId, psbt) {
        const mintOrder = await MintOrderMapper.getById(orderId);
        if (!mintOrder) {
            throw new Error('Not found order, please refresh and try again.');
        }

        const txidList = [];
        const paymentHash = await UnisatAPI.unisatPush(psbt);
        txidList.push(paymentHash);

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

        let inputTxid = paymentHash;
        const itemList = [{
            id: BaseUtil.genId(),
            orderId: orderId,
            inputUtxo: `${paymentUtxo.txid}:${paymentUtxo.vout}:${paymentUtxo.value}`,
            batchIndex: 0,
            mintIndex: 0,
            receiveAddress: receiveAddress,
            txSize: BaseUtil.divCeil(originalTx.weight(), 4),
            mintHash: paymentHash,
            mintStatus: Constants.MINT_STATUS.MINTING
        }];

        const maxMintAmount = Math.min(mintOrder.mintAmount, 25);
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

            const {txid, txSize} = await UnisatAPI.transfer(privateKey, [inputUtxo], outputList, mintAddress, mintOrder.feerate, config.network, false, false);
            console.log(`mint index ${i} tx: ${txid}`);
            txidList.push(txid);
            inputTxid = txid;

            itemList.push({
                id: BaseUtil.genId(),
                orderId: orderId,
                inputUtxo: `${inputUtxo.txid}:${inputUtxo.vout}:${inputUtxo.value}`,
                txSize: txSize,
                batchIndex: 0,
                mintIndex: i,
                receiveAddress: receiveAddress,
                mintHash: inputTxid,
                mintStatus: Constants.MINT_STATUS.MINTING
            });
        }

        const submittedAmount = txidList.length;
        const mintStatus = submittedAmount === mintOrder.mintAmount ? Constants.MINT_ORDER_STATUS.MINTING : Constants.MINT_ORDER_STATUS.PARTIAL;
        await MintOrderMapper.updateOrder(orderId, paymentHash, submittedAmount, mintStatus);
        await MintItemMapper.bulkUpsertItem(itemList);

        return {
            txidList,
            submittedAmount,
            mintStatus
        };
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
        const txidList = [];

        const mintItems = [];
        for (const subOrder of subOrders) {
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

            const {txid} = await UnisatAPI.transfer(privateKey, [inputUtxo], outputList, mintOrder.paymentAddress, mintOrder.feerate, config.network, false, false);
            console.log(`accelerate order ${orderId} ${subOrder.batchIndex} ${txid}`);
            txidList.push(txid);

            mintItems.push({
                id: subOrder.id,
                mintHash: txid
            });

            // 如果第一批未结束，其他暂不需要加速
            if (subOrder.batchIndex === 0) {
                break;
            }
        }

        await MintItemMapper.batchUpdateHash(mintItems);
        await MintOrderMapper.updateOrderFeerate(orderId, feerate);
        return txidList;
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

        // 提交剩余的交易
        const batchList = BaseUtil.splitByBatchSize(mintOrder.mintAmount, 25);
        let totalItemList = [];
        for (let i = 1; i < batchList.length; i++) {
            const inputUtxo = {
                txid: mintOrder.paymentHash,
                vout: i,
                value: tx.vout[i].value
            };
            const itemList = await MintService.submitBatch(mintOrder, inputUtxo, i, batchList[i]);
            console.log(`submit the ${i} batch of ${itemList.length}/${batchList[i]} mints.`);
            totalItemList.push(...itemList);
        }

        const totalMints = mintOrder.submittedAmount + totalItemList.length;
        const mintStatus = totalMints === mintOrder.mintAmount ? Constants.MINT_ORDER_STATUS.MINTING : Constants.MINT_ORDER_STATUS.PARTIAL;
        await MintOrderMapper.updateOrder(orderId, mintOrder.paymentHash, mintOrder.submittedAmount + totalItemList.length, mintStatus);
        await MintItemMapper.bulkUpsertItem(totalItemList);
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

            const {txid, txSize} = await UnisatAPI.transfer(privateKey, [mintUtxo], outputList, mintAddress, mintOrder.feerate, config.network, false, false);
            console.log(`mint the ${batchIndex} batch of index ${i} tx: ${txid}`);
            inputTxid = txid;

            itemList.push({
                id: BaseUtil.genId(),
                orderId: mintOrder.id,
                inputUtxo: `${mintUtxo.txid}:${mintUtxo.vout}:${mintUtxo.value}`,
                txSize: txSize,
                batchIndex: 0,
                mintIndex: i,
                receiveAddress: receiveAddress,
                mintHash: inputTxid,
                mintStatus: Constants.MINT_STATUS.MINTING
            });
        }
        return itemList;
    }
}