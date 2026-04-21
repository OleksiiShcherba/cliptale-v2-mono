/**
 * Integration tests for paginated GET /projects/:id/assets.
 *
 * Covers:
 *   (i)   Default-page shape & limit
 *   (ii)  Two-page cursor forwarding (scope=project)
 *   (iii) Invalid cursor returns 400
 *   (iv)  scope=all paginates across the user's library
 *   (v)   Deleted-file exclusion (both sides of the pivot)
 *   (vi)  ?limit= validation (out-of-range → 400)
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/projects-assets-pagination.test.ts
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
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-pagination-url'),
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
  APP_JWT_SECRET:           'proj-assets-pagination-test-secret-32!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let seed: SeedResult;

/** Extra IDs created in this file — cleaned up in afterAll. */
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

  // Link fileA to projectA so we always have at least one linked file.
  await conn.execute(
    'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
    [seed.projectA, seed.fileA],
  );
});

afterAll(async () => {
  if (extraFileIds.length) {
    const ph = extraFileIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM project_files WHERE file_id IN (${ph})`, extraFileIds);
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, extraFileIds);
  }
  await teardownFixtures(conn, seed);
  await conn.end();
});

// ─────────────────────────────────────────────────────────────────────────────

// ── (i) Default page shape & limit ───────────────────────────────────────────

describe('GET /projects/:id/assets — default page shape', () => {
  it('returns { items, nextCursor, totals } envelope with status 200', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);

    // Envelope structure
    expect(Array.isArray(res.body.items)).toBe(true);
    expect('nextCursor' in res.body).toBe(true);
    expect(typeof res.body.totals).toBe('object');
    expect(typeof res.body.totals.count).toBe('number');
    expect(typeof res.body.totals.bytesUsed).toBe('number');
  });

  it('defaults to limit=24 (returns ≤24 items without a limit param)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(24);
  });

  it('respects an explicit ?limit= param', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(1);
  });

  it('totals.count reflects the total linked-file count, not just the page size', async () => {
    // Seed 3 files linked to projectA
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const fId = randomUUID();
      ids.push(fId);
      extraFileIds.push(fId);
      await conn.execute(
        `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fId, seed.userAId, 'video', `s3://test-bucket/page-${i}.mp4`, 'video/mp4', `page-${i}.mp4`],
      );
      await conn.execute(
        'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
        [seed.projectA, fId],
      );
    }

    // Fetch with limit=1 — the page has 1 item but totals.count should be ≥ 4 (fileA + 3 new)
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.totals.count).toBeGreaterThanOrEqual(4);
  });
});

// ── (ii) Two-page cursor forwarding ──────────────────────────────────────────

describe('GET /projects/:id/assets — cursor forwarding (scope=project)', () => {
  it('returns a non-null nextCursor when more items exist beyond the page', async () => {
    // We need at least 2 files linked — fileA is already linked; seed one more.
    const extraId = randomUUID();
    extraFileIds.push(extraId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [extraId, seed.userAId, 'image', 's3://test-bucket/cursor-extra.png', 'image/png', 'cursor-extra.png'],
    );
    await conn.execute(
      'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
      [seed.projectA, extraId],
    );

    // Page 1 — limit 1
    const page1 = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(page1.status).toBe(200);
    expect(page1.body.items.length).toBe(1);
    expect(typeof page1.body.nextCursor).toBe('string'); // more pages exist

    // Page 2 — use cursor from page 1
    const page2 = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 1, cursor: page1.body.nextCursor })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBe(1);

    // The two pages must not overlap
    const id1 = page1.body.items[0].id as string;
    const id2 = page2.body.items[0].id as string;
    expect(id1).not.toBe(id2);
  });

  it('returns nextCursor=null on the last page', async () => {
    // Fetch all items in one page (large limit)
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
  });

  it('second page returns nextCursor=null when it is the last page', async () => {
    // Fetch page 1 with limit=1
    const page1 = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(page1.status).toBe(200);
    const cursor = page1.body.nextCursor;
    if (!cursor) return; // Only one item exists — skip

    // Walk pages until we find the last one
    let currentCursor: string | null = cursor;
    let lastRes: Record<string, unknown> = page1.body;
    while (currentCursor) {
      const res = await request(app)
        .get(`/projects/${seed.projectA}/assets`)
        .query({ limit: 1, cursor: currentCursor })
        .set('Authorization', `Bearer ${seed.tokenA}`);
      expect(res.status).toBe(200);
      lastRes = res.body;
      currentCursor = res.body.nextCursor as string | null;
    }
    expect(lastRes['nextCursor']).toBeNull();
  });
});

// ── (iii) Invalid cursor → 400 ────────────────────────────────────────────────

describe('GET /projects/:id/assets — invalid cursor', () => {
  it('returns 400 for a garbage cursor value', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ cursor: 'not-a-valid-cursor!!' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a base64 string that decodes to an invalid format', async () => {
    const malformed = Buffer.from('no-pipe-separator', 'utf8').toString('base64');
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ cursor: malformed })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(400);
  });
});

// ── (iv) scope=all paginates across the user's library ───────────────────────

describe('GET /projects/:id/assets?scope=all — pagination', () => {
  it('returns files owned by the user regardless of project linkage', async () => {
    const unlinkedId = randomUUID();
    extraFileIds.push(unlinkedId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [unlinkedId, seed.userAId, 'audio', 's3://test-bucket/all-scope.mp3', 'audio/mp3', 'all-scope.mp3'],
    );

    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all', limit: 100 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = (res.body.items as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(seed.fileA);
    expect(ids).toContain(unlinkedId);
    // fileB belongs to a different user
    expect(ids).not.toContain(seed.fileB);
  });

  it('paginates scope=all results with cursor forwarding', async () => {
    // Use limit=1 to force pagination
    const page1 = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all', limit: 1 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(page1.status).toBe(200);
    expect(page1.body.items.length).toBe(1);

    if (!page1.body.nextCursor) return; // only 1 file — skip

    const page2 = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all', limit: 1, cursor: page1.body.nextCursor })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBe(1);
    // Pages must not overlap
    expect(page1.body.items[0].id).not.toBe(page2.body.items[0].id);
  });
});

// ── (v) Deleted-file exclusion ────────────────────────────────────────────────

describe('GET /projects/:id/assets — deleted-file exclusion', () => {
  it('excludes soft-deleted files from scope=project results', async () => {
    const deletedId = randomUUID();
    extraFileIds.push(deletedId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [deletedId, seed.userAId, 'video', 's3://test-bucket/deleted-proj.mp4', 'video/mp4', 'deleted-proj.mp4'],
    );
    await conn.execute(
      'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
      [seed.projectA, deletedId],
    );

    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'project', limit: 100 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((f) => f.id);
    expect(ids).not.toContain(deletedId);
  });

  it('excludes soft-deleted files from scope=all results', async () => {
    const deletedAllId = randomUUID();
    extraFileIds.push(deletedAllId);
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [deletedAllId, seed.userAId, 'image', 's3://test-bucket/deleted-all.png', 'image/png', 'deleted-all.png'],
    );

    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all', limit: 100 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((f) => f.id);
    expect(ids).not.toContain(deletedAllId);
  });
});

// ── (vi) Limit validation ─────────────────────────────────────────────────────

describe('GET /projects/:id/assets — limit validation', () => {
  it('returns 400 when limit=0 (below minimum)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 0 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when limit=101 (above maximum)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 101 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(400);
  });

  it('returns 200 when limit=100 (upper boundary)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
  });

  it('returns 200 when limit=1 (lower boundary)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
  });
});
