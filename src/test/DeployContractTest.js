import * as bitcoin from "bitcoinjs-lib";
import * as fs from "fs";
import * as zlib from "zlib";
import { promisify } from "util";
import * as alkanes from "alkanes";
import * as ecc from "tiny-secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371.js";
import * as varuint_bitcoin from "varuint-bitcoin/index.js";
import config from "../conf/config.js";
import * as psbtUtils from "bitcoinjs-lib/src/psbt/psbtutils.js";
import MempoolUtils from "../utils/MempoolUtil.js";
import * as util from "util";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341.js";
import BigNumber from "bignumber.js";
import { ECPairFactory } from "ecpair";
import { all, create } from "mathjs";
import axios from "axios";
import AlkanesRPCUtil from "../utils/AlkanesRPCUtil.js";

const msconfig = {
  number: "number",
  precision: 20,
};
const math = create(all, msconfig);

initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const gzip = promisify(zlib.gzip);

const network = config.network;

export async function deploy(
  wasm_path,
  private_key,
  utxos,
  accept_address,
  feerate,
  calldata
) {
  const changeAddress = utxos[0].address;

  // 读取WASM文件
  const wasmBuffer = fs.readFileSync(wasm_path);

  // 使用gzip压缩，压缩级别为9
  const compressedWasm = await gzip(wasmBuffer, { level: 9 });

  const chunkSize = 520;
  let contents = [];
  for (let i = 0; i < compressedWasm.length; i += chunkSize) {
    let end = Math.min(i + chunkSize, compressedWasm.length);
    contents.push(compressedWasm.slice(i, end).toString("hex"));
  }

  const callData = [];
  for (let i = 0; i < calldata.length; i++) {
    callData.push(BigInt(calldata[i]));
  }

  const protostone = alkanes.encodeRunestoneProtostone({
    protostones: [
      alkanes.ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: alkanes.encipher(callData),
      }),
    ],
  }).encodedRunestone;

  const keyPair = ECPair.fromPrivateKey(Buffer.from(private_key, "hex"));
  console.info(`pubkey ${keyPair.publicKey.toString("hex")}`);
  const internalPubkey = toXOnly(keyPair.publicKey);

  let scriptASM = `${internalPubkey.toString(
    "hex"
  )} OP_CHECKSIG OP_0 OP_IF ${Buffer.from("BIN", "ascii").toString(
    "hex"
  )} OP_0`;
  for (let i = 0; i < contents.length; i++) {
    scriptASM += " " + contents[i];
  }
  scriptASM += ` OP_ENDIF`;

  const script = bitcoin.script.fromASM(scriptASM);
  const scriptTree = { output: script };
  const redeem = {
    output: script,
    redeemVersion: LEAF_VERSION_TAPSCRIPT,
  };

  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalPubkey,
    scriptTree,
    redeem,
    network: config.network,
  });

  let commitTxId = "";
  let commitValue = 0;

  const revealLayout = {
    inputs: [
      {
        txid: commitTxId,
        vout: 0,
        value: commitValue,
        address: payment.address,
        witnessSize: [32, payment.witness[0].length],
      },
    ],
    outs: [
      {
        address: accept_address,
        value: 546,
      },
      {
        script: protostone,
        value: 0,
      },
    ],
  };

  const { fee, feeRate } = estimateFeeEx(revealLayout, feerate);
  commitValue = 546 + fee;

  const commitLayout = {
    inputs: [],
    outs: [
      {
        address: payment.address,
        value: commitValue,
      },
    ],
  };

  await addGasAndChangeForLayout(
    changeAddress,
    utxos,
    commitLayout,
    feerate,
    5,
    true
  );

  //   console.info(`commitLayout ${JSON.stringify(commitLayout)}`);
  const commitPsbt = await buildPsbtForLayoutEx(commitLayout, feerate * 1.25);

  //   console.info(`commitPsbt ${commitPsbt.toBase64()}`);

  try {
    commitPsbt.signAllInputs(keyPair);
  } catch (e) {
    console.error(`signAllInputs error ${e}`);
    try {
      const tweakedChildNode = keyPair.tweak(
        bitcoin.crypto.taggedHash("TapTweak", internalPubkey)
      );
      commitPsbt.signAllInputs(tweakedChildNode);
    } catch (e2) {
      console.error(`signAllInputs error ${e2}`);
      throw new Error(`signAllInputs error ${e2}`);
    }
  }

  const commitTx = commitPsbt.finalizeAllInputs().extractTransaction();
  commitTxId = commitTx.getId();
  //   console.info(`commitTxId: ${commitTxId} hex: ${commitTx.toHex()}`);
  revealLayout.inputs[0].txid = commitTxId;
  revealLayout.inputs[0].value = commitValue;
  revealLayout.inputs[0].tapLeafScript = [
    {
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: redeem.output,
      controlBlock: payment.witness[payment.witness.length - 1],
    },
  ];

  const revealPsbt = await buildPsbtForLayoutEx(revealLayout, feerate * 1.25);

  revealPsbt.signAllInputs(keyPair);
  const revealTx = revealPsbt.finalizeAllInputs().extractTransaction();
  //   console.info(`revealTxId: ${revealTx.getId()} hex: ${revealTx.toHex()}`);

  const ret = await postTx(commitTx.toHex());
  console.info(`ret: ${ret} }`);

  const ret2 = await postTx(revealTx.toHex());
  console.info(`ret: ${ret2} }`);
  return ret2;
}

/////////////////////////////////////////////////////////////////////////////////////////////////

export function scriptType(output) {
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
      bitcoin.address.toOutputScript(input.address, config.network)
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

export function estimateFeeEx(layout, feerate) {
  const eestimateGasArgs = buildEsimateGasArgs(layout, feerate);
  return estimateFee(eestimateGasArgs);
}

export function estimateFee(params) {
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

export function inputVSize(input, count, feerate) {
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

export function outputVSize(output, count, feerate) {
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

export function buildEsimateGasArgs(layout, feerate) {
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

/**
 * 为layout添加资金utxo和找零
 * @param {*} changeAddress
 * @param {*} utxos
 * @param {*} layout
 * @param {*} inUtxoLimit
 * @returns
 */
export async function addGasAndChangeForLayout(
  changeAddress,
  utxos,
  layout,
  feerate,
  inUtxoLimit,
  newChange
) {
  console.info(`utxos ${JSON.stringify(utxos)}}`);
  const estimateGasArgs = buildEsimateGasArgs(layout, feerate);
  //测算包含找零所需要的gas
  estimateGasArgs.outs.push({ address: changeAddress });
  console.info(`estimateGasArgs ${util.inspect(estimateGasArgs)}`);
  let { fee } = estimateFee(estimateGasArgs);
  fee = new BigNumber(fee);
  const outValue = new BigNumber(layout.outs.reduce((a, b) => a + b.value, 0));
  const inValue = new BigNumber(layout.inputs.reduce((a, b) => a + b.value, 0));

  let diff = inValue.minus(outValue);
  let i = 0;

  console.info(`diff ${diff}`);

  let fundValue = new BigNumber(0);
  let indexs = [];

  while (diff.comparedTo(fee) < 0 && i < utxos.length && i < inUtxoLimit) {
    console.info(`i ${i} diff ${diff} fee ${fee}`);
    const fundUtxo = utxos[i];
    indexs.push(i);
    layout.inputs.push(fundUtxo);
    fundValue = fundValue.plus(new BigNumber(fundUtxo.value));
    diff = diff.plus(new BigNumber(fundUtxo.value));
    const temp = inputVSize({ address: fundUtxo.address }, 1, feerate);
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

export async function utxo2PsbtInputEx(utxo) {
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
    outScript = bitcoin.address.toOutputScript(input.address, config.network);
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
        network: config.network,
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

export async function buildPsbtForLayoutEx(layout, maximumFeeRate) {
  const psbt = new bitcoin.Psbt({ network, maximumFeeRate });
  for (let input of layout.inputs) {
    psbt.addInput(await utxo2PsbtInputEx(input));
  }
  for (let out of layout.outs) {
    psbt.addOutput(out);
  }
  return psbt;
}

async function postTx(hex) {
  try {
    const response = await axios.post(`https://btc-regtest.idclub.io/tx`, hex, {
      headers: {
        "Content-Type": "text/plain",
      },
      timeout: 10000,
    });
    return response.data;
  } catch (err) {
    const errMessage = err.response?.data || err.message;
    throw new Error(errMessage);
  }
}

//////////////////////////////////////////////////////////////////////////
// Bitcoin
// const privateKey = '';
// const fundAddress = '';
// const assetAddress = '';

// Signet
// const privateKey = '1cc961af8496bb359fcbf153e8a8bb9ee12526a6935f83c468214b9a9ad88036';
// const fundAddress = 'tb1q7cm226kawhkl7squl3ry2ag5lugd008udughfj';
// const assetAddress = 'tb1pgj543ehekkfmwwfpwkhu2wkemwe0cp0e73vljy9wlqh9cdddqpyslj4q0c';

// Regtest
const privateKey =
  "59d13ae37fc4729b1d0c6c8bf623f821aedbf02f0cf1a561c855edfc58cbefb5";
const fundAddress = "bcrt1q235uy7hre5k780xynpsm96mjwngtv8ywjzjjd0";
const assetAddress =
  "bcrt1q235uy7hre5k780xynpsm96mjwngtv8ywjzjjd0";

const utxos = [
  {
    txid: "984a7512d3d8f5f56fafb50b508e88d7309bbd18393b4a9ecf75a5e8e9fcd1f4",
    vout: 0,
    value: 5000000000,
    address: fundAddress,
  },
];
// const wasm_path = "/Users/moffat/code/alkanes-protocol/alkanes-nft-contract/alkanes-image/target/wasm32-unknown-unknown/release/alkanes_image.wasm";
// const wasm_path = "/Users/moffat/code/alkanes-protocol/alkanes-nft-contract/alkanes-collection/target/wasm32-unknown-unknown/release/alkanes_collection.wasm";
const wasm_path =
  "/Users/liuqiwen/workspace/idclub/alkanes-forge/target/alkanes/wasm32-unknown-unknown/release/staking_pool.wasm";
const feerate = 1.4;
// const calldata = [1, 0];
const calldata = [3, 111114];
// const txid = await deploy(
//   wasm_path,
//   privateKey,
//   utxos,
//   assetAddress,
//   feerate,
//   calldata
// );
const txid=Buffer.from("2602158232d6bf6d53f987f21836bb94479413e1655057524b6c3cbf6bfb97d3","hex").reverse().toString("hex");
const trace = await AlkanesRPCUtil.trace(txid, 3);

console.info(`ret: ${util.inspect(trace)}`);
