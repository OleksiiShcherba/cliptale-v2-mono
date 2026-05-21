import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_038_PATH = resolve(
  __dirname,
  '../../db/migrations/038_storyboard_scene_illustration_jobs.sql',
);
const MIGRATION_039_PATH = resolve(
  __dirname,
  '../../db/migrations/039_storyboard_scene_illustration_active_lock.sql',
);
const MIGRATION_040_PATH = resolve(
  __dirname,
  '../../db/migrations/040_storyboard_illustration_references.sql',
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
  APP_JWT_SECRET: 'storyboard-illustration-int-test-secret!',
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
let sceneNoPrompt: string;
let sceneB1: string;
let draftNoReference: string;
let sceneNoReference: string;

const cleanupJobs: string[] = [];
const cleanupFiles: string[] = [];
let sceneA1JobId: string;

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
  prompt: string | null;
  sortOrder: number;
}): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', ?, ?, 5, 0, 0, ?, 'cinematic')`,
    [params.id, params.draftId, params.name, params.prompt, params.sortOrder],
  );
}

async function seedReadyReference(draftId: string, userId: string): Promise<void> {
  const jobId = randomUUID();
  const fileId = randomUUID();
  cleanupJobs.push(jobId);
  cleanupFiles.push(fileId);

  await conn.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
     VALUES (?, ?, 'gpt-image-2', 'text_to_image', 'reference', JSON_OBJECT(), 'completed', 100, ?, ?)`,
    [jobId, userId, fileId, draftId],
  );
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'ready-reference.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  await conn.execute(
    `INSERT INTO storyboard_illustration_references
       (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids, active_lock)
     VALUES (?, ?, ?, 'ready', ?, JSON_ARRAY(), 1)`,
    [randomUUID(), draftId, jobId, fileId],
  );
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
  await conn.query(readFileSync(MIGRATION_038_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_039_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_040_PATH, 'utf-8'));

  userA = `ill-a-${randomUUID().slice(0, 8)}`;
  userB = `ill-b-${randomUUID().slice(0, 8)}`;
  tokenA = `tok-ill-a-${randomUUID()}`;
  tokenB = `tok-ill-b-${randomUUID()}`;
  sessionA = randomUUID();
  sessionB = randomUUID();
  draftA = randomUUID();
  draftB = randomUUID();
  draftNoReference = randomUUID();
  sceneA1 = randomUUID();
  sceneA2 = randomUUID();
  sceneNoPrompt = randomUUID();
  sceneB1 = randomUUID();
  sceneNoReference = randomUUID();

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
    blocks: [{ type: 'text', value: 'Storyboard illustration endpoint test.' }],
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
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)',
    [draftNoReference, userA, JSON.stringify(promptDoc), 'step2'],
  );

  await seedScene({
    id: sceneA1,
    draftId: draftA,
    name: 'Scene 01',
    prompt: 'A cinematic product hero frame.',
    sortOrder: 1,
  });
  await seedScene({
    id: sceneA2,
    draftId: draftA,
    name: 'Scene 02',
    prompt: 'A close-up workflow detail.',
    sortOrder: 2,
  });
  await seedScene({
    id: sceneNoPrompt,
    draftId: draftA,
    name: 'Scene no prompt',
    prompt: null,
    sortOrder: 3,
  });
  await seedScene({
    id: sceneB1,
    draftId: draftB,
    name: 'Other owner scene',
    prompt: 'Other owner prompt.',
    sortOrder: 1,
  });
  await seedScene({
    id: sceneNoReference,
    draftId: draftNoReference,
    name: 'Scene without reference',
    prompt: 'A scene that should wait for the canonical reference.',
    sortOrder: 1,
  });

  await seedReadyReference(draftA, userA);
  await seedReadyReference(draftB, userB);
});

afterAll(async () => {
  if (conn) {
    await conn.execute(
      'DELETE FROM storyboard_illustration_references WHERE draft_id IN (?, ?)',
      [draftA, draftB],
    );
    await conn.execute(
      'DELETE FROM storyboard_illustration_references WHERE draft_id = ?',
      [draftNoReference],
    );
    await conn.execute(
      'DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id IN (?, ?)',
      [draftA, draftB],
    );
    await conn.execute(
      'DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id = ?',
      [draftNoReference],
    );
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
    await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [draftNoReference]);
    await conn.execute('DELETE FROM generation_drafts WHERE id IN (?, ?, ?)', [draftA, draftB, draftNoReference]);
    await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [sessionA, sessionB]);
    await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [userA, userB]);
    await conn.end();
  }
});

describe('storyboard illustration endpoints', () => {
  it('returns 401 without auth and preserves owner/missing resource semantics', async () => {
    await expect(request(app).get(`/storyboards/${draftA}/illustrations`)).resolves.toMatchObject({
      status: 401,
    });

    await expect(
      request(app)
        .post(`/storyboards/${draftA}/illustrations`)
        .set('Authorization', authB())
        .send({}),
    ).resolves.toMatchObject({ status: 403 });

    await expect(
      request(app)
        .post(`/storyboards/${randomUUID()}/illustrations`)
        .set('Authorization', authA())
        .send({}),
    ).resolves.toMatchObject({ status: 404 });

    await expect(
      request(app)
        .post(`/storyboards/${draftA}/blocks/${sceneB1}/illustration`)
        .set('Authorization', authA())
        .send({}),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('lists all scene statuses in storyboard order', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftA}/illustrations`)
      .set('Authorization', authA());

    expect(res.status).toBe(200);
    expect(res.body.reference).toMatchObject({
      status: 'ready',
      outputFileId: expect.any(String),
      sourceReferenceFileIds: [],
      errorMessage: null,
    });
    expect(res.body.reference.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.items.map((item: { blockId: string }) => item.blockId)).toEqual([
      sceneA1,
      sceneA2,
      sceneNoPrompt,
    ]);
    expect(res.body.items).toEqual([
      { blockId: sceneA1, status: 'queued', jobId: null, outputFileId: null, errorMessage: null },
      { blockId: sceneA2, status: 'queued', jobId: null, outputFileId: null, errorMessage: null },
      { blockId: sceneNoPrompt, status: 'queued', jobId: null, outputFileId: null, errorMessage: null },
    ]);
  });

  it('starts one scene illustration and stores the draft-scoped queued mapping', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftA}/blocks/${sceneA1}/illustration`)
      .set('Authorization', authA())
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.reference).toMatchObject({
      status: 'ready',
      outputFileId: expect.any(String),
      sourceReferenceFileIds: [],
      errorMessage: null,
    });
    expect(res.body.reference.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const item = res.body.items.find((candidate: { blockId: string }) => candidate.blockId === sceneA1);
    expect(item).toMatchObject({
      blockId: sceneA1,
      status: 'queued',
      outputFileId: null,
      errorMessage: null,
    });
    expect(item.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    cleanupJobs.push(item.jobId);
    sceneA1JobId = item.jobId;

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT sj.block_id, sj.status, aj.draft_id, aj.model_id, aj.options
         FROM storyboard_scene_illustration_jobs sj
         INNER JOIN ai_generation_jobs aj ON aj.job_id = sj.ai_job_id
        WHERE sj.ai_job_id = ?`,
      [item.jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['block_id']).toBe(sceneA1);
    expect(rows[0]!['status']).toBe('queued');
    expect(rows[0]!['draft_id']).toBe(draftA);
    expect(rows[0]!['model_id']).toBe('gpt-image-2');
    const options =
      typeof rows[0]!['options'] === 'string'
        ? JSON.parse(rows[0]!['options'] as string)
        : rows[0]!['options'];
    expect(options).toMatchObject({
      kind: 'scene',
      blockId: sceneA1,
      referenceFileIds: expect.any(Array),
      previousSceneFileId: null,
      size: '1536x1024',
    });
  });

  it('creates a canonical reference first and leaves scene jobs unqueued when no reference exists', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftNoReference}/illustrations`)
      .set('Authorization', authA())
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.reference).toMatchObject({
      status: 'queued',
      outputFileId: null,
      sourceReferenceFileIds: [],
      errorMessage: null,
    });
    expect(res.body.reference.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.items).toEqual([
      {
        blockId: sceneNoReference,
        status: 'queued',
        jobId: null,
        outputFileId: null,
        errorMessage: null,
      },
    ]);

    const [referenceRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT sr.status, sr.source_reference_file_ids, aj.model_id, aj.capability, aj.draft_id
         FROM storyboard_illustration_references sr
         INNER JOIN ai_generation_jobs aj ON aj.job_id = sr.ai_job_id
        WHERE sr.draft_id = ?`,
      [draftNoReference],
    );
    expect(referenceRows).toHaveLength(1);
    expect(referenceRows[0]!['status']).toBe('queued');
    expect(referenceRows[0]!['model_id']).toBe('gpt-image-2');
    expect(referenceRows[0]!['capability']).toBe('text_to_image');
    expect(referenceRows[0]!['draft_id']).toBe(draftNoReference);

    const [sceneRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_scene_illustration_jobs WHERE draft_id = ?',
      [draftNoReference],
    );
    expect(Number(sceneRows[0]!['cnt'])).toBe(0);
  });

  it('reconciles completed mapped jobs into storyboard block media during status polling', async () => {
    const fileId = randomUUID();
    cleanupFiles.push(fileId);
    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'image', ?, 'image/png', 'generated-scene.png', 'ready')`,
      [fileId, userA, `s3://test-bucket/${fileId}.png`],
    );
    await conn.execute(
      `UPDATE ai_generation_jobs
          SET status = 'completed',
              progress = 100,
              output_file_id = ?
        WHERE job_id = ?`,
      [fileId, sceneA1JobId],
    );
    await conn.execute(
      'INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)',
      [draftA, fileId],
    );

    const status = await request(app)
      .get(`/storyboards/${draftA}/illustrations`)
      .set('Authorization', authA());
    expect(status.status).toBe(200);
    expect(status.body.items.find((item: { blockId: string }) => item.blockId === sceneA1)).toMatchObject({
      status: 'ready',
      outputFileId: fileId,
    });

    const storyboard = await request(app)
      .get(`/storyboards/${draftA}`)
      .set('Authorization', authA());
    expect(storyboard.status).toBe(200);
    const scene = storyboard.body.blocks.find((block: { id: string }) => block.id === sceneA1);
    expect(scene.mediaItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fileId, mediaType: 'image', sortOrder: 0 }),
      ]),
    );

    const repeat = await request(app)
      .get(`/storyboards/${draftA}/illustrations`)
      .set('Authorization', authA());
    expect(repeat.status).toBe(200);
    const [mediaRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_block_media WHERE block_id = ? AND file_id = ?',
      [sceneA1, fileId],
    );
    expect(Number(mediaRows[0]!['cnt'])).toBe(1);
  });

  it('starts all missing scene illustrations for a draft', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftB}/illustrations`)
      .set('Authorization', authB())
      .send({});

    expect(res.status).toBe(202);
    expect(res.body.items).toHaveLength(1);
    const [item] = res.body.items as Array<{ blockId: string; status: string; jobId: string }>;
    expect(item).toMatchObject({ blockId: sceneB1, status: 'queued' });
    cleanupJobs.push(item.jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT draft_id, block_id, ai_job_id FROM storyboard_scene_illustration_jobs WHERE ai_job_id = ?',
      [item.jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['draft_id']).toBe(draftB);
    expect(rows[0]!['block_id']).toBe(sceneB1);
  });

  it('returns 422 from the all-scenes endpoint before enqueuing partial work when any target scene lacks a prompt', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftA}/illustrations`)
      .set('Authorization', authA())
      .send({});

    expect(res.status).toBe(422);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_scene_illustration_jobs WHERE block_id = ?',
      [sceneA2],
    );
    expect(Number(rows[0]!['cnt'])).toBe(0);
  });

  it('does not duplicate active jobs and returns 422 for missing prompts', async () => {
    const first = await request(app)
      .post(`/storyboards/${draftA}/blocks/${sceneA2}/illustration`)
      .set('Authorization', authA())
      .send({});
    expect(first.status).toBe(202);
    const firstItem = first.body.items.find((candidate: { blockId: string }) => candidate.blockId === sceneA2);
    cleanupJobs.push(firstItem.jobId);

    const again = await request(app)
      .post(`/storyboards/${draftA}/blocks/${sceneA2}/illustration`)
      .set('Authorization', authA())
      .send({});
    expect(again.status).toBe(202);

    const [counts] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_scene_illustration_jobs WHERE block_id = ?',
      [sceneA2],
    );
    expect(Number(counts[0]!['cnt'])).toBe(1);

    const missingPrompt = await request(app)
      .post(`/storyboards/${draftA}/blocks/${sceneNoPrompt}/illustration`)
      .set('Authorization', authA())
      .send({});
    expect(missingPrompt.status).toBe(422);
  });
});
