/**
 * Integration tests for audio capability submissions (ElevenLabs):
 *   POST /projects/:id/ai/generate — text_to_speech, voice_cloning,
 *   speech_to_speech, music_generation
 *
 * Requires a live MySQL instance: docker compose up -d db
 * Migration 015 extends the capability ENUM to include audio values.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/ai-generation-audio-endpoints.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

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
  APP_ELEVENLABS_API_KEY:   process.env['APP_ELEVENLABS_API_KEY']   ?? 'test-el-key',
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
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-audio-url'),
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

  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Migration 015 drops + recreates ai_generation_jobs with the widened ENUM
  // (text_to_speech, voice_cloning, speech_to_speech, music_generation).
  for (const migration of [
    '001_project_assets_current.sql',
    '008_users_auth.sql',
    '011_seed_dev_user.sql',
    '015_ai_jobs_audio_capabilities.sql',
  ]) {
    const sql = readFileSync(
      resolve(__dirname, `../../db/migrations/${migration}`),
      'utf-8',
    );
    await conn.query(sql);
  }

  testProjectId = `proj-audio-gen-${Date.now()}`;
  await conn.query('INSERT INTO projects (project_id) VALUES (?)', [
    testProjectId,
  ]);
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
  await conn?.query('DELETE FROM projects WHERE project_id = ?', [
    testProjectId,
  ]);
  await conn?.end();
});

// ── Audio capability happy paths ──────────────────────────────────────────────

describe('POST /projects/:id/ai/generate — audio capabilities', () => {
  it('returns 202 and writes a queued job row for text_to_speech', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'elevenlabs/text-to-speech',
        options: { text: 'Hello from integration tests.' },
      });

    expect(res.status).toBe(202);
    expect(typeof res.body['jobId']).toBe('string');
    expect(res.body['status']).toBe('queued');
    const jobId = res.body['jobId'] as string;
    insertedJobIds.push(jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT model_id, capability, status FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['model_id']).toBe('elevenlabs/text-to-speech');
    expect(rows[0]!['capability']).toBe('text_to_speech');
    expect(rows[0]!['status']).toBe('queued');
  });

  it('returns 202 and writes a queued job row for voice_cloning', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'elevenlabs/voice-cloning',
        options: {
          name: 'Test Voice',
          audio_sample: 'https://example.com/sample.mp3',
        },
      });

    expect(res.status).toBe(202);
    const jobId = res.body['jobId'] as string;
    insertedJobIds.push(jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT model_id, capability, status FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows[0]!['model_id']).toBe('elevenlabs/voice-cloning');
    expect(rows[0]!['capability']).toBe('voice_cloning');
    expect(rows[0]!['status']).toBe('queued');
  });

  it('returns 202 and writes a queued job row for speech_to_speech', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'elevenlabs/speech-to-speech',
        options: {
          source_audio: 'https://example.com/input.mp3',
          voice_id: 'el-voice-abc',
        },
      });

    expect(res.status).toBe(202);
    const jobId = res.body['jobId'] as string;
    insertedJobIds.push(jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT capability FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows[0]!['capability']).toBe('speech_to_speech');
  });

  it('returns 202 and writes a queued job row for music_generation', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'elevenlabs/music-generation',
        options: { prompt: 'Chill lo-fi beats for focus' },
      });

    expect(res.status).toBe(202);
    const jobId = res.body['jobId'] as string;
    insertedJobIds.push(jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT capability FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows[0]!['capability']).toBe('music_generation');
  });

  it('returns 400 when the required text field is missing for text_to_speech', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'elevenlabs/text-to-speech',
        options: {},
      });

    expect(res.status).toBe(400);
    expect(res.body['error']).toMatch(/required/i);
  });

  it('returns 400 for an unrecognised ElevenLabs model id', async () => {
    const res = await request(app)
      .post(`/projects/${testProjectId}/ai/generate`)
      .send({
        modelId: 'elevenlabs/does-not-exist',
        options: {},
      });

    expect(res.status).toBe(400);
    expect(res.body['error']).toBeDefined();
  });
});
