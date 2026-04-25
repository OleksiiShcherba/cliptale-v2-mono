/**
 * Contract guard for GET /projects/:id/assets.
 *
 * Asserts that the wire response body exactly matches the `AssetListResponse`
 * OpenAPI schema by Zod-validating it against `AssetListResponseSchema` from
 * @ai-video-editor/api-contracts.  Fails CI if the controller drifts from the
 * published contract.
 *
 * Pagination behaviour is covered in projects-assets-pagination.test.ts
 * (split per §9.7 300-line cap rule).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/projects-assets-pagination.contract.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

import { AssetListResponseSchema } from '@ai-video-editor/api-contracts';
import {
  seedFixtures,
  teardownFixtures,
  type SeedResult,
} from './file-links-endpoints.fixtures.js';

// ── Mock S3 ───────────────────────────────────────────────────────────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-contract-url'),
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
  APP_JWT_SECRET:           'proj-assets-contract-test-secret-32!!',
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

  // Link fileA to projectA so the items array is non-empty.
  await conn.execute(
    'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
    [seed.projectA, seed.fileA],
  );
});

afterAll(async () => {
  await teardownFixtures(conn, seed);
  await conn.end();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /projects/:id/assets — OpenAPI contract guard', () => {
  it('response body parses against AssetListResponseSchema (scope=project, page 1)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);

    // Zod-validate against the published OpenAPI schema.
    const parsed = AssetListResponseSchema.safeParse(res.body);
    if (!parsed.success) {
      // Surface the full Zod error for easier debugging in CI.
      throw new Error(
        `Response body does not match AssetListResponseSchema:\n${JSON.stringify(parsed.error.format(), null, 2)}`,
      );
    }

    expect(parsed.success).toBe(true);
  });

  it('response body parses against AssetListResponseSchema (scope=all)', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .query({ scope: 'all' })
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);

    const parsed = AssetListResponseSchema.safeParse(res.body);
    if (!parsed.success) {
      throw new Error(
        `scope=all response does not match AssetListResponseSchema:\n${JSON.stringify(parsed.error.format(), null, 2)}`,
      );
    }

    expect(parsed.success).toBe(true);
  });

  it('each item in the items array conforms to the AssetApiResponseItem schema fields', async () => {
    const res = await request(app)
      .get(`/projects/${seed.projectA}/assets`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);

    const parsed = AssetListResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // Required envelope fields must be present with the correct types.
    expect(Array.isArray(parsed.data.items)).toBe(true);
    expect(parsed.data.nextCursor === null || typeof parsed.data.nextCursor === 'string').toBe(true);
    expect(typeof parsed.data.totals.count).toBe('number');
    expect(typeof parsed.data.totals.bytesUsed).toBe('number');

    // Every item must carry the required fields.
    for (const item of parsed.data.items) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.projectId).toBe('string');
      expect(typeof item.filename).toBe('string');
      expect(typeof item.contentType).toBe('string');
      expect(typeof item.downloadUrl).toBe('string');
      expect(['pending', 'processing', 'ready', 'error']).toContain(item.status);
      expect(typeof item.createdAt).toBe('string');
      expect(typeof item.updatedAt).toBe('string');
    }
  });
});
