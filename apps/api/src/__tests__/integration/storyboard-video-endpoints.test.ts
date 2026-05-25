import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_044_PATH = resolve(
  __dirname,
  '../../db/migrations/044_storyboard_scene_video_jobs.sql',
);

Object.assign(process.env, {
  APP_DB_HOST: process.env['APP_DB_HOST'] ?? 'localhost',
  APP_DB_PORT: process.env['APP_DB_PORT'] ?? '3306',
  APP_DB_NAME: process.env['APP_DB_NAME'] ?? 'cliptale',
  APP_DB_USER: process.env['APP_DB_USER'] ?? 'cliptale',
  APP_DB_PASSWORD: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  APP_REDIS_URL: process.env['APP_REDIS_URL'] ?? 'redis://localhost:6379',
  APP_S3_BUCKET: process.env['APP_S3_BUCKET'] ?? 'test-bucket',
  APP_S3_REGION: process.env['APP_S3_REGION'] ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID: process.env['APP_S3_ACCESS_KEY_ID'] ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET: 'storyboard-video-int-test-secret!',
  APP_DEV_AUTH_BYPASS: 'false',
});

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: randomUUID() }),
      getJob: vi.fn(),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let app: Express;
let conn: Connection;
let userA: string;
let userB: string;
let tokenA: string;
let tokenB: string;
let sessionA: string;
let sessionB: string;
let draftA: string;
let draftB: string;
let sceneA1: string;
let sceneA2: string;
let sceneB1: string;

const cleanupJobs: string[] = [];
const cleanupFiles: string[] = [];

function authA(): string {
  return `Bearer ${tokenA}`;
}

function authB(): string {
  return `Bearer ${tokenB}`;
}

async function seedScene(params: {
  id: string;
  draftId: string;
  name: string;
  prompt: string;
  videoPrompt: string | null;
  sortOrder: number;
}): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, video_prompt, duration_s, position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', ?, ?, ?, 5, 0, 0, ?, 'cinematic')`,
    [params.id, params.draftId, params.name, params.prompt, params.videoPrompt, params.sortOrder],
  );
}

async function seedReadyImageFile(userId: string, name: string): Promise<string> {
  const fileId = randomUUID();
  cleanupFiles.push(fileId);
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', ?, 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`, name],
  );
  return fileId;
}

async function seedReadyReference(draftId: string, userId: string): Promise<void> {
  const jobId = randomUUID();
  const fileId = await seedReadyImageFile(userId, 'ready-reference.png');
  cleanupJobs.push(jobId);
  await conn.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
     VALUES (?, ?, 'gpt-image-2', 'text_to_image', 'reference', JSON_OBJECT(), 'completed', 100, ?, ?)`,
    [jobId, userId, fileId, draftId],
  );
  await conn.execute(
    `INSERT INTO storyboard_illustration_references
       (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids, active_lock,
        approval_status, approved_at)
     VALUES (?, ?, ?, 'ready', ?, JSON_ARRAY(), 1, 'approved', NOW(3))`,
    [randomUUID(), draftId, jobId, fileId],
  );
}

async function seedReadyIllustration(params: {
  draftId: string;
  userId: string;
  blockId: string;
  name: string;
}): Promise<string> {
  const jobId = randomUUID();
  const fileId = await seedReadyImageFile(params.userId, params.name);
  cleanupJobs.push(jobId);
  await conn.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
     VALUES (?, ?, 'gpt-image-2', 'image_edit', 'scene image', JSON_OBJECT(), 'completed', 100, ?, ?)`,
    [jobId, params.userId, fileId, params.draftId],
  );
  await conn.execute(
    `INSERT INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status, output_file_id, active_lock)
     VALUES (?, ?, ?, ?, 'ready', ?, 1)`,
    [randomUUID(), params.draftId, params.blockId, jobId, fileId],
  );
  return fileId;
}

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    multipleStatements: true,
  });
  await conn.query(readFileSync(MIGRATION_044_PATH, 'utf-8'));

  userA = `vid-a-${randomUUID().slice(0, 8)}`;
  userB = `vid-b-${randomUUID().slice(0, 8)}`;
  tokenA = `tok-vid-a-${randomUUID()}`;
  tokenB = `tok-vid-b-${randomUUID()}`;
  sessionA = randomUUID();
  sessionB = randomUUID();
  draftA = randomUUID();
  draftB = randomUUID();
  sceneA1 = randomUUID();
  sceneA2 = randomUUID();
  sceneB1 = randomUUID();

  for (const [uid, email] of [
    [userA, `${userA}@test.local`],
    [userB, `${userB}@test.local`],
  ] as const) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)`,
      [uid, email, uid],
    );
  }

  const expiresAt = new Date(Date.now() + 3_600_000);
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionA, userA, sha256(tokenA), expiresAt],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionB, userB, sha256(tokenB), expiresAt],
  );

  const promptDoc = {
    schemaVersion: 1,
    blocks: [{ type: 'text', value: 'Storyboard video endpoint test.' }],
    settings: {
      videoLengthSeconds: 30,
      aspectRatio: '16:9',
      styleKey: 'cinematic',
      modelPreference: null,
    },
  };
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)',
    [draftA, userA, JSON.stringify(promptDoc), 'step2'],
  );
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)',
    [draftB, userB, JSON.stringify(promptDoc), 'step2'],
  );

  await seedScene({
    id: sceneA1,
    draftId: draftA,
    name: 'Scene 01',
    prompt: 'A cinematic product hero frame.',
    videoPrompt: 'Push in while the subject turns toward camera.',
    sortOrder: 1,
  });
  await seedScene({
    id: sceneA2,
    draftId: draftA,
    name: 'Scene 02',
    prompt: 'A close-up workflow detail.',
    videoPrompt: 'Pan across the completed timeline.',
    sortOrder: 2,
  });
  await seedScene({
    id: sceneB1,
    draftId: draftB,
    name: 'Other owner scene',
    prompt: 'Other owner prompt.',
    videoPrompt: 'Other owner motion.',
    sortOrder: 1,
  });

  await seedReadyReference(draftA, userA);
  await seedReadyReference(draftB, userB);
  await seedReadyIllustration({ draftId: draftA, userId: userA, blockId: sceneA1, name: 'scene-a1.png' });
  await seedReadyIllustration({ draftId: draftA, userId: userA, blockId: sceneA2, name: 'scene-a2.png' });
  await seedReadyIllustration({ draftId: draftB, userId: userB, blockId: sceneB1, name: 'scene-b1.png' });
});

afterAll(async () => {
  if (!conn) return;
  await conn.execute('DELETE FROM storyboard_scene_video_jobs WHERE draft_id IN (?, ?)', [draftA, draftB]);
  await conn.execute('DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id IN (?, ?)', [draftA, draftB]);
  await conn.execute('DELETE FROM storyboard_illustration_references WHERE draft_id IN (?, ?)', [draftA, draftB]);
  if (cleanupJobs.length) {
    await conn.query(
      `DELETE FROM ai_generation_jobs WHERE job_id IN (${cleanupJobs.map(() => '?').join(',')})`,
      cleanupJobs,
    );
  }
  if (cleanupFiles.length) {
    await conn.query(
      `DELETE FROM draft_files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
  }
  await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id IN (?, ?)', [draftA, draftB]);
  await conn.execute('DELETE FROM generation_drafts WHERE id IN (?, ?)', [draftA, draftB]);
  await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [sessionA, sessionB]);
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [userA, userB]);
  await conn.end();
});

describe('storyboard video endpoints', () => {
  it('preserves auth, owner, and missing resource semantics', async () => {
    await expect(request(app).get(`/storyboards/${draftA}/videos`)).resolves.toMatchObject({
      status: 401,
    });

    await expect(
      request(app)
        .post(`/storyboards/${draftA}/videos`)
        .set('Authorization', authB())
        .send({ modelId: 'fal-ai/ltx-2-19b/image-to-video', generateAudio: false }),
    ).resolves.toMatchObject({ status: 403 });

    await expect(
      request(app)
        .post(`/storyboards/${randomUUID()}/videos`)
        .set('Authorization', authA())
        .send({ modelId: 'fal-ai/ltx-2-19b/image-to-video', generateAudio: false }),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('starts video jobs, persists mappings, and lists full per-scene status fields', async () => {
    const start = await request(app)
      .post(`/storyboards/${draftA}/videos`)
      .set('Authorization', authA())
      .send({ modelId: 'fal-ai/ltx-2-19b/image-to-video', generateAudio: true });

    expect(start.status).toBe(202);
    expect(start.body.items).toHaveLength(2);
    expect(start.body.items.map((item: { blockId: string }) => item.blockId)).toEqual([sceneA1, sceneA2]);
    expect(start.body.items[0]).toMatchObject({
      blockId: sceneA1,
      status: 'queued',
      jobId: expect.any(String),
      modelId: 'fal-ai/ltx-2-19b/image-to-video',
      generateAudio: true,
      outputFileId: null,
      errorMessage: null,
    });

    const [mappingRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      `SELECT block_id, ai_job_id, model_id, generate_audio, status
         FROM storyboard_scene_video_jobs
        WHERE draft_id = ?
        ORDER BY created_at ASC`,
      [draftA],
    );
    expect(mappingRows).toHaveLength(2);
    expect(mappingRows.map((row) => row['block_id'])).toEqual(expect.arrayContaining([sceneA1, sceneA2]));
    expect(mappingRows.every((row) => row['model_id'] === 'fal-ai/ltx-2-19b/image-to-video')).toBe(true);
    expect(mappingRows.every((row) => Number(row['generate_audio']) === 1)).toBe(true);

    const repeat = await request(app)
      .post(`/storyboards/${draftA}/videos`)
      .set('Authorization', authA())
      .send({ modelId: 'fal-ai/ltx-2-19b/image-to-video', generateAudio: true });
    expect(repeat.status).toBe(202);

    const [countRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_scene_video_jobs WHERE draft_id = ?',
      [draftA],
    );
    expect(Number(countRows[0]!['cnt'])).toBe(2);

    const list = await request(app)
      .get(`/storyboards/${draftA}/videos`)
      .set('Authorization', authA());
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toMatchObject({
      blockId: sceneA1,
      status: 'queued',
      jobId: expect.any(String),
      modelId: 'fal-ai/ltx-2-19b/image-to-video',
      generateAudio: true,
      outputFileId: null,
      errorMessage: null,
    });
  });

  it('refreshes failed AI job status into endpoint responses', async () => {
    const [rows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      `SELECT ai_job_id
         FROM storyboard_scene_video_jobs
        WHERE draft_id = ? AND block_id = ?
        LIMIT 1`,
      [draftA, sceneA1],
    );
    const jobId = rows[0]!['ai_job_id'] as string;
    await conn.execute(
      `UPDATE ai_generation_jobs
          SET status = 'failed', error_message = 'provider failed'
        WHERE job_id = ?`,
      [jobId],
    );

    const list = await request(app)
      .get(`/storyboards/${draftA}/videos`)
      .set('Authorization', authA());

    expect(list.status).toBe(200);
    const failed = list.body.items.find((item: { blockId: string }) => item.blockId === sceneA1);
    expect(failed).toMatchObject({
      blockId: sceneA1,
      status: 'failed',
      jobId,
      modelId: 'fal-ai/ltx-2-19b/image-to-video',
      generateAudio: true,
      outputFileId: null,
      errorMessage: 'provider failed',
    });
  });
});
