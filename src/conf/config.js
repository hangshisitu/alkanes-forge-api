import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { networks } from "bitcoinjs-lib"
import DateUtil from "../utils/DateUtil.js";
import LoggerUtil from "../utils/LoggerUtil.js";

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
const originalWarn = console.warn;
const originalInfo = console.info;
const originalDebug = console.debug;

// 重写 console.log
console.log = function(...args) {
    originalLog.apply(console, [LoggerUtil.formatLogMessage('info', args)]);
};

// 重写 console.error
console.error = function(...args) {
    // Check if the last argument is an Error object
    if (args.length > 0 && args[args.length - 1] instanceof Error) {
        const error = args[args.length - 1];
        const messageArgs = args.slice(0, args.length - 1);
        originalError.apply(console, [LoggerUtil.formatLogMessage('error', messageArgs), error]);
    } else {
        originalError.apply(console, [LoggerUtil.formatLogMessage('error', args)]);
    }
};

// 重写 console.warn
console.warn = function(...args) {
    originalWarn.apply(console, [LoggerUtil.formatLogMessage('warn', args)]);
};

// 重写 console.info
console.info = function(...args) {
    originalInfo.apply(console, [LoggerUtil.formatLogMessage('info', args)]);
};

// 重写 console.debug
console.debug = function(...args) {
    originalDebug.apply(console, [LoggerUtil.formatLogMessage('debug', args)]);
};

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

config.network = networks.testnet;
if (config.networkName === 'mainnet') {
    config.network = networks.bitcoin;
}

export default config;

