import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { networks } from "bitcoinjs-lib"
import * as logger from './logger.js';

// 获取当前文件的路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = process.env.NODE_ENV || 'dev';
const configPath = `${__dirname}/config.${env}.json`;
logger.info(`config load, ${env} ---- ${configPath}`);

if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found for environment '${env}': ${configPath}`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const methanePath = `${__dirname}/methane.json`;
config.methaneCommittee = JSON.parse(fs.readFileSync(methanePath, 'utf-8'));

config.network = networks.testnet;
if (config.networkName === 'mainnet') {
    config.network = networks.bitcoin;
}

export default config;

