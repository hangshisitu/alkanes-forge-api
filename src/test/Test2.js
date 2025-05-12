import {encipher, encodeRunestoneProtostone, ProtoStone} from "alkanes";
import UnisatAPI from "../lib/UnisatAPI.js";
import AddressUtil from "../lib/AddressUtil.js";

const fundAddress = 'tb1q235uy7hre5k780xynpsm96mjwngtv8ywsttl6x';
const fundPrivateKey = '59d13ae37fc4729b1d0c6c8bf623f821aedbf02f0cf1a561c855edfc58cbefb5';

const assetsAddress = 'tb1p0jsqa0azdhjs2lda60exs4kdm9ez4xmc28sf0fxxvhu4724w2qqsfckaap';
const assetsPrivateKey = '971aa3000d1f2b80ac820a7af2ff756164ed48f6b55821524780ee4b29f352b7';

await mint('2:960');
// await transferBTC();

async function mint(id) {
    const protostone = getMintProtostone(id, 1, 69);

    const inputList = [];
    inputList.push({
        txid: '22a21b1ce264b98430ff65d7705491e0708e5f82d4b33383466b78d9a7d0eecc',
        vout: 0,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: '551c4e57916154156a823ce5ef6fd47af41dc3c1766021ea968a2ba06816485f',
        vout: 1,
        value: 14121094,
        address: fundAddress,
        privateKey: fundPrivateKey
    })

    const outputList = [];
    outputList.push({
        address: assetsAddress,
        value: 546
    })
    outputList.push({
        script: protostone,
        value: 0
    })

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 1.5, false, true);
    console.log(psbt)
}

function getMintProtostone(id, transferAmount, opcode) {
    const protostones = [];
    const calldata = [BigInt(id.split(':')[0]), BigInt(id.split(':')[1]), BigInt(opcode), BigInt(100)];
    protostones.push(ProtoStone.message({
        protocolTag: 1n,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
    }));

    return encodeRunestoneProtostone({
        protostones: protostones,
    }).encodedRunestone;
}

async function transferBTC() {
    const privateKey = '1cc961af8496bb359fcbf153e8a8bb9ee12526a6935f83c468214b9a9ad88036';
    const address = 'tb1q7cm226kawhkl7squl3ry2ag5lugd008udughfj';
    const utxoList = await UnisatAPI.getUtxoList(address);
    const filterUtxoList = utxoList.filter(utxo => utxo.value > 546);

    const outputList = [];
    for (let i = 0; i < 100; i++) {
        outputList.push({
            address: address,
            value: 350000
        })
    }
    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(privateKey), filterUtxoList, outputList, address, 1.2, false, true);
    console.log(psbt)
}