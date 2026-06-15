/**
 * Integration tests for storyboardPipeline.resume.service.ts — T4
 *
 * Covers:
 *   AC-01 — auto-start: fresh draft (no pipeline row) → row created, run claimed,
 *            scene_status='running', enqueue invoked
 *   AC-05 — resume: existing row in running / awaiting_review → returned as-is
 *   AC-12 — lazy stuck-release: running row with stale heartbeat →
 *            state flipped to failed, loader released
 *
 * Prerequisites: Docker Compose `db` + `redis` services must be running
 * (real MySQL with migration 057 applied).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardPipeline.resume.service.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Env bootstrap (MUST be before any app import) ────────────────────────────
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
  APP_JWT_SECRET:           'sgp-t4-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
  APP_FAL_KEY:              process.env['APP_FAL_KEY']              ?? 'fal-test-key',
  APP_ELEVENLABS_API_KEY:   process.env['APP_ELEVENLABS_API_KEY']   ?? 'el-test-key',
});

// ── Spy: intercept enqueueStoryboardPlan before it touches BullMQ ────────────
vi.mock('@/queues/jobs/enqueue-storyboard-plan.js', () => ({
  enqueueStoryboardPlan: vi.fn().mockResolvedValue(undefined),
}));

import { getPipelineState } from './storyboardPipeline.resume.service.js';
import { getPipelineByDraftId } from '@/repositories/storyboardPipeline.repository.js';
import { enqueueStoryboardPlan } from '@/queues/jobs/enqueue-storyboard-plan.js';

// ── Test harness ─────────────────────────────────────────────────────────────

let conn: Connection;

const PREFIX = 'sgp-t4';
const USER_A = `${PREFIX}-ua-${randomUUID().slice(0, 8)}`;
const trackedDraftIds: string[] = [];

function newId(tag: string): string {
  return `${PREFIX}-${tag}-${randomUUID().slice(0, 12)}`;
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = newId('draft');
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'Test prompt', blocks: [], settings: null })],
  );
  return draftId;
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [USER_A, `${USER_A}@example.test`, 'Test Creator T4'],
  );
});

afterAll(async () => {
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [USER_A]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

// ── AC-01: auto-start on fresh draft ─────────────────────────────────────────

describe('AC-01 — auto-start on fresh draft (no pipeline row)', () => {
  it('creates the pipeline row, claims the run, sets scene_status=running, and enqueues scene plan', async () => {
    vi.clearAllMocks();
    const draftId = await seedDraft(USER_A);

    const state = await getPipelineState(draftId, USER_A);

    // The returned state must report the scene phase as running
    expect(state.sceneStatus).toBe('running');
    expect(state.activeRunPhase).toBe('scene');

    // The DB row must reflect it too
    const row = await getPipelineByDraftId(draftId);
    expect(row).not.toBeNull();
    expect(row!.sceneStatus).toBe('running');
    expect(row!.activeRunPhase).toBe('scene');
    expect(row!.phaseStartedAt).not.toBeNull();

    // The enqueue function must have been called exactly once
    expect(enqueueStoryboardPlan).toHaveBeenCalledTimes(1);
    expect(enqueueStoryboardPlan).toHaveBeenCalledWith(
      expect.objectContaining({ draftId, userId: USER_A }),
    );
  });

  it('returns the existing running state idempotently on a second call (no duplicate enqueue)', async () => {
    vi.clearAllMocks();
    const draftId = await seedDraft(USER_A);

    // First call: auto-start
    await getPipelineState(draftId, USER_A);
    expect(enqueueStoryboardPlan).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Second call: row exists and is already running — must NOT enqueue again
    const state = await getPipelineState(draftId, USER_A);
    expect(state.sceneStatus).toBe('running');
    expect(enqueueStoryboardPlan).not.toHaveBeenCalled();
  });
});

// ── AC-05: resume to running / awaiting-review ───────────────────────────────

describe('AC-05 — resume: existing pipeline row returned as-is', () => {
  it('returns the current running state when the row already exists and the phase is running', async () => {
    vi.clearAllMocks();
    const draftId = await seedDraft(USER_A);

    // Seed a pipeline row directly (simulates a draft already mid-run)
    await conn.execute(
      `INSERT INTO storyboard_pipeline
         (draft_id, active_phase, scene_status, reference_data_status,
          reference_image_status, scene_image_status, active_run_phase,
          phase_started_at, heartbeat_at, version)
       VALUES (?, 'scene', 'running', 'idle', 'idle', 'idle', 'scene', NOW(3), NOW(3), 2)`,
      [draftId],
    );

    const state = await getPipelineState(draftId, USER_A);

    expect(state.sceneStatus).toBe('running');
    expect(state.activeRunPhase).toBe('scene');
    // No enqueue: the row was already there and healthy
    expect(enqueueStoryboardPlan).not.toHaveBeenCalled();
  });

  it('returns awaiting_review state as-is (cast proposal pending)', async () => {
    vi.clearAllMocks();
    const draftId = await seedDraft(USER_A);

    await conn.execute(
      `INSERT INTO storyboard_pipeline
         (draft_id, active_phase, scene_status, reference_data_status,
          reference_image_status, scene_image_status, active_run_phase, version)
       VALUES (?, 'reference_data', 'completed', 'awaiting_review', 'idle', 'idle', NULL, 3)`,
      [draftId],
    );

    const state = await getPipelineState(draftId, USER_A);

    expect(state.sceneStatus).toBe('completed');
    expect(state.referenceDataStatus).toBe('awaiting_review');
    expect(state.activeRunPhase).toBeNull();
    expect(enqueueStoryboardPlan).not.toHaveBeenCalled();
  });
});

// ── AC-12: lazy stuck-release ─────────────────────────────────────────────────

describe('AC-12 — lazy stuck-release: over-bound running phase flipped to failed', () => {
  it('marks the phase failed and clears active_run_phase when heartbeat is past the bound', async () => {
    vi.clearAllMocks();
    const draftId = await seedDraft(USER_A);

    // Insert a row that is "running" but with a stale heartbeat (15 min ago)
    await conn.execute(
      `INSERT INTO storyboard_pipeline
         (draft_id, active_phase, scene_status, reference_data_status,
          reference_image_status, scene_image_status, active_run_phase,
          phase_started_at, heartbeat_at, version)
       VALUES (?, 'scene', 'running', 'idle', 'idle', 'idle', 'scene',
               NOW(3) - INTERVAL 15 MINUTE,
               NOW(3) - INTERVAL 15 MINUTE, 2)`,
      [draftId],
    );

    const state = await getPipelineState(draftId, USER_A);

    // The returned state must show the phase as failed (loader released)
    expect(state.sceneStatus).toBe('failed');
    expect(state.activeRunPhase).toBeNull();
    expect(state.errorMessage).toBeTruthy();

    // The DB row must also be flipped to failed
    const row = await getPipelineByDraftId(draftId);
    expect(row!.sceneStatus).toBe('failed');
    expect(row!.activeRunPhase).toBeNull();
    expect(row!.errorMessage).toBeTruthy();

    // Must not enqueue new work after a stuck release
    expect(enqueueStoryboardPlan).not.toHaveBeenCalled();
  });

  it('does NOT release a running phase whose heartbeat is still fresh', async () => {
    vi.clearAllMocks();
    const draftId = await seedDraft(USER_A);

    // Insert with a recent heartbeat
    await conn.execute(
      `INSERT INTO storyboard_pipeline
         (draft_id, active_phase, scene_status, reference_data_status,
          reference_image_status, scene_image_status, active_run_phase,
          phase_started_at, heartbeat_at, version)
       VALUES (?, 'scene', 'running', 'idle', 'idle', 'idle', 'scene', NOW(3), NOW(3), 2)`,
      [draftId],
    );

    const state = await getPipelineState(draftId, USER_A);

    expect(state.sceneStatus).toBe('running');
    expect(state.activeRunPhase).toBe('scene');
    expect(enqueueStoryboardPlan).not.toHaveBeenCalled();
  });
});

// ── AC-13: authorization ──────────────────────────────────────────────────────

describe('AC-13 — authorization: non-owner is denied with a not-found error', () => {
  it('throws NotFoundError when the caller does not own the draft', async () => {
    const draftId = await seedDraft(USER_A);
    const impostor = `${PREFIX}-impostor`;

    await expect(getPipelineState(draftId, impostor)).rejects.toThrow(/not found/i);
  });
});
