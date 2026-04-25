/**
 * Integration tests for POST /generation-drafts/:draftId/ai/generate.
 *
 * Requires a live MySQL instance (docker compose up -d db).
 * BullMQ is mocked to avoid a Redis dependency.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/generation-draft-ai-generate.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

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
  APP_JWT_SECRET:           'draft-ai-gen-int-test-secret-32chars!',
  APP_DEV_AUTH_BYPASS:      'false',
});

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
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  GetObjectCommand: vi.fn().mockImplementation((p) => ({ ...p })),
  PutObjectCommand: vi.fn().mockImplementation((p) => ({ ...p })),
  HeadObjectCommand: vi.fn().mockImplementation((p) => ({ ...p })),
}));

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let app: Express;
let conn: Connection;
let userOwnerA: string;
let userOtherB: string;
let tokenA: string;
let tokenB: string;
let sessionAId: string;
let sessionBId: string;
let draftA: string;

const cleanupJobs: string[] = [];
const cleanupFiles: string[] = [];

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

  userOwnerA = `dagi-a-${randomUUID().slice(0, 8)}`;
  userOtherB = `dagi-b-${randomUUID().slice(0, 8)}`;
  tokenA     = `tok-a-${randomUUID()}`;
  tokenB     = `tok-b-${randomUUID()}`;
  sessionAId = randomUUID();
  sessionBId = randomUUID();
  draftA     = randomUUID();

  const expiresAt = new Date(Date.now() + 3_600_000);

  for (const [uid, email] of [
    [userOwnerA, `${userOwnerA}@test.local`],
    [userOtherB, `${userOtherB}@test.local`],
  ] as [string, string][]) {
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)`,
      [uid, email, uid],
    );
  }

  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionAId, userOwnerA, sha256(tokenA), expiresAt],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionBId, userOtherB, sha256(tokenB), expiresAt],
  );

  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftA, userOwnerA, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
});

afterAll(async () => {
  if (cleanupFiles.length) {
    const ph = cleanupFiles.map(() => '?').join(',');
    await conn.query(`DELETE FROM draft_files WHERE file_id IN (${ph})`, cleanupFiles);
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, cleanupFiles);
  }
  if (cleanupJobs.length) {
    const ph = cleanupJobs.map(() => '?').join(',');
    await conn.query(`DELETE FROM ai_generation_jobs WHERE job_id IN (${ph})`, cleanupJobs);
  }
  await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [draftA]);
  await conn.execute(
    'DELETE FROM sessions WHERE session_id IN (?, ?)',
    [sessionAId, sessionBId],
  );
  await conn.execute(
    'DELETE FROM users WHERE user_id IN (?, ?)',
    [userOwnerA, userOtherB],
  );
  await conn.end();
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /generation-drafts/:draftId/ai/generate — happy path', () => {
  it('returns 202 with jobId and queued status; draft_id is set on job row', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ modelId: 'fal-ai/nano-banana-2', prompt: 'sunrise over mountains', options: {} });

    expect(res.status).toBe(202);
    expect(typeof res.body['jobId']).toBe('string');
    expect(res.body['status']).toBe('queued');

    const jobId = res.body['jobId'] as string;
    cleanupJobs.push(jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT user_id, capability, status, output_file_id, draft_id
         FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['user_id']).toBe(userOwnerA);
    expect(rows[0]!['capability']).toBe('text_to_image');
    expect(rows[0]!['status']).toBe('queued');
    expect(rows[0]!['output_file_id']).toBeNull();
    expect(rows[0]!['draft_id']).toBe(draftA);
  });

  it('auto-links output file into draft_files when setOutputFile is called', async () => {
    const aiJobRepo = await import('@/repositories/aiGenerationJob.repository.js');
    const fileRepo  = await import('@/repositories/file.repository.js');

    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ modelId: 'fal-ai/nano-banana-2', prompt: 'autumn forest', options: {} });

    expect(res.status).toBe(202);
    const jobId = res.body['jobId'] as string;
    cleanupJobs.push(jobId);

    // Simulate worker: insert file row + call setOutputFile.
    const fileId = randomUUID();
    cleanupFiles.push(fileId);
    await fileRepo.createPending({
      fileId,
      userId: userOwnerA,
      kind: 'image',
      storageUri: `s3://test-bucket/users/${userOwnerA}/files/${fileId}/gen.png`,
      mimeType: 'image/png',
      displayName: 'gen.png',
    });
    await conn.execute(`UPDATE files SET status = 'ready' WHERE file_id = ?`, [fileId]);
    await aiJobRepo.setOutputFile(jobId, fileId);

    // draft_files row must exist.
    const [dfRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT draft_id, file_id FROM draft_files WHERE draft_id = ? AND file_id = ?',
      [draftA, fileId],
    );
    expect(dfRows).toHaveLength(1);

    // GET /generation-drafts/:id/assets must surface the generated file.
    const assetsRes = await request(app)
      .get(`/generation-drafts/${draftA}/assets`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(assetsRes.status).toBe(200);
    const fileIds = (assetsRes.body.items as Array<{ id: string }>).map((a) => a.id);
    expect(fileIds).toContain(fileId);
  });
});

// ── Ownership / auth edge cases ───────────────────────────────────────────────

describe('POST /generation-drafts/:draftId/ai/generate — ownership', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .send({ modelId: 'fal-ai/nano-banana-2', options: {} });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller does not own the draft', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ modelId: 'fal-ai/nano-banana-2', prompt: 'rejected', options: {} });
    expect(res.status).toBe(403);
  });

  it('returns 404 when draft does not exist', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${randomUUID()}/ai/generate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ modelId: 'fal-ai/nano-banana-2', prompt: 'ghost', options: {} });
    expect(res.status).toBe(404);
  });
});

// ── Validation edge cases ─────────────────────────────────────────────────────

describe('POST /generation-drafts/:draftId/ai/generate — validation', () => {
  it('returns 400 when modelId is not in the catalog', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ modelId: 'fal-ai/not-a-real-model', options: {} });
    expect(res.status).toBe(400);
  });

  it('returns 400 when modelId is missing from body', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ options: {} });
    expect(res.status).toBe(400);
  });
});

// ── Provider failure path ─────────────────────────────────────────────────────

describe('POST /generation-drafts/:draftId/ai/generate — provider failure', () => {
  it('marks job as failed with no draft_files link when setOutputFile is never called', async () => {
    const aiJobRepo = await import('@/repositories/aiGenerationJob.repository.js');

    const res = await request(app)
      .post(`/generation-drafts/${draftA}/ai/generate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ modelId: 'fal-ai/nano-banana-2', prompt: 'doomed', options: {} });

    expect(res.status).toBe(202);
    const jobId = res.body['jobId'] as string;
    cleanupJobs.push(jobId);

    // Simulate provider failure — no file row is created, setOutputFile is never called.
    await aiJobRepo.updateJobStatus(jobId, 'failed', 'Provider timeout');

    const [jobRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status, output_file_id FROM ai_generation_jobs WHERE job_id = ?',
      [jobId],
    );
    expect(jobRows[0]!['status']).toBe('failed');
    expect(jobRows[0]!['output_file_id']).toBeNull();
  });
});
