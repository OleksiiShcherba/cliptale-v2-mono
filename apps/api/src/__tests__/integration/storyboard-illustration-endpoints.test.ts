import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
// T11 gate migrations (053–055 + 046–047)
const MIGRATION_046_PATH = resolve(
  __dirname,
  '../../db/migrations/046_create_generation_flows.sql',
);
const MIGRATION_047_PATH = resolve(
  __dirname,
  '../../db/migrations/047_create_flow_files.sql',
);
const MIGRATION_053_PATH = resolve(
  __dirname,
  '../../db/migrations/053_create_storyboard_reference_blocks.sql',
);
const MIGRATION_054_PATH = resolve(
  __dirname,
  '../../db/migrations/054_create_storyboard_reference_scene_links.sql',
);
const MIGRATION_055_PATH = resolve(
  __dirname,
  '../../db/migrations/055_create_storyboard_reference_stars.sql',
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

// Shared spy array: every Queue.add call from any queue instance is appended here.
// Used by the no-provider-call assertion (spec §6 gate-evaluation cost).
const allQueueAddCalls: Array<{ queueName: string; jobName: string }> = [];

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation((queueName: string) => ({
      add: vi.fn().mockImplementation((jobName: string) => {
        allQueueAddCalls.push({ queueName, jobName });
        return Promise.resolve({ id: randomUUID() });
      }),
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

// ── T11 gate seed helpers ────────────────────────────────────────────────────
// These follow data-model.md §Test fixtures: reference blocks with/without
// completed flow_files outputs, scene links, legacy principal rows.

/**
 * Seed a generation_flows row owned by userId (FK requirement for storyboard_reference_blocks.flow_id).
 * Returns flow_id.
 */
async function seedFlow(userId: string): Promise<string> {
  const flowId = randomUUID();
  await conn.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, 'test-reference-flow', JSON_OBJECT())`,
    [flowId, userId],
  );
  return flowId;
}

/**
 * Seed a flow_files row (= one completed output for the flow).
 * Returns file_id inserted.
 * If deleted=true, sets deleted_at so the output is NOT usable (block remains not-ready).
 */
async function seedFlowFile(flowId: string, userId: string, opts?: { deleted?: boolean }): Promise<string> {
  const fileId = randomUUID();
  cleanupFiles.push(fileId);
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'ref-output.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  await conn.execute(
    `INSERT INTO flow_files (flow_id, file_id, deleted_at) VALUES (?, ?, ?)`,
    [flowId, fileId, opts?.deleted ? new Date() : null],
  );
  return fileId;
}

/**
 * Seed a storyboard_reference_blocks row.
 * If flowId is provided, the block has a flow (may or may not have outputs).
 * Returns blockId.
 */
async function seedRefBlock(params: {
  draftId: string;
  castType?: 'character' | 'environment';
  name: string;
  flowId?: string | null;
  windowStatus?: 'pending' | 'running' | 'done' | 'failed' | null;
  sortOrder?: number;
}): Promise<string> {
  const blockId = randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, sort_order, window_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      blockId,
      params.draftId,
      params.flowId ?? null,
      params.castType ?? 'character',
      params.name,
      params.sortOrder ?? 1,
      params.windowStatus ?? null,
    ],
  );
  return blockId;
}

/**
 * Seed a storyboard_reference_scene_links row linking a reference block to a scene block.
 */
async function seedSceneLink(referenceBlockId: string, sceneBlockId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [referenceBlockId, sceneBlockId],
  );
}

/**
 * Seed a storyboard_illustration_references legacy principal-image row (AC-08 ignore-on-read).
 * Returns the legacy row id.
 */
async function seedLegacyPrincipal(draftId: string, userId: string): Promise<string> {
  const legacyId = randomUUID();
  const legacyJobId = randomUUID();
  const legacyFileId = randomUUID();
  cleanupFiles.push(legacyFileId);
  // Minimal file row to satisfy FK
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'legacy-principal.png', 'ready')`,
    [legacyFileId, userId, `s3://test-bucket/${legacyFileId}.png`],
  );
  await conn.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
     VALUES (?, ?, 'gpt-image-2', 'text_to_image', 'legacy-principal', JSON_OBJECT(), 'completed', 100, ?, ?)`,
    [legacyJobId, userId, legacyFileId, draftId],
  );
  cleanupJobs.push(legacyJobId);
  await conn.execute(
    `INSERT INTO storyboard_illustration_references
       (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids, active_lock,
        approval_status, approved_at)
     VALUES (?, ?, ?, 'ready', ?, JSON_ARRAY(), 1, 'approved', NOW(3))`,
    [legacyId, draftId, legacyJobId, legacyFileId],
  );
  return legacyId;
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
  await conn.query(readFileSync(MIGRATION_046_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_047_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_053_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_054_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_055_PATH, 'utf-8'));

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

  // T6 (AC-08): all four principal-image routes are removed; Express must answer 404.
  it('POST principal-image/approve returns 404 (route removed by T6)', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftA}/illustrations/principal-image/approve`)
      .set('Authorization', authA())
      .send({});
    expect(res.status, JSON.stringify(res.body)).toBe(404);
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

  // T6 (AC-08): principal-image/replace is removed — any call (even bad input) returns 404.
  it('POST principal-image/replace returns 404 (route removed by T6)', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftB}/illustrations/principal-image/replace`)
      .set('Authorization', authB())
      .send({ fileId: 'not-a-uuid' });
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  // T6 (AC-08): principal-image/references (PUT) is removed — any call returns 404.
  it('PUT principal-image/references returns 404 (route removed by T6)', async () => {
    const res = await request(app)
      .put(`/storyboards/${draftB}/illustrations/principal-image/references`)
      .set('Authorization', authB())
      .send({ fileIds: [] });
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  // T6 (AC-08): principal-image/edit is removed — any call returns 404.
  it('POST principal-image/edit returns 404 (route removed by T6)', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftB}/illustrations/principal-image/edit`)
      .set('Authorization', authB())
      .send({ prompt: 'Make it brighter.' });
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  // ── T11 — Reference-done gate integration tests (AC-01/02/03/03b/04/04b/07/08/09 + no-provider-call) ──

  describe('T11 — Reference-done gate (scene-generation-reference-gate)', () => {
    // Per-test draft IDs and their scene IDs, created fresh in beforeEach so each test
    // is fully isolated.  The reference blocks, flow outputs, and scene links are seeded
    // per-test; everything is cleaned up in afterEach.
    let gDraftId: string;
    let gScene1: string;
    let gScene2: string;
    // Cleanup lists scoped to this describe — cleared after each test.
    const gRefBlocks: string[] = [];
    const gFlowIds: string[] = [];
    const gJobIds: string[] = [];

    beforeEach(async () => {
      // New draft owned by userA per test
      gDraftId = randomUUID();
      gScene1 = randomUUID();
      gScene2 = randomUUID();
      gRefBlocks.length = 0;
      gFlowIds.length = 0;
      gJobIds.length = 0;
      // Reset the shared queue-add call tracker so gate-rejection assertions are clean.
      allQueueAddCalls.length = 0;

      const promptDoc = {
        schemaVersion: 1,
        blocks: [{ type: 'text', value: 'Gate integration test.' }],
        settings: { videoLengthSeconds: 30, aspectRatio: '16:9', styleKey: 'cinematic', modelPreference: null },
      };
      await conn.execute(
        'INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)',
        [gDraftId, userA, JSON.stringify(promptDoc), 'step2'],
      );
      await seedScene({ id: gScene1, draftId: gDraftId, name: 'Gate Scene 01', prompt: 'Gate scene one.', sortOrder: 1 });
      await seedScene({ id: gScene2, draftId: gDraftId, name: 'Gate Scene 02', prompt: 'Gate scene two.', sortOrder: 2 });
    });

    afterEach(async () => {
      // Clean up scene illustration jobs
      await conn.execute(
        'DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id = ?',
        [gDraftId],
      );
      // Clean up ai_generation_jobs created by the gate tests
      if (gJobIds.length) {
        await conn.query(
          `DELETE FROM ai_generation_jobs WHERE job_id IN (${gJobIds.map(() => '?').join(',')})`,
          gJobIds,
        );
      }
      // Clean up storyboard_reference_scene_links (cascade on block delete but explicit is cleaner)
      if (gRefBlocks.length) {
        await conn.query(
          `DELETE FROM storyboard_reference_blocks WHERE id IN (${gRefBlocks.map(() => '?').join(',')})`,
          gRefBlocks,
        );
      }
      // Clean up flow_files and generation_flows
      if (gFlowIds.length) {
        await conn.query(
          `DELETE FROM flow_files WHERE flow_id IN (${gFlowIds.map(() => '?').join(',')})`,
          gFlowIds,
        );
        await conn.query(
          `DELETE FROM generation_flows WHERE flow_id IN (${gFlowIds.map(() => '?').join(',')})`,
          gFlowIds,
        );
      }
      // Clean up legacy principal rows
      await conn.execute(
        'DELETE FROM storyboard_illustration_references WHERE draft_id = ?',
        [gDraftId],
      );
      await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [gDraftId]);
      await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [gDraftId]);
    });

    // Helper to count storyboard_scene_illustration_jobs created during a test
    async function countSceneJobs(draftId: string): Promise<number> {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS cnt FROM storyboard_scene_illustration_jobs WHERE draft_id = ?',
        [draftId],
      );
      return Number(rows[0]!['cnt']);
    }

    // Helper: seed a ready reference block (has flow + ≥1 non-deleted flow_files row).
    async function seedReadyRefBlock(name: string, draftId: string, sortOrder = 1): Promise<string> {
      const flowId = await seedFlow(userA);
      gFlowIds.push(flowId);
      await seedFlowFile(flowId, userA);
      const blockId = await seedRefBlock({ draftId, name, flowId, windowStatus: 'done', sortOrder });
      gRefBlocks.push(blockId);
      return blockId;
    }

    // Helper: seed a not-ready reference block (flow exists but zero non-deleted flow_files).
    async function seedRunningRefBlock(name: string, draftId: string, sortOrder = 1): Promise<string> {
      const flowId = await seedFlow(userA);
      gFlowIds.push(flowId);
      // No flow_files rows seeded — block has flow_id but no completed output.
      const blockId = await seedRefBlock({ draftId, name, flowId, windowStatus: 'running', sortOrder });
      gRefBlocks.push(blockId);
      return blockId;
    }

    // Helper: seed a not-ready reference block with no flow at all (flow_id NULL).
    async function seedNoFlowRefBlock(name: string, draftId: string, sortOrder = 1): Promise<string> {
      const blockId = await seedRefBlock({ draftId, name, flowId: null, windowStatus: null, sortOrder });
      gRefBlocks.push(blockId);
      return blockId;
    }

    // ── AC-01 — happy path: all blocks ready + all scenes linked → 202 + jobs created ────────

    it('AC-01: all blocks ready + all scenes linked → 202 with scene jobs created', async () => {
      const ref1 = await seedReadyRefBlock('Character Alpha', gDraftId, 1);
      const ref2 = await seedReadyRefBlock('Environment Beta', gDraftId, 2);
      await seedSceneLink(ref1, gScene1);
      await seedSceneLink(ref2, gScene1);
      await seedSceneLink(ref1, gScene2);
      await seedSceneLink(ref2, gScene2);

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(202);
      expect(res.body).not.toHaveProperty('reference');
      expect(res.body.items).toBeDefined();
      // At least one scene job must have been created (the first scene in order).
      const jobCount = await countSceneJobs(gDraftId);
      expect(jobCount).toBeGreaterThanOrEqual(1);
    });

    // ── AC-02 — blocked: one running block (flow exists, zero outputs) → 422 reference_gate_failed ──

    it('AC-02: one running block (flow, no outputs) → 422 references.reference_gate_failed naming the block', async () => {
      const blockerName = 'Blocking Character AC02';
      const _blockerId = await seedRunningRefBlock(blockerName, gDraftId);

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.code).toBe('references.reference_gate_failed');
      expect(res.body.details.blocks).toBeDefined();
      const blockNames = (res.body.details.blocks as Array<{ name: string; blockId: string }>).map((b) => b.name);
      expect(blockNames).toContain(blockerName);
      // No scene jobs must have been created — gate must refuse before any enqueue.
      expect(await countSceneJobs(gDraftId)).toBe(0);
      // No paid generation call (spec §6 gate-evaluation cost).
      const imageQueueCalls = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      expect(imageQueueCalls).toHaveLength(0);
    });

    // ── AC-07 — first generation still in progress (running, zero flow_files) → blocked ────────

    it('AC-07: reference block first generation still in progress (running, zero flow_files) → 422 blocking', async () => {
      const runningBlockName = 'Running Character AC07';
      // window_status=running, flow set, NO flow_files rows — exactly the "first gen in progress" case.
      const _blockerId = await seedRunningRefBlock(runningBlockName, gDraftId);

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.code).toBe('references.reference_gate_failed');
      const blockNames = (res.body.details.blocks as Array<{ name: string }>).map((b) => b.name);
      expect(blockNames).toContain(runningBlockName);
      // Gate must refuse before enqueue — no paid jobs.
      const imageQueueCalls = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      expect(imageQueueCalls).toHaveLength(0);
    });

    // ── AC-03 — per-scene happy path: linked blocks ready, unlinked block not-ready → 202 ───────

    it('AC-03: per-scene start — linked blocks ready, unlinked not-ready elsewhere → 202', async () => {
      const readyRef = await seedReadyRefBlock('Ready Char AC03', gDraftId, 1);
      const unlinkedBlocker = await seedRunningRefBlock('Unlinked Blocker AC03', gDraftId, 2);
      // Link ready ref to gScene1 only; unlinked blocker is NOT linked to any scene.
      await seedSceneLink(readyRef, gScene1);
      void unlinkedBlocker; // deliberately unlinked — should not block gScene1

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/blocks/${gScene1}/illustration`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(202);
      expect(res.body).not.toHaveProperty('reference');
    });

    // ── AC-03b — per-scene blocked: linked block not-ready → 422 naming only scene's blockers ──

    it('AC-03b: per-scene start — linked block not-ready → 422 naming only that scene\'s blockers', async () => {
      const linkedBlockerName = 'Linked Blocker AC03b';
      const linkedBlocker = await seedRunningRefBlock(linkedBlockerName, gDraftId, 1);
      const unrelatedBlockerName = 'Unrelated Blocker AC03b';
      const unrelatedBlocker = await seedRunningRefBlock(unrelatedBlockerName, gDraftId, 2);
      // Link only the linkedBlocker to gScene1; unrelatedBlocker is linked to gScene2 only.
      await seedSceneLink(linkedBlocker, gScene1);
      await seedSceneLink(unrelatedBlocker, gScene2);

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/blocks/${gScene1}/illustration`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.code).toBe('references.reference_gate_failed');
      const blockIds = (res.body.details.blocks as Array<{ blockId: string; name: string }>).map((b) => b.blockId);
      // Must name the scene's linked blocker
      expect(blockIds).toContain(linkedBlocker);
      // Must NOT name the unrelated blocker (it's only linked to gScene2)
      expect(blockIds).not.toContain(unrelatedBlocker);
      // No jobs created
      expect(await countSceneJobs(gDraftId)).toBe(0);
    });

    // ── AC-04 — zero reference blocks → full-draft start 2xx ─────────────────────────────────

    it('AC-04: draft with zero reference blocks → full-draft start 202 (prompt+style path)', async () => {
      // No reference blocks seeded for gDraftId
      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(202);
      expect(res.body).not.toHaveProperty('reference');
      const jobCount = await countSceneJobs(gDraftId);
      expect(jobCount).toBeGreaterThanOrEqual(1);
    });

    // ── AC-04b — ≥1 ready block but ≥1 scene unlinked → 422 unlinked_scenes naming the scene ─

    it('AC-04b: all blocks ready but one scene unlinked → 422 references.unlinked_scenes naming the scene', async () => {
      const readyRef = await seedReadyRefBlock('Ready Ref AC04b', gDraftId, 1);
      // Link gScene1 but NOT gScene2
      await seedSceneLink(readyRef, gScene1);
      // gScene2 is deliberately unlinked

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.code).toBe('references.unlinked_scenes');
      expect(res.body.details.scenes).toBeDefined();
      const unlinkedIds = (res.body.details.scenes as Array<{ blockId: string }>).map((s) => s.blockId);
      expect(unlinkedIds).toContain(gScene2);
      expect(unlinkedIds).not.toContain(gScene1);
      // No jobs created — gate must refuse before any enqueue.
      expect(await countSceneJobs(gDraftId)).toBe(0);
      // No paid generation call.
      const imageQueueCalls = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      expect(imageQueueCalls).toHaveLength(0);
    });

    // ── AC-08 — legacy principal-image row present → start/status behave as if row absent ─────

    it('AC-08: legacy principal-image row present → start still 202 (ignore-on-read), status has no reference field', async () => {
      // Seed all blocks as ready + all scenes linked so the gate passes
      const readyRef = await seedReadyRefBlock('Ready Ref AC08', gDraftId, 1);
      await seedSceneLink(readyRef, gScene1);
      await seedSceneLink(readyRef, gScene2);

      // Also seed a legacy principal-image row — must be ignored
      await seedLegacyPrincipal(gDraftId, userA);

      const startRes = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(startRes.status, JSON.stringify(startRes.body)).toBe(202);
      // The start response must NOT expose any principal-image / reference field
      expect(startRes.body).not.toHaveProperty('reference');

      // Status read must also be clean
      const statusRes = await request(app)
        .get(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA());

      expect(statusRes.status).toBe(200);
      expect(statusRes.body).not.toHaveProperty('reference');
      // No provider-call gate (spec §6 — status read is a pure persisted query, zero paid calls).
      // The allQueueAddCalls check covers queue.add after the status read.
      // The status read itself must not trigger any enqueue.
      const queueCallsAfterStatus = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      // Only the start's single scene job is allowed; subsequent status reads must add nothing.
      // (The start enqueues ≤2 jobs; we just assert the status read alone adds zero.)
      // Reset tracker, then call status again:
      allQueueAddCalls.length = 0;
      const statusRes2 = await request(app)
        .get(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA());
      expect(statusRes2.status).toBe(200);
      expect(allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image')).toHaveLength(0);
      void queueCallsAfterStatus;
    });

    // ── AC-09 — non-owner → 403/404 with no reference/scene state disclosed ──────────────────

    it('AC-09: non-owner start → denied with no reference/scene state in response body', async () => {
      // Seed a ready block so there is gate state on the draft
      const readyRef = await seedReadyRefBlock('Secret Ref AC09', gDraftId, 1);
      await seedSceneLink(readyRef, gScene1);
      await seedSceneLink(readyRef, gScene2);

      // userB attempts to start generation on userA's draft
      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authB())
        .send({});

      // The existing convention in this repo is 403 for a known-other-owner draft.
      expect([403, 404]).toContain(res.status);
      // The body must NOT expose reference blocks, scene links, or any gate state.
      expect(res.body).not.toHaveProperty('details');
      expect(res.body).not.toHaveProperty('blocks');
      expect(res.body).not.toHaveProperty('scenes');
      expect(res.body).not.toHaveProperty('reference');
      // No scene jobs must have been created for the non-owner attempt.
      expect(await countSceneJobs(gDraftId)).toBe(0);
    });

    // ── No-provider-call: gate rejection path makes zero paid generation calls ───────────────

    it('no-provider-call: gate rejection (blocking block) enqueues zero storyboard-openai-image jobs', async () => {
      const blockerName = 'Blocker No-Provider';
      await seedRunningRefBlock(blockerName, gDraftId, 1);

      allQueueAddCalls.length = 0; // ensure clean slate

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status).toBe(422);
      // No queue.add calls for the paid scene-generation queue
      const imageQueueCalls = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      expect(imageQueueCalls).toHaveLength(0);
      // Also assert at DB level — no scene jobs rows
      expect(await countSceneJobs(gDraftId)).toBe(0);
    });

    it('no-provider-call: status read (GET illustrations) never enqueues paid generation jobs', async () => {
      const readyRef = await seedReadyRefBlock('Ready Ref Status Read', gDraftId, 1);
      await seedSceneLink(readyRef, gScene1);
      await seedSceneLink(readyRef, gScene2);

      allQueueAddCalls.length = 0;

      const res = await request(app)
        .get(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA());

      expect(res.status).toBe(200);
      const imageQueueCalls = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      expect(imageQueueCalls).toHaveLength(0);
    });

    it('no-provider-call: unlinked-scenes rejection (AC-04b) enqueues zero paid generation jobs', async () => {
      const readyRef = await seedReadyRefBlock('Ready Ref Unlinked', gDraftId, 1);
      await seedSceneLink(readyRef, gScene1);
      // gScene2 deliberately unlinked

      allQueueAddCalls.length = 0;

      const res = await request(app)
        .post(`/storyboards/${gDraftId}/illustrations`)
        .set('Authorization', authA())
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('references.unlinked_scenes');
      const imageQueueCalls = allQueueAddCalls.filter((c) => c.queueName === 'storyboard-openai-image');
      expect(imageQueueCalls).toHaveLength(0);
    });
  });
});
