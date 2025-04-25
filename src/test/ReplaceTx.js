import axios from "axios";
import AlkanesService from "../service/AlkanesService.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import * as bitcoin from "bitcoinjs-lib";

const txid = '698193b187352cf1961498ee8238047b2ce6cba81478fd6339e46dd12058a5a5';
const response = await axios.get(`https://idclub.mempool.space/api/tx/${txid}`);
const oldTx = response.data;

const pubkeyMap = new Map();
pubkeyMap.set('bc1px7r88gq643zpe34wtz0snl70qkd3ett7j3gjypym686npsn474ls2jh4k9', '03e2a0f730e75138773aeaedd4a56ad1c4dec9abdd3b86053c046e9a51bb123325');
pubkeyMap.set('bc1qlhf6xqe8jw53lsl2ptf4kkdmy9ms0qa5p75ryg', '03d5670fb960ad023f552c762e1608a422155f2d1157a0bcc9200e4a26eb0ecc42');

const inputList = [];
oldTx.vin.forEach(input => {
    const pubkey = pubkeyMap.get(input.prevout.scriptpubkey_address);
    inputList.push({
        txid: input.txid,
        vout: input.vout,
        value: input.prevout.value,
        address: input.prevout.scriptpubkey_address,
        pubkey: pubkey
    })
});

const outputList = [];
outputList.push({
    address: 'bc1px7r88gq643zpe34wtz0snl70qkd3ett7j3gjypym686npsn474ls2jh4k9',
    value: 330
})

const script = AlkanesService.getTransferProtostone('2:20', [{
    amount: '0',
    output: 1
}]);
outputList.push({
    script: script,
    value: 0
})

const hex = await PsbtUtil.createUnSignPsbt(inputList, outputList, 'bc1qlhf6xqe8jw53lsl2ptf4kkdmy9ms0qa5p75ryg', 2.1);
console.log(hex.hex);