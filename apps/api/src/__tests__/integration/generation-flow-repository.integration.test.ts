/**
 * Integration tests for generation-flow.repository.ts against real MySQL 8.
 *
 * Covers (per IMPL_HOUSE_RULES):
 *   create → read → list (owner-scoped: excludes other users + soft-deleted)
 *   → rename → soft-delete
 *   → optimistic save (matching version increments; stale version does NOT overwrite)
 *
 * Prerequisites: Docker Compose `db` service must be running.
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run src/__tests__/integration/generation-flow-repository.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Env bootstrap (must happen before any app import) ─────────────────────────
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
  APP_JWT_SECRET:           'integration-test-jwt-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  createFlow,
  findFlowById,
  findFlowsByUserId,
  renameFlow,
  softDeleteFlow,
  saveFlowCanvas,
} from '../../repositories/generation-flow.repository.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

let conn: Connection;

/** Prefix all test user IDs to avoid collisions across suites */
const PREFIX = 'gfr-integ';

/** Two users: owner A and unrelated user B */
const USER_A = `${PREFIX}-user-a-${randomUUID().slice(0, 8)}`;
const USER_B = `${PREFIX}-user-b-${randomUUID().slice(0, 8)}`;

/** Track all flow_ids inserted so afterAll can clean up */
const trackedFlowIds: string[] = [];

function newFlowId(): string {
  const id = `${PREFIX}-${randomUUID().slice(0, 12)}`;
  trackedFlowIds.push(id);
  return id;
}

/** Minimal valid FlowCanvas */
const CANVAS = { blocks: [], edges: [] };

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed test users — FK generation_flows.user_id → users.user_id requires the row to exist
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [USER_A, `${USER_A}@example.test`, 'Test Creator A'],
  );
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [USER_B, `${USER_B}@example.test`, 'Test Creator B'],
  );
});

afterAll(async () => {
  if (trackedFlowIds.length) {
    const ph = trackedFlowIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM generation_flows WHERE flow_id IN (${ph})`, trackedFlowIds);
  }
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [USER_A, USER_B]);
  await conn.end();
});

// ── create → read ─────────────────────────────────────────────────────────────

describe('generation-flow.repository integration — createFlow + findFlowById', () => {
  it('inserts a row and returns it via findFlowById (owner-scoped)', async () => {
    const flowId = newFlowId();

    const created = await createFlow({ flowId, userId: USER_A, title: 'My first flow', canvas: CANVAS });

    expect(created.flowId).toBe(flowId);
    expect(created.userId).toBe(USER_A);
    expect(created.title).toBe('My first flow');
    expect(created.version).toBe(1);
    expect(created.canvas).toEqual(CANVAS);
    expect(created.deletedAt).toBeNull();

    const fetched = await findFlowById(flowId, USER_A);
    expect(fetched).not.toBeNull();
    expect(fetched!.flowId).toBe(flowId);
    expect(fetched!.version).toBe(1);
  });

  it('returns null for a different user (owner-scoping)', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Owner A flow', canvas: CANVAS });

    const result = await findFlowById(flowId, USER_B);
    expect(result).toBeNull();
  });

  it('returns null for a non-existent flow_id', async () => {
    const result = await findFlowById('non-existent-flow-id-xyz', USER_A);
    expect(result).toBeNull();
  });
});

// ── list — owner-scoped, newest-first, excludes soft-deleted ─────────────────

describe('generation-flow.repository integration — findFlowsByUserId', () => {
  it('returns only flows owned by the given user (excludes other users)', async () => {
    const flowA = newFlowId();
    const flowB = newFlowId(); // belongs to USER_B

    await createFlow({ flowId: flowA, userId: USER_A, title: 'Flow A1', canvas: CANVAS });
    await createFlow({ flowId: flowB, userId: USER_B, title: 'Flow B1', canvas: CANVAS });

    const list = await findFlowsByUserId(USER_A);
    const ids = list.map((f) => f.flowId);

    expect(ids).toContain(flowA);
    expect(ids).not.toContain(flowB);
    list.forEach((f) => expect(f.userId).toBe(USER_A));
  });

  it('excludes soft-deleted flows from the list', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'To be deleted', canvas: CANVAS });

    // verify it appears before deletion
    const before = await findFlowsByUserId(USER_A);
    expect(before.map((f) => f.flowId)).toContain(flowId);

    // soft-delete it
    await softDeleteFlow(flowId, USER_A);

    const after = await findFlowsByUserId(USER_A);
    expect(after.map((f) => f.flowId)).not.toContain(flowId);
  });

  it('returns flows ordered newest-first (by updated_at DESC)', async () => {
    // Create two flows with slight delay by inserting different updated_at values directly
    const flowOld = newFlowId();
    const flowNew = newFlowId();

    await createFlow({ flowId: flowOld, userId: USER_A, title: 'Older', canvas: CANVAS });
    // Touch flowNew's updated_at to a later time
    await createFlow({ flowId: flowNew, userId: USER_A, title: 'Newer', canvas: CANVAS });
    // Force flowNew to have a later updated_at by doing a rename (touches updated_at)
    await conn.execute(
      `UPDATE generation_flows SET updated_at = DATE_ADD(updated_at, INTERVAL 1 SECOND) WHERE flow_id = ?`,
      [flowNew],
    );

    const list = await findFlowsByUserId(USER_A);
    const ids = list.map((f) => f.flowId);

    const oldIdx = ids.indexOf(flowOld);
    const newIdx = ids.indexOf(flowNew);
    expect(oldIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(oldIdx); // newer = earlier in the list
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe('generation-flow.repository integration — renameFlow', () => {
  it('updates title and returns true', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Original', canvas: CANVAS });

    const result = await renameFlow(flowId, USER_A, 'Renamed');
    expect(result).toBe(true);

    const flow = await findFlowById(flowId, USER_A);
    expect(flow!.title).toBe('Renamed');
  });

  it('returns false for a different user (no cross-user rename)', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'A flow', canvas: CANVAS });

    const result = await renameFlow(flowId, USER_B, 'Hacked title');
    expect(result).toBe(false);

    // title unchanged
    const flow = await findFlowById(flowId, USER_A);
    expect(flow!.title).toBe('A flow');
  });

  it('returns false for a non-existent flow_id', async () => {
    const result = await renameFlow('non-existent-flow-xyz', USER_A, 'Title');
    expect(result).toBe(false);
  });
});

// ── soft-delete ───────────────────────────────────────────────────────────────

describe('generation-flow.repository integration — softDeleteFlow', () => {
  it('sets deleted_at and returns true', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'To delete', canvas: CANVAS });

    const result = await softDeleteFlow(flowId, USER_A);
    expect(result).toBe(true);

    // findFlowById returns null after soft-delete
    const flow = await findFlowById(flowId, USER_A);
    expect(flow).toBeNull();

    // Verify deleted_at is set in DB
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT deleted_at FROM generation_flows WHERE flow_id = ?',
      [flowId],
    );
    expect(rows[0]!['deleted_at']).not.toBeNull();
  });

  it('returns false for wrong owner (no cross-user delete)', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Protected', canvas: CANVAS });

    const result = await softDeleteFlow(flowId, USER_B);
    expect(result).toBe(false);

    // Still retrievable by owner A
    const flow = await findFlowById(flowId, USER_A);
    expect(flow).not.toBeNull();
  });

  it('returns false for a non-existent flow_id', async () => {
    const result = await softDeleteFlow('non-existent-xyz', USER_A);
    expect(result).toBe(false);
  });

  it('is idempotent — second soft-delete returns false (already deleted)', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Delete twice', canvas: CANVAS });
    await softDeleteFlow(flowId, USER_A);
    const result = await softDeleteFlow(flowId, USER_A);
    expect(result).toBe(false);
  });
});

// ── saveFlowCanvas — optimistic version ──────────────────────────────────────

describe('generation-flow.repository integration — saveFlowCanvas (optimistic)', () => {
  it('saves canvas and increments version when parentVersion matches', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Canvas flow', canvas: CANVAS });

    const newCanvas = { blocks: [{ blockId: 'b1', type: 'content' as const, position: { x: 10, y: 20 }, params: {} }], edges: [] };
    const result = await saveFlowCanvas({ flowId, userId: USER_A, canvas: newCanvas, parentVersion: 1 });

    expect(result.saved).toBe(true);
    expect(result.flow).not.toBeNull();
    expect(result.flow!.version).toBe(2);
    expect(result.flow!.canvas).toEqual(newCanvas);
  });

  it('returns { saved: false } and does NOT overwrite when parentVersion is stale', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Conflict flow', canvas: CANVAS });

    // First save: version 1 → 2
    const newCanvas = { blocks: [], edges: [] };
    await saveFlowCanvas({ flowId, userId: USER_A, canvas: newCanvas, parentVersion: 1 });

    // Stale save: still presenting parentVersion = 1 (stale — DB is now at 2)
    const staleCanvas = { blocks: [{ blockId: 'stale', type: 'content' as const, position: { x: 0, y: 0 }, params: {} }], edges: [] };
    const conflict = await saveFlowCanvas({ flowId, userId: USER_A, canvas: staleCanvas, parentVersion: 1 });

    expect(conflict.saved).toBe(false);
    expect(conflict.flow).toBeNull();

    // DB canvas is the first-save canvas (not overwritten by stale save)
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT canvas, version FROM generation_flows WHERE flow_id = ?',
      [flowId],
    );
    expect(rows[0]!['version']).toBe(2);
    // Canvas stored as JSON — parse if string
    const storedCanvas = typeof rows[0]!['canvas'] === 'string'
      ? JSON.parse(rows[0]!['canvas'] as string)
      : rows[0]!['canvas'];
    expect(storedCanvas).toEqual(newCanvas);
  });

  it('returns { saved: false } for wrong owner', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Owner A only', canvas: CANVAS });

    const result = await saveFlowCanvas({ flowId, userId: USER_B, canvas: CANVAS, parentVersion: 1 });
    expect(result.saved).toBe(false);
    expect(result.flow).toBeNull();
  });

  it('sequential correct saves keep incrementing version monotonically', async () => {
    const flowId = newFlowId();
    await createFlow({ flowId, userId: USER_A, title: 'Multi-save', canvas: CANVAS });

    const r1 = await saveFlowCanvas({ flowId, userId: USER_A, canvas: CANVAS, parentVersion: 1 });
    expect(r1.saved).toBe(true);
    expect(r1.flow!.version).toBe(2);

    const r2 = await saveFlowCanvas({ flowId, userId: USER_A, canvas: CANVAS, parentVersion: 2 });
    expect(r2.saved).toBe(true);
    expect(r2.flow!.version).toBe(3);
  });
});
