import * as bitcoin from "bitcoinjs-lib";
import * as ecc from 'tiny-secp256k1';
import AlkanesAPI from "./lib/AlkanesAPI.js";
import axios from "axios";
import UnisatAPI from "./lib/UnisatAPI.js";

// bitcoin.initEccLib(ecc);
// const scriptPubKey = bitcoin.address.toOutputScript('bc1pl4n6jg8k92m2wym3q4sfvseypnxk00dhgvqycztg5rnuu8rthz2sy4t60g');
// console.log(scriptPubKey.length);

// bc1pnydp9t3epqe2ljtmy4m6n6wa6nzcxcfr25nc656xkgc2x82kufgq8mwgsr
// const script = AlkanesAPI.getMintProtostone('2:60');
// console.log(script.length)

const alkanes = await AlkanesAPI.getAlkanesById('2:60');
console.log(alkanes);

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

// const alkanesList = await AlkanesAPI.getAlkanesByAddress('bc1q2rtajjjpjqnaawac3vaknn7xnp9assrayndulz');
// console.log(alkanesList);

// const message = Buffer.from('0x08c379a0414c4b414e45533a207265766572743a207761736d2060756e726561636861626c656020696e737472756374696f6e206578656375746564'.substr(10), 'hex').toString('utf8')
// console.log(message);
// process.exit(0);

