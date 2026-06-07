/**
 * T12 — ADR-0006 integration tests: unlink-on-duplicate + re-validate-on-restore
 *
 * ACs under test:
 *   AC-12 (US-08) / ADR-0006 — duplicating a draft copies reference blocks into
 *                               no-flow state (flow_id = NULL); original unaffected.
 *   AC-12 (US-08) / ADR-0006 — restoring a soft-deleted draft NULLs flow_id on
 *                               blocks whose linked flow is soft-deleted (no-flow
 *                               state); blocks linked to live flows are untouched.
 *
 * Level: integration (real MySQL, BullMQ Queue.add stubbed).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/generationDraft.adr0006.srf-t12.integration.test.ts
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
  APP_JWT_SECRET:           'srf-T12-adr0006-integ-test-secret!!!!',
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
const OWNER_ID = `srf-T12-adr0006-${RUN}`;

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
  // storyboard_reference_blocks cascade on draft DELETE.
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

/** Insert a minimal generation_drafts row that is soft-deleted. */
async function seedDeletedDraft(userId: string): Promise<string> {
  const id = randomUUID();
  cleanupDraftIds.push(id);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, deleted_at)
     VALUES (?, ?, ?, NOW())`,
    [id, userId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
  return id;
}

/** Insert a generation_flows row. Returns flowId. */
async function seedFlow(userId: string, title = 'Test Reference Flow'): Promise<string> {
  const flowId = randomUUID();
  cleanupFlowIds.push(flowId);
  await conn.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas) VALUES (?, ?, ?, ?)`,
    [flowId, userId, title, JSON.stringify({ blocks: [], edges: [] })],
  );
  return flowId;
}

/** Soft-delete a generation_flows row (mimics deleteFlow confirmed). */
async function softDeleteFlow(flowId: string): Promise<void> {
  await conn.execute(
    `UPDATE generation_flows SET deleted_at = NOW() WHERE flow_id = ?`,
    [flowId],
  );
}

/**
 * Insert a reference block linked to a draft (optionally to a flow).
 * Block rows are cleaned up by the draft CASCADE delete.
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

// ── Lazy service imports (after env + mocks are set up) ───────────────────────

async function draftSvc() {
  return import('@/services/generationDraft.service.js');
}

async function restoreSvc() {
  return import('@/services/generationDraft.restore.service.js');
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ADR-0006 / T12 — duplication unlinks + restore re-validates reference blocks', () => {
  // ── Duplication: copied blocks enter no-flow state ───────────────────────────

  it('ADR-0006: duplicateDraft copies reference blocks with flow_id = NULL (no-flow state)', async () => {
    const { duplicateDraft } = await draftSvc();

    const sourceDraftId = await seedDraft(OWNER_ID);
    const flowId        = await seedFlow(OWNER_ID, 'Duplication test flow');
    await seedReferenceBlock({ draftId: sourceDraftId, flowId, name: 'Hero character' });

    const newDraft = await duplicateDraft(OWNER_ID, sourceDraftId);
    // Track the new draft for cleanup.
    cleanupDraftIds.push(newDraft.id);

    // Copied block must have flow_id = NULL (no-flow state, ADR-0006).
    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, flow_id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [newDraft.id],
    );
    expect(blockRows).toHaveLength(1);
    expect(blockRows[0]!['flow_id']).toBeNull();
  });

  it('ADR-0006: duplicateDraft does not mutate source blocks (original flow_id intact)', async () => {
    const { duplicateDraft } = await draftSvc();

    const sourceDraftId = await seedDraft(OWNER_ID);
    const flowId        = await seedFlow(OWNER_ID, 'Duplication source-intact flow');
    const srcBlockId    = await seedReferenceBlock({ draftId: sourceDraftId, flowId });

    const newDraft = await duplicateDraft(OWNER_ID, sourceDraftId);
    cleanupDraftIds.push(newDraft.id);

    // Source block's flow_id must be unchanged.
    const [srcRows] = await conn.query<RowDataPacket[]>(
      `SELECT flow_id FROM storyboard_reference_blocks WHERE id = ?`,
      [srcBlockId],
    );
    expect(srcRows).toHaveLength(1);
    expect(srcRows[0]!['flow_id']).toBe(flowId);
  });

  it('ADR-0006: duplicateDraft on a draft with no reference blocks returns a draft with no blocks', async () => {
    const { duplicateDraft } = await draftSvc();

    const sourceDraftId = await seedDraft(OWNER_ID);
    // No reference blocks seeded.

    const newDraft = await duplicateDraft(OWNER_ID, sourceDraftId);
    cleanupDraftIds.push(newDraft.id);

    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [newDraft.id],
    );
    expect(blockRows).toHaveLength(0);
  });

  // ── Restore re-validation: soft-deleted flows → blocks go no-flow ─────────────

  it('ADR-0006: restoreDraft NULLs flow_id on blocks whose flow was soft-deleted', async () => {
    const { restoreDraft } = await restoreSvc();

    const draftId  = await seedDeletedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID, 'Restore re-validate deleted flow');
    const blockId  = await seedReferenceBlock({ draftId, flowId });

    // Soft-delete the flow BEFORE restoring the draft (simulating flow deleted while draft was in trash).
    await softDeleteFlow(flowId);

    await restoreDraft(OWNER_ID, draftId);

    // After restore the block must be in no-flow state because the flow is deleted.
    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT flow_id FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(blockRows).toHaveLength(1);
    expect(blockRows[0]!['flow_id']).toBeNull();
  });

  it('ADR-0006: restoreDraft leaves blocks linked to a live flow untouched', async () => {
    const { restoreDraft } = await restoreSvc();

    const draftId  = await seedDeletedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID, 'Restore re-validate live flow');
    const blockId  = await seedReferenceBlock({ draftId, flowId });

    // Flow is NOT deleted — block should keep its flow_id after restore.
    await restoreDraft(OWNER_ID, draftId);

    const [blockRows] = await conn.query<RowDataPacket[]>(
      `SELECT flow_id FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(blockRows).toHaveLength(1);
    expect(blockRows[0]!['flow_id']).toBe(flowId);
  });

  it('ADR-0006: restoreDraft on a draft with no reference blocks is a no-op (no error)', async () => {
    const { restoreDraft } = await restoreSvc();

    const draftId = await seedDeletedDraft(OWNER_ID);
    // No reference blocks seeded.

    await expect(restoreDraft(OWNER_ID, draftId)).resolves.toBeDefined();
  });
});
