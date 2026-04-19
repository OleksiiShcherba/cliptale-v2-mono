/**
 * Integration tests for DELETE /assets/:id.
 *
 * Covers: 204 (deleted), 404 (not found or wrong owner), 409 (asset in use by clip), 401 (no auth).
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-delete-endpoint.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

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
  APP_JWT_SECRET:           JWT_SECRET,
  APP_DEV_AUTH_BYPASS:      'true',
});

let app: Express;
let conn: Connection;

/** Asset seeded for the 204 happy-path test. */
const DELETABLE_ASSET_ID    = '00000000-del-test-0000-000000000001';
/** Asset seeded independently for the idempotency (second-delete → 404) test. */
const IDEMPOTENCY_ASSET_ID  = '00000000-del-test-0000-000000000005';
/** Asset seeded for the 409 in-use test. */
const IN_USE_ASSET_ID    = '00000000-del-test-0000-000000000002';
/** Clip seeded to reference IN_USE_ASSET_ID. */
const REFERENCING_CLIP_ID = '00000000-del-test-0000-000000000003';
/** Asset seeded with a different userId to test the 404 wrong-owner path. */
const OTHER_USER_ASSET_ID = '00000000-del-test-0000-000000000004';

const TEST_USER_ID   = 'delete-test-user-001';
const TEST_PROJECT_ID = 'delete-test-proj-001';

function validToken(): string {
  return jwt.sign({ sub: TEST_USER_ID, email: 'delete-test@example.com' }, JWT_SECRET);
}

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

  // Seed asset that can be deleted (owned by TEST_USER_ID).
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [DELETABLE_ASSET_ID, TEST_PROJECT_ID, TEST_USER_ID, 'deletable.mp4', 'video/mp4', 1000, 's3://test/deletable.mp4'],
  );

  // Seed asset that is referenced by a clip (owned by TEST_USER_ID).
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [IN_USE_ASSET_ID, TEST_PROJECT_ID, TEST_USER_ID, 'inuse.mp4', 'video/mp4', 2000, 's3://test/inuse.mp4'],
  );

  // Seed a clip in project_clips_current referencing IN_USE_ASSET_ID via file_id.
  // asset_id column was dropped in migration 024 (Files-as-Root refactor); file_id is the new column.
  await conn.execute(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, file_id, start_frame, duration_frames)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE clip_id = clip_id`,
    [REFERENCING_CLIP_ID, TEST_PROJECT_ID, 'track-del-test-001', 'video', IN_USE_ASSET_ID, 0, 90],
  );

  // Seed asset owned by a different user to test 404 wrong-owner path.
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [OTHER_USER_ASSET_ID, TEST_PROJECT_ID, 'other-user-999', 'other.mp4', 'video/mp4', 3000, 's3://test/other.mp4'],
  );

  // Seed asset for the idempotency test — deleted by the test itself then re-attempted.
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [IDEMPOTENCY_ASSET_ID, TEST_PROJECT_ID, TEST_USER_ID, 'idempotency.mp4', 'video/mp4', 4000, 's3://test/idempotency.mp4'],
  );
});

afterAll(async () => {
  // Clean up seeded clip and assets (order matters — clip references asset).
  await conn.execute(
    'DELETE FROM project_clips_current WHERE clip_id = ?',
    [REFERENCING_CLIP_ID],
  );
  await conn.execute(
    `DELETE FROM project_assets_current WHERE asset_id IN (?, ?, ?, ?)`,
    [IN_USE_ASSET_ID, OTHER_USER_ASSET_ID, DELETABLE_ASSET_ID, IDEMPOTENCY_ASSET_ID],
  );
  await conn.end();
});

describe('DELETE /assets/:id', () => {
  it('returns 404 when the asset does not exist', async () => {
    const res = await request(app)
      .delete('/assets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the asset belongs to a different user', async () => {
    const res = await request(app)
      .delete(`/assets/${OTHER_USER_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when the asset is referenced by a clip', async () => {
    const res = await request(app)
      .delete(`/assets/${IN_USE_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(409);
  });

  it('returns 204 and removes the asset row on happy path', async () => {
    const res = await request(app)
      .delete(`/assets/${DELETABLE_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    // Verify the row was actually removed from the database.
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT asset_id FROM project_assets_current WHERE asset_id = ?',
      [DELETABLE_ASSET_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it('returns 404 when trying to delete an already-deleted asset', async () => {
    // First delete — should succeed.
    const firstRes = await request(app)
      .delete(`/assets/${IDEMPOTENCY_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(firstRes.status).toBe(204);

    // Second delete — asset is gone, should 404.
    const secondRes = await request(app)
      .delete(`/assets/${IDEMPOTENCY_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(secondRes.status).toBe(404);
  });
});
