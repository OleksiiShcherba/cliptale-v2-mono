/**
 * Integration tests for file-links endpoints — project side.
 *
 * Covers:
 *   POST /projects/:projectId/files  — link a file to a project
 *   GET  /projects/:id/assets        — pivot-backed read (project_files → files)
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/file-links-endpoints.test.ts
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
  APP_JWT_SECRET:           'file-links-proj-int-test-secret-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let seed: SeedResult;

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
  await teardownFixtures(conn, seed);
  await conn.end();
});

// ── POST /projects/:projectId/files — auth ────────────────────────────────────

describe('POST /projects/:projectId/files — auth', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(401);
  });

  it('returns 401 on an invalid token', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', 'Bearer bad-token')
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(401);
  });
});

// ── POST /projects/:projectId/files — validation ──────────────────────────────

describe('POST /projects/:projectId/files — input validation', () => {
  it('returns 400 when fileId is missing', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileId is not a UUID', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

// ── POST /projects/:projectId/files — ownership checks ───────────────────────

describe('POST /projects/:projectId/files — ownership checks', () => {
  it('returns 403 when the project is owned by a different user', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectB}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(403);
  });

  it('returns 403 when the file is owned by a different user', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileB });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the project does not exist', async () => {
    const res = await request(app)
      .post(`/projects/${randomUUID()}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: randomUUID() });
    expect(res.status).toBe(404);
  });
});

// ── POST /projects/:projectId/files — happy path ──────────────────────────────

describe('POST /projects/:projectId/files — link success', () => {
  it('returns 204 when linking a file to a project', async () => {
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(204);
  });

  it('is idempotent — double-linking returns 204 without error', async () => {
    // First link (may already exist from prior test — that is fine)
    await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });

    // Second link must not throw a duplicate-key error
    const res = await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });
    expect(res.status).toBe(204);
  });
});

// ── GET /projects/:id/assets — pivot-backed read ──────────────────────────────

describe('GET /projects/:id/assets — pivot read', () => {
  it('returns 200 with the linked file in the array after linking', async () => {
    // Ensure the file is linked
    await request(app)
      .post(`/projects/${seed.projectA}/files`)
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileId: seed.fileA });

    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const files = res.body as Array<{ id: string }>;
    expect(files.some((f) => f.id === seed.fileA)).toBe(true);
  });

  it('returns an empty array for a project with no linked files', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectB}/assets`)
      .set('Authorization', `Bearer ${seed.tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns AssetApiResponse-compatible shape for each linked file', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    const files = res.body as Array<Record<string, unknown>>;
    const file = files.find((f) => f['id'] === seed.fileA);
    expect(file).toBeDefined();

    // Required FE contract fields
    expect(typeof file!['id']).toBe('string');
    expect(typeof file!['projectId']).toBe('string');
    expect(typeof file!['contentType']).toBe('string');
    expect(typeof file!['downloadUrl']).toBe('string');
    expect(typeof file!['status']).toBe('string');
    expect(typeof file!['createdAt']).toBe('string');
    expect(typeof file!['updatedAt']).toBe('string');
    // Nullable fields must be present (even if null)
    expect('durationSeconds' in file!).toBe(true);
    expect('width' in file!).toBe(true);
    expect('height' in file!).toBe(true);
    expect('fileSizeBytes' in file!).toBe(true);
    expect('thumbnailUri' in file!).toBe(true);
    expect('waveformPeaks' in file!).toBe(true);
  });
});
