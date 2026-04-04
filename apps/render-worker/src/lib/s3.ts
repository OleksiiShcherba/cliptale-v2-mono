import { S3Client } from '@aws-sdk/client-s3';

import { config } from '@/config.js';

/** Singleton S3 client configured from app config. Import this — never instantiate S3Client elsewhere. */
export const s3Client = new S3Client({
  region: config.s3.region,
  ...(config.s3.endpoint ? { endpoint: config.s3.endpoint, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});
