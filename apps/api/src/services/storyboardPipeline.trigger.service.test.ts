/**
 * T7 — storyboardPipeline.trigger.service INTEGRATION test
 *
 * ACs under test (spec §5):
 *   AC-04 (US-04) — accept scene-image offer: claims run, enqueues scene-image
 *                   jobs for all non-terminal scene units.
 *   AC-06 (US-06) — incremental re-trigger after partial run: re-enqueues ONLY
 *                   the non-terminal units; done/ready units are NOT re-enqueued.
 *   AC-08 (US-07) — out-of-order trigger → pipeline.phase_out_of_order.
 *   AC-15 (US-04) — scene_image trigger with no generated scenes →
 *                   pipeline.scenes_required.
 *
 * Level: integration (real MySQL, real Redis, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardPipeline.trigger.service.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

// ── Env bootstrap — must precede any app-module import ────────────────────────
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
  APP_JWT_SECRET:           'sgp-t7-trigger-integ-test-secret-32c!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
// BullMQ Queue.add must not hit a real worker — stub it.
const { mockQueueAdd } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job' }),
}));
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: mockQueueAdd,
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

import { triggerPhase } from './storyboardPipeline.trigger.service.js';
import { PhaseOutOfOrderError, ScenesRequiredError } from './storyboardPipeline.trigger.service.js';
import { NotFoundError } from '@/lib/errors.js';
import {
  getPipelineByDraftId,
  insertPipelineRow,
  casUpdateState,
} from '@/repositories/storyboardPipeline.repository.js';

// ── Shared connection + tracked ids ───────────────────────────────────────────
let conn: Connection;

const PREFIX = 'sgp-t7';
const OWNER_ID = `${PREFIX}-owner-${randomUUID().slice(0, 8)}`;
const trackedDraftIds: string[] = [];

function newId(tag: string): string {
  return `${PREFIX}-${tag}-${randomUUID().slice(0, 12)}`;
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = newId('draft');
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'Test prompt' })],
  );
  return draftId;
}

/**
 * Seed scene blocks for a draft. Returns their IDs.
 */
async function seedSceneBlocks(draftId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId('scene');
    ids.push(id);
    await conn.execute(
      `INSERT INTO storyboard_blocks (id, draft_id, block_type, name, sort_order)
       VALUES (?, ?, 'scene', ?, ?)`,
      [id, draftId, `Scene ${i}`, i],
    );
  }
  return ids;
}

/**
 * Seed a storyboard_scene_illustration_jobs row for a given scene block.
 */
async function seedIllustrationJob(
  draftId: string,
  blockId: string,
  status: 'queued' | 'running' | 'ready' | 'failed',
): Promise<string> {
  const jobMappingId = newId('sjm');
  const aiJobId = newId('aijob');
  // ai_generation_jobs row (required by FK on storyboard_scene_illustration_jobs)
  await conn.execute(
    `INSERT INTO ai_generation_jobs (job_id, user_id, model_id, capability, prompt, options)
     VALUES (?, ?, 'test-model', 'image_edit', 'test', '{}')`,
    [aiJobId, OWNER_ID],
  );
  await conn.execute(
    `INSERT INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status, active_lock)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [jobMappingId, draftId, blockId, aiJobId, status, status !== 'failed' ? 1 : null],
  );
  return aiJobId;
}

/**
 * Count illustration jobs inserted for a draft AFTER a specific moment, filtering by
 * the job IDs in storyboard_scene_illustration_jobs. We compare count of rows.
 */
async function countIllustrationJobs(draftId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_scene_illustration_jobs WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

/**
 * Drive pipeline to a state where scene_image can be triggered:
 * scene=completed, reference_data=completed, reference_image=completed,
 * scene_image=awaiting_review.
 */
async function arrangePipelineForSceneImageTrigger(
  draftId: string,
  estimate: string | null = null,
): Promise<void> {
  await insertPipelineRow({ draftId });
  let row = (await getPipelineByDraftId(draftId))!;

  // scene completed
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'reference_data',
    phase: 'scene',
    status: 'completed',
    activeRunPhase: null,
  });
  row = (await getPipelineByDraftId(draftId))!;

  // reference_data completed
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'reference_image',
    phase: 'reference_data',
    status: 'completed',
    activeRunPhase: null,
  });
  row = (await getPipelineByDraftId(draftId))!;

  // reference_image completed
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'scene_image',
    phase: 'reference_image',
    status: 'completed',
    activeRunPhase: null,
  });
  row = (await getPipelineByDraftId(draftId))!;

  // scene_image awaiting_review with cost estimate
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase: 'scene_image',
    status: 'awaiting_review',
    activeRunPhase: null,
    costEstimate: estimate,
  });
}

/**
 * Drive pipeline so all earlier phases are done but scene_image is idle
 * (for a fresh trigger rather than accept-offer path).
 */
async function arrangePipelineAllPriorCompleted(draftId: string): Promise<void> {
  await insertPipelineRow({ draftId });
  let row = (await getPipelineByDraftId(draftId))!;

  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'reference_data',
    phase: 'scene',
    status: 'completed',
    activeRunPhase: null,
  });
  row = (await getPipelineByDraftId(draftId))!;

  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'reference_image',
    phase: 'reference_data',
    status: 'completed',
    activeRunPhase: null,
  });
  row = (await getPipelineByDraftId(draftId))!;

  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'scene_image',
    phase: 'reference_image',
    status: 'completed',
    activeRunPhase: null,
  });
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
    [OWNER_ID, `${OWNER_ID}@example.test`, 'Test Creator T7'],
  );
});

afterAll(async () => {
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    // FK-safe cleanup order (most dependent first)
    await conn.query(`DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  // ai_generation_jobs rows inserted during tests (keyed by OWNER_ID)
  await conn.query(`DELETE FROM ai_generation_jobs WHERE user_id = ?`, [OWNER_ID]);
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [OWNER_ID]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

beforeEach(() => {
  mockQueueAdd.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-08 — out-of-order trigger → pipeline.phase_out_of_order
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — phase-order guard (AC-08)', () => {
  it('blocks triggering reference_image when scene is not yet completed → PhaseOutOfOrderError', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId }); // all idle (scene not done)
    await seedSceneBlocks(draftId, 1);

    await expect(
      triggerPhase({ draftId, userId: OWNER_ID, phase: 'reference_image' }),
    ).rejects.toBeInstanceOf(PhaseOutOfOrderError);
  });

  it('PhaseOutOfOrderError carries the correct machine code', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });
    await seedSceneBlocks(draftId, 1);

    let caught: unknown;
    try {
      await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PhaseOutOfOrderError);
    const err = caught as PhaseOutOfOrderError;
    expect(err.code).toBe('pipeline.phase_out_of_order');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('blocks triggering scene_image when reference_image is not done', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });
    let row = (await getPipelineByDraftId(draftId))!;
    // scene done, reference_data done, but reference_image idle
    await casUpdateState({
      draftId, currentVersion: row.version,
      phase: 'scene', status: 'completed', activeRunPhase: null,
    });
    row = (await getPipelineByDraftId(draftId))!;
    await casUpdateState({
      draftId, currentVersion: row.version,
      phase: 'reference_data', status: 'completed', activeRunPhase: null,
    });
    await seedSceneBlocks(draftId, 1);

    await expect(
      triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' }),
    ).rejects.toBeInstanceOf(PhaseOutOfOrderError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-15 — scenes_required guard
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — scenes-required guard (AC-15)', () => {
  it('blocks scene_image trigger when no scene blocks exist → ScenesRequiredError', async () => {
    const draftId = await seedDraft(OWNER_ID);
    // All prior phases done but NO scene blocks
    await arrangePipelineAllPriorCompleted(draftId);

    await expect(
      triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' }),
    ).rejects.toBeInstanceOf(ScenesRequiredError);
  });

  it('ScenesRequiredError carries the correct machine code', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangePipelineAllPriorCompleted(draftId);

    let caught: unknown;
    try {
      await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ScenesRequiredError);
    const err = caught as ScenesRequiredError;
    expect(err.code).toBe('pipeline.scenes_required');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  /**
   * The scenes_required guard MUST fire BEFORE the phase-order guard.
   * Regardless of phase-order status, a trigger with no scenes → scenes_required.
   * (This case has BOTH violations; scenes_required should surface first.)
   */
  it('AC-15 yields scenes_required even when phase-order is ALSO violated', async () => {
    const draftId = await seedDraft(OWNER_ID);
    // Pipeline at default (all idle); no scene blocks. Both guards fire.
    await insertPipelineRow({ draftId });

    let caught: unknown;
    try {
      await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });
    } catch (e) {
      caught = e;
    }
    // scenes_required MUST precede phase_out_of_order per spec AC-15 ordering.
    expect(caught).toBeInstanceOf(ScenesRequiredError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authorization (AC-13)
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — authorization (AC-13)', () => {
  it('non-owner receives NotFoundError before any guard fires', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangePipelineAllPriorCompleted(draftId);
    await seedSceneBlocks(draftId, 2);

    await expect(
      triggerPhase({ draftId, userId: 'sgp-t7-not-the-owner', phase: 'scene_image' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04 — accept scene-image offer: claims run, enqueues
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — accept scene-image offer (AC-04)', () => {
  it('when scene_image is awaiting_review and scenes exist → claims run and enqueues jobs', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangePipelineForSceneImageTrigger(draftId);
    await seedSceneBlocks(draftId, 2);

    const result = await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });

    expect(result.activeRunPhase).toBe('scene_image');
    expect(result.sceneImageStatus).toBe('running');
    expect(mockQueueAdd).toHaveBeenCalled();
  });

  it('when pipeline has no illustration jobs (fresh start), enqueues one per scene', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangePipelineForSceneImageTrigger(draftId);
    const sceneIds = await seedSceneBlocks(draftId, 3);

    await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });

    // 3 scenes → 3 illustration job mappings created
    expect(await countIllustrationJobs(draftId)).toBe(sceneIds.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-06 — incremental re-trigger: done/ready units NOT re-enqueued
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — incremental re-trigger (AC-06)', () => {
  it('only enqueues non-terminal scene units; done units are not re-enqueued', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangePipelineAllPriorCompleted(draftId);

    // Set scene_image to cancelled (so re-trigger is legal)
    let row = (await getPipelineByDraftId(draftId))!;
    await casUpdateState({
      draftId,
      currentVersion: row.version,
      phase: 'scene_image',
      status: 'cancelled',
      activeRunPhase: null,
    });

    // Seed 3 scene blocks with mixed statuses
    const [doneSc, pendingSc, failedSc] = await seedSceneBlocks(draftId, 3);

    // doneSc already has a 'ready' illustration job → terminal, must NOT be re-enqueued
    await seedIllustrationJob(draftId, doneSc!, 'ready');
    // pendingSc has a 'queued' job → non-terminal, must be re-enqueued
    await seedIllustrationJob(draftId, pendingSc!, 'queued');
    // failedSc has a 'failed' job → terminal, must NOT be re-enqueued

    const jobsBefore = await countIllustrationJobs(draftId);
    expect(jobsBefore).toBe(2); // doneSc + pendingSc only (failedSc has no existing job)

    await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });

    // After re-trigger: doneSc should NOT gain a new job (still 1)
    // pendingSc is non-terminal → no new job created (re-uses existing queue)
    // failedSc has no job / failed job → gets a new job
    // Total new jobs enqueued via queue = scenes that are non-ready
    // We verify done-unit was NOT re-queued by checking mockQueueAdd call count
    // doesn't include doneSc's blockId in any of the enqueue calls.
    const calls = mockQueueAdd.mock.calls;
    const enqueuedBlockIds = calls.map((call: unknown[]) => {
      const payload = (call[1] as Record<string, unknown>);
      return payload['blockId'] ?? (payload as { options?: { blockId?: string } }).options?.blockId;
    }).filter(Boolean) as string[];

    // The done (ready) scene must NOT appear in any enqueue call
    expect(enqueuedBlockIds).not.toContain(doneSc!);
  });

  it('when ALL scene units are already done (ready), enqueues nothing and returns completed', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangePipelineAllPriorCompleted(draftId);

    let row = (await getPipelineByDraftId(draftId))!;
    await casUpdateState({
      draftId,
      currentVersion: row.version,
      phase: 'scene_image',
      status: 'cancelled',
      activeRunPhase: null,
    });

    // All scenes have 'ready' illustration jobs → fully terminal
    const [sc1, sc2] = await seedSceneBlocks(draftId, 2);
    await seedIllustrationJob(draftId, sc1!, 'ready');
    await seedIllustrationJob(draftId, sc2!, 'ready');

    const result = await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene_image' });

    // No new jobs enqueued
    expect(mockQueueAdd).not.toHaveBeenCalled();
    // Phase advances to completed directly (all done)
    expect(result.sceneImageStatus).toBe('completed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reference phase incremental re-trigger (AC-06 for reference_image)
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — incremental re-trigger of reference_image (AC-06)', () => {
  it('only re-enqueues non-done reference blocks; done blocks are skipped', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });
    let row = (await getPipelineByDraftId(draftId))!;

    // scene + reference_data done; reference_image cancelled (can re-trigger)
    await casUpdateState({
      draftId, currentVersion: row.version,
      phase: 'scene', status: 'completed', activeRunPhase: null,
    });
    row = (await getPipelineByDraftId(draftId))!;
    await casUpdateState({
      draftId, currentVersion: row.version,
      phase: 'reference_data', status: 'completed', activeRunPhase: null,
    });
    row = (await getPipelineByDraftId(draftId))!;
    await casUpdateState({
      draftId, currentVersion: row.version,
      phase: 'reference_image', status: 'cancelled', activeRunPhase: null,
    });

    await seedSceneBlocks(draftId, 1);

    // Insert reference blocks with mixed window_status
    const doneRefId = newId('ref');
    const pendingRefId = newId('ref');

    await conn.execute(
      `INSERT INTO storyboard_reference_blocks
         (id, draft_id, cast_type, name, sort_order, window_status)
       VALUES (?, ?, 'character', 'DoneRef', 0, 'done'),
              (?, ?, 'character', 'PendingRef', 1, 'pending')`,
      [doneRefId, draftId, pendingRefId, draftId],
    );

    await triggerPhase({ draftId, userId: OWNER_ID, phase: 'reference_image' });

    // The done reference must NOT appear in any queue.add call
    const calls = mockQueueAdd.mock.calls;
    // ai-generate payloads contain no blockId at top level; look inside options or match
    // by checking that at most 1 job was enqueued (the pending ref, not the done one)
    expect(calls.length).toBe(1); // only the pending block
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F5 (AC-07) — corner re-trigger of scene / reference_data MUST enqueue a worker job
// (previously these claimed the run but enqueued nothing → the phase hung running).
// ─────────────────────────────────────────────────────────────────────────────
describe('triggerPhase — re-trigger scene / reference_data enqueues a worker job (F5, AC-07)', () => {
  it('re-trigger scene → claims run and enqueues a storyboard-plan job', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId }); // scene idle, no active run

    const result = await triggerPhase({ draftId, userId: OWNER_ID, phase: 'scene' });

    expect(result.sceneStatus).toBe('running');
    expect(result.activeRunPhase).toBe('scene');
    const jobNames = mockQueueAdd.mock.calls.map((c) => c[0]);
    expect(jobNames).toContain('storyboard-plan');
  });

  it('re-trigger reference_data (scenes exist) → claims run and enqueues a cast-extract job', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });
    await seedSceneBlocks(draftId, 2);
    // Advance scene → completed so reference_data is the next runnable phase.
    const row = (await getPipelineByDraftId(draftId))!;
    await casUpdateState({
      draftId,
      currentVersion: row.version,
      phase: 'scene',
      status: 'completed',
      activePhase: 'reference_data',
    });

    const result = await triggerPhase({ draftId, userId: OWNER_ID, phase: 'reference_data' });

    expect(result.referenceDataStatus).toBe('running');
    expect(result.activeRunPhase).toBe('reference_data');
    const jobNames = mockQueueAdd.mock.calls.map((c) => c[0]);
    expect(jobNames).toContain('cast-extract');
  });
});
