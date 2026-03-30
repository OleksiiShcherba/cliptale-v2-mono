/** Central environment variable access — the ONLY file allowed to read process.env in apps/media-worker. */
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
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    name: process.env.DB_NAME ?? 'cliptale',
    user: process.env.DB_USER ?? 'cliptale',
    password: process.env.DB_PASSWORD ?? '',
  },
} as const;
