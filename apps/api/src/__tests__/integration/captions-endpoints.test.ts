/**
 * Integration tests for the captions HTTP endpoints.
 *
 * POST /assets/:id/transcribe — 202 { jobId }, 409 if track exists, 404 if asset missing
 * GET  /assets/:id/captions  — 200 { segments }, 404 if no track yet
 *
 * Requires a live MySQL instance (docker compose up db).
 * BullMQ queue operations are mocked to avoid a Redis dependency in tests.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/captions-endpoints.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Mock BullMQ queue — avoids live Redis dependency ─────────────────────────
vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  mediaIngestQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
  },
  renderQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
  },
  transcriptionQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-transcription-job' }),
    getJob: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
  },
}));

// ── Also mock S3 presigner (imported transitively by assetsRouter) ────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

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

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/** Asset seeded for transcribe / captions tests. */
let seededAssetId: string;
/** Caption track seeded to test the 409 conflict guard and GET captions. */
let seededTrackId: string;
/** Asset with a pre-seeded caption track (for 409 + GET ready tests). */
let seededAssetWithTrackId: string;

const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'This is a caption' },
];

function validToken(): string {
  return jwt.sign({ sub: 'user-test-captions', email: 'qa@example.com' }, JWT_SECRET);
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

  // Asset with no caption track — used for POST transcribe happy path.
  seededAssetId = '00000000-capt-test-0000-000000000001';
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [
      seededAssetId,
      'proj-captions',
      'user-captions',
      'sample.mp4',
      'video/mp4',
      2_000_000,
      `s3://test-bucket/projects/proj-captions/assets/${seededAssetId}/sample.mp4`,
    ],
  );

  // Asset with a pre-seeded caption track — used for 409 and GET ready tests.
  seededAssetWithTrackId = '00000000-capt-test-0000-000000000002';
  await conn.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE asset_id = asset_id`,
    [
      seededAssetWithTrackId,
      'proj-captions',
      'user-captions',
      'sample2.mp4',
      'video/mp4',
      2_000_000,
      `s3://test-bucket/projects/proj-captions/assets/${seededAssetWithTrackId}/sample2.mp4`,
    ],
  );

  seededTrackId = randomUUID();
  await conn.execute(
    `INSERT INTO caption_tracks
       (caption_track_id, asset_id, project_id, language, segments_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE caption_track_id = caption_track_id`,
    [
      seededTrackId,
      seededAssetWithTrackId,
      'proj-captions',
      'en',
      JSON.stringify(TEST_SEGMENTS),
    ],
  );
});

afterAll(async () => {
  await conn.execute(
    'DELETE FROM caption_tracks WHERE asset_id IN (?, ?)',
    [seededAssetId, seededAssetWithTrackId],
  );
  await conn.execute(
    'DELETE FROM project_assets_current WHERE asset_id IN (?, ?)',
    [seededAssetId, seededAssetWithTrackId],
  );
  await conn.end();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /assets/:id/transcribe ───────────────────────────────────────────────

describe('POST /assets/:id/transcribe', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).post(`/assets/${seededAssetId}/transcribe`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .post(`/assets/${seededAssetId}/transcribe`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent asset', async () => {
    const res = await request(app)
      .post('/assets/00000000-0000-0000-0000-000000000000/transcribe')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when a caption track already exists for the asset', async () => {
    const res = await request(app)
      .post(`/assets/${seededAssetWithTrackId}/transcribe`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(409);
  });

  it('returns 202 with { jobId } on happy path', async () => {
    const { transcriptionQueue } = await import('@/queues/bullmq.js');
    vi.mocked(transcriptionQueue.add).mockResolvedValueOnce({ id: seededAssetId } as ReturnType<typeof transcriptionQueue.add> extends Promise<infer T> ? T : never);

    const res = await request(app)
      .post(`/assets/${seededAssetId}/transcribe`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('jobId');
    expect(typeof res.body.jobId).toBe('string');
  });
});

// ── GET /assets/:id/captions ─────────────────────────────────────────────────

describe('GET /assets/:id/captions', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/assets/${seededAssetWithTrackId}/captions`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .get(`/assets/${seededAssetWithTrackId}/captions`)
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('returns 404 when no caption track exists for the asset', async () => {
    const res = await request(app)
      .get(`/assets/${seededAssetId}/captions`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 with { segments } when a caption track exists', async () => {
    const res = await request(app)
      .get(`/assets/${seededAssetWithTrackId}/captions`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      segments: [
        { start: 0.0, end: 2.5, text: 'Hello world' },
        { start: 2.5, end: 5.0, text: 'This is a caption' },
      ],
    });
  });
});
