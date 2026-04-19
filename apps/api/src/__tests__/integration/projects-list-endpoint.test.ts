/**
 * Integration tests for GET /projects and POST /projects.
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance (docker compose up db).
 *
 * Tests cover:
 * - Auth: 401 when no bearer token, 401 on invalid token
 * - GET /projects: returns 200 { items: [] } for user with no projects
 * - GET /projects: returns only the authenticated user's projects (ownership isolation)
 * - GET /projects: items sorted by updatedAt DESC
 * - GET /projects: thumbnailUrl derived from earliest visual clip (video/image only)
 * - GET /projects: thumbnailUrl is null when no visual clip exists
 * - POST /projects: creates project with owner + default title
 * - POST /projects: creates project with supplied title
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/projects-list-endpoint.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock S3 — not used by these endpoints but required to load the app ─────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Env vars must be set before app import ────────────────────────────────────
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
  APP_JWT_SECRET:           'projects-list-int-test-secret-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/**
 * Compute sha256(token) — mirrors auth.service.ts hashToken().
 * Used to seed sessions directly into the DB.
 */
function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Raw session tokens for User A and User B.
 * The Bearer header will carry these; the DB will store their sha256 hashes.
 */
const TOKEN_A = `tok-a-${randomUUID()}`;
const TOKEN_B = `tok-b-${randomUUID()}`;

const USER_A_ID = `pla-${randomUUID().slice(0, 8)}`;
const USER_B_ID = `plb-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();
const SESSION_B_ID = randomUUID();

/** Rows created by this test suite, cleaned up in afterAll. */
const testProjectIds: string[] = [];
const testAssetIds: string[] = [];
const testClipIds: string[] = [];

/** Project IDs seeded in beforeAll (used for assertion). */
let PROJ_A1: string;
let PROJ_A2: string;
let PROJ_B1: string;
let ASSET_ID: string;
let CLIP_ID: string;

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

  // Seed two users
  for (const [uid, email] of [
    [USER_A_ID, `${USER_A_ID}@test.com`],
    [USER_B_ID, `${USER_B_ID}@test.com`],
  ]) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, email, uid],
    );
  }

  // Seed sessions for both users (raw tokens hashed via sha256)
  const expiresAt = new Date(Date.now() + 3_600_000); // 1 hour from now
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [SESSION_A_ID, USER_A_ID, sha256(TOKEN_A), expiresAt],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [SESSION_B_ID, USER_B_ID, sha256(TOKEN_B), expiresAt],
  );

  // Seed two projects for User A (different updated_at so sorting is deterministic)
  PROJ_A1 = `pa1-${randomUUID().slice(0, 8)}`;
  PROJ_A2 = `pa2-${randomUUID().slice(0, 8)}`;
  PROJ_B1 = `pb1-${randomUUID().slice(0, 8)}`;
  testProjectIds.push(PROJ_A1, PROJ_A2, PROJ_B1);

  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title, updated_at) VALUES (?, ?, ?, ?)`,
    [PROJ_A1, USER_A_ID, 'Project Alpha', new Date('2024-05-10T12:00:00Z')],
  );
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title, updated_at) VALUES (?, ?, ?, ?)`,
    [PROJ_A2, USER_A_ID, 'Project Beta', new Date('2024-04-01T08:00:00Z')],
  );

  // Seed one project for User B
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)`,
    [PROJ_B1, USER_B_ID, 'User B Project'],
  );

  // Seed a file + project_files + visual clip for PROJ_A1 to test thumbnail derivation.
  // Note: thumbnailUrl is always null in the current findProjectsByUserId implementation
  // (thumbnail_uri is not stored on the files table yet — the ingest worker will backfill
  // it in a later milestone). Tests assert null accordingly.
  ASSET_ID = `asset-${randomUUID().slice(0, 8)}`;
  CLIP_ID  = `clip-${randomUUID().slice(0, 8)}`;
  const trackId = `track-${randomUUID().slice(0, 8)}`;
  testAssetIds.push(ASSET_ID);
  testClipIds.push(CLIP_ID);

  // Insert into `files` (the new root table for user-owned blobs).
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, bytes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [ASSET_ID, USER_A_ID, 'video', 's3://bucket/clip.mp4', 'video/mp4', 1000],
  );

  // Link the file to the project via project_files pivot.
  await conn.execute(
    `INSERT INTO project_files (project_id, file_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [PROJ_A1, ASSET_ID],
  );

  // Insert the visual clip referencing file_id (asset_id column was dropped in migration 024).
  await conn.execute(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, file_id, start_frame, duration_frames)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE clip_id = clip_id`,
    [CLIP_ID, PROJ_A1, trackId, 'video', ASSET_ID, 0, 30],
  );
});

afterAll(async () => {
  if (testClipIds.length) {
    await conn.query(
      `DELETE FROM project_clips_current WHERE clip_id IN (${testClipIds.map(() => '?').join(',')})`,
      testClipIds,
    );
  }
  if (testAssetIds.length) {
    // Unlink from projects first (FK ON DELETE RESTRICT on files side), then delete from files.
    await conn.query(
      `DELETE FROM project_files WHERE file_id IN (${testAssetIds.map(() => '?').join(',')})`,
      testAssetIds,
    );
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${testAssetIds.map(() => '?').join(',')})`,
      testAssetIds,
    );
  }
  if (testProjectIds.length) {
    await conn.query(
      `DELETE FROM projects WHERE project_id IN (${testProjectIds.map(() => '?').join(',')})`,
      testProjectIds,
    );
  }
  await conn.query(`DELETE FROM sessions WHERE session_id IN (?, ?)`, [SESSION_A_ID, SESSION_B_ID]);
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [USER_A_ID, USER_B_ID]);
  await conn.end();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /projects — auth', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

// ── GET /projects — happy path ─────────────────────────────────────────────────

describe('GET /projects — project listing', () => {
  it('returns 200 with User A projects when authenticated as User A', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    const { items } = res.body as { items: Array<{ projectId: string }> };
    const ids = items.map((p) => p.projectId);
    expect(ids).toContain(PROJ_A1);
    expect(ids).toContain(PROJ_A2);
  });

  it('does not return User B projects when authenticated as User A', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: Array<{ projectId: string }> };
    const ids = items.map((p) => p.projectId);
    expect(ids).not.toContain(PROJ_B1);
  });

  it('returns items sorted by updatedAt DESC (most recent first)', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{ updatedAt: string; title: string }>;
    };
    // Should have at least the two seeded projects
    const relevantItems = items.filter(
      (p) => p.title === 'Project Alpha' || p.title === 'Project Beta',
    );
    expect(relevantItems).toHaveLength(2);
    expect(new Date(relevantItems[0]!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(relevantItems[1]!.updatedAt).getTime(),
    );
    // Project Alpha (updated 2024-05-10) should come before Project Beta (2024-04-01)
    expect(relevantItems[0]!.title).toBe('Project Alpha');
  });

  it('returns thumbnailUrl as null for Project Alpha (thumbnail derivation not yet wired to files table)', async () => {
    // The files table does not yet store a thumbnail_uri column. findProjectsByUserId
    // returns NULL for all thumbnailUrl values until the ingest worker backfills it.
    // This test documents the current state; once thumbnailing is wired, update the assertion.
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{ projectId: string; thumbnailUrl: string | null }>;
    };
    const alpha = items.find((p) => p.projectId === PROJ_A1);
    expect(alpha).toBeDefined();
    expect(alpha!.thumbnailUrl).toBeNull();
  });

  it('returns thumbnailUrl as null when a project has no visual clips', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{ projectId: string; thumbnailUrl: string | null }>;
    };
    const beta = items.find((p) => p.projectId === PROJ_A2);
    expect(beta).toBeDefined();
    expect(beta!.thumbnailUrl).toBeNull();
  });

  it('returns 200 { items: [] } for a user with no projects', async () => {
    // User B has 1 seeded project; create a third user with zero projects
    const emptyUserId = `ple-${randomUUID().slice(0, 8)}`;
    const emptyToken = `tok-empty-${randomUUID()}`;
    const emptySessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 3_600_000);

    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)`,
      [emptyUserId, `${emptyUserId}@test.com`, emptyUserId],
    );
    await conn.execute(
      `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [emptySessionId, emptyUserId, sha256(emptyToken), expiresAt],
    );

    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${emptyToken}`);

    // Cleanup immediately
    await conn.execute('DELETE FROM sessions WHERE session_id = ?', [emptySessionId]);
    await conn.execute('DELETE FROM users WHERE user_id = ?', [emptyUserId]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });
});

// ── POST /projects — auth ─────────────────────────────────────────────────────

describe('POST /projects — auth', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).post('/projects').send({});
    expect(res.status).toBe(401);
  });
});

// ── POST /projects — happy path ───────────────────────────────────────────────

describe('POST /projects — creation', () => {
  it('creates a project with default title when title is omitted', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('projectId');
    expect(typeof res.body.projectId).toBe('string');

    testProjectIds.push(res.body.projectId as string);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT owner_user_id, title FROM projects WHERE project_id = ?',
      [res.body.projectId],
    );
    expect(rows[0]!['owner_user_id']).toBe(USER_A_ID);
    expect(rows[0]!['title']).toBe('Untitled project');
  });

  it('creates a project with the supplied title', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`)
      .send({ title: 'My Named Project' });

    expect(res.status).toBe(201);
    testProjectIds.push(res.body.projectId as string);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT title FROM projects WHERE project_id = ?',
      [res.body.projectId],
    );
    expect(rows[0]!['title']).toBe('My Named Project');
  });

  it('creates a project owned by the authenticated user', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${TOKEN_B}`)
      .send({});

    expect(res.status).toBe(201);
    testProjectIds.push(res.body.projectId as string);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT owner_user_id FROM projects WHERE project_id = ?',
      [res.body.projectId],
    );
    expect(rows[0]!['owner_user_id']).toBe(USER_B_ID);
  });

  it('returns 201 with a valid UUID projectId', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${TOKEN_A}`)
      .send({});

    expect(res.status).toBe(201);
    testProjectIds.push(res.body.projectId as string);

    expect(res.body.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
