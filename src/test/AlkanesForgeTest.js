import * as util from "util";
import * as alkanes from "alkanes";
import {ProtoruneRuneId} from 'alkanes/lib/protorune/protoruneruneid.js'
import {u128, u32} from '@magiceden-oss/runestone-lib/dist/src/integer/index.js';
import AlkanesRPCUtil from "../utils/AlkanesRPCUtil.js";
import LayoutUtil from "../utils/LayoutUtil.js";
import ElectrsUtil from "../utils/electrsUtil.js";
import EstimateUtil from "../utils/EstimateUtil.js";
import config from "../conf/config.js";

import * as ecc from "tiny-secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import { initEccLib } from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371.js";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341.js";

initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const privateKey =
  "59d13ae37fc4729b1d0c6c8bf623f821aedbf02f0cf1a561c855edfc58cbefb5";
const fundAddress = "bcrt1q235uy7hre5k780xynpsm96mjwngtv8ywjzjjd0";
// const assetAddress =
//   "bcrt1p0jsqa0azdhjs2lda60exs4kdm9ez4xmc28sf0fxxvhu4724w2qqsypumgm";
const assetAddress = "bcrt1q235uy7hre5k780xynpsm96mjwngtv8ywjzjjd0";

const sp_aid = "2:4";
const feerate = 2;

const coin_aid = await AlkanesRPCUtil.queryString(sp_aid, [1003]);
console.info(`coin_alkanes_id: ${coin_aid}`);

console.info(
  `pool balance: ${await AlkanesRPCUtil.queryString(sp_aid, [1004])}`
);

console.info(
  `collection identifier: ${await AlkanesRPCUtil.queryString(sp_aid, [998])}`
);

console.info(
  `get data : ${await AlkanesRPCUtil.queryString(sp_aid, [1000, 1])}`
);

console.info(
  `encode u128 : ${encodeU128(BigInt(5000000000000)).toString("hex")}`
);

console.info(
  `encode staking : ${encodeStaking(
    1,
    5000000000000,
    30000,
    360,
    "191c9a279745a8a1f2781984b8b6dd1f2c0a4d65a70504d9fc78032e9fb894d8",
    "0:0",
    447
  ).toString("hex")}`
);

function bigintReplacer(key, value) {
  if (typeof value === 'bigint') {
    return value.toString(); // 转为字符串
    // 或 return Number(value); // 若数值在安全范围内，转为数字
  }
  return value;
}

// console.info(`address protoruns: ${JSON.stringify(await AlkanesRPCUtil.protorunesbyaddress(assetAddress),bigintReplacer)}`);

const authUtxo ={txid:'8a9f02391b6e5e130ca46b40cb648a4934ea0e7638c69c1819435526850fef05',vout:1}
console.info(`protoruns: 
  ${JSON.stringify(
    await AlkanesRPCUtil.protorunesbyoutpoint(
      Buffer.from(authUtxo.txid,'hex').reverse().toString('hex'),authUtxo.vout),bigintReplacer)}`);
//未到开始高度，报错
//为没有auth token 报错
// await staking(
//   0,
//   50000000000,
//   20000,
//   30,
//   "191c9a279745a8a1f2781984b8b6dd1f2c0a4d65a70504d9fc78032e9fb894d8",
//   "0:0",
//   452
// );

// await staking(
//   0,
//   50000000000,
//   30000,
//   60,
//   "191c9a279745a8a1f2781984b8b6dd1f2c0a4d65a70504d9fc78032e9fb894d8",
//   "0:0",
//   454
// );


console.info(
  `orbital attributes: ${await AlkanesRPCUtil.queryString("2:6", [1002])}`
);

console.info(
  `orbital profit: ${await AlkanesRPCUtil.queryString(sp_aid, [53,1,922])}`
);

console.info(
  `orbital profit: ${await AlkanesRPCUtil.queryString("2:6", [1003,922])}`
);

await claim("2:6",{
  txid: "8a9f02391b6e5e130ca46b40cb648a4934ea0e7638c69c1819435526850fef05",
  vout: 0,
  value: 546,
  address: assetAddress
})

// await unstaking(
//   "2:2211",
//   {
//     txid: "4bfe8991483496855e26ec07d77b2221e37a14f367f017f38f3a5d501a7d7b04",
//     vout: 0,
//     value: 546,
//     address: assetAddress
//   }
// )

function encodeStaking(
  brc20_index,
  brc20_value,
  staking_value,
  period,
  txid,
  invite_aid,
  height
) {
  const buffer = Buffer.alloc(1 + 16 + 16 + 2 + 32 + 16 + 16 + 8);
  let offset = 0;
  buffer.writeUInt8(brc20_index, offset);
  offset += 1;

  encodeU128(BigInt(brc20_value)).copy(buffer, offset);
  offset += 16;

  encodeU128(BigInt(staking_value)).copy(buffer, offset);
  offset += 16;

  buffer.writeUInt16LE(period, offset);
  offset += 2;

  Buffer.from(txid, "hex").copy(buffer, offset);
  offset += 32;

  const temp = invite_aid.split(":");
  encodeU128(BigInt(temp[0])).copy(buffer, offset);
  offset += 16;

  encodeU128(BigInt(temp[1])).copy(buffer, offset);
  offset += 16;

  buffer.writeBigUInt64LE(BigInt(height), offset);

  return buffer;
}

function encodeU128(v) {
  const buffer = Buffer.alloc(16);
  const v_1 = v & BigInt("0xffffffffffffffff");
  const v_2 = v >> 64n;
  buffer.writeBigUInt64LE(v_1, 0);
  buffer.writeBigUInt64LE(v_2, 8);
  return buffer;
}
async function staking(
  brc20_index,
  brc20_value,
  staking_value,
  period,
  txid,
  invite_aid,
  height
) {
  const playload = encodeStaking(
    brc20_index,
    brc20_value,
    staking_value,
    period,
    txid,
    invite_aid,
    height
  );
  const temp = sp_aid.split(":");
  const callData = [BigInt(temp[0]), BigInt(temp[1]), 50n];
  const edict = {
    id: new ProtoruneRuneId(
        u128(BigInt(temp[0])),
        u128(BigInt(temp[1]))
    ),
    amount: u128(BigInt(1)),
    output: u32(BigInt(1)),
  }

  const protostone = alkanes.encodeRunestoneProtostone({
    protostones: [
      alkanes.ProtoStone.message({
        protocolTag: 1n,
        edicts: [edict],
        pointer: 0,
        refundPointer: 1,
        calldata: alkanes.encipher(callData),
      }),
    ],
  }).encodedRunestone;

  const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"));
  const internalPubkey = toXOnly(keyPair.publicKey);

  let scriptASM = `${internalPubkey.toString(
    "hex"
  )} OP_CHECKSIG OP_0 OP_IF ${Buffer.from("BIN", "ascii").toString(
    "hex"
  )} OP_0 ${playload.toString("hex")} OP_ENDIF`;

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
      {
        txid: authUtxo.txid,
        vout: authUtxo.vout,
        value: 546,
        address: assetAddress,
      }
    ],
    outs: [
      {
        value:546,
        address: assetAddress,  //accept authToken
      },
      {
        value: 546,
        address: assetAddress,
      },
      {
        value: 0,
        script: protostone,
      },
    ],
  };

  const { fee } = EstimateUtil.estimateFeeEx(revealLayout, feerate);
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

  let utxos = await ElectrsUtil.getUtxos(fundAddress);
  utxos.sort((a, b) => b.value - a.value);

  await LayoutUtil.addGasAndChangeForLayout(
    fundAddress,
    utxos,
    commitLayout,
    feerate,
    1,
    true
  );

  const commitPsbt = await LayoutUtil.buildPsbtForLayout(
    commitLayout,
    feerate * 1.25
  );

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

  revealLayout.inputs[0].txid = commitTxId;
  revealLayout.inputs[0].value = commitValue;
  revealLayout.inputs[0].tapLeafScript = [
    {
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: redeem.output,
      controlBlock: payment.witness[payment.witness.length - 1],
    },
  ];

  const revealPsbt = await LayoutUtil.buildPsbtForLayout(
    revealLayout,
    feerate * 1.25
  );

  revealPsbt.signAllInputs(keyPair);
  const revealTx = revealPsbt.finalizeAllInputs().extractTransaction();

  const commit_txid = await ElectrsUtil.postTx(commitTx.toHex());
  console.info(`staking commit txid: ${commit_txid}`);

  const reveal_txid = await ElectrsUtil.postTx(revealTx.toHex());
  console.info(`staking reveal txid: ${reveal_txid}`);
}

async function claim(
  orbId,
  authUtxo
){

  const temp = orbId.split(":");
  const callData = [BigInt(temp[0]), BigInt(temp[1]), 1005n];
  const edict = {
    id: new ProtoruneRuneId(
        u128(BigInt(temp[0])),
        u128(BigInt(temp[1]))
    ),
    amount: u128(BigInt(1)),
    output: u32(BigInt(1)),
  }

  const protostone = alkanes.encodeRunestoneProtostone({
    protostones: [
      alkanes.ProtoStone.message({
        protocolTag: 1n,
        edicts: [edict],
        pointer: 0,
        refundPointer: 1,
        calldata: alkanes.encipher(callData),
      }),
    ],
  }).encodedRunestone;

  const layout = {inputs:[
    authUtxo
  ],outs:[{
    address: assetAddress,  //accept nft 
    value: 546,
  },{
    address: assetAddress,
    value: 546,
  },{
    script: protostone,
    value: 0,
  }]}

  console.info(`layout: ${JSON.stringify(layout)}`)
  let utxos = await ElectrsUtil.getUtxos(fundAddress);
  utxos.sort((a, b) => b.value - a.value);

  await LayoutUtil.addGasAndChangeForLayout(fundAddress,utxos,layout,2,1,true);

  const psbt =await LayoutUtil.buildPsbtForLayout(layout,2.25);
  const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"));
  psbt.signAllInputs(keyPair);
  const tx = psbt.finalizeAllInputs().extractTransaction();

  const txid = await ElectrsUtil.postTx(tx.toHex());
  console.info(`claim txid: ${txid}`);
}

async function unstaking(
  orbId,
  authUtxo){
  const temp = orbId.split(":");
  const callData = [BigInt(temp[0]), BigInt(temp[1]), 1004n];
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

  const layout = {inputs:[
    authUtxo
  ],outs:[{
    address: assetAddress,  //accept nft 
    value: 546,
  },{
    script: protostone,
    value: 0,
  }]}

  console.info(`layout: ${JSON.stringify(layout)}`)
  let utxos = await ElectrsUtil.getUtxos(fundAddress);
  utxos.sort((a, b) => b.value - a.value);

  await LayoutUtil.addGasAndChangeForLayout(fundAddress,utxos,layout,2,1,true);

  const psbt =await LayoutUtil.buildPsbtForLayout(layout,2.25);
  const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"));
  psbt.signAllInputs(keyPair);
  const tx = psbt.finalizeAllInputs().extractTransaction();

  const txid = await ElectrsUtil.postTx(tx.toHex());
  console.info(`unstaking txid: ${txid}`);
}