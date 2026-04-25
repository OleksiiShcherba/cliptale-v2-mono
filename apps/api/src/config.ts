import { z } from 'zod';

const envSchema = z.object({
  APP_DB_HOST: z.string().min(1),
  APP_DB_PORT: z.string().default('3306'),
  APP_DB_NAME: z.string().default('cliptale'),
  APP_DB_USER: z.string().default('cliptale'),
  APP_DB_PASSWORD: z.string().min(1),
  APP_REDIS_URL: z.string().url(),
  APP_S3_BUCKET: z.string().min(1),
  APP_S3_ENDPOINT: z.string().optional(),
  APP_S3_REGION: z.string().default('us-east-1'),
  APP_S3_ACCESS_KEY_ID: z.string().min(1),
  APP_S3_SECRET_ACCESS_KEY: z.string().min(1),
  APP_JWT_SECRET: z.string().min(32),
  APP_JWT_EXPIRES_IN: z.string().default('7d'),
  APP_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
  APP_PORT: z.string().default('3001'),
  APP_CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_GOOGLE_CLIENT_ID: z.string().default(''),
  APP_GOOGLE_CLIENT_SECRET: z.string().default(''),
  APP_GITHUB_CLIENT_ID: z.string().default(''),
  APP_GITHUB_CLIENT_SECRET: z.string().default(''),
  APP_OAUTH_REDIRECT_BASE: z.string().default('http://localhost:3001'),
  APP_FRONTEND_URL: z.string().default('http://localhost:5173'),
  APP_FAL_KEY: z.string().min(1),
  APP_ELEVENLABS_API_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Missing required environment variables:', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

/** Central environment variable access — the ONLY file allowed to read process.env in apps/api. */
export const config = {
  db: {
    host: env.APP_DB_HOST,
    port: Number(env.APP_DB_PORT),
    name: env.APP_DB_NAME,
    user: env.APP_DB_USER,
    password: env.APP_DB_PASSWORD,
  },
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
  auth: {
    /** Reserved for OAuth token signing (subtask 8) — no longer used by session-based auth middleware. */
    jwtSecret: env.APP_JWT_SECRET,
    jwtExpiresIn: env.APP_JWT_EXPIRES_IN,
    devAuthBypass: env.APP_DEV_AUTH_BYPASS === 'true',
  },
  server: {
    port: Number(env.APP_PORT),
    corsOrigin: env.APP_CORS_ORIGIN,
  },
  oauth: {
    google: {
      clientId: env.APP_GOOGLE_CLIENT_ID,
      clientSecret: env.APP_GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.APP_GITHUB_CLIENT_ID,
      clientSecret: env.APP_GITHUB_CLIENT_SECRET,
    },
    redirectBase: env.APP_OAUTH_REDIRECT_BASE,
    frontendUrl: env.APP_FRONTEND_URL,
  },
  fal: {
    key: env.APP_FAL_KEY,
  },
  elevenlabs: {
    apiKey: env.APP_ELEVENLABS_API_KEY,
  },
} as const;
