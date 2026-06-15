import { z } from 'zod';

const envSchema = z
  .object({
    APP_REDIS_URL: z.string().url(),
    // Provider keys are optional ONLY in test mode (AI_GENERATION_STATE=test);
    // the superRefine below requires them in real mode.
    APP_OPENAI_API_KEY: z.string().default(''),
    APP_FAL_KEY: z.string().default(''),
    APP_ELEVENLABS_API_KEY: z.string().default(''),
    APP_S3_BUCKET: z.string().min(1),
    APP_S3_ENDPOINT: z.string().optional(),
    APP_S3_REGION: z.string().default('us-east-1'),
    APP_S3_ACCESS_KEY_ID: z.string().min(1),
    APP_S3_SECRET_ACCESS_KEY: z.string().min(1),
    APP_DB_HOST: z.string().min(1),
    APP_DB_PORT: z.string().default('3306'),
    APP_DB_NAME: z.string().default('cliptale'),
    APP_DB_USER: z.string().default('cliptale'),
    APP_DB_PASSWORD: z.string().min(1),
    /** Storyboard-pipeline reaper sweep interval, in milliseconds (T14, ADR-0005). */
    APP_STORYBOARD_PIPELINE_REAPER_INTERVAL_MS: z.string().default('60000'),
    /**
     * AI generation mode (test seam).
     *  - 'real' (default): storyboard image (OpenAI) and fal.ai video/image jobs
     *    call the live providers.
     *  - 'test': those jobs short-circuit to bundled local test assets — no
     *    provider API call, no provider API key required. Audio/transcription
     *    are unaffected.
     */
    AI_GENERATION_STATE: z.enum(['real', 'test']).default('real'),
  })
  .superRefine((env, ctx) => {
    if (env.AI_GENERATION_STATE === 'test') return;
    for (const key of ['APP_OPENAI_API_KEY', 'APP_FAL_KEY', 'APP_ELEVENLABS_API_KEY'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when AI_GENERATION_STATE is not "test"`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Missing required environment variables:', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

/** Central environment variable access — the ONLY file allowed to read process.env in apps/media-worker. */
export const config = {
  openai: {
    apiKey: env.APP_OPENAI_API_KEY,
  },
  fal: {
    key: env.APP_FAL_KEY,
  },
  elevenlabs: {
    apiKey: env.APP_ELEVENLABS_API_KEY,
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
  db: {
    host: env.APP_DB_HOST,
    port: Number(env.APP_DB_PORT),
    name: env.APP_DB_NAME,
    user: env.APP_DB_USER,
    password: env.APP_DB_PASSWORD,
  },
  storyboardPipeline: {
    reaperIntervalMs: Number(env.APP_STORYBOARD_PIPELINE_REAPER_INTERVAL_MS),
  },
  aiGeneration: {
    /** 'real' calls live providers; 'test' returns bundled local test assets. */
    state: env.AI_GENERATION_STATE,
  },
} as const;
