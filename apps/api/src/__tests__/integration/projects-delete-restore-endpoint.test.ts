/**
 * Integration tests for DELETE /projects/:id and POST /projects/:id/restore.
 *
 * Covers: 204 (soft-delete), 404 (not found/wrong owner), 401 (no auth),
 *         200 (restore), 410 (already gone / TTL).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/projects-delete-restore-endpoint.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
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

const TEST_USER_ID    = `pr-dr-user-${randomUUID().slice(0, 8)}`;
const TEST_SESSION_ID = randomUUID();
const TEST_TOKEN      = `pr-dr-token-${randomUUID()}`;

const OTHER_USER_ID    = `pr-dr-other-${randomUUID().slice(0, 8)}`;
const OTHER_SESSION_ID = randomUUID();
const OTHER_TOKEN      = `pr-dr-other-tok-${randomUUID()}`;

const PROJ_TO_DELETE  = randomUUID();
const PROJ_TO_RESTORE = randomUUID();
const PROJ_OTHER_USER = randomUUID();
const PROJ_NOT_FOUND  = randomUUID();

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

  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [TEST_USER_ID, `${TEST_USER_ID}@test.com`, 'Project DR Test User'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [TEST_SESSION_ID, TEST_USER_ID, sha256(TEST_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [OTHER_USER_ID, `${OTHER_USER_ID}@test.com`, 'Project DR Other User'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [OTHER_SESSION_ID, OTHER_USER_ID, sha256(OTHER_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  // Projects owned by TEST_USER_ID
  for (const [id, title] of [
    [PROJ_TO_DELETE, 'Project To Delete'],
    [PROJ_TO_RESTORE, 'Project To Restore'],
  ] as [string, string][]) {
    await conn.execute(
      `INSERT INTO projects (project_id, owner_user_id, title)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE project_id = project_id`,
      [id, TEST_USER_ID, title],
    );
  }

  // Project owned by OTHER_USER_ID
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE project_id = project_id`,
    [PROJ_OTHER_USER, OTHER_USER_ID, 'Other User Project'],
  );

  // Pre-soft-delete PROJ_TO_RESTORE so we can test restore
  await conn.execute(
    'UPDATE projects SET deleted_at = NOW(3) WHERE project_id = ?',
    [PROJ_TO_RESTORE],
  );
});

afterAll(async () => {
  await conn.execute(
    `DELETE FROM projects WHERE project_id IN (?, ?, ?)`,
    [PROJ_TO_DELETE, PROJ_TO_RESTORE, PROJ_OTHER_USER],
  );
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

// ── DELETE /projects/:id ──────────────────────────────────────────────────────

describe('DELETE /projects/:id', () => {
  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).delete(`/projects/${PROJ_TO_DELETE}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the project does not exist', async () => {
    const res = await request(app)
      .delete(`/projects/${PROJ_NOT_FOUND}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the project belongs to another user', async () => {
    const res = await request(app)
      .delete(`/projects/${PROJ_OTHER_USER}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns 204 and soft-deletes the project on happy path', async () => {
    const res = await request(app)
      .delete(`/projects/${PROJ_TO_DELETE}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(204);

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT deleted_at FROM projects WHERE project_id = ?',
      [PROJ_TO_DELETE],
    );
    expect(rows[0]!['deleted_at']).not.toBeNull();
  });

  it('returns 404 when trying to delete an already-deleted project', async () => {
    // PROJ_TO_DELETE was deleted above
    const res = await request(app)
      .delete(`/projects/${PROJ_TO_DELETE}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /projects/:id/restore ────────────────────────────────────────────────

describe('POST /projects/:id/restore', () => {
  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).post(`/projects/${PROJ_TO_RESTORE}/restore`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the project belongs to another user', async () => {
    // Pre-soft-delete other project to test this path
    const tmpProjId = randomUUID();
    await conn.execute(
      `INSERT INTO projects (project_id, owner_user_id, title, deleted_at)
       VALUES (?, ?, ?, NOW(3)) ON DUPLICATE KEY UPDATE project_id = project_id`,
      [tmpProjId, OTHER_USER_ID, 'Tmp Other Deleted'],
    );
    const res = await request(app)
      .post(`/projects/${tmpProjId}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
    await conn.execute('DELETE FROM projects WHERE project_id = ?', [tmpProjId]);
  });

  it('returns 200 and the restored project on happy path', async () => {
    const res = await request(app)
      .post(`/projects/${PROJ_TO_RESTORE}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ projectId: PROJ_TO_RESTORE });

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT deleted_at FROM projects WHERE project_id = ?',
      [PROJ_TO_RESTORE],
    );
    expect(rows[0]!['deleted_at']).toBeNull();
  });

  it('returns 200 idempotently when restoring an already-active project', async () => {
    // PROJ_TO_RESTORE is now active from the test above
    const res = await request(app)
      .post(`/projects/${PROJ_TO_RESTORE}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ projectId: PROJ_TO_RESTORE });
  });

  it('returns 410 when the project does not exist at all', async () => {
    const res = await request(app)
      .post(`/projects/${PROJ_NOT_FOUND}/restore`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(410);
  });
});
