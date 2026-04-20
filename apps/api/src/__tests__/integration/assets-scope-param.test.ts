/**
 * Integration tests for the `?scope=` query param on:
 *   GET /projects/:id/assets        — scope=project|all|invalid
 *   GET /generation-drafts/:id/assets — scope=draft|all|invalid
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/assets-scope-param.test.ts
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

// ── Mock S3 ───────────────────────────────────────────────────────────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-scope-url'),
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
  APP_JWT_SECRET:           'assets-scope-param-int-test-secret-32!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let seed: SeedResult;

/** Additional file IDs seeded in this test file. Cleaned up in afterAll. */
const extraFileIds: string[] = [];
/** Additional draft IDs seeded in this test file. Cleaned up in afterAll. */
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

  // Link fileA to both projectA and draftA so we have a linked-vs-unlinked contrast.
  await conn.execute(
    'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
    [seed.projectA, seed.fileA],
  );
  await conn.execute(
    'INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)',
    [seed.draftA, seed.fileA],
  );
});

afterAll(async () => {
  if (extraFileIds.length) {
    const ph = extraFileIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM project_files WHERE file_id IN (${ph})`, extraFileIds);
    await conn.query(`DELETE FROM draft_files WHERE file_id IN (${ph})`, extraFileIds);
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, extraFileIds);
  }
  if (extraDraftIds.length) {
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${extraDraftIds.map(() => '?').join(',')})`,
      extraDraftIds,
    );
  }
  await teardownFixtures(conn, seed);
  await conn.end();
});

// ── GET /projects/:id/assets?scope=project — default behaviour ────────────────

describe('GET /projects/:id/assets?scope=project', () => {
  it('returns 200 with only the linked file (default scope=project)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'project' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(seed.fileA);
    // fileB is owned by user B and not linked to projectA — must not appear
    expect(ids).not.toContain(seed.fileB);
  });

  it('returns 200 [] when a project has no linked files (no ?scope)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectB}/assets`)
      .set('Authorization', `Bearer ${seed.tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /projects/:id/assets?scope=all ────────────────────────────────────────

describe('GET /projects/:id/assets?scope=all', () => {
  it('returns 200 including an unlinked file when scope=all', async () => {
    const unlinkedFileId = randomUUID();
    extraFileIds.push(unlinkedFileId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [unlinkedFileId, seed.userAId, 'image', 's3://test-bucket/unlinked.png', 'image/png', 'unlinked.png'],
    );

    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(seed.fileA);
    expect(ids).toContain(unlinkedFileId);
    expect(ids).not.toContain(seed.fileB);
  });

  it('does not return soft-deleted files when scope=all', async () => {
    const deletedFileId = randomUUID();
    extraFileIds.push(deletedFileId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [deletedFileId, seed.userAId, 'video', 's3://test-bucket/deleted.mp4', 'video/mp4', 'deleted.mp4'],
    );

    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(ids).not.toContain(deletedFileId);
  });
});

// ── GET /projects/:id/assets?scope=invalid — validation ───────────────────────

describe('GET /projects/:id/assets — invalid scope', () => {
  it('returns 400 for an unrecognized scope value', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'nonsense' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(400);
  });
});

// ── GET /generation-drafts/:id/assets?scope=draft — default behaviour ─────────

describe('GET /generation-drafts/:id/assets?scope=draft', () => {
  it('returns 200 with only the linked file (default scope=draft)', async () => {
    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`)
      .query({ scope: 'draft' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(seed.fileA);
    expect(ids).not.toContain(seed.fileB);
  });

  it('returns 200 [] for a draft with no linked files (no ?scope)', async () => {
    const emptyDraftId = randomUUID();
    extraDraftIds.push(emptyDraftId);
    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [emptyDraftId, seed.userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    const res = await request(app)
      .get(`/generation-drafts/${emptyDraftId}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /generation-drafts/:id/assets?scope=all ───────────────────────────────

describe('GET /generation-drafts/:id/assets?scope=all', () => {
  it('returns 200 including an unlinked file when scope=all', async () => {
    const unlinkedForDraftId = randomUUID();
    extraFileIds.push(unlinkedForDraftId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [unlinkedForDraftId, seed.userAId, 'audio', 's3://test-bucket/unlinked-audio.mp3', 'audio/mp3', 'unlinked-audio.mp3'],
    );

    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`)
      .query({ scope: 'all' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(seed.fileA);
    expect(ids).toContain(unlinkedForDraftId);
    expect(ids).not.toContain(seed.fileB);
  });

  it('does not return soft-deleted files when scope=all', async () => {
    const deletedForDraftId = randomUUID();
    extraFileIds.push(deletedForDraftId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [deletedForDraftId, seed.userAId, 'video', 's3://test-bucket/deleted-draft.mp4', 'video/mp4', 'deleted-draft.mp4'],
    );

    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`)
      .query({ scope: 'all' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(ids).not.toContain(deletedForDraftId);
  });
});

// ── GET /generation-drafts/:id/assets?scope=invalid — validation ──────────────

describe('GET /generation-drafts/:id/assets — invalid scope', () => {
  it('returns 400 for an unrecognized scope value', async () => {
    const res = await request(app)
      .get(`/generation-drafts/${seed.draftA}/assets`)
      .query({ scope: 'bogus' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(400);
  });
});
