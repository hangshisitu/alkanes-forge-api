import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { networks } from "bitcoinjs-lib"

// 获取当前文件的路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = process.env.NODE_ENV || 'dev';
const configPath = `${__dirname}/config.${env}.json`;
console.log(`config load, ${env} ---- ${configPath}`);

if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found for environment '${env}': ${configPath}`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
export default config;

let nt = networks.testnet;
if (config.network === 'mainnet') {
    nt = networks.bitcoin;
} else if (env === 'fat') {
    nt = networks.testnet;
}
export const network = nt;

