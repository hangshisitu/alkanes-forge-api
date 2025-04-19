import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { networks } from "bitcoinjs-lib"
import DateUtil from "../utils/DateUtil.js";

// 获取当前文件的路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = process.env.NODE_ENV || 'dev';
const configPath = `${__dirname}/config.${env}.json`;
console.log(`config load, ${env} ---- ${configPath}`);

if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found for environment '${env}': ${configPath}`);
}

// 保存原始的 console.log 和 console.error 方法
const originalLog = console.log;
const originalError = console.error;

// 重写 console.log
console.log = function(...args) {
    originalLog.apply(console, [`[${DateUtil.now()}]`, ...args]);
};

// 重写 console.error
console.error = function(...args) {
    originalError.apply(console, [`[${DateUtil.now()}]`, ...args]);
};

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
export default config;

let nt = networks.testnet;
if (config.network === 'mainnet') {
    nt = networks.bitcoin;
} else if (env === 'fat') {
    nt = networks.testnet;
}
export const network = nt;

