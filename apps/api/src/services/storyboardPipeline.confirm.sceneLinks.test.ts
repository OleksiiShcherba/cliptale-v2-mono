/**
 * T6 — storyboardPipeline.confirm.service AC-10 + MAIN ADJ integration tests
 *
 * ACs under test:
 *   AC-10 — confirmCast creates storyboard_reference_scene_links from proposal
 *            scene_block_ids; idempotency guard prevents duplicates.
 *   MAIN ADJ — each reference block has a linked generation_flow (base canvas +
 *               ai_generation_jobs with flow_id + block_id).
 *   AC-10/edge — entry with empty scene_block_ids → block created, zero links, no throw.
 *   AC-10/error — stale scene id skipped; valid ids still linked.
 *
 * Level: integration (real MySQL, real Redis, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardPipeline.confirm.sceneLinks.test.ts
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
  APP_JWT_SECRET:           'sgp-t6-sl-confirm-integ-test-secret!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
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
import { listReferenceBlocksByDraftId } from '@/repositories/storyboardReference.repository.js';
import {
  makeId,
  seedDraft,
  seedSceneAndMusic,
  seedCastProposal,
  countReferenceBlocks,
  countReferenceSceneLinks,
  getReferenceBlockIdsByDraftId,
  getSceneLinksForDraft,
  arrangeAwaitingReview,
} from './storyboardPipeline.confirm.fixtures.js';

// ── Shared connection + tracked ids ───────────────────────────────────────────
let conn: Connection;

const PREFIX = 'sgp-t6-sl';
const OWNER_ID = `${PREFIX}-owner-${randomUUID().slice(0, 8)}`;
const trackedDraftIds: string[] = [];

function newId(tag: string): string {
  return makeId(PREFIX, tag);
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
    [OWNER_ID, `${OWNER_ID}@example.test`, 'Test Creator SL'],
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

describe('confirmCast — AC-10 scene links + MAIN ADJ base flows', () => {
  it('AC-10: confirmCast creates storyboard_reference_scene_links from proposal scene_block_ids', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    const { sceneA, sceneB } = await seedSceneAndMusic(conn, PREFIX, draftId, [4]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character',    name: 'Hero',   scene_block_ids: [sceneA, sceneB] },
      { type: 'environment',  name: 'Forest', scene_block_ids: [sceneB] },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    const refBlockIds = await getReferenceBlockIdsByDraftId(conn, draftId);
    expect(refBlockIds).toHaveLength(2);
    const [heroBlockId, forestBlockId] = refBlockIds as [string, string];

    expect(await countReferenceSceneLinks(conn, heroBlockId!)).toBe(2);
    expect(await countReferenceSceneLinks(conn, forestBlockId!)).toBe(1);

    const links = await getSceneLinksForDraft(conn, draftId);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.scene_block_id).sort()).toEqual(
      [sceneA, sceneB, sceneB].sort(),
    );
  });

  it('AC-10/AC-14: repeated confirm does NOT duplicate reference→scene links', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    const { sceneA } = await seedSceneAndMusic(conn, PREFIX, draftId, [2]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Hero', scene_block_ids: [sceneA] },
    ]);
    await arrangeAwaitingReview(draftId, '0.0500');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });
    expect(await getSceneLinksForDraft(conn, draftId)).toHaveLength(1);

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });
    expect(await getSceneLinksForDraft(conn, draftId)).toHaveLength(1); // unchanged
  });

  it('AC-10/edge: entry with empty scene_block_ids → block created, zero links, no throw', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [1]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Nameless', scene_block_ids: [] },
    ]);
    await arrangeAwaitingReview(draftId, '0.0500');

    const result = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });

    expect(await countReferenceBlocks(conn, draftId)).toBe(1);
    expect(await getSceneLinksForDraft(conn, draftId)).toHaveLength(0);
    expect(result.activeRunPhase).toBe('reference_image');
  });

  it('AC-10/error: non-existent scene id in proposal is skipped; valid ids still linked', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    const { sceneA } = await seedSceneAndMusic(conn, PREFIX, draftId, [2]);
    const nonExistentId = newId('ghost-scene');

    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Ghost', scene_block_ids: [sceneA, nonExistentId] },
    ]);
    await arrangeAwaitingReview(draftId, '0.0500');

    const result = await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });

    expect(await countReferenceBlocks(conn, draftId)).toBe(1);
    const links = await getSceneLinksForDraft(conn, draftId);
    expect(links).toHaveLength(1);
    expect(links[0]!.scene_block_id).toBe(sceneA);
    expect(result.activeRunPhase).toBe('reference_image');
  });

  it('MAIN ADJ: each reference block has a non-null flow_id pointing to a pre-seeded flow', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [2]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character',   name: 'Hero',   description: 'A brave hero' },
      { type: 'environment', name: 'Forest', description: 'Dense forest' },
    ]);
    await arrangeAwaitingReview(draftId, '0.1000');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.1000' });

    const refBlocks = await listReferenceBlocksByDraftId({ draftId, userId: OWNER_ID });
    expect(refBlocks).toHaveLength(2);

    for (const block of refBlocks) {
      expect(block.flowId).toBeTruthy();
      const [flowRows] = await conn.execute<RowDataPacket[]>(
        `SELECT flow_id, canvas FROM generation_flows WHERE flow_id = ? AND user_id = ?`,
        [block.flowId, OWNER_ID],
      );
      expect(flowRows).toHaveLength(1);
      const rawCanvas = (flowRows[0] as { canvas: string | object }).canvas;
      const canvas = typeof rawCanvas === 'string' ? JSON.parse(rawCanvas) : rawCanvas;
      const blocks: Array<{ type?: string }> = (canvas as { blocks?: Array<{ type?: string }> }).blocks ?? [];
      expect(blocks.some((b) => b.type === 'generation')).toBe(true);
    }
  });

  it('MAIN ADJ: ai_generation_jobs created by confirmCast carry flow_id + block_id', async () => {
    const draftId = await seedDraft(conn, PREFIX, OWNER_ID, trackedDraftIds);
    await seedSceneAndMusic(conn, PREFIX, draftId, [0]);
    await seedCastProposal(conn, PREFIX, draftId, OWNER_ID, [
      { type: 'character', name: 'Villain', description: 'The main antagonist' },
    ]);
    await arrangeAwaitingReview(draftId, '0.0500');

    await confirmCast({ draftId, userId: OWNER_ID, clientEstimate: '0.0500' });

    const refBlocks = await listReferenceBlocksByDraftId({ draftId, userId: OWNER_ID });
    expect(refBlocks).toHaveLength(1);
    const block = refBlocks[0]!;
    expect(block.firstJobId).toBeTruthy();
    expect(block.flowId).toBeTruthy();

    const [jobRows] = await conn.execute<RowDataPacket[]>(
      `SELECT job_id, flow_id, block_id FROM ai_generation_jobs WHERE job_id = ?`,
      [block.firstJobId],
    );
    expect(jobRows).toHaveLength(1);
    const job = jobRows[0] as { job_id: string; flow_id: string | null; block_id: string | null };
    expect(job.flow_id).toBe(block.flowId);
    expect(job.block_id).toBeTruthy();
  });
});
