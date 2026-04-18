/**
 * Integration tests for GET /generation-drafts/cards.
 *
 * Verifies the full Express → middleware → service → repository → DB chain
 * against a real MySQL instance.
 *
 * Tests cover:
 * - Auth: 401 when no bearer token
 * - 200 { items: [] } for a user with no drafts
 * - 200 with the correct card shape for a user with one draft
 * - textPreview truncated to 140 chars
 * - mediaPreviews capped at 3 (draft with 5 media refs returns only 3)
 * - Dangling asset ref silently skipped (not a 500)
 * - Ownership isolation: User B's drafts not returned to User A
 * - Route ordering: /cards is not swallowed by /:id
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/generation-drafts-cards-endpoint.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';

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

/** Compute sha256(token) — mirrors auth.service.ts hashToken(). */
function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Build a minimal valid PromptDoc with the given blocks. */
function makePromptDoc(blocks: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, blocks });
}

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
/** Asset IDs seeded in beforeAll — used for assertion + cleanup. */
const seededAssetIds: string[] = [];
/** Project ID used to satisfy FK on project_assets_current. */
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

  // Seed a project for User A (assets require a project_id FK).
  TEST_PROJECT_ID = `crd-proj-${randomUUID().slice(0, 8)}`;
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [TEST_PROJECT_ID, USER_A_ID, 'Cards Test Project'],
  );

  // Seed 5 real assets + 1 "deleted" (never inserted) asset id
  const assetData: Array<[string, string]> = [
    [`crd-v-${randomUUID().slice(0, 8)}`, 'video/mp4'],
    [`crd-i1-${randomUUID().slice(0, 8)}`, 'image/jpeg'],
    [`crd-i2-${randomUUID().slice(0, 8)}`, 'image/png'],
    [`crd-i3-${randomUUID().slice(0, 8)}`, 'image/png'],
    [`crd-i4-${randomUUID().slice(0, 8)}`, 'image/gif'],
  ];
  for (const [assetId, contentType] of assetData) {
    await conn.execute(
      `INSERT INTO project_assets_current
         (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri, thumbnail_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE asset_id = asset_id`,
      [
        assetId,
        TEST_PROJECT_ID,
        USER_A_ID,
        `${assetId}.file`,
        contentType,
        1000,
        `s3://bucket/${assetId}`,
        `s3://bucket/${assetId}_thumb.jpg`,
      ],
    );
    seededAssetIds.push(assetId);
  }

  // The "deleted" asset id — never inserted into project_assets_current
  const deletedAssetId = `crd-dead-${randomUUID().slice(0, 8)}`;

  // Draft A: 5 real media refs + 1 deleted ref (6 total), plus a long text block
  DRAFT_A_MANY_REFS = randomUUID();
  const longText = 'X'.repeat(200); // will be truncated to 140 in the preview
  const blocksMany = [
    { type: 'text', value: longText },
    { type: 'media-ref', mediaType: 'video', assetId: assetData[0]![0], label: 'V' },
    { type: 'media-ref', mediaType: 'image', assetId: assetData[1]![0], label: 'I1' },
    { type: 'media-ref', mediaType: 'image', assetId: assetData[2]![0], label: 'I2' },
    { type: 'media-ref', mediaType: 'image', assetId: assetData[3]![0], label: 'I3' },
    { type: 'media-ref', mediaType: 'image', assetId: assetData[4]![0], label: 'I4' },
    { type: 'media-ref', mediaType: 'image', assetId: deletedAssetId, label: 'deleted' },
  ];
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)`,
    [DRAFT_A_MANY_REFS, USER_A_ID, makePromptDoc(blocksMany), 'step2'],
  );

  // Draft B: owned by User B
  DRAFT_B_ID = randomUUID();
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)`,
    [
      DRAFT_B_ID,
      USER_B_ID,
      makePromptDoc([{ type: 'text', value: 'User B only' }]),
      'draft',
    ],
  );
});

afterAll(async () => {
  // Clean up drafts
  await conn.execute(
    `DELETE FROM generation_drafts WHERE id IN (?, ?)`,
    [DRAFT_A_MANY_REFS, DRAFT_B_ID],
  );

  // Clean up assets
  if (seededAssetIds.length) {
    await conn.query(
      `DELETE FROM project_assets_current WHERE asset_id IN (${seededAssetIds.map(() => '?').join(',')})`,
      seededAssetIds,
    );
  }

  // Clean up project
  await conn.execute('DELETE FROM projects WHERE project_id = ?', [TEST_PROJECT_ID]);

  // Clean up sessions and users
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
    // Create a fresh user with no drafts
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

    // Cleanup
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

  it('truncates textPreview to 140 characters', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{ draftId: string; textPreview: string }>;
    };
    const card = items.find((c) => c.draftId === DRAFT_A_MANY_REFS);
    expect(card).toBeDefined();
    expect(card!.textPreview).toHaveLength(140);
    expect(card!.textPreview).toBe('X'.repeat(140));
  });

  it('returns at most 3 mediaPreviews even when 5 real refs + 1 deleted ref exist', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{ draftId: string; mediaPreviews: unknown[] }>;
    };
    const card = items.find((c) => c.draftId === DRAFT_A_MANY_REFS);
    expect(card).toBeDefined();
    expect(card!.mediaPreviews.length).toBeLessThanOrEqual(3);
    expect(card!.mediaPreviews.length).toBe(3);
  });

  it('does not return User B draft when authenticated as User A', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: Array<{ draftId: string }> };
    const ids = items.map((c) => c.draftId);
    expect(ids).not.toContain(DRAFT_B_ID);
  });

  it('returns a card with the correct shape', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as {
      items: Array<{
        draftId: string;
        status: string;
        textPreview: string;
        mediaPreviews: Array<{ assetId: string; type: string; thumbnailUrl: string | null }>;
        updatedAt: string;
      }>;
    };
    const card = items.find((c) => c.draftId === DRAFT_A_MANY_REFS);
    expect(card).toBeDefined();
    expect(card!.status).toBe('step2');
    expect(typeof card!.textPreview).toBe('string');
    expect(Array.isArray(card!.mediaPreviews)).toBe(true);
    expect(typeof card!.updatedAt).toBe('string');

    // Each mediaPreview must have assetId, type, thumbnailUrl
    for (const preview of card!.mediaPreviews) {
      expect(preview).toHaveProperty('assetId');
      expect(preview).toHaveProperty('type');
      expect(preview).toHaveProperty('thumbnailUrl');
    }
  });

  it('does not 500 when a referenced asset is deleted (dangling ref silently skipped)', async () => {
    // DRAFT_A_MANY_REFS includes a reference to a non-existent deletedAssetId
    // The endpoint must still return 200 — not 500.
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    // The card should still appear; just with fewer mediaPreviews than total refs
    const { items } = res.body as { items: Array<{ draftId: string }> };
    expect(items.some((c) => c.draftId === DRAFT_A_MANY_REFS)).toBe(true);
  });

  it('verifies that /generation-drafts/cards route is not swallowed by /:id param route', async () => {
    // This would return 404 or parse 'cards' as an id if route order were wrong.
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    // Must be 200 { items: [...] } — not 404 "cards not found" from the /:id handler
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

// ── DB row check: verify status column is read correctly ──────────────────────

describe('GET /generation-drafts/cards — DB state', () => {
  it('the seeded draft has status step2 in the DB', async () => {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT status FROM generation_drafts WHERE id = ?',
      [DRAFT_A_MANY_REFS],
    );
    expect(rows[0]!['status']).toBe('step2');
  });
});
