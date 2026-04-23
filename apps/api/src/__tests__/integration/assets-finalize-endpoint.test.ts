/**
 * Integration tests for POST /assets/:id/finalize.
 *
 * Requires a live MySQL instance (docker compose up db).
 * S3 HeadObjectCommand is mocked — no real AWS credentials needed.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-finalize-endpoint.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';
import { s3Client } from '@/lib/s3.js';

// ── Mock S3 — default: HEAD succeeds (object exists); override per test ───────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Set env vars before app import ────────────────────────────────────────────
const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

Object.assign(process.env, {
  APP_DB_HOST:             process.env['APP_DB_HOST']             ?? 'localhost',
  APP_DB_PORT:             process.env['APP_DB_PORT']             ?? '3306',
  APP_DB_NAME:             process.env['APP_DB_NAME']             ?? 'cliptale',
  APP_DB_USER:             process.env['APP_DB_USER']             ?? 'cliptale',
  APP_DB_PASSWORD:         process.env['APP_DB_PASSWORD']         ?? 'cliptale',
  APP_REDIS_URL:           process.env['APP_REDIS_URL']           ?? 'redis://localhost:6379',
  APP_S3_BUCKET:           process.env['APP_S3_BUCKET']           ?? 'test-bucket',
  APP_S3_REGION:           process.env['APP_S3_REGION']           ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:    process.env['APP_S3_ACCESS_KEY_ID']    ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY:process.env['APP_S3_SECRET_ACCESS_KEY']?? 'test-secret-key-value',
  APP_JWT_SECRET:          JWT_SECRET,
  APP_DEV_AUTH_BYPASS:     'true',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let finalizeAssetId: string;

// dev-user-001 is the hardcoded DEV_AUTH_BYPASS user — it already exists in the
// test DB (seeded by a migration fixture) so we do NOT insert or delete it here.
const SEED_USER_ID = 'dev-user-001';

function validToken(): string {
  return jwt.sign({ sub: 'user-test-001', email: 'qa@example.com' }, JWT_SECRET);
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

  // Seed file row for finalize tests into `files` (migration 021).
  // Uses dev-user-001 which is always present in the test DB.
  finalizeAssetId = '00000000-test-finz-0000-000000000001';
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE status = 'pending', error_message = NULL`,
    [
      finalizeAssetId,
      SEED_USER_ID,
      'video',
      `s3://test-bucket/projects/proj-finalize/assets/${finalizeAssetId}/finalize.mp4`,
      'video/mp4',
      999_000,
      'finalize.mp4',
    ],
  );
});

afterAll(async () => {
  await conn.execute(
    'DELETE FROM files WHERE file_id = ?',
    [finalizeAssetId],
  );
  await conn.end();
});

// Reset mock call counts between tests so `.not.toHaveBeenCalled()` assertions
// check only the current test, not accumulated calls from previous tests.
beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /assets/:id/finalize ─────────────────────────────────────────────────

describe('POST /assets/:id/finalize', () => {
  it('returns 404 for a non-existent asset ID', async () => {
    const res = await request(app)
      .post('/assets/00000000-0000-0000-0000-000000000000/finalize')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when the object has not been uploaded to storage', async () => {
    const notFoundErr = Object.assign(new Error('Not Found'), { name: 'NotFound' });
    vi.mocked(s3Client.send).mockRejectedValueOnce(notFoundErr);

    const res = await request(app)
      .post(`/assets/${finalizeAssetId}/finalize`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 200 with processing status on happy path', async () => {
    // Reset to pending before this test.
    await conn.execute(
      `UPDATE files SET status = 'pending' WHERE file_id = ?`,
      [finalizeAssetId],
    );

    const res = await request(app)
      .post(`/assets/${finalizeAssetId}/finalize`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    // The API response uses `id` (not `fileId`) for the asset identifier.
    expect(res.body).toMatchObject({
      id: finalizeAssetId,
      status: 'processing',
    });

    // Verify the DB row was updated.
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status FROM files WHERE file_id = ?',
      [finalizeAssetId],
    );
    expect(rows[0]!['status']).toBe('processing');
  });

  it('returns 200 unchanged when already processing (idempotency)', async () => {
    await conn.execute(
      `UPDATE files SET status = 'processing' WHERE file_id = ?`,
      [finalizeAssetId],
    );

    const res = await request(app)
      .post(`/assets/${finalizeAssetId}/finalize`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    // S3 HEAD must not be called for the idempotent path.
    expect(s3Client.send).not.toHaveBeenCalled();
  });
});
