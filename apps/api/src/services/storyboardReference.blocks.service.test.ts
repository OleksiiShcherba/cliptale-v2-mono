/**
 * T8 — storyboardReference.blocks.service INTEGRATION test
 *
 * ACs under test:
 *   AC-04 (US-02) — failed first generation shows per-block failed status with
 *                   retry; retry on done/pending → rejected.
 *   AC-10 (US-05) — saveSceneLinks: replace-set under CAS on block version.
 *   AC-10b (US-05) — scene deletion auto-prunes links (cascade); new scene gets
 *                    no links; reorder changes nothing.
 *   AC-11 (US-07) — manually adding a block creates an empty linked flow, no
 *                   generation, no charge; 13th manual block is allowed (cast
 *                   size limit does not cap manual additions).
 *   AC-13 (US-03) — every operation denies a non-owner without revealing contents.
 *   AC-14 (US-08) — deleting a block leaves the flow + results intact; scene
 *                   links and the block are removed; block no longer counts in
 *                   the star gate.
 *
 * Level: integration (real MySQL, real Redis conn, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardReference.blocks.service.test.ts
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

// ── Env setup — must precede any app-module import ────────────────────────────
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
  APP_JWT_SECRET:           'srf-T8-blocks-integ-test-secret!!!!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Stub BullMQ Queue.add — no real worker needed, no charge issued.
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'mock-bullmq-job' });
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

// Stub realtime publisher (ws side effects).
vi.mock('@/lib/realtimePublisher.js', () => ({
  publishAiJobUpdatedById: vi.fn().mockResolvedValue(undefined),
}));

// ── Shared DB connection ───────────────────────────────────────────────────────
let conn: Connection;

const RUN = randomUUID().slice(0, 8);
const OWNER_ID = `srf-T8-owner-${RUN}`;
const OTHER_ID = `srf-T8-other-${RUN}`;

// Per-test-run cleanup registries.
const cleanupDraftIds: string[] = [];
const cleanupFlowIds:  string[] = [];
const cleanupFileIds:  string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  for (const id of [OWNER_ID, OTHER_ID]) {
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
      [id, `${id}@example.test`, 'hash'],
    );
  }
});

afterAll(async () => {
  // Scoped cleanup — reverse FK order.
  // storyboard_reference_scene_links + storyboard_reference_stars cascade from blocks.
  // storyboard_reference_blocks cascade from generation_drafts.
  if (cleanupDraftIds.length) {
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${cleanupDraftIds.map(() => '?').join(',')})`,
      cleanupDraftIds,
    );
  }
  if (cleanupFlowIds.length) {
    await conn.query(
      `DELETE FROM generation_flows WHERE flow_id IN (${cleanupFlowIds.map(() => '?').join(',')})`,
      cleanupFlowIds,
    );
  }
  if (cleanupFileIds.length) {
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${cleanupFileIds.map(() => '?').join(',')})`,
      cleanupFileIds,
    );
  }
  for (const id of [OWNER_ID, OTHER_ID]) {
    await conn.execute('DELETE FROM users WHERE user_id = ?', [id]);
  }
  await conn.end();
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Insert a minimal generation_drafts row; returns its id. */
async function seedDraft(userId: string): Promise<string> {
  const id = randomUUID();
  cleanupDraftIds.push(id);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [id, userId, JSON.stringify({ version: 1, content: [] })],
  );
  return id;
}

/**
 * Insert a reference block row directly (bypassing service).
 * data-model.md §Test fixtures: createReferenceBlock.
 */
async function seedReferenceBlock(params: {
  draftId: string;
  flowId?: string | null;
  castType?: 'character' | 'environment';
  name?: string;
  sortOrder?: number;
  windowStatus?: 'pending' | 'running' | 'done' | 'failed' | null;
  version?: number;
}): Promise<string> {
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, sort_order,
        position_x, position_y, window_status, version)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [
      id,
      params.draftId,
      params.flowId ?? null,
      params.castType ?? 'character',
      params.name ?? 'Test Character',
      params.sortOrder ?? 0,
      params.windowStatus ?? null,
      params.version ?? 1,
    ],
  );
  return id;
}

/** Insert a scene (storyboard_blocks row with block_type='scene'). */
async function seedSceneBlock(draftId: string): Promise<string> {
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s,
        position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', 'Test Scene', 'A test scene.', 6, 100, 200, 1, NULL)`,
    [id, draftId],
  );
  return id;
}

/** Insert a minimal file row (for star tests). */
async function seedFile(userId: string): Promise<string> {
  const id = randomUUID();
  cleanupFileIds.push(id);
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'test-ref.png', 'ready')`,
    [id, userId, `s3://test-bucket/${id}.png`],
  );
  return id;
}

/** Insert a scene link pivot row directly. */
async function seedSceneLink(referenceBlockId: string, sceneBlockId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [referenceBlockId, sceneBlockId],
  );
}

// ── Lazy service import ───────────────────────────────────────────────────────

async function svc() {
  return import('@/services/storyboardReference.blocks.service.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 — manual add: empty linked flow, no run, no charge; 13th block allowed
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-11 / createBlock — manual add', () => {
  it('creates a reference block with an empty linked flow, window_status=null, and no job enqueued', async () => {
    const { createBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    mockQueueAdd.mockClear();

    const block = await createBlock({
      draftId,
      userId: OWNER_ID,
      castType: 'character',
      name: 'Test Character',
      description: 'A manually added test character.',
    });

    // Block row exists and has a linked flow.
    expect(block.flowId).toBeTruthy();
    cleanupFlowIds.push(block.flowId!);

    // windowStatus must be null — manual blocks are never auto-dispatched.
    expect(block.windowStatus).toBeNull();

    // No job was enqueued (AC-11: no generation, no charge).
    expect(mockQueueAdd).not.toHaveBeenCalled();

    // DB: block exists.
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, flow_id, window_status, version FROM storyboard_reference_blocks
        WHERE id = ?`,
      [block.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['window_status']).toBeNull();
    expect(rows[0]!['version']).toBe(1);

    // DB: the linked flow exists in generation_flows.
    const [flowRows] = await conn.execute<RowDataPacket[]>(
      `SELECT flow_id FROM generation_flows WHERE flow_id = ?`,
      [block.flowId],
    );
    expect(flowRows).toHaveLength(1);
  });

  it('13th manual block is allowed — cast size limit (12) does not cap manual additions', async () => {
    const { createBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);

    // Seed 12 existing blocks (simulating a confirmed cast of 12).
    for (let i = 0; i < 12; i++) {
      const blockId = await seedReferenceBlock({ draftId, sortOrder: i });
      // We don't need flow cleanup here; blocks cascade from draft.
      void blockId;
    }

    // 13th create must succeed.
    const block = await createBlock({
      draftId,
      userId: OWNER_ID,
      castType: 'environment',
      name: 'Test Environment',
    });

    expect(block.id).toBeTruthy();
    cleanupFlowIds.push(block.flowId!);

    // Block is in DB.
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE id = ?`,
      [block.id],
    );
    expect(rows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-13 — authorization: non-owner denied without revealing contents
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-13 / authorization — non-owner denied on every operation', () => {
  it('createBlock: non-owner → NotFoundError (draft existence hidden)', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { createBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);

    await expect(
      createBlock({ draftId, userId: OTHER_ID, castType: 'character', name: 'Test Character' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('deleteBlock: non-owner → NotFoundError (block existence hidden)', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { deleteBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId });

    await expect(
      deleteBlock({ blockId, draftId, userId: OTHER_ID }),
    ).rejects.toThrow(NotFoundError);
  });

  it('retryBlock: non-owner → NotFoundError (block existence hidden)', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { retryBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, windowStatus: 'failed' });

    await expect(
      retryBlock({ blockId, draftId, userId: OTHER_ID }),
    ).rejects.toThrow(NotFoundError);
  });

  it('saveSceneLinks: non-owner → NotFoundError (block existence hidden)', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { saveSceneLinks } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, version: 1 });

    await expect(
      saveSceneLinks({ blockId, draftId, userId: OTHER_ID, sceneBlockIds: [], version: 1 }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-14 — delete block: flow + results survive; links removed; gate excluded
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-14 / deleteBlock — flow survives; links and stars gone', () => {
  it('deletes the block and its scene links; the linked flow and file remain intact', async () => {
    const { deleteBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);

    // Create a flow to link the block to.
    const flowId = randomUUID();
    cleanupFlowIds.push(flowId);
    await conn.execute(
      `INSERT INTO generation_flows (flow_id, user_id, title, canvas, version)
       VALUES (?, ?, 'Test Reference Flow', '{"blocks":[],"edges":[]}', 1)`,
      [flowId, OWNER_ID],
    );

    // Create a file (simulates a result) and link it via flow_files.
    const fileId = await seedFile(OWNER_ID);
    await conn.execute(
      `INSERT INTO flow_files (flow_id, file_id) VALUES (?, ?)`,
      [flowId, fileId],
    );

    // Create block linked to the flow.
    const blockId = await seedReferenceBlock({ draftId, flowId, windowStatus: null });

    // Add scene link to block.
    const sceneId = await seedSceneBlock(draftId);
    await seedSceneLink(blockId, sceneId);

    // Add a star on the block.
    const starFileId = await seedFile(OWNER_ID);
    await conn.execute(
      `INSERT INTO storyboard_reference_stars (id, reference_block_id, file_id, is_primary)
       VALUES (?, ?, ?, 1)`,
      [randomUUID(), blockId, starFileId],
    );

    // Delete the block.
    await deleteBlock({ blockId, draftId, userId: OWNER_ID });

    // Block is gone.
    const [blockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(blockRows).toHaveLength(0);

    // Scene links for this block are gone (either cascaded or removed by service).
    const [linkRows] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM storyboard_reference_scene_links WHERE reference_block_id = ?`,
      [blockId],
    );
    expect(linkRows).toHaveLength(0);

    // Stars for this block are gone (cascaded from block deletion).
    const [starRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_stars WHERE reference_block_id = ?`,
      [blockId],
    );
    expect(starRows).toHaveLength(0);

    // The flow still exists (not deleted) — AC-14.
    const [flowRows] = await conn.execute<RowDataPacket[]>(
      `SELECT flow_id, deleted_at FROM generation_flows WHERE flow_id = ?`,
      [flowId],
    );
    expect(flowRows).toHaveLength(1);
    expect(flowRows[0]!['deleted_at']).toBeNull();

    // The flow's file (result) still exists — AC-14.
    const [fileRows] = await conn.execute<RowDataPacket[]>(
      `SELECT file_id FROM files WHERE file_id = ?`,
      [fileId],
    );
    expect(fileRows).toHaveLength(1);

    // The block↔flow link is severed: flow_id on the (now-deleted) block was the ONLY
    // pointer; confirm the flow has no linking block (badge removal — derived, ADR-0010).
    const [linkedBlockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE flow_id = ?`,
      [flowId],
    );
    expect(linkedBlockRows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04 — retry: failed → new job; done/pending → rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-04 / retryBlock — failed → pending + new job; done/pending → rejected', () => {
  it('retrying a failed block sets window_status=pending and enqueues a job', async () => {
    const { retryBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const flowId = randomUUID();
    cleanupFlowIds.push(flowId);
    await conn.execute(
      `INSERT INTO generation_flows (flow_id, user_id, title, canvas, version)
       VALUES (?, ?, 'Retry flow', '{"blocks":[],"edges":[]}', 1)`,
      [flowId, OWNER_ID],
    );

    const blockId = await seedReferenceBlock({
      draftId,
      flowId,
      windowStatus: 'failed',
    });

    mockQueueAdd.mockClear();

    const result = await retryBlock({ blockId, draftId, userId: OWNER_ID });

    // Returns the block with windowStatus = 'pending'.
    expect(result.windowStatus).toBe('pending');

    // DB: window_status now 'pending'.
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(rows[0]!['window_status']).toBe('pending');

    // A job was enqueued.
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('retrying a block whose window_status is done → ConflictError (not failed)', async () => {
    const { ConflictError } = await import('@/lib/errors.js');
    const { retryBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, windowStatus: 'done' });

    await expect(
      retryBlock({ blockId, draftId, userId: OWNER_ID }),
    ).rejects.toThrow(ConflictError);
  });

  it('retrying a block whose window_status is pending → ConflictError (not failed)', async () => {
    const { ConflictError } = await import('@/lib/errors.js');
    const { retryBlock } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, windowStatus: 'pending' });

    await expect(
      retryBlock({ blockId, draftId, userId: OWNER_ID }),
    ).rejects.toThrow(ConflictError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 — saveSceneLinks: versioned replace-set (CAS); 409 on stale version
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-10 / saveSceneLinks — versioned replace-set', () => {
  it('happy path: replaces scene links and increments block version', async () => {
    const { saveSceneLinks } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, version: 1 });

    const sceneId = await seedSceneBlock(draftId);

    const result = await saveSceneLinks({
      blockId,
      draftId,
      userId: OWNER_ID,
      sceneBlockIds: [sceneId],
      version: 1,
    });

    // Returns the saved list + incremented version.
    expect(result.sceneBlockIds).toContain(sceneId);
    expect(result.version).toBe(2);

    // DB: block version is now 2.
    const [blockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT version FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(blockRows[0]!['version']).toBe(2);

    // DB: link row exists.
    const [linkRows] = await conn.execute<RowDataPacket[]>(
      `SELECT scene_block_id FROM storyboard_reference_scene_links
        WHERE reference_block_id = ?`,
      [blockId],
    );
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0]!['scene_block_id']).toBe(sceneId);
  });

  it('stale version → ConflictError (409 on the second concurrent save)', async () => {
    const { ConflictError } = await import('@/lib/errors.js');
    const { saveSceneLinks } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, version: 1 });
    const sceneId = await seedSceneBlock(draftId);

    // First save succeeds; block version becomes 2.
    await saveSceneLinks({
      blockId,
      draftId,
      userId: OWNER_ID,
      sceneBlockIds: [sceneId],
      version: 1,
    });

    // Second save with the old version=1 → ConflictError (version_conflict).
    await expect(
      saveSceneLinks({
        blockId,
        draftId,
        userId: OWNER_ID,
        sceneBlockIds: [],
        version: 1,
      }),
    ).rejects.toThrow(ConflictError);

    // The first edit's link survives — nothing silently lost.
    const [linkRows] = await conn.execute<RowDataPacket[]>(
      `SELECT scene_block_id FROM storyboard_reference_scene_links
        WHERE reference_block_id = ?`,
      [blockId],
    );
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0]!['scene_block_id']).toBe(sceneId);
  });

  it('two concurrent saves — exactly one succeeds and one gets a ConflictError', async () => {
    const { ConflictError } = await import('@/lib/errors.js');
    const { saveSceneLinks } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId, version: 1 });
    const scene1Id = await seedSceneBlock(draftId);
    const scene2Id = await seedSceneBlock(draftId);

    // Fire both saves concurrently with the same version.
    const [result1, result2] = await Promise.allSettled([
      saveSceneLinks({
        blockId,
        draftId,
        userId: OWNER_ID,
        sceneBlockIds: [scene1Id],
        version: 1,
      }),
      saveSceneLinks({
        blockId,
        draftId,
        userId: OWNER_ID,
        sceneBlockIds: [scene2Id],
        version: 1,
      }),
    ]);

    const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
    const conflicts = [result1, result2].filter((r) => r.status === 'rejected');

    // Exactly one succeeds.
    expect(successes).toHaveLength(1);
    // Exactly one is a ConflictError (version_conflict).
    expect(conflicts).toHaveLength(1);
    const err = (conflicts[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ConflictError);

    // DB: final version is 2 (exactly one increment).
    const [blockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT version FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(blockRows[0]!['version']).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10b — scene lifecycle: delete prunes links; new scene gets no links;
//           reorder changes nothing
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-10b / scene lifecycle effects on scene links', () => {
  it('deleting a scene automatically removes its link from every reference block', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId });
    const sceneId = await seedSceneBlock(draftId);
    await seedSceneLink(blockId, sceneId);

    // Confirm the link is there before deletion.
    const [before] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM storyboard_reference_scene_links
        WHERE reference_block_id = ? AND scene_block_id = ?`,
      [blockId, sceneId],
    );
    expect(before).toHaveLength(1);

    // Delete the scene — FK ON DELETE CASCADE should remove the link.
    await conn.execute(`DELETE FROM storyboard_blocks WHERE id = ?`, [sceneId]);

    const [after] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM storyboard_reference_scene_links
        WHERE reference_block_id = ? AND scene_block_id = ?`,
      [blockId, sceneId],
    );
    expect(after).toHaveLength(0);
  });

  it('a newly added scene receives no links automatically', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const blockId = await seedReferenceBlock({ draftId });

    // Add a scene — no service action, just direct insert (simulating scene creation).
    const newSceneId = await seedSceneBlock(draftId);

    // No link should exist to the new scene.
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM storyboard_reference_scene_links
        WHERE reference_block_id = ? AND scene_block_id = ?`,
      [blockId, newSceneId],
    );
    expect(rows).toHaveLength(0);

    // Cleanup scene.
    await conn.execute(`DELETE FROM storyboard_blocks WHERE id = ?`, [newSceneId]);
  });
});
