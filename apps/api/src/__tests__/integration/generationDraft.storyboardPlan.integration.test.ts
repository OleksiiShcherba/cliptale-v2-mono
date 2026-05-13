import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

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
  APP_JWT_SECRET: 'storyboard-plan-int-test-secret-32chars!',
  APP_DEV_AUTH_BYPASS: 'false',
});

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: randomUUID() }),
      getJob: vi.fn().mockRejectedValue(new Error('GET must read persisted storyboard_plan_jobs')),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PROMPT_DOC = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Create a clean launch video storyboard.' }],
  settings: {
    videoLengthSeconds: 30,
    aspectRatio: '16:9',
    styleKey: 'cinematic',
    modelPreference: 'gpt-storyboard-test',
  },
};

const EMPTY_PROMPT_DOC = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: '   ' }],
};

const VALID_PLAN = {
  schemaVersion: 1,
  videoLengthSeconds: 30,
  sceneCount: 5,
  scenes: Array.from({ length: 5 }, (_, index) => ({
    sceneNumber: index + 1,
    prompt: `Scene ${index + 1} prompt`,
    visualPrompt: `Scene ${index + 1} visual prompt`,
    durationSeconds: 6,
    referencedMedia: [],
    transitionNotes: '',
    style: 'cinematic',
  })),
};

let app: Express;
let conn: Connection;
let userA: string;
let userB: string;
let tokenA: string;
let tokenB: string;
let sessionA: string;
let sessionB: string;
let draftA: string;
let draftEmpty: string;
let draftDeleted: string;

const cleanupDrafts: string[] = [];
const cleanupJobs: string[] = [];

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  userA = `sp-a-${randomUUID().slice(0, 8)}`;
  userB = `sp-b-${randomUUID().slice(0, 8)}`;
  tokenA = `tok-sp-a-${randomUUID()}`;
  tokenB = `tok-sp-b-${randomUUID()}`;
  sessionA = randomUUID();
  sessionB = randomUUID();
  draftA = randomUUID();
  draftEmpty = randomUUID();
  draftDeleted = randomUUID();
  cleanupDrafts.push(draftA, draftEmpty, draftDeleted);

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

  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftA, userA, JSON.stringify(PROMPT_DOC)],
  );
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftEmpty, userA, JSON.stringify(EMPTY_PROMPT_DOC)],
  );
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc, deleted_at) VALUES (?, ?, ?, NOW(3))',
    [draftDeleted, userA, JSON.stringify(PROMPT_DOC)],
  );
});

afterAll(async () => {
  if (cleanupJobs.length) {
    const ph = cleanupJobs.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_plan_jobs WHERE job_id IN (${ph})`, cleanupJobs);
  }
  if (cleanupDrafts.length) {
    const ph = cleanupDrafts.map(() => '?').join(',');
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, cleanupDrafts);
  }
  await conn.query('DELETE FROM sessions WHERE session_id IN (?, ?)', [sessionA, sessionB]);
  await conn.query('DELETE FROM users WHERE user_id IN (?, ?)', [userA, userB]);
  await conn.end();
});

async function insertPlanJob(status: 'queued' | 'running' | 'completed' | 'failed'): Promise<string> {
  const jobId = randomUUID();
  cleanupJobs.push(jobId);
  await conn.execute(
    `INSERT INTO storyboard_plan_jobs
       (job_id, draft_id, user_id, status, model, prompt_snapshot_json, plan_json, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobId,
      draftA,
      userA,
      status,
      'gpt-storyboard-test',
      JSON.stringify(PROMPT_DOC),
      status === 'completed' ? JSON.stringify(VALID_PLAN) : null,
      status === 'failed' ? 'model failed' : null,
    ],
  );
  return jobId;
}

describe('POST /generation-drafts/:id/storyboard-plan', () => {
  it('returns 202 and creates distinct persisted jobs on repeat POST', async () => {
    const first = await request(app)
      .post(`/generation-drafts/${draftA}/storyboard-plan`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    const second = await request(app)
      .post(`/generation-drafts/${draftA}/storyboard-plan`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.status).toBe('queued');
    expect(second.body.status).toBe('queued');
    expect(first.body.jobId).not.toBe(second.body.jobId);
    cleanupJobs.push(first.body.jobId, second.body.jobId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT job_id, status, model FROM storyboard_plan_jobs WHERE job_id IN (?, ?)',
      [first.body.jobId, second.body.jobId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row['status'])).toEqual(['queued', 'queued']);
    expect(rows.every((row) => row['model'] === 'gpt-storyboard-test')).toBe(true);
  });

  it('preserves auth and draft lookup semantics', async () => {
    const wrongOwner = await request(app)
      .post(`/generation-drafts/${draftA}/storyboard-plan`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({});
    expect(wrongOwner.status).toBe(403);

    const missing = await request(app)
      .post(`/generation-drafts/${randomUUID()}/storyboard-plan`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(missing.status).toBe(404);

    const deleted = await request(app)
      .post(`/generation-drafts/${draftDeleted}/storyboard-plan`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(deleted.status).toBe(404);
  });

  it('returns a validation error for an empty prompt with no media', async () => {
    const res = await request(app)
      .post(`/generation-drafts/${draftEmpty}/storyboard-plan`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('non-empty prompt');
  });
});

describe('GET /generation-drafts/:id/storyboard-plan/:jobId', () => {
  it('returns persisted queued, running, completed, and failed states', async () => {
    for (const status of ['queued', 'running', 'completed', 'failed'] as const) {
      const jobId = await insertPlanJob(status);
      const res = await request(app)
        .get(`/generation-drafts/${draftA}/storyboard-plan/${jobId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.jobId).toBe(jobId);
      expect(res.body.status).toBe(status);
      if (status === 'completed') {
        expect(res.body.plan).toEqual(VALID_PLAN);
      }
      if (status === 'failed') {
        expect(res.body.errorMessage).toBe('model failed');
      }
    }
  });

  it('is draft-scoped and owner-scoped', async () => {
    const jobId = await insertPlanJob('queued');
    const otherDraft = randomUUID();
    cleanupDrafts.push(otherDraft);
    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [otherDraft, userA, JSON.stringify(PROMPT_DOC)],
    );

    const wrongDraft = await request(app)
      .get(`/generation-drafts/${otherDraft}/storyboard-plan/${jobId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(wrongDraft.status).toBe(404);

    const wrongOwner = await request(app)
      .get(`/generation-drafts/${draftA}/storyboard-plan/${jobId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(wrongOwner.status).toBe(403);
  });
});
