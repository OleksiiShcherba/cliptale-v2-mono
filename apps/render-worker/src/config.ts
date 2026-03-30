/** Central environment variable access — the ONLY file allowed to read process.env in apps/render-worker. */
export const config = {
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
} as const;
