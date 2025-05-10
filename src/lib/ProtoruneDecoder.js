import axios from 'axios';
import config from '../conf/config.js';
import * as logger from '../conf/logger.js';
import BaseUtil from '../utils/BaseUtil.js';

export default async function decodeProtorune(hex, retry = 0,raiseError = false) {
    while (retry >= 0) {
        retry--;
        try {
            const response = await axios.post(`${config.api.protoruneParseEndpoint}/decode`, hex);
            return response.data;
        } catch (error) {
            if (error.response?.status === 400) {
                return null;
            }
            if (retry > 0) {
                await BaseUtil.sleep(1000);
                continue;
            }
            if (raiseError) {
                logger.error(`parse tx hex error`, error);
                throw error;
            }
            return null;
        }
    }
}
