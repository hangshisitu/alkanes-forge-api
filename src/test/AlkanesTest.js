import AlkanesService from "../service/AlkanesService.js";
import BigNumber from "bignumber.js";

console.log(Buffer.from('5cef396374686269408ea9027cb5419cc5f012a4f98c79706b7cd06327838e7d', 'hex').reverse().toString('hex'))
console.log(new BigNumber('0x64').toNumber());

// 查询代币信息
// const alkanes = await AlkanesService.getAlkanesById('2:21629');
// console.log(alkanes);
