/**
 * Integration tests for GET /projects/:id/assets.
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-list-endpoint.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock S3 — not used by this endpoint but required to load the app ──────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Env vars must be set before app import ────────────────────────────────────
const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

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
  APP_JWT_SECRET:           JWT_SECRET,
  APP_DEV_AUTH_BYPASS:      'true',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/** Stable project IDs used across tests — isolated from other integration suites. */
const TEST_PROJECT_WITH_ASSETS = 'list-test-proj-with-assets';
const TEST_PROJECT_EMPTY = 'list-test-proj-empty';

/** Asset IDs seeded in beforeAll, cleaned up in afterAll. */
const seededAssetIds: string[] = [
  '00000000-list-seed-0001-000000000001',
  '00000000-list-seed-0001-000000000002',
];

function validToken(): string {
  return jwt.sign({ sub: 'user-list-test', email: 'list@example.com' }, JWT_SECRET);
}

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

  // Seed two assets under TEST_PROJECT_WITH_ASSETS.
  for (const assetId of seededAssetIds) {
    await conn.execute(
      `INSERT INTO project_assets_current
         (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE asset_id = asset_id`,
      [
        assetId,
        TEST_PROJECT_WITH_ASSETS,
        'user-list-seed',
        `seed-${assetId}.mp4`,
        'video/mp4',
        5000,
        `s3://test/${assetId}.mp4`,
      ],
    );
  }
});

afterAll(async () => {
  if (seededAssetIds.length) {
    await conn.query(
      `DELETE FROM project_assets_current WHERE asset_id IN (${seededAssetIds.map(() => '?').join(',')})`,
      seededAssetIds,
    );
  }
  await conn.end();
});

// ── GET /projects/:id/assets ──────────────────────────────────────────────────

describe('GET /projects/:id/assets', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/projects/${TEST_PROJECT_WITH_ASSETS}/assets`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .get(`/projects/${TEST_PROJECT_WITH_ASSETS}/assets`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 200 with an empty array when the project has no assets', async () => {
    const res = await request(app)
      .get(`/projects/${TEST_PROJECT_EMPTY}/assets`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with asset records when assets exist for the project', async () => {
    const res = await request(app)
      .get(`/projects/${TEST_PROJECT_WITH_ASSETS}/assets`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      projectId: TEST_PROJECT_WITH_ASSETS,
      contentType: 'video/mp4',
      status: 'pending',
    });
  });

  it('does not return assets belonging to a different project', async () => {
    const res = await request(app)
      .get(`/projects/some-other-project/assets`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    // Seeded assets are under TEST_PROJECT_WITH_ASSETS — must not appear here.
    const body = res.body as Array<{ assetId: string }>;
    const leaked = body.some((a) => seededAssetIds.includes(a.assetId));
    expect(leaked).toBe(false);
  });
});
