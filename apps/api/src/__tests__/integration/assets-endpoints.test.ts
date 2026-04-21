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
import { randomUUID } from 'node:crypto';
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
const insertedProjectFileIds: Array<{projectId: string; fileId: string}> = [];
const insertedFileIds: string[] = [];
const insertedUserIds: string[] = [];
const insertedProjectIds: string[] = [];

/** Asset ID seeded directly in beforeAll for GET /assets/:id tests — no POST dependency. */
let seededAssetId: string;
let seededUserId: string;
let seededProjectId: string;

function validToken(): string {
  return jwt.sign({ sub: seededUserId, email: 'qa@example.com' }, JWT_SECRET);
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

  // Create seed user and projects (migration 027 dropped project_assets_current).
  seededUserId = 'user-test-' + randomUUID().slice(0, 8);
  seededProjectId = 'proj-test-' + randomUUID().slice(0, 8);
  const happyPathProjectId = 'proj-happy';
  insertedUserIds.push(seededUserId);
  insertedProjectIds.push(seededProjectId);
  insertedProjectIds.push(happyPathProjectId);

  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [seededUserId, `${seededUserId}@test.com`, 'Assets Test User'],
  );
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, 'Assets Test Project') ON DUPLICATE KEY UPDATE project_id = project_id`,
    [seededProjectId, seededUserId],
  );
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, 'Happy Path Project') ON DUPLICATE KEY UPDATE project_id = project_id`,
    [happyPathProjectId, seededUserId],
  );

  // Seed a known asset row so GET /assets/:id tests have a stable fixture independent
  // of whether the POST upload-url happy-path test ran first.
  seededAssetId = randomUUID();
  insertedFileIds.push(seededAssetId);
  insertedProjectFileIds.push({ projectId: seededProjectId, fileId: seededAssetId });

  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [seededAssetId, seededUserId, 's3://test/seed.mp4', 'video/mp4', 1000, 'seed.mp4'],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [seededProjectId, seededAssetId],
  );
});

afterAll(async () => {
  // Clean up in FK-safe order: project_files → files → projects → users.
  const allFileIds = [...insertedFileIds, seededAssetId].filter(Boolean);
  if (allFileIds.length) {
    for (const {projectId, fileId} of insertedProjectFileIds) {
      await conn.execute(
        'DELETE FROM project_files WHERE project_id = ? AND file_id = ?',
        [projectId, fileId],
      );
    }
    await conn.execute(
      `DELETE FROM files WHERE file_id IN (${allFileIds.map(() => '?').join(',')})`,
      allFileIds,
    );
  }
  if (insertedProjectIds.length) {
    await conn.execute(
      `DELETE FROM projects WHERE project_id IN (${insertedProjectIds.map(() => '?').join(',')})`,
      insertedProjectIds,
    );
  }
  if (insertedUserIds.length) {
    await conn.execute(
      `DELETE FROM users WHERE user_id IN (${insertedUserIds.map(() => '?').join(',')})`,
      insertedUserIds,
    );
  }
  await conn.end();
});

// ── POST /projects/:id/assets/upload-url ─────────────────────────────────────

describe('POST /projects/:id/assets/upload-url', () => {
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

  it('returns 201 with uploadUrl, fileId, storageUri, expiresAt on happy path', async () => {
    const projectIdForUpload = 'proj-happy';
    const res = await request(app)
      .post(`/projects/${projectIdForUpload}/assets/upload-url`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uploadUrl: 'https://s3.example.com/presigned-test-url',
      fileId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
      storageUri: expect.stringContaining(`projects/${projectIdForUpload}`),
      expiresAt: expect.any(String),
    });

    // Track the inserted row for cleanup.
    const newFileId = res.body.fileId as string;
    insertedFileIds.push(newFileId);
    insertedProjectFileIds.push({ projectId: projectIdForUpload, fileId: newFileId });

    // Verify the pending row was actually written to the DB (now in files table).
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status FROM files WHERE file_id = ?',
      [newFileId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['status']).toBe('pending');
  });
});

// ── GET /assets/:id ───────────────────────────────────────────────────────────

describe('GET /assets/:id', () => {
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
      id: seededAssetId,
      status: 'ready',
      contentType: 'video/mp4',
    });
  });
});

