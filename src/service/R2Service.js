import { R2 } from 'node-cloudflare-r2';
import config from '../conf/config.js';

// Initialize R2
const r2 = new R2({
    accountId: config.r2.accountId,
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    sslEnabled: true,
    sslVerify: false, // Disable SSL verification for development
    maxRetries: 3,
    retryDelay: 1000
});

// Initialize bucket instance
const bucket = r2.bucket(config.r2.bucketName);

// [Optional] Provide the public URL(s) of your bucket, if its public access is allowed.
bucket.provideBucketPublicUrl(config.r2.publicUrl);

export default class R2Service {

    static async uploadFile(file) {
        let { text, filename, prefix } = file;
        if (!prefix) {
            prefix = config.r2.prefix;
        }
        const key = `${prefix}/${filename}`;
        try {
            await bucket.upload(text, key);
            return `${config.r2.urlDomain}/${key}`;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }
}






