import {encipher, encodeRunestoneProtostone, ProtoStone} from "alkanes";
import UnisatAPI from "../lib/UnisatAPI.js";
import AddressUtil from "../lib/AddressUtil.js";
import {u128, u32} from '@magiceden-oss/runestone-lib/dist/src/integer/index.js';
import {ProtoruneRuneId} from 'alkanes/lib/protorune/protoruneruneid.js'
import * as bitcoin from 'bitcoinjs-lib';
import config from "../conf/config.js";
import {toXOnly} from "bitcoinjs-lib/src/psbt/bip371.js";
import {LEAF_VERSION_TAPSCRIPT} from "bitcoinjs-lib/src/payments/bip341.js";
import AlkanesService from "../service/AlkanesService.js";

const fundAddress = 'tb1q235uy7hre5k780xynpsm96mjwngtv8ywsttl6x';
const fundPrivateKey = '59d13ae37fc4729b1d0c6c8bf623f821aedbf02f0cf1a561c855edfc58cbefb5';
console.log(AddressUtil.fromP2wpkhAddress(fundPrivateKey, config.network))

const assetsAddress = 'tb1p0jsqa0azdhjs2lda60exs4kdm9ez4xmc28sf0fxxvhu4724w2qqsfckaap';
const assetsPrivateKey = '971aa3000d1f2b80ac820a7af2ff756164ed48f6b55821524780ee4b29f352b7';
console.log(AddressUtil.fromP2trAddress(assetsPrivateKey, config.network))

const paymentAddress = 'bcrt1pgtjuh9rsy45zmel7ymee65ncpzp6a67gy5tn00w5kvacdmsrwfrs5kw0aa';

// await authMint('2:5662');
// await publicMint('2:18');
// await setTaprootAddress('2:30', paymentAddress);
// await btcMint('2:19', 5);
// await merkleBtcMint('2:4052', 2);
// await merkleAlkanesMint('2:4154', 2);
// await publicBtcMint('2:4052', 2);

await withdrawAlkanes('2:5662');

async function withdrawAlkanes(id) {
    const protostone = getWithdrawProtostone(id, 80);

    const inputList = [];
    inputList.push({
        txid: 'e7b53538ecc8661f7336956a6c134e58a8c391c6938f6c9bc9e3c2b6ec9ef2fe',
        vout: 1,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: 'e7b53538ecc8661f7336956a6c134e58a8c391c6938f6c9bc9e3c2b6ec9ef2fe',
        vout: 3,
        value: 6603753 ,
        address: fundAddress,
        privateKey: fundPrivateKey
    })

    const outputList = [];
    outputList.push({
        address: assetsAddress,
        value: 546
    })
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

async function authMint(id) {
    const protostone = getMintProtostone(id, 69);

    const inputList = [];
    inputList.push({
        txid: 'e7b53538ecc8661f7336956a6c134e58a8c391c6938f6c9bc9e3c2b6ec9ef2fe',
        vout: 1,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: 'e7b53538ecc8661f7336956a6c134e58a8c391c6938f6c9bc9e3c2b6ec9ef2fe',
        vout: 3,
        value: 6603753 ,
        address: fundAddress,
        privateKey: fundPrivateKey
    })

    const outputList = [];
    outputList.push({
        address: assetsAddress,
        value: 546
    })
    outputList.push({
        address: assetsAddress,
        value: 546
    })
    outputList.push({
        script: protostone,
        value: 0
    })

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 10, false, true);
    console.log(psbt)
}

async function publicBtcMint(id, mints) {
    const protostone = getMintProtostone(id, 78);

    const inputList = [];
    inputList.push({
        txid: 'c5a9214c2ae2f579ede893c1e4c4f6d711fab0cf1ab42d22b2da1d466d09c0f5',
        vout: 3,
        value: 4999887754,
        address: fundAddress,
        privateKey: fundPrivateKey
    })


    const outputList = [];
    outputList.push({
        address: assetsAddress,
        value: 546
    })
    outputList.push({
        address: paymentAddress,
        value: 10000 * mints
    })
    outputList.push({
        script: protostone,
        value: 0
    })

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 1.5, true, true);
    console.log(psbt)
}

async function btcMint(id, mints) {
    const protostone = getMintProtostone(id, 78);

    const inputList = [];
    inputList.push({
        txid: '43118bf655bdd0bd40db220e24a32941e330d653443f0e3e4eb30bea6782c3d7',
        vout: 1,
        value: 4999964990,
        address: fundAddress,
        privateKey: fundPrivateKey
    })

    const outputList = [];
    outputList.push({
        address: assetsAddress,
        value: 546
    })
    outputList.push({
        address: paymentAddress,
        value: 100000 * mints
    })
    outputList.push({
        script: protostone,
        value: 0
    })

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 1.5, true, true);
    console.log(psbt)
}

async function merkleBtcMint(id, mints) {
    const acceptAddress = 'tb1pgtjuh9rsy45zmel7ymee65ncpzp6a67gy5tn00w5kvacdmsrwfrse0yfg8';
    const keyPair = AddressUtil.convertKeyPair(fundPrivateKey);
    const proof = "50875cd1d1b23fcaa8c74c48240b4e127c280b6ea458b7fbc5684b17d6970eef0e616ab98cfbdec930a1bab2463bb9d54fa27131ec9024905f8c3b0cbdbcae043e2f570d66ade4df67bd3629e1fd8da79e08b210db0ca941067dbe638f99b375ed2fdd181cbb3a458bff4100b86ed2da04536294e6a8d52817a050eef850bfe5a60a3ec2fb79b177d683fac7013f850c33764df3fcf568a936990facf5b540efbd4f9391e6d20fb824f6d202a633e5d1fee8c8ba507a232524cd5fa7a4dd158a40f419cd88f9a51780c558a4cfa1a91c050b774263f4e06fc3a2d50a10a05520dd222922872c889908d18699aca714264513106866be952e37bb74ef9f6563e5c9c5c1cfc0d0dd4992e3964e85b26558a025c8bf53a2ba1077ba3b3d391ed439d0d462b9b6a89c8b5de14275608873e98e7df40e7a5c84dfe465addf047c6005";
    const payment = generatePayment(
        keyPair.publicKey.toString('hex'),
        acceptAddress,
        550,
        proof
    );

    const psbt = new bitcoin.Psbt({network: config.network});

    const commitTxHash = "ac31aedd030ae92eb3041d0c7323dbd8c92d0d1a82e651d40dbaa65bcd01a96f";
    const commitTxVout = 0;
    const commitTxOutValue = 100000;
    psbt.addInput({
        hash: commitTxHash,
        index: commitTxVout,
        witnessUtxo: {
            script: payment.output,
            value: commitTxOutValue,
        },
        internalPubkey: payment.internalPubkey,
        tapLeafScript: [
            {
                leafVersion: LEAF_VERSION_TAPSCRIPT,
                script: payment.redeem.output,
                controlBlock: payment.witness[payment.witness.length - 1],
            },
        ],
    });

    psbt.addOutput({
        address: acceptAddress,
        value: 546
    });
    psbt.addOutput({
        address: paymentAddress,
        value: 10000 * mints
    });

    const protostone = getMintProtostone(id, 78);
    psbt.addOutput({
        script: protostone,
        value: 0
    });

    psbt.signInput(0, keyPair);
    psbt.finalizeAllInputs();
    console.log(psbt.extractTransaction().toHex());
}

async function merkleAlkanesMint(id, mints) {
    const acceptAddress = 'tb1q2s3mrssshglep9vvjhs7aty4zs75nn6p2hypfw';
    const keyPair = AddressUtil.convertKeyPair(fundPrivateKey);
    const proof = "b490272154d76e2cc52c931104d17a612574e21618bffa80a606f7e07f6c1d5bccd96b4e805c13a0efc8fad6d98f2f124366b7fbeb0b3922e1ce5c05153a7921aca95b73737d9bccb9b3868d2ff9034b3ce6829538838be9c29d5cb6cc9f99cc14ab3250a12da13064d2d2ee64fd56cfaa3b17bdd59c712cd162e6050ee736da1d9511dda51a2c22b78dd8c483ecfaa9cf717d4b17f83ee7752aff6b3894ce7ad2b3f845932f03c02ed1f13f7e07b11e2cb3e62a8145c3c5900fef13fd9bdaa1ceccdf78bf43e6e8110823b513bd28feed6f7c5068686fae2ab10ddf8993e87d4cc53d69871656d2966ae09a585b44bb8516014b4604a5b99dc781749f2480b669615394cad8f880bc1f9ef829cbb4ae00c15b4b50fa5f3e39204a7122990cf7839cfdc96816c495fcb26979059a161e9cc38261296090ced8ff4cddd04554b1";
    const payment = generatePayment(
        keyPair.publicKey.toString('hex'),
        acceptAddress,
        437,
        proof
    );

    // 先将付款的Alkanes资产转入到脚本地址
    // const taprootAddress = payment.address;
    // const transferPsbt = await sendAlkanes('2:2', mints * 100, taprootAddress);
    // console.log(transferPsbt);

    const psbt = new bitcoin.Psbt({network: config.network});

    const commitTxHash = "bf5e40168333c4314a08ce97ffc68c92e6f3b8c66703c6e86ca4deaf6a9ba381";
    const commitTxVout = 1;
    const commitTxOutValue = 10000;
    psbt.addInput({
        hash: commitTxHash,
        index: commitTxVout,
        witnessUtxo: {
            script: payment.output,
            value: commitTxOutValue,
        },
        internalPubkey: payment.internalPubkey,
        tapLeafScript: [
            {
                leafVersion: LEAF_VERSION_TAPSCRIPT,
                script: payment.redeem.output,
                controlBlock: payment.witness[payment.witness.length - 1],
            },
        ],
    });

    psbt.addOutput({
        address: acceptAddress,
        value: 546
    });

    const protostone = getMintProtostone(id, 77);
    psbt.addOutput({
        script: protostone,
        value: 0
    });

    psbt.signInput(0, keyPair);
    psbt.finalizeAllInputs();
    console.log(psbt.extractTransaction().toHex());
}

async function sendAlkanes(id, amount, address) {
    const protostone = AlkanesService.getBatchTransferProtostone([{id, amount, output: 1}]);

    const inputList = [];
    inputList.push({
        txid: '012fdf51224c6bafdedf73a7541d6300b04e0bca8e9b15442538d70f1cb75042',
        vout: 0,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: 'c34df769e4f8c00785774838f5c66a5a269fb7ab61be000887ec8c9094401f8b',
        vout: 2,
        value: 11877721,
        address: fundAddress,
        privateKey: fundPrivateKey
    })

    const outputList = [];
    outputList.push({
        address: assetsAddress,
        value: 546
    })
    outputList.push({
        address: address,
        value: 10000
    })
    outputList.push({
        script: protostone,
        value: 0
    })

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 25, true, true);
    console.log(psbt)
}

function generatePayment(pubkey, acceptAddress, index, proof) {
    const internalPubkey = toXOnly(Buffer.from(pubkey, "hex"));
    const acceptOutputScript = bitcoin.address.toOutputScript(
        acceptAddress,
        config.network
    );

    //把index按小端子节序转成4字节的buffer
    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(index, 0);

    const length = acceptOutputScript.length + 16 + proof.length / 2
    const lengthBuffer = Buffer.alloc(2);
    lengthBuffer.writeUInt16LE(length, 0);

    const limit = 5;
    const limitBuffer = Buffer.alloc(4);
    limitBuffer.writeUInt32LE(limit, 0);

    let scriptASM = `${internalPubkey.toString('hex')} OP_CHECKSIG OP_0 OP_IF ${Buffer.from('BIN', 'ascii').toString("hex")} ${lengthBuffer.toString('hex')} ${acceptOutputScript.toString("hex")}${indexBuffer.toString("hex")}${limitBuffer.toString("hex")}${proof} OP_ENDIF`;

    const script = bitcoin.script.fromASM(scriptASM);
    const scriptTree = {output: script};
    const redeem = {
        output: script,
        redeemVersion: LEAF_VERSION_TAPSCRIPT,
    };

    return bitcoin.payments.p2tr({
        internalPubkey: internalPubkey,
        scriptTree,
        redeem,
        network: config.network,
    });
}

async function setTaprootAddress(id, address) {
    const protostone = getAddressProtostone(id, address);

    const inputList = [];
    inputList.push({
        txid: '7c955ef25d2dd01e3f715b4d51fce4fc13a0d5ce7877dcdafa19625e4bcc1398',
        vout: 0,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: '4cb3249bef8f51cb6778e4ff136f0812c872068b78eb9d431f23d34a32f5fd14',
        vout: 1,
        value: 1247113792,
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

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 1.5, true, true);
    console.log(psbt)
}

function getMintProtostone(id, opcode) {
    const protostones = [];
    const calldata = [BigInt(id.split(':')[0]), BigInt(id.split(':')[1]), BigInt(opcode)];

    const edicts = [];
    if (opcode === 69) {
        calldata.push(BigInt(100));
        edicts.push({
            id: new ProtoruneRuneId(
                u128(BigInt(id.split(':')[0])),
                u128(BigInt(id.split(':')[1]))
            ),
            amount: u128(BigInt(0)),
            output: u32(BigInt(1)),
        });
    }

    // if (opcode === 77) {
    //     edicts.push({
    //         id: new ProtoruneRuneId(
    //             u128(BigInt(2)),
    //             u128(BigInt(2))
    //         ),
    //         amount: u128(BigInt(0)),
    //         output: u32(BigInt(0)),
    //     });
    // }

    protostones.push(ProtoStone.message({
        protocolTag: 1n,
        edicts: edicts,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
    }));

    return encodeRunestoneProtostone({
        protostones: protostones,
    }).encodedRunestone;
}

function getWithdrawProtostone(id) {
    const protostones = [];
    const calldata = [BigInt(id.split(':')[0]), BigInt(id.split(':')[1]), BigInt(80)];

    const edicts = [];
    edicts.push({
        id: new ProtoruneRuneId(
            u128(BigInt(id.split(':')[0])),
            u128(BigInt(id.split(':')[1]))
        ),
        amount: u128(BigInt(0)),
        output: u32(BigInt(1)),
    });

    protostones.push(ProtoStone.message({
        protocolTag: 1n,
        edicts: edicts,
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
    }));

    return encodeRunestoneProtostone({
        protostones: protostones,
    }).encodedRunestone;
}

function getAddressProtostone(id, address) {
    const protostones = [];
    const calldata = [BigInt(id.split(':')[0]), BigInt(id.split(':')[1]), BigInt(81)];

    const data = addressToU128Parts(address);
    calldata.push(...data);

    protostones.push(ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(calldata),
    }));

    return encodeRunestoneProtostone({
        protostones: protostones,
    }).encodedRunestone;
}

function addressToU128Parts(address) {
    const script = bitcoin.address.toOutputScript(address, config.network);

    const seg1 = script.subarray(2, 12)
    const seg2 = script.subarray(12, 22)
    const seg3 = script.subarray(22, 34)

    return [BigInt('0x' + seg1.toString('hex')), BigInt('0x' + seg2.toString('hex')), BigInt('0x' + seg3.toString('hex'))];
}

// await transferBTC();

async function transferBTC() {
    const filterUtxoList = [{
        txid: '59f848e1d01adc910815f5251f66f69699ce4ce43954dad06f4269feaa25df56',
        vout: 2,
        value: 11916043,
        address: fundAddress,
        privateKey: fundPrivateKey
    }];

    const outputList = [];
    for (let i = 0; i < 5; i++) {
        outputList.push({
            address: 'tb1pf0mm2gdyc6890h0z7kejqw24uvek6kr4hg95dt8s543y52hwutaq42cwhx',
            value: 100000
        })
    }
    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), filterUtxoList, outputList, fundAddress, 10, false, true);
    console.log(psbt)
}