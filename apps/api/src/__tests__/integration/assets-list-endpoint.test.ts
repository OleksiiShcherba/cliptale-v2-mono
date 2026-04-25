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

// dev-user-001 is the hardcoded DEV_AUTH_BYPASS user — always present in the
// test DB. We reuse it as the file owner without inserting or deleting it.
const SEED_USER_ID = 'dev-user-001';

/**
 * Stable project IDs — use valid CHAR(36) UUIDs so the FK to `projects` is satisfied.
 * The empty-project ID is not inserted into `projects` so it reliably returns 0 assets.
 */
const TEST_PROJECT_WITH_ASSETS = '00000000-list-proj-0001-000000000001';

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

  // Seed a project row so the project_files FK is satisfied.
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [TEST_PROJECT_WITH_ASSETS, SEED_USER_ID, 'List Test Project'],
  );

  // Seed two files under TEST_PROJECT_WITH_ASSETS via `files` + `project_files`.
  for (const fileId of seededAssetIds) {
    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE file_id = file_id`,
      [
        fileId,
        SEED_USER_ID,
        'video',
        `s3://test/${fileId}.mp4`,
        'video/mp4',
        5000,
        `seed-${fileId}.mp4`,
      ],
    );
    await conn.execute(
      `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
      [TEST_PROJECT_WITH_ASSETS, fileId],
    );
  }
});

afterAll(async () => {
  if (seededAssetIds.length) {
    // Delete pivot rows first (FK: project_files → files ON DELETE RESTRICT).
    const ph = seededAssetIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM project_files WHERE file_id IN (${ph})`,
      seededAssetIds,
    );
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${ph})`,
      seededAssetIds,
    );
  }
  await conn.execute(
    'DELETE FROM projects WHERE project_id = ?',
    [TEST_PROJECT_WITH_ASSETS],
  );
  await conn.end();
});

// ── GET /projects/:id/assets ──────────────────────────────────────────────────
// The endpoint returns a paginated envelope: { items, nextCursor, totals }.

describe('GET /projects/:id/assets', () => {
  it('returns 200 with an empty items array when the project has no assets', async () => {
    const res = await request(app)
      .get('/projects/00000000-list-proj-0002-000000000002/assets')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], nextCursor: null });
  });

  it('returns 200 with asset records when assets exist for the project', async () => {
    const res = await request(app)
      .get(`/projects/${TEST_PROJECT_WITH_ASSETS}/assets`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      projectId: TEST_PROJECT_WITH_ASSETS,
      contentType: 'video/mp4',
      status: 'pending',
    });
  });

  it('does not return assets belonging to a different project', async () => {
    const res = await request(app)
      .get('/projects/some-other-project/assets')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    // Seeded assets are under TEST_PROJECT_WITH_ASSETS — must not appear here.
    const items = res.body.items as Array<{ fileId: string }>;
    const leaked = items.some((a) => seededAssetIds.includes(a.fileId));
    expect(leaked).toBe(false);
  });
});
