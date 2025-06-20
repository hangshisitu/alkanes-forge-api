import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import * as varuint_bitcoin from "varuint-bitcoin/index.js";
import config from "../conf/config.js";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils.js";
import * as util from "util";
import { all, create } from "mathjs";

const msconfig = {
  number: "number",
  precision: 20,
};
const math = create(all, msconfig);

initEccLib(ecc);

const network = config.network;

export default class EstimateUtil {
  static estimateFeeEx(layout, feerate) {
    const eestimateGasArgs = EstimateUtil.buildEsimateGasArgs(layout, feerate);
    return EstimateUtil.estimateFee(eestimateGasArgs);
  }

  static buildEsimateGasArgs(layout, feerate) {
    const estimateGasArgs = { ins: [], outs: [], feerate };
    for (const input of layout.inputs) {
      estimateGasArgs.ins.push({
        address: input.address,
        script: input.script,
        witness: input.witness,
        witnessSize: input.witnessSize,
        scriptSize: input.scriptSize,
      });
    }
    for (const output of layout.outs) {
      estimateGasArgs.outs.push({
        address: output.address,
        script: output.script,
      });
    }
    return estimateGasArgs;
  }

  static estimateFee(params) {
    let ins = [];
    let outs = [];
    for (const input of params.ins) {
      ins.push({
        scriptSize: calcInSize(input),
        witness: calcWitnessSize(input),
      });
    }
    for (const output of params.outs) {
      outs.push({ scriptSize: calcOutSize(output) });
    }

    console.info(`ins:${util.inspect(ins)} outs: ${util.inspect(outs)}`);
    const base = byteLength(ins, outs, false);
    const total = byteLength(ins, outs, true);
    const weight = base * 3 + total;
    const virtualSize = Math.ceil(weight / 4);
    const fee = Math.ceil(virtualSize * params.feerate);
    console.info(
      `weight ${weight} virtualSize ${virtualSize} feerate ${params.feerate} fee ${fee}`
    );
    return { weight, virtualSize, feerate: params.feerate, fee };
  }

  static inputVSize(input, count, feerate) {
    const scriptSize = calcInSize(input);
    const witness = calcWitnessSize(input);
    const base = 40 + varuint_bitcoin.encodingLength(scriptSize) + scriptSize;
    const total = base + witness ? vectorSize(witness) : 0;
    const weight = base * 3 + total;
    const virtualSize = Math.ceil(weight / 4);
    return {
      vSize: virtualSize * count,
      fee: Math.ceil(virtualSize * count * feerate),
      feerate,
    };
  }

  static outputVSize(output, count, feerate) {
    const scriptSize = calcOutSize(output);
    const base = 8 + varuint_bitcoin.encodingLength(scriptSize) + scriptSize;
    const total = base;
    const weight = base * 3 + total;
    const virtualSize = Math.ceil(weight / 4);
    return {
      vSize: virtualSize * count,
      fee: Math.ceil(virtualSize * count * feerate),
      feerate,
    };
  }
}


/////////////////////////////////////////////////////////////////////////////////////////////////

//不同输出类型，标准脚本大小
const OutScriptSize = {
  P2PKH: 25,
  P2SH: 23,
  P2SH_P2WPKH: 23,
  P2SH_P2WSH: 23,
  V0_P2WPKH: 22,
  V0_P2WSH: 34,
  V1_P2TR: 34,
};

//不同类型输入，标准脚本大小
const InputScriptSize = {
  P2PKH: 106,
  P2SH: 22, //这个类型没有标准size,需要根据具体脚本计算，但是大部分这是其实是P2SH_P2WPKH，所以设置为22
  P2SH_P2WPKH: 22,
  P2SH_P2WSH: 34,
  V0_P2WPKH: 0,
  V0_P2WSH: 0,
  V1_P2TR: 0,
};

//不同类型输入, 参考见证数据大小
const WitnessSize = {
  P2PKH: null,
  P2SH: [71, 33], //这个类型没有标准size,需要根据具体脚本计算，但是大部分这是其实是P2SH_P2WPKH
  P2SH_P2WPKH: [71, 33],
  P2SH_P2WSH: null,
  V0_P2WPKH: [71, 33],
  V0_P2WSH: null,
  V1_P2TR: [64], //这个是用私钥花费的情况
};

function scriptType(output) {
  if (psbtUtils.isP2TR(output)) {
    return "V1_P2TR";
  } else if (psbtUtils.isP2WPKH(output)) {
    return "V0_P2WPKH";
  } else if (psbtUtils.isP2SHScript(output)) {
    return "P2SH";
  } else if (psbtUtils.isP2PKH(output)) {
    return "P2PKH";
  } else if (psbtUtils.isP2WSHScript(output)) {
    return "V0_P2WSH";
  } else if (psbtUtils.isP2MS(output)) {
    return "P2MS";
  } else if (psbtUtils.isP2PK(output)) {
    return "P2PK";
  }
  return "UNKNOW";
}

function vectorSize(someVector) {
  if (someVector == null || someVector.length == 0) {
    return 0;
  }

  const length = someVector.length;
  return (
    varuint_bitcoin.encodingLength(length) +
    someVector.reduce((sum, witnessSize) => {
      return sum + varuint_bitcoin.encodingLength(witnessSize) + witnessSize;
    }, 0)
  );
}

function byteLength(ins, outs, allowWitness) {
  let hasWitnesses = false;
  for (let i = 0; i < ins.length; i++) {
    if (ins[i].witness && ins[i].witness.length > 0) {
      hasWitnesses = true;
      break;
    }
  }

  const witnessFlag = hasWitnesses && allowWitness;
  let byteLength = witnessFlag ? 10 : 8;
  byteLength += varuint_bitcoin.encodingLength(ins.length);
  byteLength += varuint_bitcoin.encodingLength(outs.length);
  byteLength += ins.reduce((sum, input) => {
    return (
      sum +
      40 +
      varuint_bitcoin.encodingLength(input.scriptSize) +
      input.scriptSize
    );
  }, 0);
  byteLength += outs.reduce((sum, output) => {
    return (
      sum +
      8 +
      varuint_bitcoin.encodingLength(output.scriptSize) +
      output.scriptSize
    );
  }, 0);
  if (witnessFlag) {
    byteLength += ins.reduce((sum, input) => {
      return sum + vectorSize(input.witness);
    }, 0);
  }
  return byteLength;
}

//计算输出脚本大小
function calcOutSize(output) {
  if (output.script) {
    return output.script instanceof Buffer
      ? output.script.length
      : Buffer.from(output.script, "hex").length;
  }

  if (output.scriptSize) {
    return output.scriptSize;
  }

  if (output.address) {
    const script = bitcoin.address.toOutputScript(
      output.address,
      config.network
    );
    return script.length;
  }

  if (output.addressType) {
    return OutScriptSize[output.addressType];
  }
}

//计算输入脚本大小
function calcInSize(input) {
  //   logger.debug(`input ${util.inspect(input)}`);
  if (input.script) {
    return input.script instanceof Buffer
      ? input.script.length
      : Buffer.from(input.script, "hex").length;
  }

  if (input.scriptSize != null) {
    return input.scriptSize;
  }

  if (input.address) {
    const addressType = scriptType(
      bitcoin.address.toOutputScript(input.address, network)
    );
    return InputScriptSize[addressType];
  }

  if (input.addressType) {
    return InputScriptSize[input.addressType];
  }
}

//计算见证数据大小
function calcWitnessSize(input) {
  if (input.witness && input.witness.length > 0) {
    return input.wintness.map((w) =>
      w instanceof Buffer ? w.length : Buffer.from(w, "hex").length
    );
  }

  if (input.witnessSize && input.witnessSize.length > 0) {
    return input.witnessSize;
  }

  const addressType =
    input.addressType ||
    scriptType(bitcoin.address.toOutputScript(input.address, network));
  return WitnessSize[addressType];
}
