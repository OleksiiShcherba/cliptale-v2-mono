/**
 * T12 — generation-flow.service badge lifecycle INTEGRATION test
 *
 * ACs under test:
 *   AC-12 (US-08) — auto-created reference flows appear with a draft badge in the
 *                   flow list; deleting a linked flow without confirm=true raises a
 *                   409-style warning; confirmed delete leaves the block in no-flow
 *                   state (flow_id = NULL, FK ON DELETE SET NULL).
 *   AC-14b (US-08) — hard-deleting a draft (block cascade) leaves every linked flow
 *                    and its results intact in the flow list, with the badge removed
 *                    (because the block row is gone, ADR-0010: badge is derived).
 *
 * Level: integration (real MySQL, BullMQ Queue.add stubbed).
 *
 * ADR references:
 *   ADR-0010 — badge derived from block→flow link (JOIN on uq_storyboard_reference_blocks_flow),
 *              never stored on generation_flows.
 *   ADR-0006 — unlink-on-duplicate / re-validate-on-restore.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/generation-flow.service.srf-t12.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

// ── Env setup (must precede any app-module import) ────────────────────────────
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
  APP_JWT_SECRET:           'srf-T12-badge-integ-test-secret!!!!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job' }),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;

const RUN = randomUUID().slice(0, 8);
const OWNER_ID = `srf-T12-owner-${RUN}`;

// Per-run cleanup registries — scoped to this RUN prefix.
const cleanupDraftIds: string[] = [];
const cleanupFlowIds:  string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
    [OWNER_ID, `${OWNER_ID}@example.test`, 'hash'],
  );
});

afterAll(async () => {
  // Cleanup in FK-safe reverse order.
  // storyboard_reference_blocks cascade on draft DELETE, so draft cleanup covers blocks.
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
  await conn.execute('DELETE FROM users WHERE user_id = ?', [OWNER_ID]);
  await conn.end();
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Insert a minimal generation_drafts row (active, not deleted). */
async function seedDraft(userId: string): Promise<string> {
  const id = randomUUID();
  cleanupDraftIds.push(id);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [id, userId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
  return id;
}

/** Insert a generation_flows row for userId. Returns flowId. */
async function seedFlow(userId: string, title = 'Test Reference Flow'): Promise<string> {
  const flowId = randomUUID();
  cleanupFlowIds.push(flowId);
  await conn.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, ?, ?)`,
    [flowId, userId, title, JSON.stringify({ blocks: [], edges: [] })],
  );
  return flowId;
}

/**
 * Insert a reference block that links a draft to a flow (data-model.md §Test fixtures
 * createReferenceBlock). Block rows are cleaned up by the draft CASCADE delete.
 */
async function seedReferenceBlock(params: {
  draftId: string;
  flowId: string | null;
  name?: string;
}): Promise<string> {
  const blockId = randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, sort_order, position_x, position_y,
        window_status, version)
     VALUES (?, ?, ?, 'character', ?, 0, 0, 0, NULL, 1)`,
    [blockId, params.draftId, params.flowId, params.name ?? 'Test Character'],
  );
  return blockId;
}

// ── Lazy service import (after env + mocks are set up) ────────────────────────

async function svc() {
  return import('@/services/generation-flow.service.js');
}

// ─────────────────────────────────────────────────────────────────────────────

describe('generation-flow.service / AC-12 badge + delete-warning lifecycle (T12)', () => {
  // ── AC-12: listFlows shows draftBadge for linked flows, null for unlinked ───

  it('AC-12: listFlows returns a draftBadge for a flow linked to a reference block', async () => {
    const { listFlows } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Linked reference flow');
    await seedReferenceBlock({ draftId, flowId });

    const flows = await listFlows(OWNER_ID);
    const found = flows.find((f) => f.flowId === flowId);

    expect(found).toBeDefined();
    // AC-12 + ADR-0010: the badge must be present and carry the draft id.
    expect(found!.draftBadge).toEqual({ draftId });
  });

  it('AC-12: listFlows returns draftBadge = null for a flow with no linked reference block', async () => {
    const { listFlows } = await svc();

    const flowId = await seedFlow(OWNER_ID, 'Unlinked flow — no badge');

    const flows = await listFlows(OWNER_ID);
    const found = flows.find((f) => f.flowId === flowId);

    expect(found).toBeDefined();
    // No block links this flow → badge must be null (ADR-0010: derived, not stored).
    expect(found!.draftBadge).toBeNull();
  });

  // ── AC-12: deleteFlow without confirm=true raises a warning when block links ─

  it('AC-12: deleteFlow without confirm raises a warning error when a storyboard block links to the flow', async () => {
    const { deleteFlow } = await svc();
    const { ConflictError } = await import('@/lib/errors.js');

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Flow with a dependent block');
    await seedReferenceBlock({ draftId, flowId });

    // Attempt delete without confirm — must raise a 409-like ConflictError (or a
    // subclass) that signals the storyboard block dependency before any deletion.
    await expect(
      deleteFlow(flowId, OWNER_ID, /* confirm= */ false),
    ).rejects.toThrow(ConflictError);
  });

  it('AC-12: deleteFlow without confirm does NOT delete the flow row', async () => {
    const { deleteFlow } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Flow still alive after unconfirmed delete attempt');
    await seedReferenceBlock({ draftId, flowId });

    // Attempt (expect it to throw).
    await deleteFlow(flowId, OWNER_ID, false).catch(() => undefined);

    // Flow must still exist and have deleted_at IS NULL.
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT deleted_at FROM generation_flows WHERE flow_id = ?`,
      [flowId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['deleted_at']).toBeNull();
  });

  // ── AC-12: confirmed delete leaves the block in no-flow state ────────────────

  it('AC-12: deleteFlow with confirm=true succeeds and puts the block in no-flow state (flow_id = NULL)', async () => {
    const { deleteFlow } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Flow confirmed-deleted');
    const blockId = await seedReferenceBlock({ draftId, flowId });

    // Confirmed delete must not throw.
    await expect(deleteFlow(flowId, OWNER_ID, /* confirm= */ true)).resolves.toBeUndefined();

    // Block must survive but have flow_id = NULL (no-flow state, FK ON DELETE SET NULL, ADR-0010).
    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT flow_id FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(blockRows).toHaveLength(1);
    expect(blockRows[0]!['flow_id']).toBeNull();
  });

  it('AC-12: after confirmed flow deletion, listFlows no longer shows a badge for that block', async () => {
    const { deleteFlow, listFlows } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Flow confirmed-deleted badge check');
    await seedReferenceBlock({ draftId, flowId });

    await deleteFlow(flowId, OWNER_ID, true);

    // Flow is soft-deleted — must not appear in listFlows.
    const flows = await listFlows(OWNER_ID);
    const found = flows.find((f) => f.flowId === flowId);
    expect(found).toBeUndefined();
  });

  // ── AC-14b: hard-deleting a draft cascades blocks, flows survive ──────────────

  it('AC-14b: hard-deleting a draft cascades the reference block but leaves the flow intact in the list', async () => {
    const { listFlows } = await svc();

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Flow surviving draft deletion');
    await seedReferenceBlock({ draftId, flowId });

    // Pre-check: flow has a badge.
    const flowsBefore = await listFlows(OWNER_ID);
    const beforeEntry = flowsBefore.find((f) => f.flowId === flowId);
    expect(beforeEntry).toBeDefined();
    expect(beforeEntry!.draftBadge).toEqual({ draftId });

    // Hard-delete the draft (FK ON DELETE CASCADE removes the block row).
    await conn.execute(
      `DELETE FROM generation_drafts WHERE id = ?`,
      [draftId],
    );
    // Draft is gone; remove from cleanup list to avoid double-DELETE in afterAll.
    const idx = cleanupDraftIds.indexOf(draftId);
    if (idx !== -1) cleanupDraftIds.splice(idx, 1);

    // Flow must still exist (flows survive — AC-14b).
    const [flowRows] = await conn.query<RowDataPacket[]>(
      `SELECT deleted_at FROM generation_flows WHERE flow_id = ?`,
      [flowId],
    );
    expect(flowRows).toHaveLength(1);
    expect(flowRows[0]!['deleted_at']).toBeNull();

    // Block must be gone (cascade).
    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    expect(blockRows).toHaveLength(0);

    // Badge must be gone: no block links the flow any more (ADR-0010: derived).
    const flowsAfter = await listFlows(OWNER_ID);
    const afterEntry = flowsAfter.find((f) => f.flowId === flowId);
    expect(afterEntry).toBeDefined();
    // draftBadge must be null — the block is gone, nothing links this flow to a draft.
    expect(afterEntry!.draftBadge).toBeNull();
  });

  // ── F6 / AC-14b on the REAL (soft) delete path ───────────────────────────────

  it('AC-14b: soft-deleting a draft via the service removes the badge though the block keeps its flow_id', async () => {
    const { listFlows } = await svc();
    const { remove } = await import('@/services/generationDraft.service.js');

    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Flow surviving soft draft deletion');
    await seedReferenceBlock({ draftId, flowId });

    // Pre-check: badge present.
    const before = await listFlows(OWNER_ID);
    expect(before.find((f) => f.flowId === flowId)!.draftBadge).toEqual({ draftId });

    // The user-facing delete is a SOFT delete (deleted_at), not a row removal.
    await remove(OWNER_ID, draftId);

    // The draft is soft-deleted and the block STILL carries its flow_id…
    const [draftRows] = await conn.query<RowDataPacket[]>(
      `SELECT deleted_at FROM generation_drafts WHERE id = ?`,
      [draftId],
    );
    expect(draftRows[0]!['deleted_at']).not.toBeNull();
    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT flow_id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    expect(blockRows).toHaveLength(1);
    expect(blockRows[0]!['flow_id']).toBe(flowId);

    // …yet the badge must be gone — the draft is deleted from the user's view.
    const after = await listFlows(OWNER_ID);
    expect(after.find((f) => f.flowId === flowId)!.draftBadge).toBeNull();
  });

  // ── F11: deleteFlow must hide flow existence from a non-owner ─────────────────

  it('F11: a non-owner deleting a linked flow gets NotFound, not a 409 that leaks existence', async () => {
    const { deleteFlow } = await svc();
    const { NotFoundError, ConflictError } = await import('@/lib/errors.js');

    // OWNER's flow with a linked reference block (would 409 for the owner w/o confirm).
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID, 'Owner flow with linked block');
    await seedReferenceBlock({ draftId, flowId });

    const STRANGER = `srf-T12-stranger-${RUN}`;

    let caught: unknown;
    try {
      await deleteFlow(flowId, STRANGER, false);
    } catch (e) {
      caught = e;
    }
    // Must be a 404 existence-hiding error, NOT the 409 linked-block warning.
    expect(caught).toBeInstanceOf(NotFoundError);
    expect(caught).not.toBeInstanceOf(ConflictError);

    // The owner's block + flow must be untouched.
    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT flow_id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    expect(blockRows[0]!['flow_id']).toBe(flowId);
  });
});
