/**
 * Vitest global setup — injects the minimum required env vars so config.ts
 * does not call process.exit(1) when a test imports `@/config.js` (e.g. via
 * `@/lib/db.js` in the real-MySQL integration tests).
 *
 * Values are stubs only; integration tests that talk to real infra read the
 * DB credentials (APP_DB_HOST / APP_DB_PASSWORD) from the actual environment,
 * which these defaults only backfill when absent. Mirrors apps/api/vitest.setup.ts.
 */
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_OPENAI_API_KEY:       process.env['APP_OPENAI_API_KEY']       ?? 'test-openai-key',
  APP_FAL_KEY:              process.env['APP_FAL_KEY']              ?? 'test-fal-key',
  APP_ELEVENLABS_API_KEY:   process.env['APP_ELEVENLABS_API_KEY']   ?? 'test-el-key',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
});
