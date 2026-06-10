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
const MIGRATION_029_PATH = resolve(
  __dirname,
  '../../db/migrations/029_soft_delete_columns.sql',
);
const MIGRATION_039_PATH = resolve(
  __dirname,
  '../../db/migrations/039_storyboard_scene_illustration_active_lock.sql',
);
const MIGRATION_040_PATH = resolve(
  __dirname,
  '../../db/migrations/040_storyboard_illustration_references.sql',
);
const MIGRATION_041_PATH = resolve(
  __dirname,
  '../../db/migrations/041_storyboard_illustration_reference_approval.sql',
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
       (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids, active_lock,
        approval_status, approved_at)
     VALUES (?, ?, ?, 'ready', ?, JSON_ARRAY(), 1, 'approved', NOW(3))`,
    [randomUUID(), draftId, jobId, fileId],
  );
}

async function seedDraftFile(params: {
  draftId: string;
  userId: string;
  name: string;
  kind?: 'video' | 'audio' | 'image' | 'document' | 'other';
  status?: 'pending' | 'processing' | 'ready' | 'error';
  linkToDraft?: boolean;
  fileDeleted?: boolean;
  pivotDeleted?: boolean;
}): Promise<string> {
  const fileId = randomUUID();
  cleanupFiles.push(fileId);
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fileId,
      params.userId,
      params.kind ?? 'image',
      `s3://test-bucket/${fileId}.png`,
      params.kind === 'audio' ? 'audio/mpeg' : 'image/png',
      params.name,
      params.status ?? 'ready',
      params.fileDeleted ? new Date() : null,
    ],
  );
  if (params.linkToDraft !== false) {
    await conn.execute(
      'INSERT IGNORE INTO draft_files (draft_id, file_id, deleted_at) VALUES (?, ?, ?)',
      [params.draftId, fileId, params.pivotDeleted ? new Date() : null],
    );
  }
  return fileId;
}

async function seedReadyDraftImage(draftId: string, userId: string, name: string): Promise<string> {
  return seedDraftFile({ draftId, userId, name });
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
  await conn.query(readFileSync(MIGRATION_029_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_039_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_040_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_041_PATH, 'utf-8'));

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
    expect(res.body.automation).toMatchObject({
      phase: 'idle',
      errorMessage: null,
    });
    expect(res.body).not.toHaveProperty('reference');
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

  it('principal image approval endpoint still responds (T6 removes route)', async () => {
    // The approve endpoint exists until T6. Ensure it returns 200 with no `reference` field.
    const approved = await request(app)
      .post(`/storyboards/${draftA}/illustrations/principal-image/approve`)
      .set('Authorization', authA())
      .send({});

    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body).not.toHaveProperty('reference');
  });

  it('starts one scene illustration and stores the draft-scoped queued mapping', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftA}/blocks/${sceneA1}/illustration`)
      .set('Authorization', authA())
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body).not.toHaveProperty('reference');
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

  it('starts scene jobs directly without a canonical reference step (AC-08)', async () => {
    // After T5, start goes straight to scene enqueueing — no canonical reference creation.
    const res = await request(app)
      .post(`/storyboards/${draftNoReference}/illustrations`)
      .set('Authorization', authA())
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body).not.toHaveProperty('reference');
    const item = res.body.items.find((i: { blockId: string }) => i.blockId === sceneNoReference);
    expect(item).toMatchObject({ blockId: sceneNoReference, status: 'queued' });

    // No new storyboard_illustration_references row must have been created.
    const [referenceRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_illustration_references WHERE draft_id = ?',
      [draftNoReference],
    );
    expect(Number(referenceRows[0]!['cnt'])).toBe(0);

    // Clean up the scene job that was created.
    if (item?.jobId) {
      cleanupJobs.push(item.jobId);
      await conn.execute('DELETE FROM storyboard_scene_illustration_jobs WHERE ai_job_id = ?', [item.jobId]);
      await conn.execute('DELETE FROM ai_generation_jobs WHERE job_id = ?', [item.jobId]);
    }
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

  it('rejects invalid principal image modal inputs', async () => {
    const invalidReplace = await request(app)
      .post(`/storyboards/${draftB}/illustrations/principal-image/replace`)
      .set('Authorization', authB())
      .send({ fileId: 'not-a-uuid' });
    expect(invalidReplace.status).toBe(400);

    const missingReferences = await request(app)
      .put(`/storyboards/${draftB}/illustrations/principal-image/references`)
      .set('Authorization', authB())
      .send({});
    expect(missingReferences.status).toBe(400);

    const invalidReferences = await request(app)
      .put(`/storyboards/${draftB}/illustrations/principal-image/references`)
      .set('Authorization', authB())
      .send({ fileIds: ['not-a-uuid'] });
    expect(invalidReferences.status).toBe(400);
  });

  it('rejects principal image modal files that are not ready draft-owned images', async () => {
    const nonImageId = await seedDraftFile({
      draftId: draftB,
      userId: userB,
      name: 'not-an-image.mp3',
      kind: 'audio',
    });
    const processingImageId = await seedDraftFile({
      draftId: draftB,
      userId: userB,
      name: 'processing.png',
      status: 'processing',
    });
    const otherDraftImageId = await seedReadyDraftImage(draftA, userA, 'other-draft.png');
    const otherUserImageId = await seedDraftFile({
      draftId: draftB,
      userId: userA,
      name: 'other-user.png',
    });
    const softDeletedPivotImageId = await seedDraftFile({
      draftId: draftB,
      userId: userB,
      name: 'soft-deleted-pivot.png',
      pivotDeleted: true,
    });
    const softDeletedFileId = await seedDraftFile({
      draftId: draftB,
      userId: userB,
      name: 'soft-deleted-file.png',
      fileDeleted: true,
    });

    for (const fileId of [
      nonImageId,
      processingImageId,
      otherDraftImageId,
      otherUserImageId,
      softDeletedPivotImageId,
      softDeletedFileId,
    ]) {
      const res = await request(app)
        .post(`/storyboards/${draftB}/illustrations/principal-image/replace`)
        .set('Authorization', authB())
        .send({ fileId });
      expect(res.status, `${fileId}: ${JSON.stringify(res.body)}`).toBe(422);
    }
  });

  it('updates, replaces, and edits principal image references through modal APIs (T6 removes routes)', async () => {
    // T5: response no longer carries a `reference` field — just verify endpoints return success.
    const extraFileId = await seedReadyDraftImage(draftB, userB, 'extra-reference.png');
    const replacementFileId = await seedReadyDraftImage(draftB, userB, 'replacement-principal.png');

    await conn.execute(
      `UPDATE storyboard_scene_illustration_jobs
          SET active_lock = NULL
        WHERE draft_id = ?`,
      [draftB],
    );

    const refs = await request(app)
      .put(`/storyboards/${draftB}/illustrations/principal-image/references`)
      .set('Authorization', authB())
      .send({ fileIds: [extraFileId] });
    expect(refs.status, JSON.stringify(refs.body)).toBe(200);
    expect(refs.body).not.toHaveProperty('reference');

    const replace = await request(app)
      .post(`/storyboards/${draftB}/illustrations/principal-image/replace`)
      .set('Authorization', authB())
      .send({ fileId: replacementFileId });
    expect(replace.status, JSON.stringify(replace.body)).toBe(200);
    expect(replace.body).not.toHaveProperty('reference');

    const edit = await request(app)
      .post(`/storyboards/${draftB}/illustrations/principal-image/edit`)
      .set('Authorization', authB())
      .send({
        prompt: 'Make the principal image brighter.',
        extraReferenceFileIds: [extraFileId],
      });
    expect(edit.status, JSON.stringify(edit.body)).toBe(202);
    expect(edit.body).not.toHaveProperty('reference');
    // Grab the job ID for cleanup from the AI job that was created.
    const [editJobs] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT job_id FROM ai_generation_jobs WHERE draft_id = ? ORDER BY created_at DESC LIMIT 1`,
      [draftB],
    );
    if (editJobs[0]) cleanupJobs.push(editJobs[0]['job_id'] as string);
  });
});
