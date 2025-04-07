import AlkanesService from "./service/AlkanesService.js";
import MarketService from "./service/MarketService.js";
import * as bitcoin from "bitcoinjs-lib";
import PsbtUtil from "./utils/PsbtUtil.js";
import BigNumber from "bignumber.js";

const assetAddress = 'bc1pnydp9t3epqe2ljtmy4m6n6wa6nzcxcfr25nc656xkgc2x82kufgq8mwgsr';
const assetPublicKey = '034fee79e4f2401b558727527b6e3ac8753772c184e1fd05a9948a93412af552ad';
const fundAddress = 'bc1qa0n0vfqzxmyjj5wyw4qhmu5q9nvc54sstg2wmq';
const fundPublicKey = '021f5115cc6c98b12db4832b8490e1afbbe29664ac3bb1c575153f6c70ead7ed1c';
// const alkanesList = await AlkanesService.getAlkanesByTarget('bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf', '2:28', 5 * 100000000 * 1e8);
// console.log(alkanesList);

// const assetUtxo = {
//     txid: '0c58a7a3b88ff2ca7043c092373437923822a536dd0346f11b27c426ec8356c7',
//     vout: 0,
//     value: 330,
//     address: 'bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf'
// }
// const unsignedListingPsbt = await MarketService.genUnsignedListing(assetUtxo, 'bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf', '034015870024aac759c6089e4d2cc00e338608f4ff819f4433b42040e5a4cadce7', 'bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf', 10000);
// console.log(unsignedListingPsbt);

// const signedListingPsbt = '70736274ff0100520200000001c75683ec26c4271bf14603dd36a522389237343792c04370caf28fb8a3a7580c0000000000ffffffff0110270000000000001600143369178e4af536e1dfd06ad8075048f59b7923fc000000000001011f4a010000000000001600143369178e4af536e1dfd06ad8075048f59b7923fc01086b024730440220078eb4e1753a59ab32da3f2f7b43189f40bfa8e7941ccdc9022c7df61f27ff37022034c4aa219995ec91c9e2bbddaf10ce4031244f74ca077a9866f1500ac504a61c8321034015870024aac759c6089e4d2cc00e338608f4ff819f4433b42040e5a4cadce70000';
// const psbt = await MarketService.genUnsignedBuying('2:28', 100000000, signedListingPsbt, fundAddress, fundPublicKey, assetAddress, 1);
// console.log(psbt)

// const psbt = await AlkanesService.transferToken('bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf', '034015870024aac759c6089e4d2cc00e338608f4ff819f4433b42040e5a4cadce7', 'bc1qxd530rj275mwrh7sdtvqw5zg7kdhjgluv33cqf', assetAddress, '2:28', 69999999450000000, 1);
// console.log(psbt);

//100000000+550000000
// const alkanesList = await AlkanesService.getAlkanesByAddress('bc1q2rtajjjpjqnaawac3vaknn7xnp9assrayndulz');
// console.log(alkanesList);

// const alkanes = await AlkanesService.getAlkanesByUtxo({
//     txid: 'd60814e0d3b337bbe8d5d92aebac5509eec4a84e7d17a69dcfcef85bc7cd9453',
//     vout: 0
// });
// console.log(alkanes);

// console.log(Buffer.from('d60814e0d3b337bbe8d5d92aebac5509eec4a84e7d17a69dcfcef85bc7cd9453', 'hex').reverse().toString('hex'))
// console.log(new BigNumber('0xd529ae7dbdaa80').toNumber());
// console.log(new BigNumber('0x20c85580').toNumber());

// 查询代币信息
// const alkanes = await AlkanesService.getAlkanesById('2:110');
// console.log(alkanes);