/**
 * Vitest global setup — injects the minimum required env vars so config.ts
 * does not call process.exit(1) during unit test collection.
 *
 * Values are stubs only; no real DB, Redis, or AWS credentials are used
 * in unit tests (all external dependencies are mocked at the test level).
 */
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           process.env['APP_JWT_SECRET']           ?? 'unit-test-jwt-secret-exactly-32ch!',
  APP_FAL_KEY:              process.env['APP_FAL_KEY']              ?? 'test-fal-key',
});
