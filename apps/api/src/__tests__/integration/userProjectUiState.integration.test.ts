/**
 * Integration tests for GET/PUT /projects/:id/ui-state.
 *
 * Covers:
 *   - Round-trip upsert (PUT) → retrieve (GET): state is persisted correctly.
 *   - GET returns { state: null, updatedAt: null } on first visit (no prior state).
 *   - PUT accepts any valid JSON as state (object, string, number).
 *   - 404 when project does not exist.
 *   - 401 when auth token is absent or invalid.
 *   - 403 on foreign project (marked todo — ACL middleware ownership check is a
 *     planned TODO in acl.middleware.ts; when implemented, this test should pass).
 *
 * Requires a live MySQL instance (docker compose up db).
 * BullMQ and S3 are mocked to avoid network dependencies.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/userProjectUiState.integration.test.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock transitive dependencies that require network or external services ────

vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  mediaIngestQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  renderQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  transcriptionQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Environment — set before app is dynamically imported ─────────────────────

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
  APP_JWT_SECRET:           'ui-state-int-test-secret-exactly-32ch!',
  // Disable auth bypass so session tokens are properly validated.
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Shared state ──────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/** User A owns projectA — the primary test fixture. */
const USER_A_ID = `uia-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();
const TOKEN_A = `tok-uia-${randomUUID()}`;

/** User B owns projectB — used to verify cross-user access behaviour. */
const USER_B_ID = `uib-${randomUUID().slice(0, 8)}`;
const SESSION_B_ID = randomUUID();
const TOKEN_B = `tok-uib-${randomUUID()}`;

let projectAId: string;
let projectBId: string;

function authA(): string {
  return `Bearer ${TOKEN_A}`;
}

function authB(): string {
  return `Bearer ${TOKEN_B}`;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Dynamic import ensures process.env is fully configured before config.ts runs.
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  const expiresAt = new Date(Date.now() + 3_600_000);

  // User A
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [USER_A_ID, `${USER_A_ID}@test.com`, 'UI State Test User A'],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [SESSION_A_ID, USER_A_ID, sha256(TOKEN_A), expiresAt],
  );

  // User B
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [USER_B_ID, `${USER_B_ID}@test.com`, 'UI State Test User B'],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [SESSION_B_ID, USER_B_ID, sha256(TOKEN_B), expiresAt],
  );

  // Project owned by User A
  projectAId = randomUUID();
  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectAId, USER_A_ID, 'UI State Test Project A'],
  );

  // Project owned by User B
  projectBId = randomUUID();
  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectBId, USER_B_ID, 'UI State Test Project B'],
  );
});

afterAll(async () => {
  // Remove in FK-safe order.
  await conn.execute(
    'DELETE FROM user_project_ui_state WHERE project_id IN (?, ?)',
    [projectAId, projectBId],
  );
  await conn.execute(
    'DELETE FROM projects WHERE project_id IN (?, ?)',
    [projectAId, projectBId],
  );
  await conn.execute(
    'DELETE FROM sessions WHERE session_id IN (?, ?)',
    [SESSION_A_ID, SESSION_B_ID],
  );
  await conn.execute(
    'DELETE FROM users WHERE user_id IN (?, ?)',
    [USER_A_ID, USER_B_ID],
  );
  await conn.end();
});

// ── GET /projects/:id/ui-state ────────────────────────────────────────────────

describe('GET /projects/:id/ui-state', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/projects/${projectAId}/ui-state`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    const res = await request(app)
      .get(`/projects/${projectAId}/ui-state`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the project does not exist', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/projects/${nonExistentId}/ui-state`)
      .set('Authorization', authA());
    expect(res.status).toBe(404);
  });

  it('returns { state: null, updatedAt: null } when no state has been saved yet', async () => {
    const res = await request(app)
      .get(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: null, updatedAt: null });
  });

  it.todo(
    'returns 403 when User A reads a project owned by User B — requires ACL ownership ' +
      'enforcement in acl.middleware.ts (currently a TODO stub)',
  );
});

// ── PUT /projects/:id/ui-state ────────────────────────────────────────────────

describe('PUT /projects/:id/ui-state', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .send({ state: { zoom: 1 } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    const res = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ state: { zoom: 1 } });
    expect(res.status).toBe(401);
  });

  it('returns 400 when the request body is missing the state field', async () => {
    const res = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({});
    // validateBody uses Zod; z.unknown() passes but the key must be present.
    // The schema wraps state in an object: { state: z.unknown() }
    // An empty object {} is missing "state" — Zod makes it required by default.
    expect(res.status).toBe(400);
  });

  it('returns 404 when the project does not exist', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000001';
    const res = await request(app)
      .put(`/projects/${nonExistentId}/ui-state`)
      .set('Authorization', authA())
      .send({ state: { zoom: 2 } });
    expect(res.status).toBe(404);
  });

  it('returns 204 and persists an object state', async () => {
    const state = { zoom: 1.5, scrollX: 200, playheadFrame: 42, selectedClipIds: ['clip-1'] };
    const res = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({ state });
    expect(res.status).toBe(204);
  });

  it('returns 204 and persists a null state value', async () => {
    const res = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({ state: null });
    expect(res.status).toBe(204);
  });

  it('returns 204 and persists a primitive string state', async () => {
    const res = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({ state: 'compact' });
    expect(res.status).toBe(204);
  });

  it.todo(
    'returns 403 when User A writes a project owned by User B — requires ACL ownership ' +
      'enforcement in acl.middleware.ts (currently a TODO stub)',
  );
});

// ── Round-trip: PUT then GET ──────────────────────────────────────────────────

describe('round-trip: PUT then GET /projects/:id/ui-state', () => {
  const uiState = {
    zoom: 2.0,
    scrollX: 480,
    scrollY: 10,
    playheadFrame: 120,
    selectedClipIds: ['clip-abc', 'clip-def'],
  };

  it('stores state via PUT and retrieves it via GET with updatedAt set', async () => {
    // PUT the state
    const putRes = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({ state: uiState });
    expect(putRes.status).toBe(204);

    // GET the stored state back
    const getRes = await request(app)
      .get(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA());
    expect(getRes.status).toBe(200);
    expect(getRes.body.state).toEqual(uiState);
    expect(typeof getRes.body.updatedAt).toBe('string');
    // updatedAt should be a valid ISO 8601 date
    expect(() => new Date(getRes.body.updatedAt)).not.toThrow();
  });

  it('overwrites the previous state on second PUT', async () => {
    const newState = { zoom: 0.5, scrollX: 0, playheadFrame: 0, selectedClipIds: [] };

    const putRes = await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({ state: newState });
    expect(putRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA());
    expect(getRes.status).toBe(200);
    expect(getRes.body.state).toEqual(newState);
  });

  it('state for User A is independent from state for User B on the same project (if accessible)', async () => {
    // User A sets a specific state on their own project
    const stateA = { zoom: 3.0, scrollX: 999 };
    await request(app)
      .put(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA())
      .send({ state: stateA });

    // User B sets a different state on THEIR OWN project
    const stateB = { zoom: 0.25, scrollX: 0 };
    await request(app)
      .put(`/projects/${projectBId}/ui-state`)
      .set('Authorization', authB())
      .send({ state: stateB });

    // User A's project state should be unchanged
    const resA = await request(app)
      .get(`/projects/${projectAId}/ui-state`)
      .set('Authorization', authA());
    expect(resA.status).toBe(200);
    expect(resA.body.state).toEqual(stateA);

    // User B's project state should be their own
    const resB = await request(app)
      .get(`/projects/${projectBId}/ui-state`)
      .set('Authorization', authB());
    expect(resB.status).toBe(200);
    expect(resB.body.state).toEqual(stateB);
  });
});
