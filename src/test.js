import axios from "axios";
import UnisatAPI from "./lib/UnisatAPI.js";
import AlkanesAPI from "./lib/AlkanesAPI.js";

// bitcoin.initEccLib(ecc);
// const scriptPubKey = bitcoin.address.toOutputScript('bc1pl4n6jg8k92m2wym3q4sfvseypnxk00dhgvqycztg5rnuu8rthz2sy4t60g');
// console.log(scriptPubKey.length);

// bc1pnydp9t3epqe2ljtmy4m6n6wa6nzcxcfr25nc656xkgc2x82kufgq8mwgsr
// const script = AlkanesAPI.getMintProtostone('2:60');
// console.log(script.length)

// const alkanes = await AlkanesAPI.getAlkanesById('2:28');
// console.log(alkanes);

// await AlkanesAPI.transferMintFee('bc1pd6u5watrxte7z26mgn5nlmstnpcd8uznk8wprkcguc3zedcdlw7shfnlx5', 'bc1pd6u5watrxte7z26mgn5nlmstnpcd8uznk8wprkcguc3zedcdlw7shfnlx5',
//     '2:28', 1, 330, 1);

// const inputList = [{address: 'bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf'}];
// const outputList = [
//     {
//         "address": "bc1pd6u5watrxte7z26mgn5nlmstnpcd8uznk8wprkcguc3zedcdlw7shfnlx5",
//         "value": 330
//     },
//     {
//         "script": AlkanesAPI.getMintProtostone('2:28'),
//         "value": 0
//     }
// ]

// const inputList = [{address: 'bc1pd6u5watrxte7z26mgn5nlmstnpcd8uznk8wprkcguc3zedcdlw7shfnlx5'}];
// const outputList = [{address: 'bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf'}, {address: 'bc1pd6u5watrxte7z26mgn5nlmstnpcd8uznk8wprkcguc3zedcdlw7shfnlx5'}];
// const size = UnisatAPI.estTxSize(inputList, outputList);
// console.log(size);

// 118
// await AlkanesAPI.deployToken('bc1pl4n6jg8k92m2wym3q4sfvseypnxk00dhgvqycztg5rnuu8rthz2sy4t60g', 'bc1pl4n6jg8k92m2wym3q4sfvseypnxk00dhgvqycztg5rnuu8rthz2sy4t60g',
//     'fadsfadsfasdfasdfa', 'fdsafdasfasdf', 10000000, 100000000000000, 100000000000000, 10)

// const alkanesList = await AlkanesAPI.getAlkanesByAddress('bc1pjnhpt2s2aqumr786m0crpw3tl6n43rl04cv74gqckrltgveyf96qvcywcw');
// console.log(alkanesList);

// const message = Buffer.from('0x08c379a0414c4b414e45533a207265766572743a204572726f723a20616c7265616479206d696e74656420666f7220626c6f636b2034313936306430303030303030303030'.substr(10), 'hex').toString('utf8')
// console.log(message);
// process.exit(0);

console.log(Buffer.from('75355ee1bddc44f5ad0d1b2a5043c79c6ee6eeba405a680cb6c02c310ebd0c98', 'hex').reverse().toString('hex'))

// const metegrapUrl = 'https://mainnet.sandshrew.io/v2/lasereyes';
// const idclubUrl = 'https://alkanes-private.idclub.io';
//
// const utxo = {
//     "txid": "4addb062e5e6a858a6eb2566a27b908a0076acdbbb23a8b4d08cb9feee9b8a3b",
//     "vout":1
// };
// const metegrapAlkanes = await parseUtxo(metegrapUrl, utxo);
// // const idclubAlkanes = await parseUtxo(idclubUrl, utxo);
// // 50000000000000
// const idclubAlkanes = [];
// console.log(`utxo: ${JSON.stringify(utxo)} metegrap: ${JSON.stringify(metegrapAlkanes)} idclubAlkanes: ${JSON.stringify(idclubAlkanes)}`);
//
// async function parseUtxo(url, utxo) {
//     const payload = {
//         jsonrpc: "2.0",
//         method: 'alkanes_protorunesbyoutpoint',
//         params: [{
//             txid: Buffer.from(utxo.txid, 'hex').reverse().toString('hex'),
//             vout: utxo.vout,
//             protocolTag: '1',
//         }],
//         id: 1
//     };
//
//     const response = await axios.post(url, payload, {
//         headers: {
//             'content-type': 'application/json',
//         }
//     });
//
//     const result = response.data.result;
//     return result.map((alkane) => ({
//         id: `${parseInt(alkane.token.id.block, 16).toString()}:${parseInt(alkane.token.id.tx, 16).toString()}`,
//         name: alkane.token.name,
//         symbol: alkane.token.symbol,
//         value: parseInt(alkane.value, 16).toString()
//     }));
// }