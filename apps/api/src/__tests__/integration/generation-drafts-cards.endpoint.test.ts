/**
 * Integration tests for GET /generation-drafts/cards — auth, listing, ownership, routing.
 * Shape/data-validation tests live in generation-drafts-cards.shape.test.ts
 * (split for §9 300-line cap compliance). Seed pattern: Files-as-Root (migration 027+).
 *
 * Run: APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/generation-drafts-cards.endpoint.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';
import { sha256, makePromptDoc, mimeToKind } from './generation-drafts-cards.fixtures.js';

// ── Mock S3 + presigner — not used by these endpoints but required to load app
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Env vars must be set before app import ─────────────────────────────────
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
  APP_JWT_SECRET:           'cards-endpoint-int-test-secret-32ch!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

// ── Test identifiers ──────────────────────────────────────────────────────────

const TOKEN_A = `tok-cards-a-${randomUUID()}`;
const TOKEN_B = `tok-cards-b-${randomUUID()}`;

const USER_A_ID = `crd-a-${randomUUID().slice(0, 8)}`;
const USER_B_ID = `crd-b-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();
const SESSION_B_ID = randomUUID();

/** Draft seeded with 5 media refs + 1 deleted ref. */
let DRAFT_A_MANY_REFS: string;
/** Draft seeded for User B (must NOT appear in User A responses). */
let DRAFT_B_ID: string;
/** File IDs seeded in beforeAll — used for pivot + file cleanup. */
const seededFileIds: string[] = [];
/** Project ID used to satisfy FK on project_files. */
let TEST_PROJECT_ID: string;

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

  // Seed users
  for (const [uid, email] of [
    [USER_A_ID, `${USER_A_ID}@cards-test.com`],
    [USER_B_ID, `${USER_B_ID}@cards-test.com`],
  ]) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, email, uid],
    );
  }

  // Seed sessions
  const expiresAt = new Date(Date.now() + 3_600_000);
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [SESSION_A_ID, USER_A_ID, sha256(TOKEN_A), expiresAt],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [SESSION_B_ID, USER_B_ID, sha256(TOKEN_B), expiresAt],
  );

  // Seed a project for User A (project_files requires a valid project_id FK).
  TEST_PROJECT_ID = `crd-proj-${randomUUID().slice(0, 8)}`;
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [TEST_PROJECT_ID, USER_A_ID, 'Cards Test Project'],
  );

  // Seed 5 real files into `files` (Files-as-Root) + link to project via project_files pivot.
  const fileData: Array<[string, string]> = [
    [`crd-v-${randomUUID().slice(0, 8)}`, 'video/mp4'],
    [`crd-i1-${randomUUID().slice(0, 8)}`, 'image/jpeg'],
    [`crd-i2-${randomUUID().slice(0, 8)}`, 'image/png'],
    [`crd-i3-${randomUUID().slice(0, 8)}`, 'image/png'],
    [`crd-i4-${randomUUID().slice(0, 8)}`, 'image/gif'],
  ];
  for (const [fileId, mimeType] of fileData) {
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE file_id = file_id`,
      [fileId, USER_A_ID, mimeToKind(mimeType), `s3://bucket/${fileId}`, mimeType, 1000],
    );
    await conn.execute(
      `INSERT INTO project_files (project_id, file_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE project_id = project_id`,
      [TEST_PROJECT_ID, fileId],
    );
    seededFileIds.push(fileId);
  }

  const deletedFileId = `crd-dead-${randomUUID().slice(0, 8)}`;

  // Draft A: 5 real media refs + 1 deleted ref (6 total), plus a long text block.
  DRAFT_A_MANY_REFS = randomUUID();
  const longText = 'X'.repeat(200);
  const blocksMany = [
    { type: 'text', value: longText },
    { type: 'media-ref', mediaType: 'video', fileId: fileData[0]![0], label: 'V' },
    { type: 'media-ref', mediaType: 'image', fileId: fileData[1]![0], label: 'I1' },
    { type: 'media-ref', mediaType: 'image', fileId: fileData[2]![0], label: 'I2' },
    { type: 'media-ref', mediaType: 'image', fileId: fileData[3]![0], label: 'I3' },
    { type: 'media-ref', mediaType: 'image', fileId: fileData[4]![0], label: 'I4' },
    { type: 'media-ref', mediaType: 'image', fileId: deletedFileId, label: 'deleted' },
  ];
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)`,
    [DRAFT_A_MANY_REFS, USER_A_ID, makePromptDoc(blocksMany), 'step2'],
  );

  // Draft B: owned by User B
  DRAFT_B_ID = randomUUID();
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)`,
    [DRAFT_B_ID, USER_B_ID, makePromptDoc([{ type: 'text', value: 'User B only' }]), 'draft'],
  );
});

afterAll(async () => {
  if (DRAFT_A_MANY_REFS || DRAFT_B_ID) {
    const draftIds = [DRAFT_A_MANY_REFS, DRAFT_B_ID].filter(Boolean);
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${draftIds.map(() => '?').join(',')})`,
      draftIds,
    );
  }
  if (seededFileIds.length) {
    await conn.query(
      `DELETE FROM project_files WHERE file_id IN (${seededFileIds.map(() => '?').join(',')})`,
      seededFileIds,
    );
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${seededFileIds.map(() => '?').join(',')})`,
      seededFileIds,
    );
  }
  if (TEST_PROJECT_ID) {
    await conn.execute('DELETE FROM projects WHERE project_id = ?', [TEST_PROJECT_ID]);
  }
  await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [SESSION_A_ID, SESSION_B_ID]);
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_A_ID, USER_B_ID]);
  await conn.end();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /generation-drafts/cards — auth', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/generation-drafts/cards');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

// ── Happy paths ────────────────────────────────────────────────────────────────

describe('GET /generation-drafts/cards — listing', () => {
  it('returns 200 { items: [] } for a user with no drafts', async () => {
    const emptyUserId = `crd-empty-${randomUUID().slice(0, 8)}`;
    const emptyToken = `tok-crd-empty-${randomUUID()}`;
    const emptySessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 3_600_000);

    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)`,
      [emptyUserId, `${emptyUserId}@cards-test.com`, emptyUserId],
    );
    await conn.execute(
      `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [emptySessionId, emptyUserId, sha256(emptyToken), expiresAt],
    );

    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${emptyToken}`);

    await conn.execute('DELETE FROM sessions WHERE session_id = ?', [emptySessionId]);
    await conn.execute('DELETE FROM users WHERE user_id = ?', [emptyUserId]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('returns 200 with User A draft when authenticated as User A', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    const { items } = res.body as { items: unknown[] };
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('does not return User B draft when authenticated as User A', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: Array<{ draftId: string }> };
    expect(items.map((c) => c.draftId)).not.toContain(DRAFT_B_ID);
  });

  it('verifies that /generation-drafts/cards route is not swallowed by /:id param route', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('returns the status field on each card', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{ draftId: string; status: string }>;
    };
    const card = items.find((c) => c.draftId === DRAFT_A_MANY_REFS);
    expect(card!.status).toMatch(/^(draft|step2|step3|completed)$/);
  });
});
