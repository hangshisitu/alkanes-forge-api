import config from "../conf/config.js";
import * as RedisHelper from "../lib/RedisHelper.js";
import PsbtUtil from "../utils/PsbtUtil.js";
import {Constants} from "../conf/constants.js";
import LayoutUtil from "../utils/LayoutUtil.js";
import * as util from "util";


const commitAddress='tb1pnku7ap3s4aearzawfgt8m0v5xza980vsdtvn5efl59hcqswzrsyq6gtdvq'
const revealCache = await RedisHelper.get(
    `${Constants.REDIS_KEY.TOKEN_DEPLOY_REVEAL_CACHE}${commitAddress}`
);

const {revealPsbt,privateKey,feerate} = JSON.parse(revealCache);

const tempPsbt =  PsbtUtil.fromPsbt(revealPsbt);
        
const revealLayout = await LayoutUtil.buildLayoutForPsbt(tempPsbt);
revealLayout.inputs[0].txid='ea2a75a61cf7aa78f8e499fd14d36a80a1d8cddca65ebe747458271f3f2391f1';

console.log(`revealLayout ${util.inspect(revealLayout)}`)

const realPsbt = await LayoutUtil.buildPsbtForLayout(revealLayout,1000);

console.info(realPsbt.toBase64())
