/**
 * Integration tests for GET /generation-drafts/cards — shape, truncation, mediaPreviews cap,
 * dangling-ref resilience, and DB state verification.
 * Auth/listing/ownership tests live in generation-drafts-cards.endpoint.test.ts
 * (split for §9 300-line cap compliance). Seed pattern: Files-as-Root (migration 027+).
 *
 * Run: APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/generation-drafts-cards.shape.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
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
  APP_JWT_SECRET:           'cards-shape-int-test-secret-32ch!!!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

// ── Test identifiers ──────────────────────────────────────────────────────────

const TOKEN_A = `tok-shape-a-${randomUUID()}`;
const USER_A_ID = `shp-a-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();

/** Draft seeded with 5 media refs + 1 deleted ref. */
let DRAFT_A_MANY_REFS: string;
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

  // Seed User A
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [USER_A_ID, `${USER_A_ID}@shape-test.com`, USER_A_ID],
  );

  // Seed session for User A
  const expiresAt = new Date(Date.now() + 3_600_000);
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [SESSION_A_ID, USER_A_ID, sha256(TOKEN_A), expiresAt],
  );

  // Seed a project for User A (project_files requires a valid project_id FK).
  TEST_PROJECT_ID = `shp-proj-${randomUUID().slice(0, 8)}`;
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [TEST_PROJECT_ID, USER_A_ID, 'Shape Test Project'],
  );

  // Seed 5 real files into `files` (Files-as-Root) + link to project via project_files pivot.
  const fileData: Array<[string, string]> = [
    [`shp-v-${randomUUID().slice(0, 8)}`, 'video/mp4'],
    [`shp-i1-${randomUUID().slice(0, 8)}`, 'image/jpeg'],
    [`shp-i2-${randomUUID().slice(0, 8)}`, 'image/png'],
    [`shp-i3-${randomUUID().slice(0, 8)}`, 'image/png'],
    [`shp-i4-${randomUUID().slice(0, 8)}`, 'image/gif'],
  ];
  for (const [fileId, mimeType] of fileData) {
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE file_id = file_id`,
      [fileId, USER_A_ID, mimeToKind(mimeType), `s3://bucket/${fileId}`, mimeType, 1000],
    );
    await conn.execute(
      `INSERT INTO project_files (project_id, file_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE project_id = project_id`,
      [TEST_PROJECT_ID, fileId],
    );
    seededFileIds.push(fileId);
  }

  // The "deleted" file id — never inserted into `files`, simulating a dangling reference.
  const deletedFileId = `shp-dead-${randomUUID().slice(0, 8)}`;

  // Draft A: 5 real media refs + 1 deleted ref (6 total), plus a long text block.
  DRAFT_A_MANY_REFS = randomUUID();
  const longText = 'X'.repeat(200); // will be truncated to 140 in the preview
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
});

afterAll(async () => {
  if (DRAFT_A_MANY_REFS) {
    await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [DRAFT_A_MANY_REFS]);
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
  await conn.execute('DELETE FROM sessions WHERE session_id = ?', [SESSION_A_ID]);
  await conn.execute('DELETE FROM users WHERE user_id = ?', [USER_A_ID]);
  await conn.end();
});

// ── Shape + data validation ────────────────────────────────────────────────────

describe('GET /generation-drafts/cards — shape and data validation', () => {
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
        // thumbnailUrl is null — `files` table has no thumbnail_uri column yet.
        // Files-as-Root thumbnail backfill pending (later milestone).
        mediaPreviews: Array<{ fileId: string; type: string; thumbnailUrl: string | null }>;
        updatedAt: string;
      }>;
    };
    const card = items.find((c) => c.draftId === DRAFT_A_MANY_REFS);
    expect(card).toBeDefined();
    expect(card!.status).toBe('step2');
    expect(typeof card!.textPreview).toBe('string');
    expect(Array.isArray(card!.mediaPreviews)).toBe(true);
    expect(typeof card!.updatedAt).toBe('string');

    for (const preview of card!.mediaPreviews) {
      expect(preview).toHaveProperty('fileId');
      expect(preview).toHaveProperty('type');
      expect(preview).toHaveProperty('thumbnailUrl');
      // thumbnailUrl is null until the ingest worker backfills it on the files table.
      expect(preview.thumbnailUrl).toBeNull();
    }
  });

  it('does not 500 when a referenced asset is deleted (dangling ref silently skipped)', async () => {
    const res = await request(app)
      .get('/generation-drafts/cards')
      .set('Authorization', `Bearer ${TOKEN_A}`);

    expect(res.status).toBe(200);
    const { items } = res.body as { items: Array<{ draftId: string }> };
    expect(items.some((c) => c.draftId === DRAFT_A_MANY_REFS)).toBe(true);
  });
});

// ── DB state verification ─────────────────────────────────────────────────────

describe('GET /generation-drafts/cards — DB state', () => {
  it('the seeded draft has status step2 in the DB', async () => {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT status FROM generation_drafts WHERE id = ?',
      [DRAFT_A_MANY_REFS],
    );
    expect(rows[0]!['status']).toBe('step2');
  });
});
