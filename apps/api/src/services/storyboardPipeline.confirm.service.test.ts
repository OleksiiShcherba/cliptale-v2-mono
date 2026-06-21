/**
 * T6 — storyboardPipeline.confirm.service INTEGRATION test
 *
 * ACs under test (spec §5):
 *   AC-03 (US-03) — confirm re-validates the estimate server-side, creates the
 *                   reference blocks, claims the reference_image run, enqueues.
 *   AC-09 (US-03) — every created reference block is ordered BELOW all music
 *                   blocks (sort_order > MAX(music.sort_order)) — creation-time snapshot.
 *   AC-14 (US-07) — a REPEATED confirm (double-confirm / second tab) returns the
 *                   EXISTING run and creates ZERO additional reference blocks.
 *   AC-13 (US-03) — a non-owner is denied (NotFoundError) before any write.
 *
 * AC-10 + MAIN ADJ tests live in storyboardPipeline.confirm.sceneLinks.test.ts.
 *
 * Level: integration (real MySQL, real Redis, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardPipeline.confirm.service.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env bootstrap — must precede any app-module import ─────────────────────────
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
  APP_JWT_SECRET:           'sgp-t6-confirm-integ-test-secret-32c!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
// BullMQ Queue.add must not hit a real worker — stub it, let Redis stay real.
// vi.hoisted so the const is initialized before the hoisted vi.mock factory runs.
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

// Pin the per-reference cost so the estimate is deterministic for the
// revalidation assertions (independent of whatever flow_model_pricing holds).
vi.mock('@/repositories/flow-model-pricing.repository.js', () => ({
  getPricingForModel: vi.fn().mockResolvedValue({
    modelId: 'openai/gpt-image-2',
    currency: 'USD',
    baseAmount: 0.04,
    perSecond: null,
    perImage: 0.05,
    resolutionMult: null,
  }),
}));

import { confirmCast } from './storyboardPipeline.confirm.service.js';
import { EstimateRevalidationFailedError } from './storyboardPipeline.cost.service.js';
import { NotFoundError } from '@/lib/errors.js';
import { getPipelineByDraftId } from '@/repositories/storyboardPipeline.repository.js';
import { listReferenceBlocksByDraftId } from '@/repositories/storyboardReference.repository.js';
import {
  seedDraft,
  seedSceneAndMusic,
  seedCastProposal,
  countReferenceBlocks,
  maxMusicSort,
  arrangeAwaitingReview,
} from './storyboardPipeline.confirm.fixtures.js';

// ── Shared connection + tracked ids ────────────────────────────────────────────
let conn: Connection;

const PREFIX = 'sgp-t6';
const OWNER_ID = `${PREFIX}-owner-${randomUUID().slice(0, 8)}`;
const trackedDraftIds: string[] = [];

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
    [OWNER_ID, `${OWNER_ID}@example.test`, 'Test Creator'],
  );
});

afterAll(async () => {
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_reference_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_music_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  await conn.query(`DELETE FROM ai_generation_jobs WHERE user_id = ?`, [OWNER_ID]);
  await conn.query(`DELETE FROM generation_flows WHERE user_id = ?`, [OWNER_ID]);
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [OWNER_ID]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

beforeEach(() => {
  mockQueueAdd.mockClear();
});

describe('confirmCast — references below music + idempotent run claim', () => {
  it('AC-03/AC-09: first confirm creates reference blocks below music, claims run, enqueues', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [5, 10]); // max music sort_order = 10
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'environment', name: 'Forest' },
    ]);
    // Estimate: 2 refs × 0.05 = "0.1000"
    await arrangeAwaitingReview(draftId, '0.1000');

    const result = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    expect(result.activeRunPhase).toBe('reference_image');
    expect(result.referenceImageStatus).toBe('running');
    // Live-flow regression: confirming the cast resolves the reference_data
    // review to 'completed' in the same CAS (AC-03/AC-04).
    expect(result.referenceDataStatus).toBe('completed');
    expect(await countReferenceBlocks(conn, draftId)).toBe(2);

    // AC-09: every reference block sort_order is BELOW every music sort_order.
    const maxMusic = await maxMusicSort(conn, draftId);
    const refBlocks = await listReferenceBlocksByDraftId({ draftId, userId: OWNER_ID });
    expect(refBlocks).toHaveLength(2);
    for (const b of refBlocks) {
      expect(b.sortOrder).toBeGreaterThan(maxMusic);
      // Live-flow regression: each block MUST be claimed to 'running' so the
      // worker completion hook (WHERE window_status='running') can advance it.
      expect(b.windowStatus).toBe('running');
    }

    expect(mockQueueAdd).toHaveBeenCalled();
  });

  it('AC-14: a repeated confirm returns the existing run and creates ZERO additional blocks', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [3]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'character', name: 'Sidekick' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });
    const countAfterFirst = await countReferenceBlocks(conn, draftId);
    expect(countAfterFirst).toBe(2);
    mockQueueAdd.mockClear();

    const second = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    expect(await countReferenceBlocks(conn, draftId)).toBe(countAfterFirst);
    expect(second.activeRunPhase).toBe('reference_image');
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('AC-03: a tampered client estimate is rejected and no blocks are created', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [2]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [{ type: 'character', name: 'Hero' }]);
    // True estimate: 1 ref × 0.05 = "0.0500"
    await arrangeAwaitingReview(draftId, '0.0500');

    await expect(
      confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0100' }),
    ).rejects.toBeInstanceOf(EstimateRevalidationFailedError);

    expect(await countReferenceBlocks(conn, draftId)).toBe(0);
    const row = await getPipelineByDraftId(draftId);
    expect(row!.activeRunPhase).toBeNull();
  });

  it('AC-03: confirm with NO client estimate (confirm-as-shown) succeeds against the server estimate', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [2]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'character', name: 'Sidekick' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    const result = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: null });

    expect(await countReferenceBlocks(conn, draftId)).toBe(2);
    expect(result.activeRunPhase).toBe('reference_image');
  });

  it('AC-14: concurrent double-confirm (Promise.all) creates exactly ONE block set', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [3]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'character', name: 'Sidekick' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    const [a, b] = await Promise.all([
      confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' }),
      confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' }),
    ]);

    expect(await countReferenceBlocks(conn, draftId)).toBe(2);
    expect(a.activeRunPhase).toBe('reference_image');
    expect(b.activeRunPhase).toBe('reference_image');
  });

  it('AC-13: a non-owner is denied (NotFoundError) and creates nothing', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [1]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [{ type: 'character', name: 'Hero' }]);
    await arrangeAwaitingReview(draftId, '0.0500');

    await expect(
      confirmCast({ draftId, userId: 'sgp-t6-not-the-owner', clientEstimate: '0.0500' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await countReferenceBlocks(conn, draftId)).toBe(0);
  });
});
