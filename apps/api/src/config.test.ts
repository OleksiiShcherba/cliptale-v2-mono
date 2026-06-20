/**
 * T3 — config validation unit tests for the OpenAI authoring keys.
 *
 * config.ts validates process.env eagerly at import-time and calls
 * process.exit(1) on failure, so we cannot test absence by re-importing.
 * Instead we exercise the exported `envSchema` directly with controlled
 * env objects.
 *
 * Tests cover:
 *  - APP_OPENAI_API_KEY is OPTIONAL: it defaults to '' when absent (the feature
 *    reuses the existing OpenAI service; the key is shared/optional at boot —
 *    ADR-0002 revised)
 *  - the authoring model id defaults to 'gpt-4o' when not provided
 *  - an explicit authoring model id overrides the default
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

/** Minimal env that satisfies every OTHER required key, so the only variable under test is the OpenAI key. */
const baseEnv: Record<string, string> = {
  APP_DB_HOST: 'localhost',
  APP_DB_PASSWORD: 'cliptale',
  APP_REDIS_URL: 'redis://localhost:6379',
  APP_S3_BUCKET: 'cliptale',
  APP_S3_ACCESS_KEY_ID: 'key',
  APP_S3_SECRET_ACCESS_KEY: 'secret',
  APP_JWT_SECRET: 'x'.repeat(32),
  APP_FAL_KEY: 'fal',
  APP_ELEVENLABS_API_KEY: 'eleven',
  APP_OPENAI_API_KEY: 'sk-openai-test',
};

// config.ts validates process.env eagerly at import-time and calls
// process.exit(1) on failure, so we seed a complete env BEFORE importing it,
// then load the exported `envSchema` via a dynamic import for the assertions.
let envSchema: z.ZodTypeAny;

beforeAll(async () => {
  for (const [k, v] of Object.entries(baseEnv)) {
    process.env[k] = v;
  }
  ({ envSchema } = await import('./config.js'));
});

describe('config envSchema — OpenAI authoring keys', () => {
  it("defaults APP_OPENAI_API_KEY to '' when absent (optional)", () => {
    const { APP_OPENAI_API_KEY: _omit, ...withoutKey } = baseEnv;
    const result = envSchema.safeParse(withoutKey);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_OPENAI_API_KEY).toBe('');
    }
  });

  it('SUCCEEDS when APP_OPENAI_API_KEY is present', () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
  });

  it("defaults the authoring model id to 'gpt-4o' when not provided", () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_OPENAI_MODEL).toBe('gpt-4o');
    }
  });

  it('honours an explicit authoring model id override', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      APP_OPENAI_MODEL: 'gpt-4o-mini',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_OPENAI_MODEL).toBe('gpt-4o-mini');
    }
  });
});
