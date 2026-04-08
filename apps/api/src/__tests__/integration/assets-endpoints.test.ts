/**
 * Integration tests for the assets HTTP endpoints.
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * S3 presigned URL generation is mocked to avoid real AWS credentials.
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-endpoints.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock S3 — avoids real AWS calls for both presigner and HEAD requests ─────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

// s3Client.send() is used by finalizeAsset for HeadObjectCommand.
// Default: resolves (object exists). Override per-test to simulate missing object.
vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Set env vars before app is imported (config.ts reads process.env at load) ─
const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

Object.assign(process.env, {
  APP_DB_HOST:             process.env['APP_DB_HOST']             ?? 'localhost',
  APP_DB_PORT:             process.env['APP_DB_PORT']             ?? '3306',
  APP_DB_NAME:             process.env['APP_DB_NAME']             ?? 'cliptale',
  APP_DB_USER:             process.env['APP_DB_USER']             ?? 'cliptale',
  APP_DB_PASSWORD:         process.env['APP_DB_PASSWORD']         ?? 'cliptale',
  APP_REDIS_URL:           process.env['APP_REDIS_URL']           ?? 'redis://localhost:6379',
  APP_S3_BUCKET:           process.env['APP_S3_BUCKET']           ?? 'test-bucket',
  APP_S3_REGION:           process.env['APP_S3_REGION']           ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:    process.env['APP_S3_ACCESS_KEY_ID']    ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY:process.env['APP_S3_SECRET_ACCESS_KEY']?? 'test-secret-key-value',
  APP_JWT_SECRET:          JWT_SECRET,
  APP_DEV_AUTH_BYPASS:     'true',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
const insertedAssetIds: string[] = [];

/** Asset ID seeded directly in beforeAll for GET /assets/:id tests — no POST dependency. */
let seededAssetId: string;

function validToken(): string {
  return jwt.sign({ sub: 'user-test-001', email: 'qa@example.com' }, JWT_SECRET);
}

const validBody = {
  filename: 'test-video.mp4',
  contentType: 'video/mp4',
  fileSizeBytes: 1_234_567,
};

beforeAll(async () => {
  // Dynamic import ensures env vars above are set before config.ts is evaluated.
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed a known asset row so GET /assets/:id tests have a stable fixture independent
  // of whether the POST upload-url happy-path test ran first.
  seededAssetId = '00000000-test-seed-0000-000000000001';
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [seededAssetId, 'proj-seed', 'user-seed', 'seed.mp4', 'video/mp4', 1000, 's3://test/seed.mp4'],
  );
});

afterAll(async () => {
  // Clean up rows inserted during the test run.
  const toDelete = [...insertedAssetIds, seededAssetId].filter(Boolean);
  if (toDelete.length) {
    await conn.query(
      `DELETE FROM project_assets_current WHERE asset_id IN (${toDelete.map(() => '?').join(',')})`,
      toDelete,
    );
  }
  await conn.end();
});

// ── POST /projects/:id/assets/upload-url ─────────────────────────────────────

describe('POST /projects/:id/assets/upload-url', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/projects/proj-001/assets/upload-url')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .post('/projects/proj-001/assets/upload-url')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 400 when request body is missing required fields', async () => {
    const res = await request(app)
      .post('/projects/proj-001/assets/upload-url')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ filename: 'only-filename.mp4' }); // missing contentType, fileSizeBytes

    expect(res.status).toBe(400);
  });

  it('returns 400 for a disallowed content type', async () => {
    const res = await request(app)
      .post('/projects/proj-001/assets/upload-url')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, contentType: 'application/exe' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when fileSizeBytes exceeds 2 GiB', async () => {
    const res = await request(app)
      .post('/projects/proj-001/assets/upload-url')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, fileSizeBytes: 2 * 1024 * 1024 * 1024 + 1 });

    expect(res.status).toBe(400);
  });

  it('returns 201 with uploadUrl, assetId, storageUri, expiresAt on happy path', async () => {
    const res = await request(app)
      .post('/projects/proj-happy/assets/upload-url')
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uploadUrl: 'https://s3.example.com/presigned-test-url',
      assetId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
      storageUri: expect.stringContaining('s3://test-bucket/projects/proj-happy'),
      expiresAt: expect.any(String),
    });

    // Track the inserted row for cleanup.
    insertedAssetIds.push(res.body.assetId as string);

    // Verify the pending row was actually written to the DB.
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status FROM project_assets_current WHERE asset_id = ?',
      [res.body.assetId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['status']).toBe('pending');
  });
});

// ── GET /assets/:id ───────────────────────────────────────────────────────────

describe('GET /assets/:id', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/assets/some-asset-id');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .get('/assets/some-asset-id')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent asset ID', async () => {
    const res = await request(app)
      .get('/assets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 with asset data for an existing asset', async () => {
    const res = await request(app)
      .get(`/assets/${seededAssetId}`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      assetId: seededAssetId,
      status: 'pending',
      contentType: 'video/mp4',
    });
  });
});

