/**
 * Integration tests for render endpoints:
 *   POST /projects/:id/renders
 *   GET  /renders/:jobId
 *   GET  /projects/:id/renders
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance + Redis: docker compose up -d db redis
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/renders-endpoint.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Set env vars before app is imported ──────────────────────────────────────
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

// Mock BullMQ and S3 so integration tests don't require running Redis or S3.
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
      getJob: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-render-url'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ ...params })),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params })),
}));

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let testProjectId: string;
let testVersionId: number;

const insertedJobIds: string[] = [];

function validToken(): string {
  return jwt.sign({ sub: 'user-render-test', email: 'render@example.com' }, JWT_SECRET);
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
    multipleStatements: true,
  });

  // Run all migrations to ensure schema is up-to-date.
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));

  for (const migration of [
    '001_project_assets_current.sql',
    '002_caption_tracks.sql',
    '003_project_versions.sql',
    '004_render_jobs.sql',
  ]) {
    const sql = readFileSync(resolve(__dirname, `../../db/migrations/${migration}`), 'utf-8');
    await conn.query(sql);
  }

  // Seed a project and version for render tests.
  testProjectId = `proj-render-${Date.now()}`;
  await conn.query('INSERT INTO projects (project_id) VALUES (?)', [testProjectId]);

  const [versionResult] = await conn.query<mysql.ResultSetHeader>(
    `INSERT INTO project_versions (project_id, doc_json, doc_schema_version)
     VALUES (?, ?, ?)`,
    [testProjectId, JSON.stringify({ title: 'Render Test Project', tracks: [] }), 1],
  );
  testVersionId = versionResult.insertId;

  // Update the project's latest_version_id pointer.
  await conn.query(
    'UPDATE projects SET latest_version_id = ? WHERE project_id = ?',
    [testVersionId, testProjectId],
  );
});

afterAll(async () => {
  if (insertedJobIds.length) {
    await conn?.query(
      `DELETE FROM render_jobs WHERE job_id IN (${insertedJobIds.map(() => '?').join(',')})`,
      insertedJobIds,
    );
  }
  await conn?.query('DELETE FROM project_versions WHERE project_id = ?', [testProjectId]);
  await conn?.query(
    'DELETE FROM project_audit_log WHERE project_id = ?',
    [testProjectId],
  );
  await conn?.query('DELETE FROM projects WHERE project_id = ?', [testProjectId]);
  await conn?.end();
});

// ── POST /projects/:id/renders ────────────────────────────────────────────────

describe('POST /projects/:id/renders', () => {
  it('should return 202 with jobId and status queued on happy path', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ versionId: testVersionId, presetKey: '1080p' });

    expect(res.status).toBe(202);
    expect(typeof res.body['jobId']).toBe('string');
    expect(res.body['status']).toBe('queued');
    insertedJobIds.push(res.body['jobId'] as string);
  });

  it('should return 400 when presetKey is invalid', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ versionId: testVersionId, presetKey: 'not-a-real-preset' });

    expect(res.status).toBe(400);
    expect(res.body['error']).toBeDefined();
  });

  it('should return 404 when versionId does not belong to the project', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ versionId: 999999, presetKey: '1080p' });

    expect(res.status).toBe(404);
  });

  it('should return 400 when required body fields are missing', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ versionId: testVersionId }); // missing presetKey

    expect(res.status).toBe(400);
  });
});

// ── GET /renders/:jobId ───────────────────────────────────────────────────────

describe('GET /renders/:jobId', () => {
  let createdJobId: string;

  beforeAll(async () => {
    // Create a render job to retrieve.
    const res = await request(app)
      .post(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ versionId: testVersionId, presetKey: '720p' });

    createdJobId = res.body['jobId'] as string;
    insertedJobIds.push(createdJobId);
  });

  it('should return 200 with job details on happy path', async () => {
    const res = await request(app)
      .get(`/renders/${createdJobId}`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body['jobId']).toBe(createdJobId);
    expect(res.body['status']).toBe('queued');
    expect(res.body['progressPct']).toBe(0);
    expect(res.body['projectId']).toBe(testProjectId);
    expect(res.body['versionId']).toBe(testVersionId);
    expect(res.body['preset']['key']).toBe('720p');
  });

  it('should return 404 when job does not exist', async () => {
    const res = await request(app)
      .get('/renders/non-existent-job-id-00000')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
  });

});

// ── GET /projects/:id/renders ─────────────────────────────────────────────────

describe('GET /projects/:id/renders', () => {
  it('should return 200 with a renders array', async () => {
    const res = await request(app)
      .get(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body['renders'])).toBe(true);
    // At least the jobs created in earlier tests should be present.
    expect(res.body['renders'].length).toBeGreaterThanOrEqual(1);
  });

  it('should include jobId, status, progressPct, preset, createdAt in each entry', async () => {
    const res = await request(app)
      .get(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`);

    const first = res.body['renders'][0];
    expect(first).toHaveProperty('jobId');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('progressPct');
    expect(first).toHaveProperty('preset');
    expect(first).toHaveProperty('createdAt');
  });

  it('should include downloadUrl for complete jobs and omit it for non-complete jobs', async () => {
    // Seed a complete render job directly into the DB so we can assert the
    // download URL is present in the list response without waiting for a real
    // render to finish.
    const completeJobId = `job-complete-${Date.now()}`;
    await conn.query(
      `INSERT INTO render_jobs
         (job_id, project_id, version_id, requested_by, status, progress_pct, preset_json, output_uri)
       VALUES (?, ?, ?, ?, 'complete', 100, ?, ?)`,
      [
        completeJobId,
        testProjectId,
        testVersionId,
        'user-render-test',
        JSON.stringify({ key: '1080p', width: 1920, height: 1080, fps: 30, format: 'mp4', codec: 'h264' }),
        `s3://test-bucket/renders/${completeJobId}.mp4`,
      ],
    );
    insertedJobIds.push(completeJobId);

    const res = await request(app)
      .get(`/projects/${testProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);

    const completeEntry = (res.body['renders'] as Array<Record<string, unknown>>).find(
      (r) => r['jobId'] === completeJobId,
    );
    expect(completeEntry).toBeDefined();
    expect(typeof completeEntry!['downloadUrl']).toBe('string');
    expect(completeEntry!['downloadUrl']).toBe('https://example.com/signed-render-url');

    // Non-complete jobs must not have downloadUrl.
    const nonCompleteEntries = (res.body['renders'] as Array<Record<string, unknown>>).filter(
      (r) => r['jobId'] !== completeJobId,
    );
    for (const entry of nonCompleteEntries) {
      expect(entry['downloadUrl']).toBeUndefined();
    }
  });

  it('should return an empty renders array for a project with no jobs', async () => {
    const emptyProjectId = `proj-no-renders-${Date.now()}`;
    await conn.query('INSERT INTO projects (project_id) VALUES (?)', [emptyProjectId]);

    const res = await request(app)
      .get(`/projects/${emptyProjectId}/renders`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body['renders']).toEqual([]);

    await conn.query('DELETE FROM projects WHERE project_id = ?', [emptyProjectId]);
  });
});
