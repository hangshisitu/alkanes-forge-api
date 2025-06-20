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

const fundPrivateKey = '';
const fundAddress = AddressUtil.fromP2wpkhAddress(fundPrivateKey, config.network);

const assetsPrivateKey = '';
const assetsAddress = AddressUtil.fromP2trAddress(assetsPrivateKey, config.network);

const paymentAddress = 'bcrt1pnshlsqyrmph299qq3spk0vcmuwu9cwgewufgce4mssgpf6cf06qsfv2h2g';

await authMint('2:27559');
// await publicMint('2:18');
// await setTaprootAddress('2:30', paymentAddress);
// await btcMint('2:19', 5);
// await merkleBtcMint('2:312', 1);
// await merkleAlkanesMint('2:4154', 2);
// await publicBtcMint('2:312', 1);

// await withdrawAlkanes('2:5662');

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
    // 350 NFT
    inputList.push({
        txid: 'a22609dec82d7da8a113b686cf1a3b1a0549ca112e86e5654f34e401bdb55fad',
        vout: 1,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: 'b0204838807c1e0d9a5c8c6d059c0295b76c71cdedf43ad52527cb825ff5d435',
        vout: 3,
        value: 280127 ,
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
        txid: '4eba530ec7d424676948321671963d9ca6b5ccbab65617eafe9873eee699195e',
        vout: 1,
        value: 4999774942,
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
        value: 9000 * mints
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
    const acceptAddress = 'bcrt1pcxtayjycmzmnmdgzqsg40ev92v57hajpmxlnwfszptl4c9uchx0q5wa50u';
    const keyPair = AddressUtil.convertKeyPair(fundPrivateKey);
    const proof = "3d470c90d833d0b89915e4d9136ef3e86e02414000c2b11db7cbdd2a385290b2f2fe4792dff9f8708e364c0b6a0d370f056afd94cc50cf062b81bbf48ed0a9b94155ad61988044737e0d35f62f0cc12fcb300b2ad1b8413e8d85693b72c265ead1465e4798ee0884054efedafc61b1b1e2bd410dd0cb19aa6488b16fcf0408fae3dba764a01271fa39ccb26564f1dbeddfb2d5965dab6674974c79644770ea9a693086f854e079e27f16ed42ebabed08b1389af31f939f34603645ebfa16a76274d1680d0f9474055560a43caf1a2f0bcc9eadf284c043f3585735c758a09aaa70af1ad52d7f0a0e3461f54a131b6cdbc2ec8b1695ae13335d59628ecd8aaef7fa51c1d274830cdc4054221412513dc913e3622b4863fd1854cae56426b7e680fbd8080f3d76e4a8261f3cb0ff866accac693d71572b99719d264214129e70ab849589224b52d00308431f1e8a56f1cde687039df5e47c64a930f963e6c393f7";
    const payment = generatePayment(
        keyPair.publicKey.toString('hex'),
        acceptAddress,
        579,
        proof
    );

    const psbt = new bitcoin.Psbt({network: config.network});

    const commitTxHash = "67b85e11e408210060c26e399a014f1a8d301bdd9ea71c3d4138afd806d86dab";
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
        value: 9000 * mints
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

    const limit = 1;
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
        calldata.push(BigInt(133));
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
        txid: 'f677b0b3e14e6fac169b1466d27adcc7760228f8c388445941b88925c307dd34',
        vout: 1,
        value: 4998923076,
        address: fundAddress,
        privateKey: fundPrivateKey
    }];

    const outputList = [];
    for (let i = 0; i < 1; i++) {
        outputList.push({
            address: 'bcrt1phy3k82xkwxuvqch8a894jzady8ajka3mshhpqx9yx64afeqyx9zqq57exd',
            value: 100000
        })
    }
    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), filterUtxoList, outputList, fundAddress, 10, false, true);
    console.log(psbt)
}

// await transferAlkanes();
async function transferAlkanes() {
    const protostone = AlkanesService.getTransferProtostone('', []);

    const inputList = [];
    inputList.push({
        txid: '7b6c23623d7e43c8eeaaf2526b2526306c7ddf6214e8b4fc4bf9a0eacd2df2d5',
        vout: 0,
        value: 546,
        address: assetsAddress,
        privateKey: assetsPrivateKey
    })
    inputList.push({
        txid: '2471cf8a740b393a04487626dd81f1d66f991f7628a2a5454f5c147e711a6679',
        vout: 1,
        value: 259088,
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

    const psbt = await UnisatAPI.createPsbt(AddressUtil.convertKeyPair(fundPrivateKey), inputList, outputList, fundAddress, 180, false, true);
    console.log(psbt)
}