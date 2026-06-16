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
 *
 * Level: integration (real MySQL, real Redis, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardPipeline.confirm.service.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

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
import {
  getPipelineByDraftId,
  insertPipelineRow,
  casUpdateState,
} from '@/repositories/storyboardPipeline.repository.js';
import { listReferenceBlocksByDraftId } from '@/repositories/storyboardReference.repository.js';

// ── Shared connection + tracked ids ────────────────────────────────────────────
let conn: Connection;

const PREFIX = 'sgp-t6';
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

/** Seed scene blocks + music blocks (music spans two scenes, with sort_order). */
async function seedSceneAndMusic(
  draftId: string,
  musicSortOrders: number[],
): Promise<{ sceneA: string; sceneB: string }> {
  const sceneA = newId('scene');
  const sceneB = newId('scene');
  await conn.execute(
    `INSERT INTO storyboard_blocks (id, draft_id, block_type, name, sort_order)
     VALUES (?, ?, 'scene', 'Scene A', 0), (?, ?, 'scene', 'Scene B', 1)`,
    [sceneA, draftId, sceneB, draftId],
  );
  for (let i = 0; i < musicSortOrders.length; i++) {
    await conn.execute(
      `INSERT INTO storyboard_music_blocks
         (id, draft_id, name, source_mode, prompt, start_scene_block_id, end_scene_block_id,
          position_x, position_y, sort_order, volume, fade_in_s, fade_out_s, loop_mode)
       VALUES (?, ?, ?, 'generate_now', 'a tune', ?, ?, 0, 0, ?, 1.0, 0, 0, 'loop')`,
      [newId('music'), draftId, `Music ${i}`, sceneA, sceneB, musicSortOrders[i]],
    );
  }
  return { sceneA, sceneB };
}

/** Seed a completed cast-extraction proposal (the cast confirmCast turns into blocks). */
async function seedCastProposal(
  draftId: string,
  userId: string,
  cast: Array<{ type: 'character' | 'environment'; name: string; description?: string; scene_block_ids?: string[] }>,
): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status, proposal_json, completed_at)
     VALUES (?, ?, ?, 'completed', ?, NOW(3))`,
    [
      newId('cast'),
      draftId,
      userId,
      JSON.stringify({
        cast: cast.map((c) => ({
          type: c.type,
          name: c.name,
          description: c.description ?? '',
          scene_block_ids: c.scene_block_ids ?? [],
        })),
      }),
    ],
  );
}

async function countReferenceSceneLinks(referenceBlockId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_scene_links WHERE reference_block_id = ?`,
    [referenceBlockId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

async function getReferenceBlockIdsByDraftId(draftId: string): Promise<string[]> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM storyboard_reference_blocks WHERE draft_id = ? ORDER BY sort_order`,
    [draftId],
  );
  return (rows as Array<{ id: string }>).map((r) => r.id);
}

async function getSceneLinksForDraft(draftId: string): Promise<Array<{ reference_block_id: string; scene_block_id: string }>> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT srsl.reference_block_id, srsl.scene_block_id
       FROM storyboard_reference_scene_links srsl
       JOIN storyboard_reference_blocks srb ON srb.id = srsl.reference_block_id
      WHERE srb.draft_id = ?
      ORDER BY srsl.reference_block_id, srsl.scene_block_id`,
    [draftId],
  );
  return rows as Array<{ reference_block_id: string; scene_block_id: string }>;
}

async function countReferenceBlocks(draftId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

async function maxMusicSort(draftId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM storyboard_music_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { m: number }).m);
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
    [OWNER_ID, `${OWNER_ID}@example.test`, 'Test Creator'],
  );
});

afterAll(async () => {
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    // FK-safe cleanup order: pipeline, reference blocks, music, scenes, cast jobs, drafts.
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_reference_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_music_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  // confirmCast inserts ai_generation_jobs rows (no draft_id) — clean by owner.
  await conn.query(`DELETE FROM ai_generation_jobs WHERE user_id = ?`, [OWNER_ID]);
  // confirmCast now creates generation_flows (linked to reference blocks) — clean by owner.
  await conn.query(`DELETE FROM generation_flows WHERE user_id = ?`, [OWNER_ID]);
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [OWNER_ID]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

beforeEach(() => {
  mockQueueAdd.mockClear();
});

/** Drive a draft to the awaiting_review point so confirm is the legal next step. */
async function arrangeAwaitingReview(
  draftId: string,
  estimate: string,
): Promise<void> {
  await insertPipelineRow({ draftId });
  // reference_data completed → awaiting_review; record the server estimate.
  const row = (await getPipelineByDraftId(draftId))!;
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'reference_data',
    phase: 'reference_data',
    status: 'completed',
    activeRunPhase: null,
    costEstimate: estimate,
  });
}

describe('confirmCast — references below music + idempotent run claim', () => {
  it('AC-03/AC-09: first confirm creates reference blocks below music, claims run, enqueues', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [5, 10]); // max music sort_order = 10
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'environment', name: 'Forest' },
    ]);
    // Estimate: 2 refs × 0.05 = "0.1000"
    await arrangeAwaitingReview(draftId, '0.1000');

    const result = await confirmCast({
      draftId,
      userId: OWNER_ID,
      clientEstimate: '0.1000',
    });

    // Run claimed.
    expect(result.activeRunPhase).toBe('reference_image');
    expect(result.referenceImageStatus).toBe('running');
    // Live-flow regression: confirming the cast resolves the reference_data
    // review to 'completed' in the same CAS. Without it reference_data stays
    // 'awaiting_review' and the scene_image order-guard later blocks the
    // offer-accept (AC-03/AC-04).
    expect(result.referenceDataStatus).toBe('completed');

    // Blocks created.
    expect(await countReferenceBlocks(draftId)).toBe(2);

    // AC-09: every reference block sort_order is BELOW every music sort_order.
    const maxMusic = await maxMusicSort(draftId);
    const refBlocks = await listReferenceBlocksByDraftId({ draftId, userId: OWNER_ID });
    expect(refBlocks).toHaveLength(2);
    for (const b of refBlocks) {
      expect(b.sortOrder).toBeGreaterThan(maxMusic);
      // Live-flow regression: each enqueued block MUST be claimed to 'running'.
      // The worker's rolling-window completion hook (onReferenceBlockJobComplete)
      // updates only WHERE window_status='running'; if confirm leaves the block
      // 'pending', the hook no-ops, the block never reaches terminal, and the
      // reaper eventually fails the whole reference_image phase (AC-03).
      expect(b.windowStatus).toBe('running');
    }

    // Enqueued at least one reference-image job.
    expect(mockQueueAdd).toHaveBeenCalled();
  });

  it('AC-14: a repeated confirm returns the existing run and creates ZERO additional blocks', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [3]);
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'character', name: 'Sidekick' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    // First confirm — creates the blocks + claims the run.
    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });
    const countAfterFirst = await countReferenceBlocks(draftId);
    expect(countAfterFirst).toBe(2);
    mockQueueAdd.mockClear();

    // Second confirm (double-confirm / second tab) — must NOT duplicate blocks.
    const second = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    expect(await countReferenceBlocks(draftId)).toBe(countAfterFirst); // unchanged
    expect(second.activeRunPhase).toBe('reference_image'); // existing run returned
    expect(mockQueueAdd).not.toHaveBeenCalled(); // no re-enqueue / no re-spend
  });

  it('AC-03: a tampered client estimate is rejected and no blocks are created', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [2]);
    await seedCastProposal(draftId, OWNER_ID, [{ type: 'character', name: 'Hero' }]);
    // True estimate: 1 ref × 0.05 = "0.0500"
    await arrangeAwaitingReview(draftId, '0.0500');

    await expect(
      confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0100' }),
    ).rejects.toBeInstanceOf(EstimateRevalidationFailedError);

    expect(await countReferenceBlocks(draftId)).toBe(0);
    const row = await getPipelineByDraftId(draftId);
    expect(row!.activeRunPhase).toBeNull(); // run not claimed
  });

  // ── Review fix G5 — no-body "confirm as shown" (openapi: cost_estimate optional) ──

  it('AC-03: confirm with NO client estimate (confirm-as-shown) succeeds against the server estimate', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [2]);
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'character', name: 'Sidekick' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    // No cost_estimate in the body → null reaches the service (the documented
    // "omit it to confirm the proposal exactly as shown" path). Must NOT 422.
    const result = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: null });

    expect(await countReferenceBlocks(draftId)).toBe(2); // blocks created
    expect(result.activeRunPhase).toBe('reference_image'); // run claimed
  });

  // ── Review fix MIN-4 — CONCURRENT double-confirm (the second-tab race) ──

  it('AC-14: concurrent double-confirm (Promise.all) creates exactly ONE block set', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [3]);
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character', name: 'Hero' },
      { type: 'character', name: 'Sidekick' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    // Fire two confirms simultaneously — the active_run_phase CAS must let only
    // one win; the loser converges to the existing run, no duplicate blocks.
    const [a, b] = await Promise.all([
      confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' }),
      confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' }),
    ]);

    expect(await countReferenceBlocks(draftId)).toBe(2); // exactly one set, not four
    expect(a.activeRunPhase).toBe('reference_image');
    expect(b.activeRunPhase).toBe('reference_image');
  });

  it('AC-10: confirmCast creates storyboard_reference_scene_links from proposal scene_block_ids', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const { sceneA, sceneB } = await seedSceneAndMusic(draftId, [4]);
    // Each cast entry carries the scene blocks it covers.
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character',    name: 'Hero',   scene_block_ids: [sceneA, sceneB] },
      { type: 'environment',  name: 'Forest', scene_block_ids: [sceneB] },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    // Two reference blocks must exist.
    const refBlockIds = await getReferenceBlockIdsByDraftId(draftId);
    expect(refBlockIds).toHaveLength(2);

    const [heroBlockId, forestBlockId] = refBlockIds as [string, string];

    // Hero → sceneA + sceneB (2 links).
    expect(await countReferenceSceneLinks(heroBlockId!)).toBe(2);
    // Forest → sceneB only (1 link).
    expect(await countReferenceSceneLinks(forestBlockId!)).toBe(1);

    // The full link set is correct.
    const links = await getSceneLinksForDraft(draftId);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.scene_block_id).sort()).toEqual(
      [sceneA, sceneB, sceneB].sort(),
    );
  });

  it('AC-10/AC-14: repeated confirm does NOT duplicate reference→scene links', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const { sceneA } = await seedSceneAndMusic(draftId, [2]);
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character', name: 'Hero', scene_block_ids: [sceneA] },
    ]);
    await arrangeAwaitingReview(draftId, '0.0500');

    // First confirm — creates the block + link.
    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });
    const linksAfterFirst = await getSceneLinksForDraft(draftId);
    expect(linksAfterFirst).toHaveLength(1);

    // Second confirm (idempotency) — must NOT add duplicate links.
    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });
    const linksAfterSecond = await getSceneLinksForDraft(draftId);
    expect(linksAfterSecond).toHaveLength(1); // unchanged
  });

  it('AC-13: a non-owner is denied (NotFoundError) and creates nothing', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [1]);
    await seedCastProposal(draftId, OWNER_ID, [{ type: 'character', name: 'Hero' }]);
    await arrangeAwaitingReview(draftId, '0.0500');

    await expect(
      confirmCast({ draftId, userId: 'sgp-t6-not-the-owner', clientEstimate: '0.0500' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await countReferenceBlocks(draftId)).toBe(0);
  });

  // ── MAIN ADJUSTMENT — each reference block must have a linked flow (base flow) ──

  it('MAIN ADJ: each reference block has a non-null flow_id pointing to a pre-seeded flow', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [2]);
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character',   name: 'Hero',   description: 'A brave hero' },
      { type: 'environment', name: 'Forest', description: 'Dense forest' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    const refBlocks = await listReferenceBlocksByDraftId({ draftId, userId: OWNER_ID });
    expect(refBlocks).toHaveLength(2);

    for (const block of refBlocks) {
      // Each block must link to a flow.
      expect(block.flowId).toBeTruthy();

      // The linked flow must exist in generation_flows.
      const [flowRows] = await conn.execute<RowDataPacket[]>(
        `SELECT flow_id, canvas FROM generation_flows WHERE flow_id = ? AND user_id = ?`,
        [block.flowId, OWNER_ID],
      );
      expect(flowRows).toHaveLength(1);

      // The flow canvas must contain a generation block (base-flow structure).
      const rawCanvas = (flowRows[0] as { canvas: string | object }).canvas;
      const canvas = typeof rawCanvas === 'string' ? JSON.parse(rawCanvas) : rawCanvas;
      const blocks: Array<{ type?: string }> = (canvas as { blocks?: Array<{ type?: string }> }).blocks ?? [];
      expect(blocks.some((b) => b.type === 'generation')).toBe(true);
    }
  });

  it('MAIN ADJ: ai_generation_jobs created by confirmCast carry flow_id + block_id', async () => {
    const draftId = await seedDraft(OWNER_ID);
    await seedSceneAndMusic(draftId, [0]);
    await seedCastProposal(draftId, OWNER_ID, [
      { type: 'character', name: 'Villain', description: 'The main antagonist' },
    ]);
    await arrangeAwaitingReview(draftId, '0.0500');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });

    // Fetch the reference block's first_job_id.
    const refBlocks = await listReferenceBlocksByDraftId({ draftId, userId: OWNER_ID });
    expect(refBlocks).toHaveLength(1);
    const block = refBlocks[0]!;
    expect(block.firstJobId).toBeTruthy();
    expect(block.flowId).toBeTruthy();

    // The ai_generation_jobs row must carry flow_id and block_id.
    const [jobRows] = await conn.execute<RowDataPacket[]>(
      `SELECT job_id, flow_id, block_id FROM ai_generation_jobs WHERE job_id = ?`,
      [block.firstJobId],
    );
    expect(jobRows).toHaveLength(1);
    const job = jobRows[0] as { job_id: string; flow_id: string | null; block_id: string | null };
    expect(job.flow_id).toBe(block.flowId);
    expect(job.block_id).toBeTruthy(); // the canvas generation block id
  });
});
