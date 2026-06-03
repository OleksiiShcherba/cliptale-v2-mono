/**
 * Integration tests for generation-flow.service against real MySQL.
 *
 * Tests the full service layer — owner-scoping and the 409 optimistic-lock
 * path — against live MySQL with no repository mocks.
 *
 * Scenarios:
 *   1. listFlows:      returns only the calling user's flows.
 *   2. createFlow:     inserts a row; re-read via openFlow succeeds.
 *   3. openFlow:       owner → canvas+jobs; non-owner → NotFoundError; absent → NotFoundError.
 *   4. renameFlow:     owner → updated title; non-owner → NotFoundError.
 *   5. deleteFlow:     owner → soft-deleted; non-owner → NotFoundError.
 *   6. saveCanvas:     matching version → saved (version bumped); stale version → OptimisticLockError.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run src/services/generation-flow.service.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env setup (must precede any app-module import) ────────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'flow-svc-integ-test-secret-32chars!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
// BullMQ is not needed for this service; mock to avoid Redis dependency here.
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-job' }),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;

// Two distinct test users — ensures isolation between non-owner tests.
const OWNER_ID = `flow-svc-integ-owner-${randomUUID().slice(0, 8)}`;
const OTHER_ID = `flow-svc-integ-other-${randomUUID().slice(0, 8)}`;

// Flows created during tests — cleaned up in afterAll.
const cleanupFlows: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed both users.
  for (const [id, suffix] of [[OWNER_ID, 'owner'], [OTHER_ID, 'other']] as const) {
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
      [id, `${id}@example.test`, 'hash'],
    );
  }
});

afterAll(async () => {
  if (cleanupFlows.length) {
    await conn.query(
      `DELETE FROM generation_flows WHERE flow_id IN (${cleanupFlows.map(() => '?').join(',')})`,
      cleanupFlows,
    );
  }
  for (const userId of [OWNER_ID, OTHER_ID]) {
    await conn.execute('DELETE FROM users WHERE user_id = ?', [userId]);
  }
  await conn.end();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('generation-flow.service / integration (real MySQL)', () => {
  // Lazy-import the service after env + mocks are configured.
  async function svc() {
    return import('@/services/generation-flow.service.js');
  }

  it('createFlow: inserts a row and returns version=1', async () => {
    const { createFlow } = await svc();

    const flow = await createFlow(OWNER_ID, 'Integration test flow');
    cleanupFlows.push(flow.flowId);

    expect(flow.userId).toBe(OWNER_ID);
    expect(flow.title).toBe('Integration test flow');
    expect(flow.version).toBe(1);
    expect(flow.canvas).toEqual({ blocks: [], edges: [] });
    expect(flow.deletedAt).toBeNull();
  });

  it('listFlows: returns only the calling user\'s flows', async () => {
    const { createFlow, listFlows } = await svc();

    const ownerFlow = await createFlow(OWNER_ID, 'Owner flow');
    const otherFlow = await createFlow(OTHER_ID, 'Other flow');
    cleanupFlows.push(ownerFlow.flowId, otherFlow.flowId);

    const ownerList = await listFlows(OWNER_ID);
    const ownerIds = ownerList.map((f) => f.flowId);
    expect(ownerIds).toContain(ownerFlow.flowId);
    expect(ownerIds).not.toContain(otherFlow.flowId);
  });

  it('openFlow: owner can open their flow (canvas + jobs)', async () => {
    const { createFlow, openFlow } = await svc();

    const flow = await createFlow(OWNER_ID, 'Flow to open');
    cleanupFlows.push(flow.flowId);

    const result = await openFlow(flow.flowId, OWNER_ID);

    expect(result.flow.flowId).toBe(flow.flowId);
    expect(result.flow.canvas).toEqual({ blocks: [], edges: [] });
    expect(Array.isArray(result.jobs)).toBe(true);
  });

  it('openFlow: non-owner → NotFoundError (AC-04 existence hiding)', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { createFlow, openFlow } = await svc();

    const flow = await createFlow(OWNER_ID, 'Non-owner target flow');
    cleanupFlows.push(flow.flowId);

    await expect(openFlow(flow.flowId, OTHER_ID)).rejects.toThrow(NotFoundError);
  });

  it('openFlow: absent flow → NotFoundError — indistinguishable from non-owner (AC-04)', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { openFlow } = await svc();

    const absentId = randomUUID();

    // Absent
    const absentErr = await openFlow(absentId, OWNER_ID).catch((e) => e);
    // Non-owner (use OWNER's absent ID but queried as OTHER)
    const nonOwnerErr = await openFlow(absentId, OTHER_ID).catch((e) => e);

    expect(absentErr).toBeInstanceOf(NotFoundError);
    expect(nonOwnerErr).toBeInstanceOf(NotFoundError);
    expect((absentErr as InstanceType<typeof NotFoundError>).statusCode).toBe(404);
    expect((nonOwnerErr as InstanceType<typeof NotFoundError>).statusCode).toBe(404);
  });

  it('renameFlow: owner can rename; non-owner → NotFoundError', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { createFlow, renameFlow } = await svc();

    const flow = await createFlow(OWNER_ID, 'Before rename');
    cleanupFlows.push(flow.flowId);

    // Owner renames successfully.
    const updated = await renameFlow(flow.flowId, OWNER_ID, 'After rename');
    expect(updated.title).toBe('After rename');

    // Non-owner fails with NotFoundError.
    await expect(renameFlow(flow.flowId, OTHER_ID, 'Hijack')).rejects.toThrow(NotFoundError);
  });

  it('deleteFlow: owner can soft-delete; non-owner → NotFoundError', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const { createFlow, deleteFlow, openFlow } = await svc();

    const flow = await createFlow(OWNER_ID, 'Flow to delete');
    cleanupFlows.push(flow.flowId);

    // Non-owner fails.
    await expect(deleteFlow(flow.flowId, OTHER_ID)).rejects.toThrow(NotFoundError);

    // Owner succeeds.
    await expect(deleteFlow(flow.flowId, OWNER_ID)).resolves.toBeUndefined();

    // Soft-deleted flow is now invisible (NotFoundError on open).
    await expect(openFlow(flow.flowId, OWNER_ID)).rejects.toThrow(NotFoundError);
  });

  it('saveCanvas: matching version → saved (version increments); stale → OptimisticLockError (AC-10b / 409 path)', async () => {
    const { OptimisticLockError } = await import('@/lib/errors.js');
    const { createFlow, saveCanvas } = await svc();

    const flow = await createFlow(OWNER_ID, 'Canvas versioning flow');
    cleanupFlows.push(flow.flowId);

    expect(flow.version).toBe(1);

    // First save with matching parentVersion=1 → succeeds, version becomes 2.
    const newCanvas = {
      blocks: [{ blockId: 'b-1', type: 'content' as const, position: { x: 0, y: 0 }, params: {} }],
      edges: [],
    };
    const updated = await saveCanvas(flow.flowId, OWNER_ID, newCanvas, 1);
    expect(updated.version).toBe(2);
    expect(updated.canvas.blocks).toHaveLength(1);

    // Second save with stale parentVersion=1 (now db has version=2) → OptimisticLockError.
    await expect(
      saveCanvas(flow.flowId, OWNER_ID, newCanvas, 1),
    ).rejects.toThrow(OptimisticLockError);
  });

  it('saveCanvas: non-owner save attempt → OptimisticLockError (treated as conflict by repo)', async () => {
    const { OptimisticLockError } = await import('@/lib/errors.js');
    const { createFlow, saveCanvas } = await svc();

    const flow = await createFlow(OWNER_ID, 'Canvas non-owner test');
    cleanupFlows.push(flow.flowId);

    // Other user attempts to save with the correct version — repo returns saved:false
    // (owner mismatch in WHERE clause), service raises OptimisticLockError.
    await expect(
      saveCanvas(flow.flowId, OTHER_ID, { blocks: [], edges: [] }, 1),
    ).rejects.toThrow(OptimisticLockError);
  });
});
