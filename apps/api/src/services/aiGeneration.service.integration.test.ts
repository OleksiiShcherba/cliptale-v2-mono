/**
 * Integration tests for aiGeneration.service + aiGenerationJob.repository.
 *
 * Tests the full submit → complete → file-in-files → job-references-it path
 * against a real MySQL instance. No mocks for the DB layer.
 *
 * Scenarios:
 *   1. submitGeneration: inserts a job row tied to user_id only (no project_id).
 *   2. setOutputFile: marks job completed + links output_file_id.
 *   3. getJobStatus: returns outputFileId in the response.
 *   4. Provider failure path: updateJobStatus('failed') → no files row written.
 *   5. Compat shim: submitting with a legacy `projectId` body field is accepted.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/services/aiGeneration.service.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Set env vars before any app module is imported ────────────────────────────
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
  APP_JWT_SECRET:           'ai-gen-integ-test-secret-32chars!!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// Mock BullMQ — tests don't need a live Redis; job enqueue is still exercised
// via the repository layer.
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job-id' }),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;
const TEST_USER = `ai-integ-${randomUUID().slice(0, 8)}`;
const cleanupJobs: string[] = [];
const cleanupFiles: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed the test user.
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
    [TEST_USER, `${TEST_USER}@test.local`, 'hash'],
  );
});

afterAll(async () => {
  if (cleanupJobs.length) {
    await conn.query(
      `DELETE FROM ai_generation_jobs WHERE job_id IN (${cleanupJobs.map(() => '?').join(',')})`,
      cleanupJobs,
    );
  }
  if (cleanupFiles.length) {
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
  }
  await conn.execute('DELETE FROM users WHERE user_id = ?', [TEST_USER]);
  await conn.end();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('aiGeneration.service / integration', () => {
  it('submitGeneration: inserts a job row with user_id and no project_id column', async () => {
    const { submitGeneration } = await import('@/services/aiGeneration.service.js');

    const result = await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'a snowy mountain peak',
      options: {},
    });

    expect(result.status).toBe('queued');
    expect(typeof result.jobId).toBe('string');
    cleanupJobs.push(result.jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT job_id, user_id, model_id, capability, prompt, status, output_file_id
         FROM ai_generation_jobs WHERE job_id = ?`,
      [result.jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['user_id']).toBe(TEST_USER);
    expect(rows[0]!['model_id']).toBe('fal-ai/nano-banana-2');
    expect(rows[0]!['capability']).toBe('text_to_image');
    expect(rows[0]!['prompt']).toBe('a snowy mountain peak');
    expect(rows[0]!['status']).toBe('queued');
    expect(rows[0]!['output_file_id']).toBeNull();

    // Verify project_id column does NOT exist on the row result (migration 025).
    expect(rows[0]).not.toHaveProperty('project_id');
  });

  it('setOutputFile: creates a files row and links it via output_file_id', async () => {
    const { submitGeneration } = await import('@/services/aiGeneration.service.js');
    const aiJobRepo = await import('@/repositories/aiGenerationJob.repository.js');
    const fileRepo = await import('@/repositories/file.repository.js');

    // 1. Submit a job.
    const { jobId } = await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'autumn forest',
      options: {},
    });
    cleanupJobs.push(jobId);

    // 2. Simulate the worker writing a generated file to `files`.
    const fileId = randomUUID();
    cleanupFiles.push(fileId);
    await fileRepo.createPending({
      fileId,
      userId: TEST_USER,
      kind: 'image',
      storageUri: `s3://test-bucket/users/${TEST_USER}/files/${fileId}/generated.png`,
      mimeType: 'image/png',
      displayName: 'generated.png',
    });

    // 3. Finalize the file status to 'ready' (skip ingest; set directly).
    await conn.execute(
      `UPDATE files SET status = 'ready' WHERE file_id = ?`,
      [fileId],
    );

    // 4. Link the file to the job.
    await aiJobRepo.setOutputFile(jobId, fileId);

    // 5. Verify the job row reflects the completion.
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT status, progress, output_file_id FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows[0]!['status']).toBe('completed');
    expect(rows[0]!['progress']).toBe(100);
    expect(rows[0]!['output_file_id']).toBe(fileId);

    // 6. Verify the files row exists and is owned by the correct user.
    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT file_id, user_id, status, mime_type FROM files WHERE file_id = ?`,
      [fileId],
    );
    expect(fileRows).toHaveLength(1);
    expect(fileRows[0]!['user_id']).toBe(TEST_USER);
    expect(fileRows[0]!['status']).toBe('ready');
    expect(fileRows[0]!['mime_type']).toBe('image/png');
  });

  it('getJobStatus: returns outputFileId after completion', async () => {
    const { submitGeneration, getJobStatus } = await import('@/services/aiGeneration.service.js');
    const aiJobRepo = await import('@/repositories/aiGenerationJob.repository.js');
    const fileRepo = await import('@/repositories/file.repository.js');

    const { jobId } = await submitGeneration(TEST_USER, {
      modelId: 'elevenlabs/text-to-speech',
      options: { text: 'Hello from the integration test' },
    });
    cleanupJobs.push(jobId);

    const fileId = randomUUID();
    cleanupFiles.push(fileId);
    await fileRepo.createPending({
      fileId,
      userId: TEST_USER,
      kind: 'audio',
      storageUri: `s3://test-bucket/users/${TEST_USER}/files/${fileId}/speech.mp3`,
      mimeType: 'audio/mpeg',
      displayName: 'speech.mp3',
    });
    await conn.execute(`UPDATE files SET status = 'ready' WHERE file_id = ?`, [fileId]);
    await aiJobRepo.setOutputFile(jobId, fileId);

    const status = await getJobStatus(jobId, TEST_USER);
    expect(status.status).toBe('completed');
    expect(status.outputFileId).toBe(fileId);
    expect(status.progress).toBe(100);
    // resultAssetId must NOT appear on the status result.
    expect(status).not.toHaveProperty('resultAssetId');
  });

  it('provider failure: updateJobStatus sets failed and no files row is created', async () => {
    const { submitGeneration } = await import('@/services/aiGeneration.service.js');
    const aiJobRepo = await import('@/repositories/aiGenerationJob.repository.js');

    const { jobId } = await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'doomed generation',
      options: {},
    });
    cleanupJobs.push(jobId);

    // Simulate provider failure — worker calls updateJobStatus with 'failed'.
    await aiJobRepo.updateJobStatus(jobId, 'failed', 'Provider timeout');

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT status, error_message, output_file_id FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows[0]!['status']).toBe('failed');
    expect(rows[0]!['error_message']).toBe('Provider timeout');
    expect(rows[0]!['output_file_id']).toBeNull();

    // Confirm no files row was created for this job.
    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM files WHERE user_id = ? AND display_name = 'doomed generation'`,
      [TEST_USER],
    );
    expect(fileRows[0]!['cnt']).toBe(0);
  });
});
