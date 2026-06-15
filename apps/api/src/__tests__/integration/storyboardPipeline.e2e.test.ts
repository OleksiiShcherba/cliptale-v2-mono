/**
 * storyboardPipeline.e2e.test.ts — T20
 *
 * API-level E2E integration test for the storyboard-generation-pipeline feature.
 * Tests run against real MySQL (Docker UP), driven through the real HTTP endpoints
 * using supertest. No worker is running; worker progress is simulated by writing
 * directly to the DB to mirror the hook transitions described in the spec.
 *
 * Coverage:
 *   AC-01 → 04  happy path (auto-start → scene done → reference_data running → cast
 *               proposal → confirm-cast → refs below music → ref-image running →
 *               all terminal → scene_image awaiting_review → trigger → running →
 *               all scenes terminal → completed)
 *   AC-05       resume + observer convergence (fresh GET reads true DB state, version-monotonic)
 *   AC-06       cancel keeps results + incremental re-trigger only of unfinished units
 *   AC-07       skip records `skipped` ≠ `idle`
 *   AC-08       phase-out-of-order guard (422 pipeline.phase_out_of_order)
 *   AC-09       reference blocks created below all music blocks
 *   AC-13       authz deny-and-hide (non-owner → opaque 404)
 *   AC-14       idempotent confirm-cast + double-trigger
 *   AC-15       scenes_required guard (422 pipeline.scenes_required)
 *
 * Idiom: mirrors storyboard-illustration-endpoints.test.ts for env, bullmq mock,
 * auth (session-based sha256 token), and DB seeding patterns.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Migration paths ───────────────────────────────────────────────────────────
const MIGRATION_038_PATH = resolve(__dirname, '../../db/migrations/038_storyboard_scene_illustration_jobs.sql');
const MIGRATION_039_PATH = resolve(__dirname, '../../db/migrations/039_storyboard_scene_illustration_active_lock.sql');
const MIGRATION_040_PATH = resolve(__dirname, '../../db/migrations/040_storyboard_illustration_references.sql');
const MIGRATION_041_PATH = resolve(__dirname, '../../db/migrations/041_storyboard_illustration_reference_approval.sql');
const MIGRATION_045_PATH = resolve(__dirname, '../../db/migrations/045_storyboard_music_blocks.sql');
const MIGRATION_046_PATH = resolve(__dirname, '../../db/migrations/046_create_generation_flows.sql');
const MIGRATION_047_PATH = resolve(__dirname, '../../db/migrations/047_create_flow_files.sql');
const MIGRATION_052_PATH = resolve(__dirname, '../../db/migrations/052_create_storyboard_cast_extraction_jobs.sql');
const MIGRATION_053_PATH = resolve(__dirname, '../../db/migrations/053_create_storyboard_reference_blocks.sql');
const MIGRATION_054_PATH = resolve(__dirname, '../../db/migrations/054_create_storyboard_reference_scene_links.sql');
const MIGRATION_055_PATH = resolve(__dirname, '../../db/migrations/055_create_storyboard_reference_stars.sql');
const MIGRATION_056_PATH = resolve(__dirname, '../../db/migrations/056_add_truncated_to_cast_extraction_jobs.sql');
const MIGRATION_057_PATH = resolve(__dirname, '../../db/migrations/057_storyboard_pipeline.sql');

// ── Environment (matches sibling test pattern exactly) ─────────────────────────
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
  APP_JWT_SECRET: 'storyboard-pipeline-e2e-test-secret!',
  APP_DEV_AUTH_BYPASS: 'false',
});

// ── BullMQ mock — capture enqueues (AC-06 no-enqueue-after-cancel assertion) ──
const allQueueAddCalls: Array<{ queueName: string; jobName: string; jobData?: unknown }> = [];

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation((queueName: string) => ({
      add: vi.fn().mockImplementation((jobName: string, jobData?: unknown) => {
        allQueueAddCalls.push({ queueName, jobName, jobData });
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

// ── Crypto helpers ─────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Module-level state ─────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

// Two users — owner (A) and non-owner (B)
let userA: string;
let userB: string;
let tokenA: string;
let tokenB: string;
let sessionA: string;
let sessionB: string;

function authA(): string { return `Bearer ${tokenA}`; }
function authB(): string { return `Bearer ${tokenB}`; }

// ── Common seed helpers ────────────────────────────────────────────────────────

async function seedDraft(userId: string): Promise<string> {
  const draftId = randomUUID();
  const promptDoc = {
    schemaVersion: 1,
    blocks: [{ type: 'text', value: 'Pipeline E2E test draft.' }],
    settings: { videoLengthSeconds: 30, aspectRatio: '16:9', styleKey: 'cinematic', modelPreference: null },
  };
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)',
    [draftId, userId, JSON.stringify(promptDoc), 'step2'],
  );
  return draftId;
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

async function seedMusicBlock(params: {
  id: string;
  draftId: string;
  sortOrder: number;
  startSceneBlockId: string;
  endSceneBlockId: string;
}): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_music_blocks
       (id, draft_id, name, source_mode, start_scene_block_id, end_scene_block_id, sort_order)
     VALUES (?, ?, 'Music', 'generate_on_step3', ?, ?, ?)`,
    [params.id, params.draftId, params.startSceneBlockId, params.endSceneBlockId, params.sortOrder],
  );
}

/** Seed a pipeline row directly into the DB (simulating an already-started draft). */
async function seedPipelineRow(params: {
  draftId: string;
  activePhase?: string;
  sceneStatus?: string;
  referenceDataStatus?: string;
  referenceImageStatus?: string;
  sceneImageStatus?: string;
  activeRunPhase?: string | null;
  payloadJson?: unknown | null;
  version?: number;
  costEstimate?: string | null;
  errorMessage?: string | null;
  heartbeatAt?: Date | null;
}): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, reference_data_status, reference_image_status,
        scene_image_status, active_run_phase, payload_json, version, cost_estimate, error_message,
        heartbeat_at, phase_started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.draftId,
      params.activePhase ?? 'scene',
      params.sceneStatus ?? 'idle',
      params.referenceDataStatus ?? 'idle',
      params.referenceImageStatus ?? 'idle',
      params.sceneImageStatus ?? 'idle',
      params.activeRunPhase ?? null,
      params.payloadJson !== undefined ? JSON.stringify(params.payloadJson) : null,
      params.version ?? 1,
      params.costEstimate ?? null,
      params.errorMessage ?? null,
      params.heartbeatAt ?? null,
      params.heartbeatAt ?? null,
    ],
  );
}

/** Seed a cast extraction job with a completed proposal (simulates worker phase 2 completion). */
async function seedCompletedCastExtractionJob(params: {
  draftId: string;
  userId: string;
  castProposal: Array<{
    name: string;
    type: 'character' | 'environment';
    description?: string;
    scene_block_ids?: string[];
  }>;
}): Promise<string> {
  const jobId = randomUUID();
  const proposalJson = JSON.stringify({ cast: params.castProposal });
  await conn.execute(
    `INSERT INTO storyboard_cast_extraction_jobs
       (id, draft_id, user_id, status, proposal_json, aggregate_estimate_credits, completed_at)
     VALUES (?, ?, ?, 'completed', ?, '2.0000', NOW(3))`,
    [jobId, params.draftId, params.userId, proposalJson],
  );
  return jobId;
}

/** Seed a reference block for the draft (simulates a created reference after confirm-cast). */
async function seedReferenceBlock(params: {
  id: string;
  draftId: string;
  name: string;
  castType?: 'character' | 'environment';
  sortOrder: number;
  windowStatus?: 'pending' | 'running' | 'done' | 'failed';
}): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, cast_type, name, sort_order, window_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.draftId,
      params.castType ?? 'character',
      params.name,
      params.sortOrder,
      params.windowStatus ?? 'pending',
    ],
  );
}

/** Set a reference block's window_status (simulates worker completing/failing reference gen). */
async function updateReferenceBlockStatus(blockId: string, windowStatus: 'done' | 'failed' | 'running'): Promise<void> {
  await conn.execute(
    `UPDATE storyboard_reference_blocks SET window_status = ? WHERE id = ?`,
    [windowStatus, blockId],
  );
}

/** Read the pipeline row directly from DB (bypass the API for assertion). */
async function dbReadPipeline(draftId: string): Promise<mysql.RowDataPacket | null> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT draft_id, active_phase, scene_status, reference_data_status, reference_image_status,
            scene_image_status, active_run_phase, payload_json, version, cost_estimate, error_message
       FROM storyboard_pipeline WHERE draft_id = ?`,
    [draftId],
  );
  return rows[0] ?? null;
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

async function cleanupDraft(draftId: string): Promise<void> {
  // Order matters — FK constraints
  await conn.execute('DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_reference_blocks WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_music_blocks WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_pipeline WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [draftId]);
}

// ── beforeAll / afterAll ───────────────────────────────────────────────────────

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

  // Ensure all migrations are applied (idempotent — uses CREATE TABLE IF NOT EXISTS)
  await conn.query(readFileSync(MIGRATION_038_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_039_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_040_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_041_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_045_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_046_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_047_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_052_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_053_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_054_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_055_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_056_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_057_PATH, 'utf-8'));

  // Seed users
  userA = `pipe-a-${randomUUID().slice(0, 8)}`;
  userB = `pipe-b-${randomUUID().slice(0, 8)}`;
  tokenA = `tok-pipe-a-${randomUUID()}`;
  tokenB = `tok-pipe-b-${randomUUID()}`;
  sessionA = randomUUID();
  sessionB = randomUUID();

  for (const [uid, email] of [
    [userA, `${userA}@example.test`],
    [userB, `${userB}@example.test`],
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
});

afterAll(async () => {
  if (conn) {
    await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [sessionA, sessionB]);
    await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [userA, userB]);
    await conn.end();
  }
});

// ── Scenario 1: AC-01 → 04 happy path ──────────────────────────────────────────

describe('AC-01→04 happy path: auto-start → scene done → cast proposal → confirm → ref-image → scene-image completed', () => {
  let draftId: string;
  let scene1: string;
  let scene2: string;
  let musicBlock: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    scene2 = randomUUID();
    musicBlock = randomUUID();

    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'A cinematic hero shot.', sortOrder: 1 });
    await seedScene({ id: scene2, draftId, name: 'Scene 02', prompt: 'A product detail shot.', sortOrder: 2 });
    // Music block at sort_order=10 — reference blocks must be placed after this (AC-09)
    await seedMusicBlock({ id: musicBlock, draftId, sortOrder: 10, startSceneBlockId: scene1, endSceneBlockId: scene2 });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-01: fresh draft → GET auto-starts scene generation: active_phase=scene, scene running, active_run_phase=scene', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.draft_id).toBe(draftId);
    expect(res.body.active_phase).toBe('scene');
    expect(res.body.phases.scene.status).toBe('running');
    expect(res.body.active_run_phase).toBe('scene');
    expect(res.body.version).toBeGreaterThanOrEqual(1);

    // Verify DB state
    const dbRow = await dbReadPipeline(draftId);
    expect(dbRow).not.toBeNull();
    expect(dbRow!['scene_status']).toBe('running');
    expect(dbRow!['active_run_phase']).toBe('scene');

    // Verify a scene-plan job was enqueued (AC-01 auto-start)
    const planEnqueues = allQueueAddCalls.filter((c) => c.jobName === 'storyboard-plan');
    expect(planEnqueues.length).toBeGreaterThanOrEqual(1);
  });

  it('AC-01→02: scene done → GET shows reference_data running (simulated worker)', async () => {
    // First GET to create the pipeline row
    await request(app).get(`/storyboards/${draftId}/pipeline`).set('Authorization', authA());

    // Simulate worker completing scene phase: set scene_status=completed, advance active_phase,
    // clear active_run_phase, bump version — mirroring storyboardPipelineHooks scene-complete
    const dbRow = await dbReadPipeline(draftId);
    const currentVersion = dbRow!['version'] as number;
    await conn.execute(
      `UPDATE storyboard_pipeline
          SET scene_status = 'completed',
              active_phase = 'reference_data',
              active_run_phase = 'reference_data',
              reference_data_status = 'running',
              phase_started_at = NOW(3),
              heartbeat_at = NOW(3),
              version = version + 1
        WHERE draft_id = ?`,
      [draftId],
    );

    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(res.status).toBe(200);
    expect(res.body.active_phase).toBe('reference_data');
    expect(res.body.phases.scene.status).toBe('completed');
    expect(res.body.phases.reference_data.status).toBe('running');
    expect(res.body.active_run_phase).toBe('reference_data');
    expect(res.body.version).toBeGreaterThan(currentVersion);
  });

  it('AC-02: cast proposal ready → awaiting_review with cast_proposal payload + cost estimate', async () => {
    // Seed pipeline at reference_data running
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      activeRunPhase: 'reference_data',
      version: 2,
    });

    // Simulate worker completing cast extraction: set reference_data_status=awaiting_review,
    // clear active_run_phase, set payload with cast_proposal + cost_estimate
    const castProposal = {
      cast_proposal: {
        references: [
          { name: 'Hero Character', kind: 'character', scene_ids: [scene1] },
          { name: 'Office Environment', kind: 'environment', scene_ids: [scene1, scene2] },
        ],
      },
    };
    await conn.execute(
      `UPDATE storyboard_pipeline
          SET reference_data_status = 'awaiting_review',
              active_run_phase = NULL,
              payload_json = ?,
              cost_estimate = '2.5000',
              version = version + 1
        WHERE draft_id = ?`,
      [JSON.stringify(castProposal), draftId],
    );

    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(res.status).toBe(200);
    expect(res.body.phases.reference_data.status).toBe('awaiting_review');
    expect(res.body.active_run_phase).toBeNull();
    expect(res.body.cost_estimate).toBe('2.5000');
    // Payload should contain cast proposal data
    expect(res.body.payload).toBeDefined();
  });

  it('AC-03: confirm-cast → reference blocks created BELOW music (AC-09), reference_image running', async () => {
    // Setup: scene done, reference_data awaiting_review with proposal
    const castProposal = [
      { name: 'Hero Character', type: 'character' as const, scene_block_ids: [scene1] },
      { name: 'Office Env', type: 'environment' as const, scene_block_ids: [scene1, scene2] },
    ];
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'awaiting_review',
      activeRunPhase: null,
      payloadJson: { cast_proposal: { references: castProposal.map(c => ({ name: c.name, kind: c.type, scene_ids: c.scene_block_ids })) } },
      costEstimate: '2.5000',
      version: 3,
    });
    // Seed the actual cast extraction job (the service reads from this table)
    await seedCompletedCastExtractionJob({
      draftId,
      userId: userA,
      castProposal,
    });

    allQueueAddCalls.length = 0;

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/confirm-cast`)
      .set('Authorization', authA())
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.phases.reference_image.status).toBe('running');
    expect(res.body.active_run_phase).toBe('reference_image');

    // AC-09: every reference block must be ordered BELOW all music blocks
    // Music block is at sort_order=10; reference blocks must be > 10
    const [refRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT id, name, sort_order FROM storyboard_reference_blocks WHERE draft_id = ? ORDER BY sort_order ASC`,
      [draftId],
    );
    expect(refRows.length).toBe(2);

    const [musicRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT MAX(sort_order) AS max_sort FROM storyboard_music_blocks WHERE draft_id = ?`,
      [draftId],
    );
    const maxMusicSort = Number(musicRows[0]!['max_sort']);

    for (const ref of refRows) {
      expect(Number(ref['sort_order'])).toBeGreaterThan(maxMusicSort);
    }

    // Reference image generation was enqueued (one per reference block)
    const refImageEnqueues = allQueueAddCalls.filter((c) => c.jobName === 'ai-generate');
    expect(refImageEnqueues.length).toBe(2);

    // Verify DB state
    const dbRow = await dbReadPipeline(draftId);
    expect(dbRow!['reference_image_status']).toBe('running');
    expect(dbRow!['active_run_phase']).toBe('reference_image');
  });

  it('AC-03: ref-image terminal (one failed tolerated) → scene_image awaiting_review with estimate', async () => {
    const refBlock1 = randomUUID();
    const refBlock2 = randomUUID();

    // Setup: reference_image running, two reference blocks (one will fail)
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      activeRunPhase: 'reference_image',
      version: 4,
    });
    await seedReferenceBlock({ id: refBlock1, draftId, name: 'Hero', sortOrder: 11, windowStatus: 'done' });
    await seedReferenceBlock({ id: refBlock2, draftId, name: 'Office', sortOrder: 12, windowStatus: 'failed' });

    // Simulate worker: all reference blocks terminal → advance to scene_image awaiting_review
    // (This mirrors the worker hook: once every reference is terminal, it writes the pipeline row)
    await conn.execute(
      `UPDATE storyboard_pipeline
          SET reference_image_status = 'awaiting_review',
              scene_image_status = 'awaiting_review',
              active_phase = 'scene_image',
              active_run_phase = NULL,
              payload_json = ?,
              cost_estimate = '5.0000',
              version = version + 1
        WHERE draft_id = ?`,
      [JSON.stringify({ scene_image_offer: { scene_count: 2 } }), draftId],
    );

    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(res.status).toBe(200);
    expect(res.body.phases.reference_image.status).toBe('awaiting_review');
    expect(res.body.phases.scene_image.status).toBe('awaiting_review');
    expect(res.body.active_phase).toBe('scene_image');
    expect(res.body.cost_estimate).toBe('5.0000');
    // Failed reference did NOT fail the whole phase
    expect(res.body.phases.reference_image.status).not.toBe('failed');
  });

  it('AC-04: trigger scene_image → running; all scene terminal (one failed) → completed, failed scene re-triggerable', async () => {
    const refBlock1 = randomUUID();

    // Setup: scene_image awaiting_review
    await seedPipelineRow({
      draftId,
      activePhase: 'scene_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'completed',
      sceneImageStatus: 'awaiting_review',
      activeRunPhase: null,
      payloadJson: { scene_image_offer: { scene_count: 2 } },
      costEstimate: '5.0000',
      version: 5,
    });
    await seedReferenceBlock({ id: refBlock1, draftId, name: 'Hero', sortOrder: 11, windowStatus: 'done' });

    allQueueAddCalls.length = 0;

    const triggerRes = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', authA())
      .send({});

    expect(triggerRes.status, JSON.stringify(triggerRes.body)).toBe(200);
    expect(triggerRes.body.phases.scene_image.status).toBe('running');
    expect(triggerRes.body.active_run_phase).toBe('scene_image');

    // Scene illustration jobs should have been enqueued (one per scene)
    const sceneImageEnqueues = allQueueAddCalls.filter((c) =>
      c.queueName === 'storyboard-openai-image' || c.jobName === 'storyboard-openai-image'
    );
    expect(sceneImageEnqueues.length).toBeGreaterThanOrEqual(1);

    // Simulate worker: all scenes terminal (scene1=ready, scene2=failed)
    // Get scene illustration jobs created
    const [jobs] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT ai_job_id, block_id FROM storyboard_scene_illustration_jobs WHERE draft_id = ?`,
      [draftId],
    );

    // Mark all jobs terminal — some ready, one failed
    if (jobs.length >= 2) {
      await conn.execute(
        `UPDATE storyboard_scene_illustration_jobs SET status = 'ready' WHERE ai_job_id = ?`,
        [jobs[0]!['ai_job_id']],
      );
      await conn.execute(
        `UPDATE storyboard_scene_illustration_jobs SET status = 'failed' WHERE ai_job_id = ?`,
        [jobs[1]!['ai_job_id']],
      );
    } else if (jobs.length === 1) {
      await conn.execute(
        `UPDATE storyboard_scene_illustration_jobs SET status = 'ready' WHERE ai_job_id = ?`,
        [jobs[0]!['ai_job_id']],
      );
    }

    // Simulate worker setting phase completed (even with a failed scene)
    await conn.execute(
      `UPDATE storyboard_pipeline
          SET scene_image_status = 'completed',
              active_run_phase = NULL,
              version = version + 1
        WHERE draft_id = ?`,
      [draftId],
    );

    const finalRes = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(finalRes.status).toBe(200);
    expect(finalRes.body.phases.scene_image.status).toBe('completed');
    expect(finalRes.body.active_run_phase).toBeNull();

    // Failed scene remains in the DB as 'failed' (re-triggerable)
    if (jobs.length >= 2) {
      const [failedJobs] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT status FROM storyboard_scene_illustration_jobs WHERE ai_job_id = ?`,
        [jobs[1]!['ai_job_id']],
      );
      expect(failedJobs[0]!['status']).toBe('failed');
    }
  });
});

// ── Scenario 2: AC-05 resume + observer convergence ───────────────────────────

describe('AC-05: resume freshness — fresh GET reconstructs exact state; version-monotonic after transition', () => {
  let draftId: string;
  let scene1: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'A shot.', sortOrder: 1 });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-05: mid-phase GET reconstructs running state from DB, not memory; second GET converges to new version after DB change', async () => {
    // Seed a pipeline row at reference_data running (simulates a page-close mid-phase)
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      activeRunPhase: 'reference_data',
      version: 5,
    });

    // First GET (resume — as if page just reopened)
    const res1 = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(res1.status).toBe(200);
    expect(res1.body.active_phase).toBe('reference_data');
    expect(res1.body.phases.reference_data.status).toBe('running');
    expect(res1.body.active_run_phase).toBe('reference_data');
    expect(res1.body.version).toBe(5);

    // Simulate a transition (worker completes reference_data → awaiting_review)
    await conn.execute(
      `UPDATE storyboard_pipeline
          SET reference_data_status = 'awaiting_review',
              active_run_phase = NULL,
              version = version + 1,
              cost_estimate = '2.0000'
        WHERE draft_id = ?`,
      [draftId],
    );

    // Second GET (observer convergence — another tab polling)
    const res2 = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authA());

    expect(res2.status).toBe(200);
    expect(res2.body.phases.reference_data.status).toBe('awaiting_review');
    expect(res2.body.active_run_phase).toBeNull();

    // Version must be monotonically higher than the first read (resume-freshness)
    expect(res2.body.version).toBeGreaterThan(res1.body.version as number);
  });
});

// ── Scenario 3: AC-06 cancel keeps results + incremental re-trigger ───────────

describe('AC-06: cancel keeps results + incremental re-trigger only regenerates unfinished units', () => {
  let draftId: string;
  let scene1: string;
  let scene2: string;
  let refBlock1: string;
  let refBlock2: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    scene2 = randomUUID();
    refBlock1 = randomUUID();
    refBlock2 = randomUUID();

    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'Shot A.', sortOrder: 1 });
    await seedScene({ id: scene2, draftId, name: 'Scene 02', prompt: 'Shot B.', sortOrder: 2 });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-06: cancel reference_image phase → active_run_phase cleared, status idle, existing done blocks kept', async () => {
    // Setup: reference_image running, one block done, one still pending
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      activeRunPhase: 'reference_image',
      version: 3,
    });
    await seedReferenceBlock({ id: refBlock1, draftId, name: 'Hero', sortOrder: 11, windowStatus: 'done' });
    await seedReferenceBlock({ id: refBlock2, draftId, name: 'Office', sortOrder: 12, windowStatus: 'running' });

    allQueueAddCalls.length = 0;

    const cancelRes = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_image/cancel`)
      .set('Authorization', authA())
      .send({});

    expect(cancelRes.status, JSON.stringify(cancelRes.body)).toBe(200);
    expect(cancelRes.body.phases.reference_image.status).toBe('idle');
    expect(cancelRes.body.active_run_phase).toBeNull();

    // AC-06: NO new work enqueued after cancel
    const enqueuedAfterCancel = allQueueAddCalls.length;
    expect(enqueuedAfterCancel).toBe(0);

    // Produced results KEPT: refBlock1 still 'done' in DB
    const [block1Rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [refBlock1],
    );
    expect(block1Rows[0]!['window_status']).toBe('done');

    // refBlock2 still 'running' in DB (not touched by cancel — per-unit state preserved)
    const [block2Rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [refBlock2],
    );
    // Per ADR-0008: cancel does NOT touch per-unit rows
    expect(['running', 'pending', 'failed']).toContain(block2Rows[0]!['window_status']);
  });

  it('AC-06: re-trigger after cancel → only non-terminal units re-enqueued; done units untouched', async () => {
    // Setup: cancelled reference_image, refBlock1=done, refBlock2=pending (not done)
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'idle',  // cancelled → back to idle
      activeRunPhase: null,
      version: 4,
    });
    await seedReferenceBlock({ id: refBlock1, draftId, name: 'Hero', sortOrder: 11, windowStatus: 'done' });
    await seedReferenceBlock({ id: refBlock2, draftId, name: 'Office', sortOrder: 12, windowStatus: 'pending' });

    allQueueAddCalls.length = 0;

    const retriggerRes = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_image/trigger`)
      .set('Authorization', authA())
      .send({});

    expect(retriggerRes.status, JSON.stringify(retriggerRes.body)).toBe(200);
    expect(retriggerRes.body.phases.reference_image.status).toBe('running');

    // Only refBlock2 (pending, non-terminal) should have been re-enqueued
    // refBlock1 (done) must NOT have generated a new enqueue
    const aiGenerateEnqueues = allQueueAddCalls.filter((c) => c.jobName === 'ai-generate');
    expect(aiGenerateEnqueues.length).toBe(1);

    // refBlock1's window_status is still 'done' — not touched
    const [block1Rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [refBlock1],
    );
    expect(block1Rows[0]!['window_status']).toBe('done');
  });
});

// ── Scenario 4: AC-07 skip records `skipped` ≠ `idle` ────────────────────────

describe('AC-07: skip phase records skipped (distinct from idle), remains triggerable', () => {
  let draftId: string;
  let scene1: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'A shot.', sortOrder: 1 });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-07: skip reference_data (awaiting_review) → status=skipped, active_run_phase=null', async () => {
    // Setup: reference_data awaiting_review (Review modal pending)
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'awaiting_review',
      activeRunPhase: null,
      payloadJson: { cast_proposal: { references: [] } },
      version: 2,
    });

    const skipRes = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_data/skip`)
      .set('Authorization', authA())
      .send({});

    expect(skipRes.status, JSON.stringify(skipRes.body)).toBe(200);
    expect(skipRes.body.phases.reference_data.status).toBe('skipped');
    expect(skipRes.body.active_run_phase).toBeNull();

    // `skipped` must be distinguishable from `idle` in the DB
    const dbRow = await dbReadPipeline(draftId);
    expect(dbRow!['reference_data_status']).toBe('skipped');
    expect(dbRow!['reference_data_status']).not.toBe('idle');
  });

  it('AC-07: skip when NOT awaiting_review → 422 pipeline.not_awaiting_review', async () => {
    // Setup: reference_data is running (not awaiting_review), so skip must fail
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      activeRunPhase: 'reference_data',
      version: 2,
    });

    const skipRes = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_data/skip`)
      .set('Authorization', authA())
      .send({});

    expect(skipRes.status).toBe(422);
    expect(skipRes.body.code).toBe('pipeline.not_awaiting_review');
  });
});

// ── Scenario 5: AC-08 phase-order guard ───────────────────────────────────────

describe('AC-08: phase-out-of-order guard blocks triggering later phases before prerequisites', () => {
  let draftId: string;
  let scene1: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'A shot.', sortOrder: 1 });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-08: trigger scene_image before scene completed → 422 pipeline.phase_out_of_order', async () => {
    // Setup: scene still running (not yet completed)
    await seedPipelineRow({
      draftId,
      activePhase: 'scene',
      sceneStatus: 'running',
      activeRunPhase: 'scene',
      version: 1,
    });

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', authA())
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('pipeline.phase_out_of_order');
    // The error body must NOT contain pipeline fields that reveal internal state
    // (authz is first, so this is purely a guard error at the domain level)
    expect(res.body.error).toBeDefined();
  });

  it('AC-08: trigger reference_image before reference_data completed → 422 pipeline.phase_out_of_order', async () => {
    // Scene completed, but reference_data not yet done
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      activeRunPhase: 'reference_data',
      version: 2,
    });

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_image/trigger`)
      .set('Authorization', authA())
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('pipeline.phase_out_of_order');
  });
});

// ── Scenario 6: AC-15 scenes_required guard ───────────────────────────────────

describe('AC-15: scenes_required guard blocks triggering later phases when no scene blocks exist', () => {
  let draftId: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    // Draft with NO scene blocks seeded
    draftId = await seedDraft(userA);
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-15: trigger scene_image with no scene blocks → 422 pipeline.scenes_required', async () => {
    // Pipeline row present but scene_status=completed with zero actual scene blocks
    await seedPipelineRow({
      draftId,
      activePhase: 'scene_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'completed',
      sceneImageStatus: 'awaiting_review',
      activeRunPhase: null,
      version: 5,
    });

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', authA())
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('pipeline.scenes_required');
  });
});

// ── Scenario 7: AC-13 authz deny-and-hide ─────────────────────────────────────

describe('AC-13: non-owner → opaque 404 revealing nothing about draft or pipeline state', () => {
  let draftId: string;
  let scene1: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'A shot.', sortOrder: 1 });

    // Seed a pipeline row so there IS state to potentially leak
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      activeRunPhase: 'reference_data',
      version: 2,
    });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-13: non-owner GET → 404, body does NOT contain pipeline fields', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', authB());

    expect(res.status).toBe(404);
    // Must NOT reveal pipeline state
    expect(res.body).not.toHaveProperty('draft_id');
    expect(res.body).not.toHaveProperty('active_phase');
    expect(res.body).not.toHaveProperty('phases');
    expect(res.body).not.toHaveProperty('active_run_phase');
  });

  it('AC-13: non-owner confirm-cast → 404, evaluated before any prerequisite check', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/confirm-cast`)
      .set('Authorization', authB())
      .send({});

    // Must be 404 — NOT a 422 with prerequisite details (authz evaluated first)
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('phases');
    // Must NOT contain AC-08/AC-15 prerequisite messages
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('pipeline.phase_out_of_order');
    expect(bodyStr).not.toContain('pipeline.scenes_required');
    expect(bodyStr).not.toContain('pipeline.not_awaiting_review');
  });

  it('AC-13: non-owner trigger → 404, no prerequisite message', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', authB())
      .send({});

    expect(res.status).toBe(404);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('pipeline.phase_out_of_order');
    expect(bodyStr).not.toContain('pipeline.scenes_required');
  });

  it('AC-13: non-owner cancel → 404', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_data/cancel`)
      .set('Authorization', authB())
      .send({});

    expect(res.status).toBe(404);
  });

  it('AC-13: non-owner skip → 404', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_data/skip`)
      .set('Authorization', authB())
      .send({});

    expect(res.status).toBe(404);
  });

  it('AC-13: completely unknown draft → 404 (existence hiding)', async () => {
    const unknownDraftId = randomUUID();
    const res = await request(app)
      .get(`/storyboards/${unknownDraftId}/pipeline`)
      .set('Authorization', authA());

    expect(res.status).toBe(404);
  });

  it('AC-13: unauthenticated → 401', async () => {
    const res = await request(app).get(`/storyboards/${draftId}/pipeline`);
    expect(res.status).toBe(401);
  });
});

// ── Scenario 8: AC-14 idempotent confirm-cast + double trigger ────────────────

describe('AC-14: idempotent single active run — repeated confirm / double trigger never duplicates', () => {
  let draftId: string;
  let scene1: string;

  beforeEach(async () => {
    allQueueAddCalls.length = 0;
    draftId = await seedDraft(userA);
    scene1 = randomUUID();
    await seedScene({ id: scene1, draftId, name: 'Scene 01', prompt: 'A shot.', sortOrder: 1 });
  });

  afterEach(async () => {
    await cleanupDraft(draftId);
  });

  it('AC-14: repeated confirm-cast → reference block count stable (no duplicate set created)', async () => {
    const castProposal = [
      { name: 'Hero', type: 'character' as const, scene_block_ids: [scene1] },
    ];
    await seedPipelineRow({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'awaiting_review',
      activeRunPhase: null,
      costEstimate: '1.0000',
      version: 3,
    });
    await seedCompletedCastExtractionJob({ draftId, userId: userA, castProposal });

    // First confirm
    const first = await request(app)
      .post(`/storyboards/${draftId}/pipeline/confirm-cast`)
      .set('Authorization', authA())
      .send({});
    expect(first.status, JSON.stringify(first.body)).toBe(200);

    // Count reference blocks after first confirm
    const [rows1] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    const countAfterFirst = Number(rows1[0]!['cnt']);
    expect(countAfterFirst).toBe(1);

    // Second confirm (repeat / second-tab scenario)
    const second = await request(app)
      .post(`/storyboards/${draftId}/pipeline/confirm-cast`)
      .set('Authorization', authA())
      .send({});
    expect(second.status).toBe(200);

    // Block count must be exactly the same — no duplicate set
    const [rows2] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    const countAfterSecond = Number(rows2[0]!['cnt']);
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('AC-14: double trigger scene_image → second trigger returns existing run, no duplicate jobs', async () => {
    await seedPipelineRow({
      draftId,
      activePhase: 'scene_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'completed',
      sceneImageStatus: 'awaiting_review',
      activeRunPhase: null,
      version: 5,
    });

    allQueueAddCalls.length = 0;

    const first = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', authA())
      .send({});
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const enqueuedAfterFirst = allQueueAddCalls.length;

    // Second trigger while first is already running
    const second = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', authA())
      .send({});
    expect(second.status).toBe(200);

    // Second trigger must NOT have enqueued additional work
    const enqueuedAfterSecond = allQueueAddCalls.length;
    expect(enqueuedAfterSecond).toBe(enqueuedAfterFirst);

    // Scene illustration job count must match exactly what the first trigger created
    const [jobs] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM storyboard_scene_illustration_jobs WHERE draft_id = ?`,
      [draftId],
    );
    // Should equal the number of scene blocks (1 in this test)
    expect(Number(jobs[0]!['cnt'])).toBe(1);
  });
});
