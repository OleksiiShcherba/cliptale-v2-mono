/**
 * Unit tests for userProjectUiState.repository.ts
 *
 * All external dependencies (`pool`) are mocked via vi.mock so no real DB is
 * needed. The tests exercise the three public functions:
 *   - getByUserAndProject   — returns the row or null when absent
 *   - upsertByUserAndProject — inserts / overwrites; returns the persisted row
 *   - deleteByUserAndProject — removes the row; returns a boolean
 *
 * Run:
 *   cd apps/api && ./node_modules/.bin/vitest run src/repositories/userProjectUiState.repository.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB connection pool ───────────────────────────────────────────────
// vi.hoisted ensures mockQuery is available when the vi.mock factory runs.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { query: mockQuery },
}));

import {
  getByUserAndProject,
  upsertByUserAndProject,
  deleteByUserAndProject,
} from './userProjectUiState.repository.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-001';
const PROJECT_ID = 'project-uuid-001';
const UPDATED_AT = new Date('2026-04-20T10:00:00.000Z');

const STATE_PAYLOAD = { zoom: 2.0, scrollX: 100, playheadFrame: 30, selectedClipIds: ['clip-1'] };

function makeRow(overrides: Partial<{
  user_id: string;
  project_id: string;
  state_json: unknown;
  updated_at: Date;
}> = {}) {
  return {
    user_id: USER_ID,
    project_id: PROJECT_ID,
    state_json: STATE_PAYLOAD,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

// ── getByUserAndProject ───────────────────────────────────────────────────────

describe('userProjectUiState.repository — getByUserAndProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no row exists for the given (userId, projectId)', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await getByUserAndProject(USER_ID, PROJECT_ID);

    expect(result).toBeNull();
  });

  it('returns a mapped UserProjectUiState when a row exists', async () => {
    mockQuery.mockResolvedValueOnce([[makeRow()]]);

    const result = await getByUserAndProject(USER_ID, PROJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(USER_ID);
    expect(result!.projectId).toBe(PROJECT_ID);
    expect(result!.state).toEqual(STATE_PAYLOAD);
    expect(result!.updatedAt).toEqual(UPDATED_AT);
  });

  it('passes the correct userId and projectId as query parameters', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await getByUserAndProject(USER_ID, PROJECT_ID);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('user_project_ui_state');
    expect(params).toEqual([USER_ID, PROJECT_ID]);
  });

  it('returns state as-is when mysql2 returns state_json as an already-parsed object', async () => {
    const parsed = { zoom: 3.5, scrollX: 0, playheadFrame: 0, selectedClipIds: [] };
    mockQuery.mockResolvedValueOnce([[makeRow({ state_json: parsed })]]);

    const result = await getByUserAndProject(USER_ID, PROJECT_ID);

    expect(result!.state).toEqual(parsed);
  });
});

// ── upsertByUserAndProject ────────────────────────────────────────────────────

describe('userProjectUiState.repository — upsertByUserAndProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues an upsert query and then re-reads the row', async () => {
    // First call: INSERT … ON DUPLICATE KEY UPDATE
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // Second call: SELECT after upsert
    mockQuery.mockResolvedValueOnce([[makeRow()]]);

    await upsertByUserAndProject(USER_ID, PROJECT_ID, STATE_PAYLOAD);

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns the persisted row with the server-generated updatedAt', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockQuery.mockResolvedValueOnce([[makeRow({ updated_at: UPDATED_AT })]]);

    const result = await upsertByUserAndProject(USER_ID, PROJECT_ID, STATE_PAYLOAD);

    expect(result.userId).toBe(USER_ID);
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.state).toEqual(STATE_PAYLOAD);
    expect(result.updatedAt).toEqual(UPDATED_AT);
  });

  it('serialises the state to JSON before passing it to the DB', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockQuery.mockResolvedValueOnce([[makeRow()]]);

    await upsertByUserAndProject(USER_ID, PROJECT_ID, STATE_PAYLOAD);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO user_project_ui_state');
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    // Third param is the JSON-serialised state.
    expect(params[2]).toBe(JSON.stringify(STATE_PAYLOAD));
  });

  it('overwrites state on a second upsert (duplicate key path)', async () => {
    const newState = { zoom: 0.5, scrollX: 999, playheadFrame: 0, selectedClipIds: [] };

    // First upsert
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockQuery.mockResolvedValueOnce([[makeRow()]]);

    // Second upsert — simulates ON DUPLICATE KEY UPDATE
    mockQuery.mockResolvedValueOnce([{ affectedRows: 2 }]); // 2 = updated existing row
    mockQuery.mockResolvedValueOnce([[makeRow({ state_json: newState })]]);

    await upsertByUserAndProject(USER_ID, PROJECT_ID, STATE_PAYLOAD);
    const result = await upsertByUserAndProject(USER_ID, PROJECT_ID, newState);

    expect(result.state).toEqual(newState);
  });
});

// ── deleteByUserAndProject ────────────────────────────────────────────────────

describe('userProjectUiState.repository — deleteByUserAndProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when a row was deleted (affectedRows = 1)', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await deleteByUserAndProject(USER_ID, PROJECT_ID);

    expect(result).toBe(true);
  });

  it('returns false when no row matched (affectedRows = 0)', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const result = await deleteByUserAndProject(USER_ID, PROJECT_ID);

    expect(result).toBe(false);
  });

  it('passes the correct userId and projectId as DELETE parameters', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await deleteByUserAndProject(USER_ID, PROJECT_ID);

    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('DELETE FROM user_project_ui_state');
    expect(params).toEqual([USER_ID, PROJECT_ID]);
  });

  it('is idempotent — calling delete on an already-absent row returns false', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const first = await deleteByUserAndProject(USER_ID, PROJECT_ID);
    const second = await deleteByUserAndProject(USER_ID, PROJECT_ID);

    expect(first).toBe(false);
    expect(second).toBe(false);
  });
});
