import { z } from 'zod';

/**
 * Environment schema. Exported so the validation can be unit-tested with a
 * controlled env object (config.ts validates process.env eagerly at import and
 * exits the process on failure, which is not testable directly).
 */
export const envSchema = z.object({
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
  APP_OPENAI_API_KEY: z.string().default(''),
  APP_OPENAI_MODEL: z.string().default('gpt-4o'),
  APP_PIPELINE_STUCK_PHASE_BOUND_MINUTES: z.string().default('10'),
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
  openai: {
    /**
     * OpenAI API key for Motion Graphic code authoring (ADR-0002, revised: the
     * feature reuses the existing OpenAI service instead of Anthropic). Shared
     * with the rest of the platform's OpenAI text tasks.
     */
    apiKey: env.APP_OPENAI_API_KEY,
    /** Authoring model id; swapping tiers is a one-line env override (ADR-0002). */
    model: env.APP_OPENAI_MODEL,
  },
  storyboardPipeline: {
    /**
     * Stuck-phase release bound in minutes (ADR-0005, spec §6 NFR). A running phase
     * whose heartbeat is older than this is lazily released to `failed` on the next
     * state read. Falls back to 10 when the env value is non-numeric / ≤ 0.
     */
    stuckPhaseBoundMinutes: (() => {
      const parsed = parseInt(env.APP_PIPELINE_STUCK_PHASE_BOUND_MINUTES, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    })(),
  },
} as const;
