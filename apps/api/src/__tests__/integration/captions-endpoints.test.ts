/**
 * Integration tests for the captions HTTP endpoints.
 *
 * POST /assets/:id/transcribe — 202 { jobId }, 409 if track exists, 404 if file missing
 * GET  /assets/:id/captions  — 200 { segments }, 404 if no track yet
 *
 * The `:id` path parameter is treated as a `files.file_id` after migration 024
 * (asset IDs were reused as file IDs during the backfill).
 *
 * Requires a live MySQL instance (docker compose up db).
 * BullMQ queue operations are mocked to avoid a Redis dependency in tests.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/captions-endpoints.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

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
  APP_JWT_SECRET:           'captions-ep-int-test-secret-exactly32!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Session auth helpers ──────────────────────────────────────────────────────

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const CAPT_USER_ID = `capt-ep-${randomUUID().slice(0, 8)}`;
const CAPT_SESSION_ID = randomUUID();
const CAPT_RAW_TOKEN = `tok-capt-${randomUUID()}`;

/** File with no caption track — used for POST transcribe happy path. */
let seededFileId: string;
/** File with a pre-seeded caption track — used for 409 and GET ready tests. */
let seededFileWithTrackId: string;

const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'This is a caption' },
];

/** Returns the Authorization header value for the seeded session. */
function validAuthHeader(): string {
  return `Bearer ${CAPT_RAW_TOKEN}`;
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

  // Seed user
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [CAPT_USER_ID, `${CAPT_USER_ID}@test.com`, 'Captions Test User'],
  );

  // Seed session with a valid expiry (1 hour from now)
  const expiresAt = new Date(Date.now() + 3_600_000);
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [CAPT_SESSION_ID, CAPT_USER_ID, sha256(CAPT_RAW_TOKEN), expiresAt],
  );

  // File with no caption track — used for POST transcribe happy path.
  seededFileId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [
      seededFileId,
      CAPT_USER_ID,
      'video',
      `s3://test-bucket/files/${seededFileId}/sample.mp4`,
      'video/mp4',
      'sample.mp4',
      'ready',
    ],
  );

  // File with a pre-seeded caption track — used for 409 and GET ready tests.
  seededFileWithTrackId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [
      seededFileWithTrackId,
      CAPT_USER_ID,
      'video',
      `s3://test-bucket/files/${seededFileWithTrackId}/sample2.mp4`,
      'video/mp4',
      'sample2.mp4',
      'ready',
    ],
  );

  // Pre-seed caption track for seededFileWithTrackId.
  const seededTrackId = randomUUID();
  await conn.execute(
    `INSERT INTO caption_tracks
       (caption_track_id, file_id, project_id, language, segments_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE caption_track_id = caption_track_id`,
    [
      seededTrackId,
      seededFileWithTrackId,
      'proj-captions-ep',
      'en',
      JSON.stringify(TEST_SEGMENTS),
    ],
  );
});

afterAll(async () => {
  await conn.execute(
    'DELETE FROM caption_tracks WHERE file_id IN (?, ?)',
    [seededFileId, seededFileWithTrackId],
  );
  await conn.execute(
    'DELETE FROM files WHERE file_id IN (?, ?)',
    [seededFileId, seededFileWithTrackId],
  );
  await conn.execute('DELETE FROM sessions WHERE session_id = ?', [CAPT_SESSION_ID]);
  await conn.execute('DELETE FROM users WHERE user_id = ?', [CAPT_USER_ID]);
  await conn.end();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /assets/:id/transcribe ───────────────────────────────────────────────

describe('POST /assets/:id/transcribe', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).post(`/assets/${seededFileId}/transcribe`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    const res = await request(app)
      .post(`/assets/${seededFileId}/transcribe`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent file id', async () => {
    const res = await request(app)
      .post('/assets/00000000-0000-0000-0000-000000000000/transcribe')
      .set('Authorization', validAuthHeader());
    expect(res.status).toBe(404);
  });

  it('returns 409 when a caption track already exists for the file', async () => {
    const res = await request(app)
      .post(`/assets/${seededFileWithTrackId}/transcribe`)
      .set('Authorization', validAuthHeader());
    expect(res.status).toBe(409);
  });

  it('returns 202 with { jobId } on happy path', async () => {
    const { transcriptionQueue } = await import('@/queues/bullmq.js');
    vi.mocked(transcriptionQueue.add).mockResolvedValueOnce(
      { id: seededFileId } as ReturnType<typeof transcriptionQueue.add> extends Promise<infer T>
        ? T
        : never,
    );

    const res = await request(app)
      .post(`/assets/${seededFileId}/transcribe`)
      .set('Authorization', validAuthHeader());

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('jobId');
    expect(typeof res.body.jobId).toBe('string');
  });
});

// ── GET /assets/:id/captions ─────────────────────────────────────────────────

describe('GET /assets/:id/captions', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/assets/${seededFileWithTrackId}/captions`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    const res = await request(app)
      .get(`/assets/${seededFileWithTrackId}/captions`)
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('returns 404 when no caption track exists for the file', async () => {
    const res = await request(app)
      .get(`/assets/${seededFileId}/captions`)
      .set('Authorization', validAuthHeader());
    expect(res.status).toBe(404);
  });

  it('returns 200 with { segments } when a caption track exists', async () => {
    const res = await request(app)
      .get(`/assets/${seededFileWithTrackId}/captions`)
      .set('Authorization', validAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      segments: [
        { start: 0.0, end: 2.5, text: 'Hello world' },
        { start: 2.5, end: 5.0, text: 'This is a caption' },
      ],
    });
  });
});
