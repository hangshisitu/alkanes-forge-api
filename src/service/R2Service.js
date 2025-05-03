import config from '../conf/config.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  endpoint: config.r2.publicUrl,
  region: "auto",
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
  signatureVersion: "v4",
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export default class R2Service {

    static async uploadText(file) {
        let { text, filename, prefix, type } = file;
        if (!prefix) {
            prefix = config.r2.prefix;
        }
        const key = `${prefix}/${filename}`;
        try {
            const cmd = new PutObjectCommand({
                Bucket:        config.r2.bucketName,
                Key:           key,
                Body:          text,
                ContentType:   type,
            });
            const res = await r2.send(cmd);
            if (!(res.$metadata.httpStatusCode === 200 || res.$metadata.httpStatusCode === 201)) {
                throw new Error(`Upload error: ${res.$metadata.httpStatusCode}`);
            }
            return `${config.r2.urlDomain}/${key}`;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    static async uploadBuffer(file) {
        let { buffer, filename, prefix, type } = file;
        if (!prefix) {
            prefix = config.r2.prefix;
        }
        const key = `${prefix}/${filename}`;
        try {
            const cmd = new PutObjectCommand({
                Bucket:        config.r2.bucketName,
                Key:           key,
                Body:          buffer,
                ContentType:   type,
            });
            const res = await r2.send(cmd);
            if (!(res.$metadata.httpStatusCode === 200 || res.$metadata.httpStatusCode === 201)) {
                throw new Error(`Upload error: ${res.$metadata.httpStatusCode}`);
            }
            return `${config.r2.urlDomain}/${key}`;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }
}



