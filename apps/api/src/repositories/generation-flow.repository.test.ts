/**
 * Unit tests for generation-flow.repository.ts — query construction.
 *
 * Tests verify: SQL structure, parameter binding, JSON handling, and the
 * optimistic-version conflict signal (affected-rows === 0).
 *
 * All DB dependencies are mocked via vi.hoisted + vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

// ── Mock the DB pool ──────────────────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  createFlow,
  findFlowById,
  findFlowsByUserId,
  renameFlow,
  softDeleteFlow,
  saveFlowCanvas,
} from './generation-flow.repository.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FLOW_ID = 'flow-unit-test-uuid-001';
const USER_ID = 'user-unit-test-uuid-001';
const NOW = new Date('2026-06-01T12:00:00.000Z');

/** Minimal FlowCanvas JSON */
const CANVAS = { blocks: [], edges: [] };

/** Fake db row for a generation_flows record */
function makeFlowRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    flow_id: FLOW_ID,
    user_id: USER_ID,
    title: 'Untitled flow',
    canvas: CANVAS,
    version: 1,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

// ── createFlow ────────────────────────────────────────────────────────────────

describe('generation-flow.repository — createFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes an INSERT INTO generation_flows with correct columns', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []])
      .mockResolvedValueOnce([[makeFlowRow()], []]);

    await createFlow({ flowId: FLOW_ID, userId: USER_ID, title: 'My flow', canvas: CANVAS });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT\s+INTO\s+generation_flows/i);
    expect(params).toContain(FLOW_ID);
    expect(params).toContain(USER_ID);
    expect(params).toContain('My flow');
  });

  it('returns the created flow row with camelCase fields', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []])
      .mockResolvedValueOnce([[makeFlowRow({ title: 'My flow' })], []]);

    const flow = await createFlow({ flowId: FLOW_ID, userId: USER_ID, title: 'My flow', canvas: CANVAS });

    expect(flow.flowId).toBe(FLOW_ID);
    expect(flow.userId).toBe(USER_ID);
    expect(flow.title).toBe('My flow');
    expect(flow.version).toBe(1);
    expect(flow.canvas).toEqual(CANVAS);
    expect(flow.deletedAt).toBeNull();
  });

  it('serialises canvas as JSON string in the INSERT params', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []])
      .mockResolvedValueOnce([[makeFlowRow()], []]);

    await createFlow({ flowId: FLOW_ID, userId: USER_ID, title: 'T', canvas: CANVAS });

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    const canvasParam = params.find((p) => typeof p === 'string' && p.startsWith('{'));
    expect(canvasParam).toBe(JSON.stringify(CANVAS));
  });
});

// ── findFlowById ──────────────────────────────────────────────────────────────

describe('generation-flow.repository — findFlowById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no row is found', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const result = await findFlowById(FLOW_ID, USER_ID);
    expect(result).toBeNull();
  });

  it('queries WHERE flow_id = ? AND user_id = ? AND deleted_at IS NULL', async () => {
    mockExecute.mockResolvedValueOnce([[makeFlowRow()], []]);

    await findFlowById(FLOW_ID, USER_ID);

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE/i);
    expect(sql).toMatch(/flow_id\s*=\s*\?/i);
    expect(sql).toMatch(/user_id\s*=\s*\?/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(params).toContain(FLOW_ID);
    expect(params).toContain(USER_ID);
  });

  it('maps row to camelCase FlowRecord', async () => {
    mockExecute.mockResolvedValueOnce([[makeFlowRow()], []]);
    const flow = await findFlowById(FLOW_ID, USER_ID);

    expect(flow).not.toBeNull();
    expect(flow!.flowId).toBe(FLOW_ID);
    expect(flow!.userId).toBe(USER_ID);
    expect(flow!.version).toBe(1);
    expect(flow!.canvas).toEqual(CANVAS);
  });

  it('parses canvas from string (mysql2 may return raw JSON string)', async () => {
    mockExecute.mockResolvedValueOnce([[makeFlowRow({ canvas: JSON.stringify(CANVAS) })], []]);
    const flow = await findFlowById(FLOW_ID, USER_ID);
    expect(flow!.canvas).toEqual(CANVAS);
  });
});

// ── findFlowsByUserId ─────────────────────────────────────────────────────────

describe('generation-flow.repository — findFlowsByUserId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findFlowsByUserId(USER_ID);

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE/i);
    expect(sql).toMatch(/user_id\s*=\s*\?/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/ORDER\s+BY\s+updated_at\s+DESC/i);
    expect(params).toContain(USER_ID);
  });

  it('returns an empty array when no flows found', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const result = await findFlowsByUserId(USER_ID);
    expect(result).toEqual([]);
  });

  it('maps multiple rows to FlowRecord[]', async () => {
    const row1 = makeFlowRow({ flow_id: 'flow-a', title: 'A' });
    const row2 = makeFlowRow({ flow_id: 'flow-b', title: 'B' });
    mockExecute.mockResolvedValueOnce([[row1, row2], []]);

    const flows = await findFlowsByUserId(USER_ID);
    expect(flows).toHaveLength(2);
    expect(flows[0]!.flowId).toBe('flow-a');
    expect(flows[1]!.flowId).toBe('flow-b');
  });
});

// ── renameFlow ────────────────────────────────────────────────────────────────

describe('generation-flow.repository — renameFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE generation_flows SET title = ? WHERE flow_id = ? AND user_id = ?', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await renameFlow(FLOW_ID, USER_ID, 'New title');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+generation_flows/i);
    expect(sql).toMatch(/SET.*title\s*=/i);
    expect(params).toContain('New title');
    expect(params).toContain(FLOW_ID);
    expect(params).toContain(USER_ID);
  });

  it('returns true when a row was updated', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);
    const result = await renameFlow(FLOW_ID, USER_ID, 'Title');
    expect(result).toBe(true);
  });

  it('returns false when no row matched (wrong owner / deleted)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);
    const result = await renameFlow(FLOW_ID, USER_ID, 'Title');
    expect(result).toBe(false);
  });
});

// ── softDeleteFlow ────────────────────────────────────────────────────────────

describe('generation-flow.repository — softDeleteFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE ... SET deleted_at = NOW(3) WHERE flow_id = ? AND user_id = ? AND deleted_at IS NULL', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await softDeleteFlow(FLOW_ID, USER_ID);

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+generation_flows/i);
    expect(sql).toMatch(/deleted_at\s*=\s*NOW/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(params).toContain(FLOW_ID);
    expect(params).toContain(USER_ID);
  });

  it('returns true when the flow was soft-deleted', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);
    expect(await softDeleteFlow(FLOW_ID, USER_ID)).toBe(true);
  });

  it('returns false when no row matched (already deleted / wrong owner)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);
    expect(await softDeleteFlow(FLOW_ID, USER_ID)).toBe(false);
  });
});

// ── saveFlowCanvas ────────────────────────────────────────────────────────────

describe('generation-flow.repository — saveFlowCanvas (optimistic version)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues UPDATE ... WHERE flow_id=? AND user_id=? AND version=? AND deleted_at IS NULL', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []])
      .mockResolvedValueOnce([[makeFlowRow({ version: 2 })], []]);

    await saveFlowCanvas({ flowId: FLOW_ID, userId: USER_ID, canvas: CANVAS, parentVersion: 1 });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+generation_flows/i);
    expect(sql).toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(sql).toMatch(/WHERE/i);
    expect(sql).toMatch(/user_id\s*=\s*\?/i);
    expect(sql).toMatch(/version\s*=\s*\?/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(params).toContain(FLOW_ID);
    expect(params).toContain(USER_ID);
    expect(params).toContain(1); // parentVersion
  });

  it('returns { saved: true, flow } with incremented version on match', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []])
      .mockResolvedValueOnce([[makeFlowRow({ version: 2 })], []]);

    const result = await saveFlowCanvas({ flowId: FLOW_ID, userId: USER_ID, canvas: CANVAS, parentVersion: 1 });

    expect(result.saved).toBe(true);
    expect(result.flow).not.toBeNull();
    expect(result.flow!.version).toBe(2);
  });

  it('returns { saved: false, flow: null } when version mismatch (stale)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    const result = await saveFlowCanvas({ flowId: FLOW_ID, userId: USER_ID, canvas: CANVAS, parentVersion: 1 });

    expect(result.saved).toBe(false);
    expect(result.flow).toBeNull();
  });

  it('serialises canvas as JSON string in UPDATE params', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []])
      .mockResolvedValueOnce([[makeFlowRow({ version: 2 })], []]);

    const canvas = { blocks: [{ blockId: 'b1', type: 'content', position: { x: 0, y: 0 }, params: {} }], edges: [] };
    await saveFlowCanvas({ flowId: FLOW_ID, userId: USER_ID, canvas, parentVersion: 1 });

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    const jsonParam = params.find((p) => typeof p === 'string' && p.includes('blockId'));
    expect(jsonParam).toBe(JSON.stringify(canvas));
  });
});
