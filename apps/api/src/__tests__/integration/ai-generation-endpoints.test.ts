/**
 * Integration tests for the AI generation endpoints (fal.ai + ElevenLabs models):
 *   GET  /ai/models
 *   POST /projects/:id/ai/generate
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance: docker compose up -d db
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/ai-generation-endpoints.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';
import { AI_MODELS } from '@ai-video-editor/api-contracts';

// ── Set env vars before app is imported ──────────────────────────────────────
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
  APP_JWT_SECRET:           'integration-test-jwt-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
  APP_FAL_KEY:              process.env['APP_FAL_KEY']              ?? 'test-fal-key',
});

// Mock BullMQ so the test doesn't require a running Redis instance.
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

// Mock the AWS presigner so the resolver does not need real S3 credentials to
// rewrite asset IDs into https URLs. Mirrors the pattern in
// renders-endpoint.test.ts.
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue('https://example.com/signed-ai-image-url'),
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
let testAssetId: string;

const insertedJobIds: string[] = [];

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

  // Run migrations needed for this test. Migration 014 depends on users and
  // projects, so the foundational migrations run first; 011 seeds the
  // dev-user-001 row that DEV_AUTH_BYPASS attaches to requests.
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));

  for (const migration of [
    '001_project_assets_current.sql',
    '008_users_auth.sql',
    '011_seed_dev_user.sql',
    '014_ai_jobs_fal_reshape.sql',
  ]) {
    const sql = readFileSync(
      resolve(__dirname, `../../db/migrations/${migration}`),
      'utf-8',
    );
    await conn.query(sql);
  }

  // Seed the project row so the FK from ai_generation_jobs.project_id resolves.
  testProjectId = `proj-ai-gen-${Date.now()}`;
  await conn.query('INSERT INTO projects (project_id) VALUES (?)', [
    testProjectId,
  ]);

  // Seed an asset row owned by the dev-auth-bypass user so the resolver can
  // verify ownership + look up the storage URI for the image_urls field.
  testAssetId = `asset-ai-gen-${Date.now()}`;
  await conn.query(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri, status)
     VALUES (?, ?, 'dev-user-001', ?, 'image/png', 1024, ?, 'ready')`,
    [
      testAssetId,
      testProjectId,
      'edit-source.png',
      `s3://test-bucket/assets/${testAssetId}.png`,
    ],
  );
});

afterAll(async () => {
  if (insertedJobIds.length) {
    await conn?.query(
      `DELETE FROM ai_generation_jobs WHERE job_id IN (${insertedJobIds
        .map(() => '?')
        .join(',')})`,
      insertedJobIds,
    );
  }
  await conn?.query('DELETE FROM ai_generation_jobs WHERE project_id = ?', [
    testProjectId,
  ]);
  await conn?.query('DELETE FROM project_assets_current WHERE asset_id = ?', [
    testAssetId,
  ]);
  await conn?.query('DELETE FROM projects WHERE project_id = ?', [
    testProjectId,
  ]);
  await conn?.end();
});

// ── GET /ai/models ────────────────────────────────────────────────────────────

describe('GET /ai/models', () => {
  it('returns 200 with all eight capability groups and every catalog entry', async () => {
    const res = await request(app).get('/ai/models');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'image_edit',
      'image_to_video',
      'music_generation',
      'speech_to_speech',
      'text_to_image',
      'text_to_speech',
      'text_to_video',
      'voice_cloning',
    ]);

    const returnedIds = (Object.values(res.body) as Array<Array<{ id: string }>>)
      .flat()
      .map((m) => m.id)
      .sort();

    const catalogIds = AI_MODELS.map((m) => m.id).sort();
    expect(returnedIds).toEqual(catalogIds);

    // Spot-check that every model in a group reports the matching capability.
    for (const capability of Object.keys(res.body) as string[]) {
      const group = res.body[capability] as Array<{ capability: string }>;
      for (const model of group) {
        expect(model.capability).toBe(capability);
      }
    }
  });
});

// ── POST /projects/:id/ai/generate ────────────────────────────────────────────

describe('POST /projects/:id/ai/generate', () => {
  it('returns 202 and writes a job row for a valid fal-ai/nano-banana-2 request', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'a cat sitting on a rug',
        options: {},
      });

    expect(res.status).toBe(202);
    expect(typeof res.body['jobId']).toBe('string');
    expect(res.body['status']).toBe('queued');
    const jobId = res.body['jobId'] as string;
    insertedJobIds.push(jobId);

    // Verify the row was persisted with the expected model_id + capability.
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT job_id, user_id, project_id, model_id, capability, prompt, status
         FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['user_id']).toBe('dev-user-001');
    expect(rows[0]!['project_id']).toBe(testProjectId);
    expect(rows[0]!['model_id']).toBe('fal-ai/nano-banana-2');
    expect(rows[0]!['capability']).toBe('text_to_image');
    expect(rows[0]!['prompt']).toBe('a cat sitting on a rug');
    expect(rows[0]!['status']).toBe('queued');
  });

  it('returns 400 when modelId is not in the catalog', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'fal-ai/definitely-not-real',
        prompt: 'hi',
        options: {},
      });

    expect(res.status).toBe(400);
    expect(res.body['error']).toBeDefined();
  });

  it('returns 400 when a required option field is missing', async () => {
    // fal-ai/nano-banana-2/edit requires `image_urls`; sending only prompt
    // must fail validation in the service layer.
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'fal-ai/nano-banana-2/edit',
        prompt: 'make it blue',
        options: {},
      });

    expect(res.status).toBe(400);
    expect(res.body['error']).toBeDefined();
  });

  it('resolves an asset id inside image_urls into a presigned https URL before persisting the job row', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'fal-ai/nano-banana-2/edit',
        prompt: 'edit',
        options: { image_urls: [testAssetId] },
      });

    expect(res.status).toBe(202);
    const jobId = res.body['jobId'] as string;
    expect(typeof jobId).toBe('string');
    insertedJobIds.push(jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT options FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows).toHaveLength(1);

    // MySQL returns the JSON column as a parsed object in mysql2's default
    // config; fall back to JSON.parse if a string comes through.
    const rawOptions = rows[0]!['options'];
    const options =
      typeof rawOptions === 'string'
        ? (JSON.parse(rawOptions) as Record<string, unknown>)
        : (rawOptions as Record<string, unknown>);

    const imageUrls = options['image_urls'] as unknown;
    expect(Array.isArray(imageUrls)).toBe(true);
    const [first] = imageUrls as string[];
    expect(first).toMatch(/^https:\/\//);
    expect(first).not.toBe(testAssetId);
  });
});
