/**
 * Integration tests for file-links endpoints — draft side.
 *
 * Covers:
 *   POST /generation-drafts/:draftId/files — link a file to a draft
 *   GET  /generation-drafts/:id/assets     — pivot-backed read (draft_files → files)
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/file-links-endpoints.draft.test.ts
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

// ── Mock S3 — not used by link endpoints; needed to load the app ─────────────
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
  APP_JWT_SECRET:           'file-links-draft-int-test-secret-32!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let seed: SeedResult;

/** Extra draft IDs created inside tests — cleaned up in afterAll. */
const extraDraftIds: string[] = [];

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
  if (extraDraftIds.length) {
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${extraDraftIds.map(() => '?').join(',')})`,
      extraDraftIds,
    );
  }
  await teardownFixtures(conn, seed);
  await conn.end();
});

// ── POST /generation-drafts/:draftId/files — auth ────────────────────────────

describe('POST /generation-drafts/:draftId/files — auth', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(401);
  });

  it('returns 401 on an invalid token', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', 'Bearer bad-token')
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(401);
  });
});

// ── POST /generation-drafts/:draftId/files — validation ──────────────────────

describe('POST /generation-drafts/:draftId/files — input validation', () => {
  it('returns 400 when fileId is missing', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileId is not a UUID', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

// ── POST /generation-drafts/:draftId/files — ownership checks ────────────────

describe('POST /generation-drafts/:draftId/files — ownership checks', () => {
  it('returns 403 when the draft is owned by a different user', async () => {
    // User B tries to link to User A's draft
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenB}`)
      .send({ fileId: seed.fileB });
    expect(res.status).toBe(403);
  });

  it('returns 403 when the file is owned by a different user', async () => {
    // User A tries to link User B's file to User A's draft
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileB });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the draft does not exist', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${randomUUID()}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: randomUUID() });
    expect(res.status).toBe(404);
  });
});

// ── POST /generation-drafts/:draftId/files — happy path ──────────────────────

describe('POST /generation-drafts/:draftId/files — link success', () => {
  it('returns 204 when linking a file to a draft', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(204);
  });

  it('is idempotent — double-linking returns 204 without error', async () => {
    // First link (may already exist)
    await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });

    // Second link must not produce a duplicate-key error
    const res = await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(204);
  });
});

// ── GET /generation-drafts/:id/assets — pivot-backed read ────────────────────

describe('GET /generation-drafts/:id/assets — pivot read', () => {
  it('returns 200 with the envelope { items, nextCursor, totals } containing the linked file', async () => {
    // Ensure the file is linked
    await request(app)
      .post(`/generation-drafts/${seed.draftA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });

    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    // Body must be an envelope object, NOT a bare array
    expect(Array.isArray(res.body)).toBe(false);
    expect(typeof res.body).toBe('object');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.nextCursor).toBeNull();
    expect(typeof res.body.totals).toBe('object');

    const files = res.body.items as Array<{ id: string }>;
    expect(files.some((f) => f.id === seed.fileA)).toBe(true);
  });

  it('returns 200 with empty items array and zero totals for a draft with no linked files', async () => {
    const emptyDraftId = randomUUID();
    extraDraftIds.push(emptyDraftId);

    await conn.execute(
      `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
      [emptyDraftId, seed.userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    const res = await request(app)
      .get(`/generation-drafts/${emptyDraftId}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.totals.count).toBe(0);
    expect(res.body.totals.bytesUsed).toBe(0);
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/generation-drafts/${seed.draftA}/assets`);
    expect(res.status).toBe(401);
  });

  it('returns AssetApiResponse-compatible shape for each linked file item', async () => {
    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const files = res.body.items as Array<Record<string, unknown>>;
    const file = files.find((f) => f['id'] === seed.fileA);
    expect(file).toBeDefined();

    // FE contract fields — AssetApiResponse shape
    expect(typeof file!['id']).toBe('string');
    expect(typeof file!['contentType']).toBe('string');
    expect(typeof file!['downloadUrl']).toBe('string');
    expect(typeof file!['status']).toBe('string');
    expect(typeof file!['createdAt']).toBe('string');
    expect(typeof file!['updatedAt']).toBe('string');
    expect('thumbnailUri' in file!).toBe(true);
    expect('waveformPeaks' in file!).toBe(true);
  });
});
