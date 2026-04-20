/**
 * Integration tests for POST /assets/:id/restore.
 *
 * Covers: 200 (restore), 404 (wrong owner), 401 (no auth), 410 (gone),
 *         idempotent restore of an already-active asset.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-restore-endpoint.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-restore-url'),
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
  APP_DEV_AUTH_BYPASS:      'false',
});

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let app: Express;
let conn: Connection;

const TEST_USER_ID    = `ar-user-${randomUUID().slice(0, 8)}`;
const TEST_SESSION_ID = randomUUID();
const TEST_TOKEN      = `ar-token-${randomUUID()}`;

const OTHER_USER_ID    = `ar-other-${randomUUID().slice(0, 8)}`;
const OTHER_SESSION_ID = randomUUID();
const OTHER_TOKEN      = `ar-other-tok-${randomUUID()}`;

const TEST_PROJECT_ID       = randomUUID();
const FILE_TO_RESTORE       = randomUUID();
const FILE_ALREADY_ACTIVE   = randomUUID();
const FILE_OTHER_USER       = randomUUID();
const FILE_NOT_EXIST        = randomUUID();

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

  for (const [uid, email, name] of [
    [TEST_USER_ID,  `${TEST_USER_ID}@test.com`,  'Asset Restore User'],
    [OTHER_USER_ID, `${OTHER_USER_ID}@test.com`, 'Asset Restore Other'],
  ] as [string, string, string][]) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, email, name],
    );
  }

  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [TEST_SESSION_ID, TEST_USER_ID, sha256(TEST_TOKEN), new Date(Date.now() + 3_600_000)],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [OTHER_SESSION_ID, OTHER_USER_ID, sha256(OTHER_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE project_id = project_id`,
    [TEST_PROJECT_ID, TEST_USER_ID, 'Restore Test Project'],
  );

  // FILE_TO_RESTORE: soft-deleted, owned by TEST_USER_ID
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status, deleted_at)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready', NOW(3))
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [FILE_TO_RESTORE, TEST_USER_ID, 's3://test/restore.mp4', 'video/mp4', 1000, 'restore.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [TEST_PROJECT_ID, FILE_TO_RESTORE],
  );

  // FILE_ALREADY_ACTIVE: active (not deleted), owned by TEST_USER_ID
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [FILE_ALREADY_ACTIVE, TEST_USER_ID, 's3://test/active.mp4', 'video/mp4', 2000, 'active.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [TEST_PROJECT_ID, FILE_ALREADY_ACTIVE],
  );

  // FILE_OTHER_USER: soft-deleted, owned by OTHER_USER_ID
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status, deleted_at)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready', NOW(3))
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [FILE_OTHER_USER, OTHER_USER_ID, 's3://test/other.mp4', 'video/mp4', 3000, 'other.mp4'],
  );
});

afterAll(async () => {
  await conn.execute(
    `DELETE FROM project_files WHERE file_id IN (?, ?, ?)`,
    [FILE_TO_RESTORE, FILE_ALREADY_ACTIVE, FILE_OTHER_USER],
  );
  await conn.execute(
    `DELETE FROM files WHERE file_id IN (?, ?, ?)`,
    [FILE_TO_RESTORE, FILE_ALREADY_ACTIVE, FILE_OTHER_USER],
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

describe('POST /assets/:id/restore', () => {
  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).post(`/assets/${FILE_TO_RESTORE}/restore`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the asset belongs to another user', async () => {
    const res = await request(app)
      .post(`/assets/${FILE_OTHER_USER}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns 410 when the asset does not exist', async () => {
    const res = await request(app)
      .post(`/assets/${FILE_NOT_EXIST}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(410);
  });

  it('returns 200 and the restored asset on happy path', async () => {
    const res = await request(app)
      .post(`/assets/${FILE_TO_RESTORE}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: FILE_TO_RESTORE });

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT deleted_at FROM files WHERE file_id = ?',
      [FILE_TO_RESTORE],
    );
    expect(rows[0]!['deleted_at']).toBeNull();
  });

  it('returns 200 idempotently when restoring an already-active asset', async () => {
    const res = await request(app)
      .post(`/assets/${FILE_ALREADY_ACTIVE}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: FILE_ALREADY_ACTIVE });
  });
});
