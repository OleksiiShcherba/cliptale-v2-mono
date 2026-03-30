import { z } from 'zod';

const envSchema = z.object({
  APP_REDIS_URL: z.string().url(),
  APP_S3_BUCKET: z.string().min(1),
  APP_S3_ENDPOINT: z.string().optional(),
  APP_S3_REGION: z.string().default('us-east-1'),
  APP_S3_ACCESS_KEY_ID: z.string().min(1),
  APP_S3_SECRET_ACCESS_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Missing required environment variables:', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

/** Central environment variable access — the ONLY file allowed to read process.env in apps/render-worker. */
export const config = {
  redis: {
    url: env.APP_REDIS_URL,
  },
  s3: {
    bucket: env.APP_S3_BUCKET,
    endpoint: env.APP_S3_ENDPOINT,
    region: env.APP_S3_REGION,
    accessKeyId: env.APP_S3_ACCESS_KEY_ID,
    secretAccessKey: env.APP_S3_SECRET_ACCESS_KEY,
  },
} as const;
