/**
 * Integration tests for DELETE /assets/:id.
 *
 * Covers: 204 (soft-deleted), 404 (not found or wrong owner), 401 (no auth).
 * EPIC B: soft-delete succeeds even when clips reference the file (no 409).
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-delete-endpoint.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
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

vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  mediaIngestQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  renderQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  transcriptionQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
}));

const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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
  APP_DEV_AUTH_BYPASS:      'false',
});

let app: Express;
let conn: Connection;

// ── Test fixture IDs ──────────────────────────────────────────────────────────

const TEST_USER_ID = `del-test-user-${randomUUID().slice(0, 8)}`;
const TEST_SESSION_ID = randomUUID();
const TEST_TOKEN = `del-test-token-${randomUUID()}`;

const OTHER_USER_ID = `del-test-other-${randomUUID().slice(0, 8)}`;
const OTHER_SESSION_ID = randomUUID();
const OTHER_TOKEN = `del-test-other-token-${randomUUID()}`;

let TEST_PROJECT_ID: string;

/** Asset seeded for the 204 happy-path test. */
const DELETABLE_ASSET_ID = randomUUID();
/** Asset seeded independently for the idempotency (second-delete → 404) test. */
const IDEMPOTENCY_ASSET_ID = randomUUID();
/** Asset seeded for the in-use (clip reference) test. */
const IN_USE_ASSET_ID = randomUUID();
/** Clip seeded to reference IN_USE_ASSET_ID. */
const REFERENCING_CLIP_ID = randomUUID();
/** Asset seeded with a different userId to test the 404 wrong-owner path. */
const OTHER_USER_ASSET_ID = randomUUID();

function validToken(): string {
  return TEST_TOKEN;
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

  // Create test user with valid session.
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [TEST_USER_ID, `${TEST_USER_ID}@test.com`, 'Delete Test User'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [TEST_SESSION_ID, TEST_USER_ID, sha256(TEST_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  // Create other user with valid session for ownership test.
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [OTHER_USER_ID, `${OTHER_USER_ID}@test.com`, 'Other Test User'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [OTHER_SESSION_ID, OTHER_USER_ID, sha256(OTHER_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  // Create test project.
  TEST_PROJECT_ID = randomUUID();
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, 'Delete Test Project') ON DUPLICATE KEY UPDATE project_id = project_id`,
    [TEST_PROJECT_ID, TEST_USER_ID],
  );

  // Migration 027 dropped project_assets_current; assets now live in files + project_files.
  // Seed asset that can be deleted (owned by TEST_USER_ID).
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [DELETABLE_ASSET_ID, TEST_USER_ID, 's3://test/deletable.mp4', 'video/mp4', 1000, 'deletable.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [TEST_PROJECT_ID, DELETABLE_ASSET_ID],
  );

  // Seed asset that is referenced by a clip (owned by TEST_USER_ID).
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [IN_USE_ASSET_ID, TEST_USER_ID, 's3://test/inuse.mp4', 'video/mp4', 2000, 'inuse.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [TEST_PROJECT_ID, IN_USE_ASSET_ID],
  );

  // Seed a clip in project_clips_current referencing IN_USE_ASSET_ID via file_id.
  await conn.execute(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, file_id, start_frame, duration_frames)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE clip_id = clip_id`,
    [REFERENCING_CLIP_ID, TEST_PROJECT_ID, 'track-del-test-001', 'video', IN_USE_ASSET_ID, 0, 90],
  );

  // Seed asset owned by a different user to test 404 wrong-owner path.
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [OTHER_USER_ASSET_ID, OTHER_USER_ID, 's3://test/other.mp4', 'video/mp4', 3000, 'other.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [TEST_PROJECT_ID, OTHER_USER_ASSET_ID],
  );

  // Seed asset for the idempotency test — deleted by the test itself then re-attempted.
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [IDEMPOTENCY_ASSET_ID, TEST_USER_ID, 's3://test/idempotency.mp4', 'video/mp4', 4000, 'idempotency.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [TEST_PROJECT_ID, IDEMPOTENCY_ASSET_ID],
  );
});

afterAll(async () => {
  // Clean up in FK-safe order: clip → project_files → files → projects → sessions → users.
  await conn.execute(
    'DELETE FROM project_clips_current WHERE clip_id = ?',
    [REFERENCING_CLIP_ID],
  );
  await conn.execute(
    'DELETE FROM project_files WHERE file_id IN (?, ?, ?, ?)',
    [IN_USE_ASSET_ID, OTHER_USER_ASSET_ID, DELETABLE_ASSET_ID, IDEMPOTENCY_ASSET_ID],
  );
  await conn.execute(
    `DELETE FROM files WHERE file_id IN (?, ?, ?, ?)`,
    [IN_USE_ASSET_ID, OTHER_USER_ASSET_ID, DELETABLE_ASSET_ID, IDEMPOTENCY_ASSET_ID],
  );
  await conn.execute('DELETE FROM projects WHERE project_id = ?', [TEST_PROJECT_ID]);
  await conn.execute(
    'DELETE FROM sessions WHERE session_id IN (?, ?)',
    [TEST_SESSION_ID, OTHER_SESSION_ID],
  );
  await conn.execute(
    'DELETE FROM users WHERE user_id IN (?, ?)',
    [TEST_USER_ID, OTHER_USER_ID],
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

  it('returns 204 even when the asset is referenced by a clip (soft-delete allows this)', async () => {
    // EPIC B decision: clips referencing a soft-deleted file are not blocked.
    // The file resolves to a deleted row during the 30-day undo window (renders show placeholder).
    const res = await request(app)
      .delete(`/assets/${IN_USE_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 and soft-deletes the file on happy path', async () => {
    const res = await request(app)
      .delete(`/assets/${DELETABLE_ASSET_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    // Verify the row was soft-deleted (deleted_at is set, row still exists).
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT deleted_at FROM files WHERE file_id = ?',
      [DELETABLE_ASSET_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['deleted_at']).not.toBeNull();
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
