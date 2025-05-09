import axios from 'axios';
import config from '../conf/config.js';
import * as logger from '../conf/logger.js';

export default async function decodeProtorune(hex, raiseError = false) {
    try {
        const response = await axios.post(`${config.api.protoruneParseEndpoint}/decode`, hex);
        return response.data;
    } catch (error) {
        if (error.response?.status === 400) {
            return null;
        }
        if (raiseError) {
            logger.error(`parse tx hex error`, error);
            throw error;
        }
        return null;
    }
}
