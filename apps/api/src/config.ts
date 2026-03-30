/** Central environment variable access — the ONLY file allowed to read process.env in apps/api. */
export const config = {
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    name: process.env.DB_NAME ?? 'cliptale',
    user: process.env.DB_USER ?? 'cliptale',
    password: process.env.DB_PASSWORD ?? '',
  },
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
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  server: {
    port: Number(process.env.API_PORT ?? 3001),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
} as const;
