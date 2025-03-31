import schedule from 'node-schedule';
import * as RedisHelper from "../lib/RedisHelper.js";
import UnisatAPI from "../lib/UnisatAPI.js";
import TokenInfoMapper from "../mapper/TokenInfoMapper.js";
import asyncPool from "tiny-async-pool";
import config from "../conf/config.js";
import AlkanesAPI from "../lib/AlkanesAPI.js";

let isRefreshToken = false;
function refreshToken() {
    schedule.scheduleJob('*/30 * * * * *', async () => {
        if (isRefreshToken) {
            return;
        }

        const updateRedisKey = `token-update-height`;
        try {
            isRefreshToken = true;

            const updateHeight = await RedisHelper.get(updateRedisKey);
            const blockHeight = await UnisatAPI.blockHeight();
            if (updateHeight && parseInt(updateHeight) === blockHeight) {
                return;
            }
            console.log(`refresh token start, update height: ${updateHeight} block height: ${blockHeight}`);

            const tokenList = await TokenInfoMapper.getAllTokens();
            console.log(`found exist tokens: ${tokenList.length}`);

            const mintedList = [];
            const mintIds = [];
            for (const token of tokenList) {
                if (token.mintActive) {
                    mintIds.push(token.id);
                } else {
                    mintedList.push(token);
                }
            }
            console.log(`found active tokens: ${mintIds.length}`);

            const alkaneList = [];
            for await (const result of asyncPool(config.concurrencyLimit, mintIds, AlkanesAPI.getAlkanesById)) {
                if (result !== null) {
                    alkaneList.push(result);
                }
            }
            await TokenInfoMapper.bulkUpsertTokens(alkaneList);

            let lastIndex = 0;
            if (alkaneList.length > 0) {
                lastIndex = parseInt(tokenList[tokenList.length - 1].id.split(':')[1]) + 1;
            }

            const newAlkaneList = [];
            for (let i = lastIndex; i < lastIndex + 1000; i++) {
                const alkanes = await AlkanesAPI.getAlkanesById(`2:${i}`);
                if (alkanes === null) {
                    break;
                }
                if (alkanes.cap < 1e36) {
                    newAlkaneList.push(alkanes);
                }
            }
            await TokenInfoMapper.bulkUpsertTokens(newAlkaneList);
            console.log(`found new tokens: ${newAlkaneList.length}`);

            await RedisHelper.set(updateRedisKey, blockHeight);

            const allTokens = alkaneList.concat(newAlkaneList).concat(mintedList);
            allTokens.sort((a, b) => parseInt(a.id.split(':')[1]) - parseInt(b.id.split(':')[1]));
            await RedisHelper.set('alkanesList', JSON.stringify(allTokens));

            console.log(`refresh token finish.`);
        } catch (err) {
            console.error(`scan block error`, err);
        } finally {
            isRefreshToken = false;
        }
    });
}

export function jobs() {
    refreshToken();
}