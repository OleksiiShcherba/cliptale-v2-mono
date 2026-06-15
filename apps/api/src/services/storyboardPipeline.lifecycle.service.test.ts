/**
 * T8 — storyboardPipeline.lifecycle.service INTEGRATION test
 *
 * ACs under test (spec §5):
 *   AC-06 (US-06) — cancelPhase: clears the active run, enqueues NO new units,
 *                   KEEPS every already-done unit, returns the phase to `idle`.
 *   AC-07 (US-07) — skipPhase: records the phase as `skipped` — DISTINCT from `idle` —
 *                   so a prerequisite check can tell an intentional skip from a never-run phase;
 *                   the phase remains re-triggerable (canTransition('skipped','running') === true).
 *
 * Level: integration (real MySQL, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardPipeline.lifecycle.service.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  APP_JWT_SECRET:           'sgp-t8-lifecycle-integ-test-secret-32!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks — BullMQ Queue.add must not hit a real worker ───────────────────────
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

import { cancelPhase, skipPhase } from './storyboardPipeline.lifecycle.service.js';
import { NotFoundError } from '@/lib/errors.js';
import {
  getPipelineByDraftId,
  insertPipelineRow,
  casUpdateState,
  claimRun,
} from '@/repositories/storyboardPipeline.repository.js';
import { canTransition, isPhaseResolved } from '@ai-video-editor/project-schema';

// ── Shared connection + tracked ids ───────────────────────────────────────────
let conn: Connection;

const PREFIX = 'sgp-t8';
const OWNER_ID = `${PREFIX}-owner-${randomUUID().slice(0, 8)}`;
const OTHER_USER = `${PREFIX}-other-${randomUUID().slice(0, 8)}`;
const trackedDraftIds: string[] = [];
const trackedRefBlockIds: string[] = [];
const trackedAiJobIds: string[] = [];

function newId(tag: string): string {
  return `${PREFIX}-${tag}-${randomUUID().slice(0, 12)}`;
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = newId('draft');
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'T8 test prompt' })],
  );
  return draftId;
}

/**
 * Seed a reference block for the reference_image phase with a given window_status.
 * storyboard_reference_blocks has no storyboard_blocks FK — it is its own root.
 */
async function seedReferenceBlock(
  draftId: string,
  windowStatus: 'done' | 'pending' | 'running' | 'failed',
): Promise<string> {
  const blockId = newId('ref');
  trackedRefBlockIds.push(blockId);

  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, cast_type, name, window_status)
     VALUES (?, ?, 'character', 'Test Ref', ?)`,
    [blockId, draftId, windowStatus],
  );

  return blockId;
}

/**
 * Count reference blocks for a draft with a specific window_status.
 */
async function countRefBlocksByStatus(
  draftId: string,
  windowStatus: string,
): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks
     WHERE draft_id = ? AND window_status = ?`,
    [draftId, windowStatus],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

/**
 * Arrange a draft with pipeline state where reference_image is running,
 * with some done reference blocks and some pending.
 */
async function arrangeRunningReferenceImage(params: {
  draftIds: string;
  doneCount: number;
  pendingCount: number;
}): Promise<void> {
  const { draftIds: draftId, doneCount, pendingCount } = params;
  await insertPipelineRow({ draftId });
  let row = (await getPipelineByDraftId(draftId))!;

  // Advance to reference_image running via CAS updates
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase: 'scene',
    status: 'completed',
    activePhase: 'reference_data',
  });
  row = (await getPipelineByDraftId(draftId))!;
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase: 'reference_data',
    status: 'completed',
    activePhase: 'reference_image',
  });
  row = (await getPipelineByDraftId(draftId))!;

  // Claim the run to make reference_image running
  await claimRun({
    draftId,
    phase: 'reference_image',
    currentVersion: row.version,
  });

  // Seed reference blocks
  for (let i = 0; i < doneCount; i++) {
    await seedReferenceBlock(draftId, 'done');
  }
  for (let i = 0; i < pendingCount; i++) {
    await seedReferenceBlock(draftId, 'pending');
  }
}

/**
 * Arrange a draft with pipeline state where reference_data is awaiting_review
 * (the "skip" candidate: the review modal is showing).
 */
async function arrangeAwaitingReview(draftId: string): Promise<void> {
  await insertPipelineRow({ draftId });
  let row = (await getPipelineByDraftId(draftId))!;

  // Advance scene to completed
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase: 'scene',
    status: 'completed',
    activePhase: 'reference_data',
  });
  row = (await getPipelineByDraftId(draftId))!;

  // Set reference_data to awaiting_review
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase: 'reference_data',
    status: 'awaiting_review',
  });
}

// ── Test setup / teardown ─────────────────────────────────────────────────────

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
    [OWNER_ID, `${OWNER_ID}@example.test`, 'T8 Owner'],
  );
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [OTHER_USER, `${OTHER_USER}@example.test`, 'T8 Other'],
  );
});

afterAll(async () => {
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    // storyboard_reference_blocks + storyboard_pipeline have FK ON DELETE CASCADE from generation_drafts
    await conn.query(`DELETE FROM storyboard_reference_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [OWNER_ID, OTHER_USER]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

// ── AC-06: cancelPhase ────────────────────────────────────────────────────────

describe('cancelPhase (AC-06)', () => {
  it('returns NotFoundError for non-owner (AC-13)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });

    await expect(
      cancelPhase({ draftId, userId: OTHER_USER, phase: 'reference_image' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('returns NotFoundError for unknown draft', async () => {
    await expect(
      cancelPhase({ draftId: newId('ghost'), userId: OWNER_ID, phase: 'reference_image' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('sets phase status to idle, clears active_run_phase, bumps version (AC-06)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangeRunningReferenceImage({
      draftIds: draftId,
      doneCount: 2,
      pendingCount: 1,
    });

    const before = (await getPipelineByDraftId(draftId))!;
    expect(before.referenceImageStatus).toBe('running');
    expect(before.activeRunPhase).toBe('reference_image');

    const result = await cancelPhase({ draftId, userId: OWNER_ID, phase: 'reference_image' });

    expect(result.referenceImageStatus).toBe('idle');
    expect(result.activeRunPhase).toBeNull();
    expect(result.version).toBeGreaterThan(before.version);
  });

  it('enqueues NO new units after cancel (AC-06 QG-2)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangeRunningReferenceImage({
      draftIds: draftId,
      doneCount: 1,
      pendingCount: 2,
    });

    mockQueueAdd.mockClear();

    await cancelPhase({ draftId, userId: OWNER_ID, phase: 'reference_image' });

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('KEEPS already-done reference units after cancel (AC-06 cost-integrity guarantee)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangeRunningReferenceImage({
      draftIds: draftId,
      doneCount: 3,
      pendingCount: 1,
    });

    await cancelPhase({ draftId, userId: OWNER_ID, phase: 'reference_image' });

    // Done units must survive: still 3 rows with window_status='done'
    const doneCount = await countRefBlocksByStatus(draftId, 'done');
    expect(doneCount).toBe(3);
  });

  it('phase is re-triggerable from idle (canTransition idle→running)', async () => {
    // Pure transition check — idle → running is always valid
    expect(canTransition('idle', 'running')).toBe(true);
  });
});

// ── AC-07: skipPhase ──────────────────────────────────────────────────────────

describe('skipPhase (AC-07)', () => {
  it('returns NotFoundError for non-owner (AC-13)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });

    await expect(
      skipPhase({ draftId, userId: OTHER_USER, phase: 'reference_data' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('sets phase status to skipped, clears active_run_phase, bumps version (AC-07)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangeAwaitingReview(draftId);

    const before = (await getPipelineByDraftId(draftId))!;
    expect(before.referenceDataStatus).toBe('awaiting_review');

    const result = await skipPhase({ draftId, userId: OWNER_ID, phase: 'reference_data' });

    expect(result.referenceDataStatus).toBe('skipped');
    expect(result.activeRunPhase).toBeNull();
    expect(result.version).toBeGreaterThan(before.version);
  });

  it('skipped is DISTINCT from idle — isPhaseResolved(skipped) is true, isPhaseResolved(idle) is false (AC-07)', () => {
    // The key invariant: a prerequisite check resolves `skipped` but not `idle`
    expect(isPhaseResolved('skipped')).toBe(true);
    expect(isPhaseResolved('idle')).toBe(false);
  });

  it('skipped phase remains re-triggerable (canTransition skipped→running === true) (AC-07)', () => {
    expect(canTransition('skipped', 'running')).toBe(true);
  });

  it('skipped phase satisfies downstream prerequisite check (AC-07)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await arrangeAwaitingReview(draftId);

    await skipPhase({ draftId, userId: OWNER_ID, phase: 'reference_data' });

    const after = (await getPipelineByDraftId(draftId))!;
    // The downstream phase (reference_image) should be unblocked by a skipped reference_data
    expect(isPhaseResolved(after.referenceDataStatus)).toBe(true);
  });

  it('idle phase does NOT satisfy the same prerequisite check (AC-07 — distinct from idle)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });
    const row = (await getPipelineByDraftId(draftId))!;
    // reference_data starts as idle — must NOT be resolved
    expect(isPhaseResolved(row.referenceDataStatus)).toBe(false);
  });

  // ── Review fix G4 — skip precondition (contract pipeline.not_awaiting_review) ──

  it('REJECTS skip on a never-run (idle) phase — does NOT mark it skipped (AC-07 contract)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId });
    // reference_data is `idle` (never run) — skipping it would corrupt the AC-08
    // skipped≠idle distinction, so the contract requires a 422 reject.
    await expect(
      skipPhase({ draftId, userId: OWNER_ID, phase: 'reference_data' }),
    ).rejects.toMatchObject({ code: 'pipeline.not_awaiting_review' });

    const after = (await getPipelineByDraftId(draftId))!;
    expect(after.referenceDataStatus).toBe('idle'); // unchanged
  });

  it('REJECTS skip on a running phase (contract pipeline.not_awaiting_review)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await insertPipelineRow({ draftId, sceneStatus: 'running' });
    const row = (await getPipelineByDraftId(draftId))!;
    expect(row.sceneStatus).toBe('running');

    await expect(
      skipPhase({ draftId, userId: OWNER_ID, phase: 'scene' }),
    ).rejects.toMatchObject({ code: 'pipeline.not_awaiting_review' });

    const after = (await getPipelineByDraftId(draftId))!;
    expect(after.sceneStatus).toBe('running'); // unchanged
  });
});
