/**
 * Integration tests for GET /generation-drafts/:id/assets.
 *
 * Verifies the envelope shape fix (subtask 6):
 *   (i)   Empty draft  → 200 { items: [], nextCursor: null, totals: { count: 0, bytesUsed: 0 } }
 *   (ii)  Draft with 2 linked files → 200 envelope with 2 items
 *   (iii) Unauthorized — another user's draft → 403
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/generation-drafts-assets.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

import {
  seedFixtures,
  teardownFixtures,
  type SeedResult,
} from './file-links-endpoints.fixtures.js';

// ── Mock S3 presigner ─────────────────────────────────────────────────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-draft-assets-url'),
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
  APP_JWT_SECRET:           'draft-assets-int-test-secret-32chars!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let seed: SeedResult;

/** Extra IDs created inside tests — cleaned up in afterAll. */
const extraDraftIds: string[] = [];
const extraFileIds: string[] = [];

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

  seed = await seedFixtures(conn);
});

afterAll(async () => {
  if (extraFileIds.length) {
    const ph = extraFileIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM draft_files WHERE file_id IN (${ph})`, extraFileIds);
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, extraFileIds);
  }
  if (extraDraftIds.length) {
    const ph = extraDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM draft_files WHERE draft_id IN (${ph})`, extraDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, extraDraftIds);
  }
  await teardownFixtures(conn, seed);
  await conn.end();
});

// ── Helper: insert a draft-linked file ────────────────────────────────────────

async function insertFile(
  userId: string,
  opts: { mimeType: string; bytes?: number },
): Promise<string> {
  const fileId = randomUUID();
  extraFileIds.push(fileId);
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      fileId,
      userId,
      opts.mimeType.startsWith('video') ? 'video' : opts.mimeType.startsWith('image') ? 'image' : 'audio',
      `s3://test-bucket/${fileId}`,
      opts.mimeType,
      `file-${fileId.slice(0, 8)}`,
      opts.bytes ?? 1024,
    ],
  );
  return fileId;
}

async function linkFileToDraft(draftId: string, fileId: string): Promise<void> {
  await conn.execute(
    `INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)`,
    [draftId, fileId],
  );
}

// ── (i) Empty draft ───────────────────────────────────────────────────────────

describe('GET /generation-drafts/:id/assets — empty draft', () => {
  it('returns 200 with { items: [], nextCursor: null, totals: { count: 0, bytesUsed: 0 } }', async () => {
    const draftId = randomUUID();
    extraDraftIds.push(draftId);
    await conn.execute(
      `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
      [draftId, seed.userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    const res = await request(app)
      .get(`/generation-drafts/${draftId}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    // Must be an envelope object, not a bare array
    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body).toMatchObject({
      items: [],
      nextCursor: null,
      totals: { count: 0, bytesUsed: 0 },
    });
  });
});

// ── (ii) Draft with 2 linked files ────────────────────────────────────────────

describe('GET /generation-drafts/:id/assets — draft with linked files', () => {
  it('returns 200 envelope with 2 items when draft has 2 linked files', async () => {
    const draftId = randomUUID();
    extraDraftIds.push(draftId);
    await conn.execute(
      `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
      [draftId, seed.userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    const fileId1 = await insertFile(seed.userAId, { mimeType: 'video/mp4', bytes: 2048 });
    const fileId2 = await insertFile(seed.userAId, { mimeType: 'image/png', bytes: 512 });
    await linkFileToDraft(draftId, fileId1);
    await linkFileToDraft(draftId, fileId2);

    const res = await request(app)
      .get(`/generation-drafts/${draftId}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.totals.count).toBe(2);
    expect(res.body.totals.bytesUsed).toBe(2560); // 2048 + 512

    const ids = (res.body.items as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(fileId1);
    expect(ids).toContain(fileId2);
  });

  it('each item in the envelope has the expected AssetApiResponse fields', async () => {
    const draftId = randomUUID();
    extraDraftIds.push(draftId);
    await conn.execute(
      `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
      [draftId, seed.userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    const fileId = await insertFile(seed.userAId, { mimeType: 'video/mp4', bytes: 1000 });
    await linkFileToDraft(draftId, fileId);

    const res = await request(app)
      .get(`/generation-drafts/${draftId}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const item = (res.body.items as Array<Record<string, unknown>>).find((f) => f['id'] === fileId);
    expect(item).toBeDefined();
    expect(typeof item!['id']).toBe('string');
    expect(typeof item!['contentType']).toBe('string');
    expect(typeof item!['downloadUrl']).toBe('string');
    expect(typeof item!['status']).toBe('string');
    expect(typeof item!['createdAt']).toBe('string');
    expect(typeof item!['updatedAt']).toBe('string');
    expect('thumbnailUri' in item!).toBe(true);
    expect('waveformPeaks' in item!).toBe(true);
  });
});

// ── (iii) Unauthorized — another user's draft → 403 ──────────────────────────

describe('GET /generation-drafts/:id/assets — authorization', () => {
  it('returns 403 when the draft is owned by a different user', async () => {
    const draftId = randomUUID();
    extraDraftIds.push(draftId);
    // Draft owned by user A
    await conn.execute(
      `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
      [draftId, seed.userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    // User B tries to read it
    const res = await request(app)
      .get(`/generation-drafts/${draftId}/assets`)
      .set('Authorization', `Bearer ${seed.tokenB}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`);
    expect(res.status).toBe(401);
  });
});
