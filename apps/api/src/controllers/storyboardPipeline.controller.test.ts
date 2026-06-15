/**
 * Controller integration tests for storyboardPipeline.controller.ts + .routes.ts (T9).
 *
 * Level: integration (real MySQL 8, real session-based auth, supertest mini-app).
 * The router is mounted on its OWN minimal Express app here (the production mount is
 * T14's job — do NOT depend on index.js having mounted it). The central errorHandler
 * is reused from index.js so the `{ error, code, details }` envelope matches reality.
 *
 * ACs covered:
 *   AC-13 — deny-and-hide: a NON-owner gets an opaque 404 for EVERY operation; the
 *           body reveals nothing about the draft/pipeline (no prerequisite message).
 *   Gate codes surfaced from the services as 422 { error, code, details }:
 *     - pipeline.phase_out_of_order        (trigger a later phase before its prerequisite)
 *     - pipeline.scenes_required           (trigger scene_image with no scenes)
 *     - pipeline.estimate_revalidation_failed (confirm-cast with a tampered estimate)
 *   GET state (owner) → 200 with the projected PipelineState (contract wire shape).
 *   Zod validation rejects a malformed phase param → 400.
 *
 * Status-code / response-shape assertions derive from
 * docs/features/storyboard-generation-pipeline/contracts/openapi.yaml.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/controllers/storyboardPipeline.controller.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env bootstrap (must happen before any app import) ─────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6380',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'sgp-t9-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// Defensive: never let a lazy auto-start (GET on a fresh draft) hit a real broker.
const { storyboardPlanAddMock } = vi.hoisted(() => ({
  storyboardPlanAddMock: vi.fn().mockResolvedValue({ id: 'queued-plan' }),
}));
vi.mock('@/queues/bullmq.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/queues/bullmq.js')>();
  return {
    ...actual,
    storyboardPlanQueue: { add: storyboardPlanAddMock, getJob: vi.fn(), on: vi.fn() },
  };
});

import express from 'express';
import { errorHandler } from '../index.js';
import { storyboardPipelineRouter } from '../routes/storyboardPipeline.routes.js';

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PREFIX = 'sgp-t9';
const OWNER_ID = `${PREFIX}-owner-${randomUUID().slice(0, 8)}`;
const OTHER_ID = `${PREFIX}-other-${randomUUID().slice(0, 8)}`;
const OWNER_TOKEN = `tok-${PREFIX}-owner-${randomUUID()}`;
const OTHER_TOKEN = `tok-${PREFIX}-other-${randomUUID()}`;
const OWNER_SESSION = randomUUID();
const OTHER_SESSION = randomUUID();

const ownerAuth = `Bearer ${OWNER_TOKEN}`;
const otherAuth = `Bearer ${OTHER_TOKEN}`;

let app: Express;
let conn: Connection;

const trackedDraftIds: string[] = [];

function newDraftId(): string {
  const id = randomUUID();
  trackedDraftIds.push(id);
  return id;
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = newDraftId();
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
  return draftId;
}

/** Insert a pipeline row in a known state (bypasses the lazy auto-start path). */
async function seedPipelineRow(
  draftId: string,
  opts: {
    activePhase?: string;
    sceneStatus?: string;
    activeRunPhase?: string | null;
    version?: number;
  } = {},
): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, active_run_phase, version)
     VALUES (?, ?, ?, ?, ?)`,
    [
      draftId,
      opts.activePhase ?? 'scene',
      opts.sceneStatus ?? 'idle',
      opts.activeRunPhase ?? null,
      opts.version ?? 1,
    ],
  );
}

async function seedSceneBlock(draftId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, sort_order, position_x, position_y)
     VALUES (?, ?, 'scene', ?, 0, 0, 0)`,
    [randomUUID(), draftId, 'Scene 1'],
  );
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST'],
    port:     Number(process.env['APP_DB_PORT']),
    database: process.env['APP_DB_NAME'],
    user:     process.env['APP_DB_USER'],
    password: process.env['APP_DB_PASSWORD'],
  });

  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)`,
    [OWNER_ID, `${OWNER_ID}@example.test`, 'Owner'],
  );
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)`,
    [OTHER_ID, `${OTHER_ID}@example.test`, 'Other'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [OWNER_SESSION, OWNER_ID, sha256(OWNER_TOKEN), new Date(Date.now() + 3_600_000)],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [OTHER_SESSION, OTHER_ID, sha256(OTHER_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  app = express();
  app.use(express.json());
  app.use(storyboardPipelineRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  await conn.query(`DELETE FROM sessions WHERE session_id IN (?, ?)`, [OWNER_SESSION, OTHER_SESSION]);
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [OWNER_ID, OTHER_ID]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

// ── AC-13: deny-and-hide — non-owner gets an opaque 404 for EVERY operation ────

describe('AC-13 deny-and-hide — non-owner receives an opaque 404, no leakage', () => {
  it('GET state by a non-owner → 404 with an opaque body', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId, { activeRunPhase: 'scene', sceneStatus: 'running' });

    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', otherAuth);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    // Opaque: no draft_id / phase / pipeline detail; nothing distinguishing
    // "doesn't exist" from "you don't own it".
    expect(JSON.stringify(res.body)).not.toContain(draftId);
    expect(JSON.stringify(res.body)).not.toContain('scene');
    expect(res.body).not.toHaveProperty('code');
  });

  it('confirm-cast by a non-owner → 404 (never an estimate/awaiting message)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId);

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/confirm-cast`)
      .set('Authorization', otherAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).not.toHaveProperty('code');
    expect(JSON.stringify(res.body)).not.toContain('estimate');
  });

  it('trigger by a non-owner → 404 (never a prerequisite/order message)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId);

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_image/trigger`)
      .set('Authorization', otherAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).not.toHaveProperty('code');
    expect(JSON.stringify(res.body)).not.toContain('order');
    expect(JSON.stringify(res.body)).not.toContain('scene');
  });

  it('cancel by a non-owner → 404', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId);

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene/cancel`)
      .set('Authorization', otherAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).not.toHaveProperty('code');
  });

  it('skip by a non-owner → 404', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId);

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/skip`)
      .set('Authorization', otherAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).not.toHaveProperty('code');
  });

  it('a draft that does not exist returns the SAME opaque 404 as a non-owned draft', async () => {
    const ghost = randomUUID(); // never inserted
    const res = await request(app)
      .get(`/storyboards/${ghost}/pipeline`)
      .set('Authorization', otherAuth);

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('code');
  });
});

// ── 422 gate codes surfaced from the services ──────────────────────────────────

describe('422 gate codes (owner)', () => {
  it('trigger reference_image before scene completes → 422 pipeline.phase_out_of_order', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId, { sceneStatus: 'idle' });
    await seedSceneBlock(draftId); // scenes exist, so it is an ORDER violation, not scenes_required

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/reference_image/trigger`)
      .set('Authorization', ownerAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('pipeline.phase_out_of_order');
    expect(typeof res.body.error).toBe('string');
  });

  it('trigger scene_image with no scenes → 422 pipeline.scenes_required', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId, { sceneStatus: 'idle' });
    // No scene blocks seeded.

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/scene_image/trigger`)
      .set('Authorization', ownerAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('pipeline.scenes_required');
  });

  it('confirm-cast with a tampered estimate → 422 pipeline.estimate_revalidation_failed', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId, { activeRunPhase: null, version: 1 });

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/confirm-cast`)
      .set('Authorization', ownerAuth)
      .send({ cost_estimate: '999.0000' }); // does not match the server-computed estimate

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('pipeline.estimate_revalidation_failed');
  });
});

// ── GET state (owner) — 200 projected PipelineState ────────────────────────────

describe('GET state (owner) → 200 projected PipelineState', () => {
  it('returns the contract-shaped projection', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId, {
      activePhase: 'scene',
      sceneStatus: 'running',
      activeRunPhase: 'scene',
      version: 3,
    });

    const res = await request(app)
      .get(`/storyboards/${draftId}/pipeline`)
      .set('Authorization', ownerAuth);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      draft_id: draftId,
      active_phase: 'scene',
      active_run_phase: 'scene',
      version: 3,
    });
    expect(res.body.phases).toMatchObject({
      scene: { status: 'running' },
      reference_data: { status: 'idle' },
      reference_image: { status: 'idle' },
      scene_image: { status: 'idle' },
    });
    expect(typeof res.body.updated_at).toBe('string');
  });
});

// ── Zod validation ─────────────────────────────────────────────────────────────

describe('Zod request validation', () => {
  it('rejects a malformed phase param with 400', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedPipelineRow(draftId);

    const res = await request(app)
      .post(`/storyboards/${draftId}/pipeline/phases/not_a_phase/trigger`)
      .set('Authorization', ownerAuth)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(400);
  });
});
