import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371.js";
import config from "../conf/config.js";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils.js";
import MempoolUtils from "../utils/MempoolUtil.js";
import BigNumber from "bignumber.js";
import { ECPairFactory } from "ecpair";
import { all, create } from "mathjs";

import EstimateUtil from "./EstimateUtil.js";
import { value } from "bitcoinjs-lib/src/payments/lazy.js";

const msconfig = {
  number: "number",
  precision: 20,
};
const math = create(all, msconfig);
initEccLib(ecc);

const network = config.network;
export default class LayoutUtil {
  /**
   * 为layout添加资金utxo和找零
   * @param {*} changeAddress
   * @param {*} utxos
   * @param {*} layout
   * @param {*} feerate
   * @param {*} inUtxoLimit
   * @param {*} newChange  为false时，找零加到最后一个输出，为true时，添加一个找零输出
   * @returns 返回修改后的layout
   */
  static async addGasAndChangeForLayout(
    changeAddress,
    utxos,
    layout,
    feerate,
    inUtxoLimit,
    newChange
  ) {
    const estimateGasArgs = EstimateUtil.buildEsimateGasArgs(layout, feerate);
    //测算包含找零所需要的gas
    if (newChange) {
      estimateGasArgs.outs.push({ address: changeAddress });
    }
    let { fee } = EstimateUtil.estimateFee(estimateGasArgs);
    fee = new BigNumber(fee);
    const outValue = new BigNumber(
      layout.outs.reduce((a, b) => a + b.value, 0)
    );
    const inValue = new BigNumber(
      layout.inputs.reduce((a, b) => a + b.value, 0)
    );

    let diff = inValue.minus(outValue);
    let i = 0;

    let fundValue = new BigNumber(0);
    let indexs = [];

    while (diff.comparedTo(fee) < 0 && i < utxos.length && i < inUtxoLimit) {
      const fundUtxo = utxos[i];
      indexs.push(i);
      layout.inputs.push(fundUtxo);
      fundValue = fundValue.plus(new BigNumber(fundUtxo.value));
      diff = diff.plus(new BigNumber(fundUtxo.value));
      const temp = EstimateUtil.inputVSize(
        { address: fundUtxo.address },
        1,
        feerate
      );
      fee = fee.plus(temp.fee);
      i++;
    }

    if (diff.comparedTo(fee) < 0) {
      throw new Error("not enought value");
    }
    let change = 0;
    if (diff.minus(fee).comparedTo(546) >= 0) {
      change = diff.minus(fee).toNumber();
      if (newChange) {
        layout.outs.push({ address: changeAddress, value: change });
      } else {
        layout.outs[layout.outs.length - 1].value += change;
      }
    }
    return { fee, fundValue, indexs, change };
  }

  static async utxo2PsbtInput(utxo) {
    const input = {
      hash: utxo.txid,
      index: utxo.vout,
      value: parseInt(utxo.value),
      address: utxo.address,
    };
    let txHex = utxo.txHex;
    let outScript;
    if (!input.value || !input.address) {
      if (!txHex) {
        txHex = await MempoolUtils.getTxHex(utxo.txid);
      }
      const tx = bitcoin.Transaction.fromHex(txHex);
      input.value = tx.outs[utxo.vout].value;
      outScript = tx.outs[utxo.vout].script;
      input.address = script2Address(outScript);
    }
    if (!outScript) {
      outScript = bitcoin.address.toOutputScript(input.address, network);
    }

    if (
      psbtUtils.isP2TR(outScript) ||
      psbtUtils.isP2WPKH(outScript) ||
      psbtUtils.isP2WSHScript(outScript)
    ) {
      input.witnessUtxo = { script: outScript, value: input.value };
      if (psbtUtils.isP2TR(outScript)) {
        if (utxo.pubkey) {
          input.tapInternalKey = toXOnly(Buffer.from(utxo.pubkey, "hex"));
        }
        if (utxo.tapLeafScript) {
          input.tapLeafScript = utxo.tapLeafScript;
        }
      }
    } else if (psbtUtils.isP2SHScript(outScript)) {
      input.witnessUtxo = { script: outScript, value: input.value };
      if (utxo.pubkey) {
        input.redeemScript = bitcoin.payments.p2wpkh({
          network: network,
          pubkey: Buffer.from(utxo.pubkey, "hex"),
        }).output;
      }
    } else {
      if (!txHex) {
        txHex = await MempoolUtils.getTxHex(utxo.txid);
      }
      input.nonWitnessUtxo = Buffer.from(txHex, "hex");
    }
    return input;
  }

  static async psbtInput2Utxo(psbt, index) {
    const input = psbt.data.inputs[index];
    const vout = psbt.txInputs[index].index;
    let value;
    let script;
    if (input.witnessUtxo) {
      value = input.witnessUtxo.value;
      script = input.witnessUtxo.script;
    } else {
      const prevTx = bitcoin.Transaction.fromBuffer(input.nonWitnessUtxo);
      value = prevTx.outs[vout].value;
      script = prevTx.outs[vout].script;
    }

    const utxo = {
      txid: psbt.txInputs[index].hash.reverse().toString("hex"),
      vout: vout,
      value: value,
      address: script2Address(script),
    };

    if (input.tapInternalKey) {
      utxo.pubkey = input.tapInternalKey.toString("hex");
    }
    if (input.tapLeafScript) {
      utxo.tapLeafScript = input.tapLeafScript;
    }
    return utxo;
  }

  static async buildPsbtForLayout(layout, maximumFeeRate) {
    const psbt = new bitcoin.Psbt({ network, maximumFeeRate });
    for (let input of layout.inputs) {
      psbt.addInput(await LayoutUtil.utxo2PsbtInput(input));
    }
    for (let out of layout.outs) {
      psbt.addOutput(out);
    }
    return psbt;
  }

  static async buildLayoutForPsbt(psbt) {
    const layout = {
      inputs: [],
      outs: [],
    };

    for (let i in psbt.txInputs) {
      layout.inputs.push(await LayoutUtil.psbtInput2Utxo(psbt, i));
    }
    for (let j in psbt.txOutputs) {
      layout.outs.push({
        value: psbt.txOutputs[j].value,
        script: psbt.txOutputs[j].script,
      });
    }
    return layout;
  }
}

function script2Address(output) {
  if (psbtUtils.isP2TR(output)) {
    const { address } = bitcoin.payments.p2tr({ network, output });
    return address;
  } else if (psbtUtils.isP2WPKH(output)) {
    const { address } = bitcoin.payments.p2wpkh({ network, output });
    return address;
  } else if (psbtUtils.isP2SHScript(output)) {
    const { address } = bitcoin.payments.p2sh({ network, output });
    return address;
  } else if (psbtUtils.isP2PKH(output)) {
    const { address } = bitcoin.payments.p2pkh({ network, output });
    return address;
  } else if (psbtUtils.isP2WSHScript(output)) {
    const { address } = bitcoin.payments.p2wsh({ network, output });
    return address;
  } else if (psbtUtils.isP2MS(output)) {
    const { address } = bitcoin.payments.p2ms({ network, output });
    return address;
  } else if (psbtUtils.isP2PK(output)) {
    const { address } = bitcoin.payments.p2pk({ network, output });
    return address;
  }
  throw new BaseError("unknow script");
}
/////////////////////////////////////////////////////////////////////////////////////////////////
