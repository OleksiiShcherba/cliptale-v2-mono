/**
 * Integration tests for PATCH /assets/:id.
 *
 * Covers:
 *   200 — valid rename, response body contains `displayName`
 *   400 — empty name (validateBody middleware rejects)
 *   400 — name is whitespace-only (Zod trim+min rejects after trim)
 *   400 — name exceeds 255 characters (validateBody middleware rejects)
 *   404 — asset does not exist
 *   404 — asset belongs to a different user (ownership guard in service)
 *
 * Auth: APP_DEV_AUTH_BYPASS=true is used so all requests are authenticated as
 * the hardcoded dev user `dev-user-001`. Happy-path assets are seeded with
 * `dev-user-001` as owner; the wrong-owner asset uses a different owner.
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-patch-endpoint.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'integration-test-jwt-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
  APP_FAL_KEY:              process.env['APP_FAL_KEY']              ?? 'test-fal-key',
  APP_ELEVENLABS_API_KEY:   process.env['APP_ELEVENLABS_API_KEY']   ?? 'test-el-key',
});

/**
 * The dev bypass user ID. With APP_DEV_AUTH_BYPASS=true, every request is
 * authenticated as this user. Assets that should be renameable must be owned
 * by this ID; the wrong-owner asset must use a different owner.
 */
const DEV_USER_ID = 'dev-user-001';

let app: Express;
let conn: Connection;

/** Asset owned by DEV_USER_ID — used for happy-path and validation tests. */
const OWNED_ASSET_ID = '00000000-pat-test-0000-000000000001';
/** Asset owned by a different user — used for the 404 wrong-owner test. */
const OTHER_ASSET_ID = '00000000-pat-test-0000-000000000002';

const TEST_PROJECT_ID = 'patch-test-proj-001';

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed asset owned by the dev bypass user.
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [OWNED_ASSET_ID, TEST_PROJECT_ID, DEV_USER_ID, 'original.mp4', 'video/mp4', 1000, 's3://test/original.mp4'],
  );

  // Seed asset owned by a different user to test the ownership guard.
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [OTHER_ASSET_ID, TEST_PROJECT_ID, 'other-user-777', 'other.mp4', 'video/mp4', 2000, 's3://test/other.mp4'],
  );
});

afterAll(async () => {
  await conn.execute(
    'DELETE FROM project_assets_current WHERE asset_id IN (?, ?)',
    [OWNED_ASSET_ID, OTHER_ASSET_ID],
  );
  await conn.end();
});

describe('PATCH /assets/:id', () => {
  it('returns 400 when name is absent', async () => {
    const res = await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is an empty string', async () => {
    const res = await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is a whitespace-only string', async () => {
    // Zod .trim().min(1) reduces '   ' to '' which fails min(1).
    const res = await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const res = await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({ name: 'a'.repeat(256) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the asset does not exist', async () => {
    const res = await request(app)
      .patch('/assets/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Does Not Exist' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the asset belongs to a different user', async () => {
    const res = await request(app)
      .patch(`/assets/${OTHER_ASSET_ID}`)
      .send({ name: 'Steal This Name' });
    expect(res.status).toBe(404);
  });

  it('returns 200 with displayName set on a valid rename', async () => {
    const res = await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({ name: 'My Awesome Clip' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: OWNED_ASSET_ID,
      displayName: 'My Awesome Clip',
      filename: 'original.mp4',
    });
  });

  it('persists the displayName in the database after a valid rename', async () => {
    await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({ name: 'Persisted Name' });

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT display_name FROM project_assets_current WHERE asset_id = ?',
      [OWNED_ASSET_ID],
    );
    expect(rows[0]?.display_name).toBe('Persisted Name');
  });

  it('trims leading/trailing whitespace from the name before storing', async () => {
    const res = await request(app)
      .patch(`/assets/${OWNED_ASSET_ID}`)
      .send({ name: '  Trimmed Name  ' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Trimmed Name');
  });
});
